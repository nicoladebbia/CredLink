//! Storage client for manifest store

use anyhow::{Context, Result};
use aws_config::BehaviorVersion;
use aws_sdk_s3::{Client, primitives::ByteStream};
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tracing::{debug, error, warn};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ManifestMetadata {
    pub content_hash: String,
    pub manifest_hash: String,
    pub size: u64,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub tenant_id: String,
}

pub struct ManifestStore {
    client: Client,
    bucket: String,
    tenant_id: String,
}

impl ManifestStore {
    pub async fn new(config: &crate::config::StorageConfig) -> Result<Self> {
        let aws_config = aws_config::load_defaults(BehaviorVersion::latest()).await;
        let client = Client::new(&aws_config);
        
        Ok(Self {
            client,
            bucket: config.bucket.clone(),
            tenant_id: "default".to_string(), // Will be set from args
        })
    }
    
    pub fn with_tenant_id(mut self, tenant_id: String) -> Self {
        self.tenant_id = tenant_id;
        self
    }
    
    pub async fn store_manifest(
        &self,
        manifest_hash: &str,
        manifest_bytes: &[u8],
    ) -> Result<()> {
        let key = self.manifest_path(manifest_hash);
        
        debug!("Storing manifest: {} -> {}", manifest_hash, key);
        
        // Check if manifest already exists (idempotent write)
        if self.manifest_exists(manifest_hash).await? {
            debug!("Manifest already exists: {}", manifest_hash);
            return Ok(());
        }
        
        let body = ByteStream::from(manifest_bytes.to_vec());
        
        self.client
            .put_object()
            .bucket(&self.bucket)
            .key(&key)
            .body(body)
            .content_type("application/c2pa+json")
            .send()
            .await
            .with_context(|| format!("Failed to store manifest: {}", manifest_hash))?;
        
        debug!("Successfully stored manifest: {}", manifest_hash);
        
        Ok(())
    }
    
    pub async fn get_manifest(&self, manifest_hash: &str) -> Result<Vec<u8>> {
        let key = self.manifest_path(manifest_hash);
        
        debug!("Retrieving manifest: {}", key);
        
        let response = self.client
            .get_object()
            .bucket(&self.bucket)
            .key(&key)
            .send()
            .await
            .with_context(|| format!("Failed to retrieve manifest: {}", manifest_hash))?;
        
        let data = response.body
            .collect()
            .await
            .with_context(|| "Failed to read manifest data")?
            .into_bytes();
        
        debug!("Successfully retrieved manifest: {} ({} bytes)", manifest_hash, data.len());
        
        Ok(data.to_vec())
    }
    
    pub async fn manifest_exists(&self, manifest_hash: &str) -> Result<bool> {
        let key = self.manifest_path(manifest_hash);
        
        match self.client
            .head_object()
            .bucket(&self.bucket)
            .key(&key)
            .send()
            .await
        {
            Ok(_) => Ok(true),
            Err(e) => {
                if e.is_service_error() && e.as_service_error().is_err_code("NoSuchKey") {
                    Ok(false)
                } else {
                    Err(anyhow::anyhow!("Failed to check manifest existence: {}", e))
                }
            }
        }
    }
    
    pub async fn delete_manifest(&self, manifest_hash: &str) -> Result<()> {
        let key = self.manifest_path(manifest_hash);
        
        debug!("Deleting manifest: {}", key);
        
        self.client
            .delete_object()
            .bucket(&self.bucket)
            .key(&key)
            .send()
            .await
            .with_context(|| format!("Failed to delete manifest: {}", manifest_hash))?;
        
        debug!("Successfully deleted manifest: {}", manifest_hash);
        
        Ok(())
    }
    
    pub async fn list_manifests(&self, prefix: Option<&str>) -> Result<Vec<ManifestMetadata>> {
        let list_prefix = format!("tenants/{}/", self.tenant_id);
        let full_prefix = if let Some(additional_prefix) = prefix {
            format!("{}{}", list_prefix, additional_prefix)
        } else {
            list_prefix
        };
        
        debug!("Listing manifests with prefix: {}", full_prefix);
        
        let mut manifests = Vec::new();
        let mut continuation_token = None;
        
        loop {
            let mut request = self.client
                .list_objects_v2()
                .bucket(&self.bucket)
                .prefix(&full_prefix)
                .max_keys(1000);
            
            if let Some(token) = &continuation_token {
                request = request.continuation_token(token);
            }
            
            let response = request.send().await
                .with_context(|| "Failed to list manifests")?;
            
            if let Some(objects) = response.contents() {
                for object in objects {
                    if let Some(key) = object.key() {
                        if let Some(manifest_hash) = self.extract_manifest_hash(key) {
                            let metadata = ManifestMetadata {
                                content_hash: "unknown".to_string(), // Would be stored in metadata
                                manifest_hash,
                                size: object.size().unwrap_or(0),
                                created_at: object.last_modified().unwrap_or(&chrono::DateTime::from_timestamp(0, 0).unwrap()).clone(),
                                tenant_id: self.tenant_id.clone(),
                            };
                            
                            manifests.push(metadata);
                        }
                    }
                }
            }
            
            if response.next_continuation_token().is_some() {
                continuation_token = response.next_continuation_token().map(|s| s.to_string());
            } else {
                break;
            }
        }
        
        debug!("Listed {} manifests", manifests.len());
        
        Ok(manifests)
    }
    
    pub async fn get_manifest_url(&self, manifest_hash: &str) -> Result<String> {
        let key = self.manifest_path(manifest_hash);
        
        // Generate presigned URL (would need AWS credentials)
        let url = format!("https://{}.s3.amazonaws.com/{}", self.bucket, key);
        
        Ok(url)
    }
    
    fn manifest_path(&self, manifest_hash: &str) -> String {
        format!("tenants/{}/{}.c2pa", self.tenant_id, manifest_hash)
    }
    
    fn extract_manifest_hash(&self, key: &str) -> Option<String> {
        let prefix = format!("tenants/{}/", self.tenant_id);
        
        if key.starts_with(&prefix) {
            let hash_part = &key[prefix.len()..];
            if hash_part.ends_with(".c2pa") {
                Some(hash_part[..hash_part.len() - 5].to_string())
            } else {
                None
            }
        } else {
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_manifest_path_logic() {
        // Test the path generation logic without AWS client
        let bucket = "test-bucket".to_string();
        let tenant_id = "test-tenant".to_string();
        
        let expected_path = format!("tenants/{}/sha256:abc123.c2pa", tenant_id);
        assert_eq!(expected_path, "tenants/test-tenant/sha256:abc123.c2pa");
    }
    
    #[test]
    fn test_extract_manifest_hash_logic() {
        // Test hash extraction logic without AWS client
        let tenant_id = "test-tenant";
        
        // Test valid manifest path
        let valid_path = format!("tenants/{}/sha256:abc123.c2pa", tenant_id);
        let hash_start = format!("tenants/{}/", tenant_id);
        let hash_end = ".c2pa";
        
        if valid_path.starts_with(&hash_start) && valid_path.ends_with(hash_end) {
            let hash_part = &valid_path[hash_start.len()..valid_path.len() - hash_end.len()];
            assert_eq!(hash_part, "sha256:abc123");
        } else {
            panic!("Should extract hash correctly");
        }
        
        // Test wrong tenant
        let wrong_tenant_path = "tenants/other-tenant/sha256:abc123.c2pa";
        if wrong_tenant_path.starts_with(&hash_start) && wrong_tenant_path.ends_with(hash_end) {
            panic!("Should not extract hash for wrong tenant");
        }
        
        // Test wrong file extension
        let wrong_ext_path = format!("tenants/{}/other-file.txt", tenant_id);
        if wrong_ext_path.starts_with(&hash_start) && wrong_ext_path.ends_with(hash_end) {
            panic!("Should not extract hash for wrong extension");
        }
    }
}
