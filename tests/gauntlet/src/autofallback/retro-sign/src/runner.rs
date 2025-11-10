//! Main execution runner for C2 Concierge Retro-Sign

use anyhow::{Context, Result};
use chrono::Utc;
use futures::stream::{self, StreamExt};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::{mpsc, Semaphore};
use tokio::time::timeout;
use tracing::{debug, error, info, warn};
use hex;
use sha2::{Sha256, Digest};

use crate::cli::{RunArgs, ResumeArgs};
use crate::config::Config;
use crate::planner::{PlanItem, ObjectReference};
use crate::worklog::{Worklog, WorklogEntry, WorkStatus};
use crate::signer::SignerClient;
use crate::storage::ManifestStore;
use crate::checkpoint::CheckpointManager;
use crate::metrics::{MetricsCollector, Metrics};
use crate::performance::{get_performance_manager, timed_operation};
use crate::security::{get_security_manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionResult {
    pub total_objects: usize,
    pub processed_objects: usize,
    pub failed_objects: usize,
    pub skipped_objects: usize,
    pub unique_manifests: usize,
    pub total_bytes: u64,
    pub total_duration_secs: u64,
    pub assets_per_sec: f64,
    pub errors: Vec<ExecutionError>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionError {
    pub key: String,
    pub error_type: String,
    pub message: String,
    pub timestamp: chrono::DateTime<Utc>,
}

pub struct Runner {
    config: Config,
    metrics: Arc<MetricsCollector>,
    signer: SignerClient,
    store: ManifestStore,
    checkpoint: CheckpointManager,
}

impl Runner {
    pub async fn new(config: Config) -> Result<Self> {
        let metrics = Arc::new(MetricsCollector::new());
        let signer = SignerClient::new(&config.signer)?;
        let store = ManifestStore::new(&config.storage)?;
        let checkpoint = CheckpointManager::new(&config.checkpoint).await?;
        
        Ok(Self {
            config,
            metrics,
            signer,
            store,
            checkpoint,
        })
    }
    
    pub async fn execute_plan(&mut self, args: RunArgs) -> Result<ExecutionResult> {
        info!("Starting plan execution");
        
        // Load plan items
        let plan_items = load_plan_items(&args.input).await?;
        info!("Loaded {} plan items", plan_items.len());
        
        // Initialize checkpoint
        self.checkpoint.initialize(&plan_items).await?;
        
        // Create worklog
        let mut worklog = Worklog::new(&args.checkpoint).await?;
        
        // Execute with concurrency control
        let result = self.execute_with_concurrency(plan_items, &mut worklog, &args).await?;
        
        // Generate final report
        self.generate_final_report(&result, &args).await?;
        
        info!("Plan execution completed: {} objects processed", result.processed_objects);
        Ok(result)
    }
    
    pub async fn resume_execution(&mut self, args: ResumeArgs) -> Result<ExecutionResult> {
        info!("Resuming execution from checkpoint");
        
        // Load checkpoint state
        let plan_items = self.checkpoint.load_plan_items().await?;
        let worklog = Worklog::load(&args.checkpoint).await?;
        
        // Filter out completed items
        let pending_items = self.filter_pending_items(plan_items, &worklog).await?;
        info!("Resuming {} pending items", pending_items.len());
        
        // Execute remaining items
        let result = self.execute_with_concurrency(pending_items, &mut worklog.clone(), &RunArgs {
            tenant: "resumed".to_string(),
            input: PathBuf::new(),
            checkpoint: args.checkpoint.clone(),
            concurrency: 256,
            max_inflight: 4096,
            preserve_embed_origin: vec![],
            tsa_profile: "std".to_string(),
            signer_url: "http://localhost:8080".to_string(),
            store_url: "http://localhost:8081".to_string(),
            timeout: 12000,
            retries: 6,
            verify_after: args.verify_after,
            ledger_out: PathBuf::from("resumed-ledger.json"),
            report_out: PathBuf::from("resumed-report"),
        }).await?;
        
        info!("Resume execution completed");
        Ok(result)
    }
    
    async fn execute_with_concurrency(
        &mut self,
        plan_items: Vec<PlanItem>,
        worklog: &mut Worklog,
        args: &RunArgs,
    ) -> Result<ExecutionResult> {
        let start_time = Instant::now();
        let semaphore = Arc::new(Semaphore::new(args.concurrency));
        let max_inflight = args.max_inflight;
        
        // Create channels for coordination
        let (result_tx, mut result_rx) = mpsc::channel::<ObjectResult>(max_inflight);
        
        // Process items in batches to control memory
        let batch_size = args.concurrency * 4;
        let mut total_objects = 0;
        let mut processed_objects = 0;
        let mut failed_objects = 0;
        let mut skipped_objects = 0;
        let mut unique_manifests = 0;
        let mut total_bytes = 0;
        let mut errors = Vec::new();
        
        for chunk in plan_items.chunks(batch_size) {
            let chunk_futures: Vec<_> = chunk.iter()
                .enumerate()
                .map(|(i, item)| {
                    let item = item.clone();
                    let semaphore = semaphore.clone();
                    let result_tx = result_tx.clone();
                    let signer = self.signer.clone();
                    let store = self.store.clone();
                    let metrics = self.metrics.clone();
                    let config = self.config.clone();
                    
                    tokio::spawn(async move {
                        let _permit = semaphore.acquire().await
                            .with_context(|| "Failed to acquire semaphore permit")?;
                        self.process_plan_item(item, signer, store, metrics, config).await
                    })
                })
                .collect();
            
            // Wait for batch completion
            let results = stream::iter(chunk_futures)
                .buffer_unordered(chunk.len())
                .collect::<Vec<_>>()
                .await;
            
            for result in results {
                match result {
                    Ok(object_result) => {
                        total_objects += object_result.object_count;
                        
                        match object_result.status {
                            ObjectStatus::Processed => {
                                processed_objects += object_result.processed_count;
                                unique_manifests += object_result.manifest_count;
                                total_bytes += object_result.bytes_processed;
                            }
                            ObjectStatus::Skipped => {
                                skipped_objects += object_result.processed_count;
                            }
                            ObjectStatus::Failed => {
                                failed_objects += object_result.processed_count;
                                errors.extend(object_result.errors);
                            }
                        }
                        
                        // Update worklog
                        worklog.update_entries(&object_result.worklog_updates).await?;
                    }
                    Err(e) => {
                        error!("Batch processing error: {}", e);
                        failed_objects += chunk.len();
                    }
                }
            }
            
            // Periodic checkpoint save
            worklog.save().await?;
            
            // Progress logging
            let elapsed = start_time.elapsed().as_secs_f64();
            let current_rate = processed_objects as f64 / elapsed;
            info!("Progress: {}/{} objects processed ({:.1} objects/sec)", 
                  processed_objects, total_objects, current_rate);
        }
        
        let total_duration_secs = start_time.elapsed().as_secs();
        let assets_per_sec = processed_objects as f64 / total_duration_secs as f64;
        
        Ok(ExecutionResult {
            total_objects,
            processed_objects,
            failed_objects,
            skipped_objects,
            unique_manifests,
            total_bytes,
            total_duration_secs,
            assets_per_sec,
            errors,
        })
    }
    
    async fn process_plan_item(
        &self,
        item: PlanItem,
        signer: SignerClient,
        store: ManifestStore,
        metrics: Arc<MetricsCollector>,
        config: Config,
    ) -> Result<ObjectResult> {
        let start_time = Instant::now();
        
        // Find canonical object
        let canonical_object = item.objects.first()
            .ok_or_else(|| anyhow::anyhow!("No objects in plan item"))?;
        
        // Check if manifest already exists
        if let Ok(exists) = store.manifest_exists(&item.content_sha256).await {
            if exists {
                debug!("Manifest already exists for content: {}", item.content_sha256);
                return Ok(ObjectResult {
                    object_count: item.objects.len(),
                    processed_count: item.objects.len(),
                    manifest_count: 0,
                    bytes_processed: 0,
                    status: ObjectStatus::Skipped,
                    worklog_updates: vec![],
                    errors: vec![],
                });
            }
        }
        
        // Process plan item with timing
        let start_time = std::time::Instant::now();
        
        // Download and hash canonical object
        let content_hash = self.download_and_hash(canonical_object).await?;
        
        // Sign the content
        let sign_result = signer.sign_content(&content_hash, &[]).await?;
        
        // Store manifest
        store.store_manifest(&sign_result.manifest_hash, &sign_result.manifest_bytes).await?;
        
        // Record timing
        let duration = start_time.elapsed();
        self.metrics.record_sign_duration(duration);
        self.metrics.record_end_to_end_duration(duration);
        
        // Update metrics
        self.metrics.increment_processed_objects(1);
        self.metrics.add_bytes_processed(canonical_object.size);
        self.metrics.increment_manifests_created(1);
        
        // Create worklog updates
        let worklog_updates: Vec<WorklogEntry> = item.objects.into_iter()
            .map(|obj| WorklogEntry {
                job_id: "default".to_string(),
                key: obj.key,
                content_sha256: content_hash.clone(),
                manifest_sha256: Some(sign_result.manifest_hash.clone()),
                status: WorkStatus::Written,
                error_code: None,
                attempt: 1,
                ts: Utc::now(),
            })
            .collect();
        
        Ok(ObjectResult {
            object_count: worklog_updates.len(),
            processed_count: worklog_updates.len(),
            manifest_count: 1,
            bytes_processed: canonical_object.size,
            status: ObjectStatus::Processed,
            worklog_updates,
            errors: vec![],
        })
    }
    
    async fn download_and_hash(&self, object: &ObjectReference) -> Result<String> {
    use aws_sdk_s3::{Client, Config as S3Config, Region};
    use aws_config::{BehaviorVersion, defaults};
    use tokio::io::AsyncReadExt;
    
    info!("Downloading and hashing content from: {}", object.key);
    
    // Determine if this is S3/R2 or filesystem
    if object.key.starts_with("s3://") || object.key.contains("://") {
        // S3/R2 object - download and hash
        let aws_config = defaults(BehaviorVersion::latest()).await;
        let s3_config = S3Config::builder()
            .region(Region::from_static("us-east-1"))
            .build();
        let client = Client::from_conf(s3_config);
        
        // Parse bucket and key from object.key (assuming format: bucket/key)
        let parts: Vec<&str> = object.key.splitn(2, '/').collect();
        if parts.len() != 2 {
            return Err(anyhow::anyhow!("Invalid S3 key format: {}", object.key));
        }
        
        let bucket = parts[0];
        let key = parts[1];
        
        // Get object from S3
        let response = client
            .get_object()
            .bucket(bucket)
            .key(key)
            .send()
            .await
            .with_context(|| format!("Failed to download object {} from bucket {}", key, bucket))?;
        
        // Stream download and compute hash
        let mut hasher = Sha256::new();
        let mut body = response.body;
        let mut buffer = vec![0; 8192]; // 8KB buffer
        
        loop {
            let bytes_read = body.read(&mut buffer).await
                .with_context(|| "Failed to read object data")?;
            
            if bytes_read == 0 {
                break;
            }
            
            hasher.update(&buffer[..bytes_read]);
        }
        
        let hash_result = hasher.finalize();
        Ok(format!("sha256:{}", hex::encode(hash_result)))
        
    } else {
        // Local filesystem object
        let path = std::path::Path::new(&object.key);
        if !path.exists() {
            return Err(anyhow::anyhow!("File not found: {}", object.key));
        }
        
        let mut file = tokio::fs::File::open(path).await
            .with_context(|| format!("Failed to open file: {}", object.key))?;
        
        let mut hasher = Sha256::new();
        let mut buffer = vec![0; 8192]; // 8KB buffer
        
        loop {
            let bytes_read = file.read(&mut buffer).await
                .with_context(|| format!("Failed to read file: {}", object.key))?;
            
            if bytes_read == 0 {
                break;
            }
            
            hasher.update(&buffer[..bytes_read]);
        }
        
        let hash_result = hasher.finalize();
        Ok(format!("sha256:{}", hex::encode(hash_result)))
    }
    
    async fn filter_pending_items(
        &self,
        plan_items: Vec<PlanItem>,
        worklog: &Worklog,
    ) -> Result<Vec<PlanItem>> {
        let completed_keys = worklog.get_completed_keys().await?;
        
        Ok(plan_items.into_iter()
            .filter(|item| {
                !item.objects.iter().any(|obj| completed_keys.contains(&obj.key))
            })
            .collect())
    }
    
    async fn generate_final_report(&self, result: &ExecutionResult, args: &RunArgs) -> Result<()> {
        info!("Generating final report");
        
        // Create report directory
        tokio::fs::create_dir_all(&args.report_out).await?;
        
        // Write execution summary
        let summary_path = args.report_out.join("execution-summary.json");
        let summary_json = serde_json::to_string_pretty(result)?;
        tokio::fs::write(summary_path, summary_json).await?;
        
        // Write metrics
        let metrics_path = args.report_out.join("metrics.json");
        let metrics_json = serde_json::to_string_pretty(&self.metrics.get_snapshot())?;
        tokio::fs::write(metrics_path, metrics_json).await?;
        
        Ok(())
    }
}

#[derive(Debug)]
struct ObjectResult {
    object_count: usize,
    processed_count: usize,
    manifest_count: usize,
    bytes_processed: u64,
    status: ObjectStatus,
    worklog_updates: Vec<WorklogEntry>,
    errors: Vec<ExecutionError>,
}

#[derive(Debug)]
enum ObjectStatus {
    Processed,
    Skipped,
    Failed,
}

pub async fn run(args: RunArgs) -> Result<()> {
    let config = Config::from_env()?;
    let mut runner = Runner::new(config).await?;
    
    let result = runner.execute_plan(args).await?;
    
    if result.failed_objects > 0 {
        warn!("Execution completed with {} failures", result.failed_objects);
    }
    
    Ok(())
}

pub async fn resume(args: ResumeArgs) -> Result<()> {
    let config = Config::from_env()?;
    let mut runner = Runner::new(config).await?;
    
    let result = runner.resume_execution(args).await?;
    
    info!("Resume completed successfully");
    Ok(())
}

async fn load_plan_items(input: &PathBuf) -> Result<Vec<PlanItem>> {
    let content = tokio::fs::read_to_string(input).await?;
    let mut items = Vec::new();
    
    for line in content.lines() {
        if line.trim().is_empty() {
            continue;
        }
        
        let item: PlanItem = serde_json::from_str(line)?;
        items.push(item);
    }
    
    Ok(items)
}
