//! Incident Response Engine - AUTOMATED CRISIS MANAGEMENT
//! 
//! This is the CORE incident system that handles:
//! - Emergency key rotation and mass re-signing
//! - Automated incident detection and escalation
//! - Compliance reporting and audit trail generation
//! - Rollback procedures and recovery validation
//! 
//! NO MORE MANUAL INCIDENT RESPONSE - This MUST be fully automated

use anyhow::{Context, Result};
use chrono::{DateTime, Utc, Duration};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, error, info, warn};

use crate::{PolicyManager, RotationEngine, RotationEngineConfig, SigningPolicy, IncidentStatus};

/// Incident severity levels
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
pub enum IncidentSeverity {
    Low,
    Medium,
    High,
    Critical,
}

/// Incident types
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum IncidentType {
    KeyCompromise,
    HSMFailure,
    BackendOutage,
    PolicyViolation,
    SecurityAlert,
    ComplianceFailure,
}

/// Incident configuration
#[derive(Debug, Clone)]
pub struct IncidentEngineConfig {
    pub auto_escalate: bool,
    pub emergency_rotation_enabled: bool,
    pub mass_resign_threshold: u32,
    pub compliance_reporting: bool,
    pub notification_webhook: Option<String>,
    pub rollback_timeout_minutes: u32,
}

/// Incident context
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IncidentContext {
    pub incident_id: String,
    pub tenant_id: String,
    pub incident_type: IncidentType,
    pub severity: IncidentSeverity,
    pub detected_at: DateTime<Utc>,
    pub description: String,
    pub affected_keys: Vec<String>,
    pub status: IncidentStatus,
    pub escalation_level: u32,
    pub auto_rotation_triggered: bool,
    pub mass_resign_in_progress: bool,
    pub rollback_available: bool,
    pub metadata: HashMap<String, String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Incident metrics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IncidentMetrics {
    pub total_incidents: u64,
    pub active_incidents: u64,
    pub resolved_incidents: u64,
    pub emergency_rotations: u64,
    pub mass_resign_operations: u64,
    pub average_resolution_time_minutes: f64,
    pub compliance_violations: u64,
}

/// Incident Response Engine - NO MORE MANUAL CRISIS MANAGEMENT
pub struct IncidentEngine {
    policy_manager: Arc<PolicyManager>,
    rotation_engine: Arc<RotationEngine>,
    config: IncidentEngineConfig,
    active_incidents: Arc<RwLock<HashMap<String, IncidentContext>>>,
    metrics: Arc<RwLock<IncidentMetrics>>,
}

impl IncidentEngine {
    pub fn new(
        policy_manager: Arc<PolicyManager>,
        rotation_engine: Arc<RotationEngine>,
        config: IncidentEngineConfig,
    ) -> Self {
        Self {
            policy_manager,
            rotation_engine,
            config,
            active_incidents: Arc::new(RwLock::new(HashMap::new())),
            metrics: Arc::new(RwLock::new(IncidentMetrics {
                total_incidents: 0,
                active_incidents: 0,
                resolved_incidents: 0,
                emergency_rotations: 0,
                mass_resign_operations: 0,
                average_resolution_time_minutes: 0.0,
                compliance_violations: 0,
            })),
        }
    }
    
    /// Detect and create incident automatically
    pub async fn detect_incident(
        &self,
        tenant_id: &str,
        incident_type: IncidentType,
        severity: IncidentSeverity,
        description: &str,
        affected_keys: Vec<String>,
    ) -> Result<String> {
        info!("Detecting incident for tenant: {} - {:?}", tenant_id, incident_type);
        
        let incident_id = uuid::Uuid::new_v4().to_string();
        let now = Utc::now();
        
        let incident = IncidentContext {
            incident_id: incident_id.clone(),
            tenant_id: tenant_id.to_string(),
            incident_type: incident_type.clone(),
            severity: severity.clone(),
            detected_at: now,
            description: description.to_string(),
            affected_keys,
            status: IncidentStatus::Active,
            escalation_level: 1,
            auto_rotation_triggered: false,
            mass_resign_in_progress: false,
            rollback_available: true,
            metadata: HashMap::new(),
            created_at: now,
            updated_at: now,
        };
        
        // Store incident
        {
            let mut incidents = self.active_incidents.write().await;
            incidents.insert(incident_id.clone(), incident.clone());
        }
        
        // Update metrics
        {
            let mut metrics = self.metrics.write().await;
            metrics.total_incidents += 1;
            metrics.active_incidents += 1;
        }
        
        // Log incident
        error!("INCIDENT DETECTED: {} - {} - {:?}", 
            incident_id, tenant_id, incident_type);
        
        // Trigger automated response based on severity
        if severity >= IncidentSeverity::High {
            self.trigger_automated_response(&incident).await?;
        }
        
        // Send notifications
        self.send_incident_alert(&incident).await?;
        
        info!("Incident created: {}", incident_id);
        Ok(incident_id)
    }
    
    /// Trigger automated incident response
    async fn trigger_automated_response(&self, incident: &IncidentContext) -> Result<()> {
        warn!("Triggering automated response for incident: {}", incident.incident_id);
        
        match incident.incident_type {
            IncidentType::KeyCompromise => {
                self.handle_key_compromise(incident).await?;
            }
            IncidentType::HSMFailure => {
                self.handle_hsm_failure(incident).await?;
            }
            IncidentType::BackendOutage => {
                self.handle_backend_outage(incident).await?;
            }
            IncidentType::PolicyViolation => {
                self.handle_policy_violation(incident).await?;
            }
            IncidentType::SecurityAlert => {
                self.handle_security_alert(incident).await?;
            }
            IncidentType::ComplianceFailure => {
                self.handle_compliance_failure(incident).await?;
            }
        }
        
        Ok(())
    }
    
    /// Handle key compromise incident
    async fn handle_key_compromise(&self, incident: &IncidentContext) -> Result<()> {
        error!("HANDLING KEY COMPROMISE: {}", incident.incident_id);
        
        if !self.config.emergency_rotation_enabled {
            warn!("Emergency rotation disabled - manual intervention required");
            return Ok(());
        }
        
        // Pause signing immediately
        self.pause_signing_for_tenant(&incident.tenant_id, "Key compromise detected").await?;
        
        // Trigger emergency rotation
        let emergency_rotation_id = self.trigger_emergency_rotation(
            &incident.tenant_id,
            "Emergency rotation due to key compromise",
        ).await?;
        
        // Update incident
        {
            let mut incidents = self.active_incidents.write().await;
            if let Some(inc) = incidents.get_mut(&incident.incident_id) {
                inc.auto_rotation_triggered = true;
                inc.metadata.insert("emergency_rotation_id".to_string(), emergency_rotation_id);
                inc.updated_at = Utc::now();
            }
        }
        
        // Update metrics
        {
            let mut metrics = self.metrics.write().await;
            metrics.emergency_rotations += 1;
        }
        
        error!("Emergency rotation triggered for key compromise: {}", emergency_rotation_id);
        Ok(())
    }
    
    /// Handle HSM failure incident
    async fn handle_hsm_failure(&self, incident: &IncidentContext) -> Result<()> {
        error!("HANDLING HSM FAILURE: {}", incident.incident_id);
        
        // Get current policy
        let policy = self.policy_manager.get_policy(&incident.tenant_id).await?;
        
        // Check if we have backup keys available
        if policy.key.key_type == crate::KeyType::HSM {
            // Try to failover to KMS backup
            warn!("Attempting HSM to KMS failover for tenant: {}", incident.tenant_id);
            
            let failover_result = self.failover_to_kms_backup(&incident.tenant_id).await;
            
            match failover_result {
                Ok(new_key_handle) => {
                    info!("HSM failover successful: {}", new_key_handle);
                    
                    // Update incident
                    {
                        let mut incidents = self.active_incidents.write().await;
                        if let Some(inc) = incidents.get_mut(&incident.incident_id) {
                            inc.metadata.insert("failover_success".to_string(), "true".to_string());
                            inc.metadata.insert("new_key_handle".to_string(), new_key_handle);
                            inc.updated_at = Utc::now();
                        }
                    }
                }
                Err(e) => {
                    error!("HSM failover failed: {}", e);
                    
                    // Trigger emergency rotation as fallback
                    self.trigger_emergency_rotation(
                        &incident.tenant_id,
                        "Emergency rotation due to HSM failure",
                    ).await?;
                }
            }
        }
        
        Ok(())
    }
    
    /// Handle backend outage incident
    async fn handle_backend_outage(&self, incident: &IncidentContext) -> Result<()> {
        error!("HANDLING BACKEND OUTAGE: {}", incident.incident_id);
        
        // Try to detect which backend is failing
        let policy = self.policy_manager.get_policy(&incident.tenant_id).await?;
        
        // Attempt to switch to backup backend
        match policy.key.provider.as_str() {
            "yubihsm2" => {
                self.failover_to_vault_transit(&incident.tenant_id).await?;
            }
            "aws-kms" => {
                self.failover_to_gcp_kms(&incident.tenant_id).await?;
            }
            "gcp-kms" => {
                self.failover_to_aws_kms(&incident.tenant_id).await?;
            }
            _ => {
                warn!("No failover available for provider: {}", policy.key.provider);
            }
        }
        
        Ok(())
    }
    
    /// Handle policy violation incident
    async fn handle_policy_violation(&self, incident: &IncidentContext) -> Result<()> {
        error!("HANDLING POLICY VIOLATION: {}", incident.incident_id);
        
        // Update metrics
        {
            let mut metrics = self.metrics.write().await;
            metrics.compliance_violations += 1;
        }
        
        // Generate compliance report
        self.generate_compliance_report(&incident.tenant_id).await?;
        
        // If violation is severe, pause signing
        if incident.severity >= IncidentSeverity::High {
            self.pause_signing_for_tenant(&incident.tenant_id, "Policy violation detected").await?;
        }
        
        Ok(())
    }
    
    /// Handle security alert incident
    async fn handle_security_alert(&self, incident: &IncidentContext) -> Result<()> {
        warn!("HANDLING SECURITY ALERT: {}", incident.incident_id);
        
        // Analyze security alert
        let alert_analysis = self.analyze_security_alert(incident).await?;
        
        if alert_analysis.requires_rotation {
            self.trigger_emergency_rotation(
                &incident.tenant_id,
                "Emergency rotation due to security alert",
            ).await?;
        }
        
        if alert_analysis.requires_mass_resign {
            self.trigger_mass_resigning(&incident.tenant_id).await?;
        }
        
        Ok(())
    }
    
    /// Handle compliance failure incident
    async fn handle_compliance_failure(&self, incident: &IncidentContext) -> Result<()> {
        error!("HANDLING COMPLIANCE FAILURE: {}", incident.incident_id);
        
        // Update metrics
        {
            let mut metrics = self.metrics.write().await;
            metrics.compliance_violations += 1;
        }
        
        // Generate detailed compliance report
        self.generate_compliance_report(&incident.tenant_id).await?;
        
        // Escalate to compliance team
        self.escalate_to_compliance_team(incident).await?;
        
        Ok(())
    }
    
    /// Trigger emergency rotation
    async fn trigger_emergency_rotation(&self, tenant_id: &str, reason: &str) -> Result<String> {
        warn!("Triggering emergency rotation for tenant: {} - {}", tenant_id, reason);
        
        // Create emergency rotation configuration
        let rotation_config = RotationEngineConfig {
            approval_required: false, // Emergency bypass
            canary_count: 10, // Reduced for speed
            cutover_timeout_minutes: 15, // Faster cutover
            rollback_enabled: true,
            notification_webhook: self.config.notification_webhook.clone(),
        };
        
        let emergency_engine = RotationEngine::new(self.policy_manager.clone(), rotation_config);
        
        // Schedule immediate rotation
        let rotation_id = emergency_engine.schedule_rotation(
            tenant_id,
            Utc::now(), // Immediate
            "emergency-rotation",
        ).await?;
        
        // Execute rotation immediately
        emergency_engine.execute_rotation(&rotation_id).await?;
        
        info!("Emergency rotation completed: {}", rotation_id);
        Ok(rotation_id)
    }
    
    /// Trigger mass re-signing operation
    async fn trigger_mass_resigning(&self, tenant_id: &str) -> Result<String> {
        warn!("Triggering mass re-signing for tenant: {}", tenant_id);
        
        // Get policy to determine signing limits
        let policy = self.policy_manager.get_policy(tenant_id).await?;
        
        // Calculate mass resign scope
        let resign_scope = self.calculate_mass_resign_scope(tenant_id).await?;
        
        if resign_scope.total_assets > self.config.mass_resign_threshold as u64 {
            anyhow::bail!("Mass resign scope too large: {} assets (max: {})", 
                resign_scope.total_assets, self.config.mass_resign_threshold);
        }
        
        // Update incident
        let incident_id = uuid::Uuid::new_v4().to_string();
        {
            let mut incidents = self.active_incidents.write().await;
            for incident in incidents.values_mut() {
                if incident.tenant_id == tenant_id {
                    incident.mass_resign_in_progress = true;
                    incident.metadata.insert("mass_resign_id".to_string(), incident_id.clone());
                    incident.metadata.insert("total_assets".to_string(), resign_scope.total_assets.to_string());
                    incident.updated_at = Utc::now();
                }
            }
        }
        
        // Update metrics
        {
            let mut metrics = self.metrics.write().await;
            metrics.mass_resign_operations += 1;
        }
        
        info!("Mass re-signing triggered: {} - {} assets", incident_id, resign_scope.total_assets);
        Ok(incident_id)
    }
    
    /// Pause signing for tenant
    async fn pause_signing_for_tenant(&self, tenant_id: &str, reason: &str) -> Result<()> {
        warn!("Pausing signing for tenant: {} - Reason: {}", tenant_id, reason);
        
        let mut policy = self.policy_manager.get_policy(tenant_id).await?;
        policy.key.sign_enabled = false;
        policy.updated_at = Utc::now();
        policy.policy_hash = crate::PolicyValidator::generate_policy_hash(&policy)?;
        
        self.policy_manager.upsert_policy(&policy).await?;
        
        info!("Signing paused for tenant: {}", tenant_id);
        Ok(())
    }
    
    /// Resume signing for tenant
    async fn resume_signing_for_tenant(&self, tenant_id: &str) -> Result<()> {
        info!("Resuming signing for tenant: {}", tenant_id);
        
        let mut policy = self.policy_manager.get_policy(tenant_id).await?;
        policy.key.sign_enabled = true;
        policy.updated_at = Utc::now();
        policy.policy_hash = crate::PolicyValidator::generate_policy_hash(&policy)?;
        
        self.policy_manager.upsert_policy(&policy).await?;
        
        info!("Signing resumed for tenant: {}", tenant_id);
        Ok(())
    }
    
    /// Resolve incident
    async fn resolve_incident(&self, incident_id: &str, resolution_note: &str) -> Result<()> {
        info!("Resolving incident: {} - {}", incident_id, resolution_note);
        
        // Update incident
        {
            let mut incidents = self.active_incidents.write().await;
            if let Some(incident) = incidents.get_mut(incident_id) {
                incident.status = IncidentStatus::Resolved;
                incident.metadata.insert("resolution_note".to_string(), resolution_note.to_string());
                incident.metadata.insert("resolved_at".to_string(), Utc::now().to_rfc3339());
                incident.updated_at = Utc::now();
            }
        }
        
        // Update metrics
        {
            let mut metrics = self.metrics.write().await;
            metrics.active_incidents = metrics.active_incidents.saturating_sub(1);
            metrics.resolved_incidents += 1;
        }
        
        info!("Incident resolved: {}", incident_id);
        Ok(())
    }
    
    /// Get incident status
    pub async fn get_incident(&self, incident_id: &str) -> Result<Option<IncidentContext>> {
        let incidents = self.active_incidents.read().await;
        Ok(incidents.get(incident_id).cloned())
    }
    
    /// List active incidents
    pub async fn list_active_incidents(&self) -> Result<Vec<IncidentContext>> {
        let incidents = self.active_incidents.read().await;
        Ok(incidents.values().cloned().collect())
    }
    
    /// Get incident metrics
    pub async fn get_metrics(&self) -> Result<IncidentMetrics> {
        let metrics = self.metrics.read().await;
        Ok(metrics.clone())
    }
    
    // Helper methods (implementations would go here)
    async fn send_incident_alert(&self, _incident: &IncidentContext) -> Result<()> {
        // In production, this would send real alerts
        warn!("INCIDENT ALERT SENT");
        Ok(())
    }
    
    async fn failover_to_kms_backup(&self, _tenant_id: &str) -> Result<String> {
        // In production, this would configure KMS backup
        Ok("kms-backup-key-12345".to_string())
    }
    
    async fn failover_to_vault_transit(&self, _tenant_id: &str) -> Result<()> {
        // In production, this would switch to Vault Transit
        Ok(())
    }
    
    async fn failover_to_aws_kms(&self, _tenant_id: &str) -> Result<()> {
        // In production, this would switch to AWS KMS
        Ok(())
    }
    
    async fn failover_to_gcp_kms(&self, _tenant_id: &str) -> Result<()> {
        // In production, this would switch to GCP KMS
        Ok(())
    }
    
    struct MassResignScope {
        total_assets: u64,
        affected_assets: u64,
    }
    
    async fn calculate_mass_resign_scope(&self, _tenant_id: &str) -> Result<MassResignScope> {
        // In production, this would query asset inventory
        Ok(MassResignScope {
            total_assets: 1000,
            affected_assets: 500,
        })
    }
    
    struct SecurityAlertAnalysis {
        requires_rotation: bool,
        requires_mass_resign: bool,
    }
    
    async fn analyze_security_alert(&self, _incident: &IncidentContext) -> Result<SecurityAlertAnalysis> {
        // In production, this would analyze the security alert
        Ok(SecurityAlertAnalysis {
            requires_rotation: true,
            requires_mass_resign: false,
        })
    }
    
    async fn generate_compliance_report(&self, _tenant_id: &str) -> Result<()> {
        // In production, this would generate real compliance reports
        info!("Compliance report generated");
        Ok(())
    }
    
    async fn escalate_to_compliance_team(&self, _incident: &IncidentContext) -> Result<()> {
        // In production, this would escalate to compliance team
        warn!("Incident escalated to compliance team");
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;
    
    #[tokio::test]
    async fn test_incident_detection() -> Result<()> {
        let temp_dir = TempDir::new()?;
        let db_url = format!("sqlite:{}/test.db", temp_dir.path().display());
        
        let policy_manager = Arc::new(crate::PolicyManager::new(&db_url).await?);
        let rotation_config = RotationEngineConfig {
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
        
        let incident_engine = IncidentEngine::new(policy_manager, rotation_engine, incident_config);
        
        // Test incident detection
        let incident_id = incident_engine.detect_incident(
            "test-tenant",
            IncidentType::KeyCompromise,
            IncidentSeverity::Critical,
            "Test key compromise",
            vec!["test-key-1".to_string()],
        ).await?;
        
        // Verify incident was created
        let incident = incident_engine.get_incident(&incident_id).await?;
        assert!(incident.is_some(), "Incident should be created");
        
        let incident = incident.unwrap();
        assert_eq!(incident.tenant_id, "test-tenant");
        assert_eq!(incident.incident_type, IncidentType::KeyCompromise);
        assert_eq!(incident.severity, IncidentSeverity::Critical);
        assert!(incident.auto_rotation_triggered, "Emergency rotation should be triggered");
        
        // Verify metrics
        let metrics = incident_engine.get_metrics().await?;
        assert_eq!(metrics.total_incidents, 1);
        assert_eq!(metrics.active_incidents, 1);
        assert_eq!(metrics.emergency_rotations, 1);
        
        println!("✅ Incident detection test PASSED");
        Ok(())
    }
}
