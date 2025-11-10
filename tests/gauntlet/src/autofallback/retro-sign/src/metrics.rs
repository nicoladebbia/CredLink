//! Metrics collection for C2 Concierge Retro-Sign

use anyhow::Result;
use prometheus::{Counter, Gauge, Histogram, IntCounter, IntGauge, Registry};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;
use tracing::debug;

#[derive(Clone)]
pub struct MetricsCollector {
    registry: Arc<Registry>,
    
    // Counters
    objects_processed_total: IntCounter,
    objects_failed_total: IntCounter,
    objects_skipped_total: IntCounter,
    manifests_created_total: IntCounter,
    bytes_processed_total: IntCounter,
    tsa_requests_total: IntCounter,
    
    // Gauges
    objects_in_flight: IntGauge,
    bytes_in_flight: IntGauge,
    sign_queue_depth: IntGauge,
    
    // Histograms
    sign_duration: Histogram,
    download_duration: Histogram,
    upload_duration: Histogram,
    end_to_end_duration: Histogram,
    
    // Internal state
    start_time: Arc<RwLock<Instant>>,
    last_checkpoint_time: Arc<RwLock<Instant>>,
}

impl MetricsCollector {
    pub fn new() -> Result<Self> {
        let registry = Arc::new(Registry::new());
        
        // Create metrics
        let objects_processed_total = IntCounter::new("c2c_objects_processed_total", "Total objects processed")
            .with_context(|| "Failed to create objects_processed_total metric")?;
        let objects_failed_total = IntCounter::new("c2c_objects_failed_total", "Total objects failed")
            .with_context(|| "Failed to create objects_failed_total metric")?;
        let objects_skipped_total = IntCounter::new("c2c_objects_skipped_total", "Total objects skipped")
            .with_context(|| "Failed to create objects_skipped_total metric")?;
        let manifests_created_total = IntCounter::new("c2c_manifests_created_total", "Total manifests created")
            .with_context(|| "Failed to create manifests_created_total metric")?;
        let bytes_processed_total = IntCounter::new("c2c_bytes_processed_total", "Total bytes processed")
            .with_context(|| "Failed to create bytes_processed_total metric")?;
        let tsa_requests_total = IntCounter::new("c2c_tsa_requests_total", "Total TSA requests")
            .with_context(|| "Failed to create tsa_requests_total metric")?;
        
        let objects_in_flight = IntGauge::new("c2c_objects_in_flight", "Objects currently being processed")
            .with_context(|| "Failed to create objects_in_flight metric")?;
        let bytes_in_flight = IntGauge::new("c2c_bytes_in_flight", "Bytes currently being processed")
            .with_context(|| "Failed to create bytes_in_flight metric")?;
        let sign_queue_depth = IntGauge::new("c2c_sign_queue_depth", "Current sign queue depth")
            .with_context(|| "Failed to create sign_queue_depth metric")?;
        
        let sign_duration = Histogram::with_opts(
            prometheus::HistogramOpts::new("c2c_sign_duration_seconds", "Sign operation duration")
                .buckets(vec![0.1, 0.5, 1.0, 2.0, 5.0, 10.0, 30.0])
        ).with_context(|| "Failed to create sign_duration histogram")?;
        
        let download_duration = Histogram::with_opts(
            prometheus::HistogramOpts::new("c2c_download_duration_seconds", "Download operation duration")
                .buckets(vec![0.1, 0.5, 1.0, 2.0, 5.0, 10.0, 30.0])
        ).with_context(|| "Failed to create download_duration histogram")?;
        
        let upload_duration = Histogram::with_opts(
            prometheus::HistogramOpts::new("c2c_upload_duration_seconds", "Upload operation duration")
                .buckets(vec![0.1, 0.5, 1.0, 2.0, 5.0, 10.0, 30.0])
        ).with_context(|| "Failed to create upload_duration histogram")?;
        
        let end_to_end_duration = Histogram::with_opts(
            prometheus::HistogramOpts::new("c2c_end_to_end_duration_seconds", "End-to-end operation duration")
                .buckets(vec![0.5, 1.0, 2.0, 5.0, 10.0, 30.0, 60.0, 300.0])
        ).with_context(|| "Failed to create end_to_end_duration histogram")?;
        
        // Register metrics
        registry.register(Box::new(objects_processed_total.clone()))
            .with_context(|| "Failed to register objects_processed_total metric")?;
        registry.register(Box::new(objects_failed_total.clone()))
            .with_context(|| "Failed to register objects_failed_total metric")?;
        registry.register(Box::new(objects_skipped_total.clone()))
            .with_context(|| "Failed to register objects_skipped_total metric")?;
        registry.register(Box::new(manifests_created_total.clone()))
            .with_context(|| "Failed to register manifests_created_total metric")?;
        registry.register(Box::new(bytes_processed_total.clone()))
            .with_context(|| "Failed to register bytes_processed_total metric")?;
        registry.register(Box::new(tsa_requests_total.clone()))
            .with_context(|| "Failed to register tsa_requests_total metric")?;
        registry.register(Box::new(objects_in_flight.clone()))
            .with_context(|| "Failed to register objects_in_flight metric")?;
        registry.register(Box::new(bytes_in_flight.clone()))
            .with_context(|| "Failed to register bytes_in_flight metric")?;
        registry.register(Box::new(sign_queue_depth.clone()))
            .with_context(|| "Failed to register sign_queue_depth metric")?;
        registry.register(Box::new(sign_duration.clone()))
            .with_context(|| "Failed to register sign_duration metric")?;
        registry.register(Box::new(download_duration.clone()))
            .with_context(|| "Failed to register download_duration metric")?;
        registry.register(Box::new(upload_duration.clone()))
            .with_context(|| "Failed to register upload_duration metric")?;
        registry.register(Box::new(end_to_end_duration.clone()))
            .with_context(|| "Failed to register end_to_end_duration metric")?;
        
        Ok(Self {
            registry,
            objects_processed_total,
            objects_failed_total,
            objects_skipped_total,
            manifests_created_total,
            bytes_processed_total,
            tsa_requests_total,
            objects_in_flight,
            bytes_in_flight,
            sign_queue_depth,
            sign_duration,
            download_duration,
            upload_duration,
            end_to_end_duration,
            start_time: Arc::new(RwLock::new(Instant::now())),
            last_checkpoint_time: Arc::new(RwLock::new(Instant::now())),
        })
    }
    
    pub fn increment_processed_objects(&self, count: usize) {
        self.objects_processed_total.inc_by(count as u64);
        debug!("Incremented processed objects by {}", count);
    }
    
    pub fn increment_failed_objects(&self, count: usize) {
        self.objects_failed_total.inc_by(count as u64);
        debug!("Incremented failed objects by {}", count);
    }
    
    pub fn increment_skipped_objects(&self, count: usize) {
        self.objects_skipped_total.inc_by(count as u64);
        debug!("Incremented skipped objects by {}", count);
    }
    
    pub fn increment_manifests_created(&self, count: usize) {
        self.manifests_created_total.inc_by(count as u64);
        debug!("Incremented manifests created by {}", count);
    }
    
    pub fn add_bytes_processed(&self, bytes: u64) {
        self.bytes_processed_total.inc_by(bytes);
        debug!("Added {} bytes to processed total", bytes);
    }
    
    pub fn increment_tsa_requests(&self, count: usize) {
        self.tsa_requests_total.inc_by(count as u64);
        debug!("Incremented TSA requests by {}", count);
    }
    
    pub fn set_objects_in_flight(&self, count: usize) {
        self.objects_in_flight.set(count as i64);
        debug!("Set objects in flight to {}", count);
    }
    
    pub fn set_bytes_in_flight(&self, bytes: u64) {
        self.bytes_in_flight.set(bytes as i64);
        debug!("Set bytes in flight to {}", bytes);
    }
    
    pub fn set_sign_queue_depth(&self, depth: usize) {
        self.sign_queue_depth.set(depth as i64);
        debug!("Set sign queue depth to {}", depth);
    }
    
    pub fn observe_sign_duration(&self, duration: Duration) {
        self.sign_duration.observe(duration.as_secs_f64());
        debug!("Observed sign duration: {:.3}s", duration.as_secs_f64());
    }
    
    pub fn observe_download_duration(&self, duration: Duration) {
        self.download_duration.observe(duration.as_secs_f64());
        debug!("Observed download duration: {:.3}s", duration.as_secs_f64());
    }
    
    pub fn observe_upload_duration(&self, duration: Duration) {
        self.upload_duration.observe(duration.as_secs_f64());
        debug!("Observed upload duration: {:.3}s", duration.as_secs_f64());
    }
    
    pub fn observe_end_to_end_duration(&self, duration: Duration) {
        self.end_to_end_duration.observe(duration.as_secs_f64());
        debug!("Observed end-to-end duration: {:.3}s", duration.as_secs_f64());
    }
    
    pub fn update_checkpoint_time(&self) {
        let mut last_checkpoint = self.last_checkpoint_time.write().await;
        *last_checkpoint = Instant::now();
        debug!("Updated checkpoint time");
    }
    
    pub async fn get_snapshot(&self) -> MetricsSnapshot {
        let start_time = *self.start_time.read().await;
        let last_checkpoint = *self.last_checkpoint_time.read().await;
        
        MetricsSnapshot {
            objects_processed_total: self.objects_processed_total.get(),
            objects_failed_total: self.objects_failed_total.get(),
            objects_skipped_total: self.objects_skipped_total.get(),
            manifests_created_total: self.manifests_created_total.get(),
            bytes_processed_total: self.bytes_processed_total.get(),
            tsa_requests_total: self.tsa_requests_total.get(),
            objects_in_flight: self.objects_in_flight.get(),
            bytes_in_flight: self.bytes_in_flight.get(),
            sign_queue_depth: self.sign_queue_depth.get(),
            uptime_seconds: start_time.elapsed().as_secs(),
            time_since_last_checkpoint_seconds: last_checkpoint.elapsed().as_secs(),
        }
    }
    
    pub fn get_prometheus_metrics(&self) -> Result<String> {
        use prometheus::Encoder;
        
        let encoder = prometheus::TextEncoder::new();
        let metric_families = self.registry.gather();
        let metrics = encoder.encode_to_string(&metric_families)?;
        
        Ok(metrics)
    }
    
    pub fn reset(&self) {
        self.objects_processed_total.reset();
        self.objects_failed_total.reset();
        self.objects_skipped_total.reset();
        self.manifests_created_total.reset();
        self.bytes_processed_total.reset();
        self.tsa_requests_total.reset();
        self.objects_in_flight.set(0);
        self.bytes_in_flight.set(0);
        self.sign_queue_depth.set(0);
        debug!("Reset all metrics");
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct MetricsSnapshot {
    pub objects_processed_total: u64,
    pub objects_failed_total: u64,
    pub objects_skipped_total: u64,
    pub manifests_created_total: u64,
    pub bytes_processed_total: u64,
    pub tsa_requests_total: u64,
    pub objects_in_flight: i64,
    pub bytes_in_flight: i64,
    pub sign_queue_depth: i64,
    pub uptime_seconds: u64,
    pub time_since_last_checkpoint_seconds: u64,
}

impl MetricsSnapshot {
    pub fn success_rate(&self) -> f64 {
        let total = self.objects_processed_total + self.objects_failed_total;
        if total == 0 {
            0.0
        } else {
            self.objects_processed_total as f64 / total as f64 * 100.0
        }
    }
    
    pub fn average_object_size(&self) -> f64 {
        if self.objects_processed_total == 0 {
            0.0
        } else {
            self.bytes_processed_total as f64 / self.objects_processed_total as f64
        }
    }
    
    pub fn objects_per_second(&self) -> f64 {
        if self.uptime_seconds == 0 {
            0.0
        } else {
            self.objects_processed_total as f64 / self.uptime_seconds as f64
        }
    }
    
    pub fn bytes_per_second(&self) -> f64 {
        if self.uptime_seconds == 0 {
            0.0
        } else {
            self.bytes_processed_total as f64 / self.uptime_seconds as f64
        }
    }
}

pub fn init() -> Result<()> {
    // Initialize global metrics exporter
    metrics::set_boxed_recorder(Box::new(MetricsRecorder::new()))
        .with_context(|| "Failed to set global metrics recorder")?;
    Ok(())
}

struct MetricsRecorder;

impl MetricsRecorder {
    fn new() -> Self {
        Self
    }
}

impl metrics::Recorder for MetricsRecorder {
    fn describe_counter(&self, _key: metrics::Key, _unit: Option<metrics::Unit>, _description: metrics::SharedString) {
        // Implementation for describing counters
    }
    
    fn describe_gauge(&self, _key: metrics::Key, _unit: Option<metrics::Unit>, _description: metrics::SharedString) {
        // Implementation for describing gauges
    }
    
    fn describe_histogram(&self, _key: metrics::Key, _unit: Option<metrics::Unit>, _description: metrics::SharedString) {
        // Implementation for describing histograms
    }
    
    fn register_counter(&self, _key: &metrics::Key) -> metrics::Counter {
        metrics::Counter::noop()
    }
    
    fn register_gauge(&self, _key: &metrics::Key) -> metrics::Gauge {
        metrics::Gauge::noop()
    }
    
    fn register_histogram(&self, _key: &metrics::Key) -> metrics::Histogram {
        metrics::Histogram::noop()
    }
}
