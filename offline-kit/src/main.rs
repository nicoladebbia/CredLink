use anyhow::{Context, Result};
use clap::Parser;
use log::{info, warn};

mod cli;
mod trust;
mod verification;
mod reports;
mod timestamp;
mod crypto;

use cli::{Cli, Commands};
use trust::{TrustPack, TrustManager};
use verification::{Verifier, VerificationResult, Verdict};
use reports::{ReportGenerator, ReportFormat};

/// Main CLI entry point for C2 Concierge Offline Verification Kit
#[tokio::main]
async fn main() -> Result<()> {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();
    
    let cli = Cli::parse();
    
    // Enforce offline mode - always disable network
    const NETWORK_DISABLED: bool = true;
    if !cli.no_network {
        warn!("Network access is disabled in offline kit builds");
    }
    
    match cli.command {
        Commands::Verify { 
            file, 
            trust, 
            output: _,
            qr: _,
        } => {
            let trust_pack = TrustPack::load(&trust)
                .context("Failed to load trust pack")?;
            
            let verifier = Verifier::new(trust_pack, NETWORK_DISABLED);
            
            let result = verifier.verify(&file)
                .context("Failed to verify asset")?;
            
            print_verification_result(&result);
            
            // Return appropriate exit code
            std::process::exit(result.verdict.exit_code());
        }
        
        Commands::Report { 
            file, 
            trust, 
            out, 
            qr,
            format,
        } => {
            let trust_pack = TrustPack::load(&trust)
                .context("Failed to load trust pack")?;
            
            let verifier = Verifier::new(trust_pack, NETWORK_DISABLED);
            
            let result = verifier.verify(&file)
                .context("Failed to verify asset")?;
            
            let generator = ReportGenerator::new(qr);
            generator.generate(&result, &out, format)
                .context("Failed to generate report")?;
            
            info!("Report generated: {}", out.display());
            
            std::process::exit(result.verdict.exit_code());
        }
        
        Commands::Trust { command } => {
            match command {
                cli::TrustCommand::Update { pack } => {
                    let new_pack = TrustPack::load(&pack)
                        .context("Failed to load new trust pack")?;
                    
                    TrustManager::update_trust_pack(new_pack)
                        .context("Failed to update trust pack")?;
                    
                    info!("Trust pack updated successfully");
                }
                cli::TrustCommand::Status => {
                    let status = TrustManager::status()
                        .context("Failed to get trust status")?;
                    
                    print_trust_status(&status);
                }
                cli::TrustCommand::Revert { to } => {
                    TrustManager::revert_to(&to)
                        .context("Failed to revert trust pack")?;
                    
                    info!("Trust pack reverted to: {}", to);
                }
            }
        }
        
        Commands::Version => {
            print_version_info();
        }
    }
    
    Ok(())
}

fn print_verification_result(result: &VerificationResult) {
    println!("Asset: {}", result.asset_path.display());
    println!("Asset ID: {}", result.asset_id);
    println!("Verdict: {}", result.verdict);
    println!("Trust As-Of: {}", result.trust_as_of);
    
    if !result.warnings.is_empty() {
        println!("Warnings:");
        for warning in &result.warnings {
            println!("  - {}", warning);
        }
    }
    
    if !result.unresolved_references.is_empty() {
        println!("Unresolved References (offline):");
        for ref_uri in &result.unresolved_references {
            println!("  - {}", ref_uri);
        }
    }
    
    if let Some(timestamp) = &result.timestamp_verification {
        println!("Timestamp: {}", timestamp);
    }
}

fn print_trust_status(status: &trust::TrustStatus) {
    println!("Trust Status:");
    println!("  Current Pack: {}", status.current_pack_hash);
    println!("  As-Of Date: {}", status.as_of_date);
    println!("  Version: {}", status.version);
    println!("  Issuers: {}", status.issuer_count);
    println!("  TSA Roots: {}", status.tsa_root_count);
    
    if let Some(age) = status.age_days {
        if age > 90 {
            println!("  ⚠️  Trust pack is {} days old (consider updating)", age);
        }
    }
}

fn print_version_info() {
    println!("C2 Concierge Offline Verification Kit v{}", env!("CARGO_PKG_VERSION"));
    println!("Build: {} {}", 
        option_env!("VERGEN_BUILD_DATE").unwrap_or("unknown"), 
        option_env!("VERGEN_GIT_SHA").unwrap_or("unknown")
    );
    println!("Network: DISABLED (offline mode)");
    println!("Security Level: MAXIMUM");
}
