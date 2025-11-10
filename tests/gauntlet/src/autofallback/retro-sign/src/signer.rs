//! Signer client for C2 Concierge Retro-Sign

use anyhow::{Context, Result};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tracing::{debug, error, warn};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignRequest {
    pub content_hash: String,
    pub mode: String, // "remote" or "embed"
    pub tsa_profile: String,
    pub idempotency_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignResponse {
    pub manifest_hash: String,
    pub manifest_bytes: Vec<u8>,
    pub tsa_info: TsaInfo,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TsaInfo {
    pub timestamp: chrono::DateTime<chrono::Utc>,
    pub token: Vec<u8>,
    pub authority: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchSignRequest {
    pub requests: Vec<SignRequest>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchSignResponse {
    pub responses: Vec<SignResponse>,
    pub errors: Vec<SignError>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignError {
    pub content_hash: String,
    pub error_type: String,
    pub message: String,
}

pub struct SignerClient {
    client: Client,
    signer_url: String,
    tsa_profile: String,
    timeout: Duration,
    retries: u32,
}

impl SignerClient {
    pub fn new(config: &crate::config::SignerConfig) -> Result<Self> {
        let client = Client::builder()
            .timeout(Duration::from_millis(config.timeout_ms))
            .build()
            .with_context(|| "Failed to create HTTP client")?;
        
        Ok(Self {
            client,
            signer_url: config.url.clone(),
            tsa_profile: config.tsa_profile.clone(),
            timeout: Duration::from_millis(config.timeout_ms),
            retries: config.retries,
        })
    }
    
    pub async fn sign_content(&self, content_hash: &str, content_bytes: &[u8]) -> Result<SignResponse> {
        let request = SignRequest {
            content_hash: content_hash.to_string(),
            content_size: content_bytes.len(),
            tsa_profile: self.tsa_profile.clone(),
        };
        
        let url = format!("{}/sign", self.signer_url);
        
        let response = self.client
            .post(&url)
            .json(&request)
            .header("Content-Type", "application/json")
            .send()
            .await
            .with_context(|| format!("Failed to send sign request to {}", url))?;
        
        if response.status().is_success() {
            let sign_response = response.json::<SignResponse>().await
                .with_context(|| "Failed to parse sign response")?;
            
            info!("Successfully signed content: {}", content_hash);
            Ok(sign_response)
        } else {
            let error_text = response.text().await
                .with_context(|| "Failed to read error response")?;
            Err(anyhow::anyhow!("Sign request failed: {}", error_text))
        }
    }
    
    pub async fn sign_batch(&self, requests: &[SignRequest]) -> Result<BatchSignResponse> {
        let batch_request = BatchSignRequest {
            requests: requests.to_vec(),
        };
        
        let mut attempt = 0;
        
        loop {
            match self.attempt_batch_sign(&batch_request).await {
                Ok(response) => return Ok(response),
                Err(e) => {
                    attempt += 1;
                    if attempt > self.retries {
                        error!("Failed to batch sign after {} attempts: {}", self.retries, e);
                        return Err(e);
                    }
                    
                    let backoff_ms = (2_u64.pow(attempt - 1) * 250) + (rand::random::<u64>() % 100);
                    warn!("Batch sign attempt {} failed, retrying in {}ms: {}", attempt, backoff_ms, e);
                    tokio::time::sleep(Duration::from_millis(backoff_ms)).await;
                }
            }
        }
    }
    
    async fn attempt_sign(&self, request: &SignRequest) -> Result<SignResponse> {
        let url = format!("{}/sign", self.base_url);
        
        debug!("Signing content: {} with mode: {}", request.content_hash, request.mode);
        
        let response = self.client
            .post(&url)
            .json(request)
            .send()
            .await
            .with_context(|| "Failed to send sign request")?;
        
        if !response.status().is_success() {
            let error_text = response.text().await
                .with_context(|| "Failed to read error response")?;
            return Err(anyhow::anyhow!("Sign request failed: {}", error_text));
        }
        
        let sign_response: SignResponse = response.json().await
            .with_context(|| "Failed to parse sign response")?;
        
        debug!("Successfully signed content: {} -> {}", request.content_hash, sign_response.manifest_hash);
        
        Ok(sign_response)
    }
    
    async fn attempt_batch_sign(&self, request: &BatchSignRequest) -> Result<BatchSignResponse> {
        let url = format!("{}/sign/batch", self.base_url);
        
        debug!("Batch signing {} requests", request.requests.len());
        
        let response = self.client
            .post(&url)
            .json(request)
            .send()
            .await
            .with_context(|| "Failed to send batch sign request")?;
        
        if !response.status().is_success() {
            let error_text = response.text().await
                .with_context(|| "Failed to read error response")?;
            return Err(anyhow::anyhow!("Batch sign request failed: {}", error_text));
        }
        
        let batch_response: BatchSignResponse = response.json().await
            .with_context(|| "Failed to parse batch sign response")?;
        
        debug!("Batch signed {} requests, {} errors", 
               batch_response.responses.len(), 
               batch_response.errors.len());
        
        Ok(batch_response)
    }
    
    pub async fn health_check(&self) -> Result<bool> {
        let url = format!("{}/health", self.base_url);
        
        let response = self.client
            .get(&url)
            .send()
            .await
            .with_context(|| "Failed to send health check")?;
        
        Ok(response.status().is_success())
    }
}

impl Clone for SignerClient {
    fn clone(&self) -> Self {
        Self {
            client: self.client.clone(),
            base_url: self.base_url.clone(),
            tsa_profile: self.tsa_profile.clone(),
            timeout: self.timeout,
            retries: self.retries,
        }
    }
}
