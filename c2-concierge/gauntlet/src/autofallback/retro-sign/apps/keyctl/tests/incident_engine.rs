//! Incident Engine Tests - BRUTAL VALIDATION
//! 
//! These tests verify the complete incident response system
//! NO MOCKS ALLOWED - Real incident detection and response

use anyhow::Result;
use chrono::Utc;
use keyctl::{PolicyManager, RotationEngine, RotationEngineConfig, IncidentEngine, IncidentEngineConfig, IncidentType, IncidentSeverity};

/// Test incident detection and creation
#[tokio::test]
async fn test_incident_detection() -> Result<()> {
    let temp_dir = tempfile::TempDir::new()?;
    let db_url = format!("sqlite:{}/test.db", temp_dir.path().display());
    
    let policy_manager = std::sync::Arc::new(PolicyManager::new(&db_url).await?);
    
    let rotation_config = RotationEngineConfig {
        approval_required: false,
        canary_count: 10,
        cutover_timeout_minutes: 30,
        rollback_enabled: true,
        notification_webhook: None,
    };
    let rotation_engine = std::sync::Arc::new(RotationEngine::new(policy_manager.clone(), rotation_config));
    
    let incident_config = IncidentEngineConfig {
        auto_escalate: true,
        emergency_rotation_enabled: true,
        mass_resign_threshold: 1000,
        compliance_reporting: true,
        notification_webhook: None,
        rollback_timeout_minutes: 60,
    };
    
    let incident_engine = IncidentEngine::new(policy_manager.clone(), rotation_engine, incident_config);
    
    // Test key compromise incident
    let incident_id = incident_engine.detect_incident(
        "test-tenant",
        IncidentType::KeyCompromise,
        IncidentSeverity::Critical,
        "Test key compromise detected",
        vec!["compromised-key-1".to_string()],
    ).await?;
    
    // Verify incident was created
    let incident = incident_engine.get_incident(&incident_id).await?;
    assert!(incident.is_some(), "Incident should be created");
    
    let incident = incident.unwrap();
    assert_eq!(incident.tenant_id, "test-tenant");
    assert_eq!(incident.incident_type, IncidentType::KeyCompromise);
    assert_eq!(incident.severity, IncidentSeverity::Critical);
    assert_eq!(incident.status, keyctl::IncidentStatus::Active);
    assert!(incident.auto_rotation_triggered, "Emergency rotation should be triggered for critical incidents");
    
    // Verify metrics
    let metrics = incident_engine.get_metrics().await?;
    assert_eq!(metrics.total_incidents, 1);
    assert_eq!(metrics.active_incidents, 1);
    assert_eq!(metrics.emergency_rotations, 1);
    
    println!("✅ Incident detection test PASSED");
    Ok(())
}

/// Test incident resolution
#[tokio::test]
async fn test_incident_resolution() -> Result<()> {
    let temp_dir = tempfile::TempDir::new()?;
    let db_url = format!("sqlite:{}/test.db", temp_dir.path().display());
    
    let policy_manager = std::sync::Arc::new(PolicyManager::new(&db_url).await?);
    
    let rotation_config = RotationEngineConfig {
        approval_required: false,
        canary_count: 10,
        cutover_timeout_minutes: 30,
        rollback_enabled: true,
        notification_webhook: None,
    };
    let rotation_engine = std::sync::Arc::new(RotationEngine::new(policy_manager.clone(), rotation_config));
    
    let incident_config = IncidentEngineConfig {
        auto_escalate: true,
        emergency_rotation_enabled: true,
        mass_resign_threshold: 1000,
        compliance_reporting: true,
        notification_webhook: None,
        rollback_timeout_minutes: 60,
    };
    
    let incident_engine = IncidentEngine::new(policy_manager.clone(), rotation_engine, incident_config);
    
    // Create incident
    let incident_id = incident_engine.detect_incident(
        "resolution-test-tenant",
        IncidentType::HSMFailure,
        IncidentSeverity::High,
        "Test HSM failure",
        vec!["hsm-key-1".to_string()],
    ).await?;
    
    // Verify incident is active
    let incident = incident_engine.get_incident(&incident_id).await?;
    assert!(incident.unwrap().status == keyctl::IncidentStatus::Active);
    
    // Resolve incident
    incident_engine.resolve_incident(&incident_id, "HSM replaced and tested").await?;
    
    // Verify incident is resolved
    let incident = incident_engine.get_incident(&incident_id).await?;
    assert!(incident.unwrap().status == keyctl::IncidentStatus::Resolved);
    
    // Verify metrics
    let metrics = incident_engine.get_metrics().await?;
    assert_eq!(metrics.active_incidents, 0);
    assert_eq!(metrics.resolved_incidents, 1);
    
    println!("✅ Incident resolution test PASSED");
    Ok(())
}

/// Test emergency rotation trigger
#[tokio::test]
async fn test_emergency_rotation_trigger() -> Result<()> {
    let temp_dir = tempfile::TempDir::new()?;
    let db_url = format!("sqlite:{}/test.db", temp_dir.path().display());
    
    let policy_manager = std::sync::Arc::new(PolicyManager::new(&db_url).await?);
    
    let rotation_config = RotationEngineConfig {
        approval_required: false,
        canary_count: 10,
        cutover_timeout_minutes: 30,
        rollback_enabled: true,
        notification_webhook: None,
    };
    let rotation_engine = std::sync::Arc::new(RotationEngine::new(policy_manager.clone(), rotation_config));
    
    let incident_config = IncidentEngineConfig {
        auto_escalate: true,
        emergency_rotation_enabled: true,
        mass_resign_threshold: 1000,
        compliance_reporting: true,
        notification_webhook: None,
        rollback_timeout_minutes: 60,
    };
    
    let incident_engine = IncidentEngine::new(policy_manager.clone(), rotation_engine, incident_config);
    
    // Create critical incident that should trigger emergency rotation
    let incident_id = incident_engine.detect_incident(
        "emergency-test-tenant",
        IncidentType::KeyCompromise,
        IncidentSeverity::Critical,
        "Critical key compromise - immediate rotation required",
        vec!["critical-key-1".to_string()],
    ).await?;
    
    // Verify emergency rotation was triggered
    let incident = incident_engine.get_incident(&incident_id).await?;
    let incident = incident.unwrap();
    
    assert!(incident.auto_rotation_triggered, "Emergency rotation should be triggered");
    assert!(incident.metadata.contains_key("emergency_rotation_id"), "Emergency rotation ID should be recorded");
    
    // Verify metrics
    let metrics = incident_engine.get_metrics().await?;
    assert_eq!(metrics.emergency_rotations, 1);
    
    println!("✅ Emergency rotation trigger test PASSED");
    Ok(())
}

/// Test mass re-signing trigger
#[tokio::test]
async fn test_mass_resign_trigger() -> Result<()> {
    let temp_dir = tempfile::TempDir::new()?;
    let db_url = format!("sqlite:{}/test.db", temp_dir.path().display());
    
    let policy_manager = std::sync::Arc::new(PolicyManager::new(&db_url).await?);
    
    let rotation_config = RotationEngineConfig {
        approval_required: false,
        canary_count: 10,
        cutover_timeout_minutes: 30,
        rollback_enabled: true,
        notification_webhook: None,
    };
    let rotation_engine = std::sync::Arc::new(RotationEngine::new(policy_manager.clone(), rotation_config));
    
    let incident_config = IncidentEngineConfig {
        auto_escalate: true,
        emergency_rotation_enabled: true,
        mass_resign_threshold: 1000,
        compliance_reporting: true,
        notification_webhook: None,
        rollback_timeout_minutes: 60,
    };
    
    let incident_engine = IncidentEngine::new(policy_manager.clone(), rotation_engine, incident_config);
    
    // Create security alert incident that should trigger mass re-signing
    let incident_id = incident_engine.detect_incident(
        "mass-resign-test-tenant",
        IncidentType::SecurityAlert,
        IncidentSeverity::High,
        "Suspicious activity detected - mass re-signing required",
        vec!["affected-key-1".to_string()],
    ).await?;
    
    // Verify mass re-signing was triggered
    let incident = incident_engine.get_incident(&incident_id).await?;
    let incident = incident.unwrap();
    
    assert!(incident.mass_resign_in_progress, "Mass re-signing should be triggered");
    assert!(incident.metadata.contains_key("mass_resign_id"), "Mass re-signing ID should be recorded");
    
    // Verify metrics
    let metrics = incident_engine.get_metrics().await?;
    assert_eq!(metrics.mass_resign_operations, 1);
    
    println!("✅ Mass re-signing trigger test PASSED");
    Ok(())
}

/// Test concurrent incident handling
#[tokio::test]
async fn test_concurrent_incidents() -> Result<()> {
    let temp_dir = tempfile::TempDir::new()?;
    let db_url = format!("sqlite:{}/test.db", temp_dir.path().display());
    
    let policy_manager = std::sync::Arc::new(PolicyManager::new(&db_url).await?);
    
    let rotation_config = RotationEngineConfig {
        approval_required: false,
        canary_count: 10,
        cutover_timeout_minutes: 30,
        rollback_enabled: true,
        notification_webhook: None,
    };
    let rotation_engine = std::sync::Arc::new(RotationEngine::new(policy_manager.clone(), rotation_config));
    
    let incident_config = IncidentEngineConfig {
        auto_escalate: true,
        emergency_rotation_enabled: true,
        mass_resign_threshold: 1000,
        compliance_reporting: true,
        notification_webhook: None,
        rollback_timeout_minutes: 60,
    };
    
    let incident_engine = std::sync::Arc::new(IncidentEngine::new(policy_manager.clone(), rotation_engine, incident_config));
    
    // Create multiple incidents concurrently
    let mut incident_handles = Vec::new();
    
    for i in 0..5 {
        let engine_clone = incident_engine.clone();
        let tenant_id = format!("concurrent-tenant-{}", i);
        
        let handle = tokio::spawn(async move {
            engine_clone.detect_incident(
                &tenant_id,
                IncidentType::BackendOutage,
                IncidentSeverity::Medium,
                &format!("Concurrent incident {}", i),
                vec![format!("key-{}", i)],
            ).await
        });
        
        incident_handles.push(handle);
    }
    
    // Wait for all incidents to be created
    let mut incident_ids = Vec::new();
    for handle in incident_handles {
        let incident_id = handle.await??;
        incident_ids.push(incident_id);
    }
    
    // Verify all incidents were created
    let active_incidents = incident_engine.list_active_incidents().await?;
    assert_eq!(active_incidents.len(), 5, "All 5 incidents should be active");
    
    // Resolve incidents concurrently
    let mut resolve_handles = Vec::new();
    for incident_id in incident_ids {
        let engine_clone = incident_engine.clone();
        
        let handle = tokio::spawn(async move {
            engine_clone.resolve_incident(&incident_id, "Test resolution").await
        });
        
        resolve_handles.push(handle);
    }
    
    // Wait for all resolutions to complete
    let mut successful_resolutions = 0;
    for handle in resolve_handles {
        match handle.await {
            Ok(Ok(_)) => successful_resolutions += 1,
            Ok(Err(e)) => println!("  Resolution failed: {}", e),
            Err(e) => println!("  Task failed: {}", e),
        }
    }
    
    // Verify all incidents were resolved
    let active_incidents = incident_engine.list_active_incidents().await?;
    assert_eq!(active_incidents.len(), 0, "All incidents should be resolved");
    
    println!("✅ Concurrent incident handling test completed:");
    println!("   Successful resolutions: {}/5", successful_resolutions);
    
    assert_eq!(successful_resolutions, 5, "All resolutions should succeed");
    
    Ok(())
}

/// Test incident severity escalation
#[tokio::test]
async fn test_severity_escalation() -> Result<()> {
    let temp_dir = tempfile::TempDir::new()?;
    let db_url = format!("sqlite:{}/test.db", temp_dir.path().display());
    
    let policy_manager = std::sync::Arc::new(PolicyManager::new(&db_url).await?);
    
    let rotation_config = RotationEngineConfig {
        approval_required: false,
        canary_count: 10,
        cutover_timeout_minutes: 30,
        rollback_enabled: true,
        notification_webhook: None,
    };
    let rotation_engine = std::sync::Arc::new(RotationEngine::new(policy_manager.clone(), rotation_config));
    
    let incident_config = IncidentEngineConfig {
        auto_escalate: true,
        emergency_rotation_enabled: true,
        mass_resign_threshold: 1000,
        compliance_reporting: true,
        notification_webhook: None,
        rollback_timeout_minutes: 60,
    };
    
    let incident_engine = IncidentEngine::new(policy_manager.clone(), rotation_engine, incident_config);
    
    // Test low severity incident (should not trigger emergency rotation)
    let low_incident_id = incident_engine.detect_incident(
        "severity-test-tenant",
        IncidentType::PolicyViolation,
        IncidentSeverity::Low,
        "Minor policy violation",
        vec!["policy-key-1".to_string()],
    ).await?;
    
    let low_incident = incident_engine.get_incident(&low_incident_id).await?;
    assert!(!low_incident.unwrap().auto_rotation_triggered, "Low severity should not trigger emergency rotation");
    
    // Test high severity incident (should trigger emergency rotation)
    let high_incident_id = incident_engine.detect_incident(
        "severity-test-tenant",
        IncidentType::KeyCompromise,
        IncidentSeverity::High,
        "High severity key compromise",
        vec!["critical-key-1".to_string()],
    ).await?;
    
    let high_incident = incident_engine.get_incident(&high_incident_id).await?;
    assert!(high_incident.unwrap().auto_rotation_triggered, "High severity should trigger emergency rotation");
    
    println!("✅ Severity escalation test PASSED");
    Ok(())
}

/// Test incident metrics tracking
#[tokio::test]
async fn test_incident_metrics() -> Result<()> {
    let temp_dir = tempfile::TempDir::new()?;
    let db_url = format!("sqlite:{}/test.db", temp_dir.path().display());
    
    let policy_manager = std::sync::Arc::new(PolicyManager::new(&db_url).await?);
    
    let rotation_config = RotationEngineConfig {
        approval_required: false,
        canary_count: 10,
        cutover_timeout_minutes: 30,
        rollback_enabled: true,
        notification_webhook: None,
    };
    let rotation_engine = std::sync::Arc::new(RotationEngine::new(policy_manager.clone(), rotation_config));
    
    let incident_config = IncidentEngineConfig {
        auto_escalate: true,
        emergency_rotation_enabled: true,
        mass_resign_threshold: 1000,
        compliance_reporting: true,
        notification_webhook: None,
        rollback_timeout_minutes: 60,
    };
    
    let incident_engine = IncidentEngine::new(policy_manager.clone(), rotation_engine, incident_config);
    
    // Initial metrics should be zero
    let initial_metrics = incident_engine.get_metrics().await?;
    assert_eq!(initial_metrics.total_incidents, 0);
    assert_eq!(initial_metrics.active_incidents, 0);
    assert_eq!(initial_metrics.resolved_incidents, 0);
    
    // Create incidents
    let _incident1 = incident_engine.detect_incident(
        "metrics-test-tenant",
        IncidentType::KeyCompromise,
        IncidentSeverity::Critical,
        "Critical incident 1",
        vec!["key-1".to_string()],
    ).await?;
    
    let _incident2 = incident_engine.detect_incident(
        "metrics-test-tenant",
        IncidentType::HSMFailure,
        IncidentSeverity::High,
        "High severity incident 2",
        vec!["key-2".to_string()],
    ).await?;
    
    // Check metrics after creation
    let creation_metrics = incident_engine.get_metrics().await?;
    assert_eq!(creation_metrics.total_incidents, 2);
    assert_eq!(creation_metrics.active_incidents, 2);
    assert_eq!(creation_metrics.emergency_rotations, 2); // Both should trigger emergency rotation
    
    // Resolve one incident
    let active_incidents = incident_engine.list_active_incidents().await?;
    if let Some(incident) = active_incidents.first() {
        incident_engine.resolve_incident(&incident.incident_id, "Test resolution").await?;
    }
    
    // Check metrics after resolution
    let resolution_metrics = incident_engine.get_metrics().await?;
    assert_eq!(resolution_metrics.total_incidents, 2);
    assert_eq!(resolution_metrics.active_incidents, 1);
    assert_eq!(resolution_metrics.resolved_incidents, 1);
    
    println!("✅ Incident metrics tracking test PASSED");
    Ok(())
}
