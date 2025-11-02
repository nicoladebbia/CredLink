//! Inventory collection for C2 Concierge Retro-Sign

use anyhow::{Context, Result};
use aws_config::BehaviorVersion;
use aws_sdk_s3::{Client, primitives::ByteStream};
use chrono::{DateTime, Utc};
use clap::Parser;
use futures::StreamExt;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::BufRead;
use std::path::PathBuf;
use tokio::fs::File;
use tokio::io::AsyncWriteExt;
use tracing::{debug, error, info, warn};
use sha2::{Sha256, Digest};
use hex;

use crate::cli::InventoryArgs;
use crate::cli::OriginType;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InventoryRecord {
    pub key: String,
    pub etag: String,
    pub size: u64,
    pub last_modified: DateTime<Utc>,
    pub storage_class: String,
    pub mime: String,
}

pub async fn collect_from_s3(
    bucket: &str,
    prefixes: &[String],
    exclude_prefixes: &[String],
    min_size: Option<u64>,
    max_size: Option<u64>,
    mime_filter: &str,
    after: Option<DateTime<Utc>>,
    limit: Option<usize>,
) -> Result<Vec<InventoryRecord>> {
    use aws_sdk_s3::{Client, Config as S3Config, Region};
    use aws_config::{BehaviorVersion, defaults};
    
    info!("Collecting inventory from S3 bucket: {}", bucket);
    
    // Create AWS config and S3 client
    let aws_config = defaults(BehaviorVersion::latest()).await;
    let s3_config = S3Config::builder()
        .region(Region::from_static("us-east-1"))
        .build();
    let client = Client::from_conf(s3_config);
    
    let mut records = Vec::new();
    
    for prefix in prefixes {
        debug!("Listing objects with prefix: {}", prefix);
        
        let mut continuation_token = None;
        loop {
            let mut list_request = client
                .list_objects_v2()
                .bucket(bucket)
                .prefix(prefix);
            
            if let Some(token) = &continuation_token {
                list_request = list_request.continuation_token(token);
            }
            
            let response = list_request.send().await
                .with_context(|| format!("Failed to list objects in bucket {} with prefix {}", bucket, prefix))?;
            
            if let Some(objects) = response.contents() {
                for object in objects {
                    // Skip directories
                    if object.key().ends_with('/') {
                        continue;
                    }
                    
                    // Check size filters
                    let size = object.size();
                    if let Some(min) = min_size {
                        if size < min {
                            continue;
                        }
                    }
                    if let Some(max) = max_size {
                        if size > max {
                            continue;
                        }
                    }
                    
                    // Check exclude prefixes
                    let key = object.key();
                    if exclude_prefixes.iter().any(|exclude| key.starts_with(exclude)) {
                        continue;
                    }
                    
                    // Check date filter
                    if let Some(after_date) = after {
                        if let Some(last_modified) = object.last_modified() {
                            if last_modified < &after_date {
                                continue;
                            }
                        }
                    }
                    
                    // Determine MIME type (simple heuristic)
                    let mime = if key.contains('.') {
                        let extension = key.split('.').last().unwrap_or("");
                        match extension.to_lowercase().as_str() {
                            "jpg" | "jpeg" => "image/jpeg",
                            "png" => "image/png",
                            "gif" => "image/gif",
                            "webp" => "image/webp",
                            "mp4" => "video/mp4",
                            "mov" => "video/quicktime",
                            "avi" => "video/x-msvideo",
                            "mp3" => "audio/mpeg",
                            "wav" => "audio/wav",
                            "pdf" => "application/pdf",
                            _ => "application/octet-stream",
                        }.to_string()
                    } else {
                        "application/octet-stream".to_string()
                    };
                    
                    // Apply MIME filter
                    if mime_filter != "*/*" && !matches_mime(&mime, mime_filter) {
                        continue;
                    }
                    
                    let record = InventoryRecord {
                        key: key.to_string(),
                        etag: object.e_tag().unwrap_or("\"\"").trim('"').to_string(),
                        size,
                        last_modified: object.last_modified().unwrap_or(&chrono::DateTime::from_timestamp(0, 0).unwrap()).clone(),
                        storage_class: object.storage_class().unwrap_or("STANDARD").to_string(),
                        mime,
                    };
                    
                    records.push(record);
                    
                    // Check limit
                    if let Some(limit_count) = limit {
                        if records.len() >= limit_count {
                            break;
                        }
                    }
                }
            }
            
            continuation_token = response.next_continuation_token().map(|s| s.to_string());
            if continuation_token.is_none() {
                break;
            }
        }
        
        // Check limit after each prefix
        if let Some(limit_count) = limit {
            if records.len() >= limit_count {
                break;
            }
        }
    }
    
    info!("Collected {} inventory records from S3", records.len());
    Ok(records)
}

fn matches_mime(actual: &str, filter: &str) -> bool {
    if filter == "*/*" {
        return true;
    }
    
    if filter.ends_with("/*") {
        let filter_prefix = &filter[..filter.len()-2];
        actual.starts_with(filter_prefix)
    } else {
        actual == filter
    }
}

pub async fn collect_from_filesystem(
    prefixes: &[String],
    exclude_prefixes: &[String],
    min_size: Option<u64>,
    max_size: Option<u64>,
    mime_filter: &str,
    after: Option<DateTime<Utc>>,
    limit: Option<usize>,
) -> Result<Vec<InventoryRecord>> {
    use std::path::Path;
    use tokio::fs;
    
    info!("Collecting inventory from filesystem paths: {:?}", prefixes);
    
    let mut records = Vec::new();
    
    for prefix in prefixes {
        let path = Path::new(prefix);
        
        if path.is_file() {
            // Single file
            if let Ok(record) = create_file_record(path, exclude_prefixes, min_size, max_size, mime_filter, after).await {
                records.push(record);
            }
        } else if path.is_dir() {
            // Directory - walk recursively
            let mut entries = fs::read_dir(path).await?;
            while let Some(entry) = entries.next_entry().await? {
                let entry_path = entry.path();
                if entry_path.is_file() {
                    if let Ok(record) = create_file_record(&entry_path, exclude_prefixes, min_size, max_size, mime_filter, after).await {
                        records.push(record);
                        
                        // Check limit
                        if let Some(limit_count) = limit {
                            if records.len() >= limit_count {
                                break;
                            }
                        }
                    }
                }
            }
        }
        
        // Check limit after each prefix
        if let Some(limit_count) = limit {
            if records.len() >= limit_count {
                break;
            }
        }
    }
    
    info!("Collected {} inventory records from filesystem", records.len());
    Ok(records)
}

async fn create_file_record(
    path: &Path,
    exclude_prefixes: &[String],
    min_size: Option<u64>,
    max_size: Option<u64>,
    mime_filter: &str,
    after: Option<DateTime<Utc>>,
) -> Result<InventoryRecord> {
    use tokio::fs;
    use std::time::SystemTime;
    
    let metadata = fs::metadata(path).await?;
    let size = metadata.len();
    
    // Check size filters
    if let Some(min) = min_size {
        if size < min {
            return Err(anyhow::anyhow!("File too small"));
        }
    }
    if let Some(max) = max_size {
        if size > max {
            return Err(anyhow::anyhow!("File too large"));
        }
    }
    
    // Check exclude prefixes
    let path_str = path.to_string_lossy();
    if exclude_prefixes.iter().any(|exclude| path_str.starts_with(exclude)) {
        return Err(anyhow::anyhow!("Path excluded"));
    }
    
    // Get modification time
    let modified = metadata.modified()
        .with_context(|| "Failed to get file modification time")?;
    let last_modified: chrono::DateTime<chrono::Utc> = modified.into();
    
    // Check date filter
    if let Some(after_date) = after {
        if last_modified < after_date {
            return Err(anyhow::anyhow!("File too old"));
        }
    }
    
    // Determine MIME type
    let mime = if let Some(extension) = path.extension() {
        match extension.to_string_lossy().to_lowercase().as_str() {
            "jpg" | "jpeg" => "image/jpeg",
            "png" => "image/png",
            "gif" => "image/gif",
            "webp" => "image/webp",
            "mp4" => "video/mp4",
            "mov" => "video/quicktime",
            "avi" => "video/x-msvideo",
            "mp3" => "audio/mpeg",
            "wav" => "audio/wav",
            "pdf" => "application/pdf",
            _ => "application/octet-stream",
        }.to_string()
    } else {
        "application/octet-stream".to_string()
    };
    
    // Apply MIME filter
    if !matches_mime(&mime, mime_filter) {
        return Err(anyhow::anyhow!("MIME type filtered"));
    }
    
    // Generate ETag (simple hash of size and modification time)
    let etag_input = format!("{}:{}", size, last_modified.timestamp());
    let etag_hash = sha2::Sha256::digest(etag_input.as_bytes());
    let etag = format!("\"{}\"", hex::encode(etag_hash));
    
    Ok(InventoryRecord {
        key: path_str.to_string(),
        etag,
        size,
        last_modified,
        storage_class: "FILE".to_string(),
        mime,
    })
}

pub async fn run(args: InventoryArgs) -> Result<()> {
    info!("Starting inventory collection for tenant: {}", args.tenant);
    
    let records = match args.origin {
        OriginType::S3 | OriginType::R2 => {
            collect_from_s3(
                &args.bucket,
                &args.prefix,
                &args.exclude_prefix,
                args.min_size,
                args.max_size,
                &args.mime,
                args.after,
                args.limit,
            ).await?
        }
        OriginType::File => {
            collect_from_filesystem(
                &args.prefix,
                &args.exclude_prefix,
                args.min_size,
                args.max_size,
                &args.mime,
                args.after,
                args.limit,
            ).await?
        }
    };
    
    // Write inventory records
    write_inventory(&records, &args.output).await?;
    
    info!("Collected {} inventory records", records.len());
    Ok(())
}

async fn collect_from_s3(args: &InventoryArgs) -> Result<Vec<InventoryRecord>> {
    info!("Collecting inventory from S3/R2: {}/{}", args.bucket, args.prefix.join("/"));
    
    let config = aws_config::load_defaults(BehaviorVersion::latest()).await;
    let client = Client::new(&config);
    
    let mut records = Vec::new();
    let mut continuation_token = None;
    
    loop {
        let mut list_request = client
            .list_objects_v2()
            .bucket(&args.bucket)
            .max_keys(1000);
        
        // Add prefixes
        for prefix in &args.prefix {
            list_request = list_request.prefix(prefix);
        }
        
        // Add continuation token if we have one
        if let Some(token) = &continuation_token {
            list_request = list_request.continuation_token(token);
        }
        
        let response = list_request.send().await
            .with_context(|| "Failed to list objects")?;
        
        if let Some(objects) = response.contents() {
            for object in objects {
                if let Some(key) = object.key() {
                    // Skip directories
                    if key.ends_with('/') {
                        continue;
                    }
                    
                    // Check exclude prefixes
                    let excluded = args.exclude_prefix.iter()
                        .any(|exclude| key.starts_with(exclude));
                    
                    if excluded {
                        debug!("Skipping excluded key: {}", key);
                        continue;
                    }
                    
                    // Check size constraints
                    if let Some(size) = object.size() {
                        if *size < args.min_size {
                            debug!("Skipping small file: {} ({} bytes)", key, size);
                            continue;
                        }
                        
                        if *size > args.max_size {
                            debug!("Skipping large file: {} ({} bytes)", key, size);
                            continue;
                        }
                    }
                    
                    // Check last modified
                    if let Some(since) = &args.since {
                        if let Some(last_modified) = object.last_modified() {
                            if !should_include_object(last_modified, since)? {
                                debug!("Skipping old file: {}", key);
                                continue;
                            }
                        }
                    }
                    
                    // Create inventory record
                    let record = InventoryRecord {
                        key: key.clone(),
                        etag: object.etag().unwrap_or("").to_string(),
                        size: object.size().unwrap_or(0),
                        last_modified: object.last_modified().unwrap_or(&chrono::DateTime::from_timestamp(0, 0).unwrap()).clone(),
                        storage_class: object.storage_class().unwrap_or("STANDARD").to_string(),
                        mime: infer_mime_type(key),
                    };
                    
                    // Check MIME allow list
                    if !args.mime_allow.is_empty() && !args.mime_allow.iter().any(|allowed| record.mime.contains(allowed)) {
                        debug!("Skipping disallowed MIME type: {} ({})", key, record.mime);
                        continue;
                    }
                    
                    records.push(record);
                }
            }
        }
        
        // Check if we have more pages
        if response.next_continuation_token().is_some() {
            continuation_token = response.next_continuation_token().map(|s| s.to_string());
        } else {
            break;
        }
    }
    
    Ok(records)
}

async fn collect_from_filesystem(args: &InventoryArgs) -> Result<Vec<InventoryRecord>> {
    info!("Collecting inventory from filesystem");
    
    let mut records = Vec::new();
    
    for prefix in &args.prefix {
        let path = std::path::Path::new(prefix);
        
        if path.is_file() {
            // Single file
            let record = create_file_record(path).await?;
            if should_include_record(&record, args) {
                records.push(record);
            }
        } else {
            // Directory - walk recursively
            let mut entries = tokio::fs::read_dir(path).await?;
            
            while let Some(entry) = entries.next().await {
                let entry = entry.with_context(|| "Failed to read directory entry")?;
                let path = entry.path();
                
                if path.is_file() {
                    if let Ok(record) = create_file_record(&path).await {
                        if should_include_record(&record, args) {
                            records.push(record);
                        }
                    }
                }
            }
        }
    }
    
    Ok(records)
}

async fn create_file_record(path: &std::path::Path) -> Result<InventoryRecord> {
    let metadata = tokio::fs::metadata(path).await
        .with_context(|| format!("Failed to get metadata for: {:?}", path))?;
    
    let modified = metadata.modified()
        .with_context(|| "Failed to get modification time")?;
    
    let last_modified: DateTime<Utc> = modified.into();
    
    Ok(InventoryRecord {
        key: path.to_string_lossy().to_string(),
        etag: format!("{:x}", metadata.len()), // Simple hash for local files
        size: metadata.len(),
        last_modified,
        storage_class: "FILE".to_string(),
        mime: infer_mime_type(&path.to_string_lossy()),
    })
}

fn should_include_record(record: &InventoryRecord, args: &InventoryArgs) -> bool {
    // Check size constraints
    if record.size < args.min_size {
        return false;
    }
    
    if record.size > args.max_size {
        return false;
    }
    
    // Check exclude prefixes
    let excluded = args.exclude_prefix.iter()
        .any(|exclude| record.key.starts_with(exclude));
    
    if excluded {
        return false;
    }
    
    // Check MIME allow list
    if !args.mime_allow.is_empty() && !args.mime_allow.iter().any(|allowed| record.mime.contains(allowed)) {
        return false;
    }
    
    true
}

fn should_include_object(last_modified: &chrono::DateTime<chrono::Utc>, since: &str) -> Result<bool> {
    let cutoff = if since.ends_with('d') {
        // Days ago
        let days: i64 = since.trim_end_matches('d').parse()
            .with_context(|| format!("Invalid days format: {}", since))?;
        Utc::now() - chrono::Duration::days(days)
    } else {
        // ISO8601 timestamp
        DateTime::parse_from_rfc3339(since)
            .with_context(|| format!("Invalid ISO8601 timestamp: {}", since))?
            .with_timezone(&Utc)
    };
    
    Ok(last_modified > &cutoff)
}

async fn write_inventory(records: &[InventoryRecord], output: &PathBuf) -> Result<()> {
    info!("Writing {} inventory records to {:?}", records.len(), output);
    
    // Create parent directory if it doesn't exist
    if let Some(parent) = output.parent() {
        tokio::fs::create_dir_all(parent).await
            .with_context(|| format!("Failed to create directory: {:?}", parent))?;
    }
    
    let mut file = File::create(output).await
        .with_context(|| format!("Failed to create file: {:?}", output))?;
    
    for record in records {
        let line = serde_json::to_string(record)
            .with_context(|| "Failed to serialize inventory record")?;
        
        file.write_all(line.as_bytes()).await
            .with_context(|| "Failed to write inventory record")?;
        
        file.write_all(b"\n").await
            .with_context(|| "Failed to write newline")?;
    }
    
    file.flush().await
        .with_context(|| "Failed to flush inventory file")?;
    
    Ok(())
}

fn infer_mime_type(key: &str) -> String {
    let extension = std::path::Path::new(key)
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("");
    
    match extension.to_lowercase().as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        "mp4" => "video/mp4",
        "mov" => "video/quicktime",
        "avi" => "video/x-msvideo",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        _ => "application/octet-stream",
    }.to_string()
}
