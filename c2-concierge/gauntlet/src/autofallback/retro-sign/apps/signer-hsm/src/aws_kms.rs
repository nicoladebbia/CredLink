//! AWS KMS Signing Backend
//! 
//! Provides integration with AWS Key Management Service for ECDSA P-256 signing

use anyhow::{Context, Result};
use async_trait::async_trait;
use aws_config::{BehaviorVersion, defaults};
use aws_sdk_kms::{Client, Config as KmsConfig, Region};
use aws_sdk_kms::primitives::Blob;
use aws_types::SdkConfig;
use base64::{Engine as _, engine::general_purpose};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Duration;
use tracing::{debug, error, info, warn};

use crate::{SignBackend, BackendType, KeyMetadata, HealthStatus, AttestationData};

/// AWS KMS backend configuration
#[derive(Debug, Clone)]
pub struct AWSKMSConfig {
    pub region: String,
    pub key_id: String,
    pub role_arn: Option<String>,
    pub external_id: Option<String>,
    pub timeout_ms: u64,
}

/// AWS KMS signing backend
pub struct AWSKMSBackend {
    client: Client,
    config: AWSKMSConfig,
    key_metadata: KeyMetadata,
}

impl AWSKMSBackend {
    pub async fn new(config: AWSKMSConfig) -> Result<Self> {
        info!("Initializing AWS KMS backend for key: {}", config.key_id);
        
        // Load AWS configuration
        let mut aws_config_loader = defaults(BehaviorVersion::latest());
        
        // Set region
        aws_config_loader = aws_config_loader.region(Region::new(config.region.clone()));
        
        // Configure role if provided
        if let Some(role_arn) = &config.role_arn {
            let mut sts_config = aws_sdk_sts::config::Builder::from(&aws_config_loader)
                .region(Region::new(config.region.clone()));
            
            let sts_client = aws_sdk_sts::Client::from_conf(
                sts_config.build()
            );
            
            let assume_role_result = sts_client
                .assume_role()
                .role_arn(role_arn)
                .role_session_name("c2c-signer-hsm")
                .external_id(config.external_id.as_deref().unwrap_or(""))
                .duration_seconds(std::time::Duration::from_secs(3600))
                .send()
                .await
                .context("Failed to assume AWS role")?;
            
            if let Some(credentials) = assume_role_result.credentials() {
                aws_config_loader = aws_config_loader.credentials_provider(
                    aws_types::credentials::SharedCredentialsProvider::new(
                        aws_types::credentials::Credentials::new(
                            credentials.access_key_id(),
                            credentials.secret_access_key(),
                            credentials.session_token(),
                            None,
                            "AssumeRole",
                        )
                    )
                );
            }
        }
        
        let aws_config = aws_config_loader.load().await;
        
        // Create KMS client
        let kms_config = KmsConfig::builder()
            .region(Region::new(config.region.clone()))
            .build();
        let client = Client::from_conf(kms_config);
        
        // Get key metadata
        let key_metadata = Self::fetch_key_metadata(&client, &config).await?;
        
        // Test connectivity
        client.list_keys().send().await
            .context("Failed to connect to AWS KMS")?;
        
        info!("AWS KMS backend initialized successfully");
        
        Ok(Self {
            client,
            config,
            key_metadata,
        })
    }
    
    async fn fetch_key_metadata(client: &Client, config: &AWSKMSConfig) -> Result<KeyMetadata> {
        debug!("Fetching metadata for AWS KMS key: {}", config.key_id);
        
        // Get key information
        let describe_key_result = client
            .describe_key()
            .key_id(&config.key_id)
            .send()
            .await
            .context("Failed to describe AWS KMS key")?;
        
        let key_metadata = describe_key_result.key_metadata()
            .context("No key metadata in response")?;
        
        // Get public key for certificate generation
        let get_public_key_result = client
            .get_public_key()
            .key_id(&config.key_id)
            .send()
            .await
            .context("Failed to get public key from AWS KMS")?;
        
        let public_key_bytes = get_public_key_result.public_key()
            .context("No public key in response")?
            .as_ref()
            .to_vec();
        
        // Convert public key to PEM format
        let public_key_pem = Self::public_key_to_pem(&public_key_bytes)?;
        
        // Extract key ARN and creation date
        let key_arn = key_metadata.arn()
            .context("No key ARN in metadata")?
            .to_string();
        
        let creation_date = key_metadata.creation_date()
            .context("No creation date in metadata")?;
        
        // Generate mock certificate chain (in production, this would be issued by your CA)
        let cert_chain = vec![public_key_pem.clone()];
        
        Ok(KeyMetadata {
            key_id: key_arn.clone(),
            tenant_id: key_arn.split('/').last().unwrap_or(&key_arn).to_string(),
            backend_type: BackendType::AWSKMS,
            algorithm: "ES256".to_string(),
            created_at: *creation_date,
            not_before: *creation_date,
            not_after: chrono::Utc::now() + chrono::Duration::days(90),
            attestation: Some(AttestationData {
                device_serial: None, // Cloud KMS doesn't have device serials
                slot_id: Some(config.key_id.clone()),
                certificate_chain: cert_chain,
                vendor_info: {
                    let mut info = HashMap::new();
                    info.insert("aws_region".to_string(), config.region.clone());
                    info.insert("key_spec".to_string(), "ECC_NIST_P256".to_string());
                    info.insert("key_usage".to_string(), "SIGN_VERIFY".to_string());
                    info
                },
            }),
        })
    }
    
    fn public_key_to_pem(public_key_bytes: &[u8]) -> Result<String> {
        use simple_asn1::{ASN1Block, BigUint, OID};
        
        // Parse the DER-encoded public key and convert to PEM
        // This is a simplified implementation - in production you'd use a proper crypto library
        
        let spki_der = self::aws_kms_utils::public_key_to_spki_der(public_key_bytes)?;
        let spki_base64 = general_purpose::STANDARD.encode(&spki_der);
        
        let pem = format!(
            "-----BEGIN PUBLIC KEY-----\n{}\n-----END PUBLIC KEY-----",
            textwrap::fill(&spki_base64, 64)
        );
        
        Ok(pem)
    }
}

#[async_trait]
impl SignBackend for AWSKMSBackend {
    async fn sign_es256(&self, tenant: &str, digest: &[u8]) -> Result<Vec<u8>> {
        debug!("AWS KMS signing for tenant: {}", tenant);
        
        // Verify digest length (SHA-256 = 32 bytes)
        if digest.len() != 32 {
            anyhow::bail!("Digest must be 32 bytes for SHA-256");
        }
        
        // Sign with AWS KMS
        let sign_result = self.client
            .sign()
            .key_id(&self.config.key_id)
            .message(Blob::new(digest))
            .message_type(aws_sdk_kms::types::MessageType::Digest)
            .signing_algorithm(aws_sdk_kms::types::SigningAlgorithmSpec::EcdsaSha256)
            .send()
            .await
            .context("Failed to sign with AWS KMS")?;
        
        let signature_bytes = sign_result.signature()
            .context("No signature in AWS KMS response")?
            .as_ref()
            .to_vec();
        
        // AWS KMS returns DER-encoded signature for ECDSA
        // Verify it's a valid DER signature
        if signature_bytes.len() < 8 {
            anyhow::bail!("Invalid signature length from AWS KMS");
        }
        
        info!("Successfully signed digest with AWS KMS for tenant: {}", tenant);
        Ok(signature_bytes)
    }
    
    async fn pubkey_pem(&self, tenant: &str) -> Result<String> {
        debug!("AWS KMS getting public key for tenant: {}", tenant);
        
        // Get public key from KMS
        let get_public_key_result = self.client
            .get_public_key()
            .key_id(&self.config.key_id)
            .send()
            .await
            .context("Failed to get public key from AWS KMS")?;
        
        let public_key_bytes = get_public_key_result.public_key()
            .context("No public key in response")?
            .as_ref()
            .to_vec();
        
        // Convert to PEM
        let public_key_pem = Self::public_key_to_pem(&public_key_bytes)?;
        
        Ok(public_key_pem)
    }
    
    async fn key_metadata(&self, tenant: &str) -> Result<KeyMetadata> {
        Ok(self.key_metadata.clone())
    }
    
    async fn health_check(&self) -> Result<HealthStatus> {
        let start = std::time::Instant::now();
        
        match self.client.list_keys().limit(1).send().await {
            Ok(_) => Ok(HealthStatus {
                backend_type: BackendType::AWSKMS,
                is_healthy: true,
                latency_ms: start.elapsed().as_millis() as u64,
                error_message: None,
                last_check: chrono::Utc::now(),
            }),
            Err(e) => Ok(HealthStatus {
                backend_type: BackendType::AWSKMS,
                is_healthy: false,
                latency_ms: start.elapsed().as_millis() as u64,
                error_message: Some(e.to_string()),
                last_check: chrono::Utc::now(),
            }),
        }
    }
    
    fn backend_type(&self) -> BackendType {
        BackendType::AWSKMS
    }
}

/// AWS KMS utility functions
pub mod aws_kms_utils {
    use anyhow::{Context, Result};
    
    /// Convert AWS KMS public key to SubjectPublicKeyInfo (SPKI) DER format
    pub fn public_key_to_spki_der(public_key_bytes: &[u8]) -> Result<Vec<u8>> {
        use simple_asn1::{ASN1Block, BigUint, OID};
        
        // AWS KMS returns the public key in EC point format (uncompressed)
        // For P-256, this is 0x04 + X (32 bytes) + Y (32 bytes) = 65 bytes
        
        if public_key_bytes.len() != 65 {
            anyhow::bail!("Invalid EC public key length from AWS KMS");
        }
        
        if public_key_bytes[0] != 0x04 {
            anyhow::bail!("Invalid EC public key format from AWS KMS");
        }
        
        // Extract X and Y coordinates
        let x_bytes = &public_key_bytes[1..33];
        let y_bytes = &public_key_bytes[33..65];
        
        // Create ASN.1 structure for EC public key
        let ec_public_key = ASN1Block::Sequence(vec![
            ASN1Block::Integer(0, BigUint::from(&x_bytes[..])),
            ASN1Block::Integer(0, BigUint::from(&y_bytes[..])),
        ]);
        
        // Create SubjectPublicKeyInfo structure
        let spki = ASN1Block::Sequence(vec![
            // Algorithm identifier
            ASN1Block::Sequence(vec![
                ASN1Block::ObjectIdentifier(vec![1, 2, 840, 10045, 2, 1]), // ecPublicKey
                ASN1Block::ObjectIdentifier(vec![1, 3, 132, 0, 34]), // prime256v1 (P-256)
            ]),
            // Public key bit string
            ASN1Block::BitString(0, public_key_bytes.to_vec()),
        ]);
        
        // Encode to DER
        let der = yasna::construct_der(|writer| {
            spki.write_der(writer)
        });
        
        Ok(der)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_aws_kms_config_validation() {
        let config = AWSKMSConfig {
            region: "us-east-1".to_string(),
            key_id: "test-key-id".to_string(),
            role_arn: None,
            external_id: None,
            timeout_ms: 5000,
        };
        
        assert_eq!(config.region, "us-east-1");
        assert_eq!(config.key_id, "test-key-id");
        assert!(config.role_arn.is_none());
    }
    
    #[test]
    fn test_public_key_to_spki_der() {
        // Mock P-256 public key (uncompressed format)
        let mock_public_key = vec![
            0x04, // Uncompressed point indicator
            // X coordinate (32 bytes)
            0x59, 0x28, 0x46, 0xe6, 0xd8, 0x23, 0xa8, 0x1f,
            0x55, 0x70, 0x6c, 0x1e, 0x8a, 0x3b, 0x2c, 0x6e,
            0x1a, 0x1f, 0x1f, 0x1f, 0x1f, 0x1f, 0x1f, 0x1f,
            0x1f, 0x1f, 0x1f, 0x1f, 0x1f, 0x1f, 0x1f, 0x1f,
            // Y coordinate (32 bytes)
            0x59, 0x28, 0x46, 0xe6, 0xd8, 0x23, 0xa8, 0x1f,
            0x55, 0x70, 0x6c, 0x1e, 0x8a, 0x3b, 0x2c, 0x6e,
            0x1a, 0x1f, 0x1f, 0x1f, 0x1f, 0x1f, 0x1f, 0x1f,
            0x1f, 0x1f, 0x1f, 0x1f, 0x1f, 0x1f, 0x1f, 0x1f,
        ];
        
        let result = aws_kms_utils::public_key_to_spki_der(&mock_public_key);
        assert!(result.is_ok());
        
        let der = result.unwrap();
        assert!(!der.is_empty());
        assert!(der.len() > 70); // SPKI should be longer than raw key
    }
}
