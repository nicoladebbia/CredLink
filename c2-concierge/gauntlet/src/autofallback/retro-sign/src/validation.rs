//! Input validation and sanitization for C2 Concierge Retro-Sign

use anyhow::{anyhow, Result};
use regex::Regex;
use std::path::Path;
use tracing::{debug, warn};

/// Input validator
pub struct InputValidator {
    // Regex patterns for validation
    tenant_id_pattern: Regex,
    user_id_pattern: Regex,
    file_path_pattern: Regex,
    url_pattern: Regex,
}

impl InputValidator {
    pub fn new() -> Result<Self> {
        Ok(Self {
            tenant_id_pattern: Regex::new(r"^[a-zA-Z0-9_-]{1,64}$")?,
            user_id_pattern: Regex::new(r"^[a-zA-Z0-9._-]{1,128}$")?,
            file_path_pattern: Regex::new(r"^[a-zA-Z0-9/_.-]{1,1024}$")?,
            url_pattern: Regex::new(r"^https?://[a-zA-Z0-9.-]+[a-zA-Z0-9._/-]*$")?,
        })
    }
    
    /// Validate tenant ID
    pub fn validate_tenant_id(&self, tenant_id: &str) -> Result<()> {
        if tenant_id.is_empty() {
            return Err(anyhow!("Tenant ID cannot be empty"));
        }
        
        if tenant_id.len() > 64 {
            return Err(anyhow!("Tenant ID too long (max 64 characters)"));
        }
        
        if !self.tenant_id_pattern.is_match(tenant_id) {
            return Err(anyhow!("Invalid tenant ID format"));
        }
        
        // Check for dangerous patterns
        if tenant_id.contains("..") || tenant_id.contains("/") {
            return Err(anyhow!("Tenant ID contains dangerous characters"));
        }
        
        Ok(())
    }
    
    /// Validate user ID
    pub fn validate_user_id(&self, user_id: &str) -> Result<()> {
        if user_id.is_empty() {
            return Err(anyhow!("User ID cannot be empty"));
        }
        
        if user_id.len() > 128 {
            return Err(anyhow!("User ID too long (max 128 characters)"));
        }
        
        if !self.user_id_pattern.is_match(user_id) {
            return Err(anyhow!("Invalid user ID format"));
        }
        
        // Check for dangerous patterns
        if user_id.contains("..") || user_id.contains("/") {
            return Err(anyhow!("User ID contains dangerous characters"));
        }
        
        Ok(())
    }
    
    /// Validate file path
    pub fn validate_file_path(&self, path: &str) -> Result<()> {
        if path.is_empty() {
            return Err(anyhow!("File path cannot be empty"));
        }
        
        if path.len() > 1024 {
            return Err(anyhow!("File path too long (max 1024 characters)"));
        }
        
        if !self.file_path_pattern.is_match(path) {
            return Err(anyhow!("Invalid file path format"));
        }
        
        // Path traversal protection
        if path.contains("../") || path.starts_with("/") {
            return Err(anyhow!("Path traversal detected"));
        }
        
        // Check for null bytes
        if path.contains('\0') {
            return Err(anyhow!("Null bytes in path"));
        }
        
        Ok(())
    }
    
    /// Validate URL
    pub fn validate_url(&self, url: &str) -> Result<()> {
        if url.is_empty() {
            return Err(anyhow!("URL cannot be empty"));
        }
        
        if url.len() > 2048 {
            return Err(anyhow!("URL too long (max 2048 characters)"));
        }
        
        if !self.url_pattern.is_match(url) {
            return Err(anyhow!("Invalid URL format"));
        }
        
        // Check for dangerous URLs
        if url.contains("localhost") && url.contains("file://") {
            return Err(anyhow!("Dangerous URL protocol"));
        }
        
        Ok(())
    }
    
    /// Validate and sanitize string input
    pub fn sanitize_string(&self, input: &str, max_length: usize) -> Result<String> {
        if input.len() > max_length {
            return Err(anyhow!("Input too long (max {} characters)", max_length));
        }
        
        // Remove null bytes and control characters
        let sanitized = input
            .chars()
            .filter(|c| !c.is_control() || *c == '\t' || *c == '\n' || *c == '\r')
            .collect::<String>();
        
        if sanitized.len() != input.len() {
            warn!("Input contained control characters and was sanitized");
        }
        
        Ok(sanitized)
    }
    
    /// Validate batch size
    pub fn validate_batch_size(&self, size: u64) -> Result<()> {
        if size == 0 {
            return Err(anyhow!("Batch size cannot be zero"));
        }
        
        if size > 10000 {
            return Err(anyhow!("Batch size too large (max 10000)"));
        }
        
        Ok(())
    }
    
    /// Validate concurrency limit
    pub fn validate_concurrency(&self, concurrency: u64) -> Result<()> {
        if concurrency == 0 {
            return Err(anyhow!("Concurrency cannot be zero"));
        }
        
        if concurrency > 1000 {
            return Err(anyhow!("Concurrency too high (max 1000)"));
        }
        
        Ok(())
    }
    
    /// Validate timeout duration
    pub fn validate_timeout(&self, timeout_seconds: u64) -> Result<()> {
        if timeout_seconds == 0 {
            return Err(anyhow!("Timeout cannot be zero"));
        }
        
        if timeout_seconds > 3600 {
            return Err(anyhow!("Timeout too long (max 3600 seconds)"));
        }
        
        Ok(())
    }
}

impl Default for InputValidator {
    fn default() -> Self {
        Self::new().expect("Failed to create input validator")
    }
}

/// Security context validator
pub struct SecurityValidator;

impl SecurityValidator {
    /// Validate security context
    pub fn validate_context(context: &crate::security::SecurityContext) -> Result<()> {
        let validator = InputValidator::default();
        
        validator.validate_tenant_id(&context.tenant_id)?;
        validator.validate_user_id(&context.user_id)?;
        
        if context.session_id.is_empty() {
            return Err(anyhow!("Session ID cannot be empty"));
        }
        
        if context.request_id.is_empty() {
            return Err(anyhow!("Request ID cannot be empty"));
        }
        
        // Check timestamp is not too old or in future
        let now = std::time::SystemTime::now();
        let context_time = context.timestamp;
        
        if let Ok(duration) = context_time.duration_since(now) {
            if duration.as_secs() > 300 { // 5 minutes in future
                return Err(anyhow!("Context timestamp is too far in future"));
            }
        } else if let Ok(duration) = now.duration_since(context_time) {
            if duration.as_secs() > 86400 { // 24 hours old
                return Err(anyhow!("Context timestamp is too old"));
            }
        }
        
        Ok(())
    }
    
    /// Validate authentication credentials
    pub fn validate_credentials(username: &str, password: &str) -> Result<()> {
        let validator = InputValidator::default();
        
        validator.validate_user_id(username)?;
        
        if password.len() < 8 {
            return Err(anyhow!("Password too short (min 8 characters)"));
        }
        
        if password.len() > 128 {
            return Err(anyhow!("Password too long (max 128 characters)"));
        }
        
        // Check for common weak passwords
        let weak_passwords = vec![
            "password", "123456", "admin", "root", "guest",
            "qwerty", "abc123", "password123", "changeme"
        ];
        
        if weak_passwords.contains(&password.to_lowercase().as_str()) {
            return Err(anyhow!("Password is too common"));
        }
        
        Ok(())
    }
}

/// Global validator instance
static VALIDATOR: std::sync::OnceLock<InputValidator> = std::sync::OnceLock::new();

/// Get global input validator
pub fn get_validator() -> &'static InputValidator {
    VALIDATOR.get_or_init(|| InputValidator::default())
}

/// Validation middleware for function calls
pub async fn validate_input_middleware<T>(
    input: &str,
    validator_fn: impl Fn(&str, &InputValidator) -> Result<T>,
) -> Result<T> {
    let validator = get_validator();
    validator_fn(input, validator)
}

/// Macro for easy validation
#[macro_export]
macro_rules! validate_input {
    ($input:expr, $validator:ident($($arg:expr),*)) => {
        $crate::validation::get_validator().$validator($input, $($arg),*)?
    };
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_tenant_id_validation() {
        let validator = InputValidator::default().unwrap();
        
        assert!(validator.validate_tenant_id("tenant123").is_ok());
        assert!(validator.validate_tenant_id("tenant-with_underscore").is_ok());
        
        assert!(validator.validate_tenant_id("").is_err());
        assert!(validator.validate_tenant_id("tenant@invalid").is_err());
        assert!(validator.validate_tenant_id("../tenant").is_err());
        assert!(validator.validate_tenant_id("a".repeat(65).as_str()).is_err());
    }
    
    #[test]
    fn test_user_id_validation() {
        let validator = InputValidator::default().unwrap();
        
        assert!(validator.validate_user_id("user123").is_ok());
        assert!(validator.validate_user_id("user.with-dash_underscore").is_ok());
        
        assert!(validator.validate_user_id("").is_err());
        assert!(validator.validate_user_id("user@invalid").is_err());
        assert!(validator.validate_user_id("../user").is_err());
        assert!(validator.validate_user_id("a".repeat(129).as_str()).is_err());
    }
    
    #[test]
    fn test_file_path_validation() {
        let validator = InputValidator::default().unwrap();
        
        assert!(validator.validate_file_path("path/to/file.txt").is_ok());
        assert!(validator.validate_file_path("file_with-dashes.txt").is_ok());
        
        assert!(validator.validate_file_path("").is_err());
        assert!(validator.validate_file_path("../etc/passwd").is_err());
        assert!(validator.validate_file_path("/absolute/path").is_err());
        assert!(validator.validate_file_path("path\0with\0nulls").is_err());
    }
}
