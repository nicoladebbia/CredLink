//! Stratified sampling for C2 Concierge Retro-Sign

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use rand::seq::SliceRandom;
use rand::thread_rng;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use tracing::{debug, info};

use crate::cli::SampleArgs;
use crate::cli::OriginType;
use crate::inventory::InventoryRecord;
use crate::planner::PlanItem;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SamplePlan {
    pub tenant_id: String,
    pub sample_size: usize,
    pub stratification_factors: Vec<String>,
    pub total_population: usize,
    pub sampled_items: Vec<PlanItem>,
    pub sampling_metadata: SamplingMetadata,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SamplingMetadata {
    pub size_buckets: Vec<SizeBucket>,
    pub mime_distribution: HashMap<String, usize>,
    pub prefix_distribution: HashMap<String, usize>,
    pub date_distribution: HashMap<String, usize>,
    pub sampling_ratio: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SizeBucket {
    pub min_size: u64,
    pub max_size: u64,
    pub count: usize,
    pub sampled_count: usize,
}

pub async fn run(args: SampleArgs) -> Result<()> {
    info!("Starting stratified sampling for tenant");
    
    // Collect inventory
    let inventory_records = collect_inventory(&args).await?;
    info!("Collected {} inventory records for sampling", inventory_records.len());
    
    // Perform stratified sampling
    let sample_plan = perform_stratified_sampling(inventory_records, &args).await?;
    
    // Write outputs
    write_sample_plan(&sample_plan, &args.plan_out).await?;
    write_sampling_metadata(&sample_plan, &args.ledger_out).await?;
    
    info!("Sampling completed: {} items sampled from {} population", 
          sample_plan.sampled_items.len(), sample_plan.total_population);
    
    Ok(())
}

async fn collect_inventory(args: &SampleArgs) -> Result<Vec<InventoryRecord>> {
    match args.origin {
        OriginType::S3 | OriginType::R2 => {
            collect_from_s3(args).await
        }
        OriginType::File => {
            collect_from_filesystem(args).await
        }
    }
}

async fn collect_from_s3(args: &SampleArgs) -> Result<Vec<InventoryRecord>> {
    // Reuse the inventory module's S3 collection functionality
    crate::inventory::collect_from_s3(
        &args.bucket,
        &args.prefix,
        &args.exclude_prefix,
        args.min_size,
        args.max_size,
        &args.mime,
        args.after,
        args.limit,
    ).await
}

async fn collect_from_filesystem(args: &SampleArgs) -> Result<Vec<InventoryRecord>> {
    // Reuse the inventory module's filesystem collection functionality
    crate::inventory::collect_from_filesystem(
        &args.prefix,
        &args.exclude_prefix,
        args.min_size,
        args.max_size,
        &args.mime,
        args.after,
        args.limit,
    ).await
}

async fn perform_stratified_sampling(
    inventory_records: Vec<InventoryRecord>,
    args: &SampleArgs,
) -> Result<SamplePlan> {
    info!("Performing stratified sampling with factors: {:?}", args.stratify);
    
    let total_population = inventory_records.len();
    
    if total_population <= args.sample {
        info!("Sample size equals or exceeds population, using all items");
        return create_sample_plan_from_inventory(inventory_records, args).await;
    }
    
    // Create strata based on factors
    let strata = create_strata(&inventory_records, &args.stratify)?;
    
    // Allocate sample size across strata proportionally
    let sample_allocation = allocate_sample_size(&strata, args.sample);
    
    // Sample from each stratum
    let mut sampled_items = Vec::new();
    let mut rng = thread_rng();
    
    for (stratum_key, stratum_records) in strata {
        let allocated_size = sample_allocation.get(&stratum_key).copied().unwrap_or(0);
        
        if allocated_size > 0 && !stratum_records.is_empty() {
            let actual_sample_size = allocated_size.min(stratum_records.len());
            
            // Randomly sample from this stratum
            let mut stratum_sample: Vec<_> = stratum_records.into_iter().collect();
            stratum_sample.shuffle(&mut rng);
            stratum_sample.truncate(actual_sample_size);
            
            // Convert to plan items
            for record in stratum_sample {
                let plan_item = create_plan_item_from_record(record)?;
                sampled_items.push(plan_item);
            }
        }
    }
    
    // Shuffle final sample to avoid ordering bias
    sampled_items.shuffle(&mut rng);
    
    // Generate metadata
    let sampling_metadata = generate_sampling_metadata(&sampled_items, total_population, args.sample).await?;
    
    Ok(SamplePlan {
        tenant_id: "default".to_string(), // Will be set from args
        sample_size: args.sample,
        stratification_factors: args.stratify.clone(),
        total_population,
        sampled_items,
        sampling_metadata,
    })
}

fn create_strata(
    records: &[InventoryRecord],
    factors: &[String],
) -> Result<HashMap<String, Vec<&InventoryRecord>>> {
    let mut strata: HashMap<String, Vec<&InventoryRecord>> = HashMap::new();
    
    for record in records {
        let stratum_key = compute_stratum_key(record, factors);
        strata.entry(stratum_key).or_insert_with(Vec::new).push(record);
    }
    
    debug!("Created {} strata from {} records", strata.len(), records.len());
    
    Ok(strata)
}

fn compute_stratum_key(record: &InventoryRecord, factors: &[String]) -> String {
    let mut key_parts = Vec::new();
    
    for factor in factors {
        match factor.as_str() {
            "mime" => {
                let mime_category = categorize_mime(&record.mime);
                key_parts.push(format!("mime:{}", mime_category));
            }
            "size" => {
                let size_category = categorize_size(record.size);
                key_parts.push(format!("size:{}", size_category));
            }
            "prefix" => {
                let prefix_category = categorize_prefix(&record.key);
                key_parts.push(format!("prefix:{}", prefix_category));
            }
            "date" => {
                let date_category = categorize_date(&record.last_modified);
                key_parts.push(format!("date:{}", date_category));
            }
            _ => {
                key_parts.push(format!("{}:unknown", factor));
            }
        }
    }
    
    key_parts.join("|")
}

fn categorize_mime(mime: &str) -> String {
    if mime.starts_with("image/") {
        "image".to_string()
    } else if mime.starts_with("video/") {
        "video".to_string()
    } else if mime.starts_with("audio/") {
        "audio".to_string()
    } else if mime.starts_with("text/") {
        "text".to_string()
    } else {
        "other".to_string()
    }
}

fn categorize_size(size: u64) -> String {
    match size {
        0..=10_240 => "tiny", // < 10KB
        10_241..=102_400 => "small", // 10KB - 100KB
        102_401..=1_048_576 => "medium", // 100KB - 1MB
        1_048_577..=10_485_760 => "large", // 1MB - 10MB
        10_485_761..=104_857_600 => "xlarge", // 10MB - 100MB
        _ => "huge", // > 100MB
    }.to_string()
}

fn categorize_prefix(key: &str) -> String {
    let key_lower = key.to_lowercase();
    
    if key_lower.contains("uploads/") {
        "uploads".to_string()
    } else if key_lower.contains("media/") {
        "media".to_string()
    } else if key_lower.contains("assets/") {
        "assets".to_string()
    } else if key_lower.contains("images/") {
        "images".to_string()
    } else if key_lower.contains("cache/") {
        "cache".to_string()
    } else {
        "other".to_string()
    }
}

fn categorize_date(date: &DateTime<Utc>) -> String {
    let now = Utc::now();
    let duration = now.signed_duration_since(*date);
    
    match duration.num_days() {
        0..=7 => "recent".to_string(),
        8..=30 => "month".to_string(),
        31..=365 => "year".to_string(),
        _ => "old".to_string(),
    }
}

fn allocate_sample_size(strata: &HashMap<String, Vec<&InventoryRecord>>, target_sample: usize) -> HashMap<String, usize> {
    let mut allocation = HashMap::new();
    let total_population: usize = strata.values().map(|v| v.len()).sum();
    
    if total_population == 0 {
        return allocation;
    }
    
    let mut allocated = 0;
    
    // Proportional allocation
    for (stratum_key, records) in strata {
        let proportion = records.len() as f64 / total_population as f64;
        let stratum_allocation = (proportion * target_sample as f64).round() as usize;
        
        if stratum_allocation > 0 {
            allocation.insert(stratum_key.clone(), stratum_allocation);
            allocated += stratum_allocation;
        }
    }
    
    // Handle rounding errors by distributing remaining slots
    let remaining = target_sample - allocated;
    if remaining > 0 {
        let mut strata_sorted: Vec<_> = strata.iter().collect();
        strata_sorted.sort_by(|a, b| b.1.len().cmp(&a.1.len())); // Largest strata first
        
        for (i, (stratum_key, _)) in strata_sorted.iter().enumerate() {
            if i < remaining {
                *allocation.get_mut(*stratum_key).or_insert(0) += 1;
            }
        }
    }
    
    debug!("Allocated sample sizes across {} strata", allocation.len());
    
    allocation
}

fn create_plan_item_from_record(record: &InventoryRecord) -> Result<PlanItem> {
    Ok(PlanItem {
        content_sha256: format!("size-{}", record.size), // Placeholder
        objects: vec![crate::planner::ObjectReference {
            key: record.key.clone(),
            size: record.size,
            last_modified: record.last_modified,
            mime: record.mime.clone(),
        }],
        mode: "remote".to_string(),
        preserve_embed: false,
        estimated_size: record.size,
    })
}

async fn create_sample_plan_from_inventory(
    inventory_records: Vec<InventoryRecord>,
    args: &SampleArgs,
) -> Result<SamplePlan> {
    let mut sampled_items = Vec::new();
    
    for record in inventory_records {
        let plan_item = create_plan_item_from_record(&record)?;
        sampled_items.push(plan_item);
    }
    
    let sampling_metadata = generate_sampling_metadata(&sampled_items, sampled_items.len(), sampled_items.len()).await?;
    
    Ok(SamplePlan {
        tenant_id: "default".to_string(),
        sample_size: args.sample,
        stratification_factors: args.stratify.clone(),
        total_population: sampled_items.len(),
        sampled_items,
        sampling_metadata,
    })
}

async fn generate_sampling_metadata(
    sampled_items: &[PlanItem],
    total_population: usize,
    sample_size: usize,
) -> Result<SamplingMetadata> {
    // Analyze size distribution
    let mut size_counts: HashMap<String, (usize, usize)> = HashMap::new();
    
    // Analyze MIME distribution
    let mut mime_distribution: HashMap<String, usize> = HashMap::new();
    
    // Analyze prefix distribution
    let mut prefix_distribution: HashMap<String, usize> = HashMap::new();
    
    // Analyze date distribution
    let mut date_distribution: HashMap<String, usize> = HashMap::new();
    
    for item in sampled_items {
        // Size analysis
        let size_category = categorize_size(item.estimated_size);
        let (total, sampled) = size_counts.entry(size_category).or_insert((0, 0));
        *total += item.objects.len();
        *sampled += 1;
        
        // MIME analysis
        if let Some(first_object) = item.objects.first() {
            let mime_category = categorize_mime(&first_object.mime);
            *mime_distribution.entry(mime_category).or_insert(0) += 1;
            
            let prefix_category = categorize_prefix(&first_object.key);
            *prefix_distribution.entry(prefix_category).or_insert(0) += 1;
            
            let date_category = categorize_date(&first_object.last_modified);
            *date_distribution.entry(date_category).or_insert(0) += 1;
        }
    }
    
    let size_buckets: Vec<SizeBucket> = size_counts.into_iter()
        .map(|(category, (total, sampled))| {
            let (min_size, max_size) = size_category_bounds(&category);
            SizeBucket {
                min_size,
                max_size,
                count: total,
                sampled_count: sampled,
            }
        })
        .collect();
    
    let sampling_ratio = sample_size as f64 / total_population as f64;
    
    Ok(SamplingMetadata {
        size_buckets,
        mime_distribution,
        prefix_distribution,
        date_distribution,
        sampling_ratio,
    })
}

fn size_category_bounds(category: &str) -> (u64, u64) {
    match category {
        "tiny" => (0, 10_240),
        "small" => (10_241, 102_400),
        "medium" => (102_401, 1_048_576),
        "large" => (1_048_577, 10_485_760),
        "xlarge" => (10_485_761, 104_857_600),
        "huge" => (104_857_601, u64::MAX),
        _ => (0, u64::MAX),
    }
}

async fn write_sample_plan(sample_plan: &SamplePlan, output_path: &std::path::Path) -> Result<()> {
    // Create parent directory if it doesn't exist
    if let Some(parent) = output_path.parent() {
        tokio::fs::create_dir_all(parent).await
            .with_context(|| format!("Failed to create directory: {:?}", parent))?;
    }
    
    let file = tokio::fs::File::create(output_path).await
        .with_context(|| format!("Failed to create sample plan file: {:?}", output_path))?;
    
    use tokio::io::AsyncWriteExt;
    let mut writer = tokio::io::BufWriter::new(file);
    
    for item in &sample_plan.sampled_items {
        let line = serde_json::to_string(item)
            .with_context(|| "Failed to serialize plan item")?;
        
        writer.write_all(line.as_bytes()).await
            .with_context(|| "Failed to write plan item")?;
        
        writer.write_all(b"\n").await
            .with_context(|| "Failed to write newline")?;
    }
    
    writer.flush().await
        .with_context(|| "Failed to flush sample plan file")?;
    
    info!("Wrote {} sampled items to {:?}", sample_plan.sampled_items.len(), output_path);
    
    Ok(())
}

async fn write_sampling_metadata(sample_plan: &SamplePlan, output_path: &std::path::Path) -> Result<()> {
    let metadata_json = serde_json::to_string_pretty(sample_plan)
        .with_context(|| "Failed to serialize sampling metadata")?;
    
    tokio::fs::write(output_path, metadata_json).await
        .with_context(|| format!("Failed to write sampling metadata to {:?}", output_path))?;
    
    info!("Wrote sampling metadata to {:?}", output_path);
    
    Ok(())
}
