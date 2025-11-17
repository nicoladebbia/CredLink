//! Integration Tests - COMPREHENSIVE SYSTEM VALIDATION
//! 
//! These tests verify the complete C2-Concierge system integration
//! NO MOCKS ALLOWED - Real backend integration and end-to-end testing
//! 
//!

pub mod key_lifecycle;
pub mod rotation_workflows;
pub mod incident_response;
pub mod backend_integration;
pub mod performance_tests;
pub mod security_tests;
pub mod compliance_tests;

use anyhow::Result;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tempfile::TempDir;
use tokio::time::sleep;

use keyctl::{
    PolicyManager, RotationEngine, RotationEngineConfig, 
    IncidentEngine, IncidentEngineConfig, IncidentType, IncidentSeverity,
    SigningPolicy, KeyConfig, KeyType, RotationCalendar, RotationStatus
};

/// Test environment setup with real backends
pub struct TestEnvironment {
    pub temp_dir: TempDir,
    pub db_url: String,
    pub policy_manager: Arc<PolicyManager>,
    pub rotation_engine: Arc<RotationEngine>,
    pub incident_engine: Arc<IncidentEngine>,
    pub test_tenants: Vec<String>,
}

impl TestEnvironment {
    pub async fn new() -> Result<Self> {
        let temp_dir = TempDir::new()?;
        let db_url = format!("sqlite:{}/test.db", temp_dir.path().display());
        
        // Initialize policy manager
        let policy_manager = Arc::new(PolicyManager::new(&db_url).await?);
        
        // Initialize rotation engine
        let rotation_config = RotationEngineConfig {
            approval_required: false,
            canary_count: 10,
            cutover_timeout_minutes: 30,
            rollback_enabled: true,
            notification_webhook: None,
        };
        let rotation_engine = Arc::new(RotationEngine::new(
            policy_manager.clone(),
            rotation_config,
        ));
        
        // Initialize incident engine
        let incident_config = IncidentEngineConfig {
            auto_escalate: true,
            emergency_rotation_enabled: true,
            mass_resign_threshold: 1000,
            compliance_reporting: true,
            notification_webhook: None,
            rollback_timeout_minutes: 60,
        };
        let incident_engine = Arc::new(IncidentEngine::new(
            policy_manager.clone(),
            rotation_engine,
            incident_config,
        ));
        
        // Create test tenants
        let test_tenants = vec![
            "integration-tenant-1".to_string(),
            "integration-tenant-2".to_string(),
            "integration-tenant-3".to_string(),
        ];
        
        let env = Self {
            temp_dir,
            db_url,
            policy_manager,
            rotation_engine,
            incident_engine,
            test_tenants,
        };
        
        // Setup test policies
        env.setup_test_policies().await?;
        
        Ok(env)
    }
    
    /// Setup test policies for all tenants
    async fn setup_test_policies(&self) -> Result<()> {
        for (i, tenant_id) in self.test_tenants.iter().enumerate() {
            let key_type = match i % 3 {
                0 => KeyType::HSM,
                1 => KeyType::KMS,
                _ => KeyType::Software,
            };
            
            let provider = match key_type {
                KeyType::HSM => "yubihsm2",
                KeyType::KMS => "aws-kms",
                KeyType::Software => "software",
            };
            
            let policy = SigningPolicy {
                tenant_id: tenant_id.clone(),
                algorithm: "ES256".to_string(),
                tsa_profile: "std".to_string(),
                assertions_allow: vec!["c2pa.actions".to_string()],
                assertions_deny: vec![],
                embed_allowed_origins: vec![],
                key: KeyConfig {
                    key_type,
                    provider: provider.to_string(),
                    handle: format!("test-key-{}", i),
                    cert_chain: vec![],
                    not_before: chrono::Utc::now(),
                    not_after: chrono::Utc::now() + chrono::Duration::days(90),
                    rotate_every_days: 30,
                    max_issuance_per_24h: 1000,
                    sign_enabled: true,
                },
                created_at: chrono::Utc::now(),
                updated_at: chrono::Utc::now(),
                policy_hash: format!("test-hash-{}", i),
            };
            
            self.policy_manager.upsert_policy(&policy).await?;
            
            // Schedule rotation for each tenant
            let rotation = RotationCalendar {
                tenant_id: tenant_id.clone(),
                scheduled_rotation: chrono::Utc::now() + chrono::Duration::days(30),
                rotation_window_start: chrono::Utc::now() + chrono::Duration::days(23),
                rotation_window_end: chrono::Utc::now() + chrono::Duration::days(30),
                owner: "integration-test".to_string(),
                approval_required: false,
                status: RotationStatus::Scheduled,
                created_at: chrono::Utc::now(),
            };
            
            self.policy_manager.schedule_rotation(&rotation).await?;
        }
        
        Ok(())
    }
    
    /// Wait for async operations to complete
    pub async fn wait_for_operations(&self, duration: Duration) {
        sleep(duration).await;
    }
    
    /// Get tenant policy
    pub async fn get_tenant_policy(&self, tenant_id: &str) -> Result<SigningPolicy> {
        self.policy_manager.get_policy(tenant_id).await
    }
    
    /// Update tenant policy
    pub async fn update_tenant_policy(&self, policy: &SigningPolicy) -> Result<()> {
        self.policy_manager.upsert_policy(policy).await
    }
    
    /// Create incident
    pub async fn create_incident(
        &self,
        tenant_id: &str,
        incident_type: IncidentType,
        severity: IncidentSeverity,
        description: &str,
    ) -> Result<String> {
        self.incident_engine.detect_incident(
            tenant_id,
            incident_type,
            severity,
            description,
            vec![format!("{}-key", tenant_id)],
        ).await
    }
    
    /// Get active incidents
    pub async fn get_active_incidents(&self) -> Result<Vec<keyctl::incident_engine::IncidentContext>> {
        self.incident_engine.list_active_incidents().await
    }
    
    /// Resolve incident
    pub async fn resolve_incident(&self, incident_id: &str, resolution_note: &str) -> Result<()> {
        self.incident_engine.resolve_incident(incident_id, resolution_note).await
    }
    
    /// Schedule rotation
    pub async fn schedule_rotation(
        &self,
        tenant_id: &str,
        scheduled_time: chrono::DateTime<chrono::Utc>,
        owner: &str,
    ) -> Result<String> {
        self.rotation_engine.schedule_rotation(tenant_id, scheduled_time, owner).await
    }
    
    /// Execute rotation
    pub async fn execute_rotation(&self, rotation_id: &str) -> Result<()> {
        self.rotation_engine.execute_rotation(rotation_id).await
    }
    
    /// Get rotation status
    pub async fn get_rotation_status(
        &self,
        rotation_id: &str,
    ) -> Result<Option<keyctl::rotation_engine::RotationContext>> {
        self.rotation_engine.get_rotation_status(rotation_id).await
    }
    
    /// List active rotations
    pub async fn list_active_rotations(&self) -> Result<Vec<keyctl::rotation_engine::RotationContext>> {
        self.rotation_engine.list_active_rotations().await
    }
    
    /// Get upcoming rotations
    pub async fn get_upcoming_rotations(&self, days: u32) -> Result<Vec<RotationCalendar>> {
        self.policy_manager.get_upcoming_rotations(days).await
    }
    
    /// Pause signing for tenant
    pub async fn pause_signing(&self, tenant_id: &str, reason: &str) -> Result<()> {
        let mut policy = self.get_tenant_policy(tenant_id).await?;
        policy.key.sign_enabled = false;
        policy.updated_at = chrono::Utc::now();
        policy.policy_hash = keyctl::PolicyValidator::generate_policy_hash(&policy)?;
        self.update_tenant_policy(&policy).await
    }
    
    /// Resume signing for tenant
    pub async fn resume_signing(&self, tenant_id: &str) -> Result<()> {
        let mut policy = self.get_tenant_policy(tenant_id).await?;
        policy.key.sign_enabled = true;
        policy.updated_at = chrono::Utc::now();
        policy.policy_hash = keyctl::PolicyValidator::generate_policy_hash(&policy)?;
        self.update_tenant_policy(&policy).await
    }
    
    /// Validate system health
    pub async fn validate_system_health(&self) -> Result<HashMap<String, bool>> {
        let mut health_status = HashMap::new();
        
        // Check policy manager
        let tenants = self.policy_manager.list_tenants().await?;
        health_status.insert("policy_manager".to_string(), !tenants.is_empty());
        
        // Check rotation engine
        let active_rotations = self.list_active_rotations().await?;
        health_status.insert("rotation_engine".to_string(), true); // Engine is healthy if it responds
        
        // Check incident engine
        let incidents = self.get_active_incidents().await?;
        health_status.insert("incident_engine".to_string(), true); // Engine is healthy if it responds
        
        // Check each tenant
        for tenant_id in &self.test_tenants {
            let policy = self.get_tenant_policy(tenant_id).await?;
            health_status.insert(format!("tenant_{}", tenant_id), policy.key.sign_enabled);
        }
        
        Ok(health_status)
    }
    
    /// Generate test report
    pub fn generate_test_report(&self, test_results: &HashMap<String, bool>) -> String {
        let mut report = String::new();
        report.push_str("# C2-Concierge Integration Test Report\n\n");
        report.push_str(&format!("Generated: {}\n\n", chrono::Utc::now().format("%Y-%m-%d %H:%M:%S UTC")));
        
        report.push_str("## Test Results\n\n");
        for (test_name, passed) in test_results {
            let status = if *passed { "✅ PASS" } else { "❌ FAIL" };
            report.push_str(&format!("{}: {}\n", test_name, status));
        }
        
        let passed_count = test_results.values().filter(|&&v| v).count();
        let total_count = test_results.len();
        
        report.push_str(&format!("\n## Summary\n\n"));
        report.push_str(&format!("Total Tests: {}\n", total_count));
        report.push_str(&format!("Passed: {}\n", passed_count));
        report.push_str(&format!("Failed: {}\n", total_count - passed_count));
        report.push_str(&format!("Success Rate: {:.1}%\n", (passed_count as f64 / total_count as f64) * 100.0));
        
        report
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[tokio::test]
    async fn test_environment_setup() -> Result<()> {
        let env = TestEnvironment::new().await?;
        
        // Verify all tenants were created
        assert_eq!(env.test_tenants.len(), 3);
        
        // Verify policies exist
        for tenant_id in &env.test_tenants {
            let policy = env.get_tenant_policy(tenant_id).await?;
            assert_eq!(policy.tenant_id, *tenant_id);
            assert!(policy.key.sign_enabled);
        }
        
        // Verify rotations were scheduled
        let upcoming = env.get_upcoming_rotations(60).await?;
        assert_eq!(upcoming.len(), 3);
        
        println!("✅ Test environment setup PASSED");
        Ok(())
    }
    
    #[tokio::test]
    async fn test_system_health_validation() -> Result<()> {
        let env = TestEnvironment::new().await?;
        
        let health_status = env.validate_system_health().await?;
        
        // All components should be healthy
        for (component, healthy) in &health_status {
            assert!(healthy, "Component {} should be healthy", component);
        }
        
        println!("✅ System health validation PASSED");
        Ok(())
    }
}
