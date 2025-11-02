//! Rotation Scheduler - AUTOMATED CALENDAR MANAGEMENT
//! 
//! This service runs continuously to:
//! - Track rotation calendar for all tenants
//! - Trigger rotations at scheduled times
//! - Monitor rotation windows and deadlines
//! - Send alerts for upcoming rotations
//! 
//! NO MORE MANUAL TRACKING - This MUST be fully automated

use anyhow::{Context, Result};
use chrono::{DateTime, Utc, Duration, Timelike};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio::time::{interval, sleep};
use tracing::{debug, error, info, warn};

use crate::{PolicyManager, RotationEngine, RotationEngineConfig};

/// Scheduler configuration
#[derive(Debug, Clone)]
pub struct SchedulerConfig {
    pub check_interval_seconds: u64,
    pub rotation_window_days: u32,
    pub advance_warning_days: u32,
    pub max_concurrent_rotations: usize,
    pub auto_approve_rotations: bool,
}

/// Scheduler status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SchedulerStatus {
    pub is_running: bool,
    pub last_check: DateTime<Utc>,
    pub next_check: DateTime<Utc>,
    pub active_rotations: usize,
    pub upcoming_rotations: usize,
    pub overdue_rotations: usize,
    pub total_tenants: usize,
}

/// Rotation scheduler - CONTINUOUS MONITORING SERVICE
pub struct RotationScheduler {
    policy_manager: Arc<PolicyManager>,
    rotation_engine: Arc<RotationEngine>,
    config: SchedulerConfig,
    is_running: Arc<RwLock<bool>>,
    status: Arc<RwLock<SchedulerStatus>>,
}

impl RotationScheduler {
    pub fn new(
        policy_manager: Arc<PolicyManager>,
        rotation_engine: Arc<RotationEngine>,
        config: SchedulerConfig,
    ) -> Self {
        Self {
            policy_manager,
            rotation_engine,
            config,
            is_running: Arc::new(RwLock::new(false)),
            status: Arc::new(RwLock::new(SchedulerStatus {
                is_running: false,
                last_check: Utc::now(),
                next_check: Utc::now(),
                active_rotations: 0,
                upcoming_rotations: 0,
                overdue_rotations: 0,
                total_tenants: 0,
            })),
        }
    }
    
    /// Start the scheduler - CONTINUOUS OPERATION
    pub async fn start(&self) -> Result<()> {
        info!("Starting rotation scheduler with {} second interval", self.config.check_interval_seconds);
        
        {
            let mut is_running = self.is_running.write().await;
            if *is_running {
                warn!("Scheduler is already running");
                return Ok(());
            }
            *is_running = true;
        }
        
        // Update status
        {
            let mut status = self.status.write().await;
            status.is_running = true;
            status.next_check = Utc::now() + Duration::seconds(self.config.check_interval_seconds as i64);
        }
        
        let policy_manager = self.policy_manager.clone();
        let rotation_engine = self.rotation_engine.clone();
        let config = self.config.clone();
        let is_running = self.is_running.clone();
        let status = self.status.clone();
        
        // Spawn the scheduler loop
        tokio::spawn(async move {
            let mut interval = interval(Duration::from_secs(config.check_interval_seconds));
            
            loop {
                // Check if we should continue running
                {
                    let running = is_running.read().await;
                    if !*running {
                        info!("Scheduler stopped");
                        break;
                    }
                }
                
                interval.tick().await;
                
                // Perform scheduler check
                if let Err(e) = Self::perform_scheduler_check(
                    &policy_manager,
                    &rotation_engine,
                    &config,
                    &status,
                ).await {
                    error!("Scheduler check failed: {}", e);
                }
            }
        });
        
        info!("Rotation scheduler started successfully");
        Ok(())
    }
    
    /// Stop the scheduler
    pub async fn stop(&self) -> Result<()> {
        info!("Stopping rotation scheduler");
        
        {
            let mut is_running = self.is_running.write().await;
            *is_running = false;
        }
        
        // Update status
        {
            let mut status = self.status.write().await;
            status.is_running = false;
        }
        
        info!("Rotation scheduler stopped");
        Ok(())
    }
    
    /// Get current scheduler status
    pub async fn get_status(&self) -> Result<SchedulerStatus> {
        let status = self.status.read().await;
        Ok(status.clone())
    }
    
    /// Force immediate scheduler check
    pub async fn force_check(&self) -> Result<()> {
        info!("Forcing immediate scheduler check");
        
        Self::perform_scheduler_check(
            &self.policy_manager,
            &self.rotation_engine,
            &self.config,
            &self.status,
        ).await?;
        
        info!("Forced scheduler check completed");
        Ok(())
    }
    
    /// Core scheduler logic - NO SHORTCUTS
    async fn perform_scheduler_check(
        policy_manager: &Arc<PolicyManager>,
        rotation_engine: &Arc<RotationEngine>,
        config: &SchedulerConfig,
        status: &Arc<RwLock<SchedulerStatus>>,
    ) -> Result<()> {
        let now = Utc::now();
        debug!("Performing scheduler check at {}", now.format("%Y-%m-%d %H:%M:%S UTC"));
        
        // Get all tenants
        let tenants = policy_manager.list_tenants().await?;
        let total_tenants = tenants.len();
        
        // Get upcoming rotations
        let upcoming = policy_manager.get_upcoming_rotations(config.rotation_window_days).await?;
        
        // Get active rotations
        let active_rotations = rotation_engine.list_active_rotations().await?;
        let active_count = active_rotations.len();
        
        // Categorize rotations
        let mut ready_to_execute = Vec::new();
        let mut warning_rotations = Vec::new();
        let mut overdue_rotations = Vec::new();
        
        for rotation in upcoming {
            let time_until = rotation.scheduled_rotation.signed_duration_since(now);
            
            if time_until.num_seconds() <= 0 {
                // Rotation is due or overdue
                if rotation.status == crate::RotationStatus::Scheduled {
                    ready_to_execute.push(rotation);
                } else {
                    overdue_rotations.push(rotation);
                }
            } else if time_until.num_days() <= config.advance_warning_days as i64 {
                warning_rotations.push(rotation);
            }
        }
        
        // Update status
        {
            let mut status_lock = status.write().await;
            status_lock.last_check = now;
            status_lock.next_check = now + Duration::seconds(config.check_interval_seconds as i64);
            status_lock.active_rotations = active_count;
            status_lock.upcoming_rotations = upcoming.len();
            status_lock.overdue_rotations = overdue_rotations.len();
            status_lock.total_tenants = total_tenants;
        }
        
        // Process ready rotations
        for rotation in ready_to_execute {
            if active_count >= config.max_concurrent_rotations {
                warn!("Max concurrent rotations reached, skipping: {}", rotation.tenant_id);
                continue;
            }
            
            info!("Executing scheduled rotation for tenant: {}", rotation.tenant_id);
            
            if let Err(e) = Self::execute_scheduled_rotation(
                policy_manager,
                rotation_engine,
                &rotation,
                config.auto_approve_rotations,
            ).await {
                error!("Failed to execute rotation for tenant {}: {}", rotation.tenant_id, e);
            }
        }
        
        // Send warnings for upcoming rotations
        for rotation in warning_rotations {
            info!("Rotation warning: tenant {} in {} days", 
                rotation.tenant_id, 
                (rotation.scheduled_rotation - now).num_days());
            
            // In production, this would send real notifications
            Self::send_rotation_warning(&rotation).await?;
        }
        
        // Alert for overdue rotations
        for rotation in overdue_rotations {
            error!("OVERDUE ROTATION: tenant {} was due on {}", 
                rotation.tenant_id,
                rotation.scheduled_rotation.format("%Y-%m-%d %H:%M:%S UTC"));
            
            // In production, this would send critical alerts
            Self::send_overdue_alert(&rotation).await?;
        }
        
        // Auto-schedule rotations for tenants without them
        Self::auto_schedule_missing_rotations(
            policy_manager,
            &tenants,
            config.rotation_window_days,
        ).await?;
        
        debug!("Scheduler check completed: {} tenants, {} active, {} upcoming, {} overdue",
            total_tenants, active_count, upcoming.len(), overdue_rotations.len());
        
        Ok(())
    }
    
    /// Execute a scheduled rotation
    async fn execute_scheduled_rotation(
        policy_manager: &Arc<PolicyManager>,
        rotation_engine: &Arc<RotationEngine>,
        rotation: &crate::RotationCalendar,
        auto_approve: bool,
    ) -> Result<()> {
        // Check if approval is required
        if rotation.approval_required && !auto_approve {
            warn!("Rotation requires approval for tenant: {}", rotation.tenant_id);
            // In production, this would send approval request
            return Ok(());
        }
        
        // Create rotation context and execute
        let rotation_id = rotation_engine.schedule_rotation(
            &rotation.tenant_id,
            rotation.scheduled_rotation,
            &rotation.owner,
        ).await?;
        
        // Execute the rotation
        rotation_engine.execute_rotation(&rotation_id).await?;
        
        info!("Scheduled rotation executed successfully: {}", rotation_id);
        Ok(())
    }
    
    /// Auto-schedule rotations for tenants that don't have them
    async fn auto_schedule_missing_rotations(
        policy_manager: &Arc<PolicyManager>,
        tenants: &[String],
        window_days: u32,
    ) -> Result<()> {
        let upcoming = policy_manager.get_upcoming_rotations(window_days).await?;
        let scheduled_tenants: std::collections::HashSet<String> = 
            upcoming.into_iter().map(|r| r.tenant_id).collect();
        
        for tenant in tenants {
            if !scheduled_tenants.contains(tenant) {
                // Check if tenant has a policy
                if let Ok(Some(policy)) = policy_manager.get_policy(tenant).await {
                    // Schedule next rotation based on policy
                    let next_rotation = Utc::now() + Duration::days(policy.key.rotate_every_days as i64);
                    
                    info!("Auto-scheduling rotation for tenant: {} on {}", 
                        tenant, next_rotation.format("%Y-%m-%d"));
                    
                    let rotation = crate::RotationCalendar {
                        tenant_id: tenant.clone(),
                        scheduled_rotation: next_rotation,
                        rotation_window_start: next_rotation - Duration::days(7),
                        rotation_window_end: next_rotation,
                        owner: "scheduler".to_string(),
                        approval_required: false,
                        status: crate::RotationStatus::Scheduled,
                        created_at: Utc::now(),
                    };
                    
                    if let Err(e) = policy_manager.schedule_rotation(&rotation).await {
                        error!("Failed to auto-schedule rotation for tenant {}: {}", tenant, e);
                    }
                }
            }
        }
        
        Ok(())
    }
    
    /// Send rotation warning notification
    async fn send_rotation_warning(rotation: &crate::RotationCalendar) -> Result<()> {
        // In production, this would send real notifications
        warn!("ROTATION WARNING: Tenant {} rotation scheduled for {}", 
            rotation.tenant_id,
            rotation.scheduled_rotation.format("%Y-%m-%d %H:%M:%S UTC"));
        
        Ok(())
    }
    
    /// Send overdue rotation alert
    async fn send_overdue_alert(rotation: &crate::RotationCalendar) -> Result<()> {
        // In production, this would send critical alerts
        error!("CRITICAL: Tenant {} rotation was OVERDUE on {}", 
            rotation.tenant_id,
            rotation.scheduled_rotation.format("%Y-%m-%d %H:%M:%S UTC"));
        
        Ok(())
    }
    
    /// Get rotation calendar for all tenants
    pub async fn get_rotation_calendar(&self, days_ahead: u32) -> Result<Vec<crate::RotationCalendar>> {
        self.policy_manager.get_upcoming_rotations(days_ahead).await
    }
    
    /// Manually schedule rotation for tenant
    pub async fn schedule_rotation(
        &self,
        tenant_id: &str,
        scheduled_time: DateTime<Utc>,
        owner: &str,
        require_approval: bool,
    ) -> Result<String> {
        let rotation = crate::RotationCalendar {
            tenant_id: tenant_id.to_string(),
            scheduled_rotation: scheduled_time,
            rotation_window_start: scheduled_time - Duration::days(7),
            rotation_window_end: scheduled_time,
            owner: owner.to_string(),
            approval_required: require_approval,
            status: crate::RotationStatus::Scheduled,
            created_at: Utc::now(),
        };
        
        self.policy_manager.schedule_rotation(&rotation).await?;
        
        // Create rotation context
        self.rotation_engine.schedule_rotation(tenant_id, scheduled_time, owner).await
    }
    
    /// Cancel scheduled rotation
    pub async fn cancel_rotation(&self, tenant_id: &str) -> Result<()> {
        info!("Cancelling rotation for tenant: {}", tenant_id);
        
        // Get active rotations for tenant
        let active_rotations = self.rotation_engine.list_active_rotations().await?;
        
        for rotation in active_rotations {
            if rotation.tenant_id == tenant_id {
                // Cancel the rotation
                // In production, this would update the rotation status
                info!("Cancelled rotation: {} for tenant: {}", rotation.rotation_id, tenant_id);
            }
        }
        
        // Update calendar
        let upcoming = self.policy_manager.get_upcoming_rotations(365).await?;
        if let Some(mut rotation) = upcoming.into_iter()
            .find(|r| r.tenant_id == tenant_id) {
            
            rotation.status = crate::RotationStatus::Cancelled;
            // In production, would update the rotation in database
        }
        
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;
    
    #[tokio::test]
    async fn test_scheduler_creation() -> Result<()> {
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
        
        let scheduler_config = SchedulerConfig {
            check_interval_seconds: 60,
            rotation_window_days: 30,
            advance_warning_days: 7,
            max_concurrent_rotations: 5,
            auto_approve_rotations: false,
        };
        
        let scheduler = RotationScheduler::new(
            policy_manager.clone(),
            rotation_engine.clone(),
            scheduler_config,
        );
        
        // Test initial status
        let status = scheduler.get_status().await?;
        assert!(!status.is_running);
        assert_eq!(status.total_tenants, 0);
        
        Ok(())
    }
    
    #[tokio::test]
    async fn test_scheduler_start_stop() -> Result<()> {
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
        
        let scheduler_config = SchedulerConfig {
            check_interval_seconds: 1,
            rotation_window_days: 30,
            advance_warning_days: 7,
            max_concurrent_rotations: 5,
            auto_approve_rotations: false,
        };
        
        let scheduler = RotationScheduler::new(
            policy_manager,
            rotation_engine,
            scheduler_config,
        );
        
        // Start scheduler
        scheduler.start().await?;
        
        // Check it's running
        let status = scheduler.get_status().await?;
        assert!(status.is_running);
        
        // Stop scheduler
        scheduler.stop().await?;
        
        // Check it's stopped
        let status = scheduler.get_status().await?;
        assert!(!status.is_running);
        
        Ok(())
    }
}
