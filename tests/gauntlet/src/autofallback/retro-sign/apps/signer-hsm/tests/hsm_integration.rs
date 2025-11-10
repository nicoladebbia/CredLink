//! HSM Integration Tests - BRUTAL VALIDATION
//! 
//! These tests verify REAL HSM connectivity and functionality
//! NO MOCKS ALLOWED - These must pass with real hardware or the system is BROKEN

use anyhow::Result;
use signer_hsm::{BackendFactory, BackendConfig, BackendType};
use std::collections::HashMap;
use tokio_test;

/// Test YubiHSM2 REAL hardware connectivity
#[tokio::test]
#[ignore] // Requires real YubiHSM2 hardware
async fn test_yubihsm2_real_hardware() -> Result<()> {
    // This test REQUIRES real YubiHSM2 hardware to be connected
    // It will FAIL without it - NO MOCKS
    
    let mut settings = HashMap::new();
    settings.insert("module_path".to_string(), "/usr/local/lib/libyubihsm.so".to_string());
    settings.insert("slot_id".to_string(), "0".to_string());
    settings.insert("key_id".to_string(), "01020304".to_string());
    settings.insert("pin".to_string(), "123456".to_string());
    
    let config = BackendConfig {
        backend_type: BackendType::YubiHSM2,
        settings,
        timeout_ms: 5000,
        max_retries: 3,
    };
    
    // This MUST work with real hardware
    let backend = BackendFactory::create(&config).await?;
    
    // Test health check
    let health = backend.health_check().await?;
    assert!(health.is_healthy, "YubiHSM2 hardware must be healthy");
    assert!(health.latency_ms < 1000, "YubiHSM2 response must be fast");
    
    // Test signing with REAL digest
    let test_digest = hex::decode("abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890")?;
    let signature = backend.sign_es256("test-tenant", &test_digest).await?;
    
    // Verify signature is valid DER format
    assert_eq!(signature[0], 0x30, "Signature must be DER-encoded");
    assert!(signature.len() > 64, "DER signature must be longer than raw signature");
    
    // Test public key extraction
    let pubkey_pem = backend.pubkey_pem("test-tenant").await?;
    assert!(pubkey_pem.starts_with("-----BEGIN PUBLIC KEY-----"));
    assert!(pubkey_pem.ends_with("-----END PUBLIC KEY-----\n"));
    
    // Test key metadata
    let metadata = backend.key_metadata("test-tenant").await?;
    assert_eq!(metadata.backend_type, BackendType::YubiHSM2);
    assert_eq!(metadata.algorithm, "ES256");
    assert!(metadata.attestation.is_some(), "HSM must provide attestation");
    
    println!("✅ YubiHSM2 REAL hardware test PASSED");
    Ok(())
}

/// Test Vault-HSM REAL connectivity
#[tokio::test]
#[ignore] // Requires real Vault-HSM setup
async fn test_vault_hsm_real_connectivity() -> Result<()> {
    // This test REQUIRES real Vault with HSM backend
    // It will FAIL without it - NO MOCKS
    
    let mut settings = HashMap::new();
    settings.insert("vault_addr".to_string(), "https://vault-hsm.example.com".to_string());
    settings.insert("vault_token".to_string(), "s.real-token-here".to_string());
    settings.insert("mount_path".to_string(), "hsm".to_string());
    settings.insert("key_name".to_string(), "test-signing-key".to_string());
    
    let config = BackendConfig {
        backend_type: BackendType::VaultHSM,
        settings,
        timeout_ms: 5000,
        max_retries: 3,
    };
    
    // This MUST work with real Vault-HSM
    let backend = BackendFactory::create(&config).await?;
    
    // Test health check
    let health = backend.health_check().await?;
    assert!(health.is_healthy, "Vault-HSM must be healthy");
    assert!(health.latency_ms < 2000, "Vault-HSM response must be reasonable");
    
    // Test signing with REAL digest
    let test_digest = hex::decode("abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890")?;
    let signature = backend.sign_es256("test-tenant", &test_digest).await?;
    
    // Verify signature format
    assert!(!signature.is_empty(), "Vault-HSM must return real signature");
    
    // Test public key extraction
    let pubkey_pem = backend.pubkey_pem("test-tenant").await?;
    assert!(pubkey_pem.starts_with("-----BEGIN PUBLIC KEY-----"));
    
    // Test key metadata
    let metadata = backend.key_metadata("test-tenant").await?;
    assert_eq!(metadata.backend_type, BackendType::VaultHSM);
    assert!(metadata.attestation.is_some(), "Vault-HSM must provide attestation");
    
    println!("✅ Vault-HSM REAL connectivity test PASSED");
    Ok(())
}

/// Test HSM backend failure modes
#[tokio::test]
async fn test_hsm_failure_handling() -> Result<()> {
    // Test with invalid module path - MUST fail gracefully
    let mut settings = HashMap::new();
    settings.insert("module_path".to_string(), "/nonexistent/libyubihsm.so".to_string());
    settings.insert("slot_id".to_string(), "0".to_string());
    settings.insert("key_id".to_string(), "01020304".to_string());
    
    let config = BackendConfig {
        backend_type: BackendType::YubiHSM2,
        settings,
        timeout_ms: 1000,
        max_retries: 1,
    };
    
    // This MUST fail with clear error message
    let result = BackendFactory::create(&config).await;
    assert!(result.is_err(), "Invalid module path must fail");
    
    let error_msg = result.unwrap_err().to_string();
    assert!(error_msg.contains("NOT FOUND") || error_msg.contains("FAILED"), 
        "Error must be descriptive: {}", error_msg);
    
    // Test with invalid slot
    let mut settings = HashMap::new();
    settings.insert("module_path".to_string(), "/usr/local/lib/libyubihsm.so".to_string());
    settings.insert("slot_id".to_string(), "999999".to_string());
    settings.insert("key_id".to_string(), "01020304".to_string());
    
    let config = BackendConfig {
        backend_type: BackendType::YubiHSM2,
        settings,
        timeout_ms: 1000,
        max_retries: 1,
    };
    
    // This MUST fail with clear error message
    let result = BackendFactory::create(&config).await;
    assert!(result.is_err(), "Invalid slot must fail");
    
    println!("✅ HSM failure handling test PASSED");
    Ok(())
}

/// Test HSM attestation data extraction
#[tokio::test]
#[ignore] // Requires real HSM
async fn test_hsm_attestation_extraction() -> Result<()> {
    let mut settings = HashMap::new();
    settings.insert("module_path".to_string(), "/usr/local/lib/libyubihsm.so".to_string());
    settings.insert("slot_id".to_string(), "0".to_string());
    settings.insert("key_id".to_string(), "01020304".to_string());
    
    let config = BackendConfig {
        backend_type: BackendType::YubiHSM2,
        settings,
        timeout_ms: 5000,
        max_retries: 3,
    };
    
    let backend = BackendFactory::create(&config).await?;
    let metadata = backend.key_metadata("test-tenant").await?;
    
    // Verify attestation data is complete
    let attestation = metadata.attestation.expect("HSM must provide attestation");
    
    assert!(!attestation.device_serial.unwrap_or_default().is_empty(), 
        "Device serial must be present");
    assert!(!attestation.slot_id.unwrap_or_default().is_empty(), 
        "Slot ID must be present");
    assert!(!attestation.certificate_chain.is_empty(), 
        "Certificate chain must be present");
    assert!(!attestation.vendor_info.is_empty(), 
        "Vendor info must be present");
    
    // Verify vendor info contains expected fields
    assert!(attestation.vendor_info.contains_key("manufacturer"), 
        "Manufacturer must be specified");
    assert!(attestation.vendor_info.contains_key("model"), 
        "Model must be specified");
    assert!(attestation.vendor_info.contains_key("firmware_version"), 
        "Firmware version must be specified");
    
    println!("✅ HSM attestation extraction test PASSED");
    println!("   Device: {}", attestation.device_serial.unwrap_or_default());
    println!("   Manufacturer: {}", attestation.vendor_info.get("manufacturer").unwrap_or(&"unknown".to_string()));
    println!("   Model: {}", attestation.vendor_info.get("model").unwrap_or(&"unknown".to_string()));
    
    Ok(())
}

/// Test HSM performance under load
#[tokio::test]
#[ignore] // Requires real HSM
async fn test_hsm_performance_load() -> Result<()> {
    let mut settings = HashMap::new();
    settings.insert("module_path".to_string(), "/usr/local/lib/libyubihsm.so".to_string());
    settings.insert("slot_id".to_string(), "0".to_string());
    settings.insert("key_id".to_string(), "01020304".to_string());
    
    let config = BackendConfig {
        backend_type: BackendType::YubiHSM2,
        settings,
        timeout_ms: 5000,
        max_retries: 3,
    };
    
    let backend = BackendFactory::create(&config).await?;
    
    // Test 100 consecutive signatures
    let test_digest = hex::decode("abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890")?;
    let start_time = std::time::Instant::now();
    
    for i in 0..100 {
        let _signature = backend.sign_es256(&format!("load-test-{}", i), &test_digest).await?;
        
        // Progress indicator
        if (i + 1) % 10 == 0 {
            println!("  Completed {} signatures...", i + 1);
        }
    }
    
    let elapsed = start_time.elapsed();
    let signatures_per_second = 100.0 / elapsed.as_secs_f64();
    
    println!("✅ HSM performance test completed:");
    println!("   100 signatures in {:?}", elapsed);
    println!("   {:.2} signatures/second", signatures_per_second);
    
    // Performance assertions
    assert!(signatures_per_second > 1.0, "HSM must support at least 1 signature/second");
    assert!(elapsed.as_secs() < 120, "100 signatures must complete in < 2 minutes");
    
    Ok(())
}

/// Test HSM concurrent access
#[tokio::test]
#[ignore] // Requires real HSM
async fn test_hsm_concurrent_access() -> Result<()> {
    let mut settings = HashMap::new();
    settings.insert("module_path".to_string(), "/usr/local/lib/libyubihsm.so".to_string());
    settings.insert("slot_id".to_string(), "0".to_string());
    settings.insert("key_id".to_string(), "01020304".to_string());
    
    let config = BackendConfig {
        backend_type: BackendType::YubiHSM2,
        settings,
        timeout_ms: 10000,
        max_retries: 3,
    };
    
    let backend = std::sync::Arc::new(BackendFactory::create(&config).await?);
    
    // Test 10 concurrent signatures
    let test_digest = hex::decode("abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890")?;
    let mut handles = Vec::new();
    
    for i in 0..10 {
        let backend_clone = backend.clone();
        let digest_clone = test_digest.clone();
        
        let handle = tokio::spawn(async move {
            backend_clone.sign_es256(&format!("concurrent-{}", i), &digest_clone).await
        });
        
        handles.push(handle);
    }
    
    // Wait for all concurrent operations to complete
    let mut successful_operations = 0;
    for handle in handles {
        match handle.await? {
            Ok(_) => successful_operations += 1,
            Err(e) => println!("  Concurrent operation failed: {}", e),
        }
    }
    
    println!("✅ HSM concurrent access test completed:");
    println!("   {}/10 operations successful", successful_operations);
    
    // At least 80% should succeed under normal conditions
    assert!(successful_operations >= 8, "Most concurrent operations should succeed");
    
    Ok(())
}
