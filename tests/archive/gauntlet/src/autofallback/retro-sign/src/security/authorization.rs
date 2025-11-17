//! Authorization Module - ENTERPRISE AUTHORIZATION
//! 
//! Role-based access control with fine-grained permissions
//! Zero-trust authorization with policy enforcement
//! 

use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, info, warn, error};
use uuid::Uuid;

/// Authorization manager for comprehensive access control
pub struct AuthorizationManager {
    policies: Arc<RwLock<HashMap<String, AccessPolicy>>>,
    roles: Arc<RwLock<HashMap<String, Role>>>,
    user_roles: Arc<RwLock<HashMap<String, Vec<String>>>>,
    permissions_cache: Arc<RwLock<HashMap<String, HashSet<String>>>>,
    config: AuthzConfig,
}

/// Authorization configuration
#[derive(Debug, Clone)]
pub struct AuthzConfig {
    pub cache_ttl_seconds: u64,
    pub enable_policy_caching: bool,
    pub enable_role_hierarchy: bool,
    pub default_deny: bool,
}

/// Access policy definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccessPolicy {
    pub id: String,
    pub name: String,
    pub description: String,
    pub rules: Vec<PolicyRule>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub enabled: bool,
}

/// Policy rule for access control
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyRule {
    pub id: String,
    pub resource: String,
    pub action: String,
    pub effect: PolicyEffect,
    pub conditions: Vec<PolicyCondition>,
    pub priority: u32,
}

/// Policy effect (allow or deny)
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum PolicyEffect {
    Allow,
    Deny,
}

/// Policy condition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyCondition {
    pub field: String,
    pub operator: ConditionOperator,
    pub value: String,
}

/// Condition operators
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ConditionOperator {
    Equals,
    NotEquals,
    Contains,
    NotContains,
    StartsWith,
    EndsWith,
    GreaterThan,
    LessThan,
    In,
    NotIn,
}

/// Role definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Role {
    pub id: String,
    pub name: String,
    pub description: String,
    pub permissions: Vec<String>,
    pub parent_roles: Vec<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub enabled: bool,
}

/// Authorization request
#[derive(Debug, Clone)]
pub struct AuthzRequest {
    pub user_id: String,
    pub tenant_id: String,
    pub resource: String,
    pub action: String,
    pub context: HashMap<String, String>,
}

/// Authorization decision
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthzDecision {
    pub allowed: bool,
    pub policy_id: Option<String>,
    pub reason: String,
    pub ttl: Option<u64>,
}

/// Permission check result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PermissionResult {
    pub granted: bool,
    pub permissions: Vec<String>,
    pub roles: Vec<String>,
    pub policies: Vec<String>,
}

impl AuthorizationManager {
    pub fn new(config: AuthzConfig) -> Self {
        Self {
            policies: Arc::new(RwLock::new(HashMap::new())),
            roles: Arc::new(RwLock::new(HashMap::new())),
            user_roles: Arc::new(RwLock::new(HashMap::new())),
            permissions_cache: Arc::new(RwLock::new(HashMap::new())),
            config,
        }
    }
    
    /// Initialize authorization system
    pub async fn initialize(&self) -> Result<()> {
        info!("Initializing authorization manager");
        
        // Clear any stale cache
        self.clear_cache().await?;
        
        info!("Authorization manager initialized");
        Ok(())
    }
    
    /// Check authorization for a request
    pub async fn authorize(&self, request: AuthzRequest) -> Result<AuthzDecision> {
        debug!("Checking authorization for user {} on {} {}", 
               request.user_id, request.action, request.resource);
        
        // Get user permissions
        let user_permissions = self.get_user_permissions(&request.user_id).await?;
        
        // Check direct permission
        let required_permission = format!("{}:{}", request.resource, request.action);
        if user_permissions.contains(&required_permission) {
            return Ok(AuthzDecision {
                allowed: true,
                policy_id: Some("direct_permission".to_string()),
                reason: "User has direct permission".to_string(),
                ttl: Some(self.config.cache_ttl_seconds),
            });
        }
        
        // Evaluate policies
        let policies = self.policies.read().await;
        let mut decision = AuthzDecision {
            allowed: self.config.default_deny,
            policy_id: None,
            reason: "No matching policy found".to_string(),
            ttl: Some(self.config.cache_ttl_seconds),
        };
        
        // Sort policies by priority (higher priority first)
        let mut applicable_policies: Vec<_> = policies.values()
            .filter(|p| p.enabled)
            .collect();
        applicable_policies.sort_by(|a, b| b.rules.first().map(|r| r.priority).unwrap_or(0)
            .cmp(&a.rules.first().map(|r| r.priority).unwrap_or(0)));
        
        for policy in applicable_policies {
            if let Some(policy_decision) = self.evaluate_policy(&policy, &request, &user_permissions).await? {
                decision = policy_decision;
                break; // First matching policy wins
            }
        }
        
        info!("Authorization decision for user {}: {}", 
              request.user_id, if decision.allowed { "ALLOWED" } else { "DENIED" });
        
        Ok(decision)
    }
    
    /// Check if user has specific permission
    pub async fn has_permission(&self, user_id: &str, permission: &str) -> Result<bool> {
        let user_permissions = self.get_user_permissions(user_id).await?;
        Ok(user_permissions.contains(permission))
    }
    
    /// Get all permissions for a user
    pub async fn get_user_permissions(&self, user_id: &str) -> Result<HashSet<String>> {
        // Check cache first
        if self.config.enable_policy_caching {
            let cache = self.permissions_cache.read().await;
            if let Some(permissions) = cache.get(user_id) {
                return Ok(permissions.clone());
            }
        }
        
        // Get user roles
        let user_roles = self.get_user_roles(user_id).await?;
        let mut permissions = HashSet::new();
        
        // Collect permissions from all roles
        let roles = self.roles.read().await;
        for role_id in user_roles {
            if let Some(role) = roles.get(&role_id) {
                permissions.extend(role.permissions.clone());
                
                // Add parent role permissions if hierarchy is enabled
                if self.config.enable_role_hierarchy {
                    for parent_role_id in &role.parent_roles {
                        if let Some(parent_role) = roles.get(parent_role_id) {
                            permissions.extend(parent_role.permissions.clone());
                        }
                    }
                }
            }
        }
        
        // Cache the result
        if self.config.enable_policy_caching {
            let mut cache = self.permissions_cache.write().await;
            cache.insert(user_id.to_string(), permissions.clone());
        }
        
        Ok(permissions)
    }
    
    /// Assign role to user
    pub async fn assign_role(&self, user_id: &str, role_id: &str) -> Result<()> {
        let mut user_roles = self.user_roles.write().await;
        
        let roles = user_roles.entry(user_id.to_string()).or_insert_with(Vec::new);
        if !roles.contains(&role_id.to_string()) {
            roles.push(role_id.to_string());
            info!("Assigned role {} to user {}", role_id, user_id);
        }
        
        // Clear cache for this user
        if self.config.enable_policy_caching {
            let mut cache = self.permissions_cache.write().await;
            cache.remove(user_id);
        }
        
        Ok(())
    }
    
    /// Remove role from user
    pub async fn remove_role(&self, user_id: &str, role_id: &str) -> Result<()> {
        let mut user_roles = self.user_roles.write().await;
        
        if let Some(roles) = user_roles.get_mut(user_id) {
            roles.retain(|r| r != role_id);
            info!("Removed role {} from user {}", role_id, user_id);
        }
        
        // Clear cache for this user
        if self.config.enable_policy_caching {
            let mut cache = self.permissions_cache.write().await;
            cache.remove(user_id);
        }
        
        Ok(())
    }
    
    /// Create new role
    pub async fn create_role(&self, role: Role) -> Result<()> {
        let mut roles = self.roles.write().await;
        roles.insert(role.id.clone(), role.clone());
        info!("Created role: {}", role.name);
        Ok(())
    }
    
    /// Create new policy
    pub async fn create_policy(&self, policy: AccessPolicy) -> Result<()> {
        let mut policies = self.policies.write().await;
        policies.insert(policy.id.clone(), policy.clone());
        info!("Created policy: {}", policy.name);
        Ok(())
    }
    
    /// Get user roles
    pub async fn get_user_roles(&self, user_id: &str) -> Result<Vec<String>> {
        let user_roles = self.user_roles.read().await;
        Ok(user_roles.get(user_id).cloned().unwrap_or_default())
    }
    
    /// Get permission analysis for user
    pub async fn analyze_permissions(&self, user_id: &str) -> Result<PermissionResult> {
        let permissions = self.get_user_permissions(user_id).await?;
        let roles = self.get_user_roles(user_id).await?;
        
        // Get applicable policies
        let policies = self.policies.read().await;
        let applicable_policies: Vec<String> = policies.values()
            .filter(|p| p.enabled)
            .map(|p| p.id.clone())
            .collect();
        
        Ok(PermissionResult {
            granted: !permissions.is_empty(),
            permissions: permissions.into_iter().collect(),
            roles,
            policies: applicable_policies,
        })
    }
    
    /// Clear permission cache
    pub async fn clear_cache(&self) -> Result<()> {
        let mut cache = self.permissions_cache.write().await;
        cache.clear();
        info!("Authorization cache cleared");
        Ok(())
    }
    
    /// Get authorization statistics
    pub async fn get_stats(&self) -> Result<AuthzStats> {
        let policies = self.policies.read().await;
        let roles = self.roles.read().await;
        let user_roles = self.user_roles.read().await;
        let cache = self.permissions_cache.read().await;
        
        Ok(AuthzStats {
            total_policies: policies.len(),
            enabled_policies: policies.values().filter(|p| p.enabled).count(),
            total_roles: roles.len(),
            enabled_roles: roles.values().filter(|r| r.enabled).count(),
            total_user_assignments: user_roles.values().map(|r| r.len()).sum(),
            cached_users: cache.len(),
        })
    }
    
    // Private helper methods
    
    async fn evaluate_policy(&self, policy: &AccessPolicy, request: &AuthzRequest, user_permissions: &HashSet<String>) -> Result<Option<AuthzDecision>> {
        for rule in &policy.rules {
            if self.matches_rule(rule, request, user_permissions).await? {
                return Ok(Some(AuthzDecision {
                    allowed: rule.effect == PolicyEffect::Allow,
                    policy_id: Some(policy.id.clone()),
                    reason: format!("Matched policy rule: {}", rule.id),
                    ttl: Some(self.config.cache_ttl_seconds),
                }));
            }
        }
        Ok(None)
    }
    
    async fn matches_rule(&self, rule: &PolicyRule, request: &AuthzRequest, user_permissions: &HashSet<String>) -> Result<bool> {
        // Check resource match
        if !self.matches_pattern(&rule.resource, &request.resource) {
            return Ok(false);
        }
        
        // Check action match
        if !self.matches_pattern(&rule.action, &request.action) {
            return Ok(false);
        }
        
        // Check conditions
        for condition in &rule.conditions {
            if !self.evaluate_condition(condition, request).await? {
                return Ok(false);
            }
        }
        
        Ok(true)
    }
    
    fn matches_pattern(&self, pattern: &str, value: &str) -> bool {
        if pattern == "*" {
            return true;
        }
        
        if pattern.contains("*") {
            // Simple wildcard matching
            let pattern_parts: Vec<&str> = pattern.split('*').collect();
            if pattern_parts.len() == 2 {
                let prefix = pattern_parts[0];
                let suffix = pattern_parts[1];
                return value.starts_with(prefix) && value.ends_with(suffix);
            }
        }
        
        pattern == value
    }
    
    async fn evaluate_condition(&self, condition: &PolicyCondition, request: &AuthzRequest) -> Result<bool> {
        let field_value = request.context.get(&condition.field)
            .or_else(|| Some(&request.user_id))
            .or_else(|| Some(&request.tenant_id))
            .unwrap_or(&String::new());
        
        match condition.operator {
            ConditionOperator::Equals => Ok(field_value == &condition.value),
            ConditionOperator::NotEquals => Ok(field_value != &condition.value),
            ConditionOperator::Contains => Ok(field_value.contains(&condition.value)),
            ConditionOperator::NotContains => Ok(!field_value.contains(&condition.value)),
            ConditionOperator::StartsWith => Ok(field_value.starts_with(&condition.value)),
            ConditionOperator::EndsWith => Ok(field_value.ends_with(&condition.value)),
            ConditionOperator::In => {
                let values: Vec<&str> = condition.value.split(',').collect();
                Ok(values.contains(&field_value.as_str()))
            }
            ConditionOperator::NotIn => {
                let values: Vec<&str> = condition.value.split(',').collect();
                Ok(!values.contains(&field_value.as_str()))
            }
            ConditionOperator::GreaterThan => {
                match (field_value.parse::<i64>(), condition.value.parse::<i64>()) {
                    (Ok(fv), Ok(cv)) => Ok(fv > cv),
                    _ => Ok(false),
                }
            }
            ConditionOperator::LessThan => {
                match (field_value.parse::<i64>(), condition.value.parse::<i64>()) {
                    (Ok(fv), Ok(cv)) => Ok(fv < cv),
                    _ => Ok(false),
                }
            }
        }
    }
}

/// Authorization statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthzStats {
    pub total_policies: usize,
    pub enabled_policies: usize,
    pub total_roles: usize,
    pub enabled_roles: usize,
    pub total_user_assignments: usize,
    pub cached_users: usize,
}

impl Default for AuthzConfig {
    fn default() -> Self {
        Self {
            cache_ttl_seconds: 300, // 5 minutes
            enable_policy_caching: true,
            enable_role_hierarchy: true,
            default_deny: true,
        }
    }
}

impl Default for AuthorizationManager {
    fn default() -> Self {
        Self::new(AuthzConfig::default())
    }
}
