use anyhow::{Context, Result, anyhow};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use tar::Archive;
use zstd::stream::read::Decoder;
use sha2::{Sha256, Digest};
use std::io::Read;

use crate::crypto::{SignatureVerifier, VerificationError};

/// Trust pack format for offline verification
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrustPack {
    /// Manifest metadata
    pub manifest: TrustManifest,
    /// Trust root certificates (PEM format)
    pub roots_pem: String,
    /// CAI known certificate list
    pub issuers: Vec<TrustedIssuer>,
    /// TSA root certificates (RFC 3161)
    pub tsa_roots_pem: Option<String>,
    /// CRL snapshots (optional)
    pub crl_snapshots: HashMap<String, Vec<u8>>,
    /// Digital signature
    pub signature: TrustSignature,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrustManifest {
    /// Trust pack version
    pub version: String,
    /// When this trust pack was created
    pub created_at: DateTime<Utc>,
    /// Trust data as-of date
    pub as_of: DateTime<Utc>,
    /// SHA256 hashes of all components
    pub sha256s: HashMap<String, String>,
    /// Trust pack type
    pub pack_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrustedIssuer {
    /// Certificate display name
    pub display_name: String,
    /// Certificate subject DN
    pub subject: String,
    /// Certificate issuer DN
    pub issuer: String,
    /// Certificate serial number
    pub serial: String,
    /// Certificate fingerprint (SHA256)
    pub fingerprint: String,
    /// Certificate validity period
    pub valid_from: DateTime<Utc>,
    pub valid_until: DateTime<Utc>,
    /// CAI organization identifier
    pub org_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrustSignature {
    /// Signature algorithm
    pub alg: String,
    /// Signer identifier
    pub signer: String,
    /// Base64-encoded signature
    pub signature: String,
    /// Additional signing data
    pub extra_data: Option<HashMap<String, String>>,
}

/// Current trust status
#[derive(Debug, Clone)]
pub struct TrustStatus {
    pub current_pack_hash: String,
    pub as_of_date: DateTime<Utc>,
    pub version: String,
    pub issuer_count: usize,
    pub tsa_root_count: usize,
    pub age_days: Option<u64>,
}

impl TrustPack {
    /// Load trust pack from compressed archive
    pub fn load<P: AsRef<Path>>(path: P) -> Result<Self> {
        let path = path.as_ref();
        
        // Validate path to prevent directory traversal
        if !path.exists() {
            return Err(anyhow!("Trust pack file not found: {}", path.display()));
        }
        
        // Normalize path and check for traversal attempts
        let canonical_path = path.canonicalize()
            .context("Failed to canonicalize trust pack path")?;
        
        // Check if the path is trying to escape current directory
        let current_dir = std::env::current_dir()
            .context("Failed to get current directory")?;
        
        if !canonical_path.starts_with(&current_dir) && 
           !canonical_path.starts_with("/tmp") && 
           !canonical_path.starts_with("/var/tmp") {
            return Err(anyhow!("Trust pack path must be within current directory or temp directory"));
        }
        
        // Validate file extension
        if let Some(extension) = path.extension() {
            if extension != "zst" {
                return Err(anyhow!("Trust pack must have .zst extension"));
            }
        } else {
            return Err(anyhow!("Trust pack must have .zst extension"));
        }
        
        // Open and decompress the archive
        let file = fs::File::open(path)
            .context("Failed to open trust pack file")?;
        
        let decoder = Decoder::new(file)
            .context("Failed to create zstd decoder")?;
        
        let mut archive = Archive::new(decoder);
        
        let mut manifest: Option<TrustManifest> = None;
        let mut roots_pem: Option<String> = None;
        let mut issuers: Option<Vec<TrustedIssuer>> = None;
        let mut tsa_roots_pem: Option<String> = None;
        let mut crl_snapshots: HashMap<String, Vec<u8>> = HashMap::new();
        let mut signature: Option<TrustSignature> = None;
        
        for entry in archive.entries()? {
            let mut entry = entry.context("Failed to read archive entry")?;
            let path = entry.path()?;
            
            match path.to_str() {
                Some("manifest.json") => {
                    let content = read_entry_to_string(&mut entry)?;
                    
                    // Validate JSON size to prevent DoS
                    const MAX_JSON_SIZE: usize = 10 * 1024 * 1024; // 10MB limit
                    if content.len() > MAX_JSON_SIZE {
                        return Err(anyhow!("Manifest JSON too large"));
                    }
                    
                    manifest = Some(serde_json::from_str(&content)?);
                }
                Some("roots.pem") => {
                    let content = read_entry_to_string(&mut entry)?;
                    
                    // Validate PEM size to prevent DoS
                    const MAX_PEM_SIZE: usize = 10 * 1024 * 1024; // 10MB limit
                    if content.len() > MAX_PEM_SIZE {
                        return Err(anyhow!("Roots PEM too large"));
                    }
                    
                    roots_pem = content;
                }
                Some("issuers.json") => {
                    let content = read_entry_to_string(&mut entry)?;
                    
                    // Validate JSON size to prevent DoS
                    const MAX_JSON_SIZE: usize = 10 * 1024 * 1024; // 10MB limit
                    if content.len() > MAX_JSON_SIZE {
                        return Err(anyhow!("Issuers JSON too large"));
                    }
                    
                    issuers = Some(serde_json::from_str(&content)?);
                }
                Some("tsa_roots.pem") => {
                    let content = read_entry_to_string(&mut entry)?;
                    
                    // Validate PEM size to prevent DoS
                    const MAX_PEM_SIZE: usize = 10 * 1024 * 1024; // 10MB limit
                    if content.len() > MAX_PEM_SIZE {
                        return Err(anyhow!("TSA roots PEM too large"));
                    }
                    
                    tsa_roots_pem = Some(content);
                }
                Some(path) if path.starts_with("crl/") => {
                    let filename = path.strip_prefix("crl/").unwrap();
                    let mut content = Vec::new();
                    entry.read_to_end(&mut content)?;
                    
                    // Validate CRL size to prevent DoS
                    const MAX_CRL_SIZE: usize = 50 * 1024 * 1024; // 50MB limit
                    if content.len() > MAX_CRL_SIZE {
                        return Err(anyhow!("CRL file too large: {}", filename));
                    }
                    
                    crl_snapshots.insert(filename.to_string(), content);
                }
                Some("signature.json") => {
                    let content = read_entry_to_string(&mut entry)?;
                    
                    // Validate JSON size to prevent DoS
                    const MAX_JSON_SIZE: usize = 10 * 1024 * 1024; // 10MB limit
                    if content.len() > MAX_JSON_SIZE {
                        return Err(anyhow!("Signature JSON too large"));
                    }
                    
                    signature = Some(serde_json::from_str(&content)?);
                }
                _ => {
                    // Skip unknown files
                    continue;
                }
            }
        }
        
        // Validate all required components are present
        let manifest = manifest.ok_or_else(|| anyhow!("Missing manifest.json"))?;
        let roots_pem = roots_pem.ok_or_else(|| anyhow!("Missing roots.pem"))?;
        let issuers = issuers.ok_or_else(|| anyhow!("Missing issuers.json"))?;
        let signature = signature.ok_or_else(|| anyhow!("Missing signature.json"))?;
        
        let trust_pack = TrustPack {
            manifest,
            roots_pem,
            issuers,
            tsa_roots_pem,
            crl_snapshots,
            signature,
        };
        
        // Verify the trust pack signature
        trust_pack.verify_signature()?;
        
        Ok(trust_pack)
    }
    
    /// Verify the trust pack signature
    pub fn verify_signature(&self) -> Result<()> {
        let verifier = SignatureVerifier::new();
        
        // Create canonical representation for signing
        let canonical = self.create_canonical_representation()?;
        
        // Verify signature
        verifier.verify(
            &canonical,
            &self.signature.signature,
            &self.signature.alg,
            &self.signature.signer,
        )?;
        
        Ok(())
    }
    
    /// Create canonical representation for signature verification
    fn create_canonical_representation(&self) -> Result<Vec<u8>> {
        let canonical_data = serde_json::json!({
            "manifest": self.manifest,
            "roots_hash": Self::sha256_string(&self.roots_pem),
            "issuers_hash": Self::sha256_string(&serde_json::to_string(&self.issuers)?),
            "tsa_roots_hash": self.tsa_roots_pem.as_ref()
                .map(|pem| Self::sha256_string(pem))
                .unwrap_or_else(|| "none".to_string()),
        });
        
        Ok(serde_json::to_vec(&canonical_data)?)
    }
    
    /// Calculate SHA256 of string
    fn sha256_string(data: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(data.as_bytes());
        format!("{:x}", hasher.finalize())
    }
    
    /// Get trust pack hash
    pub fn calculate_hash(&self) -> Result<String> {
        let canonical = self.create_canonical_representation()?;
        let mut hasher = Sha256::new();
        hasher.update(&canonical);
        Ok(format!("{:x}", hasher.finalize()))
    }
    
    /// Check if trust pack is expired based on age policy
    pub fn is_expired(&self, max_age_days: u64) -> bool {
        let now = Utc::now();
        let age = now.signed_duration_since(self.manifest.as_of);
        age.num_days() > max_age_days as i64
    }
}

/// Trust pack manager for updates and status
pub struct TrustManager {
    current_pack: TrustPack,
    local_store_path: PathBuf,
}

impl TrustManager {
    pub fn new(trust_pack: TrustPack) -> Self {
        let local_store_path = dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(".c2c-offline")
            .join("trust");
        
        Self {
            current_pack: trust_pack,
            local_store_path,
        }
    }
    
    /// Update to a new trust pack (static method)
    pub fn update_trust_pack(new_pack: TrustPack) -> Result<()> {
        // Verify new pack signature
        new_pack.verify_signature()?;
        
        // Create backup of current pack
        let store_path = dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(".c2c-offline")
            .join("trust");
        
        fs::create_dir_all(&store_path)?;
        
        // Save current pack as backup
        let current_hash = new_pack.calculate_hash()?;
        let backup_path = store_path.join(format!("backup-{}.json", current_hash));
        fs::write(&backup_path, serde_json::to_string_pretty(&new_pack)?)?;
        
        // Write audit log entry
        let audit_entry = serde_json::json!({
            "timestamp": Utc::now(),
            "action": "trust_update",
            "pack_hash": current_hash,
            "as_of": new_pack.manifest.as_of,
            "version": new_pack.manifest.version,
        });
        
        let audit_path = store_path.join("audit.log");
        fs::write(&audit_path, format!("{}\n", audit_entry))?;
        
        Ok(())
    }
    
    /// Get current trust status (static method)
    pub fn status() -> Result<TrustStatus> {
        let store_path = dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(".c2c-offline")
            .join("trust");
        
        let audit_path = store_path.join("audit.log");
        let audit_content = fs::read_to_string(&audit_path).unwrap_or_default();
        
        // Parse latest audit entry to get current status
        let latest_entry: serde_json::Value = audit_content
            .lines()
            .last()
            .and_then(|line| serde_json::from_str(line).ok())
            .unwrap_or_else(|| serde_json::json!({
                "timestamp": Utc::now(),
                "pack_hash": "unknown",
                "as_of": Utc::now(),
                "version": "unknown"
            }));
        
        let as_of: DateTime<Utc> = serde_json::from_value(latest_entry["as_of"].clone())?;
        let age_days = Some(Utc::now().signed_duration_since(as_of).num_days() as u64);
        
        Ok(TrustStatus {
            current_pack_hash: latest_entry["pack_hash"].as_str().unwrap_or("unknown").to_string(),
            as_of_date: as_of,
            version: latest_entry["version"].as_str().unwrap_or("unknown").to_string(),
            issuer_count: 0, // Would be loaded from current pack
            tsa_root_count: 0, // Would be loaded from current pack
            age_days,
        })
    }
    
    /// Revert to previous trust pack (static method)
    pub fn revert_to(pack_hash: &str) -> Result<()> {
        let store_path = dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(".c2c-offline")
            .join("trust");
        
        let backup_path = store_path.join(format!("backup-{}.json", pack_hash));
        
        if !backup_path.exists() {
            return Err(anyhow!("Trust pack backup not found: {}", pack_hash));
        }
        
        // Load backup pack
        let backup_content = fs::read_to_string(&backup_path)?;
        let trust_pack: TrustPack = serde_json::from_str(&backup_content)?;
        
        // Restore as current
        let current_path = store_path.join("current.json");
        fs::write(&current_path, serde_json::to_string_pretty(&trust_pack)?)?;
        
        // Write audit entry
        let audit_entry = serde_json::json!({
            "timestamp": Utc::now(),
            "action": "trust_revert",
            "pack_hash": pack_hash,
            "as_of": trust_pack.manifest.as_of,
            "version": trust_pack.manifest.version,
        });
        
        let audit_path = store_path.join("audit.log");
        fs::write(&audit_path, format!("{}\n", audit_entry))?;
        
        Ok(())
    }
}

fn read_entry_to_string<R: std::io::Read>(reader: &mut R) -> Result<String> {
    let mut content = String::new();
    reader.read_to_string(&mut content)?;
    Ok(content)
}
