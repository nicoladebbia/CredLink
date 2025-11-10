//! Planning and cost estimation for C2 Concierge Retro-Sign

use anyhow::{Context, Result};
use chrono::Utc;
use clap::Parser;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use tracing::{debug, info, warn};

use crate::cli::PlanArgs;
use crate::inventory::InventoryRecord;
use crate::ledger::Ledger;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanItem {
    pub content_sha256: String,
    pub objects: Vec<ObjectReference>,
    pub mode: String, // "remote" or "embed"
    pub preserve_embed: bool,
    pub estimated_size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ObjectReference {
    pub key: String,
    pub size: u64,
    pub last_modified: chrono::DateTime<Utc>,
    pub mime: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ContentGroup {
    pub content_hash: String,
    pub objects: Vec<InventoryRecord>,
    pub canonical_object: Option<InventoryRecord>,
    pub total_size: u64,
    pub unique_size: u64,
}

pub async fn run(args: PlanArgs) -> Result<()> {
    info!("Starting planning phase for tenant");
    
    // Load inventory records
    let inventory_records = load_inventory(&args.input).await?;
    info!("Loaded {} inventory records", inventory_records.len());
    
    // Group by content (using size-based heuristic for now)
    let content_groups = group_by_content(&inventory_records, &args).await?;
    info!("Grouped into {} unique content groups", content_groups.len());
    
    // Create plan items
    let plan_items = create_plan_items(content_groups, &args).await?;
    info!("Created {} plan items", plan_items.len());
    
    // Generate cost ledger
    let ledger = generate_ledger(&plan_items, &args).await?;
    
    // Write outputs
    write_plan(&plan_items, &args.plan_out).await?;
    write_ledger(&ledger, &args.ledger_out).await?;
    
    if !args.dry_run {
        generate_reports(&plan_items, &ledger, &args.report_out).await?;
    }
    
    info!("Planning completed successfully");
    Ok(())
}

async fn load_inventory(input: &PathBuf) -> Result<Vec<InventoryRecord>> {
    let file = File::open(input).await
        .with_context(|| format!("Failed to open inventory file: {:?}", input))?;
    
    let mut records = Vec::new();
    let reader = BufReader::new(file);
    
    for line in reader.lines() {
        let line = line.with_context(|| "Failed to read inventory line")?;
        let record: InventoryRecord = serde_json::from_str(&line)
            .with_context(|| format!("Failed to parse inventory record: {}", line))?;
        records.push(record);
    }
    
    Ok(records)
}

async fn group_by_content(
    records: &[InventoryRecord],
    args: &PlanArgs,
) -> Result<Vec<ContentGroup>> {
    info!("Grouping objects by content hash");
    
    let mut size_groups: HashMap<u64, Vec<InventoryRecord>> = HashMap::new();
    
    // Group by size first (heuristic for identical content)
    for record in records {
        size_groups.entry(record.size)
            .or_insert_with(Vec::new)
            .push(record.clone());
    }
    
    let mut content_groups = Vec::new();
    
    for (size, group) in size_groups {
        if group.len() == 1 {
            // Single object - likely unique content
            let canonical_object = group[0].clone();
            content_groups.push(ContentGroup {
                content_hash: format!("size-{}", size), // Placeholder for real hash
                objects: group,
                canonical_object: Some(canonical_object),
                total_size: size,
                unique_size: size,
            });
        } else {
            // Multiple objects with same size - potential duplicates
            // In a real implementation, we'd download and hash to verify
            // For now, we'll treat them as potential duplicates
            let canonical_object = find_canonical_object(&group);
            
            content_groups.push(ContentGroup {
                content_hash: format!("size-{}", size), // Placeholder for real hash
                objects: group,
                canonical_object,
                total_size: size * group.len() as u64,
                unique_size: size,
            });
        }
    }
    
    // Sort by total size (largest first)
    content_groups.sort_by(|a, b| b.total_size.cmp(&a.total_size));
    
    // Apply sampling if requested
    if let Some(sample_size) = args.sample {
        content_groups = apply_sampling(content_groups, sample_size).await?;
    }
    
    Ok(content_groups)
}

fn find_canonical_object(group: &[InventoryRecord]) -> Option<InventoryRecord> {
    // Find the canonical object (prefer original over derived)
    group.iter()
        .min_by_key(|obj| {
            // Prefer objects that look like originals (not in cache/cdn folders)
            let key_lower = obj.key.to_lowercase();
            let is_derivative = key_lower.contains("cache") ||
                               key_lower.contains("thumb") ||
                               key_lower.contains("deriv") ||
                               key_lower.contains("_small") ||
                               key_lower.contains("_medium") ||
                               key_lower.contains("_large");
            
            if is_derivative { 1 } else { 0 }
        })
        .cloned()
}

async fn apply_sampling(
    content_groups: Vec<ContentGroup>,
    sample_size: usize,
) -> Result<Vec<ContentGroup>> {
    info!("Applying stratified sampling to get {} items", sample_size);
    
    if content_groups.len() <= sample_size {
        return Ok(content_groups);
    }
    
    // Stratified sampling by size buckets
    let mut size_buckets: Vec<(usize, &ContentGroup)> = content_groups
        .iter()
        .enumerate()
        .collect();
    
    // Sort by size for stratification
    size_buckets.sort_by_key(|(_, group)| group.unique_size);
    
    let mut sampled = Vec::new();
    let total_items = size_buckets.len();
    
    // Sample evenly across the size distribution
    let step = total_items / sample_size;
    
    for i in 0..sample_size {
        let index = (i * step).min(total_items - 1);
        sampled.push(size_buckets[index].1.clone());
    }
    
    Ok(sampled)
}

async fn create_plan_items(
    content_groups: Vec<ContentGroup>,
    args: &PlanArgs,
) -> Result<Vec<PlanItem>> {
    info!("Creating plan items from content groups");
    
    let mut plan_items = Vec::new();
    
    for group in content_groups {
        let objects: Vec<ObjectReference> = group.objects.into_iter()
            .map(|obj| ObjectReference {
                key: obj.key,
                size: obj.size,
                last_modified: obj.last_modified,
                mime: obj.mime,
            })
            .collect();
        
        // Determine if this should be embedded (preserve-embed-origin)
        let preserve_embed = group.canonical_object
            .as_ref()
            .map(|obj| should_preserve_embed(&obj.key, args))
            .unwrap_or(false);
        
        let mode = if preserve_embed { "embed" } else { "remote" };
        
        plan_items.push(PlanItem {
            content_sha256: group.content_hash,
            objects,
            mode: mode.to_string(),
            preserve_embed,
            estimated_size: group.unique_size,
        });
    }
    
    Ok(plan_items)
}

fn should_preserve_embed(key: &str, _args: &PlanArgs) -> bool {
    // Check if key matches preserve-embed-origin patterns
    // For now, use simple heuristics
    let key_lower = key.to_lowercase();
    
    key_lower.contains("/preserve/") ||
    key_lower.contains("/original/") ||
    key_lower.contains("/master/") ||
    key_lower.starts_with("media/") ||
    key_lower.starts_with("originals/")
}

async fn generate_ledger(plan_items: &[PlanItem], args: &PlanArgs) -> Result<Ledger> {
    info!("Generating cost ledger");
    
    let objects_total: usize = plan_items.iter()
        .map(|item| item.objects.len())
        .sum();
    
    let objects_unique = plan_items.len();
    
    let bytes_total: u64 = plan_items.iter()
        .map(|item| item.estimated_size * item.objects.len() as u64)
        .sum();
    
    let bytes_unique: u64 = plan_items.iter()
        .map(|item| item.estimated_size)
        .sum();
    
    // Estimate runtime (simplified)
    let est_runtime_sec = (objects_total as f64 / 50.0) as u64; // 50 assets/sec target
    
    // Calculate costs
    let tsa_usd = objects_unique as f64 * args.tsa_cost;
    let egress_usd = (bytes_unique as f64 / (1024.0 * 1024.0 * 1024.0)) * args.egress_cost;
    let cpu_hours = est_runtime_sec as f64 / 3600.0;
    let cpu_usd = cpu_hours * args.cpu_cost;
    let storage_usd = (bytes_unique as f64 / (1024.0 * 1024.0 * 1024.0)) * args.storage_cost;
    
    let ledger = Ledger {
        tenant_id: "default".to_string(), // Will be set by caller
        ts: Utc::now(),
        objects_total,
        objects_unique,
        bytes_total,
        bytes_unique,
        est_runtime_sec,
        est_cost: crate::ledger::CostEstimate {
            tsa_usd,
            egress_usd,
            cpu_usd,
            storage_usd,
            total_usd: tsa_usd + egress_usd + cpu_usd + storage_usd,
        },
        perf_target: crate::ledger::PerformanceTarget {
            assets_per_sec: 50,
            node_type: "c6a.large|m7g.large".to_string(),
        },
        first_10k_free: crate::ledger::FreeSample {
            sampled: plan_items.len().min(10000),
            mix: "stratified: mime,size,prefix,date".to_string(),
        },
    };
    
    Ok(ledger)
}

async fn write_plan(plan_items: &[PlanItem], output: &PathBuf) -> Result<()> {
    info!("Writing {} plan items to {:?}", plan_items.len(), output);
    
    let file = File::create(output).await
        .with_context(|| format!("Failed to create plan file: {:?}", output))?;
    
    use tokio::io::AsyncWriteExt;
    let mut writer = tokio::io::BufWriter::new(file);
    
    for item in plan_items {
        let line = serde_json::to_string(item)
            .with_context(|| "Failed to serialize plan item")?;
        
        writer.write_all(line.as_bytes()).await
            .with_context(|| "Failed to write plan item")?;
        
        writer.write_all(b"\n").await
            .with_context(|| "Failed to write newline")?;
    }
    
    writer.flush().await
        .with_context(|| "Failed to flush plan file")?;
    
    Ok(())
}

async fn write_ledger(ledger: &Ledger, output: &PathBuf) -> Result<()> {
    info!("Writing ledger to {:?}", output);
    
    let content = serde_json::to_string_pretty(ledger)
        .with_context(|| "Failed to serialize ledger")?;
    
    tokio::fs::write(output, content).await
        .with_context(|| format!("Failed to write ledger to {:?}", output))?;
    
    Ok(())
}

async fn generate_reports(
    plan_items: &[PlanItem],
    ledger: &Ledger,
    output_dir: &PathBuf,
) -> Result<()> {
    info!("Generating reports in {:?}", output_dir);
    
    // Create output directory
    tokio::fs::create_dir_all(output_dir).await
        .with_context(|| format!("Failed to create report directory: {:?}", output_dir))?;
    
    // Generate HTML report
    generate_html_report(plan_items, ledger, output_dir).await?;
    
    // Generate CSV report
    generate_csv_report(plan_items, ledger, output_dir).await?;
    
    Ok(())
}

async fn generate_html_report(
    plan_items: &[PlanItem],
    ledger: &Ledger,
    output_dir: &PathBuf,
) -> Result<()> {
    let html_content = format!(r#"
<!DOCTYPE html>
<html>
<head>
    <title>C2 Concierge Retro-Sign Plan Report</title>
    <style>
        body {{ font-family: Arial, sans-serif; margin: 20px; }}
        .summary {{ background: #f5f5f5; padding: 15px; border-radius: 5px; }}
        .metrics {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin: 20px 0; }}
        .metric {{ background: white; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }}
        .metric h3 {{ margin: 0 0 10px 0; color: #333; }}
        .metric .value {{ font-size: 24px; font-weight: bold; color: #2563eb; }}
        table {{ width: 100%; border-collapse: collapse; margin: 20px 0; }}
        th, td {{ padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }}
        th {{ background-color: #f8f9fa; }}
    </style>
</head>
<body>
    <h1>C2 Concierge Retro-Sign Plan Report</h1>
    
    <div class="summary">
        <h2>Summary</h2>
        <p>Generated: {}</p>
        <p>Tenant: {}</p>
    </div>
    
    <div class="metrics">
        <div class="metric">
            <h3>Total Objects</h3>
            <div class="value">{}</div>
        </div>
        <div class="metric">
            <h3>Unique Objects</h3>
            <div class="value">{}</div>
        </div>
        <div class="metric">
            <h3>Total Size</h3>
            <div class="value">{:.2} GB</div>
        </div>
        <div class="metric">
            <h3>Estimated Cost</h3>
            <div class="value">${:.2}</div>
        </div>
        <div class="metric">
            <h3>Estimated Runtime</h3>
            <div class="value">{:.0} hours</div>
        </div>
        <div class="metric">
            <h3>Target Throughput</h3>
            <div class="value">{} assets/sec</div>
        </div>
    </div>
    
    <h2>Cost Breakdown</h2>
    <table>
        <tr><th>Component</th><th>Cost</th></tr>
        <tr><td>TSA Timestamps</td><td>${:.2}</td></tr>
        <tr><td>Egress</td><td>${:.2}</td></tr>
        <tr><td>Compute</td><td>${:.2}</td></tr>
        <tr><td>Storage</td><td>${:.2}</td></tr>
        <tr><th>Total</th><th>${:.2}</th></tr>
    </table>
</body>
</html>
"#,
        ledger.ts.format("%Y-%m-%d %H:%M:%S UTC"),
        ledger.tenant_id,
        ledger.objects_total,
        ledger.objects_unique,
        ledger.bytes_total as f64 / (1024.0 * 1024.0 * 1024.0),
        ledger.est_cost.total_usd,
        ledger.est_runtime_sec as f64 / 3600.0,
        ledger.perf_target.assets_per_sec,
        ledger.est_cost.tsa_usd,
        ledger.est_cost.egress_usd,
        ledger.est_cost.cpu_usd,
        ledger.est_cost.storage_usd,
        ledger.est_cost.total_usd
    );
    
    let html_path = output_dir.join("index.html");
    tokio::fs::write(&html_path, html_content).await
        .with_context(|| format!("Failed to write HTML report: {:?}", html_path))?;
    
    Ok(())
}

async fn generate_csv_report(
    plan_items: &[PlanItem],
    ledger: &Ledger,
    output_dir: &PathBuf,
) -> Result<()> {
    let mut csv_content = String::new();
    csv_content.push_str("content_sha256,object_count,total_size,mode,preserve_embed\n");
    
    for item in plan_items {
        csv_content.push_str(&format!(
            "{},{},{},{},{}\n",
            item.content_sha256,
            item.objects.len(),
            item.estimated_size,
            item.mode,
            item.preserve_embed
        ));
    }
    
    let csv_path = output_dir.join("plan.csv");
    tokio::fs::write(&csv_path, csv_content).await
        .with_context(|| format!("Failed to write CSV report: {:?}", csv_path))?;
    
    Ok(())
}
