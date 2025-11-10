//! Performance module tests

#[cfg(test)]
mod tests {
    use super::*;
    use crate::performance::{PerformanceManager, get_performance_manager};

    #[tokio::test]
    async fn test_performance_manager_initialization() {
        let manager = get_performance_manager();
        assert!(manager.is_ok());
    }

    #[tokio::test]
    async fn test_operation_recording() {
        let manager = get_performance_manager().unwrap();
        let result = manager.record_operation("test_operation", std::time::Duration::from_millis(100)).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_cache_operations() {
        let manager = get_performance_manager().unwrap();
        let cache_stats = manager.get_cache_stats().await;
        assert!(cache_stats.is_ok());
    }

    #[tokio::test]
    async fn test_performance_metrics() {
        let manager = get_performance_manager().unwrap();
        let stats = manager.get_statistics().await;
        assert!(stats.is_ok());
    }
}
