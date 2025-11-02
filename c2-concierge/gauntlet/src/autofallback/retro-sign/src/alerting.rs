//! Alerting and notification system for C2 Concierge Retro-Sign

use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::{RwLock, broadcast};
use tracing::{debug, error, info, warn};

/// Alert severity levels
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum AlertSeverity {
    Debug,
    Info,
    Warning,
    Error,
    Critical,
}

/// Alert status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AlertStatus {
    Active,
    Acknowledged,
    Resolved,
    Suppressed,
}

/// Alert definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Alert {
    pub id: String,
    pub title: String,
    pub description: String,
    pub severity: AlertSeverity,
    pub status: AlertStatus,
    pub source: String,
    pub category: String,
    pub timestamp: chrono::DateTime<chrono::Utc>,
    pub acknowledged_at: Option<chrono::DateTime<chrono::Utc>>,
    pub resolved_at: Option<chrono::DateTime<chrono::Utc>>,
    pub metadata: HashMap<String, String>,
    pub fingerprint: String,
}

/// Alert rule configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlertRule {
    pub name: String,
    pub description: String,
    pub condition: AlertCondition,
    pub severity: AlertSeverity,
    pub cooldown: Duration,
    pub enabled: bool,
    pub notification_channels: Vec<String>,
}

/// Alert condition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AlertCondition {
    Threshold {
        metric: String,
        operator: ComparisonOperator,
        value: f64,
        duration: Duration,
    },
    Rate {
        metric: String,
        operator: ComparisonOperator,
        value: f64,
        window: Duration,
    },
    Absence {
        metric: String,
        duration: Duration,
    },
    Pattern {
        log_pattern: String,
        count_threshold: u32,
        window: Duration,
    },
}

/// Comparison operators
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ComparisonOperator {
    GreaterThan,
    LessThan,
    Equal,
    GreaterThanOrEqual,
    LessThanOrEqual,
}

/// Notification channel
#[derive(Debug, Clone)]
pub enum NotificationChannel {
    Email { recipients: Vec<String> },
    Slack { webhook_url: String, channel: String },
    Webhook { url: String, headers: HashMap<String, String> },
    Log { level: AlertSeverity },
}

/// Alert manager
pub struct AlertManager {
    alerts: Arc<RwLock<HashMap<String, Alert>>>,
    rules: Arc<RwLock<HashMap<String, AlertRule>>>,
    channels: Arc<RwLock<HashMap<String, NotificationChannel>>>,
    alert_tx: broadcast::Sender<Alert>,
    last_fired: Arc<RwLock<HashMap<String, Instant>>>,
}

impl AlertManager {
    pub fn new() -> Self {
        let (alert_tx, _) = broadcast::channel(1000);
        
        Self {
            alerts: Arc::new(RwLock::new(HashMap::new())),
            rules: Arc::new(RwLock::new(HashMap::new())),
            channels: Arc::new(RwLock::new(HashMap::new())),
            alert_tx,
            last_fired: Arc::new(RwLock::new(HashMap::new())),
        }
    }
    
    pub fn subscribe(&self) -> broadcast::Receiver<Alert> {
        self.alert_tx.subscribe()
    }
    
    /// Fire an alert
    pub async fn fire_alert(&self, mut alert: Alert) -> Result<()> {
        // Generate ID if not present
        if alert.id.is_empty() {
            alert.id = uuid::Uuid::new_v4().to_string();
        }
        
        // Generate fingerprint if not present
        if alert.fingerprint.is_empty() {
            alert.fingerprint = self.generate_fingerprint(&alert);
        }
        
        // Check for existing alert with same fingerprint
        let mut alerts = self.alerts.write().await;
        if let Some(existing) = alerts.get_mut(&alert.fingerprint) {
            // Update existing alert if severity is higher
            if alert.severity > existing.severity {
                existing.severity = alert.severity;
                existing.description = alert.description;
                existing.timestamp = alert.timestamp;
                existing.status = AlertStatus::Active;
            }
            return Ok(());
        }
        
        // Add new alert
        alert.status = AlertStatus::Active;
        alerts.insert(alert.fingerprint.clone(), alert.clone());
        drop(alerts);
        
        // Send notification
        self.send_notifications(&alert).await?;
        
        // Broadcast alert
        let _ = self.alert_tx.send(alert.clone());
        
        error!("ALERT FIRED: [{}] {} - {}", 
               alert.severity, alert.title, alert.description);
        
        Ok(())
    }
    
    /// Acknowledge an alert
    pub async fn acknowledge_alert(&self, alert_id: &str) -> Result<()> {
        let mut alerts = self.alerts.write().await;
        
        // Find alert by ID or fingerprint
        for alert in alerts.values_mut() {
            if alert.id == alert_id || alert.fingerprint == alert_id {
                alert.status = AlertStatus::Acknowledged;
                alert.acknowledged_at = Some(chrono::Utc::now());
                info!("Alert acknowledged: {}", alert.title);
                return Ok(());
            }
        }
        
        Err(anyhow::anyhow!("Alert not found: {}", alert_id))
    }
    
    /// Resolve an alert
    pub async fn resolve_alert(&self, alert_id: &str) -> Result<()> {
        let mut alerts = self.alerts.write().await;
        
        // Find alert by ID or fingerprint
        for alert in alerts.values_mut() {
            if alert.id == alert_id || alert.fingerprint == alert_id {
                alert.status = AlertStatus::Resolved;
                alert.resolved_at = Some(chrono::Utc::now());
                info!("Alert resolved: {}", alert.title);
                return Ok(());
            }
        }
        
        Err(anyhow::anyhow!("Alert not found: {}", alert_id))
    }
    
    /// Add alert rule
    pub async fn add_rule(&self, rule: AlertRule) -> Result<()> {
        let mut rules = self.rules.write().await;
        rules.insert(rule.name.clone(), rule);
        info!("Alert rule added: {}", rule.name);
        Ok(())
    }
    
    /// Add notification channel
    pub async fn add_channel(&self, name: String, channel: NotificationChannel) -> Result<()> {
        let mut channels = self.channels.write().await;
        channels.insert(name, channel);
        info!("Notification channel added: {}", name);
        Ok(())
    }
    
    /// Get active alerts
    pub async fn get_active_alerts(&self) -> Result<Vec<Alert>> {
        let alerts = self.alerts.read().await;
        Ok(alerts
            .values()
            .filter(|a| matches!(a.status, AlertStatus::Active))
            .cloned()
            .collect())
    }
    
    /// Get alerts by severity
    pub async fn get_alerts_by_severity(&self, severity: AlertSeverity) -> Result<Vec<Alert>> {
        let alerts = self.alerts.read().await;
        Ok(alerts
            .values()
            .filter(|a| a.severity == severity)
            .cloned()
            .collect())
    }
    
    /// Clean up old resolved alerts
    pub async fn cleanup_old_alerts(&self, max_age: Duration) -> Result<usize> {
        let cutoff = chrono::Utc::now() - chrono::Duration::from_std(max_age)?;
        
        let mut alerts = self.alerts.write().await;
        let initial_count = alerts.len();
        
        alerts.retain(|_, alert| {
            !matches!(alert.status, AlertStatus::Resolved) 
            || alert.resolved_at.map_or(true, |t| t > cutoff)
        });
        
        let cleaned_count = initial_count - alerts.len();
        if cleaned_count > 0 {
            info!("Cleaned up {} old alerts", cleaned_count);
        }
        
        Ok(cleaned_count)
    }
    
    /// Generate fingerprint for alert deduplication
    fn generate_fingerprint(&self, alert: &Alert) -> String {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};
        
        let mut hasher = DefaultHasher::new();
        alert.source.hash(&mut hasher);
        alert.category.hash(&mut hasher);
        alert.title.hash(&mut hasher);
        
        // Include key metadata fields
        let mut metadata_keys: Vec<_> = alert.metadata.keys().collect();
        metadata_keys.sort();
        for key in metadata_keys {
            key.hash(&mut hasher);
            alert.metadata.get(key).unwrap().hash(&mut hasher);
        }
        
        format!("{:x}", hasher.finish())
    }
    
    /// Send notifications for alert
    async fn send_notifications(&self, alert: &Alert) -> Result<()> {
        let channels = self.channels.read().await;
        
        for (name, channel) in channels.iter() {
            if let Err(e) = self.send_notification(channel, alert).await {
                warn!("Failed to send notification via {}: {}", name, e);
            }
        }
        
        Ok(())
    }
    
    /// Send notification via specific channel
    async fn send_notification(&self, channel: &NotificationChannel, alert: &Alert) -> Result<()> {
        match channel {
            NotificationChannel::Email { recipients } => {
                // In a real implementation, this would send emails
                debug!("Email notification sent to {:?}: {}", recipients, alert.title);
            }
            NotificationChannel::Slack { webhook_url, channel: slack_channel } => {
                // In a real implementation, this would send to Slack
                debug!("Slack notification sent to {}: {}", slack_channel, alert.title);
                let _ = webhook_url; // Suppress unused warning
            }
            NotificationChannel::Webhook { url, headers } => {
                // In a real implementation, this would send HTTP webhook
                debug!("Webhook notification sent to {}: {}", url, alert.title);
                let _ = headers; // Suppress unused warning
            }
            NotificationChannel::Log { level } => {
                match level {
                    AlertSeverity::Debug => debug!("ALERT: {}", alert.title),
                    AlertSeverity::Info => info!("ALERT: {}", alert.title),
                    AlertSeverity::Warning => warn!("ALERT: {}", alert.title),
                    AlertSeverity::Error => error!("ALERT: {}", alert.title),
                    AlertSeverity::Critical => error!("CRITICAL ALERT: {}", alert.title),
                }
            }
        }
        
        Ok(())
    }
}

impl Default for AlertManager {
    fn default() -> Self {
        Self::new()
    }
}

/// Alert builder for easy alert creation
pub struct AlertBuilder {
    alert: Alert,
}

impl AlertBuilder {
    pub fn new(title: &str) -> Self {
        Self {
            alert: Alert {
                id: String::new(),
                title: title.to_string(),
                description: String::new(),
                severity: AlertSeverity::Info,
                status: AlertStatus::Active,
                source: "c2c-retro-sign".to_string(),
                category: "system".to_string(),
                timestamp: chrono::Utc::now(),
                acknowledged_at: None,
                resolved_at: None,
                metadata: HashMap::new(),
                fingerprint: String::new(),
            },
        }
    }
    
    pub fn description(mut self, description: &str) -> Self {
        self.alert.description = description.to_string();
        self
    }
    
    pub fn severity(mut self, severity: AlertSeverity) -> Self {
        self.alert.severity = severity;
        self
    }
    
    pub fn source(mut self, source: &str) -> Self {
        self.alert.source = source.to_string();
        self
    }
    
    pub fn category(mut self, category: &str) -> Self {
        self.alert.category = category.to_string();
        self
    }
    
    pub fn metadata(mut self, key: &str, value: &str) -> Self {
        self.alert.metadata.insert(key.to_string(), value.to_string());
        self
    }
    
    pub fn build(self) -> Alert {
        self.alert
    }
}

/// Global alert manager instance
static ALERT_MANAGER: std::sync::OnceLock<Arc<AlertManager>> = std::sync::OnceLock::new();

/// Get global alert manager
pub fn get_alert_manager() -> Arc<AlertManager> {
    ALERT_MANAGER.get_or_init(|| Arc::new(AlertManager::default())).clone()
}

/// Initialize alert manager
pub async fn init_alert_manager() -> Result<()> {
    let manager = get_alert_manager();
    
    // Add default notification channel (log)
    manager.add_channel(
        "default".to_string(),
        NotificationChannel::Log { level: AlertSeverity::Warning }
    ).await?;
    
    // Start cleanup task
    let manager_clone = manager.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(3600)); // Every hour
        
        loop {
            interval.tick().await;
            if let Err(e) = manager_clone.cleanup_old_alerts(Duration::from_secs(86400 * 7)).await {
                error!("Failed to cleanup old alerts: {}", e);
            }
        }
    });
    
    info!("Alert manager initialized");
    Ok(())
}

/// Fire alert with builder pattern
pub async fn fire_alert<F>(builder_fn: F) -> Result<()>
where
    F: FnOnce(AlertBuilder) -> Alert,
{
    let manager = get_alert_manager();
    let alert = builder_fn(AlertBuilder::new(""));
    manager.fire_alert(alert).await
}

/// Macro for easy alert firing
#[macro_export]
macro_rules! alert {
    ($title:expr, $severity:expr) => {
        $crate::alerting::fire_alert(|builder| {
            builder.title($title).severity($severity)
        }).await
    };
    ($title:expr, $severity:expr, $description:expr) => {
        $crate::alerting::fire_alert(|builder| {
            builder
                .title($title)
                .severity($severity)
                .description($description)
        }).await
    };
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[tokio::test]
    async fn test_alert_firing() -> Result<()> {
        let manager = AlertManager::new();
        
        let alert = AlertBuilder::new("Test Alert")
            .description("This is a test alert")
            .severity(AlertSeverity::Warning)
            .build();
        
        manager.fire_alert(alert).await?;
        
        let active_alerts = manager.get_active_alerts().await?;
        assert_eq!(active_alerts.len(), 1);
        
        Ok(())
    }
    
    #[tokio::test]
    async fn test_alert_acknowledgment() -> Result<()> {
        let manager = AlertManager::new();
        
        let alert = AlertBuilder::new("Test Alert")
            .description("This is a test alert")
            .severity(AlertSeverity::Warning)
            .build();
        
        let alert_id = alert.id.clone();
        manager.fire_alert(alert).await?;
        
        manager.acknowledge_alert(&alert_id).await?;
        
        let active_alerts = manager.get_active_alerts().await?;
        assert_eq!(active_alerts.len(), 0); // No active alerts after acknowledgment
        
        Ok(())
    }
}
