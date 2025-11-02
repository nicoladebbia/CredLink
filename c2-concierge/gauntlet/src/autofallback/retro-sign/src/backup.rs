//! Backup and disaster recovery for C2 Concierge Retro-Sign

use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::sync::RwLock;
use tracing::{debug, error, info, warn};

/// Backup configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupConfig {
    pub backup_directory: PathBuf,
    pub retention_days: u32,
    pub compression_enabled: bool,
    pub encryption_enabled: bool,
    pub backup_interval: Duration,
    pub max_backup_size_mb: u64,
    pub include_databases: bool,
    pub include_logs: bool,
    pub include_config: bool,
}

impl Default for BackupConfig {
    fn default() -> Self {
        Self {
            backup_directory: PathBuf::from("./backups"),
            retention_days: 30,
            compression_enabled: true,
            encryption_enabled: true,
            backup_interval: Duration::from_secs(86400), // Daily
            max_backup_size_mb: 1024, // 1GB
            include_databases: true,
            include_logs: true,
            include_config: true,
        }
    }
}

/// Backup type
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum BackupType {
    Full,
    Incremental,
    Differential,
}

/// Backup metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupMetadata {
    pub id: String,
    pub backup_type: BackupType,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub size_bytes: u64,
    pub compressed_size_bytes: Option<u64>,
    pub encrypted: bool,
    pub checksum: String,
    pub files_backed_up: u32,
    pub source_paths: Vec<String>,
    pub parent_backup_id: Option<String>,
    pub description: String,
}

/// Backup status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum BackupStatus {
    Pending,
    InProgress,
    Completed,
    Failed,
    Corrupted,
}

/// Backup manager
pub struct BackupManager {
    config: BackupConfig,
    ongoing_backups: Arc<RwLock<HashMap<String, BackupStatus>>>,
    backup_history: Arc<RwLock<Vec<BackupMetadata>>>,
}

impl BackupManager {
    pub fn new(config: BackupConfig) -> Self {
        Self {
            config,
            ongoing_backups: Arc::new(RwLock::new(HashMap::new())),
            backup_history: Arc::new(RwLock::new(Vec::new())),
        }
    }
    
    /// Create a full backup
    pub async fn create_full_backup(&self, description: Option<String>) -> Result<String> {
        let backup_id = uuid::Uuid::new_v4().to_string();
        let description = description.unwrap_or_else(|| "Full backup".to_string());
        
        info!("Starting full backup: {}", backup_id);
        
        // Mark as in progress
        let mut ongoing = self.ongoing_backups.write().await;
        ongoing.insert(backup_id.clone(), BackupStatus::InProgress);
        drop(ongoing);
        
        let result = self.perform_backup(&backup_id, BackupType::Full, &description).await;
        
        // Update status
        let mut ongoing = self.ongoing_backups.write().await;
        match &result {
            Ok(_) => {
                ongoing.insert(backup_id.clone(), BackupStatus::Completed);
                info!("Full backup completed: {}", backup_id);
            }
            Err(e) => {
                ongoing.insert(backup_id.clone(), BackupStatus::Failed);
                error!("Full backup failed: {} - {}", backup_id, e);
            }
        }
        drop(ongoing);
        
        result
    }
    
    /// Create an incremental backup
    pub async fn create_incremental_backup(&self, parent_id: &str, description: Option<String>) -> Result<String> {
        // Verify parent backup exists
        let history = self.backup_history.read().await;
        if !history.iter().any(|b| b.id == parent_id) {
            return Err(anyhow::anyhow!("Parent backup not found: {}", parent_id));
        }
        drop(history);
        
        let backup_id = uuid::Uuid::new_v4().to_string();
        let description = description.unwrap_or_else(|| "Incremental backup".to_string());
        
        info!("Starting incremental backup: {} (parent: {})", backup_id, parent_id);
        
        // Mark as in progress
        let mut ongoing = self.ongoing_backups.write().await;
        ongoing.insert(backup_id.clone(), BackupStatus::InProgress);
        drop(ongoing);
        
        let result = self.perform_incremental_backup(&backup_id, parent_id, &description).await;
        
        // Update status
        let mut ongoing = self.ongoing_backups.write().await;
        match &result {
            Ok(_) => {
                ongoing.insert(backup_id.clone(), BackupStatus::Completed);
                info!("Incremental backup completed: {}", backup_id);
            }
            Err(e) => {
                ongoing.insert(backup_id.clone(), BackupStatus::Failed);
                error!("Incremental backup failed: {} - {}", backup_id, e);
            }
        }
        drop(ongoing);
        
        result
    }
    
    /// Restore from backup
    pub async fn restore_backup(&self, backup_id: &str, target_directory: &Path) -> Result<()> {
        info!("Starting restore from backup: {} to {:?}", backup_id, target_directory);
        
        // Verify backup exists and is valid
        let history = self.backup_history.read().await;
        let backup_metadata = history.iter()
            .find(|b| b.id == backup_id)
            .ok_or_else(|| anyhow::anyhow!("Backup not found: {}", backup_id))?;
        drop(history);
        
        // Perform restore
        self.perform_restore(backup_metadata, target_directory).await?;
        
        info!("Restore completed: {}", backup_id);
        Ok(())
    }
    
    /// Perform the actual backup
    async fn perform_backup(&self, backup_id: &str, backup_type: BackupType, description: &str) -> Result<String> {
        let backup_start = SystemTime::now();
        
        // Create backup directory
        let backup_path = self.config.backup_directory.join(backup_id);
        tokio::fs::create_dir_all(&backup_path).await?;
        
        let mut files_backed_up = 0;
        let mut total_size = 0;
        let mut source_paths = Vec::new();
        
        // Backup databases
        if self.config.include_databases {
            let db_paths = self.backup_databases(&backup_path).await?;
            files_backed_up += db_paths.len() as u32;
            source_paths.extend(db_paths);
        }
        
        // Backup logs
        if self.config.include_logs {
            let log_paths = self.backup_logs(&backup_path).await?;
            files_backed_up += log_paths.len() as u32;
            source_paths.extend(log_paths);
        }
        
        // Backup configuration
        if self.config.include_config {
            let config_paths = self.backup_config(&backup_path).await?;
            files_backed_up += config_paths.len() as u32;
            source_paths.extend(config_paths);
        }
        
        // Calculate total size
        total_size = self.calculate_directory_size(&backup_path).await?;
        
        // Compress if enabled
        let compressed_size = if self.config.compression_enabled {
            Some(self.compress_backup(&backup_path).await?)
        } else {
            None
        };
        
        // Encrypt if enabled
        if self.config.encryption_enabled {
            self.encrypt_backup(&backup_path).await?;
        }
        
        // Calculate checksum
        let checksum = self.calculate_checksum(&backup_path).await?;
        
        // Create metadata
        let metadata = BackupMetadata {
            id: backup_id.to_string(),
            backup_type,
            created_at: chrono::Utc::now(),
            size_bytes: total_size,
            compressed_size_bytes: compressed_size,
            encrypted: self.config.encryption_enabled,
            checksum,
            files_backed_up,
            source_paths,
            parent_backup_id: None,
            description: description.to_string(),
        };
        
        // Save metadata
        self.save_backup_metadata(&metadata).await?;
        
        // Add to history
        let mut history = self.backup_history.write().await;
        history.push(metadata);
        history.sort_by(|a, b| b.created_at.cmp(&a.created_at)); // Keep newest first
        drop(history);
        
        // Clean up old backups
        self.cleanup_old_backups().await?;
        
        let backup_duration = backup_start.duration_since(UNIX_EPOCH)?.as_secs();
        info!("Backup {} completed in {} seconds", backup_id, backup_duration);
        
        Ok(backup_id.to_string())
    }
    
    /// Perform incremental backup
    async fn perform_incremental_backup(&self, backup_id: &str, parent_id: &str, description: &str) -> Result<String> {
        // For simplicity, implement as full backup for now
        // In a real implementation, this would compare with parent and only backup changes
        warn!("Incremental backup not fully implemented, falling back to full backup");
        self.perform_backup(backup_id, BackupType::Incremental, description).await
    }
    
    /// Perform restore
    async fn perform_restore(&self, metadata: &BackupMetadata, target_directory: &Path) -> Result<()> {
        // Create target directory
        tokio::fs::create_dir_all(target_directory).await?;
        
        let backup_path = self.config.backup_directory.join(&metadata.id);
        
        // Decrypt if needed
        if metadata.encrypted {
            self.decrypt_backup(&backup_path).await?;
        }
        
        // Decompress if needed
        if metadata.compressed_size_bytes.is_some() {
            self.decompress_backup(&backup_path).await?;
        }
        
        // Verify checksum
        let current_checksum = self.calculate_checksum(&backup_path).await?;
        if current_checksum != metadata.checksum {
            return Err(anyhow::anyhow!("Backup checksum mismatch - backup may be corrupted"));
        }
        
        // Copy files to target directory
        self.copy_backup_files(&backup_path, target_directory).await?;
        
        info!("Restore completed successfully");
        Ok(())
    }
    
    /// Backup databases
    async fn backup_databases(&self, backup_path: &Path) -> Result<Vec<String>> {
        let mut backed_up_paths = Vec::new();
        
        // Find database files
        let db_files = vec![
            ".state/c2c-checkpoint.sqlite",
            // Add more database files as needed
        ];
        
        for db_file in db_files {
            let source_path = Path::new(db_file);
            if source_path.exists() {
                let target_path = backup_path.join("databases").join(source_path.file_name().unwrap());
                tokio::fs::create_dir_all(target_path.parent().unwrap()).await?;
                tokio::fs::copy(source_path, &target_path).await?;
                backed_up_paths.push(db_file.to_string());
                debug!("Backed up database: {}", db_file);
            }
        }
        
        Ok(backed_up_paths)
    }
    
    /// Backup logs
    async fn backup_logs(&self, backup_path: &Path) -> Result<Vec<String>> {
        let mut backed_up_paths = Vec::new();
        
        // Find log files
        let log_dirs = vec!["logs", "./logs"];
        
        for log_dir in log_dirs {
            let source_path = Path::new(log_dir);
            if source_path.exists() {
                let target_path = backup_path.join("logs");
                self.copy_directory(source_path, &target_path).await?;
                backed_up_paths.push(log_dir.to_string());
                debug!("Backed up logs: {}", log_dir);
            }
        }
        
        Ok(backed_up_paths)
    }
    
    /// Backup configuration
    async fn backup_config(&self, backup_path: &Path) -> Result<Vec<String>> {
        let mut backed_up_paths = Vec::new();
        
        // Find config files
        let config_files = vec![
            "Cargo.toml",
            ".env.example",
            "config/",
            "prometheus.yml",
        ];
        
        for config_file in config_files {
            let source_path = Path::new(config_file);
            if source_path.exists() {
                let target_path = backup_path.join("config").join(source_path.file_name().unwrap());
                tokio::fs::create_dir_all(target_path.parent().unwrap()).await?;
                
                if source_path.is_dir() {
                    self.copy_directory(source_path, &target_path).await?;
                } else {
                    tokio::fs::copy(source_path, &target_path).await?;
                }
                
                backed_up_paths.push(config_file.to_string());
                debug!("Backed up config: {}", config_file);
            }
        }
        
        Ok(backed_up_paths)
    }
    
    /// Compress backup
    async fn compress_backup(&self, backup_path: &Path) -> Result<u64> {
        let original_size = self.calculate_directory_size(backup_path).await?;
        
        // Create compressed archive
        let archive_path = backup_path.with_extension("tar.gz");
        
        // Use tar command for compression (in a real implementation, use a Rust library)
        let output = tokio::process::Command::new("tar")
            .arg("-czf")
            .arg(&archive_path)
            .arg("-C")
            .arg(backup_path.parent().unwrap())
            .arg(backup_path.file_name().unwrap())
            .output()
            .await?;
        
        if !output.status.success() {
            return Err(anyhow::anyhow!("Compression failed: {}", String::from_utf8_lossy(&output.stderr)));
        }
        
        // Remove original directory
        tokio::fs::remove_dir_all(backup_path).await?;
        tokio::fs::rename(&archive_path, backup_path).await?;
        
        let compressed_size = self.calculate_directory_size(backup_path).await?;
        info!("Backup compressed: {} -> {} bytes", original_size, compressed_size);
        
        Ok(compressed_size)
    }
    
    /// Encrypt backup
    async fn encrypt_backup(&self, backup_path: &Path) -> Result<()> {
        // In a real implementation, this would use proper encryption
        // For now, just mark as encrypted
        debug!("Backup encryption not implemented");
        Ok(())
    }
    
    /// Decrypt backup
    async fn decrypt_backup(&self, backup_path: &Path) -> Result<()> {
        // In a real implementation, this would use proper decryption
        debug!("Backup decryption not implemented");
        Ok(())
    }
    
    /// Decompress backup
    async fn decompress_backup(&self, backup_path: &Path) -> Result<()> {
        // Use tar command for decompression
        let output = tokio::process::Command::new("tar")
            .arg("-xzf")
            .arg(backup_path)
            .arg("-C")
            .arg(backup_path.parent().unwrap())
            .output()
            .await?;
        
        if !output.status.success() {
            return Err(anyhow::anyhow!("Decompression failed: {}", String::from_utf8_lossy(&output.stderr)));
        }
        
        Ok(())
    }
    
    /// Calculate directory size
    async fn calculate_directory_size(&self, path: &Path) -> Result<u64> {
        let mut total_size = 0;
        let mut entries = tokio::fs::read_dir(path).await?;
        
        while let Some(entry) = entries.next_entry().await? {
            let metadata = entry.metadata().await?;
            if metadata.is_file() {
                total_size += metadata.len();
            } else if metadata.is_dir() {
                total_size += self.calculate_directory_size(&entry.path()).await?;
            }
        }
        
        Ok(total_size)
    }
    
    /// Calculate checksum
    async fn calculate_checksum(&self, path: &Path) -> Result<String> {
        use sha2::{Sha256, Digest};
        
        let mut hasher = Sha256::new();
        self.hash_directory(path, &mut hasher).await?;
        Ok(format!("{:x}", hasher.finalize()))
    }
    
    /// Hash directory contents
    async fn hash_directory(&self, path: &Path, hasher: &mut Sha256) -> Result<()> {
        let mut entries = tokio::fs::read_dir(path).await?;
        
        while let Some(entry) = entries.next_entry().await? {
            let metadata = entry.metadata().await?;
            
            if metadata.is_file() {
                let contents = tokio::fs::read(&entry.path()).await?;
                hasher.update(&contents);
                hasher.update(entry.path().to_string_lossy().as_bytes());
            } else if metadata.is_dir() {
                self.hash_directory(&entry.path(), hasher).await?;
            }
        }
        
        Ok(())
    }
    
    /// Copy directory recursively
    async fn copy_directory(&self, source: &Path, target: &Path) -> Result<()> {
        tokio::fs::create_dir_all(target).await?;
        let mut entries = tokio::fs::read_dir(source).await?;
        
        while let Some(entry) = entries.next_entry().await? {
            let source_path = entry.path();
            let target_path = target.join(entry.file_name());
            
            if source_path.is_dir() {
                self.copy_directory(&source_path, &target_path).await?;
            } else {
                tokio::fs::copy(&source_path, &target_path).await?;
            }
        }
        
        Ok(())
    }
    
    /// Copy backup files during restore
    async fn copy_backup_files(&self, source: &Path, target: &Path) -> Result<()> {
        self.copy_directory(source, target).await?;
        Ok(())
    }
    
    /// Save backup metadata
    async fn save_backup_metadata(&self, metadata: &BackupMetadata) -> Result<()> {
        let metadata_path = self.config.backup_directory
            .join(&metadata.id)
            .join("backup_metadata.json");
        
        let metadata_json = serde_json::to_string_pretty(metadata)?;
        tokio::fs::write(metadata_path, metadata_json).await?;
        
        Ok(())
    }
    
    /// Clean up old backups based on retention policy
    async fn cleanup_old_backups(&self) -> Result<()> {
        let cutoff_date = chrono::Utc::now() - chrono::Duration::days(self.config.retention_days as i64);
        
        let mut history = self.backup_history.write().await;
        let mut to_remove = Vec::new();
        
        for (i, backup) in history.iter().enumerate() {
            if backup.created_at < cutoff_date {
                to_remove.push(i);
            }
        }
        
        // Remove from history (reverse order to maintain indices)
        for &i in to_remove.iter().rev() {
            let backup = history.remove(i);
            
            // Remove backup files
            let backup_path = self.config.backup_directory.join(&backup.id);
            if let Err(e) = tokio::fs::remove_dir_all(&backup_path).await {
                warn!("Failed to remove backup directory {:?}: {}", backup_path, e);
            }
            
            info!("Removed old backup: {} (created: {})", backup.id, backup.created_at);
        }
        
        drop(history);
        
        Ok(())
    }
    
    /// Get backup history
    pub async fn get_backup_history(&self) -> Vec<BackupMetadata> {
        self.backup_history.read().await.clone()
    }
    
    /// Get backup status
    pub async fn get_backup_status(&self, backup_id: &str) -> Option<BackupStatus> {
        let ongoing = self.ongoing_backups.read().await;
        ongoing.get(backup_id).cloned()
    }
    
    /// List available backups
    pub async fn list_backups(&self) -> Vec<&BackupMetadata> {
        self.backup_history.read().await.iter().collect()
    }
}

/// Global backup manager instance
static BACKUP_MANAGER: std::sync::OnceLock<Arc<BackupManager>> = std::sync::OnceLock::new();

/// Get global backup manager
pub fn get_backup_manager() -> Option<Arc<BackupManager>> {
    BACKUP_MANAGER.get().cloned()
}

/// Initialize backup manager
pub async fn init_backup_manager(config: BackupConfig) -> Result<()> {
    // Create backup directory
    tokio::fs::create_dir_all(&config.backup_directory).await?;
    
    let manager = Arc::new(BackupManager::new(config));
    
    // Start automatic backup task
    let manager_clone = manager.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(manager_clone.config.backup_interval);
        
        loop {
            interval.tick().await;
            if let Err(e) = manager_clone.create_full_backup(None).await {
                error!("Automatic backup failed: {}", e);
            }
        }
    });
    
    // Store the manager
    let _ = BACKUP_MANAGER.set(manager);
    
    info!("Backup manager initialized");
    Ok(())
}

/// Create backup with default manager
pub async fn create_backup(description: Option<String>) -> Result<String> {
    let manager = get_backup_manager().ok_or_else(|| anyhow::anyhow!("Backup manager not initialized"))?;
    manager.create_full_backup(description).await
}

/// Restore from backup with default manager
pub async fn restore_backup(backup_id: &str, target_directory: &Path) -> Result<()> {
    let manager = get_backup_manager().ok_or_else(|| anyhow::anyhow!("Backup manager not initialized"))?;
    manager.restore_backup(backup_id, target_directory).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;
    
    #[tokio::test]
    async fn test_backup_creation() -> Result<()> {
        let temp_dir = tempdir()?;
        let config = BackupConfig {
            backup_directory: temp_dir.path().join("backups"),
            retention_days: 7,
            compression_enabled: false, // Disable for simplicity in tests
            encryption_enabled: false,
            backup_interval: Duration::from_secs(3600),
            max_backup_size_mb: 100,
            include_databases: false, // Disable for simplicity
            include_logs: false,
            include_config: false,
        };
        
        let manager = BackupManager::new(config);
        
        // Create a test file to backup
        let test_file = temp_dir.path().join("test.txt");
        tokio::fs::write(&test_file, "test content").await?;
        
        let backup_id = manager.create_full_backup(Some("Test backup".to_string())).await?;
        
        assert!(!backup_id.is_empty());
        
        let history = manager.get_backup_history().await;
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].id, backup_id);
        
        Ok(())
    }
}
