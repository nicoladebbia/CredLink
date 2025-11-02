//! Checkpoint management for C2 Concierge Retro-Sign

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use sqlx::{sqlite::SqliteConnectOptions, Row, SqlitePool};
use std::collections::HashMap;
use std::path::PathBuf;
use tracing::{debug, info, warn};

use crate::planner::PlanItem;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CheckpointState {
    pub job_id: String,
    pub tenant_id: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub last_updated: chrono::DateTime<chrono::Utc>,
    pub total_items: usize,
    pub processed_items: usize,
    pub failed_items: usize,
    pub skipped_items: usize,
    pub current_item_index: Option<usize>,
    pub status: JobStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "text")]
pub enum JobStatus {
    Running,
    Paused,
    Completed,
    Failed,
    Cancelled,
}

pub struct CheckpointManager {
    pool: SqlitePool,
    checkpoint_path: PathBuf,
}

impl CheckpointManager {
    pub async fn new(config: &crate::config::CheckpointConfig) -> Result<Self> {
        // Ensure parent directory exists
        if let Some(parent) = config.path.parent() {
            tokio::fs::create_dir_all(parent).await
                .with_context(|| format!("Failed to create checkpoint directory: {:?}", parent))?;
        }
        
        // Create database connection
        let connect_options = SqliteConnectOptions::new()
            .filename(&config.path)
            .create_if_missing(true);
        
        let pool = SqlitePool::connect_with(connect_options).await
            .with_context(|| "Failed to connect to checkpoint database")?;
        
        // Initialize schema
        sqlx::query(r#"
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
            )
        "#).execute(&pool).await?;
        
        sqlx::query(r#"
            CREATE TABLE IF NOT EXISTS plan_items (
                job_id TEXT NOT NULL,
                item_index INTEGER NOT NULL,
                item_data TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                PRIMARY KEY (job_id, item_index),
                FOREIGN KEY (job_id) REFERENCES checkpoints(job_id)
            )
        "#).execute(&pool).await?;
        
        sqlx::query(r#"
            CREATE INDEX IF NOT EXISTS idx_plan_items_status ON plan_items(status)
        "#).execute(&pool).await?;
        
        info!("Checkpoint manager initialized at {:?}", config.path);
        
        Ok(Self {
            pool,
            checkpoint_path: config.path.clone(),
        })
    }
    
    pub async fn initialize(&mut self, plan_items: &[PlanItem]) -> Result<String> {
        let job_id = uuid::Uuid::new_v4().to_string();
        let tenant_id = "default".to_string(); // Will be set from args
        
        let now = chrono::Utc::now();
        
        // Create checkpoint state
        let checkpoint = CheckpointState {
            job_id: job_id.clone(),
            tenant_id,
            created_at: now,
            last_updated: now,
            total_items: plan_items.len(),
            processed_items: 0,
            failed_items: 0,
            skipped_items: 0,
            current_item_index: None,
            status: JobStatus::Running,
        };
        
        // Insert checkpoint
        sqlx::query(r#"
            INSERT INTO checkpoints 
            (job_id, tenant_id, created_at, last_updated, total_items, processed_items, failed_items, skipped_items, current_item_index, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#)
        .bind(&checkpoint.job_id)
        .bind(&checkpoint.tenant_id)
        .bind(checkpoint.created_at.to_rfc3339())
        .bind(checkpoint.last_updated.to_rfc3339())
        .bind(checkpoint.total_items as i64)
        .bind(checkpoint.processed_items as i64)
        .bind(checkpoint.failed_items as i64)
        .bind(checkpoint.skipped_items as i64)
        .bind(checkpoint.current_item_index)
        .bind(checkpoint.status.to_string())
        .execute(&self.pool)
        .await
        .with_context(|| "Failed to create checkpoint")?;
        
        // Store plan items
        for (index, item) in plan_items.iter().enumerate() {
            let item_data = serde_json::to_string(item)
                .with_context(|| "Failed to serialize plan item")?;
            
            sqlx::query(r#"
                INSERT INTO plan_items (job_id, item_index, item_data, status)
                VALUES (?, ?, ?, ?)
            "#)
            .bind(&job_id)
            .bind(index as i64)
            .bind(&item_data)
            .bind("pending")
            .execute(&self.pool)
            .await
            .with_context(|| "Failed to store plan item")?;
        }
        
        info!("Initialized checkpoint {} with {} items", job_id, plan_items.len());
        
        Ok(job_id)
    }
    
    pub async fn load_checkpoint_state(&self, job_id: &str) -> Result<Option<CheckpointState>> {
        let row = sqlx::query("SELECT * FROM checkpoints WHERE job_id = ?")
            .bind(job_id)
            .fetch_optional(&self.pool)
            .await?;
        
        Ok(row.map(|r| CheckpointState {
            job_id: r.get("job_id"),
            tenant_id: r.get("tenant_id"),
            created_at: chrono::DateTime::parse_from_rfc3339(&r.get::<String, _>("created_at"))
                .unwrap_or_else(|_| chrono::DateTime::from_timestamp(0, 0).unwrap().into())
                .with_timezone(&chrono::Utc),
            last_updated: chrono::DateTime::parse_from_rfc3339(&r.get::<String, _>("last_updated"))
                .unwrap_or_else(|_| chrono::DateTime::from_timestamp(0, 0).unwrap().into())
                .with_timezone(&chrono::Utc),
            total_items: r.get("total_items"),
            processed_items: r.get("processed_items"),
            failed_items: r.get("failed_items"),
            skipped_items: r.get("skipped_items"),
            current_item_index: r.get("current_item_index"),
            status: r.get::<String, _>("status").parse().unwrap_or(JobStatus::Failed),
        }))
    }
    
    pub async fn load_plan_items(&self) -> Result<Vec<PlanItem>> {
        // Get the most recent job
        let row = sqlx::query("SELECT job_id FROM checkpoints ORDER BY created_at DESC LIMIT 1")
            .fetch_one(&self.pool)
            .await
            .with_context(|| "No checkpoints found")?;
        
        let job_id: String = row.get("job_id");
        
        // Load plan items for this job
        let rows = sqlx::query("SELECT item_data FROM plan_items WHERE job_id = ? ORDER BY item_index")
            .bind(&job_id)
            .fetch_all(&self.pool)
            .await?;
        
        let mut items = Vec::new();
        
        for row in rows {
            let item_data: String = row.get("item_data");
            let item: PlanItem = serde_json::from_str(&item_data)
                .with_context(|| "Failed to deserialize plan item")?;
            items.push(item);
        }
        
        info!("Loaded {} plan items from checkpoint", items.len());
        
        Ok(items)
    }
    
    pub async fn update_progress(&self, job_id: &str, processed: usize, failed: usize, skipped: usize) -> Result<()> {
        sqlx::query(r#"
            UPDATE checkpoints 
            SET processed_items = ?, failed_items = ?, skipped_items = ?, last_updated = ?
            WHERE job_id = ?
        "#)
        .bind(processed as i64)
        .bind(failed as i64)
        .bind(skipped as i64)
        .bind(chrono::Utc::now().to_rfc3339())
        .bind(job_id)
        .execute(&self.pool)
        .await
        .with_context(|| "Failed to update checkpoint progress")?;
        
        debug!("Updated checkpoint progress: {} processed, {} failed, {} skipped", processed, failed, skipped);
        
        Ok(())
    }
    
    pub async fn mark_item_completed(&self, job_id: &str, item_index: usize) -> Result<()> {
        sqlx::query("UPDATE plan_items SET status = 'completed' WHERE job_id = ? AND item_index = ?")
            .bind(job_id)
            .bind(item_index as i64)
            .execute(&self.pool)
            .await
            .with_context(|| "Failed to mark item completed")?;
        
        Ok(())
    }
    
    pub async fn mark_item_failed(&self, job_id: &str, item_index: usize) -> Result<()> {
        sqlx::query("UPDATE plan_items SET status = 'failed' WHERE job_id = ? AND item_index = ?")
            .bind(job_id)
            .bind(item_index as i64)
            .execute(&self.pool)
            .await
            .with_context(|| "Failed to mark item failed")?;
        
        Ok(())
    }
    
    pub async fn get_pending_items(&self, job_id: &str) -> Result<Vec<(usize, PlanItem)>> {
        let rows = sqlx::query(r#"
            SELECT item_index, item_data FROM plan_items 
            WHERE job_id = ? AND status = 'pending' 
            ORDER BY item_index
        "#)
            .bind(job_id)
            .fetch_all(&self.pool)
            .await?;
        
        let mut items = Vec::new();
        
        for row in rows {
            let item_index: i64 = row.get("item_index");
            let item_data: String = row.get("item_data");
            let item: PlanItem = serde_json::from_str(&item_data)
                .with_context(|| "Failed to deserialize plan item")?;
            
            items.push((item_index as usize, item));
        }
        
        Ok(items)
    }
    
    pub async fn complete_job(&self, job_id: &str) -> Result<()> {
        sqlx::query(r#"
            UPDATE checkpoints 
            SET status = 'completed', last_updated = ?
            WHERE job_id = ?
        "#)
        .bind(chrono::Utc::now().to_rfc3339())
        .bind(job_id)
        .execute(&self.pool)
        .await
        .with_context(|| "Failed to complete job")?;
        
        info!("Marked job {} as completed", job_id);
        
        Ok(())
    }
    
    pub async fn fail_job(&self, job_id: &str, error_message: &str) -> Result<()> {
        sqlx::query(r#"
            UPDATE checkpoints 
            SET status = 'failed', last_updated = ?
            WHERE job_id = ?
        "#)
        .bind(chrono::Utc::now().to_rfc3339())
        .bind(job_id)
        .execute(&self.pool)
        .await
        .with_context(|| "Failed to fail job")?;
        
        warn!("Marked job {} as failed: {}", job_id, error_message);
        
        Ok(())
    }
    
    pub async fn list_jobs(&self) -> Result<Vec<CheckpointState>> {
        let rows = sqlx::query("SELECT * FROM checkpoints ORDER BY created_at DESC")
            .fetch_all(&self.pool)
            .await?;
        
        let mut jobs = Vec::new();
        
        for row in rows {
            jobs.push(CheckpointState {
                job_id: row.get("job_id"),
                tenant_id: row.get("tenant_id"),
                created_at: chrono::DateTime::parse_from_rfc3339(&row.get::<String, _>("created_at"))
                    .unwrap_or_else(|_| chrono::DateTime::from_timestamp(0, 0).unwrap().into())
                    .with_timezone(&chrono::Utc),
                last_updated: chrono::DateTime::parse_from_rfc3339(&row.get::<String, _>("last_updated"))
                    .unwrap_or_else(|_| chrono::DateTime::from_timestamp(0, 0).unwrap().into())
                    .with_timezone(&chrono::Utc),
                total_items: row.get("total_items"),
                processed_items: row.get("processed_items"),
                failed_items: row.get("failed_items"),
                skipped_items: row.get("skipped_items"),
                current_item_index: row.get("current_item_index"),
                status: row.get::<String, _>("status").parse().unwrap_or(JobStatus::Failed),
            });
        }
        
        Ok(jobs)
    }
    
    pub async fn cleanup_old_jobs(&self, older_than_days: u32) -> Result<usize> {
        let cutoff = chrono::Utc::now() - chrono::Duration::days(older_than_days as i64);
        
        // Delete old plan items
        let result = sqlx::query("DELETE FROM plan_items WHERE job_id IN (SELECT job_id FROM checkpoints WHERE created_at < ?)")
            .bind(cutoff.to_rfc3339())
            .execute(&self.pool)
            .await?;
        
        let deleted_items = result.rows_affected();
        
        // Delete old checkpoints
        let result = sqlx::query("DELETE FROM checkpoints WHERE created_at < ?")
            .bind(cutoff.to_rfc3339())
            .execute(&self.pool)
            .await?;
        
        let deleted_jobs = result.rows_affected();
        
        info!("Cleaned up {} old checkpoints and {} plan items", deleted_jobs, deleted_items);
        
        Ok(deleted_jobs)
    }
}

impl ToString for JobStatus {
    fn to_string(&self) -> String {
        match self {
            JobStatus::Running => "running".to_string(),
            JobStatus::Paused => "paused".to_string(),
            JobStatus::Completed => "completed".to_string(),
            JobStatus::Failed => "failed".to_string(),
            JobStatus::Cancelled => "cancelled".to_string(),
        }
    }
}

impl std::str::FromStr for JobStatus {
    type Err = anyhow::Error;
    
    fn from_str(s: &str) -> Result<Self> {
        match s {
            "running" => Ok(JobStatus::Running),
            "paused" => Ok(JobStatus::Paused),
            "completed" => Ok(JobStatus::Completed),
            "failed" => Ok(JobStatus::Failed),
            "cancelled" => Ok(JobStatus::Cancelled),
            _ => Err(anyhow::anyhow!("Invalid job status: {}", s)),
        }
    }
}
