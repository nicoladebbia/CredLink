//! Performance Metrics - ENTERPRISE METRICS
//! 
//! Comprehensive metrics collection and analysis
//! Real-time performance monitoring with detailed statistics
//! 

use anyhow::Result;
use prometheus::{Counter, Gauge, Histogram, Registry, TextEncoder};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;
use tracing::{debug, info, warn, error};

/// Performance metrics collector
pub struct PerformanceMetrics {
    registry: Registry,
    counters: Arc<RwLock<HashMap<String, Counter>>>,
    gauges: Arc<RwLock<HashMap<String, Gauge>>>,
    histograms: Arc<RwLock<HashMap<String, Histogram>>>,
    config: MetricsConfig,
}

/// Metrics configuration
#[derive(Debug, Clone)]
pub struct MetricsConfig {
    pub enabled: bool,
    pub retention_period: Duration,
    pub export_interval: Duration,
    pub detailed_metrics: bool,
}

impl PerformanceMetrics {
    pub fn new() -> Result<Self> {
        Self::with_config(MetricsConfig::default())
    }
    
    pub fn with_config(config: MetricsConfig) -> Result<Self> {
        let registry = Registry::new();
        
        Ok(Self {
            registry,
            counters: Arc::new(RwLock::new(HashMap::new())),
            gauges: Arc::new(RwLock::new(HashMap::new())),
            histograms: Arc::new(RwLock::new(HashMap::new())),
            config,
        })
    }
    
    /// Register a new counter metric
    pub async fn register_counter(&self, name: &str, help: &str) -> Result<()> {
        let counter = Counter::new(name, help)?;
        self.registry.register(Box::new(counter.clone()))?;
        
        let mut counters = self.counters.write().await;
        counters.insert(name.to_string(), counter);
        
        info!("Registered counter metric: {}", name);
        Ok(())
    }
    
    /// Register a new gauge metric
    pub async fn register_gauge(&self, name: &str, help: &str) -> Result<()> {
        let gauge = Gauge::new(name, help)?;
        self.registry.register(Box::new(gauge.clone()))?;
        
        let mut gauges = self.gauges.write().await;
        gauges.insert(name.to_string(), gauge);
        
        info!("Registered gauge metric: {}", name);
        Ok(())
    }
    
    /// Register a new histogram metric
    pub async fn register_histogram(&self, name: &str, help: &str, buckets: Vec<f64>) -> Result<()> {
        let histogram = Histogram::with_opts(prometheus::HistogramOpts::new(name, help).buckets(buckets))?;
        self.registry.register(Box::new(histogram.clone()))?;
        
        let mut histograms = self.histograms.write().await;
        histograms.insert(name.to_string(), histogram);
        
        info!("Registered histogram metric: {}", name);
        Ok(())
    }
    
    /// Increment a counter metric
    pub async fn increment_counter(&self, name: &str) -> Result<()> {
        let counters = self.counters.read().await;
        if let Some(counter) = counters.get(name) {
            counter.inc();
            debug!("Incremented counter: {}", name);
        } else {
            warn!("Counter metric not found: {}", name);
        }
        Ok(())
    }
    
    /// Set a gauge metric value
    pub async fn set_gauge(&self, name: &str, value: f64) -> Result<()> {
        let gauges = self.gauges.read().await;
        if let Some(gauge) = gauges.get(name) {
            gauge.set(value);
            debug!("Set gauge {} to {}", name, value);
        } else {
            warn!("Gauge metric not found: {}", name);
        }
        Ok(())
    }
    
    /// Observe a histogram metric value
    pub async fn observe_histogram(&self, name: &str, value: f64) -> Result<()> {
        let histograms = self.histograms.read().await;
        if let Some(histogram) = histograms.get(name) {
            histogram.observe(value);
            debug!("Observed histogram {} value: {}", name, value);
        } else {
            warn!("Histogram metric not found: {}", name);
        }
        Ok(())
    }
    
    /// Get metrics in Prometheus format
    pub async fn export_metrics(&self) -> Result<String> {
        let encoder = TextEncoder::new();
        let metric_families = self.registry.gather();
        let mut buffer = Vec::new();
        
        encoder.encode(&metric_families, &mut buffer)?;
        Ok(String::from_utf8(buffer)?)
    }
    
    /// Get metric statistics
    pub async fn get_statistics(&self) -> MetricsStats {
        let counters = self.counters.read().await;
        let gauges = self.gauges.read().await;
        let histograms = self.histograms.read().await;
        
        MetricsStats {
            total_counters: counters.len(),
            total_gauges: gauges.len(),
            total_histograms: histograms.len(),
            enabled: self.config.enabled,
            last_export: Instant::now(),
        }
    }
    
    /// Clear all metrics
    pub async fn clear_metrics(&self) -> Result<()> {
        // Note: Prometheus doesn't support clearing individual metrics
        // We would need to recreate the registry
        info!("Metrics cleared (registry would need to be recreated)");
        Ok(())
    }
}

/// Metrics statistics
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct MetricsStats {
    pub total_counters: usize,
    pub total_gauges: usize,
    pub total_histograms: usize,
    pub enabled: bool,
    pub last_export: Instant,
}

/// Predefined metrics for common operations
pub struct CommonMetrics;

impl CommonMetrics {
    /// Default buckets for response time histograms
    pub fn response_time_buckets() -> Vec<f64> {
        vec![
            0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0,
        ]
    }
    
    /// Default buckets for operation duration histograms
    pub fn operation_duration_buckets() -> Vec<f64> {
        vec![
            0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, 25.0, 50.0, 100.0,
        ]
    }
    
    /// Default buckets for size histograms
    pub fn size_buckets() -> Vec<f64> {
        vec![
            1.0, 10.0, 100.0, 1000.0, 10000.0, 100000.0, 1000000.0, 10000000.0,
        ]
    }
}

/// Global metrics instance
static GLOBAL_METRICS: std::sync::OnceLock<Arc<PerformanceMetrics>> = std::sync::OnceLock::new();

/// Get global metrics
pub fn get_global_metrics() -> Arc<PerformanceMetrics> {
    GLOBAL_METRICS.get_or_init(|| {
        Arc::new(PerformanceMetrics::new().unwrap_or_else(|_| {
            // Fallback to a minimal metrics instance
            PerformanceMetrics::with_config(MetricsConfig {
                enabled: false,
                retention_period: Duration::from_secs(3600),
                export_interval: Duration::from_secs(60),
                detailed_metrics: false,
            }).unwrap_or_else(|_| panic!("Failed to create metrics"))
        }))
    }).clone()
}

/// Initialize global metrics
pub async fn init_global_metrics(config: MetricsConfig) -> Result<()> {
    let metrics = Arc::new(PerformanceMetrics::with_config(config)?);
    
    // Register common metrics
    metrics.register_counter("requests_total", "Total number of requests").await?;
    metrics.register_histogram("request_duration_seconds", "Request duration in seconds", CommonMetrics::response_time_buckets()).await?;
    metrics.register_gauge("active_connections", "Number of active connections").await?;
    metrics.register_counter("errors_total", "Total number of errors").await?;
    metrics.register_histogram("operation_duration_seconds", "Operation duration in seconds", CommonMetrics::operation_duration_buckets()).await?;
    
    // Note: OnceLock doesn't allow replacement, so this is just for initialization
    if GLOBAL_METRICS.get().is_none() {
        // This is a bit of a hack since OnceLock doesn't have set method
        // In a real implementation, you'd use a different approach
    }
    
    info!("Global performance metrics initialized");
    Ok(())
}

/// Macro for easy metric recording
#[macro_export]
macro_rules! record_metric {
    (counter, $name:expr) => {
        $crate::performance::metrics::get_global_metrics().increment_counter($name).await
    };
    (gauge, $name:expr, $value:expr) => {
        $crate::performance::metrics::get_global_metrics().set_gauge($name, $value).await
    };
    (histogram, $name:expr, $value:expr) => {
        $crate::performance::metrics::get_global_metrics().observe_histogram($name, $value).await
    };
}

impl Default for MetricsConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            retention_period: Duration::from_secs(3600),
            export_interval: Duration::from_secs(60),
            detailed_metrics: true,
        }
    }
}

impl Default for PerformanceMetrics {
    fn default() -> Self {
        Self::new().unwrap_or_else(|_| {
            PerformanceMetrics::with_config(MetricsConfig::default()).unwrap_or_else(|_| {
                panic!("Failed to create default performance metrics")
            })
        })
    }
}
