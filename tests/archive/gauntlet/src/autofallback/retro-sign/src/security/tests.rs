//! Security module tests

#[cfg(test)]
mod tests {
    use super::*;
    use crate::security::{SecurityManager, SecurityConfig};

    #[tokio::test]
    async fn test_security_manager_initialization() {
        let manager = SecurityManager::new();
        assert!(manager.initialize().await.is_ok());
    }

    #[tokio::test]
    async fn test_authentication_flow() {
        let manager = SecurityManager::new();
        manager.initialize().await.unwrap();
        
        // Test basic authentication
        let result = manager.authenticate("testuser", "testpass", "default").await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_authorization_flow() {
        let manager = SecurityManager::new();
        manager.initialize().await.unwrap();
        
        // Create a mock security context
        let context = crate::security::SecurityContext {
            user_id: "testuser".to_string(),
            session_id: "test-session".to_string(),
            permissions: vec!["read:files".to_string()],
            tenant_id: "default".to_string(),
            request_id: "test-req".to_string(),
            timestamp: std::time::SystemTime::now(),
        };
        
        // Test authorization
        let result = manager.authorize(&context, "read", "files").await;
        assert!(result.is_ok());
    }
}
