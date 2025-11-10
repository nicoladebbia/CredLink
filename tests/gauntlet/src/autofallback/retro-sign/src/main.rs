//! C2 Concierge Retro-Sign CLI - Phase 8
//! 
//! High-performance, deterministic retro-signing system for C2PA manifests
//! 
//! Usage: c2c <SUBCOMMAND> [OPTIONS]

use anyhow::{Context, Result};
use clap::{Parser, Subcommand};
use std::path::PathBuf;
use tracing::{error, info, warn};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

mod cli;
mod config;
mod inventory;
mod planner;
mod runner;
mod worklog;
mod ledger;
mod reporter;
mod signer;
mod storage;
mod metrics;
mod checkpoint;
mod sampling;
mod verification;
mod performance;
mod security;
mod health;
mod shutdown;
mod rate_limit;
mod validation;
mod migrations;
mod alerting;
mod circuit_breaker;
mod backup;

use cli::*;

#[tokio::main]
async fn main() -> Result<()> {
    let args = Cli::parse();
    
    // Initialize logging
    init_logging(&args)?;
    
    // Initialize metrics
    metrics::init()
        .with_context(|| "Failed to initialize metrics system")?;
    
    // Initialize performance monitoring
    performance::init_performance_manager()
        .with_context(|| "Failed to initialize performance manager")?;
    
    // Initialize security systems
    security::init_security_manager()
        .with_context(|| "Failed to initialize security manager")?;
    
    // Initialize health monitoring
    health::init_health_manager()
        .with_context(|| "Failed to initialize health manager")?;
    
    // Initialize shutdown manager
    shutdown::init_shutdown_manager()
        .with_context(|| "Failed to initialize shutdown manager")?;
    
    // Initialize rate limiting
    rate_limit::init_rate_limit_manager(rate_limit::RateLimitConfig::default())
        .with_context(|| "Failed to initialize rate limit manager")?;
    
    // Initialize alerting system
    alerting::init_alert_manager()
        .with_context(|| "Failed to initialize alert manager")?;
    
    // Initialize backup system
    backup::init_backup_manager(backup::BackupConfig::default())
        .with_context(|| "Failed to initialize backup manager")?;
    
    info!("C2 Concierge Retro-Sign CLI v{} starting", env!("CARGO_PKG_VERSION"));
    
    // Execute subcommand
    let result = match args.command {
        Commands::Inventory(args) => inventory::run(args).await,
        Commands::Plan(args) => planner::run(args).await,
        Commands::Run(args) => runner::run(args).await,
        Commands::Resume(args) => runner::resume(args).await,
        Commands::Sample(args) => sampling::run(args).await,
        Commands::Verify(args) => verification::run(args).await,
        Commands::Report(args) => reporter::run(args).await,
    };
    
    match result {
        Ok(_) => {
            info!("Command completed successfully");
            std::process::exit(0);
        }
        Err(e) => {
            error!("Command failed: {}", e);
            
            // Determine exit code based on error type
            let exit_code = if e.to_string().contains("partial") {
                10 // Partial success
            } else if e.to_string().contains("misconfig") {
                20 // Fatal misconfiguration
            } else {
                1 // General error
            };
            
            std::process::exit(exit_code);
        }
    }
}

fn init_logging(args: &Cli) -> Result<()> {
    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info"));
    
    let fmt_layer = tracing_subscriber::fmt::layer()
        .with_target(false)
        .with_current_span(false)
        .with_span_list(false);
    
    if let Some(log_file) = &args.log_file {
        let file_appender = tracing_appender::rolling::daily(
            log_file.parent().with_context(|| "Invalid log file parent directory")?, 
            "c2c.log"
        );
        let (non_blocking, _guard) = tracing_appender::non_blocking(file_appender);
        
        tracing_subscriber::registry()
            .with(filter)
            .with(fmt_layer)
            .with(tracing_subscriber::fmt::layer().with_writer(non_blocking).json())
            .init();
    } else {
        tracing_subscriber::registry()
            .with(filter)
            .with(fmt_layer)
            .init();
    }
    
    Ok(())
}
