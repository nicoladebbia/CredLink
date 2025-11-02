//! Key Custody CLI
//! 
//! Command-line interface for managing signing keys, policies, and rotations

use anyhow::{Context, Result};
use chrono::{DateTime, Utc, Duration};
use clap::{Parser, Subcommand};
use serde_json;
use std::path::PathBuf;
use tracing::{info, error, debug, warn};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use keyctl::{PolicyManager, SigningPolicy, KeyConfig, KeyType, RotationCalendar, RotationStatus};

/// CLI configuration
#[derive(Parser, Debug)]
#[command(name = "keyctl")]
#[command(about = "Key custody control plane for C2 Concierge")]
pub struct Cli {
    /// Database URL for policy storage
    #[arg(long, default_value = "sqlite:keyctl.db")]
    pub database_url: String,
    
    /// Output format (json|yaml|table)
    #[arg(long, default_value = "json")]
    pub output_format: String,
    
    #[command(subcommand)]
    pub command: Commands,
}

/// Available commands
#[derive(Subcommand, Debug)]
pub enum Commands {
    /// Show tenant status and key information
    Status {
        /// Tenant ID
        #[arg(long)]
        tenant: String,
    },
    
    /// Create or update signing policy
    PolicySet {
        /// Policy file path
        #[arg(long)]
        file: PathBuf,
    },
    
    /// Get signing policy
    PolicyGet {
        /// Tenant ID
        #[arg(long)]
        tenant: String,
    },
    
    /// List all tenants
    ListTenants,
    
    /// Plan key rotation
    RotatePlan {
        /// Tenant ID
        #[arg(long)]
        tenant: String,
        
        /// Target rotation date (ISO8601)
        #[arg(long)]
        target: String,
        
        /// Rotation owner
        #[arg(long, default_value = "ops")]
        owner: String,
        
        /// Require approval
        #[arg(long)]
        require_approval: bool,
    },
    
    /// Execute rotation cutover
    RotateCutover {
        /// Tenant ID
        #[arg(long)]
        tenant: String,
        
        /// New key handle
        #[arg(long)]
        new_handle: String,
        
        /// Force cutover (bypass approval)
        #[arg(long)]
        force: bool,
    },
    
    /// Generate Rotation Evidence Pack
    Rep {
        /// Tenant ID
        #[arg(long)]
        tenant: String,
        
        /// Output directory
        #[arg(long, default_value = "./rep-output")]
        output_dir: PathBuf,
        
        /// Include HSM attestation
        #[arg(long)]
        include_attestation: bool,
    },
    
    /// Start rotation scheduler
    SchedulerStart {
        /// Check interval in seconds
        #[arg(long, default_value = "60")]
        check_interval: u64,
        
        /// Max concurrent rotations
        #[arg(long, default_value = "5")]
        max_concurrent: usize,
    },
    
    /// Get scheduler status
    SchedulerStatus,
    
    /// List rotation calendar
    CalendarList {
        /// Days ahead to show
        #[arg(long, default_value = "30")]
        days: u32,
        
        /// Output format
        #[arg(long, default_value = "table")]
        format: String,
    },
    
    /// Pause signing for tenant
    Pause {
        /// Tenant ID
        #[arg(long)]
        tenant: String,
        
        /// Reason for pause
        #[arg(long)]
        reason: String,
    },
    
    /// Resume signing for tenant
    Resume {
        /// Tenant ID
        #[arg(long)]
        tenant: String,
    },
    
    /// Start incident monitor
    IncidentMonitorStart {
        /// Health check interval in seconds
        #[arg(long, default_value = "60")]
        check_interval: u64,
        
        /// Enable anomaly detection
        #[arg(long)]
        anomaly_detection: bool,
        
        /// Enable compliance monitoring
        #[arg(long)]
        compliance_monitoring: bool,
    },
    
    /// Get incident monitor status
    IncidentMonitorStatus,
    
    /// List active incidents
    IncidentList {
        /// Output format
        #[arg(long, default_value = "table")]
        format: String,
    },
    
    /// Create incident manually
    IncidentCreate {
        /// Tenant ID
        #[arg(long)]
        tenant: String,
        
        /// Incident type
        #[arg(long)]
        incident_type: String,
        
        /// Severity level
        #[arg(long)]
        severity: String,
        
        /// Description
        #[arg(long)]
        description: String,
    },
    
    /// Resolve incident
    IncidentResolve {
        /// Incident ID
        #[arg(long)]
        incident_id: String,
        
        /// Resolution note
        #[arg(long)]
        resolution_note: String,
    },
    
    /// Trigger emergency rotation
    EmergencyRotation {
        /// Tenant ID
        #[arg(long)]
        tenant: String,
        
        /// Reason for emergency rotation
        #[arg(long)]
        reason: String,
    },
    
    /// Get incident metrics
    IncidentMetrics,
    
    /// Start incident response
    IncidentStart {
        /// Tenant ID
        #[arg(long)]
        tenant: String,
        
        /// Trigger reason
        #[arg(long)]
        reason: String,
        
        /// Time window to investigate (e.g., "7d", "24h")
        #[arg(long, default_value = "7d")]
        since: String,
    },
    
    /// Show upcoming rotations
    UpcomingRotations {
        /// Days ahead to show
        #[arg(long, default_value = "30")]
        days: u32,
    },
    
    /// Health check for backends
    Health,
}

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::try_from_default_env()
            .unwrap_or_else(|_| "keyctl=info".into()))
        .with(tracing_subscriber::fmt::layer())
        .init();
    
    let cli = Cli::parse();
    
    // Initialize policy manager
    let policy_manager = PolicyManager::new(&cli.database_url).await
        .context("Failed to initialize policy manager")?;
    
    // Execute command
    match cli.command {
        Commands::Status { tenant } => {
            cmd_status(&policy_manager, &tenant).await?;
        }
        Commands::PolicySet { file } => {
            cmd_policy_set(&policy_manager, &file).await?;
        }
        Commands::PolicyGet { tenant } => {
            cmd_policy_get(&policy_manager, &tenant, &cli.output_format).await?;
        }
        Commands::ListTenants => {
            cmd_list_tenants(&policy_manager, &cli.output_format).await?;
        }
        Commands::RotatePlan { tenant, target, owner, require_approval } => {
            cmd_rotate_plan(&policy_manager, &tenant, &target, &owner, require_approval).await?;
        }
        Commands::RotateCutover { tenant, new_handle, force } => {
            cmd_rotate_cutover(&policy_manager, &tenant, &new_handle, force).await?;
        }
        Commands::Rep { tenant, output_dir, include_attestation } => {
            cmd_generate_rep(&policy_manager, &tenant, &output_dir, include_attestation).await?;
        }
        Commands::SchedulerStart { check_interval, max_concurrent } => {
            cmd_start_scheduler(&policy_manager, check_interval, max_concurrent).await?;
        }
        Commands::SchedulerStatus => {
            cmd_scheduler_status(&policy_manager).await?;
        }
        Commands::CalendarList { days, format } => {
            cmd_list_calendar(&policy_manager, days, &format).await?;
        }
        Commands::IncidentMonitorStart { check_interval, anomaly_detection, compliance_monitoring } => {
            cmd_incident_monitor_start(&policy_manager, check_interval, anomaly_detection, compliance_monitoring).await?;
        }
        Commands::IncidentMonitorStatus => {
            cmd_incident_monitor_status(&policy_manager).await?;
        }
        Commands::IncidentList { format } => {
            cmd_incident_list(&policy_manager, &format).await?;
        }
        Commands::IncidentCreate { tenant, incident_type, severity, description } => {
            cmd_incident_create(&policy_manager, &tenant, &incident_type, &severity, &description).await?;
        }
        Commands::IncidentResolve { incident_id, resolution_note } => {
            cmd_incident_resolve(&policy_manager, &incident_id, &resolution_note).await?;
        }
        Commands::EmergencyRotation { tenant, reason } => {
            cmd_emergency_rotation(&policy_manager, &tenant, &reason).await?;
        }
        Commands::IncidentMetrics => {
            cmd_incident_metrics(&policy_manager).await?;
        }
        Commands::Pause { tenant, reason } => {
            cmd_pause_signing(&policy_manager, &tenant, &reason).await?;
        }
        Commands::Resume { tenant } => {
            cmd_resume_signing(&policy_manager, &tenant).await?;
        }
        Commands::IncidentStart { tenant, reason, since } => {
            cmd_incident_start(&policy_manager, &tenant, &reason, &since).await?;
        }
        Commands::UpcomingRotations { days } => {
            cmd_upcoming_rotations(&policy_manager, days).await?;
        }
        Commands::Health => {
            cmd_health_check().await?;
        }
    }
    
    Ok(())
}

/// Show tenant status
async fn cmd_status(policy_manager: &PolicyManager, tenant_id: &str) -> Result<()> {
    info!("Getting status for tenant: {}", tenant_id);
    
    let policy = policy_manager.get_policy(tenant_id).await?;
    
    if let Some(policy) = policy {
        println!("Tenant: {}", policy.tenant_id);
        println!("Algorithm: {}", policy.algorithm);
        println!("Key Type: {:?}", policy.key.key_type);
        println!("Provider: {}", policy.key.provider);
        println!("Handle: {}", policy.key.handle);
        println!("Sign Enabled: {}", policy.key.sign_enabled);
        println!("Certificate Valid: {} to {}", 
            policy.key.not_before.format("%Y-%m-%d"),
            policy.key.not_after.format("%Y-%m-%d"));
        println!("Rotation Every: {} days", policy.key.rotate_every_days);
        println!("Policy Hash: {}", policy.policy_hash);
        
        // Check upcoming rotation
        let upcoming = policy_manager.get_upcoming_rotations(30).await?;
        if let Some(rotation) = upcoming.iter().find(|r| r.tenant_id == tenant_id) {
            println!("Next Rotation: {} (window: {} to {})",
                rotation.scheduled_rotation.format("%Y-%m-%d"),
                rotation.rotation_window_start.format("%Y-%m-%d"),
                rotation.rotation_window_end.format("%Y-%m-%d"));
        }
    } else {
        println!("No policy found for tenant: {}", tenant_id);
    }
    
    Ok(())
}

/// Set signing policy
async fn cmd_policy_set(policy_manager: &PolicyManager, file_path: &PathBuf) -> Result<()> {
    info!("Setting policy from file: {:?}", file_path);
    
    let policy_content = tokio::fs::read_to_string(file_path).await
        .context("Failed to read policy file")?;
    
    let mut policy: SigningPolicy = serde_json::from_str(&policy_content)
        .context("Failed to parse policy JSON")?;
    
    // Validate policy
    keyctl::PolicyValidator::validate_policy(&policy)?;
    
    // Generate policy hash
    policy.policy_hash = keyctl::PolicyValidator::generate_policy_hash(&policy)?;
    
    // Set timestamps
    policy.updated_at = Utc::now();
    if policy.created_at.timestamp() == 0 {
        policy.created_at = Utc::now();
    }
    
    // Store policy
    policy_manager.upsert_policy(&policy).await?;
    
    println!("Policy set for tenant: {}", policy.tenant_id);
    println!("Policy hash: {}", policy.policy_hash);
    
    Ok(())
}

/// Get signing policy
async fn cmd_policy_get(
    policy_manager: &PolicyManager, 
    tenant_id: &str, 
    output_format: &str
) -> Result<()> {
    debug!("Getting policy for tenant: {}", tenant_id);
    
    let policy = policy_manager.get_policy(tenant_id).await?;
    
    if let Some(policy) = policy {
        match output_format {
            "json" => {
                println!("{}", serde_json::to_string_pretty(&policy)?);
            }
            "yaml" => {
                println!("{}", serde_yaml::to_string(&policy)?);
            }
            _ => {
                anyhow::bail!("Unsupported output format: {}", output_format);
            }
        }
    } else {
        println!("No policy found for tenant: {}", tenant_id);
    }
    
    Ok(())
}

/// List all tenants
async fn cmd_list_tenants(policy_manager: &PolicyManager, output_format: &str) -> Result<()> {
    debug!("Listing all tenants");
    
    let tenants = policy_manager.list_tenants().await?;
    
    match output_format {
        "json" => {
            println!("{}", serde_json::to_string_pretty(&tenants)?);
        }
        "yaml" => {
            println!("{}", serde_yaml::to_string(&tenants)?);
        }
        "table" => {
            println!("Tenants:");
            for tenant in tenants {
                println!("  {}", tenant);
            }
        }
        _ => {
            anyhow::bail!("Unsupported output format: {}", output_format);
        }
    }
    
    Ok(())
}

/// Plan rotation
async fn cmd_rotate_plan(
    policy_manager: &PolicyManager,
    tenant_id: &str,
    target_date: &str,
    owner: &str,
    require_approval: bool,
) -> Result<()> {
    info!("Planning rotation for tenant: {}", tenant_id);
    
    let target_rotation: DateTime<Utc> = target_date.parse()
        .context("Failed to parse target date")?;
    
    // Create rotation engine
    let rotation_config = keyctl::rotation_engine::RotationEngineConfig {
        approval_required: require_approval,
        canary_count: 100,
        cutover_timeout_minutes: 30,
        rollback_enabled: true,
        notification_webhook: None,
    };
    
    let rotation_engine = keyctl::rotation_engine::RotationEngine::new(
        std::sync::Arc::new(policy_manager.clone()),
        rotation_config,
    );
    
    // Schedule rotation
    let rotation_id = rotation_engine.schedule_rotation(
        tenant_id,
        target_rotation,
        owner,
    ).await?;
    
    println!("Rotation planned successfully:");
    println!("  Tenant: {}", tenant_id);
    println!("  Rotation ID: {}", rotation_id);
    println!("  Target date: {}", target_rotation.format("%Y-%m-%d %H:%M:%S UTC"));
    println!("  Owner: {}", owner);
    println!("  Requires approval: {}", require_approval);
    
    Ok(())
}

/// Execute rotation cutover
async fn cmd_rotate_cutover(
    policy_manager: &PolicyManager,
    tenant_id: &str,
    new_handle: &str,
    force: bool,
) -> Result<()> {
    warn!("Executing rotation cutover for tenant: {}", tenant_id);
    
    // Create rotation engine
    let rotation_config = keyctl::rotation_engine::RotationEngineConfig {
        approval_required: false,
        canary_count: 100,
        cutover_timeout_minutes: 30,
        rollback_enabled: true,
        notification_webhook: None,
    };
    
    let rotation_engine = keyctl::rotation_engine::RotationEngine::new(
        std::sync::Arc::new(policy_manager.clone()),
        rotation_config,
    );
    
    // Get active rotations for tenant
    let active_rotations = rotation_engine.list_active_rotations().await?;
    let tenant_rotation = active_rotations.iter()
        .find(|r| r.tenant_id == tenant_id);
    
    if let Some(rotation) = tenant_rotation {
        if !force && rotation.state != keyctl::rotation_engine::RotationState::ReadyForCutover {
            anyhow::bail!("Rotation not ready for cutover. Current state: {:?}", rotation.state);
        }
    } else if !force {
        anyhow::bail!("No active rotation found for tenant. Use --force to bypass.");
    }
    
    let mut policy = policy_manager.get_policy(tenant_id).await?
        .context("No policy found for tenant")?;
    
    // Update key handle
    policy.key.handle = new_handle.to_string();
    policy.updated_at = Utc::now();
    
    // Regenerate policy hash
    policy.policy_hash = keyctl::PolicyValidator::generate_policy_hash(&policy)?;
    
    // Store updated policy
    policy_manager.upsert_policy(&policy).await?;
    
    println!("Rotation cutover completed for tenant: {}", tenant_id);
    println!("New key handle: {}", new_handle);
    println!("New policy hash: {}", policy.policy_hash);
    
    Ok(())
}

/// Generate Rotation Evidence Pack
async fn cmd_generate_rep(
    policy_manager: &PolicyManager,
    tenant_id: &str,
    output_dir: &PathBuf,
    include_attestation: bool,
) -> Result<()> {
    info!("Generating REP for tenant: {}", tenant_id);
    
    let policy = policy_manager.get_policy(tenant_id).await?
        .context("No policy found for tenant")?;
    
    // Create REP generator
    let rep_config = keyctl::rep_generator::REPGeneratorConfig {
        output_directory: output_dir.clone(),
        include_attestation,
        canary_count: 100,
        sign_with_ops_key: false, // TODO: Make configurable
        ops_key_id: None,
    };
    
    let rep_generator = keyctl::rep_generator::REPGenerator::new(
        policy_manager.clone(), // Note: This would need to implement Clone
        rep_config
    );
    
    // Generate REP
    let rep = rep_generator.generate_rep(
        tenant_id,
        Utc::now(),
        Some(&policy.key.handle) // Use current key as "new" key for demo
    ).await?;
    
    println!("REP generated for tenant: {}", tenant_id);
    println!("Pack ID: {}", rep.pack_id);
    println!("Files generated: {}", rep.files.len());
    println!("Pack hash: {}", rep.pack_hash);
    
    // List generated files
    println!("\nGenerated files:");
    for file in rep.files {
        println!("  {} ({})", file.filename, file.description);
    }
    
    Ok(())
}

/// Pause signing
async fn cmd_pause_signing(
    policy_manager: &PolicyManager,
    tenant_id: &str,
    reason: &str,
) -> Result<()> {
    warn!("Pausing signing for tenant: {} - Reason: {}", tenant_id, reason);
    
    let mut policy = policy_manager.get_policy(tenant_id).await?
        .context("No policy found for tenant")?;
    
    policy.key.sign_enabled = false;
    policy.updated_at = Utc::now();
    policy.policy_hash = keyctl::PolicyValidator::generate_policy_hash(&policy)?;
    
    policy_manager.upsert_policy(&policy).await?;
    
    println!("Signing paused for tenant: {}", tenant_id);
    println!("Reason: {}", reason);
    
    Ok(())
}

/// Resume signing
async fn cmd_resume_signing(policy_manager: &PolicyManager, tenant_id: &str) -> Result<()> {
    info!("Resuming signing for tenant: {}", tenant_id);
    
    let mut policy = policy_manager.get_policy(tenant_id).await?
        .context("No policy found for tenant")?;
    
    policy.key.sign_enabled = true;
    policy.updated_at = Utc::now();
    policy.policy_hash = keyctl::PolicyValidator::generate_policy_hash(&policy)?;
    
    policy_manager.upsert_policy(&policy).await?;
    
    println!("Signing resumed for tenant: {}", tenant_id);
    
    Ok(())
}

/// Start rotation scheduler
async fn cmd_start_scheduler(
    policy_manager: &PolicyManager,
    check_interval: u64,
    max_concurrent: usize,
) -> Result<()> {
    info!("Starting rotation scheduler");
    
    // Create rotation engine
    let rotation_config = keyctl::rotation_engine::RotationEngineConfig {
        approval_required: false,
        canary_count: 100,
        cutover_timeout_minutes: 30,
        rollback_enabled: true,
        notification_webhook: None,
    };
    
    let rotation_engine = std::sync::Arc::new(
        keyctl::rotation_engine::RotationEngine::new(
            std::sync::Arc::new(policy_manager.clone()),
            rotation_config,
        )
    );
    
    // Create scheduler
    let scheduler_config = keyctl::rotation_scheduler::SchedulerConfig {
        check_interval_seconds: check_interval,
        rotation_window_days: 30,
        advance_warning_days: 7,
        max_concurrent_rotations: max_concurrent,
        auto_approve_rotations: false,
    };
    
    let scheduler = keyctl::rotation_scheduler::RotationScheduler::new(
        std::sync::Arc::new(policy_manager.clone()),
        rotation_engine,
        scheduler_config,
    );
    
    // Start scheduler
    scheduler.start().await?;
    
    println!("Rotation scheduler started:");
    println!("  Check interval: {} seconds", check_interval);
    println!("  Max concurrent rotations: {}", max_concurrent);
    println!("  Rotation window: 30 days");
    println!("  Warning period: 7 days");
    
    // Keep running until interrupted
    println!("Scheduler running... Press Ctrl+C to stop");
    
    // Set up signal handler for graceful shutdown
    tokio::signal::ctrl_c().await?;
    
    println!("Stopping scheduler...");
    scheduler.stop().await?;
    println!("Scheduler stopped");
    
    Ok(())
}

/// Get scheduler status
async fn cmd_scheduler_status(policy_manager: &PolicyManager) -> Result<()> {
    info!("Getting scheduler status");
    
    // Create rotation engine and scheduler for status check
    let rotation_config = keyctl::rotation_engine::RotationEngineConfig {
        approval_required: false,
        canary_count: 100,
        cutover_timeout_minutes: 30,
        rollback_enabled: true,
        notification_webhook: None,
    };
    
    let rotation_engine = std::sync::Arc::new(
        keyctl::rotation_engine::RotationEngine::new(
            std::sync::Arc::new(policy_manager.clone()),
            rotation_config,
        )
    );
    
    let scheduler_config = keyctl::rotation_scheduler::SchedulerConfig {
        check_interval_seconds: 60,
        rotation_window_days: 30,
        advance_warning_days: 7,
        max_concurrent_rotations: 5,
        auto_approve_rotations: false,
    };
    
    let scheduler = keyctl::rotation_scheduler::RotationScheduler::new(
        std::sync::Arc::new(policy_manager.clone()),
        rotation_engine,
        scheduler_config,
    );
    
    let status = scheduler.get_status().await?;
    
    println!("Scheduler Status:");
    println!("  Running: {}", status.is_running);
    println!("  Last check: {}", status.last_check.format("%Y-%m-%d %H:%M:%S UTC"));
    println!("  Next check: {}", status.next_check.format("%Y-%m-%d %H:%M:%S UTC"));
    println!("  Active rotations: {}", status.active_rotations);
    println!("  Upcoming rotations: {}", status.upcoming_rotations);
    println!("  Total tenants: {}", status.total_tenants);
    
    Ok(())
}

/// Start incident monitor
async fn cmd_incident_monitor_start(
    policy_manager: &PolicyManager,
    check_interval: u64,
    anomaly_detection: bool,
    compliance_monitoring: bool,
) -> Result<()> {
    info!("Starting incident monitor");
    
    // Create rotation engine
    let rotation_config = keyctl::rotation_engine::RotationEngineConfig {
        approval_required: false,
        canary_count: 100,
        cutover_timeout_minutes: 30,
        rollback_enabled: true,
        notification_webhook: None,
    };
    
    let rotation_engine = std::sync::Arc::new(
        keyctl::rotation_engine::RotationEngine::new(
            std::sync::Arc::new(policy_manager.clone()),
            rotation_config,
        )
    );
    
    // Create incident engine
    let incident_config = keyctl::incident_engine::IncidentEngineConfig {
        auto_escalate: true,
        emergency_rotation_enabled: true,
        mass_resign_threshold: 1000,
        compliance_reporting: true,
        notification_webhook: None,
        rollback_timeout_minutes: 60,
    };
    
    let incident_engine = std::sync::Arc::new(
        keyctl::incident_engine::IncidentEngine::new(
            std::sync::Arc::new(policy_manager.clone()),
            rotation_engine,
            incident_config,
        )
    );
    
    // Create monitor
    let monitor_config = keyctl::incident_monitor::MonitorConfig {
        health_check_interval_seconds: check_interval,
        anomaly_detection_enabled: anomaly_detection,
        compliance_monitoring: compliance_monitoring,
        backend_health_threshold: 0.95,
        signature_rate_threshold: 10,
        error_rate_threshold: 0.05,
    };
    
    let monitor = keyctl::incident_monitor::IncidentMonitor::new(
        std::sync::Arc::new(policy_manager.clone()),
        incident_engine,
        monitor_config,
    );
    
    // Start monitor
    monitor.start().await?;
    
    println!("Incident monitor started:");
    println!("  Check interval: {} seconds", check_interval);
    println!("  Anomaly detection: {}", anomaly_detection);
    println!("  Compliance monitoring: {}", compliance_monitoring);
    
    // Keep running until interrupted
    println!("Monitor running... Press Ctrl+C to stop");
    
    // Set up signal handler for graceful shutdown
    tokio::signal::ctrl_c().await?;
    
    println!("Stopping monitor...");
    monitor.stop().await?;
    println!("Monitor stopped");
    
    Ok(())
}

/// Get incident monitor status
async fn cmd_incident_monitor_status(policy_manager: &PolicyManager) -> Result<()> {
    info!("Getting incident monitor status");
    
    // Create rotation engine and incident engine for status check
    let rotation_config = keyctl::rotation_engine::RotationEngineConfig {
        approval_required: false,
        canary_count: 100,
        cutover_timeout_minutes: 30,
        rollback_enabled: true,
        notification_webhook: None,
    };
    
    let rotation_engine = std::sync::Arc::new(
        keyctl::rotation_engine::RotationEngine::new(
            std::sync::Arc::new(policy_manager.clone()),
            rotation_config,
        )
    );
    
    let incident_config = keyctl::incident_engine::IncidentEngineConfig {
        auto_escalate: true,
        emergency_rotation_enabled: true,
        mass_resign_threshold: 1000,
        compliance_reporting: true,
        notification_webhook: None,
        rollback_timeout_minutes: 60,
    };
    
    let incident_engine = std::sync::Arc::new(
        keyctl::incident_engine::IncidentEngine::new(
            std::sync::Arc::new(policy_manager.clone()),
            rotation_engine,
            incident_config,
        )
    );
    
    let monitor_config = keyctl::incident_monitor::MonitorConfig {
        health_check_interval_seconds: 60,
        anomaly_detection_enabled: true,
        compliance_monitoring: true,
        backend_health_threshold: 0.95,
        signature_rate_threshold: 10,
        error_rate_threshold: 0.05,
    };
    
    let monitor = keyctl::incident_monitor::IncidentMonitor::new(
        std::sync::Arc::new(policy_manager.clone()),
        incident_engine,
        monitor_config,
    );
    
    let status = monitor.get_status().await?;
    
    println!("Incident Monitor Status:");
    println!("  Running: {}", status.is_running);
    println!("  Last health check: {}", status.last_health_check.format("%Y-%m-%d %H:%M:%S UTC"));
    println!("  Next health check: {}", status.next_check.format("%Y-%m-%d %H:%M:%S UTC"));
    println!("  Tenants monitored: {}", status.tenants_monitored);
    println!("  Active incidents: {}", status.active_incidents);
    println!("  Health issues detected: {}", status.health_issues_detected);
    println!("  Anomalies detected: {}", status.anomalies_detected);
    
    Ok(())
}

/// List active incidents
async fn cmd_incident_list(
    policy_manager: &PolicyManager,
    output_format: &str,
) -> Result<()> {
    info!("Listing active incidents");
    
    // Create incident engine to get incidents
    let rotation_config = keyctl::rotation_engine::RotationEngineConfig {
        approval_required: false,
        canary_count: 100,
        cutover_timeout_minutes: 30,
        rollback_enabled: true,
        notification_webhook: None,
    };
    
    let rotation_engine = std::sync::Arc::new(
        keyctl::rotation_engine::RotationEngine::new(
            std::sync::Arc::new(policy_manager.clone()),
            rotation_config,
        )
    );
    
    let incident_config = keyctl::incident_engine::IncidentEngineConfig {
        auto_escalate: true,
        emergency_rotation_enabled: true,
        mass_resign_threshold: 1000,
        compliance_reporting: true,
        notification_webhook: None,
        rollback_timeout_minutes: 60,
    };
    
    let incident_engine = keyctl::incident_engine::IncidentEngine::new(
        std::sync::Arc::new(policy_manager.clone()),
        rotation_engine,
        incident_config,
    );
    
    let incidents = incident_engine.list_active_incidents().await?;
    
    match output_format {
        "json" => {
            println!("{}", serde_json::to_string_pretty(&incidents)?);
        }
        "yaml" => {
            println!("{}", serde_yaml::to_string(&incidents)?);
        }
        "table" => {
            println!("Active Incidents:");
            println!("{:<20} {:<15} {:<10} {:<20} {:<25}", 
                "Tenant", "Type", "Severity", "Status", "Detected");
            println!("{}", "-".repeat(90));
            
            for incident in incidents {
                println!("{:<20} {:<15} {:<10} {:<20} {:<25}",
                    incident.tenant_id,
                    format!("{:?}", incident.incident_type),
                    format!("{:?}", incident.severity),
                    format!("{:?}", incident.status),
                    incident.detected_at.format("%Y-%m-%d %H:%M:%S")
                );
            }
        }
        _ => {
            anyhow::bail!("Unsupported output format: {}", output_format);
        }
    }
    
    Ok(())
}

/// Create incident manually
async fn cmd_incident_create(
    policy_manager: &PolicyManager,
    tenant_id: &str,
    incident_type: &str,
    severity: &str,
    description: &str,
) -> Result<()> {
    info!("Creating incident for tenant: {}", tenant_id);
    
    // Parse incident type
    let incident_type = match incident_type {
        "key-compromise" => keyctl::incident_engine::IncidentType::KeyCompromise,
        "hsm-failure" => keyctl::incident_engine::IncidentType::HSMFailure,
        "backend-outage" => keyctl::incident_engine::IncidentType::BackendOutage,
        "policy-violation" => keyctl::incident_engine::IncidentType::PolicyViolation,
        "security-alert" => keyctl::incident_engine::IncidentType::SecurityAlert,
        "compliance-failure" => keyctl::incident_engine::IncidentType::ComplianceFailure,
        _ => anyhow::bail!("Invalid incident type: {}", incident_type),
    };
    
    // Parse severity
    let severity = match severity {
        "low" => keyctl::incident_engine::IncidentSeverity::Low,
        "medium" => keyctl::incident_engine::IncidentSeverity::Medium,
        "high" => keyctl::incident_engine::IncidentSeverity::High,
        "critical" => keyctl::incident_engine::IncidentSeverity::Critical,
        _ => anyhow::bail!("Invalid severity: {}", severity),
    };
    
    // Create incident engine
    let rotation_config = keyctl::rotation_engine::RotationEngineConfig {
        approval_required: false,
        canary_count: 100,
        cutover_timeout_minutes: 30,
        rollback_enabled: true,
        notification_webhook: None,
    };
    
    let rotation_engine = std::sync::Arc::new(
        keyctl::rotation_engine::RotationEngine::new(
            std::sync::Arc::new(policy_manager.clone()),
            rotation_config,
        )
    );
    
    let incident_config = keyctl::incident_engine::IncidentEngineConfig {
        auto_escalate: true,
        emergency_rotation_enabled: true,
        mass_resign_threshold: 1000,
        compliance_reporting: true,
        notification_webhook: None,
        rollback_timeout_minutes: 60,
    };
    
    let incident_engine = keyctl::incident_engine::IncidentEngine::new(
        std::sync::Arc::new(policy_manager.clone()),
        rotation_engine,
        incident_config,
    );
    
    // Create incident
    let incident_id = incident_engine.detect_incident(
        tenant_id,
        incident_type,
        severity,
        description,
        vec![format!("{}-key", tenant_id)],
    ).await?;
    
    println!("Incident created successfully:");
    println!("  Incident ID: {}", incident_id);
    println!("  Tenant: {}", tenant_id);
    println!("  Type: {:?}", incident_type);
    println!("  Severity: {:?}", severity);
    println!("  Description: {}", description);
    
    Ok(())
}

/// Resolve incident
async fn cmd_incident_resolve(
    policy_manager: &PolicyManager,
    incident_id: &str,
    resolution_note: &str,
) -> Result<()> {
    info!("Resolving incident: {}", incident_id);
    
    // Create incident engine
    let rotation_config = keyctl::rotation_engine::RotationEngineConfig {
        approval_required: false,
        canary_count: 100,
        cutover_timeout_minutes: 30,
        rollback_enabled: true,
        notification_webhook: None,
    };
    
    let rotation_engine = std::sync::Arc::new(
        keyctl::rotation_engine::RotationEngine::new(
            std::sync::Arc::new(policy_manager.clone()),
            rotation_config,
        )
    );
    
    let incident_config = keyctl::incident_engine::IncidentEngineConfig {
        auto_escalate: true,
        emergency_rotation_enabled: true,
        mass_resign_threshold: 1000,
        compliance_reporting: true,
        notification_webhook: None,
        rollback_timeout_minutes: 60,
    };
    
    let incident_engine = keyctl::incident_engine::IncidentEngine::new(
        std::sync::Arc::new(policy_manager.clone()),
        rotation_engine,
        incident_config,
    );
    
    // Resolve incident
    incident_engine.resolve_incident(incident_id, resolution_note).await?;
    
    println!("Incident resolved successfully:");
    println!("  Incident ID: {}", incident_id);
    println!("  Resolution: {}", resolution_note);
    
    Ok(())
}

/// Trigger emergency rotation
async fn cmd_emergency_rotation(
    policy_manager: &PolicyManager,
    tenant_id: &str,
    reason: &str,
) -> Result<()> {
    warn!("Triggering emergency rotation for tenant: {} - {}", tenant_id, reason);
    
    // Create rotation engine
    let rotation_config = keyctl::rotation_engine::RotationEngineConfig {
        approval_required: false,
        canary_count: 10, // Reduced for speed
        cutover_timeout_minutes: 15, // Faster cutover
        rollback_enabled: true,
        notification_webhook: None,
    };
    
    let rotation_engine = keyctl::rotation_engine::RotationEngine::new(
        std::sync::Arc::new(policy_manager.clone()),
        rotation_config,
    );
    
    // Trigger emergency rotation
    let rotation_id = rotation_engine.schedule_rotation(
        tenant_id,
        chrono::Utc::now(), // Immediate
        "emergency-rotation",
    ).await?;
    
    // Execute rotation immediately
    rotation_engine.execute_rotation(&rotation_id).await?;
    
    println!("Emergency rotation completed:");
    println!("  Tenant: {}", tenant_id);
    println!("  Rotation ID: {}", rotation_id);
    println!("  Reason: {}", reason);
    
    Ok(())
}

/// Get incident metrics
async fn cmd_incident_metrics(policy_manager: &PolicyManager) -> Result<()> {
    info!("Getting incident metrics");
    
    // Create incident engine
    let rotation_config = keyctl::rotation_engine::RotationEngineConfig {
        approval_required: false,
        canary_count: 100,
        cutover_timeout_minutes: 30,
        rollback_enabled: true,
        notification_webhook: None,
    };
    
    let rotation_engine = std::sync::Arc::new(
        keyctl::rotation_engine::RotationEngine::new(
            std::sync::Arc::new(policy_manager.clone()),
            rotation_config,
        )
    );
    
    let incident_config = keyctl::incident_engine::IncidentEngineConfig {
        auto_escalate: true,
        emergency_rotation_enabled: true,
        mass_resign_threshold: 1000,
        compliance_reporting: true,
        notification_webhook: None,
        rollback_timeout_minutes: 60,
    };
    
    let incident_engine = keyctl::incident_engine::IncidentEngine::new(
        std::sync::Arc::new(policy_manager.clone()),
        rotation_engine,
        incident_config,
    );
    
    let metrics = incident_engine.get_metrics().await?;
    
    println!("Incident Metrics:");
    println!("  Total incidents: {}", metrics.total_incidents);
    println!("  Active incidents: {}", metrics.active_incidents);
    println!("  Resolved incidents: {}", metrics.resolved_incidents);
    println!("  Emergency rotations: {}", metrics.emergency_rotations);
    println!("  Mass resign operations: {}", metrics.mass_resign_operations);
    println!("  Average resolution time: {:.1} minutes", metrics.average_resolution_time_minutes);
    println!("  Compliance violations: {}", metrics.compliance_violations);
    
    Ok(())
}

/// List rotation calendar
async fn cmd_list_calendar(
    policy_manager: &PolicyManager,
    days_ahead: u32,
    output_format: &str,
) -> Result<()> {
    info!("Listing rotation calendar for next {} days", days_ahead);
    
    let upcoming = policy_manager.get_upcoming_rotations(days_ahead).await?;
    
    match output_format {
        "json" => {
            println!("{}", serde_json::to_string_pretty(&upcoming)?);
        }
        "yaml" => {
            println!("{}", serde_yaml::to_string(&upcoming)?);
        }
        "table" => {
            println!("Rotation Calendar (next {} days):", days_ahead);
            println!("{:<20} {:<25} {:<15} {:<10}", 
                "Tenant", "Scheduled", "Status", "Owner");
            println!("{}", "-".repeat(70));
            
            for rotation in upcoming {
                println!("{:<20} {:<25} {:<15} {:<10}",
                    rotation.tenant_id,
                    rotation.scheduled_rotation.format("%Y-%m-%d %H:%M"),
                    format!("{:?}", rotation.status),
                    rotation.owner
                );
            }
        }
        _ => {
            anyhow::bail!("Unsupported output format: {}", output_format);
        }
    }
    
    Ok(())
}

/// Start incident response
async fn cmd_incident_start(
    policy_manager: &PolicyManager,
    tenant_id: &str,
    reason: &str,
    since: &str,
) -> Result<()> {
    error!("Starting incident response for tenant: {}", tenant_id);
    
    // Parse time window
    let days_ago = if since.ends_with('d') {
        since.trim_end_matches('d').parse::<u64>()?
    } else if since.ends_with('h') {
        since.trim_end_matches('h').parse::<u64>()? / 24
    } else {
        anyhow::bail!("Invalid time format. Use '7d' or '24h'");
    };
    
    // Create incident record
    let incident = keyctl::IncidentRecord {
        incident_id: Uuid::new_v4().to_string(),
        tenant_id: tenant_id.to_string(),
        trigger_reason: reason.to_string(),
        started_at: Utc::now(),
        resolved_at: None,
        status: keyctl::IncidentStatus::Active,
        actions_taken: vec!["Paused signing".to_string()],
        evidence_files: vec![],
        impact_summary: format!("Incident triggered: {}", reason),
    };
    
    policy_manager.create_incident(&incident).await?;
    
    // Pause signing as first action
    cmd_pause_signing(policy_manager, tenant_id, &format!("Incident: {}", reason)).await?;
    
    println!("Incident response started for tenant: {}", tenant_id);
    println!("Incident ID: {}", incident.incident_id);
    println!("Reason: {}", reason);
    println!("Time window: last {} days", days_ago);
    println!("Signing has been paused");
    
    Ok(())
}

/// Show upcoming rotations
async fn cmd_upcoming_rotations(policy_manager: &PolicyManager, days: u32) -> Result<()> {
    info!("Showing rotations in next {} days", days);
    
    let rotations = policy_manager.get_upcoming_rotations(days).await?;
    
    if rotations.is_empty() {
        println!("No upcoming rotations in the next {} days", days);
    } else {
        println!("Upcoming rotations (next {} days):", days);
        for rotation in rotations {
            println!("  Tenant: {}", rotation.tenant_id);
            println!("    Date: {}", rotation.scheduled_rotation.format("%Y-%m-%d"));
            println!("    Window: {} to {}",
                rotation.rotation_window_start.format("%Y-%m-%d"),
                rotation.rotation_window_end.format("%Y-%m-%d"));
            println!("    Owner: {}", rotation.owner);
            println!("    Status: {:?}", rotation.status);
            println!();
        }
    }
    
    Ok(())
}

/// Health check
async fn cmd_health_check() -> Result<()> {
    info!("Performing health check");
    
    println!("Key Custody Control Plane Health:");
    println!("  Service: OK");
    println!("  Database: OK");
    println!("  Timestamp: {}", Utc::now().format("%Y-%m-%d %H:%M:%S UTC"));
    
    // TODO: Check backend connectivity
    println!("  Backends: Not checked (not implemented)");
    
    Ok(())
}
