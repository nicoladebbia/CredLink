//! Worklog and checkpoint management for C2 Concierge Retro-Sign

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{sqlite::SqliteConnectOptions, Row, SqlitePool};
use std::collections::HashSet;
use std::path::PathBuf;
use tracing::{debug, error, info};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorklogEntry {
    pub job_id: String,
    pub key: String,
    pub content_sha256: String,
    pub manifest_sha256: Option<String>,
    pub status: WorkStatus,
    pub error_code: Option<String>,
    pub attempt: i32,
    pub ts: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "text")]
pub enum WorkStatus {
    Queued,
    Hashed,
    Signed,
    Written,
    Skipped,
    Error,
}

pub struct Worklog {
    pool: SqlitePool,
}

impl Worklog {
    pub async fn new(checkpoint_path: &PathBuf) -> Result<Self> {
        // Ensure parent directory exists
        if let Some(parent) = checkpoint_path.parent() {
            tokio::fs::create_dir_all(parent).await
                .with_context(|| format!("Failed to create checkpoint directory: {:?}", parent))?;
        }
        
        // Create database connection
        let connect_options = SqliteConnectOptions::new()
            .filename(checkpoint_path)
            .create_if_missing(true);
        
        let pool = SqlitePool::connect_with(connect_options).await
            .with_context(|| "Failed to connect to checkpoint database")?;
        
        // Initialize schema
        sqlx::query(r#"
            CREATE TABLE IF NOT EXISTS worklog (
                job_id TEXT NOT NULL,
                key TEXT NOT NULL,
                content_sha256 TEXT NOT NULL,
                manifest_sha256 TEXT,
                status TEXT NOT NULL,
                error_code TEXT,
                attempt INTEGER NOT NULL DEFAULT 1,
                ts TEXT NOT NULL,
                PRIMARY KEY (job_id, key)
            )
        "#).execute(&pool).await?;
        
        sqlx::query(r#"
            CREATE INDEX IF NOT EXISTS idx_worklog_content_sha256 ON worklog(content_sha256)
        "#).execute(&pool).await?;
        
        sqlx::query(r#"
            CREATE INDEX IF NOT EXISTS idx_worklog_status ON worklog(status)
        "#).execute(&pool).await?;
        
        info!("Worklog initialized at {:?}", checkpoint_path);
        
        Ok(Self { pool })
    }
    
    pub async fn load(checkpoint_path: &PathBuf) -> Result<Self> {
        Self::new(checkpoint_path).await
    }
    
    pub async fn add_entry(&self, entry: WorklogEntry) -> Result<()> {
        sqlx::query(r#"
            INSERT OR REPLACE INTO worklog 
            (job_id, key, content_sha256, manifest_sha256, status, error_code, attempt, ts)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        "#)
        .bind(&entry.job_id)
        .bind(&entry.key)
        .bind(&entry.content_sha256)
        .bind(&entry.manifest_sha256)
        .bind(&entry.status.to_string())
        .bind(&entry.error_code)
        .bind(entry.attempt)
        .bind(entry.ts.to_rfc3339())
        .execute(&self.pool)
        .await
        .with_context(|| "Failed to add worklog entry")?;
        
        Ok(())
    }
    
    pub async fn update_entries(&self, entries: &[WorklogEntry]) -> Result<()> {
        let mut tx = self.pool.begin().await?;
        
        for entry in entries {
            sqlx::query(r#"
                INSERT OR REPLACE INTO worklog 
                (job_id, key, content_sha256, manifest_sha256, status, error_code, attempt, ts)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            "#)
            .bind(&entry.job_id)
            .bind(&entry.key)
            .bind(&entry.content_sha256)
            .bind(&entry.manifest_sha256)
            .bind(&entry.status.to_string())
            .bind(&entry.error_code)
            .bind(entry.attempt)
            .bind(entry.ts.to_rfc3339())
            .execute(&mut *tx)
            .await
            .with_context(|| format!("Failed to update worklog entry for key: {}", entry.key))?;
        }
        
        tx.commit().await
            .with_context(|| "Failed to commit worklog updates")?;
        
        debug!("Updated {} worklog entries", entries.len());
        Ok(())
    }
    
    pub async fn get_status(&self, key: &str) -> Result<Option<WorkStatus>> {
        let row = sqlx::query("SELECT status FROM worklog WHERE key = ?")
            .bind(key)
            .fetch_optional(&self.pool)
            .await?;
        
        Ok(row.map(|r| {
            let status_str: String = r.get("status");
            status_str.parse().unwrap_or(WorkStatus::Error)
        }))
    }
    
    pub async fn get_completed_keys(&self) -> Result<HashSet<String>> {
        let rows = sqlx::query("SELECT key FROM worklog WHERE status IN ('written', 'skipped')")
            .fetch_all(&self.pool)
            .await?;
        
        let keys: HashSet<String> = rows.into_iter()
            .map(|r| r.get("key"))
            .collect();
        
        Ok(keys)
    }
    
    pub async fn get_pending_keys(&self) -> Result<Vec<String>> {
        let rows = sqlx::query("SELECT key FROM worklog WHERE status = 'queued'")
            .fetch_all(&self.pool)
            .await?;
        
        let keys: Vec<String> = rows.into_iter()
            .map(|r| r.get("key"))
            .collect();
        
        Ok(keys)
    }
    
    pub async fn get_error_entries(&self) -> Result<Vec<WorklogEntry>> {
        let rows = sqlx::query(r#"
            SELECT job_id, key, content_sha256, manifest_sha256, status, error_code, attempt, ts
            FROM worklog WHERE status = 'error'
            ORDER BY ts DESC
        "#)
        .fetch_all(&self.pool)
        .await?;
        
        let entries: Vec<WorklogEntry> = rows.into_iter()
            .map(|r| WorklogEntry {
                job_id: r.get("job_id"),
                key: r.get("key"),
                content_sha256: r.get("content_sha256"),
                manifest_sha256: r.get("manifest_sha256"),
                status: r.get::<String, _>("status").parse().unwrap_or(WorkStatus::Error),
                error_code: r.get("error_code"),
                attempt: r.get("attempt"),
                ts: DateTime::parse_from_rfc3339(&r.get::<String, _>("ts"))
                    .unwrap_or_else(|_| DateTime::from_timestamp(0, 0).unwrap().into())
                    .with_timezone(&Utc),
            })
            .collect();
        
        Ok(entries)
    }
    
    pub async fn get_statistics(&self) -> Result<WorklogStats> {
        let row = sqlx::query(r#"
            SELECT 
                COUNT(*) as total,
                COUNT(CASE WHEN status = 'written' THEN 1 END) as written,
                COUNT(CASE WHEN status = 'skipped' THEN 1 END) as skipped,
                COUNT(CASE WHEN status = 'error' THEN 1 END) as error,
                COUNT(CASE WHEN status = 'queued' THEN 1 END) as queued
            FROM worklog
        "#)
        .fetch_one(&self.pool)
        .await?;
        
        Ok(WorklogStats {
            total: row.get("total"),
            written: row.get("written"),
            skipped: row.get("skipped"),
            error: row.get("error"),
            queued: row.get("queued"),
        })
    }
    
    pub async fn save(&self) -> Result<()> {
        // SQLite auto-saves, but we can force a checkpoint
        sqlx::query("PRAGMA wal_checkpoint(FULL)")
            .execute(&self.pool)
            .await?;
        
        Ok(())
    }
    
    pub async fn clear(&self) -> Result<()> {
        sqlx::query("DELETE FROM worklog")
            .execute(&self.pool)
            .await?;
        
        info!("Worklog cleared");
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorklogStats {
    pub total: i64,
    pub written: i64,
    pub skipped: i64,
    pub error: i64,
    pub queued: i64,
}

impl ToString for WorkStatus {
    fn to_string(&self) -> String {
        match self {
            WorkStatus::Queued => "queued".to_string(),
            WorkStatus::Hashed => "hashed".to_string(),
            WorkStatus::Signed => "signed".to_string(),
            WorkStatus::Written => "written".to_string(),
            WorkStatus::Skipped => "skipped".to_string(),
            WorkStatus::Error => "error".to_string(),
        }
    }
}

impl std::str::FromStr for WorkStatus {
    type Err = anyhow::Error;
    
    fn from_str(s: &str) -> Result<Self> {
        match s {
            "queued" => Ok(WorkStatus::Queued),
            "hashed" => Ok(WorkStatus::Hashed),
            "signed" => Ok(WorkStatus::Signed),
            "written" => Ok(WorkStatus::Written),
            "skipped" => Ok(WorkStatus::Skipped),
            "error" => Ok(WorkStatus::Error),
            _ => Err(anyhow::anyhow!("Invalid work status: {}", s)),
        }
    }
}

impl sqlx::encode::Encode<'_, sqlx::Sqlite> for WorkStatus {
    fn encode_by_ref(&self, buf: &mut Vec<sqlx::sqlite::SqliteArgumentValue<'_>>) -> sqlx::encode::IsNull {
        buf.push(sqlx::sqlite::SqliteArgumentValue::Text(self.to_string().into()));
        sqlx::encode::IsNull::No
    }
}

impl sqlx::decode::Decode<'_, sqlx::Sqlite> for WorkStatus {
    fn decode(value: sqlx::sqlite::SqliteValueRef<'_>) -> Result<Self, sqlx::error::BoxDynError> {
        let s: String = sqlx::decode::Decode::decode(value)?;
        s.parse().map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync>)
    }
}

impl sqlx::type_info::TypeInfo for WorkStatus {
    fn type_info() -> sqlx::sqlite::SqliteTypeInfo {
        <String as sqlx::type_info::TypeInfo>::type_info()
    }
}
