use thiserror::Error;

#[derive(Debug, Error)]
pub enum HexError {
    #[error("digest must be a 64-character lowercase hex string")]
    InvalidLength,
    #[error("digest must contain only lowercase hex characters")]
    InvalidHex(#[from] hex::FromHexError),
}

pub fn parse_digest_hex(digest_hex: &str) -> Result<[u8; 32], HexError> {
    if digest_hex.len() != 64 {
        return Err(HexError::InvalidLength);
    }
    let mut bytes = [0u8; 32];
    hex::decode_to_slice(digest_hex, &mut bytes)?;
    Ok(bytes)
}

pub fn hex_bytes(bytes: &[u8]) -> String {
    hex::encode(bytes)
}
