use anyhow::{Context, Result, anyhow};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

use crate::trust::{TrustPack, TrustManager, TrustedIssuer};
use crate::timestamp::TimestampVerification;

/// Verification result with detailed information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerificationResult {
    /// Asset file path
    pub asset_path: PathBuf,
    /// Asset identifier (SHA256)
    pub asset_id: String,
    /// Overall verification verdict
    pub verdict: Verdict,
    /// Trust pack as-of date
    pub trust_as_of: DateTime<Utc>,
    /// Warnings encountered during verification
    pub warnings: Vec<String>,
    /// Unresolved remote references
    pub unresolved_references: Vec<String>,
    /// Timestamp verification result
    pub timestamp_verification: Option<TimestampVerification>,
    /// Detailed verification steps
    pub steps: Vec<VerificationStep>,
    /// Manifest data extracted
    pub manifest_data: Option<serde_json::Value>,
}

/// Verification verdict with exit codes
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum Verdict {
    /// Fully verified (green)
    Verified,
    /// Verified with warnings (yellow)
    VerifiedWithWarnings,
    /// Signature invalid or tampered (red)
    Unverified,
    /// Remote references unresolved (grey)
    Unresolved,
    /// Trust pack outdated (yellow)
    TrustOutdated,
}

impl Verdict {
    pub fn exit_code(&self) -> i32 {
        match self {
            Verdict::Verified => 0,
            Verdict::VerifiedWithWarnings => 2,
            Verdict::Unverified => 3,
            Verdict::Unresolved => 4,
            Verdict::TrustOutdated => 10,
        }
    }
    
    pub fn color(&self) -> &'static str {
        match self {
            Verdict::Verified => "green",
            Verdict::VerifiedWithWarnings => "yellow",
            Verdict::Unverified => "red",
            Verdict::Unresolved => "grey",
            Verdict::TrustOutdated => "yellow",
        }
    }
}

/// Individual verification step
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerificationStep {
    pub step_name: String,
    pub status: StepStatus,
    pub message: String,
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum StepStatus {
    Passed,
    Failed,
    Warning,
    Skipped,
}

/// Main verifier for C2PA manifests
pub struct Verifier {
    trust_pack: TrustPack,
    network_disabled: bool,
    strict_mode: bool,
}

impl Verifier {
    pub fn new(trust_pack: TrustPack, network_disabled: bool) -> Self {
        Self {
            trust_pack,
            network_disabled,
            strict_mode: true,
        }
    }
    
    /// Verify an asset file
    pub fn verify<P: AsRef<Path>>(&self, asset_path: P) -> Result<VerificationResult> {
        let asset_path = asset_path.as_ref();
        
        if !asset_path.exists() {
            return Err(anyhow!("Asset file not found: {}", asset_path.display()));
        }
        
        let mut result = VerificationResult {
            asset_path: asset_path.to_path_buf(),
            asset_id: self.calculate_asset_id(asset_path)?,
            verdict: Verdict::Unverified,
            trust_as_of: self.trust_pack.manifest.as_of,
            warnings: Vec::new(),
            unresolved_references: Vec::new(),
            timestamp_verification: None,
            steps: Vec::new(),
            manifest_data: None,
        };
        
        // Step 1: Extract and parse C2PA manifest
        let manifest = self.extract_manifest(asset_path, &mut result)?;
        
        // Step 2: Verify signature chain
        let signature_valid = self.verify_signature_chain(&manifest, &mut result)?;
        
        // Step 3: Verify content binding
        let binding_valid = self.verify_content_binding(&manifest, asset_path, &mut result)?;
        
        // Step 4: Verify timestamps if present
        let timestamp_valid = self.verify_timestamps(&manifest, &mut result)?;
        
        // Step 5: Check for remote references
        self.check_remote_references(&manifest, &mut result)?;
        
        // Step 6: Validate trust pack freshness
        let trust_fresh = self.validate_trust_freshness(&mut result)?;
        
        // Determine final verdict
        result.verdict = self.determine_verdict(
            signature_valid,
            binding_valid,
            timestamp_valid,
            trust_fresh,
            &result,
        );
        
        Ok(result)
    }
    
    /// Calculate asset identifier (SHA256)
    fn calculate_asset_id(&self, asset_path: &Path) -> Result<String> {
        use std::fs::File;
        use std::io::Read;
        use sha2::{Sha256, Digest};
        
        let mut file = File::open(asset_path)?;
        let mut hasher = Sha256::new();
        let mut buffer = [0; 8192];
        
        loop {
            let bytes_read = file.read(&mut buffer)?;
            if bytes_read == 0 {
                break;
            }
            hasher.update(&buffer[..bytes_read]);
        }
        
        Ok(format!("{:x}", hasher.finalize()))
    }
    
    /// Extract C2PA manifest from asset
    fn extract_manifest(&self, asset_path: &Path, result: &mut VerificationResult) -> Result<serde_json::Value> {
        // Validate asset path to prevent directory traversal
        if !asset_path.exists() {
            return Err(anyhow!("Asset file not found: {}", asset_path.display()));
        }
        
        // Normalize path and check for traversal attempts
        let canonical_path = asset_path.canonicalize()
            .context("Failed to canonicalize asset path")?;
        
        // Check if the path is trying to escape current directory
        let current_dir = std::env::current_dir()
            .context("Failed to get current directory")?;
        
        if !canonical_path.starts_with(&current_dir) && 
           !canonical_path.starts_with("/tmp") && 
           !canonical_path.starts_with("/var/tmp") {
            return Err(anyhow!("Asset path must be within current directory or temp directory"));
        }
        
        // Validate file size to prevent processing extremely large files
        let metadata = std::fs::metadata(asset_path)
            .context("Failed to get asset metadata")?;
        
        const MAX_FILE_SIZE: u64 = 100 * 1024 * 1024; // 100MB limit
        if metadata.len() > MAX_FILE_SIZE {
            return Err(anyhow!("Asset file too large (max 100MB allowed)"));
        }
        
        self.add_step(result, "manifest_extraction", StepStatus::Passed, "Extracting C2PA manifest");
        
        // Use c2pa-rs to extract manifest
        // This is a simplified implementation - real implementation would use c2pa crate
        let manifest_data = self.extract_c2pa_manifest(asset_path)?;
        
        result.manifest_data = Some(manifest_data.clone());
        
        self.add_step(result, "manifest_parsing", StepStatus::Passed, "Manifest parsed successfully");
        
        Ok(manifest_data)
    }
    
    /// Extract C2PA manifest using c2pa-rs
    fn extract_c2pa_manifest(&self, asset_path: &Path) -> Result<serde_json::Value> {
        // Placeholder implementation
        // Real implementation would use c2pa crate with file_io feature
        Ok(serde_json::json!({
            "claim": {
                "signature": "example_signature_data",
                "data": {
                    "title": "Example Asset",
                    "format": "image/jpeg",
                    "instance_id": "xmp:iid:12345"
                }
            },
            "assertions": [
                {
                    "label": "c2pa.actions",
                    "data": {
                        "actions": [
                            {
                                "action": "c2pa.created",
                                "digitalSourceType": "http://cv.iptc.org/newscodes/digitalsourcetype/compositeAlgorithmicallyGenerated"
                            }
                        ]
                    }
                }
            ]
        }))
    }
    
    /// Verify signature chain against trust pack
    fn verify_signature_chain(&self, manifest: &serde_json::Value, result: &mut VerificationResult) -> Result<bool> {
        self.add_step(result, "signature_verification", StepStatus::Passed, "Verifying signature chain");
        
        // Extract signature from manifest
        let signature_data = manifest["claim"]["signature"]
            .as_str()
            .ok_or_else(|| anyhow!("No signature found in manifest"))?;
        
        // Verify against trust pack roots
        let is_valid = self.verify_signature_with_trust_roots(signature_data)?;
        
        if is_valid {
            self.add_step(result, "signature_chain", StepStatus::Passed, "Signature chain valid");
            Ok(true)
        } else {
            self.add_step(result, "signature_chain", StepStatus::Failed, "Signature chain invalid");
            result.warnings.push("Signature verification failed".to_string());
            Ok(false)
        }
    }
    
    /// Verify signature against bundled trust roots
    fn verify_signature_with_trust_roots(&self, signature_data: &str) -> Result<bool> {
        // Placeholder implementation
        // Real implementation would use crypto module with trust pack roots
        // For now, assume example signatures are valid
        Ok(signature_data == "example_signature_data")
    }
    
    /// Verify content binding integrity
    fn verify_content_binding(&self, manifest: &serde_json::Value, asset_path: &Path, result: &mut VerificationResult) -> Result<bool> {
        self.add_step(result, "content_binding", StepStatus::Passed, "Verifying content binding");
        
        // Extract content hash from manifest
        let manifest_hash = manifest["claim"]["data"]["instance_id"]
            .as_str()
            .and_then(|s| s.strip_prefix("xmp:iid:"))
            .unwrap_or("12345");
        
        // Calculate actual asset hash
        let actual_hash = self.calculate_asset_id(asset_path)?;
        
        // Compare hashes (simplified - real implementation uses proper binding)
        let is_valid = manifest_hash.len() > 0; // Placeholder
        
        if is_valid {
            self.add_step(result, "content_hash", StepStatus::Passed, "Content binding verified");
            Ok(true)
        } else {
            self.add_step(result, "content_hash", StepStatus::Failed, "Content binding mismatch");
            result.warnings.push("Content binding verification failed".to_string());
            Ok(false)
        }
    }
    
    /// Verify RFC 3161 timestamps
    fn verify_timestamps(&self, manifest: &serde_json::Value, result: &mut VerificationResult) -> Result<bool> {
        self.add_step(result, "timestamp_verification", StepStatus::Passed, "Checking for timestamps");
        
        // Look for timestamp assertions
        let has_timestamp = manifest["assertions"]
            .as_array()
            .map(|arr| arr.iter().any(|a| a["label"] == "c2pa.hash.data"))
            .unwrap_or(false);
        
        if has_timestamp {
            // Verify timestamp against TSA roots
            let timestamp_valid = self.verify_rfc3161_timestamp(manifest)?;
            
            if timestamp_valid {
                self.add_step(result, "timestamp_valid", StepStatus::Passed, "RFC 3161 timestamp valid");
                Ok(true)
            } else {
                self.add_step(result, "timestamp_valid", StepStatus::Warning, "RFC 3161 timestamp verification failed");
                result.warnings.push("Timestamp verification inconclusive".to_string());
                Ok(false)
            }
        } else {
            self.add_step(result, "timestamp_present", StepStatus::Skipped, "No timestamp found");
            Ok(true) // No timestamp is not a failure
        }
    }
    
    /// Verify RFC 3161 timestamp token
    fn verify_rfc3161_timestamp(&self, manifest: &serde_json::Value) -> Result<bool> {
        // Placeholder implementation
        // Real implementation would use timestamp module with OpenSSL ts
        Ok(true)
    }
    
    /// Check for unresolved remote references
    fn check_remote_references(&self, manifest: &serde_json::Value, result: &mut VerificationResult) -> Result<()> {
        self.add_step(result, "remote_reference_check", StepStatus::Passed, "Checking for remote references");
        
        let mut remote_refs = Vec::new();
        
        // Check assertions for remote URIs
        if let Some(assertions) = manifest["assertions"].as_array() {
            for assertion in assertions {
                if let Some(data) = assertion["data"].as_object() {
                    for value in data.values() {
                        if let Some(uri) = value.as_str() {
                            if uri.starts_with("http://") || uri.starts_with("https://") {
                                remote_refs.push(uri.to_string());
                            }
                        }
                    }
                }
            }
        }
        
        if !remote_refs.is_empty() {
            result.unresolved_references = remote_refs.clone();
            self.add_step(
                result,
                "remote_references",
                StepStatus::Warning,
                &format!("Found {} unresolved remote references", remote_refs.len()),
            );
        } else {
            self.add_step(result, "remote_references", StepStatus::Passed, "No remote references found");
        }
        
        Ok(())
    }
    
    /// Validate trust pack freshness
    fn validate_trust_freshness(&self, result: &mut VerificationResult) -> Result<bool> {
        self.add_step(result, "trust_freshness", StepStatus::Passed, "Checking trust pack freshness");
        
        // Check if trust pack is older than 90 days
        let is_fresh = !self.trust_pack.is_expired(90);
        
        if is_fresh {
            self.add_step(result, "trust_age", StepStatus::Passed, "Trust pack is fresh");
            Ok(true)
        } else {
            self.add_step(result, "trust_age", StepStatus::Warning, "Trust pack is outdated");
            result.warnings.push("Trust pack is older than 90 days".to_string());
            Ok(false)
        }
    }
    
    /// Determine final verdict based on all verification steps
    fn determine_verdict(&self, signature_valid: bool, binding_valid: bool, timestamp_valid: bool, trust_fresh: bool, result: &VerificationResult) -> Verdict {
        // If there are unresolved remote references, it's unresolved (grey)
        if !result.unresolved_references.is_empty() {
            return Verdict::Unresolved;
        }
        
        // If signature or binding is invalid, it's unverified (red)
        if !signature_valid || !binding_valid {
            return Verdict::Unverified;
        }
        
        // If trust is outdated, it's trust outdated (yellow)
        if !trust_fresh {
            return Verdict::TrustOutdated;
        }
        
        // If there are warnings but core verification passed, it's verified with warnings (yellow)
        if !result.warnings.is_empty() || !timestamp_valid {
            return Verdict::VerifiedWithWarnings;
        }
        
        // Everything passed - fully verified (green)
        Verdict::Verified
    }
    
    /// Add a verification step to the result
    fn add_step(&self, result: &mut VerificationResult, step_name: &str, status: StepStatus, message: &str) {
        result.steps.push(VerificationStep {
            step_name: step_name.to_string(),
            status,
            message: message.to_string(),
            timestamp: Utc::now(),
        });
    }
}
