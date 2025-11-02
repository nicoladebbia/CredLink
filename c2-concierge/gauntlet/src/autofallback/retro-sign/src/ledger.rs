//! Cost ledger and financial tracking for C2 Concierge Retro-Sign

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tracing::info;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Ledger {
    pub tenant_id: String,
    pub ts: DateTime<Utc>,
    pub objects_total: usize,
    pub objects_unique: usize,
    pub bytes_total: u64,
    pub bytes_unique: u64,
    pub est_runtime_sec: u64,
    pub est_cost: CostEstimate,
    pub perf_target: PerformanceTarget,
    pub first_10k_free: FreeSample,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CostEstimate {
    pub tsa_usd: f64,
    pub egress_usd: f64,
    pub cpu_usd: f64,
    pub storage_usd: f64,
    pub total_usd: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformanceTarget {
    pub assets_per_sec: usize,
    pub node_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FreeSample {
    pub sampled: usize,
    pub mix: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActualCost {
    pub tsa_usd: f64,
    pub egress_usd: f64,
    pub cpu_usd: f64,
    pub storage_usd: f64,
    pub total_usd: f64,
    pub timestamp_count: usize,
    pub egress_gb: f64,
    pub cpu_hours: f64,
    pub storage_gb_months: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CostVariance {
    pub estimated_usd: f64,
    pub actual_usd: f64,
    pub variance_pct: f64,
    pub within_tolerance: bool,
    pub component_variances: HashMap<String, f64>,
}

impl Ledger {
    pub fn new(tenant_id: String) -> Self {
        Self {
            tenant_id,
            ts: Utc::now(),
            objects_total: 0,
            objects_unique: 0,
            bytes_total: 0,
            bytes_unique: 0,
            est_runtime_sec: 0,
            est_cost: CostEstimate::default(),
            perf_target: PerformanceTarget::default(),
            first_10k_free: FreeSample::default(),
        }
    }
    
    pub fn calculate_variance(&self, actual: &ActualCost) -> CostVariance {
        let variance_pct = ((actual.total_usd - self.est_cost.total_usd) / self.est_cost.total_usd) * 100.0;
        let within_tolerance = variance_pct.abs() <= 5.0; // 5% tolerance
        
        let mut component_variances = HashMap::new();
        component_variances.insert("tsa".to_string(), 
            ((actual.tsa_usd - self.est_cost.tsa_usd) / self.est_cost.tsa_usd) * 100.0);
        component_variances.insert("egress".to_string(), 
            ((actual.egress_usd - self.est_cost.egress_usd) / self.est_cost.egress_usd) * 100.0);
        component_variances.insert("cpu".to_string(), 
            ((actual.cpu_usd - self.est_cost.cpu_usd) / self.est_cost.cpu_usd) * 100.0);
        component_variances.insert("storage".to_string(), 
            ((actual.storage_usd - self.est_cost.storage_usd) / self.est_cost.storage_usd) * 100.0);
        
        CostVariance {
            estimated_usd: self.est_cost.total_usd,
            actual_usd: actual.total_usd,
            variance_pct,
            within_tolerance,
            component_variances,
        }
    }
    
    pub fn validate_accuracy(&self, actual: &ActualCost) -> Result<bool> {
        let variance = self.calculate_variance(actual);
        
        info!("Cost variance: {:.2}% (estimated: ${:.2}, actual: ${:.2})", 
              variance.variance_pct, variance.estimated_usd, variance.actual_usd);
        
        if !variance.within_tolerance {
            tracing::warn!("Cost variance exceeds 5% tolerance: {:.2}%", variance.variance_pct);
        }
        
        Ok(variance.within_tolerance)
    }
}

impl Default for CostEstimate {
    fn default() -> Self {
        Self {
            tsa_usd: 0.0,
            egress_usd: 0.0,
            cpu_usd: 0.0,
            storage_usd: 0.0,
            total_usd: 0.0,
        }
    }
}

impl Default for PerformanceTarget {
    fn default() -> Self {
        Self {
            assets_per_sec: 50,
            node_type: "c6a.large|m7g.large".to_string(),
        }
    }
}

impl Default for FreeSample {
    fn default() -> Self {
        Self {
            sampled: 0,
            mix: "stratified: mime,size,prefix,date".to_string(),
        }
    }
}

impl ActualCost {
    pub fn from_metrics(
        timestamp_count: usize,
        egress_bytes: u64,
        cpu_seconds: u64,
        storage_bytes: u64,
        tsa_price_per_timestamp: f64,
        egress_price_per_gb: f64,
        cpu_price_per_hour: f64,
        storage_price_per_gb_month: f64,
    ) -> Self {
        let egress_gb = egress_bytes as f64 / (1024.0 * 1024.0 * 1024.0);
        let cpu_hours = cpu_seconds as f64 / 3600.0;
        let storage_gb_months = storage_bytes as f64 / (1024.0 * 1024.0 * 1024.0);
        
        let tsa_usd = timestamp_count as f64 * tsa_price_per_timestamp;
        let egress_usd = egress_gb * egress_price_per_gb;
        let cpu_usd = cpu_hours * cpu_price_per_hour;
        let storage_usd = storage_gb_months * storage_price_per_gb_month;
        
        Self {
            tsa_usd,
            egress_usd,
            cpu_usd,
            storage_usd,
            total_usd: tsa_usd + egress_usd + cpu_usd + storage_usd,
            timestamp_count,
            egress_gb,
            cpu_hours,
            storage_gb_months,
        }
    }
}
