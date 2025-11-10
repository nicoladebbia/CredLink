use crate::util::{hex_bytes, parse_digest_hex, HexError};
use serde::Serialize;
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};
use thiserror::Error;

pub const CANON_VERSION: &str = "c2c-1";

#[derive(Debug, Error)]
pub enum CanonicalError {
    #[error("manifest JSON parse error: {0}")]
    Parse(#[from] serde_json::Error),
    #[error("failed to serialize canonical JSON: {0}")]
    Serialize(#[source] serde_json::Error),
    #[error("digest hex error: {0}")]
    Hex(#[from] HexError),
    #[error("digest validation error: {0}")]
    Digest(#[from] DigestError),
}

#[derive(Debug, Error)]
pub enum DigestError {
    #[error("manifest digest expects 32-byte input, received {0}")]
    InvalidLength(usize),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ManifestDigest {
    pub bytes: [u8; 32],
    pub hex: String,
}

impl ManifestDigest {
    pub fn from_bytes(bytes: [u8; 32]) -> Self {
        let hex = hex_bytes(&bytes);
        Self { bytes, hex }
    }

    pub fn as_bytes(&self) -> &[u8; 32] {
        &self.bytes
    }

    pub fn as_hex(&self) -> &str {
        &self.hex
    }
}

pub fn canonical_json_string(manifest_json: &str) -> Result<String, CanonicalError> {
    let value: Value = serde_json::from_str(manifest_json)?;
    let canonical = canonical_json_value(&value);
    serde_json::to_string(&canonical).map_err(CanonicalError::Serialize)
}

pub fn canonical_json_value(value: &Value) -> Value {
    match value {
        Value::Object(map) => {
            let mut ordered = Map::new();
            let mut keys: Vec<_> = map.keys().collect();
            keys.sort();
            for key in keys {
                ordered.insert(
                    key.clone(),
                    canonical_json_value(map.get(key).expect("key must exist")),
                );
            }
            Value::Object(ordered)
        }
        Value::Array(arr) => {
            let values: Vec<Value> = arr.iter().map(canonical_json_value).collect();
            Value::Array(values)
        }
        Value::String(_) | Value::Number(_) | Value::Bool(_) | Value::Null => value.clone(),
    }
}

pub fn canonical_manifest_digest(manifest_json: &str) -> Result<ManifestDigest, CanonicalError> {
    let canonical = canonical_json_string(manifest_json)?;
    let digest_bytes = sha256_bytes(canonical.as_bytes())?;
    Ok(ManifestDigest::from_bytes(digest_bytes))
}

pub fn canonical_manifest_digest_from_value(value: &Value) -> Result<ManifestDigest, CanonicalError> {
    let canonical = canonical_json_value(value);
    let bytes = serde_json::to_vec(&canonical).map_err(CanonicalError::Serialize)?;
    let digest_bytes = sha256_bytes(&bytes)?;
    Ok(ManifestDigest::from_bytes(digest_bytes))
}

pub fn sha256_bytes(data: &[u8]) -> Result<[u8; 32], DigestError> {
    let mut hasher = Sha256::new();
    hasher.update(data);
    let result = hasher.finalize();
    result
        .as_slice()
        .try_into()
        .map_err(|_| DigestError::InvalidLength(result.len()))
}

pub fn digest_from_hex(digest_hex: &str) -> Result<ManifestDigest, CanonicalError> {
    let bytes = parse_digest_hex(digest_hex)?;
    Ok(ManifestDigest {
        bytes,
        hex: digest_hex.to_string(),
    })
}

pub fn canonical_json_bytes(value: &Value) -> Result<Vec<u8>, CanonicalError> {
    let canonical = canonical_json_value(value);
    serde_json::to_vec(&canonical).map_err(CanonicalError::Serialize)
}

pub fn canonical_json_serializable<T>(value: &T) -> Result<String, CanonicalError>
where
    T: Serialize,
{
    let canonical_value = serde_json::to_value(value)?;
    let canonical = canonical_json_value(&canonical_value);
    serde_json::to_string(&canonical).map_err(CanonicalError::Serialize)
}
