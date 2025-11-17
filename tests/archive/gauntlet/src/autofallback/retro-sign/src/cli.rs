//! CLI argument definitions for C2 Concierge Retro-Sign

use clap::{Parser, Subcommand, ValueEnum};
use std::path::PathBuf;

#[derive(Parser, Debug)]
#[command(name = "c2c")]
#[command(about = "C2 Concierge retro-sign CLI", long_about = None)]
#[command(version = env!("CARGO_PKG_VERSION"))]
pub struct Cli {
    /// Log file path (optional, defaults to stdout)
    #[arg(long, short = 'l')]
    pub log_file: Option<PathBuf>,
    
    #[command(subcommand)]
    pub command: Commands,
}

#[derive(Subcommand, Debug)]
pub enum Commands {
    /// Walk keys (or read S3 Inventory CSV), emit object metadata
    Inventory(InventoryArgs),
    
    /// Convert inventory → dedup'd plan (content grouping + cost)
    Plan(PlanArgs),
    
    /// Execute plan: hash → sign → write manifest (remote)
    Run(RunArgs),
    
    /// Continue a previous run from checkpoint
    Resume(ResumeArgs),
    
    /// Stratified sample builder for "first 10k free"
    Sample(SampleArgs),
    
    /// Probe survival on delivery URLs (adds Link if needed in report)
    Verify(VerifyArgs),
    
    /// Build tenant report (HTML + CSV + JSON)
    Report(ReportArgs),
}

#[derive(Parser, Debug)]
pub struct InventoryArgs {
    /// Required. Used for ledger partitioning & keys
    #[arg(long)]
    pub tenant: String,
    
    /// Source type
    #[arg(long, value_enum)]
    pub origin: OriginType,
    
    /// S3/R2 bucket
    #[arg(long)]
    pub bucket: String,
    
    /// Key prefix (repeatable)
    #[arg(long)]
    pub prefix: Vec<String>,
    
    /// Output file for inventory records
    #[arg(long, short = 'o', default_value = "inventory.jsonl")]
    pub output: PathBuf,
    
    /// Use S3 Inventory CSV instead of listing
    #[arg(long)]
    pub inventory_csv: Option<PathBuf>,
    
    /// Filter by last-modified (ISO8601 or days like "30d")
    #[arg(long)]
    pub since: Option<String>,
    
    /// Filter by last-modified date (ISO8601)
    #[arg(long)]
    pub after: Option<String>,
    
    /// MIME filter (e.g., "image/*")
    #[arg(long, default_value = "*/*")]
    pub mime: String,
    
    /// Limit number of objects
    #[arg(long)]
    pub limit: Option<usize>,
    
    /// Skip thumbnails/trash
    #[arg(long, default_value = "1024")]
    pub min_size: u64,
    
    /// Skip huge binaries
    #[arg(long, default_value = "1073741824")] // 1GB
    pub max_size: u64,
    
    /// image/*, video/*, audio/*
    #[arg(long, value_delimiter = ',')]
    pub mime_allow: Vec<String>,
    
    /// Skip paths (CDN derivatives, cache folders)
    #[arg(long)]
    pub exclude_prefix: Vec<String>,
    
    /// Concurrency for listing
    #[arg(long, default_value = "32")]
    pub concurrency: usize,
}

#[derive(Parser, Debug)]
pub struct PlanArgs {
    /// Required. Used for ledger partitioning & keys
    #[arg(long)]
    pub tenant: String,
    
    /// Input inventory file
    #[arg(long, short = 'i')]
    pub input: PathBuf,
    
    /// Write plan.jsonl for audit
    #[arg(long, default_value = "plan.jsonl")]
    pub plan_out: PathBuf,
    
    /// Write ledger.json
    #[arg(long, default_value = "ledger.json")]
    pub ledger_out: PathBuf,
    
    /// Write HTML/CSV summary
    #[arg(long, default_value = "report")]
    pub report_out: PathBuf,
    
    /// Metadata only; no manifest writes or TSA
    #[arg(long)]
    pub dry_run: bool,
    
    /// Sample size for cost estimation
    #[arg(long)]
    pub sample: Option<usize>,
    
    /// Egress cost per GB for ledger calculation
    #[arg(long, default_value = "0.02")]
    pub egress_cost: f64,
    
    /// TSA cost per timestamp
    #[arg(long, default_value = "0.01")]
    pub tsa_cost: f64,
    
    /// CPU cost per hour
    #[arg(long, default_value = "0.05")]
    pub cpu_cost: f64,
    
    /// Storage cost per GB-month
    #[arg(long, default_value = "0.01")]
    pub storage_cost: f64,
    
    /// Manifest base url for Link header in reports
    #[arg(long)]
    pub link_base: Option<String>,
}

#[derive(Parser, Debug)]
pub struct RunArgs {
    /// Required. Used for ledger partitioning & keys
    #[arg(long)]
    pub tenant: String,
    
    /// Input plan file
    #[arg(long, short = 'i')]
    pub input: PathBuf,
    
    /// .state/c2c-checkpoint.sqlite (created if missing)
    #[arg(long, default_value = ".state/c2c-checkpoint.sqlite")]
    pub checkpoint: PathBuf,
    
    /// Default 256 (I/O bound)
    #[arg(long, default_value = "256")]
    pub concurrency: usize,
    
    /// Default 4,096 (backpressure)
    #[arg(long, default_value = "4096")]
    pub max_inflight: usize,
    
    /// Override to embed (repeatable)
    #[arg(long)]
    pub preserve_embed_origin: Vec<String>,
    
    /// "std", "low-latency", "cheap"
    #[arg(long, default_value = "std")]
    pub tsa_profile: String,
    
    /// Signer API endpoint
    #[arg(long, default_value = "http://localhost:8080")]
    pub signer_url: String,
    
    /// Manifest store endpoint
    #[arg(long, default_value = "http://localhost:8081")]
    pub store_url: String,
    
    /// Per object cap (default 12,000ms)
    #[arg(long, default_value = "12000")]
    pub timeout: u64,
    
    /// Default 6 with exp backoff & jitter
    #[arg(long, default_value = "6")]
    pub retries: u32,
    
    /// Hit /verify for a random 1k sample post-write
    #[arg(long)]
    pub verify_after: bool,
    
    /// Write ledger.json
    #[arg(long, default_value = "ledger.json")]
    pub ledger_out: PathBuf,
    
    /// Write HTML/CSV summary
    #[arg(long, default_value = "report")]
    pub report_out: PathBuf,
}

#[derive(Parser, Debug)]
pub struct ResumeArgs {
    /// Continue from last checkpoint
    #[arg(long)]
    pub checkpoint: PathBuf,
    
    /// Hit /verify for a random 1k sample post-write
    #[arg(long)]
    pub verify_after: bool,
}

#[derive(Parser, Debug)]
pub struct SampleArgs {
    /// Required. Used for ledger partitioning & keys
    #[arg(long)]
    pub tenant: String,
    
    /// Source type
    #[arg(long, value_enum)]
    pub origin: OriginType,
    
    /// S3/R2 bucket
    #[arg(long)]
    pub bucket: String,
    
    /// Key prefix (repeatable)
    #[arg(long)]
    pub prefix: Vec<String>,
    
    /// Exclude paths (CDN derivatives, cache folders)
    #[arg(long)]
    pub exclude_prefix: Vec<String>,
    
    /// Sample size
    #[arg(long)]
    pub sample: usize,
    
    /// Stratify by: mime,size,prefix,date
    #[arg(long, value_delimiter = ',', default_value = "mime,size,prefix,date")]
    pub stratify: Vec<String>,
    
    /// Skip thumbnails/trash
    #[arg(long, default_value = "1024")]
    pub min_size: Option<u64>,
    
    /// Skip huge binaries
    #[arg(long, default_value = "1073741824")] // 1GB
    pub max_size: Option<u64>,
    
    /// MIME filter (e.g., "image/*")
    #[arg(long, default_value = "*/*")]
    pub mime: String,
    
    /// Filter by last-modified date (ISO8601)
    #[arg(long)]
    pub after: Option<String>,
    
    /// Limit number of objects
    #[arg(long)]
    pub limit: Option<usize>,
    
    /// Output plan file
    #[arg(long, default_value = "sample-plan.jsonl")]
    pub plan_out: PathBuf,
    
    /// Output ledger
    #[arg(long, default_value = "sample-ledger.json")]
    pub ledger_out: PathBuf,
    
    /// Concurrency for sampling
    #[arg(long, default_value = "64")]
    pub concurrency: usize,
}

#[derive(Parser, Debug)]
pub struct VerifyArgs {
    /// Input ledger or plan file
    #[arg(long, short = 'i')]
    pub input: PathBuf,
    
    /// Sample size for verification
    #[arg(long, default_value = "1000")]
    pub sample: usize,
    
    /// Verification endpoint
    #[arg(long, default_value = "http://localhost:8080")]
    pub verify_url: String,
    
    /// Output report
    #[arg(long, default_value = "verify-report")]
    pub report_out: PathBuf,
    
    /// Timeout per verification
    #[arg(long, default_value = "30000")]
    pub timeout: u64,
}

#[derive(Parser, Debug)]
pub struct ReportArgs {
    /// Input ledger file
    #[arg(long, short = 'i')]
    pub input: PathBuf,
    
    /// Output directory
    #[arg(long, default_value = "report")]
    pub output: PathBuf,
    
    /// Report format
    #[arg(long, value_enum, default_value = "html")]
    pub format: ReportFormat,
}

#[derive(ValueEnum, Clone, Debug)]
pub enum OriginType {
    S3,
    R2,
    File,
}

#[derive(ValueEnum, Clone, Debug)]
pub enum ReportFormat {
    Html,
    Csv,
    Json,
    All,
}
