//! Circuit breaker pattern for resilience in C2 Concierge Retro-Sign

use anyhow::Result;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;
use tracing::{debug, warn, error};

/// Circuit breaker state
#[derive(Debug, Clone, PartialEq)]
pub enum CircuitState {
    Closed,    // Normal operation
    Open,      // Circuit is open, calls fail fast
    HalfOpen,  // Testing if service has recovered
}

/// Circuit breaker configuration
#[derive(Debug, Clone)]
pub struct CircuitBreakerConfig {
    pub failure_threshold: u32,      // Number of failures before opening
    pub success_threshold: u32,      // Number of successes to close from half-open
    pub timeout: Duration,           // How long to stay open before trying again
    pub max_requests: u32,           // Max requests in half-open state
}

impl Default for CircuitBreakerConfig {
    fn default() -> Self {
        Self {
            failure_threshold: 5,
            success_threshold: 3,
            timeout: Duration::from_secs(60),
            max_requests: 10,
        }
    }
}

/// Circuit breaker metrics
#[derive(Debug, Clone, Default)]
pub struct CircuitBreakerMetrics {
    pub requests: u64,
    pub successes: u64,
    pub failures: u64,
    pub timeouts: u64,
    pub circuit_breaker_errors: u64,
    pub consecutive_failures: u32,
    pub consecutive_successes: u32,
}

/// Circuit breaker implementation
pub struct CircuitBreaker {
    name: String,
    config: CircuitBreakerConfig,
    state: Arc<RwLock<CircuitState>>,
    metrics: Arc<RwLock<CircuitBreakerMetrics>>,
    last_failure_time: Arc<RwLock<Option<Instant>>>,
    half_open_requests: Arc<RwLock<u32>>,
}

impl CircuitBreaker {
    pub fn new(name: String, config: CircuitBreakerConfig) -> Self {
        Self {
            name,
            config,
            state: Arc::new(RwLock::new(CircuitState::Closed)),
            metrics: Arc::new(RwLock::new(CircuitBreakerMetrics::default())),
            last_failure_time: Arc::new(RwLock::new(None)),
            half_open_requests: Arc::new(RwLock::new(0)),
        }
    }
    
    /// Execute a function with circuit breaker protection
    pub async fn execute<F, T, E>(&self, f: F) -> Result<T>
    where
        F: std::future::Future<Output = Result<T, E>>,
        E: std::error::Error + Send + Sync + 'static,
    {
        // Check if we can proceed
        if !self.can_proceed().await {
            self.record_circuit_breaker_error().await;
            return Err(anyhow::anyhow!("Circuit breaker '{}' is open", self.name));
        }
        
        // Execute the function
        let start_time = Instant::now();
        let result = f.await;
        let duration = start_time.elapsed();
        
        match result {
            Ok(value) => {
                self.record_success().await;
                debug!("Circuit breaker '{}' call succeeded in {:?}", self.name, duration);
                Ok(value)
            }
            Err(error) => {
                self.record_failure().await;
                warn!("Circuit breaker '{}' call failed: {}", self.name, error);
                Err(anyhow::anyhow!("Operation failed: {}", error))
            }
        }
    }
    
    /// Execute with timeout
    pub async fn execute_with_timeout<F, T, E>(&self, f: F, timeout: Duration) -> Result<T>
    where
        F: std::future::Future<Output = Result<T, E>>,
        E: std::error::Error + Send + Sync + 'static,
    {
        if !self.can_proceed().await {
            self.record_circuit_breaker_error().await;
            return Err(anyhow::anyhow!("Circuit breaker '{}' is open", self.name));
        }
        
        let start_time = Instant::now();
        
        match tokio::time::timeout(timeout, f).await {
            Ok(Ok(value)) => {
                self.record_success().await;
                debug!("Circuit breaker '{}' call succeeded in {:?}", self.name, start_time.elapsed());
                Ok(value)
            }
            Ok(Err(error)) => {
                self.record_failure().await;
                warn!("Circuit breaker '{}' call failed: {}", self.name, error);
                Err(anyhow::anyhow!("Operation failed: {}", error))
            }
            Err(_) => {
                self.record_timeout().await;
                warn!("Circuit breaker '{}' call timed out after {:?}", self.name, timeout);
                Err(anyhow::anyhow!("Operation timed out after {:?}", timeout))
            }
        }
    }
    
    /// Check if the circuit breaker allows requests
    async fn can_proceed(&self) -> bool {
        let state = self.state.read().await;
        
        match *state {
            CircuitState::Closed => true,
            CircuitState::Open => {
                let last_failure = self.last_failure_time.read().await;
                if let Some(last_failure_time) = *last_failure {
                    if last_failure_time.elapsed() > self.config.timeout {
                        drop(state);
                        self.transition_to_half_open().await;
                        return true;
                    }
                }
                false
            }
            CircuitState::HalfOpen => {
                let half_open_requests = self.half_open_requests.read().await;
                *half_open_requests < self.config.max_requests
            }
        }
    }
    
    /// Record a successful call
    async fn record_success(&self) {
        let mut metrics = self.metrics.write().await;
        metrics.requests += 1;
        metrics.successes += 1;
        metrics.consecutive_successes += 1;
        metrics.consecutive_failures = 0;
        
        let consecutive_successes = metrics.consecutive_successes;
        drop(metrics);
        
        let state = self.state.read().await;
        if *state == CircuitState::HalfOpen {
            drop(state);
            if consecutive_successes >= self.config.success_threshold {
                self.transition_to_closed().await;
            }
        }
    }
    
    /// Record a failed call
    async fn record_failure(&self) {
        let mut metrics = self.metrics.write().await;
        metrics.requests += 1;
        metrics.failures += 1;
        metrics.consecutive_failures += 1;
        metrics.consecutive_successes = 0;
        
        let consecutive_failures = metrics.consecutive_failures;
        drop(metrics);
        
        let state = self.state.read().await;
        match *state {
            CircuitState::Closed => {
                if consecutive_failures >= self.config.failure_threshold {
                    drop(state);
                    self.transition_to_open().await;
                }
            }
            CircuitState::HalfOpen => {
                drop(state);
                self.transition_to_open().await;
            }
            _ => {}
        }
    }
    
    /// Record a timeout
    async fn record_timeout(&self) {
        let mut metrics = self.metrics.write().await;
        metrics.requests += 1;
        metrics.timeouts += 1;
        metrics.consecutive_failures += 1;
        metrics.consecutive_successes = 0;
        
        let consecutive_failures = metrics.consecutive_failures;
        drop(metrics);
        
        let state = self.state.read().await;
        match *state {
            CircuitState::Closed => {
                if consecutive_failures >= self.config.failure_threshold {
                    drop(state);
                    self.transition_to_open().await;
                }
            }
            CircuitState::HalfOpen => {
                drop(state);
                self.transition_to_open().await;
            }
            _ => {}
        }
    }
    
    /// Record a circuit breaker error (call rejected due to open circuit)
    async fn record_circuit_breaker_error(&self) {
        let mut metrics = self.metrics.write().await;
        metrics.circuit_breaker_errors += 1;
    }
    
    /// Transition to closed state
    async fn transition_to_closed(&self) {
        let mut state = self.state.write().await;
        *state = CircuitState::Closed;
        
        let mut half_open_requests = self.half_open_requests.write().await;
        *half_open_requests = 0;
        
        info!("Circuit breaker '{}' transitioned to CLOSED", self.name);
    }
    
    /// Transition to open state
    async fn transition_to_open(&self) {
        let mut state = self.state.write().await;
        *state = CircuitState::Open;
        
        let mut last_failure_time = self.last_failure_time.write().await;
        *last_failure_time = Some(Instant::now());
        
        let mut half_open_requests = self.half_open_requests.write().await;
        *half_open_requests = 0;
        
        error!("Circuit breaker '{}' transitioned to OPEN", self.name);
    }
    
    /// Transition to half-open state
    async fn transition_to_half_open(&self) {
        let mut state = self.state.write().await;
        *state = CircuitState::HalfOpen;
        
        let mut half_open_requests = self.half_open_requests.write().await;
        *half_open_requests = 0;
        
        warn!("Circuit breaker '{}' transitioned to HALF_OPEN", self.name);
    }
    
    /// Get current state
    pub async fn state(&self) -> CircuitState {
        self.state.read().await.clone()
    }
    
    /// Get metrics
    pub async fn metrics(&self) -> CircuitBreakerMetrics {
        self.metrics.read().await.clone()
    }
    
    /// Force reset the circuit breaker
    pub async fn reset(&self) {
        self.transition_to_closed().await;
        
        let mut metrics = self.metrics.write().await;
        *metrics = CircuitBreakerMetrics::default();
        
        let mut last_failure_time = self.last_failure_time.write().await;
        *last_failure_time = None;
        
        info!("Circuit breaker '{}' reset", self.name);
    }
    
    /// Get name
    pub fn name(&self) -> &str {
        &self.name
    }
}

/// Circuit breaker registry
pub struct CircuitBreakerRegistry {
    breakers: Arc<RwLock<HashMap<String, Arc<CircuitBreaker>>>>,
}

impl CircuitBreakerRegistry {
    pub fn new() -> Self {
        Self {
            breakers: Arc::new(RwLock::new(HashMap::new())),
        }
    }
    
    /// Get or create a circuit breaker
    pub async fn get_breaker(&self, name: &str, config: CircuitBreakerConfig) -> Arc<CircuitBreaker> {
        let mut breakers = self.breakers.write().await;
        
        if let Some(breaker) = breakers.get(name) {
            breaker.clone()
        } else {
            let breaker = Arc::new(CircuitBreaker::new(name.to_string(), config));
            breakers.insert(name.to_string(), breaker.clone());
            breaker
        }
    }
    
    /// Get all circuit breakers
    pub async fn get_all_breakers(&self) -> Vec<(String, CircuitState, CircuitBreakerMetrics)> {
        let breakers = self.breakers.read().await;
        let mut result = Vec::new();
        
        for (name, breaker) in breakers.iter() {
            let state = breaker.state().await;
            let metrics = breaker.metrics().await;
            result.push((name.clone(), state, metrics));
        }
        
        result
    }
    
    /// Reset all circuit breakers
    pub async fn reset_all(&self) {
        let breakers = self.breakers.read().await;
        for breaker in breakers.values() {
            breaker.reset().await;
        }
    }
}

impl Default for CircuitBreakerRegistry {
    fn default() -> Self {
        Self::new()
    }
}

/// Global circuit breaker registry
static CIRCUIT_BREAKER_REGISTRY: std::sync::OnceLock<Arc<CircuitBreakerRegistry>> = std::sync::OnceLock::new();

/// Get global circuit breaker registry
pub fn get_circuit_breaker_registry() -> Arc<CircuitBreakerRegistry> {
    CIRCUIT_BREAKER_REGISTRY.get_or_init(|| Arc::new(CircuitBreakerRegistry::default())).clone()
}

/// Execute function with circuit breaker protection
pub async fn with_circuit_breaker<F, T, E>(
    name: &str,
    config: CircuitBreakerConfig,
    f: F,
) -> Result<T>
where
    F: std::future::Future<Output = Result<T, E>>,
    E: std::error::Error + Send + Sync + 'static,
{
    let registry = get_circuit_breaker_registry();
    let breaker = registry.get_breaker(name, config).await;
    breaker.execute(f).await
}

/// Execute function with circuit breaker protection and timeout
pub async fn with_circuit_breaker_timeout<F, T, E>(
    name: &str,
    config: CircuitBreakerConfig,
    f: F,
    timeout: Duration,
) -> Result<T>
where
    F: std::future::Future<Output = Result<T, E>>,
    E: std::error::Error + Send + Sync + 'static,
{
    let registry = get_circuit_breaker_registry();
    let breaker = registry.get_breaker(name, config).await;
    breaker.execute_with_timeout(f, timeout).await
}

/// Macro for easy circuit breaker usage
#[macro_export]
macro_rules! circuit_breaker {
    ($name:expr, $future:expr) => {
        $crate::circuit_breaker::with_circuit_breaker(
            $name,
            $crate::circuit_breaker::CircuitBreakerConfig::default(),
            $future,
        ).await
    };
    ($name:expr, $config:expr, $future:expr) => {
        $crate::circuit_breaker::with_circuit_breaker($name, $config, $future).await
    };
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[tokio::test]
    async fn test_circuit_breaker_basic_flow() -> Result<()> {
        let config = CircuitBreakerConfig {
            failure_threshold: 2,
            success_threshold: 1,
            timeout: Duration::from_millis(100),
            max_requests: 5,
        };
        
        let breaker = CircuitBreaker::new("test".to_string(), config);
        
        // Should start closed
        assert_eq!(breaker.state().await, CircuitState::Closed);
        
        // First failure should keep it closed
        let result = breaker.execute(async { Err::<(), _>(anyhow::anyhow!("test error")) }).await;
        assert!(result.is_err());
        assert_eq!(breaker.state().await, CircuitState::Closed);
        
        // Second failure should open it
        let result = breaker.execute(async { Err::<(), _>(anyhow::anyhow!("test error")) }).await;
        assert!(result.is_err());
        assert_eq!(breaker.state().await, CircuitState::Open);
        
        // Calls should fail fast when open
        let result = breaker.execute(async { Ok::<(), _>(()) }).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Circuit breaker"));
        
        Ok(())
    }
    
    #[tokio::test]
    async fn test_circuit_breaker_recovery() -> Result<()> {
        let config = CircuitBreakerConfig {
            failure_threshold: 1,
            success_threshold: 1,
            timeout: Duration::from_millis(50),
            max_requests: 5,
        };
        
        let breaker = CircuitBreaker::new("test".to_string(), config);
        
        // Fail to open circuit
        let _ = breaker.execute(async { Err::<(), _>(anyhow::anyhow!("test error")) }).await;
        assert_eq!(breaker.state().await, CircuitState::Open);
        
        // Wait for timeout
        tokio::time::sleep(Duration::from_millis(100)).await;
        
        // Success should close circuit
        let result = breaker.execute(async { Ok::<(), _>(()) }).await;
        assert!(result.is_ok());
        assert_eq!(breaker.state().await, CircuitState::Closed);
        
        Ok(())
    }
}
