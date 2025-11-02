//! Performance Connection Pool - ENTERPRISE POOLING
//! 
//! Advanced connection pooling for database and external services
//! Intelligent pool management with health checks and scaling
//! 

use anyhow::Result;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::{RwLock, Semaphore};
use tracing::{debug, info, warn, error};
use sqlx;

/// Generic connection pool manager
pub struct ConnectionPool<T> {
    connections: Arc<RwLock<Vec<PooledConnection<T>>>>,
    available: Arc<Semaphore>,
    config: PoolConfig,
    stats: Arc<RwLock<PoolStats>>,
    factory: Arc<dyn ConnectionFactory<T>>,
}

/// Pool configuration
#[derive(Debug, Clone)]
pub struct PoolConfig {
    pub max_size: usize,
    pub min_size: usize,
    pub connection_timeout: Duration,
    pub idle_timeout: Duration,
    pub health_check_interval: Duration,
    pub max_lifetime: Duration,
    pub health_check_enabled: bool,
}

/// Pooled connection wrapper
#[derive(Debug)]
pub struct PooledConnection<T> {
    pub connection: T,
    pub created_at: Instant,
    pub last_used: Instant,
    pub is_healthy: bool,
    pub use_count: u64,
}

/// Connection factory trait
pub trait ConnectionFactory<T>: Send + Sync {
    fn create_connection(&self) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<T>> + Send>>;
    fn validate_connection(&self, connection: &T) -> std::pin::Pin<Box<dyn std::future::Future<Output = bool> + Send>>;
    fn destroy_connection(&self, connection: T) -> std::pin::Pin<Box<dyn std::future::Future<Output = ()> + Send>>;
}

/// Pool statistics
#[derive(Debug, Clone, Default)]
pub struct PoolStats {
    pub total_connections: usize,
    pub active_connections: usize,
    pub idle_connections: usize,
    pub created_count: u64,
    pub destroyed_count: u64,
    pub acquired_count: u64,
    pub released_count: u64,
    pub health_check_failures: u64,
    pub timeouts: u64,
}

impl<T> ConnectionPool<T>
where
    T: Send + Sync + 'static,
{
    pub fn new<F>(config: PoolConfig, factory: F) -> Self
    where
        F: ConnectionFactory<T> + 'static,
    {
        Self {
            connections: Arc::new(RwLock::new(Vec::new())),
            available: Arc::new(Semaphore::new(config.max_size)),
            config,
            stats: Arc::new(RwLock::new(PoolStats::default())),
            factory: Arc::new(factory),
        }
    }
    
    /// Initialize the pool with minimum connections
    pub async fn initialize(&self) -> Result<()> {
        let mut connections = self.connections.write().await;
        
        for _ in 0..self.config.min_size {
            match self.factory.create_connection().await {
                Ok(conn) => {
                    let pooled = PooledConnection {
                        connection: conn,
                        created_at: Instant::now(),
                        last_used: Instant::now(),
                        is_healthy: true,
                        use_count: 0,
                    };
                    connections.push(pooled);
                    
                    let mut stats = self.stats.write().await;
                    stats.created_count += 1;
                    stats.total_connections += 1;
                    stats.idle_connections += 1;
                }
                Err(e) => {
                    warn!("Failed to create initial connection: {}", e);
                }
            }
        }
        
        info!("Connection pool initialized with {} connections", self.config.min_size);
        
        // Start health check task if enabled
        if self.config.health_check_enabled {
            self.start_health_check_task().await;
        }
        
        Ok(())
    }
    
    /// Acquire a connection from the pool
    pub async fn acquire(&self) -> Result<PooledConnectionHandle<T>> {
        let _permit = tokio::time::timeout(
            self.config.connection_timeout,
            self.available.acquire()
        ).await;
        
        if _permit.is_err() {
            let mut stats = self.stats.write().await;
            stats.timeouts += 1;
            return Err(anyhow::anyhow!("Connection acquisition timeout"));
        }
        
        let permit = _permit.ok_or_else(|| anyhow::anyhow!("Failed to acquire permit"))?;
        
        // Try to get an existing connection
        let mut connections = self.connections.write().await;
        let mut connection = None;
        
        // Find a healthy, idle connection
        for i in 0..connections.len() {
            if connections[i].is_healthy {
                connection = Some(connections.swap_remove(i));
                break;
            }
        }
        
        // Create new connection if needed
        if connection.is_none() {
            match self.factory.create_connection().await {
                Ok(conn) => {
                    connection = Some(PooledConnection {
                        connection: conn,
                        created_at: Instant::now(),
                        last_used: Instant::now(),
                        is_healthy: true,
                        use_count: 0,
                    });
                    
                    let mut stats = self.stats.write().await;
                    stats.created_count += 1;
                }
                Err(e) => {
                    warn!("Failed to create new connection: {}", e);
                    return Err(e);
                }
            }
        }
        
        let mut conn = connection.ok_or_else(|| anyhow::anyhow!("No connection available"))?;
        conn.use_count += 1;
        conn.last_used = Instant::now();
        
        let mut stats = self.stats.write().await;
        stats.acquired_count += 1;
        stats.active_connections += 1;
        stats.idle_connections = stats.total_connections.saturating_sub(stats.active_connections);
        
        Ok(PooledConnectionHandle {
            connection: Some(conn),
            pool: self,
            permit: Some(permit),
        })
    }
    
    /// Release a connection back to the pool
    async fn release_connection(&self, mut connection: PooledConnection<T>) -> Result<()> {
        // Validate connection before returning to pool
        if !self.factory.validate_connection(&connection.connection).await {
            connection.is_healthy = false;
        }
        
        let mut connections = self.connections.write().await;
        
        if connection.is_healthy {
            connections.push(connection);
            
            let mut stats = self.stats.write().await;
            stats.released_count += 1;
            stats.active_connections = stats.active_connections.saturating_sub(1);
            stats.idle_connections = stats.total_connections.saturating_sub(stats.active_connections);
        } else {
            // Destroy unhealthy connection
            self.factory.destroy_connection(connection.connection).await;
            
            let mut stats = self.stats.write().await;
            stats.destroyed_count += 1;
            stats.total_connections = stats.total_connections.saturating_sub(1);
        }
        
        Ok(())
    }
    
    /// Get pool statistics
    pub async fn get_stats(&self) -> PoolStats {
        let stats = self.stats.read().await;
        stats.clone()
    }
    
    /// Get pool size
    pub async fn size(&self) -> usize {
        let connections = self.connections.read().await;
        connections.len()
    }
    
    /// Close the pool and destroy all connections
    pub async fn close(&self) -> Result<()> {
        let mut connections = self.connections.write().await;
        
        for conn in connections.drain(..) {
            self.factory.destroy_connection(conn.connection).await;
        }
        
        info!("Connection pool closed");
        Ok(())
    }
    
    /// Start health check task
    async fn start_health_check_task(&self) {
        let connections = Arc::clone(&self.connections);
        let factory = Arc::clone(&self.factory);
        let stats = Arc::clone(&self.stats);
        let health_check_interval = self.config.health_check_interval;
        
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(health_check_interval);
            
            loop {
                interval.tick().await;
                
                let mut conns = connections.write().await;
                let mut to_remove = Vec::new();
                
                for (i, conn) in conns.iter_mut().enumerate() {
                    // Check if connection is too old
                    if conn.created_at.elapsed() > Duration::from_secs(3600) {
                        to_remove.push(i);
                        continue;
                    }
                    
                    // Health check
                    if !factory.validate_connection(&conn.connection).await {
                        conn.is_healthy = false;
                        to_remove.push(i);
                        
                        let mut stats = stats.write().await;
                        stats.health_check_failures += 1;
                    }
                }
                
                // Remove unhealthy connections
                for &i in to_remove.iter().rev() {
                    let mut conn = conns.swap_remove(i);
                    factory.destroy_connection(conn.connection).await;
                    
                    let mut stats = stats.write().await;
                    stats.destroyed_count += 1;
                    stats.total_connections = stats.total_connections.saturating_sub(1);
                }
            }
        });
    }
}

/// Handle for a pooled connection
pub struct PooledConnectionHandle<T> {
    connection: Option<PooledConnection<T>>,
    pool: Arc<ConnectionPool<T>>,
    permit: Option<tokio::sync::SemaphorePermit<'static>>,
}

impl<T> PooledConnectionHandle<T> {
    /// Get reference to the underlying connection
    pub fn connection(&self) -> &T {
        &self.connection.as_ref().unwrap().connection
    }
    
    /// Get mutable reference to the underlying connection
    pub fn connection_mut(&mut self) -> &mut T {
        &mut self.connection.as_mut().unwrap().connection
    }
}

impl<T> Drop for PooledConnectionHandle<T> {
    fn drop(&mut self) {
        if let Some(conn) = self.connection.take() {
            let pool = Arc::clone(&self.pool);
            tokio::spawn(async move {
                let _ = pool.release_connection(conn).await;
            });
        }
    }
}

/// Database connection pool factory
pub struct DatabaseConnectionFactory {
    pub database_url: String,
}

impl ConnectionFactory<sqlx::Pool<sqlx::Sqlite>> for DatabaseConnectionFactory {
    fn create_connection(&self) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<sqlx::Pool<sqlx::Sqlite>>> + Send>> {
        let url = self.database_url.clone();
        Box::pin(async move {
            let pool = sqlx::SqlitePool::connect(&url).await?;
            Ok(pool)
        })
    }
    
    fn validate_connection(&self, connection: &sqlx::Pool<sqlx::Sqlite>) -> std::pin::Pin<Box<dyn std::future::Future<Output = bool> + Send>> {
        let pool = connection.clone();
        Box::pin(async move {
            sqlx::query("SELECT 1")
                .fetch_one(&pool)
                .await
                .is_ok()
        })
    }
    
    fn destroy_connection(&self, connection: sqlx::Pool<sqlx::Sqlite>) -> std::pin::Pin<Box<dyn std::future::Future<Output = ()> + Send>> {
        Box::pin(async move {
            let _ = connection.close().await;
        })
    }
}

/// HTTP client connection pool factory
pub struct HttpConnectionFactory {
    pub base_url: String,
}

impl ConnectionFactory<reqwest::Client> for HttpConnectionFactory {
    fn create_connection(&self) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<reqwest::Client>> + Send>> {
        let base_url = self.base_url.clone();
        Box::pin(async move {
            let client = reqwest::Client::builder()
                .timeout(Duration::from_secs(30))
                .build()?;
            Ok(client)
        })
    }
    
    fn validate_connection(&self, connection: &reqwest::Client) -> std::pin::Pin<Box<dyn std::future::Future<Output = bool> + Send>> {
        let client = connection.clone();
        let base_url = self.base_url.clone();
        Box::pin(async move {
            client.get(&format!("{}/health", base_url))
                .send()
                .await
                .is_ok()
        })
    }
    
    fn destroy_connection(&self, _connection: reqwest::Client) -> std::pin::Pin<Box<dyn std::future::Future<Output = ()> + Send>> {
        Box::pin(async move {
            // HTTP clients don't need explicit cleanup
        })
    }
}

impl Default for PoolConfig {
    fn default() -> Self {
        Self {
            max_size: 20,
            min_size: 5,
            connection_timeout: Duration::from_secs(30),
            idle_timeout: Duration::from_secs(300),
            health_check_interval: Duration::from_secs(60),
            max_lifetime: Duration::from_secs(3600),
            health_check_enabled: true,
        }
    }
}

impl Default for PoolStats {
    fn default() -> Self {
        Self {
            total_connections: 0,
            active_connections: 0,
            idle_connections: 0,
            created_count: 0,
            destroyed_count: 0,
            acquired_count: 0,
            released_count: 0,
            health_check_failures: 0,
            timeouts: 0,
        }
    }
}
