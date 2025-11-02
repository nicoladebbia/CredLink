//! Health check module for C2 Concierge Retro-Sign

use anyhow::Result;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::{Duration, Instant};
use tracing::{debug, info, warn};

use crate::performance::get_performance_manager;
use crate::security::get_security_manager;

/// Health check status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum HealthStatus {
    Healthy,
    Degraded,
    Unhealthy,
}

/// Health check result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthCheck {
    pub name: String,
    pub status: HealthStatus,
    pub message: Option<String>,
    pub duration_ms: u64,
    pub timestamp: chrono::DateTime<chrono::Utc>,
}

/// Overall health status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthStatusResponse {
    pub status: HealthStatus,
    pub uptime_seconds: u64,
    pub version: String,
    pub checks: Vec<HealthCheck>,
    pub timestamp: chrono::DateTime<chrono::Utc>,
}

/// Health manager
pub struct HealthManager {
    start_time: Instant,
    checks: HashMap<String, Box<dyn HealthCheckable>>,
}

impl HealthManager {
    pub fn new() -> Self {
        Self {
            start_time: Instant::now(),
            checks: HashMap::new(),
        }
    }
    
    pub fn register_check(&mut self, name: String, check: Box<dyn HealthCheckable>) {
        self.checks.insert(name, check);
    }
    
    pub async fn check_health(&self) -> HealthStatusResponse {
        let mut checks = Vec::new();
        let mut overall_status = HealthStatus::Healthy;
        
        for (name, check) &self.checks {
            let start = Instant::now();
            let result = check.check().await;
            let duration = start.elapsed();
            
            let health_check = HealthCheck {
                name: name.clone(),
                status: result.status.clone(),
                message: result.message,
                duration_ms: duration.as_millis() as u64,
                timestamp: chrono::Utc::now(),
            };
            
            // Update overall status
            match result.status {
                HealthStatus::Unhealthy => {
                    overall_status = HealthStatus::Unhealthy;
                }
                HealthStatus::Degraded if matches!(overall_status, HealthStatus::Healthy) => {
                    overall_status = HealthStatus::Degraded;
                }
                _ => {}
            }
            
            checks.push(health_check);
        }
        
        HealthStatusResponse {
            status: overall_status,
            uptime_seconds: self.start_time.elapsed().as_secs(),
            version: env!("CARGO_PKG_VERSION").to_string(),
            checks,
            timestamp: chrono::Utc::now(),
        }
    }
}

impl Default for HealthManager {
    fn default() -> Self {
        Self::new()
    }
}

/// Health checkable trait
#[async_trait::async_trait]
pub trait HealthCheckable: Send + Sync {
    async fn check(&self) -> HealthCheckResult;
}

/// Health check result
#[derive(Debug, Clone)]
pub struct HealthCheckResult {
    pub status: HealthStatus,
    pub message: Option<String>,
}

/// Performance health check
pub struct PerformanceHealthCheck;

#[async_trait::async_trait]
impl HealthCheckable for PerformanceHealthCheck {
    async fn check(&self) -> HealthCheckResult {
        match get_performance_manager() {
            Ok(manager) => {
                // Check if performance manager is responding
                if let Ok(stats) = manager.get_statistics().await {
                    debug!("Performance health check passed");
                    HealthCheckResult {
                        status: HealthStatus::Healthy,
                        message: Some(format!("Active connections: {}", stats.active_connections)),
                    }
                } else {
                    warn!("Performance health check failed: stats error");
                    HealthCheckResult {
                        status: HealthStatus::Degraded,
                        message: Some("Failed to get performance statistics".to_string()),
                    }
                }
            }
            Err(e) => {
                warn!("Performance health check failed: {}", e);
                HealthCheckResult {
                    status: HealthStatus::Unhealthy,
                    message: Some(format!("Performance manager error: {}", e)),
                }
            }
        }
    }
}

/// Security health check
pub struct SecurityHealthCheck;

#[async_trait::async_trait]
impl HealthCheckable for SecurityHealthCheck {
    async fn check(&self) -> HealthCheckResult {
        let manager = get_security_manager();
        
        // Check if security manager is initialized
        if let Ok(metrics) = manager.get_security_metrics().await {
            debug!("Security health check passed");
            HealthCheckResult {
                status: HealthStatus::Healthy,
                message: Some(format!("Security score: {:.1}", metrics.compliance_score)),
            }
        } else {
            warn!("Security health check failed: metrics error");
            HealthCheckResult {
                status: HealthStatus::Degraded,
                message: Some("Failed to get security metrics".to_string()),
            }
        }
    }
}

/// Global health manager instance
static HEALTH_MANAGER: std::sync::OnceLock<tokio::sync::Mutex<HealthManager>> = std::sync::OnceLock::new();

/// Get global health manager
pub async fn get_health_manager() -> &'static tokio::sync::Mutex<HealthManager> {
    HEALTH_MANAGER.get_or_init(|| {
        let mut manager = HealthManager::new();
        manager.register_check("performance".to_string(), Box::new(PerformanceHealthCheck));
        manager.register_check("security".to_string(), Box::new(SecurityHealthCheck));
        tokio::sync::Mutex::new(manager)
    })
}

/// Initialize health manager
pub async fn init_health_manager() -> Result<()> {
    info!("Initializing health manager");
    let _manager = get_health_manager().await;
    info!("Health manager initialized");
    Ok(())
}

/// Perform health check
pub async fn check_application_health() -> Result<HealthStatusResponse> {
    let manager = get_health_manager().await;
    let health_status = manager.lock().await.check_health().await;
    Ok(health_status)
}
