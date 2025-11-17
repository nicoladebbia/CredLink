//! HSM/KMS Signing Service
//! 
//! HTTP server providing signing operations for multiple backends

use anyhow::{Context, Result};
use axum::{
    extract::{Json, State, Path},
    http::StatusCode,
    response::Json as ResponseJson,
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::net::TcpListener;
use tower_http::cors::CorsLayer;
use tracing::{info, error, debug, warn};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use signer_hsm::{BackendFactory, BackendConfig, SignBackend, SignRequest, SignResponse, HealthStatus};

/// Application state
#[derive(Clone)]
struct AppState {
    backends: Arc<HashMap<String, Arc<dyn SignBackend>>>,
}

/// API error response
#[derive(Debug, Serialize)]
struct ErrorResponse {
    error: String,
    code: u16,
    timestamp: chrono::DateTime<chrono::Utc>,
}

/// Health check response
#[derive(Debug, Serialize)]
struct HealthCheckResponse {
    service: String,
    version: String,
    backends: Vec<HealthStatus>,
    timestamp: chrono::DateTime<chrono::Utc>,
}

/// Sign endpoint handler
async fn sign_handler(
    State(state): State<AppState>,
    Json(request): Json<SignRequest>,
) -> Result<ResponseJson<SignResponse>, (StatusCode, ResponseJson<ErrorResponse>)> {
    debug!("Sign request for tenant: {}", request.tenant_id);
    
    let backend = state.backends.get(&request.tenant_id)
        .ok_or_else(|| {
            let error = ErrorResponse {
                error: format!("No backend configured for tenant: {}", request.tenant_id),
                code: 404,
                timestamp: chrono::Utc::now(),
            };
            (StatusCode::NOT_FOUND, ResponseJson(error))
        })?;
    
    // Decode hex digest
    let digest = hex::decode(&request.digest)
        .map_err(|e| {
            let error = ErrorResponse {
                error: format!("Invalid hex digest: {}", e),
                code: 400,
                timestamp: chrono::Utc::now(),
            };
            (StatusCode::BAD_REQUEST, ResponseJson(error))
        })?;
    
    // Verify digest is SHA-256 (32 bytes)
    if digest.len() != 32 {
        let error = ErrorResponse {
            error: "Digest must be 32 bytes (SHA-256)".to_string(),
            code: 400,
            timestamp: chrono::Utc::now(),
        };
        return Err((StatusCode::BAD_REQUEST, ResponseJson(error)));
    }
    
    // Sign the digest
    let signature = backend.sign_es256(&request.tenant_id, &digest).await
        .map_err(|e| {
            error!("Signing failed for tenant {}: {}", request.tenant_id, e);
            let error = ErrorResponse {
                error: format!("Signing failed: {}", e),
                code: 500,
                timestamp: chrono::Utc::now(),
            };
            (StatusCode::INTERNAL_SERVER_ERROR, ResponseJson(error))
        })?;
    
    // Get key metadata
    let key_metadata = backend.key_metadata(&request.tenant_id).await
        .map_err(|e| {
            error!("Failed to get key metadata for tenant {}: {}", request.tenant_id, e);
            let error = ErrorResponse {
                error: format!("Failed to get key metadata: {}", e),
                code: 500,
                timestamp: chrono::Utc::now(),
            };
            (StatusCode::INTERNAL_SERVER_ERROR, ResponseJson(error))
        })?;
    
    let response = SignResponse {
        signature: hex::encode(signature),
        key_metadata,
        signed_at: chrono::Utc::now(),
        request_id: request.request_id,
    };
    
    info!("Successfully signed digest for tenant: {}", request.tenant_id);
    Ok(ResponseJson(response))
}

/// Get public key handler
async fn pubkey_handler(
    State(state): State<AppState>,
    Path(tenant_id): Path<String>,
) -> Result<ResponseJson<serde_json::Value>, (StatusCode, ResponseJson<ErrorResponse>)> {
    debug!("Getting public key for tenant: {}", tenant_id);
    
    let backend = state.backends.get(&tenant_id)
        .ok_or_else(|| {
            let error = ErrorResponse {
                error: format!("No backend configured for tenant: {}", tenant_id),
                code: 404,
                timestamp: chrono::Utc::now(),
            };
            (StatusCode::NOT_FOUND, ResponseJson(error))
        })?;
    
    let pubkey_pem = backend.pubkey_pem(&tenant_id).await
        .map_err(|e| {
            error!("Failed to get public key for tenant {}: {}", tenant_id, e);
            let error = ErrorResponse {
                error: format!("Failed to get public key: {}", e),
                code: 500,
                timestamp: chrono::Utc::now(),
            };
            (StatusCode::INTERNAL_SERVER_ERROR, ResponseJson(error))
        })?;
    
    let response = serde_json::json!({
        "tenant_id": tenant_id,
        "public_key": pubkey_pem,
        "backend_type": backend.backend_type(),
        "timestamp": chrono::Utc::now(),
    });
    
    Ok(ResponseJson(response))
}

/// Health check handler
async fn health_handler(
    State(state): State<AppState>,
) -> ResponseJson<HealthCheckResponse> {
    let mut backend_statuses = Vec::new();
    
    for (tenant, backend) in state.backends.iter() {
        match backend.health_check().await {
            Ok(status) => backend_statuses.push(status),
            Err(e) => {
                warn!("Health check failed for tenant {}: {}", tenant, e);
                backend_statuses.push(HealthStatus {
                    backend_type: backend.backend_type(),
                    is_healthy: false,
                    latency_ms: 0,
                    error_message: Some(e.to_string()),
                    last_check: chrono::Utc::now(),
                });
            }
        }
    }
    
    let response = HealthCheckResponse {
        service: "signer-hsm".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        backends: backend_statuses,
        timestamp: chrono::Utc::now(),
    };
    
    ResponseJson(response)
}

/// Configuration structure
#[derive(Debug, Deserialize)]
struct ServiceConfig {
    host: String,
    port: u16,
    backends: HashMap<String, BackendConfig>,
}

/// Load configuration from environment or file
async fn load_config() -> Result<ServiceConfig> {
    let config = config::Config::builder()
        .add_source(config::File::with_name("config/signer-hsm").required(false))
        .add_source(config::Environment::with_prefix("SIGNER_HSM"))
        .build()?;
    
    let mut config: ServiceConfig = config.try_deserialize()
        .context("Failed to deserialize configuration")?;
    
    // Set defaults
    if config.host.is_empty() {
        config.host = "0.0.0.0".to_string();
    }
    if config.port == 0 {
        config.port = 8082;
    }
    
    Ok(config)
}

/// Initialize backends from configuration
async fn initialize_backends(config: &ServiceConfig) -> Result<HashMap<String, Arc<dyn SignBackend>>> {
    let mut backends = HashMap::new();
    
    for (tenant, backend_config) in &config.backends {
        info!("Initializing backend for tenant: {} ({:?})", tenant, backend_config.backend_type);
        
        let backend = BackendFactory::create(backend_config).await
            .with_context(|| format!("Failed to create backend for tenant: {}", tenant))?;
        
        // Test backend health
        match backend.health_check().await {
            Ok(status) => {
                if status.is_healthy {
                    info!("Backend for tenant {} is healthy", tenant);
                } else {
                    warn!("Backend for tenant {} is unhealthy: {:?}", tenant, status.error_message);
                }
            }
            Err(e) => {
                warn!("Health check failed for tenant {}: {}", tenant, e);
            }
        }
        
        backends.insert(tenant.clone(), Arc::from(backend));
    }
    
    Ok(backends)
}

/// Create application router
fn create_app(state: AppState) -> Router {
    Router::new()
        .route("/sign", post(sign_handler))
        .route("/pubkey/:tenant_id", get(pubkey_handler))
        .route("/health", get(health_handler))
        .layer(CorsLayer::permissive())
        .with_state(state)
}

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::try_from_default_env()
            .unwrap_or_else(|_| "signer_hsm=info,tower_http=info".into()))
        .with(tracing_subscriber::fmt::layer())
        .init();
    
    info!("Starting HSM/KMS Signing Service v{}", env!("CARGO_PKG_VERSION"));
    
    // Load configuration
    let config = load_config().await
        .context("Failed to load configuration")?;
    
    info!("Loaded configuration for {} tenants", config.backends.len());
    
    // Initialize backends
    let backends = initialize_backends(&config).await
        .context("Failed to initialize backends")?;
    
    let state = AppState {
        backends: Arc::new(backends),
    };
    
    // Create router
    let app = create_app(state);
    
    // Start server
    let bind_addr = format!("{}:{}", config.host, config.port);
    let listener = TcpListener::bind(&bind_addr).await
        .with_context(|| format!("Failed to bind to {}", bind_addr))?;
    
    info!("HSM/KMS Signing Service listening on {}", bind_addr);
    
    axum::serve(listener, app).await
        .context("Failed to start server")?;
    
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum_test::TestServer;
    
    #[tokio::test]
    async fn test_health_endpoint() {
        let state = AppState {
            backends: Arc::new(HashMap::new()),
        };
        
        let app = create_app(state);
        let server = TestServer::new(app).unwrap();
        
        let response = server.get("/health").await;
        
        assert_eq!(response.status_code(), 200);
        
        let health_response: HealthCheckResponse = response.json();
        assert_eq!(health_response.service, "signer-hsm");
        assert!(health_response.backends.is_empty());
    }
    
    #[tokio::test]
    async fn test_pubkey_missing_tenant() {
        let state = AppState {
            backends: Arc::new(HashMap::new()),
        };
        
        let app = create_app(state);
        let server = TestServer::new(app).unwrap();
        
        let response = server.get("/pubkey/nonexistent").await;
        
        assert_eq!(response.status_code(), 404);
        
        let error_response: ErrorResponse = response.json();
        assert!(error_response.error.contains("No backend configured"));
    }
}
