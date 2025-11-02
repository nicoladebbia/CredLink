//! Google Cloud KMS Signing Backend
//! 
//! Provides integration with Google Cloud Key Management Service for ECDSA P-256 signing

use anyhow::{Context, Result};
use async_trait::async_trait;
use base64::{Engine as _, engine::general_purpose};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Duration;
use tracing::{debug, error, info, warn};

use crate::{SignBackend, BackendType, KeyMetadata, HealthStatus, AttestationData};

/// GCP KMS backend configuration
#[derive(Debug, Clone)]
pub struct GCPKMSConfig {
    pub project_id: String,
    pub location_id: String,
    pub key_ring_id: String,
    pub key_id: String,
    pub version_id: String,
    pub service_account_key: Option<String>,
    pub timeout_ms: u64,
}

/// GCP KMS signing backend
pub struct GCPKMSBackend {
    client: reqwest::Client,
    config: GCPKMSConfig,
    access_token: String,
    key_metadata: KeyMetadata,
}

impl GCPKMSBackend {
    pub async fn new(config: GCPKMSConfig) -> Result<Self> {
        info!("Initializing GCP KMS backend for key: {}/{}", config.key_ring_id, config.key_id);
        
        // Create HTTP client
        let client = reqwest::Client::builder()
            .timeout(Duration::from_millis(config.timeout_ms))
            .build()
            .context("Failed to create HTTP client")?;
        
        // Get access token
        let access_token = Self::get_access_token(&config).await?;
        
        // Get key metadata
        let key_metadata = Self::fetch_key_metadata(&client, &config, &access_token).await?;
        
        // Test connectivity
        Self::test_connectivity(&client, &config, &access_token).await?;
        
        info!("GCP KMS backend initialized successfully");
        
        Ok(Self {
            client,
            config,
            access_token,
            key_metadata,
        })
    }
    
    async fn get_access_token(config: &GCPKMSConfig) -> Result<String> {
        if let Some(service_account_key) = &config.service_account_key {
            // Use service account key for authentication
            Self::get_service_account_token(service_account_key).await
        } else {
            // Use default credentials (metadata server)
            Self::get_metadata_server_token().await
        }
    }
    
    async fn get_service_account_key(service_account_key: &str) -> Result<String> {
        // Parse service account key and get OAuth2 token
        // This is a simplified implementation
        let key_json: serde_json::Value = serde_json::from_str(service_account_key)
            .context("Invalid service account key JSON")?;
        
        let client_email = key_json.get("client_email")
            .and_then(|v| v.as_str())
            .context("Missing client_email in service account key")?;
        
        let private_key = key_json.get("private_key")
            .and_then(|v| v.as_str())
            .context("Missing private_key in service account key")?;
        
        // Create JWT for OAuth2
        let jwt = Self::create_service_account_jwt(client_email, private_key)?;
        
        // Exchange JWT for access token
        let token_response = reqwest::Client::new()
            .post("https://oauth2.googleapis.com/token")
            .form(&[
                ("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer"),
                ("assertion", &jwt),
            ])
            .send()
            .await
            .context("Failed to exchange JWT for access token")?;
        
        let token_json: serde_json::Value = token_response.json().await
            .context("Failed to parse token response")?;
        
        let access_token = token_json.get("access_token")
            .and_then(|v| v.as_str())
            .context("No access_token in response")?;
        
        Ok(access_token.to_string())
    }
    
    async fn get_metadata_server_token() -> Result<String> {
        let token_response = reqwest::Client::new()
            .get("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token")
            .header("Metadata-Flavor", "Google")
            .send()
            .await
            .context("Failed to get token from metadata server")?;
        
        let token_json: serde_json::Value = token_response.json().await
            .context("Failed to parse metadata server token response")?;
        
        let access_token = token_json.get("access_token")
            .and_then(|v| v.as_str())
            .context("No access_token in metadata server response")?;
        
        Ok(access_token.to_string())
    }
    
    fn create_service_account_jwt(client_email: &str, private_key: &str) -> Result<String> {
        use jsonwebtoken::{encode, EncodingKey, Header};
        use serde_json::json;
        
        let now = chrono::Utc::now();
        let exp = now + chrono::Duration::hours(1);
        
        let claims = json!({
            "iss": client_email,
            "scope": "https://www.googleapis.com/auth/cloudkms",
            "aud": "https://oauth2.googleapis.com/token",
            "exp": exp.timestamp(),
            "iat": now.timestamp()
        });
        
        let header = Header::default();
        let encoding_key = EncodingKey::from_rsa_pem(private_key.as_bytes())
            .context("Failed to parse private key")?;
        
        let token = encode(&header, &claims, &encoding_key)
            .context("Failed to create JWT")?;
        
        Ok(token)
    }
    
    async fn fetch_key_metadata(
        client: &reqwest::Client, 
        config: &GCPKMSConfig, 
        access_token: &str
    ) -> Result<KeyMetadata> {
        debug!("Fetching metadata for GCP KMS key: {}/{}", config.key_ring_id, config.key_id);
        
        let key_name = format!(
            "projects/{}/locations/{}/keyRings/{}/cryptoKeys/{}",
            config.project_id, config.location_id, config.key_ring_id, config.key_id
        );
        
        // Get key information
        let get_key_response = client
            .get(&format!("https://cloudkms.googleapis.com/v1/{}", key_name))
            .header("Authorization", format!("Bearer {}", access_token))
            .send()
            .await
            .context("Failed to get GCP KMS key info")?;
        
        let key_info: serde_json::Value = get_key_response.json().await
            .context("Failed to parse GCP KMS key info")?;
        
        // Get public key
        let get_public_key_response = client
            .get(&format!("{}/cryptoKeyVersions/{}/publicKey", key_name, config.version_id))
            .header("Authorization", format!("Bearer {}", access_token))
            .send()
            .await
            .context("Failed to get public key from GCP KMS")?;
        
        let public_key_info: serde_json::Value = get_public_key_response.json().await
            .context("Failed to parse public key info")?;
        
        let public_key_pem = public_key_info.get("pem")
            .and_then(|v| v.as_str())
            .context("No PEM public key in response")?;
        
        // Extract creation time
        let create_time = key_info.get("createTime")
            .and_then(|v| v.as_str())
            .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
            .map(|dt| dt.with_timezone(&chrono::Utc))
            .context("No valid createTime in key info")?;
        
        // Generate certificate chain (in production, this would be issued by your CA)
        let cert_chain = vec![public_key_pem.to_string()];
        
        Ok(KeyMetadata {
            key_id: key_name.clone(),
            tenant_id: format!("{}-{}", config.key_ring_id, config.key_id),
            backend_type: BackendType::GCPKMS,
            algorithm: "ES256".to_string(),
            created_at: create_time,
            not_before: create_time,
            not_after: chrono::Utc::now() + chrono::Duration::days(90),
            attestation: Some(AttestationData {
                device_serial: None, // Cloud KMS doesn't have device serials
                slot_id: Some(config.version_id.clone()),
                certificate_chain: cert_chain,
                vendor_info: {
                    let mut info = HashMap::new();
                    info.insert("project_id".to_string(), config.project_id.clone());
                    info.insert("location".to_string(), config.location_id.clone());
                    info.insert("key_ring".to_string(), config.key_ring_id.clone());
                    info.insert("key_algorithm".to_string(), "EC_SIGN_P256_SHA256".to_string());
                    info.insert("protection_level".to_string(), "SOFTWARE".to_string());
                    info
                },
            }),
        })
    }
    
    async fn test_connectivity(
        client: &reqwest::Client, 
        config: &GCPKMSConfig, 
        access_token: &str
    ) -> Result<()> {
        let key_rings_url = format!(
            "https://cloudkms.googleapis.com/v1/projects/{}/locations/{}/keyRings",
            config.project_id, config.location_id
        );
        
        client
            .get(&key_rings_url)
            .header("Authorization", format!("Bearer {}", access_token))
            .send()
            .await
            .context("Failed to connect to GCP KMS")?;
        
        Ok(())
    }
    
    fn get_crypto_key_version_name(&self) -> String {
        format!(
            "projects/{}/locations/{}/keyRings/{}/cryptoKeys/{}/cryptoKeyVersions/{}",
            self.config.project_id,
            self.config.location_id,
            self.config.key_ring_id,
            self.config.key_id,
            self.config.version_id
        )
    }
}

#[async_trait]
impl SignBackend for GCPKMSBackend {
    async fn sign_es256(&self, tenant: &str, digest: &[u8]) -> Result<Vec<u8>> {
        debug!("GCP KMS signing for tenant: {}", tenant);
        
        // Verify digest length (SHA-256 = 32 bytes)
        if digest.len() != 32 {
            anyhow::bail!("Digest must be 32 bytes for SHA-256");
        }
        
        let key_version_name = self.get_crypto_key_version_name();
        
        // Sign with GCP KMS
        let sign_request = serde_json::json!({
            "digest": {
                "sha256": general_purpose::STANDARD.encode(digest)
            },
            "digestCiphertext": general_purpose::STANDARD.encode(digest)
        });
        
        let sign_response = self.client
            .post(&format!(
                "https://cloudkms.googleapis.com/v1/{}:asymmetricSign",
                key_version_name
            ))
            .header("Authorization", format!("Bearer {}", self.access_token))
            .header("Content-Type", "application/json")
            .json(&sign_request)
            .send()
            .await
            .context("Failed to sign with GCP KMS")?;
        
        let sign_result: serde_json::Value = sign_response.json().await
            .context("Failed to parse GCP KMS sign response")?;
        
        let signature_base64 = sign_result.get("signature")
            .and_then(|v| v.as_str())
            .context("No signature in GCP KMS response")?;
        
        let signature_bytes = general_purpose::STANDARD.decode(signature_base64)
            .context("Failed to decode GCP KMS signature")?;
        
        // GCP KMS returns raw signature (R || S) for ECDSA
        // Convert to DER format if needed
        let der_signature = self::gcp_kms_utils::raw_ecdsa_to_der(&signature_bytes)?;
        
        info!("Successfully signed digest with GCP KMS for tenant: {}", tenant);
        Ok(der_signature)
    }
    
    async fn pubkey_pem(&self, tenant: &str) -> Result<String> {
        debug!("GCP KMS getting public key for tenant: {}", tenant);
        
        let key_version_name = self.get_crypto_key_version_name();
        
        let get_public_key_response = self.client
            .get(&format!(
                "https://cloudkms.googleapis.com/v1/{}/publicKey",
                key_version_name
            ))
            .header("Authorization", format!("Bearer {}", self.access_token))
            .send()
            .await
            .context("Failed to get public key from GCP KMS")?;
        
        let public_key_info: serde_json::Value = get_public_key_response.json().await
            .context("Failed to parse public key info")?;
        
        let public_key_pem = public_key_info.get("pem")
            .and_then(|v| v.as_str())
            .context("No PEM public key in response")?;
        
        Ok(public_key_pem.to_string())
    }
    
    async fn key_metadata(&self, tenant: &str) -> Result<KeyMetadata> {
        Ok(self.key_metadata.clone())
    }
    
    async fn health_check(&self) -> Result<HealthStatus> {
        let start = std::time::Instant::now();
        
        let key_rings_url = format!(
            "https://cloudkms.googleapis.com/v1/projects/{}/locations/{}/keyRings",
            self.config.project_id, self.config.location_id
        );
        
        match self.client
            .get(&key_rings_url)
            .header("Authorization", format!("Bearer {}", self.access_token))
            .send()
            .await 
        {
            Ok(_) => Ok(HealthStatus {
                backend_type: BackendType::GCPKMS,
                is_healthy: true,
                latency_ms: start.elapsed().as_millis() as u64,
                error_message: None,
                last_check: chrono::Utc::now(),
            }),
            Err(e) => Ok(HealthStatus {
                backend_type: BackendType::GCPKMS,
                is_healthy: false,
                latency_ms: start.elapsed().as_millis() as u64,
                error_message: Some(e.to_string()),
                last_check: chrono::Utc::now(),
            }),
        }
    }
    
    fn backend_type(&self) -> BackendType {
        BackendType::GCPKMS
    }
}

/// GCP KMS utility functions
pub mod gcp_kms_utils {
    use anyhow::{Context, Result};
    
    /// Convert GCP KMS raw ECDSA signature to DER format
    pub fn raw_ecdsa_to_der(raw_signature: &[u8]) -> Result<Vec<u8>> {
        // GCP KMS returns raw signature (R || S) where R and S are 32 bytes each for P-256
        if raw_signature.len() != 64 {
            anyhow::bail!("Invalid raw ECDSA signature length: expected 64, got {}", raw_signature.len());
        }
        
        let r_bytes = &raw_signature[0..32];
        let s_bytes = &raw_signature[32..64];
        
        // Remove leading zeros but keep at least one byte
        let r_trimmed = trim_leading_zeros(r_bytes);
        let s_trimmed = trim_leading_zeros(s_bytes);
        
        // Create DER-encoded signature
        let der = yasna::construct_der(|writer| {
            writer.write_sequence(|writer| {
                // Write R
                writer.write_sequence(|writer| {
                    writer.write_i8(0x02); // INTEGER tag
                    writer.write_bytes(&r_trimmed);
                });
                
                // Write S
                writer.write_sequence(|writer| {
                    writer.write_i8(0x02); // INTEGER tag
                    writer.write_bytes(&s_trimmed);
                });
            });
        });
        
        Ok(der)
    }
    
    fn trim_leading_zeros(bytes: &[u8]) -> Vec<u8> {
        let mut start = 0;
        while start < bytes.len() - 1 && bytes[start] == 0 {
            start += 1;
        }
        
        // If the first byte has the high bit set, add a leading zero
        let trimmed = &bytes[start..];
        if !trimmed.is_empty() && (trimmed[0] & 0x80) != 0 {
            let mut result = vec![0];
            result.extend_from_slice(trimmed);
            result
        } else {
            trimmed.to_vec()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_gcp_kms_config_validation() {
        let config = GCPKMSConfig {
            project_id: "test-project".to_string(),
            location_id: "us-central1".to_string(),
            key_ring_id: "test-keyring".to_string(),
            key_id: "test-key".to_string(),
            version_id: "1".to_string(),
            service_account_key: None,
            timeout_ms: 5000,
        };
        
        assert_eq!(config.project_id, "test-project");
        assert_eq!(config.location_id, "us-central1");
        assert_eq!(config.key_ring_id, "test-keyring");
        assert_eq!(config.key_id, "test-key");
        assert_eq!(config.version_id, "1");
    }
    
    #[test]
    fn test_raw_ecdsa_to_der() {
        // Mock raw signature (64 bytes: R || S)
        let mock_raw_signature = vec![
            // R coordinate (32 bytes)
            0x59, 0x28, 0x46, 0xe6, 0xd8, 0x23, 0xa8, 0x1f,
            0x55, 0x70, 0x6c, 0x1e, 0x8a, 0x3b, 0x2c, 0x6e,
            0x1a, 0x1f, 0x1f, 0x1f, 0x1f, 0x1f, 0x1f, 0x1f,
            0x1f, 0x1f, 0x1f, 0x1f, 0x1f, 0x1f, 0x1f, 0x1f,
            // S coordinate (32 bytes)
            0x59, 0x28, 0x46, 0xe6, 0xd8, 0x23, 0xa8, 0x1f,
            0x55, 0x70, 0x6c, 0x1e, 0x8a, 0x3b, 0x2c, 0x6e,
            0x1a, 0x1f, 0x1f, 0x1f, 0x1f, 0x1f, 0x1f, 0x1f,
            0x1f, 0x1f, 0x1f, 0x1f, 0x1f, 0x1f, 0x1f, 0x1f,
        ];
        
        let result = gcp_kms_utils::raw_ecdsa_to_der(&mock_raw_signature);
        assert!(result.is_ok());
        
        let der = result.unwrap();
        assert!(!der.is_empty());
        // DER signature should start with SEQUENCE tag (0x30)
        assert_eq!(der[0], 0x30);
    }
    
    #[test]
    fn test_trim_leading_zeros() {
        let bytes = vec![0x00, 0x00, 0x01, 0x02, 0x03];
        let trimmed = gcp_kms_utils::trim_leading_zeros(&bytes);
        assert_eq!(trimmed, vec![0x01, 0x02, 0x03]);
        
        // Test high bit case
        let high_bit_bytes = vec![0x00, 0x80, 0x01, 0x02];
        let trimmed_high = gcp_kms_utils::trim_leading_zeros(&high_bit_bytes);
        assert_eq!(trimmed_high, vec![0x00, 0x80, 0x01, 0x02]);
    }
}
