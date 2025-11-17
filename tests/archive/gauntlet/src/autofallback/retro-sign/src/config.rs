//! Configuration management for C2 Concierge Retro-Sign

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub tenant: TenantConfig,
    pub storage: StorageConfig,
    pub signer: SignerConfig,
    pub performance: PerformanceConfig,
    pub costs: CostConfig,
    pub checkpoint: CheckpointConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TenantConfig {
    pub id: String,
    pub link_base: Option<String>,
    pub preserve_embed_origins: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorageConfig {
    pub bucket: String,
    pub region: String,
    pub endpoint: Option<String>,
    pub access_key_id: Option<String>,
    pub secret_access_key: Option<String>,
    pub prefix: Vec<String>,
    pub inventory_csv: Option<PathBuf>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignerConfig {
    pub url: String,
    pub tsa_profile: String,
    pub timeout_ms: u64,
    pub retries: u32,
    pub batch_size: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformanceConfig {
    pub concurrency: usize,
    pub max_inflight: usize,
    pub min_size: u64,
    pub max_size: u64,
    pub mime_allow: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CostConfig {
    pub egress_cost_per_gb: f64,
    pub tsa_cost_per_timestamp: f64,
    pub cpu_cost_per_hour: f64,
    pub storage_cost_per_gb_month: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CheckpointConfig {
    pub path: PathBuf,
    pub auto_save_interval_secs: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OriginType {
    S3,
    R2,
    File,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        let mut config = Config::default();
        
        // Load from environment variables
        if let Ok(tenant_id) = std::env::var("C2C_TENANT_ID") {
            config.tenant.id = tenant_id;
        }
        
        if let Ok(bucket) = std::env::var("C2C_BUCKET") {
            config.storage.bucket = bucket;
        }
        
        if let Ok(region) = std::env::var("C2C_REGION") {
            config.storage.region = Some(region);
        }
        
        if let Ok(access_key) = std::env::var("C2C_ACCESS_KEY") {
            config.storage.access_key = Some(access_key);
        }
        
        if let Ok(secret_key) = std::env::var("C2C_SECRET_KEY") {
            config.storage.secret_key = Some(secret_key);
        }
        
        if let Ok(signer_url) = std::env::var("C2C_SIGNER_URL") {
            config.signer.url = signer_url;
        }
        
        if let Ok(store_url) = std::env::var("C2C_STORE_URL") {
            config.signer.url = store_url;
        }
        
        Ok(config)
    }
    
    pub fn from_file(path: &PathBuf) -> Result<Self> {
        let content = std::fs::read_to_string(path)
            .with_context(|| format!("Failed to read config file: {:?}", path))?;
        
        let config: Config = toml::from_str(&content)
            .with_context(|| "Failed to parse config file")?;
        
        Ok(config)
    }
    
    pub fn merge_with_args(&mut self, args: &HashMap<String, String>) {
        if let Some(tenant) = args.get("tenant") {
            self.tenant.id = tenant.clone();
        }
        
        if let Some(bucket) = args.get("bucket") {
            self.storage.bucket = bucket.clone();
        }
        
        if let Some(signer_url) = args.get("signer_url") {
            self.signer.url = signer_url.clone();
        }
        
        if let Some(concurrency) = args.get("concurrency") {
            if let Ok(concurrency) = concurrency.parse::<usize>() {
                self.performance.concurrency = concurrency;
            }
        }
        
        if let Some(max_inflight) = args.get("max_inflight") {
            if let Ok(max_inflight) = max_inflight.parse::<usize>() {
                self.performance.max_inflight = max_inflight;
            }
        }
    }
}

impl Default for Config {
    fn default() -> Self {
        Self {
            tenant: TenantConfig {
                id: String::new(),
                link_base: None,
                preserve_embed_origins: Vec::new(),
            },
            storage: StorageConfig::default(),
            signer: SignerConfig {
                url: "http://localhost:8080".to_string(),
                tsa_profile: "std".to_string(),
                timeout_ms: 12000,
                retries: 6,
                batch_size: 32,
            },
            performance: PerformanceConfig {
                concurrency: 256,
                max_inflight: 4096,
                min_size: 1024,
                max_size: 1073741824, // 1GB
                mime_allow: vec![
                    "image/jpeg".to_string(),
                    "image/png".to_string(),
                    "image/webp".to_string(),
                    "image/gif".to_string(),
                ],
            },
            costs: CostConfig {
                egress_cost_per_gb: 0.02,
                tsa_cost_per_timestamp: 0.01,
                cpu_cost_per_hour: 0.05,
                storage_cost_per_gb_month: 0.01,
            },
            checkpoint: CheckpointConfig {
                path: PathBuf::from(".state/c2c-checkpoint.sqlite"),
                auto_save_interval_secs: 30,
            },
        }
    }
}
