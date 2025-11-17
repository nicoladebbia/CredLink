//! Integration tests for C2 Concierge Retro-Sign

use anyhow::Result;
use std::time::Duration;
use tokio::time::timeout;

#[tokio::test]
async fn test_full_system_integration() -> Result<()> {
    // Initialize all subsystems
    c2c::metrics::init()?;
    
    // Test performance system
    let perf_manager = c2c::performance::get_performance_manager()?;
    assert!(perf_manager.record_operation("test_op", Duration::from_millis(100)).await.is_ok());
    
    // Test security system
    let security_manager = c2c::security::get_security_manager();
    let auth_result = security_manager.authenticate("testuser", "testpass123", "default").await;
    assert!(auth_result.is_ok());
    
    // Test health system
    let health_status = c2c::health::check_application_health().await?;
    assert!(matches!(health_status.status, c2c::health::HealthStatus::Healthy));
    
    // Test rate limiting
    let rate_limiter = c2c::rate_limit::get_rate_limit_manager();
    let allowed = rate_limiter.check_rate_limit("test_key", 1).await?;
    assert!(allowed);
    
    // Test alerting
    c2c::alerting::fire_alert(|builder| {
        builder
            .title("Integration Test Alert")
            .severity(c2c::alerting::AlertSeverity::Info)
            .description("Test alert from integration tests")
    }).await?;
    
    // Test circuit breaker
    let circuit_result = c2c::circuit_breaker::with_circuit_breaker(
        "test_circuit",
        c2c::circuit_breaker::CircuitBreakerConfig::default(),
        async { Ok::<(), anyhow::Error>(()) }
    ).await;
    assert!(circuit_result.is_ok());
    
    Ok(())
}

#[tokio::test]
async fn test_error_recovery() -> Result<()> {
    // Test graceful shutdown
    c2c::shutdown::init_shutdown_manager().await?;
    
    // Simulate shutdown signal
    let shutdown_result = timeout(
        Duration::from_secs(5),
        c2c::shutdown::request_shutdown(c2c::shutdown::ShutdownSignal::Graceful)
    ).await;
    
    assert!(shutdown_result.is_ok());
    
    Ok(())
}

#[tokio::test]
async fn test_security_flow() -> Result<()> {
    let security_manager = c2c::security::get_security_manager();
    
    // Test authentication
    let context = security_manager.authenticate("admin", "SecurePass123!", "default").await?;
    
    // Test authorization
    let authz_result = security_manager.authorize(&context, "read", "manifests").await?;
    assert!(authz_result);
    
    // Test encryption/decryption
    let test_data = b"sensitive test data";
    let encrypted = security_manager.encrypt(test_data).await?;
    let decrypted = security_manager.decrypt(&encrypted).await?;
    assert_eq!(test_data.to_vec(), decrypted);
    
    Ok(())
}

#[tokio::test]
async fn test_performance_monitoring() -> Result<()> {
    let perf_manager = c2c::performance::get_performance_manager()?;
    
    // Record various operations
    perf_manager.record_operation("fast_op", Duration::from_millis(10)).await?;
    perf_manager.record_operation("slow_op", Duration::from_millis(500)).await?;
    perf_manager.record_operation("medium_op", Duration::from_millis(100)).await?;
    
    // Get statistics
    let stats = perf_manager.get_statistics().await?;
    assert!(stats.total_operations >= 3);
    assert!(stats.average_duration > Duration::from_millis(10));
    
    // Test cache
    let cache_stats = perf_manager.get_cache_stats().await?;
    assert!(cache_stats.hit_rate >= 0.0);
    
    Ok(())
}

#[tokio::test]
async fn test_backup_system() -> Result<()> {
    let temp_dir = tempfile::tempdir()?;
    let backup_config = c2c::backup::BackupConfig {
        backup_directory: temp_dir.path().join("backups"),
        retention_days: 7,
        compression_enabled: false,
        encryption_enabled: false,
        backup_interval: Duration::from_secs(3600),
        max_backup_size_mb: 100,
        include_databases: false,
        include_logs: false,
        include_config: false,
    };
    
    c2c::backup::init_backup_manager(backup_config).await?;
    
    // Create backup
    let backup_id = c2c::backup::create_backup(Some("Test backup".to_string())).await?;
    assert!(!backup_id.is_empty());
    
    // List backups
    let backup_manager = c2c::backup::get_backup_manager().unwrap();
    let backups = backup_manager.list_backups().await;
    assert_eq!(backups.len(), 1);
    
    Ok(())
}

#[tokio::test]
async fn test_validation_system() -> Result<()> {
    let validator = c2c::validation::get_validator();
    
    // Test valid inputs
    assert!(validator.validate_tenant_id("tenant123").is_ok());
    assert!(validator.validate_user_id("user123").is_ok());
    assert!(validator.validate_file_path("path/to/file.txt").is_ok());
    assert!(validator.validate_url("https://example.com/api").is_ok());
    
    // Test invalid inputs
    assert!(validator.validate_tenant_id("").is_err());
    assert!(validator.validate_user_id("../malicious").is_err());
    assert!(validator.validate_file_path("/etc/passwd").is_err());
    assert!(validator.validate_url("not-a-url").is_err());
    
    Ok(())
}

#[tokio::test]
async fn test_circuit_breaker_patterns() -> Result<()> {
    let config = c2c::circuit_breaker::CircuitBreakerConfig {
        failure_threshold: 2,
        success_threshold: 1,
        timeout: Duration::from_millis(100),
        max_requests: 5,
    };
    
    let call_count = std::sync::atomic::AtomicU32::new(0);
    
    // First call succeeds
    let result1 = c2c::circuit_breaker::with_circuit_breaker(
        "test_pattern",
        config.clone(),
        async {
            call_count.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            Ok::<(), anyhow::Error>(())
        }
    ).await;
    assert!(result1.is_ok());
    
    // Two failures should open circuit
    let _ = c2c::circuit_breaker::with_circuit_breaker(
        "test_pattern",
        config.clone(),
        async { Err::<(), _>(anyhow::anyhow!("failure")) }
    ).await;
    
    let _ = c2c::circuit_breaker::with_circuit_breaker(
        "test_pattern",
        config.clone(),
        async { Err::<(), _>(anyhow::anyhow!("failure")) }
    ).await;
    
    // Next call should fail fast (circuit open)
    let result3 = c2c::circuit_breaker::with_circuit_breaker(
        "test_pattern",
        config.clone(),
        async { Ok::<(), _>(()) }
    ).await;
    assert!(result3.is_err());
    assert!(result3.unwrap_err().to_string().contains("Circuit breaker"));
    
    Ok(())
}

#[tokio::test]
async fn test_alerting_flow() -> Result<()> {
    let alert_manager = c2c::alerting::get_alert_manager();
    
    // Fire test alert
    let alert = c2c::alerting::AlertBuilder::new("Test Alert")
        .description("This is a test alert")
        .severity(c2c::alerting::AlertSeverity::Warning)
        .build();
    
    alert_manager.fire_alert(alert).await?;
    
    // Check active alerts
    let active_alerts = alert_manager.get_active_alerts().await?;
    assert_eq!(active_alerts.len(), 1);
    
    // Acknowledge alert
    let alert_id = &active_alerts[0].id;
    alert_manager.acknowledge_alert(alert_id).await?;
    
    // Should no longer be active
    let active_alerts_after = alert_manager.get_active_alerts().await?;
    assert_eq!(active_alerts_after.len(), 0);
    
    Ok(())
}

#[tokio::test]
async fn test_database_migrations() -> Result<()> {
    let temp_dir = tempfile::tempdir()?;
    let db_path = temp_dir.path().join("test.db");
    let db_url = format!("sqlite:{}", db_path.display());
    
    // Initialize database with migrations
    let pool = c2c::migrations::initialize_database(&db_url).await?;
    
    // Check migration status
    let migration_manager = c2c::migrations::get_migration_manager(pool);
    let status = migration_manager.status().await?;
    
    assert_eq!(status.current_version, 5); // Should be latest version
    assert_eq!(status.pending_count, 0);
    
    Ok(())
}

#[tokio::test]
async fn test_system_resilience() -> Result<()> {
    // Test that system handles various failure conditions gracefully
    
    // Test rate limiting under load
    let rate_limiter = c2c::rate_limit::get_rate_limit_manager();
    let mut success_count = 0;
    
    for i in 0..150 {
        if rate_limiter.check_rate_limit("load_test", 1).await.unwrap_or(false) {
            success_count += 1;
        }
    }
    
    // Should be rate limited
    assert!(success_count < 150);
    assert!(success_count > 0); // But some should get through
    
    // Test resource limits
    let resource_status = rate_limiter.get_resource_status().await;
    assert!(resource_status.healthy);
    
    Ok(())
}
