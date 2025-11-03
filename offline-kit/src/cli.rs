use clap::{Parser, Subcommand};
use std::path::PathBuf;

#[derive(Parser)]
#[command(name = "c2c-offline")]
#[command(about = "C2 Concierge Offline Verification Kit")]
#[command(version = env!("CARGO_PKG_VERSION"))]
pub struct Cli {
    #[command(subcommand)]
    pub command: Commands,
    
    /// Disable network access (always enforced in offline builds)
    #[arg(long, default_value = "true")]
    pub no_network: bool,
}

#[derive(Subcommand)]
pub enum Commands {
    /// Verify an asset offline (never touches network)
    Verify {
        /// Asset file to verify
        #[arg(help = "Path to asset file")]
        file: PathBuf,
        
        /// Trust pack to use for verification
        #[arg(long, short = 't', help = "Path to trust pack (.trustpack.tar.zst)")]
        trust: PathBuf,
        
        /// Output file for verification results
        #[arg(long, short = 'o', help = "Output verification results to file")]
        output: Option<PathBuf>,
        
        /// Include QR code for online recheck
        #[arg(long, default_value = "false", help = "Include QR code linking to public verifier")]
        qr: bool,
    },
    
    /// Generate local report with QR code
    Report {
        /// Asset file to verify
        #[arg(help = "Path to asset file")]
        file: PathBuf,
        
        /// Trust pack to use for verification
        #[arg(long, short = 't', help = "Path to trust pack (.trustpack.tar.zst)")]
        trust: PathBuf,
        
        /// Output file for report
        #[arg(long, short = 'o', default_value = "report.html", help = "Output report file")]
        out: PathBuf,
        
        /// Include QR code for online recheck
        #[arg(long, default_value = "true", help = "Include QR code linking to public verifier")]
        qr: bool,
        
        /// Report format
        #[arg(long, short = 'f', default_value = "html", value_parser = ["html", "json", "pdf"])]
        format: String,
    },
    
    /// Trust pack management
    Trust {
        #[command(subcommand)]
        command: TrustCommand,
    },
    
    /// Show version information
    Version,
}

#[derive(Subcommand)]
pub enum TrustCommand {
    /// Update trust pack from signed bundle
    Update {
        /// New trust pack file
        #[arg(help = "Path to new trust pack (.trustpack.tar.zst)")]
        pack: PathBuf,
    },
    
    /// Show current trust status
    Status,
    
    /// Revert to previous trust pack
    Revert {
        /// Trust pack hash to revert to
        #[arg(help = "Trust pack hash to revert to")]
        to: String,
    },
}
