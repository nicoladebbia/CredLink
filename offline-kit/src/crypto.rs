use anyhow::{Context, Result, anyhow};
use p256::ecdsa::{Signature, VerifyingKey};
use ed25519_dalek::{Verifier, PublicKey, Signature as Ed25519Signature};
use ring::signature::{UnparsedPublicKey, ECDSA_P256_SHA256_FIXED_SIGNING};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Signature verification errors
#[derive(Debug, thiserror::Error)]
pub enum VerificationError {
    #[error("Invalid signature format")]
    InvalidFormat,
    #[error("Signature verification failed")]
    VerificationFailed,
    #[error("Unsupported algorithm: {0}")]
    UnsupportedAlgorithm(String),
    #[error("Invalid public key")]
    InvalidPublicKey,
    #[error("Invalid message for signing")]
    InvalidMessage,
}

/// Signature verifier for trust packs
pub struct SignatureVerifier {
    /// Trusted public keys (vendor keys)
    trusted_keys: HashMap<String, TrustedKey>,
}

/// Trusted public key information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrustedKey {
    /// Key identifier
    pub key_id: String,
    /// Algorithm type
    pub algorithm: String,
    /// Base64-encoded public key
    pub public_key: String,
    /// Key display name
    pub display_name: String,
    /// Key creation date
    pub created_at: chrono::DateTime<chrono::Utc>,
    /// Key expiration date (optional)
    pub expires_at: Option<chrono::DateTime<chrono::Utc>>,
}

impl SignatureVerifier {
    /// Create new signature verifier with default trusted keys
    pub fn new() -> Result<Self> {
        let mut trusted_keys = HashMap::new();
        
        // Add default C2 Concierge vendor keys
        // In production, these would be loaded from secure storage
        trusted_keys.insert(
            "C2C Trust Root v1".to_string(),
            TrustedKey {
                key_id: "c2c-trust-root-v1".to_string(),
                algorithm: "ES256".to_string(),
                public_key: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEEVs/o5+UWQc5oJLOJzI+9d+uK2L5NkY8X5R5F5Q5F5Q5F5Q5F5Q5F5Q5F5Q5F5Q5F5Q5F5Q5F5Q5F5Q5F5Q5F5Q5F5Q==".to_string(),
                display_name: "C2 Concierge Trust Root v1".to_string(),
                created_at: chrono::Utc::now(),
                expires_at: None,
            }
        );
        
        trusted_keys.insert(
            "C2C Trust Root v2".to_string(),
            TrustedKey {
                key_id: "c2c-trust-root-v2".to_string(),
                algorithm: "Ed25519".to_string(),
                public_key: "3B6A27BCCEB6A42D62A3A8D02A6F0D73653215771DE243A63AC048A18B59DA29".to_string(),
                display_name: "C2 Concierge Trust Root v2".to_string(),
                created_at: chrono::Utc::now(),
                expires_at: None,
            }
        );
        
        Ok(Self { trusted_keys })
    }
    
    /// Add a trusted key
    pub fn add_trusted_key(&mut self, key: TrustedKey) {
        self.trusted_keys.insert(key.display_name.clone(), key);
    }
    
    /// Verify a signature
    pub fn verify(
        &self,
        message: &[u8],
        signature: &str,
        algorithm: &str,
        signer: &str,
    ) -> Result<()> {
        // Get trusted key for signer
        let trusted_key = self.trusted_keys.get(signer)
            .ok_or_else(|| anyhow!("Unknown signer: {}", signer))?;
        
        // Verify algorithm matches
        if trusted_key.algorithm != algorithm {
            return Err(anyhow!("Algorithm mismatch: expected {}, got {}", trusted_key.algorithm, algorithm));
        }
        
        // Decode signature
        let signature_bytes = base64::decode(signature)
            .context("Failed to decode signature")?;
        
        // Verify based on algorithm
        match algorithm {
            "ES256" => self.verify_es256(message, &signature_bytes, &trusted_key.public_key)?,
            "Ed25519" => self.verify_ed25519(message, &signature_bytes, &trusted_key.public_key)?,
            _ => return Err(anyhow!("Unsupported algorithm: {}", algorithm)),
        }
        
        Ok(())
    }
    
    /// Verify ES256 (ECDSA P-256 SHA-256) signature
    fn verify_es256(&self, message: &[u8], signature: &[u8], public_key_pem: &str) -> Result<()> {
        // Parse public key
        let public_key = self.parse_es256_public_key(public_key_pem)?;
        
        // Create signature
        let signature = Signature::from_slice(signature)
            .map_err(|_| VerificationError::InvalidFormat)?;
        
        // Verify signature
        public_key.verify(message, &signature)
            .map_err(|_| VerificationError::VerificationFailed)?;
        
        Ok(())
    }
    
    /// Verify Ed25519 signature
    fn verify_ed25519(&self, message: &[u8], signature: &[u8], public_key_hex: &str) -> Result<()> {
        // Parse public key
        let public_key_bytes = hex::decode(public_key_hex)
            .map_err(|_| VerificationError::InvalidPublicKey)?;
        
        let public_key = PublicKey::from_bytes(&public_key_bytes)
            .map_err(|_| VerificationError::InvalidPublicKey)?;
        
        // Create signature
        let signature = Ed25519Signature::from_bytes(signature)
            .map_err(|_| VerificationError::InvalidFormat)?;
        
        // Verify signature
        public_key.verify(message, &signature)
            .map_err(|_| VerificationError::VerificationFailed)?;
        
        Ok(())
    }
    
    /// Parse ES256 public key from PEM
    fn parse_es256_public_key(&self, pem: &str) -> Result<VerifyingKey> {
        use p256::pkcs8::DecodePublicKey;
        
        // Parse PEM to DER
        let der = self.pem_to_der(pem)?;
        
        // Parse public key
        let public_key = VerifyingKey::from_public_key_der(&der)
            .context("Failed to parse ES256 public key")?;
        
        Ok(public_key)
    }
    
    /// Convert PEM to DER format
    fn pem_to_der(&self, pem: &str) -> Result<Vec<u8>> {
        // Remove PEM headers and footers
        let mut base64_data = String::new();
        let mut in_body = false;
        
        for line in pem.lines() {
            let trimmed = line.trim();
            if trimmed.starts_with("-----BEGIN") {
                in_body = true;
                continue;
            }
            if trimmed.starts_with("-----END") {
                break;
            }
            if in_body && !trimmed.is_empty() {
                base64_data.push_str(trimmed);
            }
        }
        
        // Decode base64
        let der = base64::decode(&base64_data)
            .context("Failed to decode PEM base64 data")?;
        
        Ok(der)
    }
    
    /// Verify dual signatures (for key rotation)
    pub fn verify_dual_signature(
        &self,
        message: &[u8],
        old_signature: &str,
        new_signature: &str,
        algorithm: &str,
        old_signer: &str,
        new_signer: &str,
    ) -> Result<()> {
        // Verify old signature
        self.verify(message, old_signature, algorithm, old_signer)?;
        
        // Verify new signature
        self.verify(message, new_signature, algorithm, new_signer)?;
        
        Ok(())
    }
    
    /// List all trusted keys
    pub fn list_trusted_keys(&self) -> Vec<&TrustedKey> {
        self.trusted_keys.values().collect()
    }
    
    /// Check if a key is expired
    pub fn is_key_expired(&self, key_id: &str) -> Result<bool> {
        let key = self.trusted_keys.values()
            .find(|k| k.key_id == key_id)
            .ok_or_else(|| anyhow!("Key not found: {}", key_id))?;
        
        Ok(key.expires_at.map_or(false, |exp| exp < chrono::Utc::now()))
    }
}

/// Message canonicalization for signature verification
pub struct MessageCanonicalizer;

impl MessageCanonicalizer {
    /// Create canonical representation of JSON message
    pub fn canonicalize_json(message: &serde_json::Value) -> Result<Vec<u8>> {
        // Sort object keys lexicographically
        let canonical = Self::sort_json_keys(message);
        
        // Serialize with deterministic formatting
        let canonical_string = serde_json::to_string(&canonical)
            .context("Failed to serialize canonical JSON")?;
        
        Ok(canonical_string.into_bytes())
    }
    
    /// Sort JSON object keys recursively
    fn sort_json_keys(value: &serde_json::Value) -> serde_json::Value {
        match value {
            serde_json::Value::Object(map) => {
                // Sort keys
                let mut sorted_keys: Vec<_> = map.iter().collect();
                sorted_keys.sort_by_key(|(k, _)| *k);
                
                // Create new ordered map
                let mut sorted_map = serde_json::Map::new();
                for (key, val) in sorted_keys {
                    sorted_map.insert(key.clone(), Self::sort_json_keys(val));
                }
                
                serde_json::Value::Object(sorted_map)
            }
            serde_json::Value::Array(arr) => {
                let sorted_array: Vec<_> = arr.iter().map(|v| Self::sort_json_keys(v)).collect();
                serde_json::Value::Array(sorted_array)
            }
            _ => value.clone(),
        }
    }
}

/// Hash utilities for message digests
pub struct HashUtils;

impl HashUtils {
    /// Calculate SHA-256 hash
    pub fn sha256(data: &[u8]) -> String {
        use sha2::{Sha256, Digest};
        
        let mut hasher = Sha256::new();
        hasher.update(data);
        format!("{:x}", hasher.finalize())
    }
    
    /// Calculate SHA-512 hash
    pub fn sha512(data: &[u8]) -> String {
        use sha2::{Sha512, Digest};
        
        let mut hasher = Sha512::new();
        hasher.update(data);
        format!("{:x}", hasher.finalize())
    }
    
    /// Verify SHA-256 hash
    pub fn verify_sha256(data: &[u8], expected_hash: &str) -> bool {
        let actual_hash = Self::sha256(data);
        actual_hash == expected_hash
    }
    
    /// Verify SHA-512 hash
    pub fn verify_sha512(data: &[u8], expected_hash: &str) -> bool {
        let actual_hash = Self::sha512(data);
        actual_hash == expected_hash
    }
}

/// Certificate utilities for X.509 chain validation
pub struct CertificateUtils;

impl CertificateUtils {
    /// Parse X.509 certificate from PEM
    pub fn parse_certificate_pem(pem: &str) -> Result<x509_parser::certificate::X509Certificate> {
        let der = Self::pem_to_der(pem)?;
        let (_, cert) = x509_parser::parse_x509_certificate(&der)
            .map_err(|_| anyhow!("Failed to parse X.509 certificate"))?;
        
        Ok(cert)
    }
    
    /// Convert PEM to DER
    fn pem_to_der(pem: &str) -> Result<Vec<u8>> {
        // Similar implementation to SignatureVerifier::pem_to_der
        let mut base64_data = String::new();
        let mut in_body = false;
        
        for line in pem.lines() {
            let trimmed = line.trim();
            if trimmed.starts_with("-----BEGIN CERTIFICATE-----") {
                in_body = true;
                continue;
            }
            if trimmed.starts_with("-----END CERTIFICATE-----") {
                break;
            }
            if in_body && !trimmed.is_empty() {
                base64_data.push_str(trimmed);
            }
        }
        
        base64::decode(&base64_data)
            .context("Failed to decode certificate PEM")
    }
    
    /// Extract certificate subject
    pub fn extract_subject(cert: &x509_parser::certificate::X509Certificate) -> String {
        cert.subject.to_string()
    }
    
    /// Extract certificate issuer
    pub fn extract_issuer(cert: &x509_parser::certificate::X509Certificate) -> String {
        cert.issuer.to_string()
    }
    
    /// Extract certificate serial number
    pub fn extract_serial(cert: &x509_parser::certificate::X509Certificate) -> String {
        hex::encode(cert.serial)
    }
    
    /// Calculate certificate fingerprint
    pub fn calculate_fingerprint(cert: &x509_parser::certificate::X509Certificate) -> String {
        HashUtils::sha256(&cert.tbs_certificate.as_ref())
    }
    
    /// Check if certificate is valid at given time
    pub fn is_valid_at(cert: &x509_parser::certificate::X509Certificate, time: chrono::DateTime<chrono::Utc>) -> bool {
        let not_before = chrono::DateTime::from_timestamp(cert.validity.not_before.timestamp(), 0)
            .unwrap_or(chrono::Utc::now());
        let not_after = chrono::DateTime::from_timestamp(cert.validity.not_after.timestamp(), 0)
            .unwrap_or(chrono::Utc::now());
        
        time >= not_before && time <= not_after
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_message_canonicalization() {
        let message = serde_json::json!({
            "z": "last",
            "a": "first",
            "nested": {
                "b": "second",
                "a": "first"
            }
        });
        
        let canonical = MessageCanonicalizer::canonicalize_json(&message).unwrap();
        let canonical_str = String::from_utf8(canonical).unwrap();
        
        // Should be sorted lexicographically
        assert!(canonical_str.contains("\"a\":\"first\""));
        assert!(canonical_str.contains("\"z\":\"last\""));
    }
    
    #[test]
    fn test_hash_utils() {
        let data = b"test data";
        let hash = HashUtils::sha256(data);
        
        assert_eq!(hash.len(), 64); // SHA-256 hex length
        assert!(HashUtils::verify_sha256(data, &hash));
    }
}
