// C2 Concierge Offline Verification Kit Library
// Provides core functionality for air-gapped C2PA manifest verification

pub mod cli;
pub mod crypto;
pub mod reports;
pub mod timestamp;
pub mod trust;
pub mod verification;

// Re-export main types for external use
pub use cli::{Cli, Commands, TrustCommand};
pub use crypto::{SignatureVerifier, VerificationError, MessageCanonicalizer, HashUtils, CertificateUtils};
pub use reports::{ReportGenerator, ReportFormat};
pub use timestamp::{TimestampVerification, TimestampVerifier};
pub use trust::{TrustPack, TrustManifest, TrustedIssuer, TrustSignature, TrustStatus, TrustManager};
pub use verification::{Verifier, VerificationResult, Verdict, VerificationStep, StepStatus};
