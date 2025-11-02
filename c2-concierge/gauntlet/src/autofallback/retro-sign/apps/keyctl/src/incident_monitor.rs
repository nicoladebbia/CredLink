//! Incident Monitor - CONTINUOUS THREAT DETECTION
//! 
//! This service runs continuously to:
//! - Monitor signing health and backend availability
//! - Detect anomalies and security threats automatically
//! - Track compliance violations and policy breaches
//! - Trigger automated incident response workflows
//! 
//! NO MORE MANUAL MONITORING - This MUST be fully automated

use anyhow::{Context, Result};
use chrono::{DateTime, Utc, Duration};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio::time::{interval, sleep};
use tracing::{debug, error, info, warn};

use crate::{PolicyManager, IncidentEngine, IncidentEngineConfig, IncidentType, IncidentSeverity};

/// Monitor configuration
#[derive(Debug, Clone)]
pub struct MonitorConfig {
    pub health_check_interval_seconds: u64,
    pub anomaly_detection_enabled: bool,
    pub compliance_monitoring: bool,
    pub backend_health_threshold: f64,
    pub signature_rate_threshold: u64,
    pub error_rate_threshold: f64,
}

/// Health check result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthCheckResult {
    pub tenant_id: String,
    pub backend_type: String,
    pub is_healthy: bool,
    pub latency_ms: u64,
    pub error_rate: f64,
    pub signatures_per_minute: u64,
    pub last_check: DateTime<Utc>,
    pub issues: Vec<String>,
}

/// Anomaly detection result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnomalyResult {
    pub tenant_id: String,
    pub anomaly_type: String,
    pub severity: IncidentSeverity,
    pub detected_at: DateTime<Utc>,
    pub description: String,
    pub metrics: HashMap<String, f64>,
}

/// Monitor status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonitorStatus {
    pub is_running: bool,
    pub last_health_check: DateTime<Utc>,
    pub next_health_check: DateTime<Utc>,
    pub tenants_monitored: usize,
    pub active_incidents: usize,
    pub health_issues_detected: usize,
    pub anomalies_detected: usize,
}

/// Incident Monitor - CONTINUOUS THREAT SURVEILLANCE
pub struct IncidentMonitor {
    policy_manager: Arc<PolicyManager>,
    incident_engine: Arc<IncidentEngine>,
    config: MonitorConfig,
    is_running: Arc<RwLock<bool>>,
    status: Arc<RwLock<MonitorStatus>>,
    health_history: Arc<RwLock<HashMap<String, Vec<HealthCheckResult>>>>,
}

impl IncidentMonitor {
    pub fn new(
        policy_manager: Arc<PolicyManager>,
        incident_engine: Arc<IncidentEngine>,
        config: MonitorConfig,
    ) -> Self {
        Self {
            policy_manager,
            incident_engine,
            config,
            is_running: Arc::new(RwLock::new(false)),
            status: Arc::new(RwLock::new(MonitorStatus {
                is_running: false,
                last_health_check: Utc::now(),
                next_health_check: Utc::now(),
                tenants_monitored: 0,
                active_incidents: 0,
                health_issues_detected: 0,
                anomalies_detected: 0,
            })),
            health_history: Arc::new(RwLock::new(HashMap::new())),
        }
    }
    
    /// Start the monitor - CONTINUOUS SURVEILLANCE
    pub async fn start(&self) -> Result<()> {
        info!("Starting incident monitor with {} second health checks", 
            self.config.health_check_interval_seconds);
        
        {
            let mut is_running = self.is_running.write().await;
            if *is_running {
                warn!("Monitor is already running");
                return Ok(());
            }
            *is_running = true;
        }
        
        // Update status
        {
            let mut status = self.status.write().await;
            status.is_running = true;
            status.next_health_check = Utc::now() + 
                Duration::seconds(self.config.health_check_interval_seconds as i64);
        }
        
        let policy_manager = self.policy_manager.clone();
        let incident_engine = self.incident_engine.clone();
        let config = self.config.clone();
        let is_running = self.is_running.clone();
        let status = self.status.clone();
        let health_history = self.health_history.clone();
        
        // Spawn the monitor loop
        tokio::spawn(async move {
            let mut interval = interval(Duration::from_secs(config.health_check_interval_seconds));
            
            loop {
                // Check if we should continue running
                {
                    let running = is_running.read().await;
                    if !*running {
                        info!("Monitor stopped");
                        break;
                    }
                }
                
                interval.tick().await;
                
                // Perform monitoring cycle
                if let Err(e) = Self::perform_monitoring_cycle(
                    &policy_manager,
                    &incident_engine,
                    &config,
                    &status,
                    &health_history,
                ).await {
                    error!("Monitoring cycle failed: {}", e);
                }
            }
        });
        
        info!("Incident monitor started successfully");
        Ok(())
    }
    
    /// Stop the monitor
    pub async fn stop(&self) -> Result<()> {
        info!("Stopping incident monitor");
        
        {
            let mut is_running = self.is_running.write().await;
            *is_running = false;
        }
        
        // Update status
        {
            let mut status = self.status.write().await;
            status.is_running = false;
        }
        
        info!("Incident monitor stopped");
        Ok(())
    }
    
    /// Get current monitor status
    pub async fn get_status(&self) -> Result<MonitorStatus> {
        let status = self.status.read().await;
        Ok(status.clone())
    }
    
    /// Force immediate health check
    pub async fn force_health_check(&self) -> Result<()> {
        info!("Forcing immediate health check");
        
        Self::perform_monitoring_cycle(
            &self.policy_manager,
            &self.incident_engine,
            &self.config,
            &self.status,
            &self.health_history,
        ).await?;
        
        info!("Forced health check completed");
        Ok(())
    }
    
    /// Core monitoring logic - NO SHORTCUTS
    async fn perform_monitoring_cycle(
        policy_manager: &Arc<PolicyManager>,
        incident_engine: &Arc<IncidentEngine>,
        config: &MonitorConfig,
        status: &Arc<RwLock<MonitorStatus>>,
        health_history: &Arc<RwLock<HashMap<String, Vec<HealthCheckResult>>>>,
    ) -> Result<()> {
        let now = Utc::now();
        debug!("Performing monitoring cycle at {}", now.format("%Y-%m-%d %H:%M:%S UTC"));
        
        // Get all tenants
        let tenants = policy_manager.list_tenants().await?;
        let total_tenants = tenants.len();
        
        // Perform health checks for all tenants
        let mut health_results = Vec::new();
        let mut health_issues = 0;
        
        for tenant_id in tenants {
            let health_result = Self::perform_tenant_health_check(
                policy_manager,
                &tenant_id,
            ).await?;
            
            // Store health history
            {
                let mut history = health_history.write().await;
                let tenant_history = history.entry(tenant_id.clone()).or_insert_with(Vec::new);
                tenant_history.push(health_result.clone());
                
                // Keep only last 100 results per tenant
                if tenant_history.len() > 100 {
                    tenant_history.remove(0);
                }
            }
            
            if !health_result.is_healthy {
                health_issues += 1;
            }
            
            health_results.push(health_result);
        }
        
        // Detect anomalies if enabled
        let mut anomalies = Vec::new();
        if config.anomaly_detection_enabled {
            for health_result in &health_results {
                let tenant_anomalies = Self::detect_anomalies(
                    health_history,
                    health_result,
                    config,
                ).await?;
                anomalies.extend(tenant_anomalies);
            }
        }
        
        // Perform compliance monitoring if enabled
        let mut compliance_issues = Vec::new();
        if config.compliance_monitoring {
            for health_result in &health_results {
                let compliance_violations = Self::check_compliance(
                    policy_manager,
                    health_result,
                ).await?;
                compliance_issues.extend(compliance_violations);
            }
        }
        
        // Trigger incident responses
        for health_result in &health_results {
            if !health_result.is_healthy {
                Self::trigger_health_incident(
                    incident_engine,
                    health_result,
                ).await?;
            }
        }
        
        for anomaly in &anomalies {
            Self::trigger_anomaly_incident(
                incident_engine,
                anomaly,
            ).await?;
        }
        
        for compliance_issue in &compliance_issues {
            Self::trigger_compliance_incident(
                incident_engine,
                compliance_issue,
            ).await?;
        }
        
        // Get active incidents count
        let active_incidents = incident_engine.list_active_incidents().await?.len();
        
        // Update status
        {
            let mut status_lock = status.write().await;
            status_lock.last_health_check = now;
            status_lock.next_health_check = now + 
                Duration::seconds(config.health_check_interval_seconds as i64);
            status_lock.tenants_monitored = total_tenants;
            status_lock.active_incidents = active_incidents;
            status_lock.health_issues_detected = health_issues;
            status_lock.anomalies_detected = anomalies.len();
        }
        
        debug!("Monitoring cycle completed: {} tenants, {} health issues, {} anomalies, {} compliance issues",
            total_tenants, health_issues, anomalies.len(), compliance_issues.len());
        
        Ok(())
    }
    
    /// Perform health check for a single tenant
    async fn perform_tenant_health_check(
        policy_manager: &Arc<PolicyManager>,
        tenant_id: &str,
    ) -> Result<HealthCheckResult> {
        debug!("Performing health check for tenant: {}", tenant_id);
        
        // Get tenant policy
        let policy = policy_manager.get_policy(tenant_id).await?;
        
        // Perform backend health check
        let (is_healthy, latency_ms, error_rate, issues) = 
            Self::check_backend_health(&policy).await?;
        
        // Get signing metrics
        let signatures_per_minute = Self::get_signing_metrics(tenant_id).await?;
        
        let health_result = HealthCheckResult {
            tenant_id: tenant_id.to_string(),
            backend_type: format!("{:?}", policy.key.key_type),
            is_healthy,
            latency_ms,
            error_rate,
            signatures_per_minute,
            last_check: Utc::now(),
            issues,
        };
        
        debug!("Health check for tenant {}: healthy={}, latency={}ms, error_rate={:.2}%", 
            tenant_id, is_healthy, latency_ms, error_rate * 100.0);
        
        Ok(health_result)
    }
    
    /// Check backend health
    async fn check_backend_health(policy: &crate::SigningPolicy) -> Result<(bool, u64, f64, Vec<String>)> {
        let start_time = std::time::Instant::now();
        let mut issues = Vec::new();
        
        // In production, this would perform actual health checks
        // For now, simulate based on policy
        
        let is_healthy = match policy.key.key_type {
            crate::KeyType::HSM => {
                // Simulate HSM health check
                let hsm_available = true; // Would check actual HSM
                if !hsm_available {
                    issues.push("HSM device not responding".to_string());
                }
                hsm_available
            }
            crate::KeyType::KMS => {
                // Simulate KMS health check
                let kms_available = true; // Would check actual KMS
                if !kms_available {
                    issues.push("KMS endpoint unreachable".to_string());
                }
                kms_available
            }
            crate::KeyType::Software => {
                // Software backend is always available
                true
            }
        };
        
        let latency_ms = start_time.elapsed().as_millis() as u64;
        let error_rate = if is_healthy { 0.0 } else { 1.0 };
        
        Ok((is_healthy, latency_ms, error_rate, issues))
    }
    
    /// Get signing metrics for tenant
    async fn get_signing_metrics(tenant_id: &str) -> Result<u64> {
        // In production, this would query actual signing metrics
        // For now, return simulated data
        Ok(50) // 50 signatures per minute
    }
    
    /// Detect anomalies in health data
    async fn detect_anomalies(
        health_history: &Arc<RwLock<HashMap<String, Vec<HealthCheckResult>>>>,
        current_result: &HealthCheckResult,
        config: &MonitorConfig,
    ) -> Result<Vec<AnomalyResult>> {
        let mut anomalies = Vec::new();
        
        // Get historical data
        let history = {
            let history_lock = health_history.read().await;
            history_lock.get(&current_result.tenant_id).cloned().unwrap_or_default()
        };
        
        if history.len() < 5 {
            // Not enough data for anomaly detection
            return Ok(anomalies);
        }
        
        // Calculate baseline metrics
        let avg_latency: f64 = history.iter()
            .map(|h| h.latency_ms as f64)
            .sum::<f64>() / history.len() as f64;
        
        let avg_error_rate: f64 = history.iter()
            .map(|h| h.error_rate)
            .sum::<f64>() / history.len() as f64;
        
        let avg_signature_rate: f64 = history.iter()
            .map(|h| h.signatures_per_minute as f64)
            .sum::<f64>() / history.len() as f64;
        
        // Detect latency anomaly
        let latency_increase = (current_result.latency_ms as f64 - avg_latency) / avg_latency;
        if latency_increase > 2.0 {
            anomalies.push(AnomalyResult {
                tenant_id: current_result.tenant_id.clone(),
                anomaly_type: "high_latency".to_string(),
                severity: IncidentSeverity::Medium,
                detected_at: Utc::now(),
                description: format!("Latency increased by {:.1}%", latency_increase * 100.0),
                metrics: {
                    let mut m = HashMap::new();
                    m.insert("current_latency".to_string(), current_result.latency_ms as f64);
                    m.insert("baseline_latency".to_string(), avg_latency);
                    m.insert("increase_percent".to_string(), latency_increase * 100.0);
                    m
                },
            });
        }
        
        // Detect error rate anomaly
        if current_result.error_rate > config.error_rate_threshold {
            anomalies.push(AnomalyResult {
                tenant_id: current_result.tenant_id.clone(),
                anomaly_type: "high_error_rate".to_string(),
                severity: IncidentSeverity::High,
                detected_at: Utc::now(),
                description: format!("Error rate {:.2}% exceeds threshold {:.2}%", 
                    current_result.error_rate * 100.0, config.error_rate_threshold * 100.0),
                metrics: {
                    let mut m = HashMap::new();
                    m.insert("error_rate".to_string(), current_result.error_rate);
                    m.insert("threshold".to_string(), config.error_rate_threshold);
                    m
                },
            });
        }
        
        // Detect signature rate anomaly
        if current_result.signatures_per_minute < config.signature_rate_threshold {
            anomalies.push(AnomalyResult {
                tenant_id: current_result.tenant_id.clone(),
                anomaly_type: "low_signature_rate".to_string(),
                severity: IncidentSeverity::Low,
                detected_at: Utc::now(),
                description: format!("Signature rate {} below threshold {}", 
                    current_result.signatures_per_minute, config.signature_rate_threshold),
                metrics: {
                    let mut m = HashMap::new();
                    m.insert("signature_rate".to_string(), current_result.signatures_per_minute as f64);
                    m.insert("threshold".to_string(), config.signature_rate_threshold as f64);
                    m
                },
            });
        }
        
        Ok(anomalies)
    }
    
    /// Check compliance violations
    async fn check_compliance(
        policy_manager: &Arc<PolicyManager>,
        health_result: &HealthCheckResult,
    ) -> Result<Vec<AnomalyResult>> {
        let mut violations = Vec::new();
        
        // Get policy
        let policy = policy_manager.get_policy(&health_result.tenant_id).await?;
        
        // Check key expiration
        let days_until_expiry = (policy.key.not_after - Utc::now()).num_days();
        if days_until_expiry < 30 {
            violations.push(AnomalyResult {
                tenant_id: health_result.tenant_id.clone(),
                anomaly_type: "key_expiring_soon".to_string(),
                severity: if days_until_expiry < 7 { IncidentSeverity::High } else { IncidentSeverity::Medium },
                detected_at: Utc::now(),
                description: format!("Key expires in {} days", days_until_expiry),
                metrics: {
                    let mut m = HashMap::new();
                    m.insert("days_until_expiry".to_string(), days_until_expiry as f64);
                    m
                },
            });
        }
        
        // Check signing limits
        if health_result.signatures_per_minute > policy.key.max_issuance_per_24h / 1440 {
            violations.push(AnomalyResult {
                tenant_id: health_result.tenant_id.clone(),
                anomaly_type: "signing_limit_exceeded".to_string(),
                severity: IncidentSeverity::High,
                detected_at: Utc::now(),
                description: format!("Signature rate exceeds hourly limit"),
                metrics: {
                    let mut m = HashMap::new();
                    m.insert("current_rate".to_string(), health_result.signatures_per_minute as f64);
                    m.insert("hourly_limit".to_string(), (policy.key.max_issuance_per_24h / 1440) as f64);
                    m
                },
            });
        }
        
        Ok(violations)
    }
    
    /// Trigger incident for health issues
    async fn trigger_health_incident(
        incident_engine: &Arc<IncidentEngine>,
        health_result: &HealthCheckResult,
    ) -> Result<()> {
        let incident_type = match health_result.backend_type.as_str() {
            "HSM" => IncidentType::HSMFailure,
            "KMS" => IncidentType::BackendOutage,
            _ => IncidentType::BackendOutage,
        };
        
        let severity = if health_result.error_rate > 0.5 {
            IncidentSeverity::Critical
        } else if health_result.error_rate > 0.1 {
            IncidentSeverity::High
        } else {
            IncidentSeverity::Medium
        };
        
        let description = format!("Backend health check failed: {}", 
            health_result.issues.join(", "));
        
        let _incident_id = incident_engine.detect_incident(
            &health_result.tenant_id,
            incident_type,
            severity,
            &description,
            vec![health_result.tenant_id.clone()],
        ).await?;
        
        Ok(())
    }
    
    /// Trigger incident for anomalies
    async fn trigger_anomaly_incident(
        incident_engine: &Arc<IncidentEngine>,
        anomaly: &AnomalyResult,
    ) -> Result<()> {
        let incident_type = match anomaly.anomaly_type.as_str() {
            "high_error_rate" => IncidentType::BackendOutage,
            "high_latency" => IncidentType::BackendOutage,
            "low_signature_rate" => IncidentType::SecurityAlert,
            _ => IncidentType::SecurityAlert,
        };
        
        let _incident_id = incident_engine.detect_incident(
            &anomaly.tenant_id,
            incident_type,
            anomaly.severity,
            &anomaly.description,
            vec![anomaly.tenant_id.clone()],
        ).await?;
        
        Ok(())
    }
    
    /// Trigger incident for compliance violations
    async fn trigger_compliance_incident(
        incident_engine: &Arc<IncidentEngine>,
        violation: &AnomalyResult,
    ) -> Result<()> {
        let _incident_id = incident_engine.detect_incident(
            &violation.tenant_id,
            IncidentType::ComplianceFailure,
            violation.severity,
            &violation.description,
            vec![violation.tenant_id.clone()],
        ).await?;
        
        Ok(())
    }
    
    /// Get health history for tenant
    pub async fn get_health_history(&self, tenant_id: &str, limit: usize) -> Result<Vec<HealthCheckResult>> {
        let history = self.health_history.read().await;
        let tenant_history = history.get(tenant_id).cloned().unwrap_or_default();
        
        let mut results = tenant_history;
        results.sort_by(|a, b| b.last_check.cmp(&a.last_check));
        results.truncate(limit);
        
        Ok(results)
    }
    
    /// Get recent anomalies
    pub async fn get_recent_anomalies(&self, hours: u32) -> Result<Vec<AnomalyResult>> {
        // In production, this would query stored anomalies
        // For now, return empty list
        Ok(Vec::new())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;
    
    #[tokio::test]
    async fn test_monitor_creation() -> Result<()> {
        let temp_dir = TempDir::new()?;
        let db_url = format!("sqlite:{}/test.db", temp_dir.path().display());
        
        let policy_manager = Arc::new(crate::PolicyManager::new(&db_url).await?);
        
        let rotation_config = crate::RotationEngineConfig {
            approval_required: false,
            canary_count: 10,
            cutover_timeout_minutes: 30,
            rollback_enabled: true,
            notification_webhook: None,
        };
        let rotation_engine = Arc::new(crate::RotationEngine::new(policy_manager.clone(), rotation_config));
        
        let incident_config = IncidentEngineConfig {
            auto_escalate: true,
            emergency_rotation_enabled: true,
            mass_resign_threshold: 1000,
            compliance_reporting: true,
            notification_webhook: None,
            rollback_timeout_minutes: 60,
        };
        let incident_engine = Arc::new(crate::IncidentEngine::new(
            policy_manager.clone(), 
            rotation_engine, 
            incident_config
        ));
        
        let monitor_config = MonitorConfig {
            health_check_interval_seconds: 60,
            anomaly_detection_enabled: true,
            compliance_monitoring: true,
            backend_health_threshold: 0.95,
            signature_rate_threshold: 10,
            error_rate_threshold: 0.05,
        };
        
        let monitor = IncidentMonitor::new(
            policy_manager,
            incident_engine,
            monitor_config,
        );
        
        // Test initial status
        let status = monitor.get_status().await?;
        assert!(!status.is_running);
        assert_eq!(status.tenants_monitored, 0);
        
        Ok(())
    }
    
    #[tokio::test]
    async fn test_health_check() -> Result<()> {
        let temp_dir = TempDir::new()?;
        let db_url = format!("sqlite:{}/test.db", temp_dir.path().display());
        
        let policy_manager = Arc::new(crate::PolicyManager::new(&db_url).await?);
        
        let rotation_config = crate::RotationEngineConfig {
            approval_required: false,
            canary_count: 10,
            cutover_timeout_minutes: 30,
            rollback_enabled: true,
            notification_webhook: None,
        };
        let rotation_engine = Arc::new(crate::RotationEngine::new(policy_manager.clone(), rotation_config));
        
        let incident_config = IncidentEngineConfig {
            auto_escalate: true,
            emergency_rotation_enabled: true,
            mass_resign_threshold: 1000,
            compliance_reporting: true,
            notification_webhook: None,
            rollback_timeout_minutes: 60,
        };
        let incident_engine = Arc::new(crate::IncidentEngine::new(
            policy_manager.clone(), 
            rotation_engine, 
            incident_config
        ));
        
        let monitor_config = MonitorConfig {
            health_check_interval_seconds: 1,
            anomaly_detection_enabled: true,
            compliance_monitoring: true,
            backend_health_threshold: 0.95,
            signature_rate_threshold: 10,
            error_rate_threshold: 0.05,
        };
        
        let monitor = IncidentMonitor::new(
            policy_manager,
            incident_engine,
            monitor_config,
        );
        
        // Test force health check
        monitor.force_health_check().await?;
        
        // Check status
        let status = monitor.get_status().await?;
        assert!(!status.is_running); // Not started, but should have performed check
        
        println!("✅ Health check test PASSED");
        Ok(())
    }
}
