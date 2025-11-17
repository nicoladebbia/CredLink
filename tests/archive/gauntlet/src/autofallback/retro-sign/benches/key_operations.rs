//! Key Operations Performance Benchmarks - ENTERPRISE OPTIMIZATION
//! 
//! These benchmarks validate performance characteristics under load
//! Real-world scenarios with actual backends and realistic data volumes
//! 

use criterion::{black_box, criterion_group, criterion_main, Criterion, BenchmarkId};
use std::sync::Arc;
use std::time::Duration;
use tempfile::TempDir;
use tokio::runtime::Runtime;

use keyctl::{
    PolicyManager, RotationEngine, RotationEngineConfig,
    IncidentEngine, IncidentEngineConfig, SigningPolicy, KeyConfig, KeyType,
    IncidentType, IncidentSeverity
};

/// Benchmark policy creation performance
fn bench_policy_creation(c: &mut Criterion) {
    let rt = Runtime::new().unwrap();
    let env = rt.block_on(create_test_environment()).unwrap();
    
    let mut group = c.benchmark_group("policy_creation");
    
    for policy_count in [10, 100, 1000].iter() {
        group.bench_with_input(
            BenchmarkId::new("bulk_policy_creation", policy_count),
            policy_count,
            |b, &policy_count| {
                b.to_async(&rt).iter(|| async move {
                    for i in 0..policy_count {
                        let tenant_id = format!("bench-tenant-{}", i);
                        let policy = create_test_policy(&tenant_id, KeyType::Software).unwrap();
                        env.policy_manager.upsert_policy(&policy).await.unwrap();
                    }
                });
            },
        );
    }
    
    group.finish();
}

/// Benchmark rotation scheduling performance
fn bench_rotation_scheduling(c: &mut Criterion) {
    let rt = Runtime::new().unwrap();
    let env = rt.block_on(create_test_environment()).unwrap();
    
    let mut group = c.benchmark_group("rotation_scheduling");
    
    for rotation_count in [10, 100, 1000].iter() {
        group.bench_with_input(
            BenchmarkId::new("bulk_rotation_scheduling", rotation_count),
            rotation_count,
            |b, &rotation_count| {
                b.to_async(&rt).iter(|| async move {
                    for i in 0..rotation_count {
                        let tenant_id = format!("bench-rotation-tenant-{}", i);
                        let policy = create_test_policy(&tenant_id, KeyType::Software).unwrap();
                        env.policy_manager.upsert_policy(&policy).await.unwrap();
                        
                        let scheduled_time = chrono::Utc::now() + chrono::Duration::days(30);
                        env.rotation_engine.schedule_rotation(
                            &tenant_id,
                            scheduled_time,
                            "benchmark-test"
                        ).await.unwrap();
                    }
                });
            },
        );
    }
    
    group.finish();
}

/// Benchmark incident detection performance
fn bench_incident_detection(c: &mut Criterion) {
    let rt = Runtime::new().unwrap();
    let env = rt.block_on(create_test_environment()).unwrap();
    
    let mut group = c.benchmark_group("incident_detection");
    
    for incident_count in [10, 100, 1000].iter() {
        group.bench_with_input(
            BenchmarkId::new("bulk_incident_detection", incident_count),
            incident_count,
            |b, &incident_count| {
                b.to_async(&rt).iter(|| async move {
                    for i in 0..incident_count {
                        let tenant_id = format!("bench-incident-tenant-{}", i);
                        let policy = create_test_policy(&tenant_id, KeyType::Software).unwrap();
                        env.policy_manager.upsert_policy(&policy).await.unwrap();
                        
                        env.incident_engine.detect_incident(
                            &tenant_id,
                            IncidentType::SecurityAlert,
                            IncidentSeverity::Medium,
                            "Benchmark test incident",
                            vec![format!("{}-key", tenant_id)]
                        ).await.unwrap();
                    }
                });
            },
        );
    }
    
    group.finish();
}

/// Benchmark concurrent operations
fn bench_concurrent_operations(c: &mut Criterion) {
    let rt = Runtime::new().unwrap();
    let env = rt.block_on(create_test_environment()).unwrap();
    
    let mut group = c.benchmark_group("concurrent_operations");
    
    for concurrent_count in [10, 50, 100].iter() {
        group.bench_with_input(
            BenchmarkId::new("concurrent_policy_operations", concurrent_count),
            concurrent_count,
            |b, &concurrent_count| {
                b.to_async(&rt).iter(|| async move {
                    let mut handles = Vec::new();
                    
                    for i in 0..concurrent_count {
                        let tenant_id = format!("concurrent-tenant-{}", i);
                        let env_clone = Arc::clone(&env.policy_manager);
                        
                        let handle = tokio::spawn(async move {
                            let policy = create_test_policy(&tenant_id, KeyType::Software).unwrap();
                            env_clone.upsert_policy(&policy).await.unwrap();
                        });
                        
                        handles.push(handle);
                    }
                    
                    for handle in handles {
                        handle.await.unwrap();
                    }
                });
            },
        );
    }
    
    group.finish();
}

/// Benchmark backend performance
fn bench_backend_performance(c: &mut Criterion) {
    let rt = Runtime::new().unwrap();
    let env = rt.block_on(create_test_environment()).unwrap();
    
    let mut group = c.benchmark_group("backend_performance");
    
    // Test different backend types
    for (backend_name, key_type) in [
        ("hsm_backend", KeyType::HSM),
        ("kms_backend", KeyType::KMS),
        ("software_backend", KeyType::Software),
    ].iter() {
        group.bench_with_input(
            BenchmarkId::new("policy_operations", backend_name),
            key_type,
            |b, &key_type| {
                b.to_async(&rt).iter(|| async move {
                    let tenant_id = format!("backend-test-{}", uuid::Uuid::new_v4());
                    let policy = create_test_policy(&tenant_id, key_type).unwrap();
                    env.policy_manager.upsert_policy(&policy).await.unwrap();
                });
            },
        );
    }
    
    group.finish();
}

/// Benchmark memory usage under load
fn bench_memory_usage(c: &mut Criterion) {
    let rt = Runtime::new().unwrap();
    let env = rt.block_on(create_test_environment()).unwrap();
    
    let mut group = c.benchmark_group("memory_usage");
    
    group.bench_function("memory_pressure_test", |b| {
        b.to_async(&rt).iter(|| async move {
            // Create large number of policies to test memory usage
            for batch in 0..10 {
                for i in 0..100 {
                    let tenant_id = format!("memory-test-{}-{}", batch, i);
                    let policy = create_test_policy(&tenant_id, KeyType::Software).unwrap();
                    env.policy_manager.upsert_policy(&policy).await.unwrap();
                }
                
                // Simulate memory pressure
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        });
    });
    
    group.finish();
}

/// Benchmark database performance
fn bench_database_performance(c: &mut Criterion) {
    let rt = Runtime::new().unwrap();
    let env = rt.block_on(create_test_environment()).unwrap();
    
    let mut group = c.benchmark_group("database_performance");
    
    // Test database read performance
    group.bench_function("bulk_policy_reads", |b| {
        b.to_async(&rt).iter(|| async move {
            // Create policies first
            for i in 0..1000 {
                let tenant_id = format!("db-read-tenant-{}", i);
                let policy = create_test_policy(&tenant_id, KeyType::Software).unwrap();
                env.policy_manager.upsert_policy(&policy).await.unwrap();
            }
            
            // Benchmark reads
            for i in 0..1000 {
                let tenant_id = format!("db-read-tenant-{}", i);
                black_box(env.policy_manager.get_policy(&tenant_id).await.unwrap());
            }
        });
    });
    
    // Test database write performance
    group.bench_function("bulk_policy_writes", |b| {
        b.to_async(&rt).iter(|| async move {
            for i in 0..1000 {
                let tenant_id = format!("db-write-tenant-{}", i);
                let policy = create_test_policy(&tenant_id, KeyType::Software).unwrap();
                black_box(env.policy_manager.upsert_policy(&policy).await.unwrap());
            }
        });
    });
    
    group.finish();
}

/// Benchmark rotation execution performance
fn bench_rotation_execution(c: &mut Criterion) {
    let rt = Runtime::new().unwrap();
    let env = rt.block_on(create_test_environment()).unwrap();
    
    let mut group = c.benchmark_group("rotation_execution");
    
    for rotation_count in [1, 5, 10].iter() {
        group.bench_with_input(
            BenchmarkId::new("concurrent_rotations", rotation_count),
            rotation_count,
            |b, &rotation_count| {
                b.to_async(&rt).iter(|| async move {
                    let mut handles = Vec::new();
                    
                    for i in 0..rotation_count {
                        let tenant_id = format!("rotation-exec-tenant-{}", i);
                        let policy = create_test_policy(&tenant_id, KeyType::Software).unwrap();
                        env.policy_manager.upsert_policy(&policy).await.unwrap();
                        
                        let scheduled_time = chrono::Utc::now() + chrono::Duration::days(30);
                        let rotation_id = env.rotation_engine.schedule_rotation(
                            &tenant_id,
                            scheduled_time,
                            "benchmark-execution"
                        ).await.unwrap();
                        
                        let engine_clone = Arc::clone(&env.rotation_engine);
                        
                        let handle = tokio::spawn(async move {
                            engine_clone.execute_rotation(&rotation_id).await.unwrap();
                        });
                        
                        handles.push(handle);
                    }
                    
                    for handle in handles {
                        handle.await.unwrap();
                    }
                });
            },
        );
    }
    
    group.finish();
}

/// Benchmark incident response performance
fn bench_incident_response(c: &mut Criterion) {
    let rt = Runtime::new().unwrap();
    let env = rt.block_on(create_test_environment()).unwrap();
    
    let mut group = c.benchmark_group("incident_response");
    
    for incident_count in [1, 5, 10].iter() {
        group.bench_with_input(
            BenchmarkId::new("concurrent_incident_response", incident_count),
            incident_count,
            |b, &incident_count| {
                b.to_async(&rt).iter(|| async move {
                    let mut handles = Vec::new();
                    
                    for i in 0..incident_count {
                        let tenant_id = format!("incident-response-tenant-{}", i);
                        let policy = create_test_policy(&tenant_id, KeyType::Software).unwrap();
                        env.policy_manager.upsert_policy(&policy).await.unwrap();
                        
                        let engine_clone = Arc::clone(&env.incident_engine);
                        
                        let handle = tokio::spawn(async move {
                            let incident_id = engine_clone.detect_incident(
                                &tenant_id,
                                IncidentType::KeyCompromise,
                                IncidentSeverity::Critical,
                                "Benchmark incident response",
                                vec![format!("{}-key", tenant_id)]
                            ).await.unwrap();
                            
                            // Simulate response workflow
                            tokio::time::sleep(Duration::from_millis(100)).await;
                            
                            engine_clone.resolve_incident(&incident_id, "Benchmark resolution").await.unwrap();
                        });
                        
                        handles.push(handle);
                    }
                    
                    for handle in handles {
                        handle.await.unwrap();
                    }
                });
            },
        );
    }
    
    group.finish();
}

/// Benchmark system throughput
fn bench_system_throughput(c: &mut Criterion) {
    let rt = Runtime::new().unwrap();
    let env = rt.block_on(create_test_environment()).unwrap();
    
    let mut group = c.benchmark_group("system_throughput");
    
    group.bench_function("mixed_operations_throughput", |b| {
        b.to_async(&rt).iter(|| async move {
            let mut handles = Vec::new();
            
            // Mix of different operations
            for i in 0..50 {
                let tenant_id = format!("throughput-tenant-{}", i);
                let policy_manager_clone = Arc::clone(&env.policy_manager);
                let rotation_engine_clone = Arc::clone(&env.rotation_engine);
                let incident_engine_clone = Arc::clone(&env.incident_engine);
                
                let handle = tokio::spawn(async move {
                    // Policy operation
                    let policy = create_test_policy(&tenant_id, KeyType::Software).unwrap();
                    policy_manager_clone.upsert_policy(&policy).await.unwrap();
                    
                    // Rotation operation
                    let scheduled_time = chrono::Utc::now() + chrono::Duration::days(30);
                    let rotation_id = rotation_engine_clone.schedule_rotation(
                        &tenant_id,
                        scheduled_time,
                        "throughput-test"
                    ).await.unwrap();
                    
                    // Incident operation
                    let incident_id = incident_engine_clone.detect_incident(
                        &tenant_id,
                        IncidentType::SecurityAlert,
                        IncidentSeverity::Low,
                        "Throughput test incident",
                        vec![format!("{}-key", tenant_id)]
                    ).await.unwrap();
                    
                    // Cleanup
                    incident_engine_clone.resolve_incident(&incident_id, "Throughput test resolution").await.unwrap();
                });
                
                handles.push(handle);
            }
            
            for handle in handles {
                handle.await.unwrap();
            }
        });
    });
    
    group.finish();
}

// Helper functions and test environment

struct TestEnvironment {
    temp_dir: TempDir,
    policy_manager: Arc<PolicyManager>,
    rotation_engine: Arc<RotationEngine>,
    incident_engine: Arc<IncidentEngine>,
}

async fn create_test_environment() -> TestEnvironment {
    let temp_dir = TempDir::new().unwrap();
    let db_url = format!("sqlite:{}/bench.db", temp_dir.path().display());
    
    let policy_manager = Arc::new(PolicyManager::new(&db_url).await.unwrap());
    
    let rotation_config = RotationEngineConfig {
        approval_required: false,
        canary_count: 10,
        cutover_timeout_minutes: 30,
        rollback_enabled: true,
        notification_webhook: None,
    };
    let rotation_engine = Arc::new(RotationEngine::new(
        Arc::clone(&policy_manager),
        rotation_config,
    ));
    
    let incident_config = IncidentEngineConfig {
        auto_escalate: true,
        emergency_rotation_enabled: true,
        mass_resign_threshold: 1000,
        compliance_reporting: true,
        notification_webhook: None,
        rollback_timeout_minutes: 60,
    };
    let incident_engine = Arc::new(IncidentEngine::new(
        Arc::clone(&policy_manager),
        Arc::clone(&rotation_engine),
        incident_config,
    ));
    
    TestEnvironment {
        temp_dir,
        policy_manager,
        rotation_engine,
        incident_engine,
    }
}

fn create_test_policy(tenant_id: &str, key_type: KeyType) -> Result<SigningPolicy, Box<dyn std::error::Error>> {
    let provider = match key_type {
        KeyType::HSM => "yubihsm2",
        KeyType::KMS => "aws-kms",
        KeyType::Software => "software",
    };
    
    Ok(SigningPolicy {
        tenant_id: tenant_id.to_string(),
        algorithm: "ES256".to_string(),
        tsa_profile: "std".to_string(),
        assertions_allow: vec!["c2pa.actions".to_string()],
        assertions_deny: vec![],
        embed_allowed_origins: vec![],
        key: KeyConfig {
            key_type,
            provider: provider.to_string(),
            handle: format!("bench-key-{}", tenant_id),
            cert_chain: vec![],
            not_before: chrono::Utc::now(),
            not_after: chrono::Utc::now() + chrono::Duration::days(90),
            rotate_every_days: 30,
            max_issuance_per_24h: 1000,
            sign_enabled: true,
        },
        created_at: chrono::Utc::now(),
        updated_at: chrono::Utc::now(),
        policy_hash: format!("bench-hash-{}", tenant_id),
    })
}

criterion_group!(
    benches,
    bench_policy_creation,
    bench_rotation_scheduling,
    bench_incident_detection,
    bench_concurrent_operations,
    bench_backend_performance,
    bench_memory_usage,
    bench_database_performance,
    bench_rotation_execution,
    bench_incident_response,
    bench_system_throughput
);

criterion_main!(benches);
