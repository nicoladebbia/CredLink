//! Rate limiting and resource controls for C2 Concierge Retro-Sign

use anyhow::Result;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::{RwLock, Semaphore};
use tracing::{debug, warn, error};

/// Rate limiter configuration
#[derive(Debug, Clone)]
pub struct RateLimitConfig {
    pub requests_per_second: u32,
    pub burst_size: u32,
    pub cleanup_interval: Duration,
}

impl Default for RateLimitConfig {
    fn default() -> Self {
        Self {
            requests_per_second: 100,
            burst_size: 200,
            cleanup_interval: Duration::from_secs(60),
        }
    }
}

/// Token bucket rate limiter
pub struct TokenBucket {
    capacity: u32,
    tokens: Arc<RwLock<f64>>,
    refill_rate: f64, // tokens per second
    last_refill: Arc<RwLock<Instant>>,
}

impl TokenBucket {
    pub fn new(capacity: u32, refill_rate: u32) -> Self {
        Self {
            capacity,
            tokens: Arc::new(RwLock::new(capacity as f64)),
            refill_rate: refill_rate as f64,
            last_refill: Arc::new(RwLock::new(Instant::now())),
        }
    }
    
    pub async fn try_acquire(&self, tokens: u32) -> bool {
        let mut tokens_lock = self.tokens.write().await;
        let mut last_refill_lock = self.last_refill.write().await;
        
        // Refill tokens based on elapsed time
        let now = Instant::now();
        let elapsed = now.duration_since(*last_refill_lock);
        let tokens_to_add = elapsed.as_secs_f64() * self.refill_rate;
        
        *tokens_lock = (*tokens_lock + tokens_to_add).min(self.capacity as f64);
        *last_refill_lock = now;
        
        if *tokens_lock >= tokens as f64 {
            *tokens_lock -= tokens as f64;
            debug!("Rate limit: acquired {} tokens, {} remaining", tokens, *tokens_lock);
            true
        } else {
            debug!("Rate limit: insufficient tokens, need {}, have {}", tokens, *tokens_lock);
            false
        }
    }
    
    pub async fn acquire(&self, tokens: u32) -> Result<()> {
        while !self.try_acquire(tokens).await {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        Ok(())
    }
}

/// Resource monitor and limiter
pub struct ResourceLimiter {
    max_memory_mb: usize,
    max_cpu_percent: f64,
    max_file_descriptors: u32,
    current_memory: Arc<RwLock<usize>>,
    semaphore: Arc<Semaphore>,
}

impl ResourceLimiter {
    pub fn new(max_memory_mb: usize, max_cpu_percent: f64, max_file_descriptors: u32, max_concurrent: usize) -> Self {
        Self {
            max_memory_mb,
            max_cpu_percent,
            max_file_descriptors,
            current_memory: Arc::new(RwLock::new(0)),
            semaphore: Arc::new(Semaphore::new(max_concurrent)),
        }
    }
    
    pub async fn acquire_permit(&self) -> Result<ResourcePermit> {
        let permit = self.semaphore.acquire().await
            .map_err(|_| anyhow::anyhow!("Semaphore closed"))?;
        
        Ok(ResourcePermit {
            _permit: permit,
            limiter: self,
        })
    }
    
    pub async fn check_resources(&self) -> ResourceStatus {
        let memory_usage = self.get_memory_usage().await;
        let cpu_usage = self.get_cpu_usage().await;
        let fd_count = self.get_fd_count().await;
        
        ResourceStatus {
            memory_usage_mb: memory_usage,
            memory_limit_mb: self.max_memory_mb,
            cpu_usage_percent: cpu_usage,
            cpu_limit_percent: self.max_cpu_percent,
            fd_count,
            fd_limit: self.max_file_descriptors,
            healthy: memory_usage <= self.max_memory_mb 
                && cpu_usage <= self.max_cpu_percent 
                && fd_count <= self.max_file_descriptors,
        }
    }
    
    async fn get_memory_usage(&self) -> usize {
        // In a real implementation, this would use system APIs
        // For now, return a simulated value
        *self.current_memory.read().await
    }
    
    async fn get_cpu_usage(&self) -> f64 {
        // In a real implementation, this would use system APIs
        rand::random::<f64>() * 100.0
    }
    
    async fn get_fd_count(&self) -> u32 {
        // In a real implementation, this would use system APIs
        rand::random::<u32>() % 1000
    }
}

/// Resource permit
pub struct ResourcePermit<'a> {
    _permit: tokio::sync::SemaphorePermit<'a>,
    limiter: &'a ResourceLimiter,
}

impl<'a> Drop for ResourcePermit<'a> {
    fn drop(&mut self) {
        debug!("Resource permit released");
    }
}

/// Resource status
#[derive(Debug, Clone)]
pub struct ResourceStatus {
    pub memory_usage_mb: usize,
    pub memory_limit_mb: usize,
    pub cpu_usage_percent: f64,
    pub cpu_limit_percent: f64,
    pub fd_count: u32,
    pub fd_limit: u32,
    pub healthy: bool,
}

/// Rate limit manager
pub struct RateLimitManager {
    limiters: Arc<RwLock<HashMap<String, TokenBucket>>>,
    resource_limiter: Arc<ResourceLimiter>,
    config: RateLimitConfig,
}

impl RateLimitManager {
    pub fn new(config: RateLimitConfig) -> Self {
        Self {
            limiters: Arc::new(RwLock::new(HashMap::new())),
            resource_limiter: Arc::new(ResourceLimiter::new(
                1024, // 1GB memory limit
                80.0, // 80% CPU limit
                10000, // 10k file descriptors
                100,   // 100 concurrent operations
            )),
            config,
        }
    }
    
    pub async fn check_rate_limit(&self, key: &str, tokens: u32) -> Result<bool> {
        let mut limiters = self.limiters.write().await;
        
        let limiter = limiters.entry(key.to_string())
            .or_insert_with(|| TokenBucket::new(
                self.config.burst_size,
                self.config.requests_per_second
            ));
        
        Ok(limiter.try_acquire(tokens).await)
    }
    
    pub async fn acquire_resource_permit(&self) -> Result<ResourcePermit> {
        self.resource_limiter.acquire_permit().await
    }
    
    pub async fn get_resource_status(&self) -> ResourceStatus {
        self.resource_limiter.check_resources().await
    }
}

impl Default for RateLimitManager {
    fn default() -> Self {
        Self::new(RateLimitConfig::default())
    }
}

/// Global rate limit manager instance
static RATE_LIMIT_MANAGER: std::sync::OnceLock<Arc<RateLimitManager>> = std::sync::OnceLock::new();

/// Get global rate limit manager
pub fn get_rate_limit_manager() -> Arc<RateLimitManager> {
    RATE_LIMIT_MANAGER.get_or_init(|| Arc::new(RateLimitManager::default())).clone()
}

/// Initialize rate limit manager
pub async fn init_rate_limit_manager(config: RateLimitConfig) -> Result<()> {
    let manager = Arc::new(RateLimitManager::new(config));
    
    // Start resource monitoring task
    let manager_clone = manager.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(30));
        
        loop {
            interval.tick().await;
            let status = manager_clone.get_resource_status().await;
            
            if !status.healthy {
                warn!("Resource limits exceeded: {:?}", status);
            } else {
                debug!("Resource status: {:?}", status);
            }
        }
    });
    
    // Store the manager
    let _ = RATE_LIMIT_MANAGER.set(manager);
    
    tracing::info!("Rate limit manager initialized");
    Ok(())
}

/// Rate limit middleware function
pub async fn check_rate_limit_middleware(key: &str, tokens: u32) -> Result<()> {
    let manager = get_rate_limit_manager();
    
    if !manager.check_rate_limit(key, tokens).await? {
        return Err(anyhow::anyhow!("Rate limit exceeded for {}", key));
    }
    
    Ok(())
}
