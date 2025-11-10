//! Performance Cache - ENTERPRISE CACHING
//! 
//! Advanced caching system for performance optimization
//! Multi-level caching with intelligent eviction policies
//! 

use anyhow::Result;
use std::collections::{HashMap, LRUCache};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;
use tracing::{debug, info, warn, error};

/// Advanced performance cache
pub struct PerformanceCache<K, V> {
    cache: Arc<RwLock<LRUCache<K, CacheEntry<V>>>>,
    config: CacheConfig,
    stats: Arc<RwLock<CacheStats>>,
}

/// Cache configuration
#[derive(Debug, Clone)]
pub struct CacheConfig {
    pub max_size: usize,
    pub ttl: Duration,
    pub cleanup_interval: Duration,
    pub eviction_policy: EvictionPolicy,
}

/// Cache eviction policies
#[derive(Debug, Clone, PartialEq)]
pub enum EvictionPolicy {
    LRU,
    LFU,
    FIFO,
    TTL,
}

/// Cache entry with metadata
#[derive(Debug, Clone)]
pub struct CacheEntry<V> {
    pub value: V,
    pub created_at: Instant,
    pub last_accessed: Instant,
    pub access_count: u64,
    pub ttl: Option<Duration>,
}

/// Cache statistics
#[derive(Debug, Clone, Default)]
pub struct CacheStats {
    pub hits: u64,
    pub misses: u64,
    pub sets: u64,
    pub deletes: u64,
    pub evictions: u64,
    pub total_size: usize,
}

impl<K, V> PerformanceCache<K, V>
where
    K: std::hash::Hash + Eq + Clone,
    V: Clone,
{
    pub fn new(config: CacheConfig) -> Self {
        Self {
            cache: Arc::new(RwLock::new(LRUCache::new(config.max_size))),
            config,
            stats: Arc::new(RwLock::new(CacheStats::default())),
        }
    }
    
    /// Get a value from the cache
    pub async fn get(&self, key: &K) -> Option<V> {
        let mut cache = self.cache.write().await;
        let mut stats = self.stats.write().await;
        
        if let Some(entry) = cache.get_mut(key) {
            // Check TTL
            if let Some(ttl) = entry.ttl {
                if entry.created_at.elapsed() > ttl {
                    cache.pop(key);
                    stats.misses += 1;
                    return None;
                }
            }
            
            // Update access metadata
            entry.last_accessed = Instant::now();
            entry.access_count += 1;
            stats.hits += 1;
            
            debug!("Cache hit for key: {:?}", key);
            Some(entry.value.clone())
        } else {
            stats.misses += 1;
            debug!("Cache miss for key: {:?}", key);
            None
        }
    }
    
    /// Set a value in the cache
    pub async fn set(&self, key: K, value: V) -> Result<()> {
        let mut cache = self.cache.write().await;
        let mut stats = self.stats.write().await;
        
        let entry = CacheEntry {
            value: value.clone(),
            created_at: Instant::now(),
            last_accessed: Instant::now(),
            access_count: 0,
            ttl: Some(self.config.ttl),
        };
        
        // Check if eviction is needed
        if cache.len() >= self.config.max_size {
            if let Some((evicted_key, _)) = cache.pop_lru() {
                stats.evictions += 1;
                debug!("Evicted cache entry: {:?}", evicted_key);
            }
        }
        
        cache.put(key.clone(), entry);
        stats.sets += 1;
        stats.total_size = cache.len();
        
        debug!("Cache set for key: {:?}", key);
        Ok(())
    }
    
    /// Set a value with custom TTL
    pub async fn set_with_ttl(&self, key: K, value: V, ttl: Duration) -> Result<()> {
        let mut cache = self.cache.write().await;
        let mut stats = self.stats.write().await;
        
        let entry = CacheEntry {
            value: value.clone(),
            created_at: Instant::now(),
            last_accessed: Instant::now(),
            access_count: 0,
            ttl: Some(ttl),
        };
        
        // Check if eviction is needed
        if cache.len() >= self.config.max_size {
            if let Some((evicted_key, _)) = cache.pop_lru() {
                stats.evictions += 1;
                debug!("Evicted cache entry: {:?}", evicted_key);
            }
        }
        
        cache.put(key.clone(), entry);
        stats.sets += 1;
        stats.total_size = cache.len();
        
        debug!("Cache set with TTL for key: {:?}", key);
        Ok(())
    }
    
    /// Delete a value from the cache
    pub async fn delete(&self, key: &K) -> bool {
        let mut cache = self.cache.write().await;
        let mut stats = self.stats.write().await;
        
        if cache.pop(key).is_some() {
            stats.deletes += 1;
            stats.total_size = cache.len();
            debug!("Cache delete for key: {:?}", key);
            true
        } else {
            false
        }
    }
    
    /// Clear all entries from the cache
    pub async fn clear(&self) -> Result<()> {
        let mut cache = self.cache.write().await;
        let mut stats = self.stats.write().await;
        
        cache.clear();
        stats.total_size = 0;
        
        info!("Cache cleared");
        Ok(())
    }
    
    /// Get cache statistics
    pub async fn get_stats(&self) -> CacheStats {
        let stats = self.stats.read().await;
        stats.clone()
    }
    
    /// Get cache hit ratio
    pub async fn hit_ratio(&self) -> f64 {
        let stats = self.stats.read().await;
        if stats.hits + stats.misses == 0 {
            0.0
        } else {
            stats.hits as f64 / (stats.hits + stats.misses) as f64
        }
    }
    
    /// Clean up expired entries
    pub async fn cleanup_expired(&self) -> Result<usize> {
        let mut cache = self.cache.write().await;
        let mut stats = self.stats.write().await;
        
        let initial_size = cache.len();
        let now = Instant::now();
        
        // Remove expired entries
        cache.retain(|_, entry| {
            if let Some(ttl) = entry.ttl {
                now.duration_since(entry.created_at) <= ttl
            } else {
                true
            }
        });
        
        let cleaned_count = initial_size - cache.len();
        stats.total_size = cache.len();
        
        if cleaned_count > 0 {
            info!("Cleaned up {} expired cache entries", cleaned_count);
        }
        
        Ok(cleaned_count)
    }
    
    /// Get cache size
    pub async fn size(&self) -> usize {
        let cache = self.cache.read().await;
        cache.len()
    }
    
    /// Check if cache is empty
    pub async fn is_empty(&self) -> bool {
        let cache = self.cache.read().await;
        cache.is_empty()
    }
}

/// Multi-level cache system
pub struct MultiLevelCache<K, V> {
    l1_cache: PerformanceCache<K, V>, // Memory cache
    l2_cache: Option<PerformanceCache<K, V>>, // Optional disk cache
    config: MultiLevelCacheConfig,
}

/// Multi-level cache configuration
#[derive(Debug, Clone)]
pub struct MultiLevelCacheConfig {
    pub l1_config: CacheConfig,
    pub l2_config: Option<CacheConfig>,
    pub l1_first: bool, // Check L1 before L2
}

impl<K, V> MultiLevelCache<K, V>
where
    K: std::hash::Hash + Eq + Clone,
    V: Clone,
{
    pub fn new(config: MultiLevelCacheConfig) -> Self {
        let l2_cache = config.l2_config.as_ref().map(|cfg| PerformanceCache::new(cfg.clone()));
        
        Self {
            l1_cache: PerformanceCache::new(config.l1_config.clone()),
            l2_cache,
            config,
        }
    }
    
    /// Get value from multi-level cache
    pub async fn get(&self, key: &K) -> Option<V> {
        // Check L1 cache first
        if self.config.l1_first {
            if let Some(value) = self.l1_cache.get(key).await {
                return Some(value);
            }
        }
        
        // Check L2 cache
        if let Some(ref l2_cache) = self.l2_cache {
            if let Some(value) = l2_cache.get(key).await {
                // Promote to L1 if found in L2
                let _ = self.l1_cache.set(key.clone(), value.clone()).await;
                return Some(value);
            }
        }
        
        // Check L1 cache if not checked first
        if !self.config.l1_first {
            if let Some(value) = self.l1_cache.get(key).await {
                return Some(value);
            }
        }
        
        None
    }
    
    /// Set value in multi-level cache
    pub async fn set(&self, key: K, value: V) -> Result<()> {
        // Always set in L1
        self.l1_cache.set(key.clone(), value.clone()).await?;
        
        // Set in L2 if available
        if let Some(ref l2_cache) = self.l2_cache {
            l2_cache.set(key, value).await?;
        }
        
        Ok(())
    }
    
    /// Get combined statistics
    pub async fn get_combined_stats(&self) -> MultiLevelCacheStats {
        let l1_stats = self.l1_cache.get_stats().await;
        let l2_stats = if let Some(ref l2_cache) = self.l2_cache {
            Some(l2_cache.get_stats().await)
        } else {
            None
        };
        
        MultiLevelCacheStats {
            l1_stats,
            l2_stats,
            total_hits: l1_stats.hits + l2_stats.as_ref().map(|s| s.hits).unwrap_or(0),
            total_misses: l1_stats.misses + l2_stats.as_ref().map(|s| s.misses).unwrap_or(0),
        }
    }
}

/// Multi-level cache statistics
#[derive(Debug, Clone)]
pub struct MultiLevelCacheStats {
    pub l1_stats: CacheStats,
    pub l2_stats: Option<CacheStats>,
    pub total_hits: u64,
    pub total_misses: u64,
}

impl Default for CacheConfig {
    fn default() -> Self {
        Self {
            max_size: 1000,
            ttl: Duration::from_secs(3600), // 1 hour
            cleanup_interval: Duration::from_secs(300), // 5 minutes
            eviction_policy: EvictionPolicy::LRU,
        }
    }
}

impl Default for MultiLevelCacheConfig {
    fn default() -> Self {
        Self {
            l1_config: CacheConfig {
                max_size: 1000,
                ttl: Duration::from_secs(300), // 5 minutes
                cleanup_interval: Duration::from_secs(60), // 1 minute
                eviction_policy: EvictionPolicy::LRU,
            },
            l2_config: Some(CacheConfig {
                max_size: 10000,
                ttl: Duration::from_secs(3600), // 1 hour
                cleanup_interval: Duration::from_secs(300), // 5 minutes
                eviction_policy: EvictionPolicy::LRU,
            }),
            l1_first: true,
        }
    }
}

impl Default for CacheStats {
    fn default() -> Self {
        Self {
            hits: 0,
            misses: 0,
            sets: 0,
            deletes: 0,
            evictions: 0,
            total_size: 0,
        }
    }
}
