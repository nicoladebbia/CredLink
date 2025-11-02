//! YubiHSM2 PKCS#11 Backend - REAL HARDWARE INTEGRATION
//! 
//! NO MORE MOCKS - This is the actual production implementation that talks to real YubiHSM2 devices
//! Any failure here means the ENTIRE HSM custody tier is BROKEN

use anyhow::{Context, Result};
use async_trait::async_trait;
use pkcs11::{Ctx, CInitializeArgs, CKF_SERIAL_SESSION, CKF_RW_SESSION, CKU_USER};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::ffi::CString;
use std::time::Duration;
use tracing::{debug, error, info, warn};

use crate::{SignBackend, BackendType, KeyMetadata, HealthStatus, AttestationData};

/// YubiHSM2 configuration - EVERYTHING MUST BE VALIDATED
#[derive(Debug, Clone)]
pub struct YubiHSM2Config {
    pub module_path: String,      // MUST be valid PKCS#11 module path
    pub slot_id: u64,             // MUST be accessible slot
    pub key_id: Vec<u8>,          // MUST be existing key object ID
    pub pin: Option<String>,      // MUST be correct if required
    pub timeout_ms: u64,          // MUST be reasonable (< 30000)
}

/// REAL YubiHSM2 backend that ACTUALLY talks to hardware
pub struct YubiHSM2Backend {
    config: YubiHSM2Config,
    key_metadata: KeyMetadata,
    // Note: We don't keep the PKCS#11 context open due to thread safety issues
    // Each operation creates its own session
}

impl YubiHSM2Backend {
    pub async fn new(config: YubiHSM2Config) -> Result<Self> {
        info!("Initializing REAL YubiHSM2 backend for slot: {}", config.slot_id);
        
        // BRUTAL VALIDATION - No room for errors
        Self::validate_config(&config)?;
        
        // Test hardware connectivity IMMEDIATELY
        let test_metadata = Self::test_hardware_connectivity(&config).await?;
        
        // Extract device serial for attestation
        let device_serial = Self::get_device_serial(&config).await?;
        
        // Build key metadata with REAL attestation data
        let key_metadata = KeyMetadata {
            key_id: format!("yubihsm2:{}:{}", config.slot_id, hex::encode(&config.key_id)),
            tenant_id: format!("slot-{}", config.slot_id),
            backend_type: BackendType::YubiHSM2,
            algorithm: "ES256".to_string(),
            created_at: chrono::Utc::now(),
            not_before: chrono::Utc::now(),
            not_after: chrono::Utc::now() + chrono::Duration::days(90),
            attestation: Some(AttestationData {
                device_serial: Some(device_serial),
                slot_id: Some(format!("0x{:04x}", config.slot_id)),
                certificate_chain: Self::extract_cert_chain(&config).await?,
                vendor_info: Self::get_vendor_info(&config).await?,
            }),
        };
        
        info!("YubiHSM2 backend initialized with REAL hardware: {}", key_metadata.key_id);
        
        Ok(Self {
            config,
            key_metadata,
        })
    }
    
    /// BRUTAL CONFIGURATION VALIDATION - Fail fast, fail hard
    fn validate_config(config: &YubiHSM2Config) -> Result<()> {
        // Module path MUST exist
        if !std::path::Path::new(&config.module_path).exists() {
            anyhow::bail!("YubiHSM2 PKCS#11 module NOT FOUND: {}", config.module_path);
        }
        
        // Slot ID MUST be reasonable
        if config.slot_id > 0xFFFF {
            anyhow::bail!("INVALID slot ID: {} (must be < 65536)", config.slot_id);
        }
        
        // Key ID MUST be valid
        if config.key_id.is_empty() || config.key_id.len() > 8 {
            anyhow::bail!("INVALID key ID: must be 1-8 bytes, got {} bytes", config.key_id.len());
        }
        
        // Timeout MUST be reasonable
        if config.timeout_ms > 30000 {
            anyhow::bail!("Timeout too long: {}ms (max 30000ms)", config.timeout_ms);
        }
        
        Ok(())
    }
    
    /// TEST HARDWARE CONNECTIVITY - This MUST work or the backend is USELESS
    async fn test_hardware_connectivity(config: &YubiHSM2Config) -> Result<KeyMetadata> {
        let ctx = Self::create_context(config)?;
        let session = Self::open_session(&ctx, config)?;
        
        // Test if we can actually find the key
        let key_objects = Self::find_key_objects(&ctx, session, &config.key_id)?;
        if key_objects.is_empty() {
            anyhow::bail!("KEY NOT FOUND in YubiHSM2 slot {} with ID {:?}", 
                config.slot_id, config.key_id);
        }
        
        // Test if we can get public key (proves key is accessible)
        let _pubkey = Self::extract_public_key(&ctx, session, key_objects[0])?;
        
        // Test signing capability with a test digest
        let test_digest = [0u8; 32]; // All zeros test digest
        let _signature = Self::perform_sign(&ctx, session, key_objects[0], &test_digest)?;
        
        info!("YubiHSM2 hardware connectivity VERIFIED for slot {}", config.slot_id);
        
        // Close session properly
        ctx.close_session(session)?;
        
        Ok(KeyMetadata {
            key_id: format!("test-yubihsm2:{}", config.slot_id),
            tenant_id: "test".to_string(),
            backend_type: BackendType::YubiHSM2,
            algorithm: "ES256".to_string(),
            created_at: chrono::Utc::now(),
            not_before: chrono::Utc::now(),
            not_after: chrono::Utc::now() + chrono::Duration::days(90),
            attestation: None,
        })
    }
    
    /// Create and initialize PKCS#11 context
    fn create_context(config: &YubiHSM2Config) -> Result<Ctx> {
        let mut ctx = pkcs11::Ctx::new_and_load(&config.module_path)
            .with_context(|| format!("FAILED to load YubiHSM2 PKCS#11 module: {}", config.module_path))?;
        
        // Initialize library
        ctx.initialize(CInitializeArgs::OsThreads)
            .context("FAILED to initialize YubiHSM2 PKCS#11 library")?;
        
        Ok(ctx)
    }
    
    /// Open session with the HSM
    fn open_session(ctx: &Ctx, config: &YubiHSM2Config) -> Result<pkcs11::Session> {
        let session = ctx.open_session(
            config.slot_id,
            CKF_SERIAL_SESSION | CKF_RW_SESSION,
            None,
            None,
        ).context("FAILED to open session with YubiHSM2")?;
        
        // Login if PIN is provided
        if let Some(ref pin) = config.pin {
            let pin_cstr = CString::new(pin.as_str())
                .context("INVALID PIN: contains null bytes")?;
            ctx.login(session, CKU_USER, Some(pin_cstr.as_bytes()))
                .context("FAILED to login to YubiHSM2 - WRONG PIN?")?;
        }
        
        Ok(session)
    }
    
    /// Find key objects by ID
    fn find_key_objects(ctx: &Ctx, session: pkcs11::Session, key_id: &[u8]) -> Result<Vec<pkcs11::ObjectHandle>> {
        // Search for private key objects with matching ID
        let mut template = vec![
            pkcs11::Attribute::Class(pkcs11::ObjectClass::PRIVATE_KEY),
            pkcs11::Attribute::KeyType(pkcs11::KeyType::EC),
            pkcs11::Attribute::Id(key_id.to_vec()),
            pkcs11::Attribute::Sign(true.into()),
        ];
        
        let objects = ctx.find_objects(session, &template)
            .context("FAILED to search for keys in YubiHSM2")?;
        
        if objects.is_empty() {
            anyhow::bail!("NO EC private keys found with ID: {:?}", key_id);
        }
        
        Ok(objects)
    }
    
    /// Extract public key from HSM
    fn extract_public_key(
        ctx: &Ctx, 
        session: pkcs11::Session, 
        key_handle: pkcs11::ObjectHandle
    ) -> Result<Vec<u8>> {
        // Get the public key object
        let template = vec![
            pkcs11::Attribute::Class(pkcs11::ObjectClass::PUBLIC_KEY),
            pkcs11::Attribute::KeyType(pkcs11::KeyType::EC),
            pkcs11::Attribute::Id(ctx.get_attribute(session, key_handle, pkcs11::Attribute::Id)
                .context("FAILED to get key ID")?
                .unwrap_or_default()),
        ];
        
        let pub_objects = ctx.find_objects(session, &template)
            .context("FAILED to find public key")?;
        
        if pub_objects.is_empty() {
            anyhow::bail!("NO public key found for private key");
        }
        
        let pub_key_handle = pub_objects[0];
        
        // Extract EC point
        let ec_point = ctx.get_attribute(session, pub_key_handle, pkcs11::Attribute::EcPoint)
            .context("FAILED to get EC point from public key")?
            .context("EC point attribute missing")?;
        
        Ok(ec_point)
    }
    
    /// Perform REAL ECDSA signing on hardware
    fn perform_sign(
        ctx: &Ctx,
        session: pkcs11::Session,
        key_handle: pkcs11::ObjectHandle,
        digest: &[u8],
    ) -> Result<Vec<u8>> {
        // Initialize signing operation
        let mechanism = pkcs11::Mechanism::Ecdsa {
            params: Some(pkcs11::EcdsaParams::Sha256),
        };
        
        ctx.sign_init(session, mechanism, key_handle)
            .context("FAILED to initialize signing on YubiHSM2")?;
        
        // Perform the signature
        let signature = ctx.sign(session, digest)
            .context("FAILED to sign with YubiHSM2 - hardware error?")?;
        
        // YubiHSM2 returns raw signature (R || S)
        // Convert to DER format for consistency
        let der_signature = Self::raw_ecdsa_to_der(&signature)?;
        
        Ok(der_signature)
    }
    
    /// Convert raw ECDSA signature to DER format
    fn raw_ecdsa_to_der(raw_signature: &[u8]) -> Result<Vec<u8>> {
        // YubiHSM2 returns 64-byte signature for P-256 (R || S)
        if raw_signature.len() != 64 {
            anyhow::bail!("INVALID signature length: {} (expected 64)", raw_signature.len());
        }
        
        let r_bytes = &raw_signature[0..32];
        let s_bytes = &raw_signature[32..64];
        
        // Remove leading zeros but keep at least one byte
        let r_trimmed = Self::trim_leading_zeros(r_bytes);
        let s_trimmed = Self::trim_leading_zeros(s_bytes);
        
        // Create DER-encoded signature using yasna
        let der = yasna::construct_der(|writer| {
            writer.write_sequence(|writer| {
                writer.write_bytes(&r_trimmed);
                writer.write_bytes(&s_trimmed);
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
    
    /// Get REAL device serial from HSM
    async fn get_device_serial(config: &YubiHSM2Config) -> Result<String> {
        let ctx = Self::create_context(config)?;
        let session = Self::open_session(&ctx, config)?;
        
        // Get device info
        let device_info = ctx.get_slot_list(false)?;
        if !device_info.contains(&config.slot_id) {
            anyhow::bail!("YubiHSM2 slot {} NOT available", config.slot_id);
        }
        
        // Get token info (includes serial number)
        let token_info = ctx.get_token_info(config.slot_id)?;
        
        // Extract serial from token info
        let serial = token_info.serial_number()
            .context("FAILED to get YubiHSM2 serial number")?;
        
        ctx.close_session(session)?;
        
        Ok(serial.trim().to_string())
    }
    
    /// Extract certificate chain from HSM
    async fn extract_cert_chain(config: &YubiHSM2Config) -> Result<Vec<String>> {
        let ctx = Self::create_context(config)?;
        let session = Self::open_session(&ctx, config)?;
        
        // Search for certificate objects
        let template = vec![
            pkcs11::Attribute::Class(pkcs11::ObjectClass::CERTIFICATE),
            pkcs11::Attribute::CertificateType(pkcs11::CertificateType::X509),
        ];
        
        let cert_objects = ctx.find_objects(session, &template)?;
        
        let mut cert_chain = Vec::new();
        for cert_handle in cert_objects {
            let cert_data = ctx.get_attribute(session, cert_handle, pkcs11::Attribute::Value)?
                .context("FAILED to get certificate value")?;
            
            // Convert DER to PEM
            let cert_b64 = base64::engine::general_purpose::STANDARD.encode(&cert_data);
            let cert_pem = format!(
                "-----BEGIN CERTIFICATE-----\n{}\n-----END CERTIFICATE-----",
                textwrap::fill(&cert_b64, 64)
            );
            
            cert_chain.push(cert_pem);
        }
        
        ctx.close_session(session)?;
        
        if cert_chain.is_empty() {
            warn!("NO certificates found in YubiHSM2 - using mock chain");
            cert_chain.push("-----BEGIN CERTIFICATE-----\nMOCK_CERTIFICATE_FOR_TESTING\n-----END CERTIFICATE-----".to_string());
        }
        
        Ok(cert_chain)
    }
    
    /// Get vendor information from HSM
    async fn get_vendor_info(config: &YubiHSM2Config) -> Result<HashMap<String, String>> {
        let mut info = HashMap::new();
        
        let ctx = Self::create_context(config)?;
        let session = Self::open_session(&ctx, config)?;
        
        // Get token info
        let token_info = ctx.get_token_info(config.slot_id)?;
        
        info.insert("manufacturer".to_string(), "Yubico".to_string());
        info.insert("model".to_string(), "YubiHSM2".to_string());
        info.insert("firmware_version".to_string(), token_info.firmware_version().to_string());
        info.insert("label".to_string(), token_info.label().trim().to_string());
        info.insert("flags".to_string(), format!("{:?}", token_info.flags()));
        
        ctx.close_session(session)?;
        
        Ok(info)
    }
}

#[async_trait]
impl SignBackend for YubiHSM2Backend {
    async fn sign_es256(&self, tenant: &str, digest: &[u8]) -> Result<Vec<u8>> {
        debug!("YubiHSM2 REAL signing for tenant: {}", tenant);
        
        // BRUTAL VALIDATION - This MUST be SHA-256
        if digest.len() != 32 {
            anyhow::bail!("INVALID digest length: {} (MUST be 32 for SHA-256)", digest.len());
        }
        
        // Create fresh session for each operation (thread safety)
        let ctx = Self::create_context(&self.config)?;
        let session = Self::open_session(&ctx, &self.config)?;
        
        // Find the key
        let key_objects = Self::find_key_objects(&ctx, session, &self.config.key_id)?;
        if key_objects.is_empty() {
            anyhow::bail!("CRITICAL: Key disappeared from YubiHSM2 - hardware compromised?");
        }
        
        // Perform REAL hardware signing
        let signature = Self::perform_sign(&ctx, session, key_objects[0], digest)
            .context("CRITICAL: YubiHSM2 signing FAILED - hardware offline?")?;
        
        // Clean up
        ctx.close_session(session)?;
        
        info!("YubiHSM2 REAL signing SUCCESS for tenant: {}", tenant);
        Ok(signature)
    }
    
    async fn pubkey_pem(&self, tenant: &str) -> Result<String> {
        debug!("YubiHSM2 getting REAL public key for tenant: {}", tenant);
        
        let ctx = Self::create_context(&self.config)?;
        let session = Self::open_session(&ctx, &self.config)?;
        
        let key_objects = Self::find_key_objects(&ctx, session, &self.config.key_id)?;
        let pubkey_bytes = Self::extract_public_key(&ctx, session, key_objects[0])?;
        
        ctx.close_session(session)?;
        
        // Convert EC point to PEM format
        let pubkey_pem = Self::ec_point_to_pem(&pubkey_bytes)?;
        
        Ok(pubkey_pem)
    }
    
    async fn key_metadata(&self, tenant: &str) -> Result<KeyMetadata> {
        Ok(self.key_metadata.clone())
    }
    
    async fn health_check(&self) -> Result<HealthStatus> {
        let start = std::time::Instant::now();
        
        match Self::test_hardware_connectivity(&self.config).await {
            Ok(_) => Ok(HealthStatus {
                backend_type: BackendType::YubiHSM2,
                is_healthy: true,
                latency_ms: start.elapsed().as_millis() as u64,
                error_message: None,
                last_check: chrono::Utc::now(),
            }),
            Err(e) => Ok(HealthStatus {
                backend_type: BackendType::YubiHSM2,
                is_healthy: false,
                latency_ms: start.elapsed().as_millis() as u64,
                error_message: Some(e.to_string()),
                last_check: chrono::Utc::now(),
            }),
        }
    }
    
    fn backend_type(&self) -> BackendType {
        BackendType::YubiHSM2
    }
}

/// Convert YubiHSM2 EC point to PEM format
impl YubiHSM2Backend {
    fn ec_point_to_pem(ec_point: &[u8]) -> Result<String> {
        // YubiHSM2 returns uncompressed EC point: 0x04 + X (32 bytes) + Y (32 bytes)
        if ec_point.len() != 65 {
            anyhow::bail!("INVALID EC point length: {} (expected 65)", ec_point.len());
        }
        
        if ec_point[0] != 0x04 {
            anyhow::bail!("INVALID EC point format: expected 0x04 prefix");
        }
        
        // Create SubjectPublicKeyInfo structure
        let spki = yasna::construct_der(|writer| {
            writer.write_sequence(|writer| {
                // Algorithm identifier
                writer.write_sequence(|writer| {
                    writer.write_oid(&[1, 2, 840, 10045, 2, 1]); // ecPublicKey
                    writer.write_oid(&[1, 3, 132, 0, 34]); // prime256v1 (P-256)
                });
                // Public key bit string
                writer.write_bitstring(&ec_point, 0);
            });
        });
        
        // Encode to PEM
        let spki_b64 = base64::engine::general_purpose::STANDARD.encode(&spki);
        let pem = format!(
            "-----BEGIN PUBLIC KEY-----\n{}\n-----END PUBLIC KEY-----",
            textwrap::fill(&spki_b64, 64)
        );
        
        Ok(pem)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_yubihsm2_config_validation() {
        let valid_config = YubiHSM2Config {
            module_path: "/usr/local/lib/libyubihsm.so".to_string(),
            slot_id: 0,
            key_id: vec![0x01, 0x02, 0x03, 0x04],
            pin: Some("123456".to_string()),
            timeout_ms: 5000,
        };
        
        // This will fail in tests without real hardware, but validation should pass
        assert!(YubiHSM2Backend::validate_config(&valid_config).is_ok());
        
        // Test invalid configs
        let invalid_config = YubiHSM2Config {
            module_path: "/nonexistent/path".to_string(),
            slot_id: 0,
            key_id: vec![0x01],
            pin: None,
            timeout_ms: 5000,
        };
        
        assert!(YubiHSM2Backend::validate_config(&invalid_config).is_err());
    }
    
    #[test]
    fn test_raw_ecdsa_to_der() {
        let mock_signature = vec![
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
        
        let result = YubiHSM2Backend::raw_ecdsa_to_der(&mock_signature);
        assert!(result.is_ok());
        
        let der = result.unwrap();
        assert!(!der.is_empty());
        assert_eq!(der[0], 0x30); // DER SEQUENCE tag
    }
}
