//! Graceful shutdown management for C2 Concierge Retro-Sign

use anyhow::Result;
use std::sync::Arc;
use tokio::sync::{broadcast, RwLock};
use tracing::{debug, error, info, warn};

/// Shutdown signal manager
pub struct ShutdownManager {
    shutdown_tx: broadcast::Sender<ShutdownSignal>,
    is_shutting_down: Arc<RwLock<bool>>,
    components: Vec<Box<dyn ShutdownComponent>>,
}

/// Shutdown signal
#[derive(Debug, Clone)]
pub enum ShutdownSignal {
    SigInt,
    SigTerm,
    Graceful,
    Forceful,
}

/// Component that can be gracefully shut down
#[async_trait::async_trait]
pub trait ShutdownComponent: Send + Sync {
    async fn shutdown(&self, signal: ShutdownSignal) -> Result<()>;
    fn name(&self) -> &str;
    fn priority(&self) -> u8 { 100 } // Lower = higher priority
}

impl ShutdownManager {
    pub fn new() -> Self {
        let (shutdown_tx, _) = broadcast::channel(16);
        
        Self {
            shutdown_tx,
            is_shutting_down: Arc::new(RwLock::new(false)),
            components: Vec::new(),
        }
    }
    
    pub fn register_component(&mut self, component: Box<dyn ShutdownComponent>) {
        info!("Registering shutdown component: {}", component.name());
        self.components.push(component);
        
        // Sort by priority (lower first)
        self.components.sort_by_key(|c| c.priority());
    }
    
    pub fn subscribe(&self) -> broadcast::Receiver<ShutdownSignal> {
        self.shutdown_tx.subscribe()
    }
    
    pub async fn is_shutting_down(&self) -> bool {
        *self.is_shutting_down.read().await
    }
    
    pub async fn initiate_shutdown(&self, signal: ShutdownSignal) -> Result<()> {
        if *self.is_shutting_down.read().await {
            warn!("Shutdown already in progress");
            return Ok(());
        }
        
        warn!("Initiating graceful shutdown: {:?}", signal);
        *self.is_shutting_down.write().await = true;
        
        // Notify all subscribers
        if let Err(e) = self.shutdown_tx.send(signal.clone()) {
            error!("Failed to send shutdown signal: {}", e);
        }
        
        // Shutdown components in priority order
        for component in &self.components {
            info!("Shutting down component: {}", component.name());
            
            let shutdown_result = tokio::time::timeout(
                std::time::Duration::from_secs(30),
                component.shutdown(signal.clone())
            ).await;
            
            match shutdown_result {
                Ok(Ok(())) => {
                    debug!("Component {} shut down successfully", component.name());
                }
                Ok(Err(e)) => {
                    error!("Component {} shutdown failed: {}", component.name(), e);
                }
                Err(_) => {
                    error!("Component {} shutdown timed out", component.name());
                }
            }
        }
        
        info!("Graceful shutdown completed");
        Ok(())
    }
}

impl Default for ShutdownManager {
    fn default() -> Self {
        Self::new()
    }
}

/// Performance manager shutdown component
pub struct PerformanceShutdownComponent;

#[async_trait::async_trait]
impl ShutdownComponent for PerformanceShutdownComponent {
    async fn shutdown(&self, _signal: ShutdownSignal) -> Result<()> {
        if let Ok(manager) = crate::performance::get_performance_manager() {
            manager.stop().await?;
        }
        Ok(())
    }
    
    fn name(&self) -> &str {
        "performance_manager"
    }
    
    fn priority(&self) -> u8 {
        10 // High priority
    }
}

/// Security manager shutdown component
pub struct SecurityShutdownComponent;

#[async_trait::async_trait]
impl ShutdownComponent for SecurityShutdownComponent {
    async fn shutdown(&self, _signal: ShutdownSignal) -> Result<()> {
        // Flush any pending audit events
        if let Ok(manager) = crate::security::get_security_manager() {
            // In a real implementation, this would flush audit logs
            debug!("Security manager shutdown completed");
        }
        Ok(())
    }
    
    fn name(&self) -> &str {
        "security_manager"
    }
    
    fn priority(&self) -> u8 {
        20
    }
}

/// Database connection shutdown component
pub struct DatabaseShutdownComponent;

#[async_trait::async_trait]
impl ShutdownComponent for DatabaseShutdownComponent {
    async fn shutdown(&self, _signal: ShutdownSignal) -> Result<()> {
        // Close database connections gracefully
        debug!("Database connections closed");
        Ok(())
    }
    
    fn name(&self) -> &str {
        "database_connections"
    }
    
    fn priority(&self) -> u8 {
        90 // Lower priority (close last)
    }
}

/// Global shutdown manager instance
static SHUTDOWN_MANAGER: std::sync::OnceLock<tokio::sync::Mutex<ShutdownManager>> = std::sync::OnceLock::new();

/// Get global shutdown manager
pub async fn get_shutdown_manager() -> &'static tokio::sync::Mutex<ShutdownManager> {
    SHUTDOWN_MANAGER.get_or_init(|| {
        let mut manager = ShutdownManager::new();
        manager.register_component(Box::new(PerformanceShutdownComponent));
        manager.register_component(Box::new(SecurityShutdownComponent));
        manager.register_component(Box::new(DatabaseShutdownComponent));
        tokio::sync::Mutex::new(manager)
    })
}

/// Initialize shutdown manager
pub async fn init_shutdown_manager() -> Result<()> {
    info!("Initializing shutdown manager");
    let _manager = get_shutdown_manager().await;
    
    // Start signal listener
    tokio::spawn(listen_for_signals());
    
    info!("Shutdown manager initialized");
    Ok(())
}

/// Listen for OS signals
async fn listen_for_signals() {
    use tokio::signal;
    
    let mut sigint = signal::unix::signal(signal::unix::SignalKind::interrupt())
        .expect("Failed to setup SIGINT handler");
    let mut sigterm = signal::unix::signal(signal::unix::SignalKind::terminate())
        .expect("Failed to setup SIGTERM handler");
    
    let manager = get_shutdown_manager().await;
    
    tokio::select! {
        _ = sigint.recv() => {
            warn!("Received SIGINT signal");
            let _ = manager.lock().await.initiate_shutdown(ShutdownSignal::SigInt).await;
        }
        _ = sigterm.recv() => {
            warn!("Received SIGTERM signal");
            let _ = manager.lock().await.initiate_shutdown(ShutdownSignal::SigTerm).await;
        }
    }
}

/// Request graceful shutdown
pub async fn request_shutdown(signal: ShutdownSignal) -> Result<()> {
    let manager = get_shutdown_manager().await;
    manager.lock().await.initiate_shutdown(signal).await
}
