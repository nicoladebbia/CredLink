//! Key Custody Control Plane
//! 
//! Provides management of signing keys, policies, rotation, and evidence generation

use anyhow::{Context, Result};
use chrono::{DateTime, Utc, Duration};
use serde::{Deserialize, Serialize};
use sqlx::{Pool, Sqlite, SqlitePool};
use std::collections::HashMap;
use tracing::{debug, error, info, warn};
use uuid::Uuid;

// Modules
pub mod rep_generator;
pub mod rotation_engine;
pub mod rotation_scheduler;
pub mod incident_engine;
pub mod incident_monitor;

/// Signing policy per tenant
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SigningPolicy {
    pub tenant_id: String,
    pub algorithm: String, // "ES256" for P-256
    pub tsa_profile: String, // std|low-latency|cheap
    pub assertions_allow: Vec<String>,
    pub assertions_deny: Vec<String>,
    pub embed_allowed_origins: Vec<String>,
    pub key: KeyConfig,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub policy_hash: String, // SHA-256 of canonical policy JSON
}

/// Key configuration within policy
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyConfig {
    pub key_type: KeyType, // hsm|kms
    pub provider: String, // yubihsm2|vault|aws-kms|gcp-kms
    pub handle: String, // HSM slot or KMS key id/arn
    pub cert_chain: Vec<String>,
    pub not_before: DateTime<Utc>,
    pub not_after: DateTime<Utc>,
    pub rotate_every_days: u32,
    pub max_issuance_per_24h: u32,
    pub sign_enabled: bool,
}

/// Key custody types
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum KeyType {
    HSM,
    KMS,
    Software,
}

/// Rotation calendar entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RotationCalendar {
    pub tenant_id: String,
    pub scheduled_rotation: DateTime<Utc>,
    pub rotation_window_start: DateTime<Utc>, // T-7 days
    pub rotation_window_end: DateTime<Utc>,   // T-0 days
    pub owner: String,
    pub approval_required: bool,
    pub status: RotationStatus,
    pub created_at: DateTime<Utc>,
}

/// Rotation status
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum RotationStatus {
    Scheduled,
    InProgress,
    Completed,
    Failed,
    Cancelled,
}

/// Rotation Evidence Pack (REP) metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RotationEvidencePack {
    pub tenant_id: String,
    pub rotation_date: DateTime<Utc>,
    pub pack_id: String,
    pub files: Vec<EvidenceFile>,
    pub pack_hash: String, // SHA-256 of all files
    pub created_at: DateTime<Utc>,
    pub signed: bool,
}

/// Individual evidence file
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EvidenceFile {
    pub filename: String,
    pub file_hash: String,
    pub file_type: EvidenceFileType,
    pub description: String,
}

/// Evidence file types
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum EvidenceFileType {
    Policy,
    Fingerprint,
    CSR,
    Certificate,
    Attestation,
    Canary,
    Statement,
    Digests,
    PackIndex,
}

/// Incident record
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IncidentRecord {
    pub incident_id: String,
    pub tenant_id: String,
    pub trigger_reason: String,
    pub started_at: DateTime<Utc>,
    pub resolved_at: Option<DateTime<Utc>>,
    pub status: IncidentStatus,
    pub actions_taken: Vec<String>,
    pub evidence_files: Vec<String>,
    pub impact_summary: String,
}

/// Incident status
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum IncidentStatus {
    Active,
    Investigating,
    Rotating,
    Resigning,
    Resolved,
    Closed,
}

/// Database manager for policies and rotation data
#[derive(Clone)]
pub struct PolicyManager {
    pool: SqlitePool,
}

impl PolicyManager {
    pub async fn new(database_url: &str) -> Result<Self> {
        let pool = SqlitePool::connect(database_url).await
            .context("Failed to connect to database")?;
        
        // Run migrations
        sqlx::migrate!("./migrations").run(&pool).await
            .context("Failed to run database migrations")?;
        
        info!("Policy manager initialized with database");
        
        Ok(Self { pool })
    }
    
    /// Create or update signing policy
    pub async fn upsert_policy(&self, policy: &SigningPolicy) -> Result<()> {
        info!("Upserting policy for tenant: {}", policy.tenant_id);
        
        sqlx::query!(
            r#"
            INSERT OR REPLACE INTO signing_policies (
                tenant_id, algorithm, tsa_profile, assertions_allow, assertions_deny,
                embed_allowed_origins, key_type, provider, handle, cert_chain,
                not_before, not_after, rotate_every_days, max_issuance_per_24h,
                sign_enabled, created_at, updated_at, policy_hash
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
            policy.tenant_id,
            policy.algorithm,
            policy.tsa_profile,
            serde_json::to_string(&policy.assertions_allow)?,
            serde_json::to_string(&policy.assertions_deny)?,
            serde_json::to_string(&policy.embed_allowed_origins)?,
            serde.key_type_to_string(&policy.key.key_type),
            policy.key.provider,
            policy.key.handle,
            serde_json::to_string(&policy.key.cert_chain)?,
            policy.key.not_before,
            policy.key.not_after,
            policy.key.rotate_every_days,
            policy.key.max_issuance_per_24h,
            policy.key.sign_enabled,
            policy.created_at,
            policy.updated_at,
            policy.policy_hash
        )
        .execute(&self.pool)
        .await
        .context("Failed to upsert policy")?;
        
        Ok(())
    }
    
    /// Get policy for tenant
    pub async fn get_policy(&self, tenant_id: &str) -> Result<Option<SigningPolicy>> {
        debug!("Getting policy for tenant: {}", tenant_id);
        
        let row = sqlx::query!(
            r#"
            SELECT 
                tenant_id, algorithm, tsa_profile, assertions_allow, assertions_deny,
                embed_allowed_origins, key_type, provider, handle, cert_chain,
                not_before, not_after, rotate_every_days, max_issuance_per_24h,
                sign_enabled, created_at, updated_at, policy_hash
            FROM signing_policies 
            WHERE tenant_id = ?
            "#,
            tenant_id
        )
        .fetch_optional(&self.pool)
        .await
        .context("Failed to fetch policy")?;
        
        if let Some(row) = row {
            let policy = SigningPolicy {
                tenant_id: row.tenant_id,
                algorithm: row.algorithm,
                tsa_profile: row.tsa_profile,
                assertions_allow: serde_json::from_str(&row.assertions_allow)?,
                assertions_deny: serde_json::from_str(&row.assertions_deny)?,
                embed_allowed_origins: serde_json::from_str(&row.embed_allowed_origins)?,
                key: KeyConfig {
                    key_type: serde.string_to_key_type(&row.key_type)?,
                    provider: row.provider,
                    handle: row.handle,
                    cert_chain: serde_json::from_str(&row.cert_chain)?,
                    not_before: row.not_before,
                    not_after: row.not_after,
                    rotate_every_days: row.rotate_every_days,
                    max_issuance_per_24h: row.max_issuance_per_24h,
                    sign_enabled: row.sign_enabled,
                },
                created_at: row.created_at,
                updated_at: row.updated_at,
                policy_hash: row.policy_hash,
            };
            
            Ok(Some(policy))
        } else {
            Ok(None)
        }
    }
    
    /// List all tenants
    pub async fn list_tenants(&self) -> Result<Vec<String>> {
        let rows = sqlx::query!(
            "SELECT tenant_id FROM signing_policies ORDER BY tenant_id"
        )
        .fetch_all(&self.pool)
        .await
        .context("Failed to list tenants")?;
        
        Ok(rows.into_iter().map(|r| r.tenant_id).collect())
    }
    
    /// Schedule rotation for tenant
    pub async fn schedule_rotation(&self, rotation: &RotationCalendar) -> Result<()> {
        info!("Scheduling rotation for tenant: {}", rotation.tenant_id);
        
        sqlx::query!(
            r#"
            INSERT OR REPLACE INTO rotation_calendar (
                tenant_id, scheduled_rotation, rotation_window_start, rotation_window_end,
                owner, approval_required, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            "#,
            rotation.tenant_id,
            rotation.scheduled_rotation,
            rotation.rotation_window_start,
            rotation.rotation_window_end,
            rotation.owner,
            rotation.approval_required,
            serde.rotation_status_to_string(&rotation.status),
            rotation.created_at
        )
        .execute(&self.pool)
        .await
        .context("Failed to schedule rotation")?;
        
        Ok(())
    }
    
    /// Get upcoming rotations
    pub async fn get_upcoming_rotations(&self, days_ahead: u32) -> Result<Vec<RotationCalendar>> {
        let cutoff = Utc::now() + Duration::days(days_ahead as i64);
        
        let rows = sqlx::query!(
            r#"
            SELECT 
                tenant_id, scheduled_rotation, rotation_window_start, rotation_window_end,
                owner, approval_required, status, created_at
            FROM rotation_calendar 
            WHERE scheduled_rotation <= ? AND status != 'Completed'
            ORDER BY scheduled_rotation
            "#,
            cutoff
        )
        .fetch_all(&self.pool)
        .await
        .context("Failed to fetch upcoming rotations")?;
        
        let mut rotations = Vec::new();
        for row in rows {
            rotations.push(RotationCalendar {
                tenant_id: row.tenant_id,
                scheduled_rotation: row.scheduled_rotation,
                rotation_window_start: row.rotation_window_start,
                rotation_window_end: row.rotation_window_end,
                owner: row.owner,
                approval_required: row.approval_required,
                status: serde.string_to_rotation_status(&row.status)?,
                created_at: row.created_at,
            });
        }
        
        Ok(rotations)
    }
    
    /// Create incident record
    pub async fn create_incident(&self, incident: &IncidentRecord) -> Result<()> {
        warn!("Creating incident record: {}", incident.incident_id);
        
        sqlx::query!(
            r#"
            INSERT INTO incidents (
                incident_id, tenant_id, trigger_reason, started_at, resolved_at,
                status, actions_taken, evidence_files, impact_summary
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
            incident.incident_id,
            incident.tenant_id,
            incident.trigger_reason,
            incident.started_at,
            incident.resolved_at,
            serde.incident_status_to_string(&incident.status),
            serde_json::to_string(&incident.actions_taken)?,
            serde_json::to_string(&incident.evidence_files)?,
            incident.impact_summary
        )
        .execute(&self.pool)
        .await
        .context("Failed to create incident record")?;
        
        Ok(())
    }
    
    /// Update incident status
    pub async fn update_incident_status(
        &self, 
        incident_id: &str, 
        status: IncidentStatus,
        resolved_at: Option<DateTime<Utc>>
    ) -> Result<()> {
        info!("Updating incident {} status to {:?}", incident_id, status);
        
        sqlx::query!(
            r#"
            UPDATE incidents 
            SET status = ?, resolved_at = ?
            WHERE incident_id = ?
            "#,
            serde.incident_status_to_string(&status),
            resolved_at,
            incident_id
        )
        .execute(&self.pool)
        .await
        .context("Failed to update incident status")?;
        
        Ok(())
    }
}

mod serde {
    use super::*;
    
    pub fn key_type_to_string(key_type: &KeyType) -> String {
        match key_type {
            KeyType::HSM => "hsm".to_string(),
            KeyType::KMS => "kms".to_string(),
            KeyType::Software => "software".to_string(),
        }
    }
    
    pub fn string_to_key_type(s: &str) -> Result<KeyType> {
        match s {
            "hsm" => Ok(KeyType::HSM),
            "kms" => Ok(KeyType::KMS),
            "software" => Ok(KeyType::Software),
            _ => anyhow::bail!("Invalid key type: {}", s),
        }
    }
    
    pub fn rotation_status_to_string(status: &RotationStatus) -> String {
        match status {
            RotationStatus::Scheduled => "Scheduled".to_string(),
            RotationStatus::InProgress => "InProgress".to_string(),
            RotationStatus::Completed => "Completed".to_string(),
            RotationStatus::Failed => "Failed".to_string(),
            RotationStatus::Cancelled => "Cancelled".to_string(),
        }
    }
    
    pub fn string_to_rotation_status(s: &str) -> Result<RotationStatus> {
        match s {
            "Scheduled" => Ok(RotationStatus::Scheduled),
            "InProgress" => Ok(RotationStatus::InProgress),
            "Completed" => Ok(RotationStatus::Completed),
            "Failed" => Ok(RotationStatus::Failed),
            "Cancelled" => Ok(RotationStatus::Cancelled),
            _ => anyhow::bail!("Invalid rotation status: {}", s),
        }
    }
    
    pub fn incident_status_to_string(status: &IncidentStatus) -> String {
        match status {
            IncidentStatus::Active => "Active".to_string(),
            IncidentStatus::Investigating => "Investigating".to_string(),
            IncidentStatus::Rotating => "Rotating".to_string(),
            IncidentStatus::Resigning => "Resigning".to_string(),
            IncidentStatus::Resolved => "Resolved".to_string(),
            IncidentStatus::Closed => "Closed".to_string(),
        }
    }
}

/// Policy validation and utilities
pub struct PolicyValidator;

impl PolicyValidator {
    /// Validate signing policy
    pub fn validate_policy(policy: &SigningPolicy) -> Result<()> {
        // Check required fields
        if policy.tenant_id.is_empty() {
            anyhow::bail!("Tenant ID cannot be empty");
        }
        
        if policy.algorithm != "ES256" {
            anyhow::bail!("Only ES256 algorithm is supported");
        }
        
        if policy.key.rotate_every_days < 30 || policy.key.rotate_every_days > 365 {
            anyhow::bail!("Rotation period must be between 30 and 365 days");
        }
        
        if policy.key.not_after <= policy.key.not_before {
            anyhow::bail!("Certificate not_after must be after not_before");
        }
        
        if policy.key.not_before > Utc::now() + Duration::days(30) {
            anyhow::bail!("Certificate not_before cannot be more than 30 days in the future");
        }
        
        // Validate assertion lists don't overlap
        for denied in &policy.assertions_deny {
            if policy.assertions_allow.contains(denied) {
                anyhow::bail!("Assertion '{}' cannot be both allowed and denied", denied);
            }
        }
        
        Ok(())
    }
    
    /// Generate policy hash
    pub fn generate_policy_hash(policy: &SigningPolicy) -> Result<String> {
        let canonical = serde_json::to_string(policy)?;
        let hash = sha2::Sha256::digest(canonical.as_bytes());
        Ok(format!("sha256:{}", hex::encode(hash)))
    }
    
    /// Check if signing request complies with policy
    pub fn check_signing_compliance(
        policy: &SigningPolicy,
        assertions: &[String],
        timestamp: DateTime<Utc>,
    ) -> Result<()> {
        // Check if signing is enabled
        if !policy.key.sign_enabled {
            anyhow::bail!("Signing is disabled for tenant: {}", policy.tenant_id);
        }
        
        // Check certificate validity
        if timestamp < policy.key.not_before || timestamp > policy.key.not_after {
            anyhow::bail!("Signing request timestamp outside certificate validity period");
        }
        
        // Check denied assertions
        for assertion in assertions {
            if policy.assertions_deny.contains(assertion) {
                anyhow::bail!("Assertion '{}' is denied by policy", assertion);
            }
        }
        
        // Check allowed assertions (if allow list is not empty, only those are allowed)
        if !policy.assertions_allow.is_empty() {
            for assertion in assertions {
                if !policy.assertions_allow.contains(assertion) {
                    anyhow::bail!("Assertion '{}' is not in allowed list", assertion);
                }
            }
        }
        
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_policy_validation() {
        let mut policy = SigningPolicy {
            tenant_id: "test-tenant".to_string(),
            algorithm: "ES256".to_string(),
            tsa_profile: "std".to_string(),
            assertions_allow: vec!["c2pa.actions".to_string()],
            assertions_deny: vec!["c2pa.location.precise".to_string()],
            embed_allowed_origins: vec![],
            key: KeyConfig {
                key_type: KeyType::HSM,
                provider: "yubihsm2".to_string(),
                handle: "slot:0x0007".to_string(),
                cert_chain: vec![],
                not_before: Utc::now(),
                not_after: Utc::now() + Duration::days(90),
                rotate_every_days: 90,
                max_issuance_per_24h: 250000,
                sign_enabled: true,
            },
            created_at: Utc::now(),
            updated_at: Utc::now(),
            policy_hash: "".to_string(),
        };
        
        // Valid policy should pass
        assert!(PolicyValidator::validate_policy(&policy).is_ok());
        
        // Invalid algorithm should fail
        policy.algorithm = "RS256".to_string();
        assert!(PolicyValidator::validate_policy(&policy).is_err());
        
        // Overlapping assertions should fail
        policy.algorithm = "ES256".to_string();
        policy.assertions_allow.push("c2pa.location.precise".to_string());
        assert!(PolicyValidator::validate_policy(&policy).is_err());
    }
    
    #[test]
    fn test_policy_hash_generation() {
        let policy = SigningPolicy {
            tenant_id: "test-tenant".to_string(),
            algorithm: "ES256".to_string(),
            tsa_profile: "std".to_string(),
            assertions_allow: vec![],
            assertions_deny: vec![],
            embed_allowed_origins: vec![],
            key: KeyConfig {
                key_type: KeyType::HSM,
                provider: "yubihsm2".to_string(),
                handle: "slot:0x0007".to_string(),
                cert_chain: vec![],
                not_before: Utc::now(),
                not_after: Utc::now() + Duration::days(90),
                rotate_every_days: 90,
                max_issuance_per_24h: 250000,
                sign_enabled: true,
            },
            created_at: Utc::now(),
            updated_at: Utc::now(),
            policy_hash: "".to_string(),
        };
        
        let hash = PolicyValidator::generate_policy_hash(&policy).unwrap();
        assert!(hash.starts_with("sha256:"));
        assert_eq!(hash.len(), 71); // "sha256:" + 64 hex chars
    }
}
