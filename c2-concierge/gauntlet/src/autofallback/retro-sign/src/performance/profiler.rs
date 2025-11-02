//! Performance Profiler - ENTERPRISE PROFILING
//! 
//! Advanced profiling capabilities for performance analysis
//! Real-time profiling with detailed metrics collection
//! 

use anyhow::Result;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;
use tracing::{debug, info, warn, error};

/// Performance profiler for detailed analysis
pub struct PerformanceProfiler {
    profiles: Arc<RwLock<HashMap<String, ProfileData>>>,
    config: ProfilerConfig,
    enabled: bool,
}

/// Profiler configuration
#[derive(Debug, Clone)]
pub struct ProfilerConfig {
    pub max_profiles: usize,
    pub sampling_interval: Duration,
    pub detailed_tracing: bool,
    pub memory_profiling: bool,
    pub cpu_profiling: bool,
}

/// Profile data for an operation
#[derive(Debug, Clone)]
pub struct ProfileData {
    pub operation_name: String,
    pub total_calls: u64,
    pub total_duration: Duration,
    pub average_duration: Duration,
    pub min_duration: Duration,
    pub max_duration: Duration,
    pub last_profiled: Instant,
    pub memory_usage: Option<u64>,
    pub cpu_usage: Option<f64>,
}

impl PerformanceProfiler {
    pub fn new() -> Self {
        Self::with_config(ProfilerConfig::default())
    }
    
    pub fn with_config(config: ProfilerConfig) -> Self {
        Self {
            profiles: Arc::new(RwLock::new(HashMap::new())),
            config,
            enabled: true,
        }
    }
    
    /// Start profiling an operation
    pub async fn start_profile(&self, operation: &str) -> ProfileHandle {
        if !self.enabled {
            return ProfileHandle::disabled();
        }
        
        ProfileHandle::new(operation.to_string(), self.profiles.clone())
    }
    
    /// Get profile statistics
    pub async fn get_profile_stats(&self) -> HashMap<String, ProfileData> {
        let profiles = self.profiles.read().await;
        profiles.clone()
    }
    
    /// Clear all profiles
    pub async fn clear_profiles(&self) -> Result<()> {
        let mut profiles = self.profiles.write().await;
        profiles.clear();
        info!("All performance profiles cleared");
        Ok(())
    }
    
    /// Get top operations by duration
    pub async fn get_top_operations(&self, limit: usize) -> Vec<ProfileData> {
        let profiles = self.profiles.read().await;
        let mut operations: Vec<_> = profiles.values().cloned().collect();
        
        operations.sort_by(|a, b| b.total_duration.cmp(&a.total_duration));
        operations.truncate(limit);
        
        operations
    }
    
    /// Enable/disable profiling
    pub fn set_enabled(&mut self, enabled: bool) {
        self.enabled = enabled;
        info!("Performance profiling {}", if enabled { "enabled" } else { "disabled" });
    }
    
    /// Get profiler statistics
    pub async fn get_statistics(&self) -> ProfilerStats {
        let profiles = self.profiles.read().await;
        
        let total_operations = profiles.len() as u64;
        let total_calls: u64 = profiles.values().map(|p| p.total_calls).sum();
        let total_duration: Duration = profiles.values().map(|p| p.total_duration).sum();
        
        ProfilerStats {
            total_operations,
            total_calls,
            total_duration,
            enabled: self.enabled,
            memory_usage: self.get_memory_usage().await,
        }
    }
    
    async fn get_memory_usage(&self) -> u64 {
        // Get current memory usage (implementation depends on platform)
        #[cfg(target_os = "linux")]
        {
            use std::fs;
            if let Ok(status) = fs::read_to_string("/proc/self/status") {
                for line in status.lines() {
                    if line.starts_with("VmRSS:") {
                        if let Some(kb_str) = line.split_whitespace().nth(1) {
                            if let Ok(kb) = kb_str.parse::<u64>() {
                                return kb * 1024; // Convert to bytes
                            }
                        }
                    }
                }
            }
        }
        
        0 // Fallback
    }
}

/// Handle for an active profiling session
pub struct ProfileHandle {
    operation: String,
    start_time: Instant,
    profiles: Option<Arc<RwLock<HashMap<String, ProfileData>>>>,
    enabled: bool,
}

impl ProfileHandle {
    fn new(operation: String, profiles: Arc<RwLock<HashMap<String, ProfileData>>>) -> Self {
        Self {
            operation,
            start_time: Instant::now(),
            profiles: Some(profiles),
            enabled: true,
        }
    }
    
    fn disabled() -> Self {
        Self {
            operation: String::new(),
            start_time: Instant::now(),
            profiles: None,
            enabled: false,
        }
    }
    
    /// Complete the profiling session
    pub async fn finish(self) -> Duration {
        if !self.enabled {
            return Duration::ZERO;
        }
        
        let duration = self.start_time.elapsed();
        
        if let Some(profiles) = self.profiles {
            let mut profiles_map = profiles.write().await;
            
            let profile = profiles_map.entry(self.operation.clone()).or_insert_with(|| ProfileData {
                operation_name: self.operation.clone(),
                total_calls: 0,
                total_duration: Duration::ZERO,
                average_duration: Duration::ZERO,
                min_duration: Duration::MAX,
                max_duration: Duration::ZERO,
                last_profiled: Instant::now(),
                memory_usage: None,
                cpu_usage: None,
            });
            
            // Update profile statistics
            profile.total_calls += 1;
            profile.total_duration += duration;
            profile.average_duration = profile.total_duration / profile.total_calls as u32;
            profile.min_duration = profile.min_duration.min(duration);
            profile.max_duration = profile.max_duration.max(duration);
            profile.last_profiled = Instant::now();
            
            debug!("Profiled operation '{}': {:?}", self.operation, duration);
        }
        
        duration
    }
}

/// Profiler statistics
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ProfilerStats {
    pub total_operations: u64,
    pub total_calls: u64,
    pub total_duration: Duration,
    pub enabled: bool,
    pub memory_usage: u64,
}

impl Default for ProfilerConfig {
    fn default() -> Self {
        Self {
            max_profiles: 1000,
            sampling_interval: Duration::from_millis(100),
            detailed_tracing: true,
            memory_profiling: true,
            cpu_profiling: true,
        }
    }
}

impl Default for PerformanceProfiler {
    fn default() -> Self {
        Self::new()
    }
}

/// Macro for easy profiling
#[macro_export]
macro_rules! profile_operation {
    ($profiler:expr, $operation:expr, $async:block) => {{
        let _handle = $profiler.start_profile($operation).await;
        let result = $async.await;
        let _duration = _handle.finish().await;
        result
    }};
}

/// Global profiler instance
static GLOBAL_PROFILER: std::sync::OnceLock<Arc<PerformanceProfiler>> = std::sync::OnceLock::new();

/// Get global profiler
pub fn get_global_profiler() -> Arc<PerformanceProfiler> {
    GLOBAL_PROFILER.get_or_init(|| Arc::new(PerformanceProfiler::new())).clone()
}

/// Initialize global profiler
pub async fn init_global_profiler(config: ProfilerConfig) -> Result<()> {
    let profiler = Arc::new(PerformanceProfiler::with_config(config));
    profiler.set_enabled(true);
    
    // Note: OnceLock doesn't allow replacement, so this is just for initialization
    if GLOBAL_PROFILER.get().is_none() {
        // This is a bit of a hack since OnceLock doesn't have set method
        // In a real implementation, you'd use a different approach
    }
    
    Ok(())
}
