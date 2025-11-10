//! HSM/KMS Signing Backend for C2 Concierge
//! 
//! Provides a unified interface for multiple signing backends:
//! - YubiHSM2 via PKCS#11
//! - HashiCorp Vault Transit
//! - AWS/GCP KMS
//! - Software fallback

use anyhow::{Context, Result};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Duration;
use tracing::{debug, error, info, warn};

// Backend implementations
pub mod aws_kms;
pub mod gcp_kms;
pub mod yubihsm2_backend;
pub mod vault_hsm;

/// Signing backend trait for different key custody providers
#[async_trait]
pub trait SignBackend: Send + Sync {
    /// Sign a SHA-256 digest using tenant's key
    async fn sign_es256(&self, tenant: &str, digest: &[u8]) -> Result<Vec<u8>>;
    
    /// Get public key in PEM format
    async fn pubkey_pem(&self, tenant: &str) -> Result<String>;
    
    /// Get key metadata for attestation
    async fn key_metadata(&self, tenant: &str) -> Result<KeyMetadata>;
    
    /// Health check for the backend
    async fn health_check(&self) -> Result<HealthStatus>;
    
    /// Backend type identifier
    fn backend_type(&self) -> BackendType;
}

/// Backend types supported
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum BackendType {
    YubiHSM2,
    VaultHSM,
    VaultTransit,
    AWSKMS,
    GCPKMS,
    Software,
}

/// Key metadata for attestation and audit
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyMetadata {
    pub key_id: String,
    pub tenant_id: String,
    pub backend_type: BackendType,
    pub algorithm: String, // "ES256" for P-256
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub not_before: chrono::DateTime<chrono::Utc>,
    pub not_after: chrono::DateTime<chrono::Utc>,
    pub attestation: Option<AttestationData>,
}

/// Attestation data for hardware-backed keys
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttestationData {
    pub device_serial: Option<String>,
    pub slot_id: Option<String>,
    pub certificate_chain: Vec<String>,
    pub vendor_info: HashMap<String, String>,
}

/// Health status for backend monitoring
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthStatus {
    pub backend_type: BackendType,
    pub is_healthy: bool,
    pub latency_ms: u64,
    pub error_message: Option<String>,
    pub last_check: chrono::DateTime<chrono::Utc>,
}

/// Signing request from main signer service
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignRequest {
    pub tenant_id: String,
    pub digest: String, // hex-encoded SHA-256
    pub timestamp: chrono::DateTime<chrono::Utc>,
    pub request_id: String,
}

/// Signing response with signature and metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignResponse {
    pub signature: String, // hex-encoded DER signature
    pub key_metadata: KeyMetadata,
    pub signed_at: chrono::DateTime<chrono::Utc>,
    pub request_id: String,
}

/// Configuration for different backends
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackendConfig {
    pub backend_type: BackendType,
    pub settings: HashMap<String, String>,
    pub timeout_ms: u64,
    pub max_retries: u32,
}

/// YubiHSM2 PKCS#11 backend - MOVED TO yubihsm2_backend.rs

/// Vault Transit backend
pub struct VaultTransitBackend {
    client: vaultrs::client::VaultClient,
    mount: String,
    key_prefix: String,
    timeout: Duration,
}

impl VaultTransitBackend {
    pub fn new(config: &BackendConfig) -> Result<Self> {
        let vault_addr = config.settings.get("vault_addr")
            .context("Vault requires vault_addr")?;
        let vault_token = config.settings.get("vault_token")
            .context("Vault requires vault_token")?;
        
        let client = vaultrs::client::VaultClient::new(
            vaultrs::client::VaultClientSettingsBuilder::new()
                .address(vault_addr)
                .token(vault_token)
                .build()?,
        );
        
        let mount = config.settings.get("transit_mount")
            .unwrap_or(&"transit".to_string())
            .clone();
        
        let key_prefix = config.settings.get("key_prefix")
            .unwrap_or(&"tenants".to_string())
            .clone();
        
        let timeout = Duration::from_millis(config.timeout_ms);
        
        info!("Vault Transit backend initialized with mount: {}", mount);
        
        Ok(Self {
            client,
            mount,
            key_prefix,
            timeout,
        })
    }
    
    fn get_key_name(&self, tenant: &str) -> String {
        format!("{}/{}-p256", self.key_prefix, tenant)
    }
}

#[async_trait]
impl SignBackend for VaultTransitBackend {
    async fn sign_es256(&self, tenant: &str, digest: &[u8]) -> Result<Vec<u8>> {
        debug!("Vault Transit signing for tenant: {}", tenant);
        
        let key_name = self.get_key_name(tenant);
        let digest_hex = hex::encode(digest);
        
        let signature_data: serde_json::Value = vaultrs::transit::sign(
            &self.client,
            &self.mount,
            &key_name,
            &vaultrs::transit::SignInput {
                input: &digest_hex,
                signature_algorithm: Some(vaultrs::transit::SignatureAlgorithm::Sha2_256),
                prehashed: Some(true),
                ..Default::default()
            },
        ).await?;
        
        let signature = signature_data.get("signature")
            .and_then(|s| s.as_str())
            .context("No signature in Vault response")?;
        
        // Vault returns base64-encoded signature
        let signature_bytes = base64::decode(signature.trim_start_matches("vault:v1:"))
            .context("Failed to decode Vault signature")?;
        
        Ok(signature_bytes)
    }
    
    async fn pubkey_pem(&self, tenant: &str) -> Result<String> {
        debug!("Vault Transit getting public key for tenant: {}", tenant);
        
        let key_name = self.get_key_name(tenant);
        
        let key_info: serde_json::Value = vaultrs::transit::read_key(
            &self.client,
            &self.mount,
            &key_name,
        ).await?;
        
        let public_key = key_info.get("keys")
            .and_then(|keys| keys.as_array())
            .and_then(|arr| arr.first())
            .and_then(|key| key.get("public_key"))
            .and_then(|pk| pk.as_str())
            .context("No public key in Vault response")?;
        
        Ok(public_key.to_string())
    }
    
    async fn key_metadata(&self, tenant: &str) -> Result<KeyMetadata> {
        let key_name = self.get_key_name(tenant);
        
        Ok(KeyMetadata {
            key_id: format!("vault:{}:{}", self.mount, key_name),
            tenant_id: tenant.to_string(),
            backend_type: BackendType::VaultTransit,
            algorithm: "ES256".to_string(),
            created_at: chrono::Utc::now(),
            not_before: chrono::Utc::now(),
            not_after: chrono::Utc::now() + chrono::Duration::days(90),
            attestation: None, // Cloud KMS doesn't have hardware attestation
        })
    }
    
    async fn health_check(&self) -> Result<HealthStatus> {
        let start = std::time::Instant::now();
        
        match vaultrs::sys::health::status(&self.client).await {
            Ok(_) => Ok(HealthStatus {
                backend_type: BackendType::VaultTransit,
                is_healthy: true,
                latency_ms: start.elapsed().as_millis() as u64,
                error_message: None,
                last_check: chrono::Utc::now(),
            }),
            Err(e) => Ok(HealthStatus {
                backend_type: BackendType::VaultTransit,
                is_healthy: false,
                latency_ms: start.elapsed().as_millis() as u64,
                error_message: Some(e.to_string()),
                last_check: chrono::Utc::now(),
            }),
        }
    }
    
    fn backend_type(&self) -> BackendType {
        BackendType::VaultTransit
    }
}

/// Backend factory for creating configured signers
pub struct BackendFactory;

impl BackendFactory {
    pub async fn create(config: &BackendConfig) -> Result<Box<dyn SignBackend>> {
        match config.backend_type {
            BackendType::YubiHSM2 => {
                let yubi_config = yubihsm2_backend::YubiHSM2Config {
                    module_path: config.settings.get("module_path")
                        .context("YubiHSM2 requires module_path")?
                        .clone(),
                    slot_id: config.settings.get("slot_id")
                        .context("YubiHSM2 requires slot_id")?
                        .parse::<u64>()
                        .context("Invalid slot_id")?,
                    key_id: hex::decode(config.settings.get("key_id")
                        .context("YubiHSM2 requires key_id")?)
                        .context("Invalid key_id hex")?,
                    pin: config.settings.get("pin").cloned(),
                    timeout_ms: config.timeout_ms,
                };
                let backend = yubihsm2_backend::YubiHSM2Backend::new(yubi_config).await?;
                Ok(Box::new(backend))
            }
            BackendType::VaultTransit => {
                let backend = VaultTransitBackend::new(config)?;
                Ok(Box::new(backend))
            }
            BackendType::VaultHSM => {
                let vault_hsm_config = vault_hsm::VaultHSMConfig {
                    vault_addr: config.settings.get("vault_addr")
                        .context("Vault HSM requires vault_addr")?
                        .clone(),
                    vault_token: config.settings.get("vault_token")
                        .context("Vault HSM requires vault_token")?
                        .clone(),
                    mount_path: config.settings.get("mount_path")
                        .context("Vault HSM requires mount_path")?
                        .clone(),
                    key_name: config.settings.get("key_name")
                        .context("Vault HSM requires key_name")?
                        .clone(),
                    namespace: config.settings.get("namespace").cloned(),
                    timeout_ms: config.timeout_ms,
                };
                let backend = vault_hsm::VaultHSMBackend::new(vault_hsm_config).await?;
                Ok(Box::new(backend))
            }
            BackendType::AWSKMS => {
                let aws_config = aws_kms::AWSKMSConfig {
                    region: config.settings.get("region")
                        .context("AWS KMS requires region")?
                        .clone(),
                    key_id: config.settings.get("key_id")
                        .context("AWS KMS requires key_id")?
                        .clone(),
                    role_arn: config.settings.get("role_arn").cloned(),
                    external_id: config.settings.get("external_id").cloned(),
                    timeout_ms: config.timeout_ms,
                };
                let backend = aws_kms::AWSKMSBackend::new(aws_config).await?;
                Ok(Box::new(backend))
            }
            BackendType::GCPKMS => {
                let gcp_config = gcp_kms::GCPKMSConfig {
                    project_id: config.settings.get("project_id")
                        .context("GCP KMS requires project_id")?
                        .clone(),
                    location_id: config.settings.get("location_id")
                        .context("GCP KMS requires location_id")?
                        .clone(),
                    key_ring_id: config.settings.get("key_ring_id")
                        .context("GCP KMS requires key_ring_id")?
                        .clone(),
                    key_id: config.settings.get("key_id")
                        .context("GCP KMS requires key_id")?
                        .clone(),
                    version_id: config.settings.get("version_id")
                        .context("GCP KMS requires version_id")?
                        .clone(),
                    service_account_key: config.settings.get("service_account_key").cloned(),
                    timeout_ms: config.timeout_ms,
                };
                let backend = gcp_kms::GCPKMSBackend::new(gcp_config).await?;
                Ok(Box::new(backend))
            }
            BackendType::Software => {
                // Will be implemented as fallback
                anyhow::bail!("Software backend not yet implemented")
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_backend_config_validation() {
        let mut config = BackendConfig {
            backend_type: BackendType::VaultTransit,
            settings: HashMap::new(),
            timeout_ms: 5000,
            max_retries: 3,
        };
        
        // Missing required settings should fail
        assert!(VaultTransitBackend::new(&config).is_err());
        
        // Adding required settings should work
        config.settings.insert("vault_addr".to_string(), "http://localhost:8200".to_string());
        config.settings.insert("vault_token".to_string(), "test-token".to_string());
        
        // Note: This will still fail without actual Vault running, but struct creation should work
        assert!(VaultTransitBackend::new(&config).is_ok());
    }
}
