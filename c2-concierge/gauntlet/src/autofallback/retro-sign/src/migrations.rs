//! Database migrations for C2 Concierge Retro-Sign

use anyhow::Result;
use sqlx::{migrate::MigrateDatabase, Row, Sqlite, SqlitePool};
use std::collections::HashMap;
use tracing::{debug, info, warn};

/// Migration definition
pub struct Migration {
    pub version: i64,
    pub description: String,
    pub up_sql: String,
    pub down_sql: String,
}

/// Migration manager
pub struct MigrationManager {
    pool: SqlitePool,
    migrations: Vec<Migration>,
}

impl MigrationManager {
    pub fn new(pool: SqlitePool) -> Self {
        Self {
            pool,
            migrations: vec![
                Migration {
                    version: 1,
                    description: "Create initial schema".to_string(),
                    up_sql: r#"
                        CREATE TABLE IF NOT EXISTS checkpoints (
                            job_id TEXT PRIMARY KEY,
                            tenant_id TEXT NOT NULL,
                            created_at TEXT NOT NULL,
                            last_updated TEXT NOT NULL,
                            total_items INTEGER NOT NULL,
                            processed_items INTEGER NOT NULL DEFAULT 0,
                            failed_items INTEGER NOT NULL DEFAULT 0,
                            skipped_items INTEGER NOT NULL DEFAULT 0,
                            current_item_index INTEGER,
                            status TEXT NOT NULL DEFAULT 'running'
                        );

                        CREATE TABLE IF NOT EXISTS plan_items (
                            job_id TEXT NOT NULL,
                            item_index INTEGER NOT NULL,
                            item_data TEXT NOT NULL,
                            status TEXT NOT NULL DEFAULT 'pending',
                            PRIMARY KEY (job_id, item_index),
                            FOREIGN KEY (job_id) REFERENCES checkpoints(job_id)
                        );

                        CREATE INDEX IF NOT EXISTS idx_plan_items_status ON plan_items(status);

                        CREATE TABLE IF NOT EXISTS worklog (
                            id TEXT PRIMARY KEY,
                            job_id TEXT NOT NULL,
                            item_index INTEGER NOT NULL,
                            status TEXT NOT NULL,
                            started_at TEXT,
                            completed_at TEXT,
                            error_message TEXT,
                            metadata TEXT,
                            FOREIGN KEY (job_id) REFERENCES checkpoints(job_id)
                        );

                        CREATE INDEX IF NOT EXISTS idx_worklog_job_id ON worklog(job_id);
                        CREATE INDEX IF NOT EXISTS idx_worklog_status ON worklog(status);
                    "#.to_string(),
                    down_sql: r#"
                        DROP TABLE IF EXISTS worklog;
                        DROP TABLE IF EXISTS plan_items;
                        DROP TABLE IF EXISTS checkpoints;
                    "#.to_string(),
                },
                Migration {
                    version: 2,
                    description: "Add security audit table".to_string(),
                    up_sql: r#"
                        CREATE TABLE IF NOT EXISTS audit_events (
                            id TEXT PRIMARY KEY,
                            event_type TEXT NOT NULL,
                            category TEXT NOT NULL,
                            severity TEXT NOT NULL,
                            user_id TEXT,
                            resource TEXT,
                            action TEXT,
                            outcome TEXT NOT NULL,
                            timestamp TEXT NOT NULL,
                            metadata TEXT,
                            tenant_id TEXT NOT NULL
                        );

                        CREATE INDEX IF NOT EXISTS idx_audit_events_timestamp ON audit_events(timestamp);
                        CREATE INDEX IF NOT EXISTS idx_audit_events_user_id ON audit_events(user_id);
                        CREATE INDEX IF NOT EXISTS idx_audit_events_tenant_id ON audit_events(tenant_id);
                        CREATE INDEX IF NOT EXISTS idx_audit_events_severity ON audit_events(severity);
                    "#.to_string(),
                    down_sql: r#"
                        DROP TABLE IF EXISTS audit_events;
                    "#.to_string(),
                },
                Migration {
                    version: 3,
                    description: "Add performance metrics table".to_string(),
                    up_sql: r#"
                        CREATE TABLE IF NOT EXISTS performance_metrics (
                            id TEXT PRIMARY KEY,
                            metric_name TEXT NOT NULL,
                            metric_value REAL NOT NULL,
                            metric_type TEXT NOT NULL,
                            timestamp TEXT NOT NULL,
                            tags TEXT,
                            tenant_id TEXT NOT NULL
                        );

                        CREATE INDEX IF NOT EXISTS idx_performance_metrics_timestamp ON performance_metrics(timestamp);
                        CREATE INDEX IF NOT EXISTS idx_performance_metrics_name ON performance_metrics(metric_name);
                        CREATE INDEX IF NOT EXISTS idx_performance_metrics_tenant_id ON performance_metrics(tenant_id);
                    "#.to_string(),
                    down_sql: r#"
                        DROP TABLE IF EXISTS performance_metrics;
                    "#.to_string(),
                },
                Migration {
                    version: 4,
                    description: "Add user sessions table".to_string(),
                    up_sql: r#"
                        CREATE TABLE IF NOT EXISTS user_sessions (
                            session_id TEXT PRIMARY KEY,
                            user_id TEXT NOT NULL,
                            tenant_id TEXT NOT NULL,
                            created_at TEXT NOT NULL,
                            last_accessed TEXT NOT NULL,
                            expires_at TEXT NOT NULL,
                            is_active BOOLEAN NOT NULL DEFAULT TRUE,
                            metadata TEXT
                        );

                        CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
                        CREATE INDEX IF NOT EXISTS idx_user_sessions_tenant_id ON user_sessions(tenant_id);
                        CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);
                    "#.to_string(),
                    down_sql: r#"
                        DROP TABLE IF EXISTS user_sessions;
                    "#.to_string(),
                },
                Migration {
                    version: 5,
                    description: "Add encryption keys table".to_string(),
                    up_sql: r#"
                        CREATE TABLE IF NOT EXISTS encryption_keys (
                            key_id TEXT PRIMARY KEY,
                            key_algorithm TEXT NOT NULL,
                            key_size INTEGER NOT NULL,
                            encrypted_key_data BLOB NOT NULL,
                            nonce BLOB NOT NULL,
                            tag BLOB,
                            created_at TEXT NOT NULL,
                            expires_at TEXT,
                            status TEXT NOT NULL DEFAULT 'active',
                            tenant_id TEXT NOT NULL
                        );

                        CREATE INDEX IF NOT EXISTS idx_encryption_keys_tenant_id ON encryption_keys(tenant_id);
                        CREATE INDEX IF NOT EXISTS idx_encryption_keys_status ON encryption_keys(status);
                        CREATE INDEX IF NOT EXISTS idx_encryption_keys_expires_at ON encryption_keys(expires_at);
                    "#.to_string(),
                    down_sql: r#"
                        DROP TABLE IF EXISTS encryption_keys;
                    "#.to_string(),
                },
            ],
        }
    }
    
    /// Initialize migration system
    pub async fn initialize(&self) -> Result<()> {
        info!("Initializing migration system");
        
        // Create migration tracking table
        sqlx::query(r#"
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY,
                description TEXT NOT NULL,
                applied_at TEXT NOT NULL
            )
        "#).execute(&self.pool).await?;
        
        info!("Migration system initialized");
        Ok(())
    }
    
    /// Get current database version
    pub async fn current_version(&self) -> Result<i64> {
        let row = sqlx::query("SELECT MAX(version) as version FROM schema_migrations")
            .fetch_one(&self.pool)
            .await?;
        
        let version: Option<i64> = row.get("version");
        Ok(version.unwrap_or(0))
    }
    
    /// Get pending migrations
    pub async fn pending_migrations(&self) -> Result<Vec<&Migration>> {
        let current_version = self.current_version().await?;
        
        Ok(self.migrations
            .iter()
            .filter(|m| m.version > current_version)
            .collect())
    }
    
    /// Apply all pending migrations
    pub async fn migrate(&self) -> Result<()> {
        self.initialize().await?;
        
        let current_version = self.current_version().await?;
        let pending = self.pending_migrations().await?;
        
        if pending.is_empty() {
            info!("Database is up to date (version {})", current_version);
            return Ok(());
        }
        
        info!("Applying {} migrations (current: {}, target: {})", 
              pending.len(), 
              current_version,
              self.migrations.last().unwrap().version);
        
        for migration in pending {
            self.apply_migration(migration).await?;
        }
        
        info!("All migrations applied successfully");
        Ok(())
    }
    
    /// Apply a single migration
    pub async fn apply_migration(&self, migration: &Migration) -> Result<()> {
        info!("Applying migration {}: {}", migration.version, migration.description);
        
        let mut tx = self.pool.begin().await?;
        
        // Execute migration SQL
        for statement in migration.up_sql.split(';') {
            let statement = statement.trim();
            if !statement.is_empty() {
                sqlx::query(statement).execute(&mut *tx).await?;
            }
        }
        
        // Record migration
        sqlx::query(r#"
            INSERT INTO schema_migrations (version, description, applied_at)
            VALUES (?, ?, ?)
        "#)
        .bind(migration.version)
        .bind(&migration.description)
        .bind(chrono::Utc::now().to_rfc3339())
        .execute(&mut *tx)
        .await?;
        
        tx.commit().await?;
        
        info!("Migration {} applied successfully", migration.version);
        Ok(())
    }
    
    /// Rollback to specific version
    pub async fn rollback_to(&self, target_version: i64) -> Result<()> {
        let current_version = self.current_version().await?;
        
        if current_version <= target_version {
            info!("No rollback needed (current: {}, target: {})", current_version, target_version);
            return Ok(());
        }
        
        warn!("Rolling back from version {} to {}", current_version, target_version);
        
        // Get migrations to rollback
        let migrations_to_rollback: Vec<&Migration> = self.migrations
            .iter()
            .filter(|m| m.version > target_version && m.version <= current_version)
            .rev() // Rollback in reverse order
            .collect();
        
        for migration in migrations_to_rollback {
            self.rollback_migration(migration).await?;
        }
        
        warn!("Rollback completed to version {}", target_version);
        Ok(())
    }
    
    /// Rollback a single migration
    pub async fn rollback_migration(&self, migration: &Migration) -> Result<()> {
        warn!("Rolling back migration {}: {}", migration.version, migration.description);
        
        let mut tx = self.pool.begin().await?;
        
        // Execute rollback SQL
        for statement in migration.down_sql.split(';') {
            let statement = statement.trim();
            if !statement.is_empty() {
                sqlx::query(statement).execute(&mut *tx).await?;
            }
        }
        
        // Remove migration record
        sqlx::query("DELETE FROM schema_migrations WHERE version = ?")
            .bind(migration.version)
            .execute(&mut *tx)
            .await?;
        
        tx.commit().await?;
        
        warn!("Migration {} rolled back successfully", migration.version);
        Ok(())
    }
    
    /// Get migration status
    pub async fn status(&self) -> Result<MigrationStatus> {
        let current_version = self.current_version().await?;
        let pending = self.pending_migrations().await?;
        
        Ok(MigrationStatus {
            current_version,
            latest_version: self.migrations.last().map(|m| m.version).unwrap_or(0),
            pending_count: pending.len(),
            pending_migrations: pending.iter().map(|m| m.version).collect(),
        })
    }
}

/// Migration status
#[derive(Debug, Clone)]
pub struct MigrationStatus {
    pub current_version: i64,
    pub latest_version: i64,
    pub pending_count: usize,
    pub pending_migrations: Vec<i64>,
}

/// Initialize database with migrations
pub async fn initialize_database(database_url: &str) -> Result<SqlitePool> {
    info!("Initializing database: {}", database_url);
    
    // Create database if it doesn't exist
    if !Sqlite::database_exists(database_url).await? {
        Sqlite::create_database(database_url).await?;
        info!("Database created");
    }
    
    // Connect to database
    let pool = SqlitePool::connect(database_url).await?;
    
    // Run migrations
    let migration_manager = MigrationManager::new(pool.clone());
    migration_manager.migrate().await?;
    
    info!("Database initialized and migrated successfully");
    Ok(pool)
}

/// Get migration manager for existing pool
pub fn get_migration_manager(pool: SqlitePool) -> MigrationManager {
    MigrationManager::new(pool)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;
    
    #[tokio::test]
    async fn test_migration_flow() -> Result<()> {
        let temp_dir = tempdir()?;
        let db_path = temp_dir.path().join("test.db");
        let db_url = format!("sqlite:{}", db_path.display());
        
        // Initialize database
        let pool = initialize_database(&db_url).await?;
        
        // Check status
        let manager = get_migration_manager(pool.clone());
        let status = manager.status().await?;
        
        assert_eq!(status.current_version, 5);
        assert_eq!(status.pending_count, 0);
        
        Ok(())
    }
}
