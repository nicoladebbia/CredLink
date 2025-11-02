//! Report generation for C2 Concierge Retro-Sign

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use tracing::{debug, info};

use crate::cli::ReportArgs;
use crate::ledger::Ledger;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Report {
    pub tenant_id: String,
    pub generated_at: chrono::DateTime<chrono::Utc>,
    pub summary: ReportSummary,
    pub cost_breakdown: CostBreakdown,
    pub performance_metrics: PerformanceMetrics,
    pub recommendations: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReportSummary {
    pub total_objects: usize,
    pub unique_objects: usize,
    pub total_bytes: u64,
    pub unique_bytes: u64,
    pub deduplication_ratio: f64,
    pub estimated_runtime_hours: f64,
    pub estimated_cost_usd: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CostBreakdown {
    pub tsa_cost_usd: f64,
    pub egress_cost_usd: f64,
    pub compute_cost_usd: f64,
    pub storage_cost_usd: f64,
    pub total_cost_usd: f64,
    pub cost_per_object_usd: f64,
    pub cost_per_gb_usd: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformanceMetrics {
    pub target_throughput_objects_per_sec: usize,
    pub estimated_completion_date: chrono::DateTime<chrono::Utc>,
    pub recommended_node_type: String,
    pub memory_requirement_gb: f64,
    pub network_requirement_mbps: f64,
}

pub struct Reporter;

impl Reporter {
    pub async fn generate_report(ledger: &Ledger) -> Result<Report> {
        info!("Generating report for tenant: {}", ledger.tenant_id);
        
        let summary = Self::generate_summary(ledger).await?;
        let cost_breakdown = Self::generate_cost_breakdown(ledger).await?;
        let performance_metrics = Self::generate_performance_metrics(ledger).await?;
        let recommendations = Self::generate_recommendations(&summary, &cost_breakdown, &performance_metrics).await?;
        
        Ok(Report {
            tenant_id: ledger.tenant_id.clone(),
            generated_at: chrono::Utc::now(),
            summary,
            cost_breakdown,
            performance_metrics,
            recommendations,
        })
    }
    
    async fn generate_summary(ledger: &Ledger) -> Result<ReportSummary> {
        let deduplication_ratio = if ledger.objects_total > 0 {
            ledger.objects_unique as f64 / ledger.objects_total as f64
        } else {
            0.0
        };
        
        Ok(ReportSummary {
            total_objects: ledger.objects_total,
            unique_objects: ledger.objects_unique,
            total_bytes: ledger.bytes_total,
            unique_bytes: ledger.bytes_unique,
            deduplication_ratio,
            estimated_runtime_hours: ledger.est_runtime_sec as f64 / 3600.0,
            estimated_cost_usd: ledger.est_cost.total_usd,
        })
    }
    
    async fn generate_cost_breakdown(ledger: &Ledger) -> Result<CostBreakdown> {
        let cost_per_object = if ledger.objects_unique > 0 {
            ledger.est_cost.total_usd / ledger.objects_unique as f64
        } else {
            0.0
        };
        
        let cost_per_gb = if ledger.bytes_unique > 0 {
            ledger.est_cost.total_usd / (ledger.bytes_unique as f64 / (1024.0 * 1024.0 * 1024.0))
        } else {
            0.0
        };
        
        Ok(CostBreakdown {
            tsa_cost_usd: ledger.est_cost.tsa_usd,
            egress_cost_usd: ledger.est_cost.egress_usd,
            compute_cost_usd: ledger.est_cost.cpu_usd,
            storage_cost_usd: ledger.est_cost.storage_usd,
            total_cost_usd: ledger.est_cost.total_usd,
            cost_per_object_usd: cost_per_object,
            cost_per_gb_usd: cost_per_gb,
        })
    }
    
    async fn generate_performance_metrics(ledger: &Ledger) -> Result<PerformanceMetrics> {
        let estimated_completion = chrono::Utc::now() + chrono::Duration::seconds(ledger.est_runtime_sec as i64);
        
        // Estimate memory requirement (rough calculation)
        let memory_requirement_gb = (ledger.objects_unique as f64 * 0.001) + 2.0; // 1KB per object + 2GB base
        
        // Estimate network requirement
        let network_mbps = (ledger.bytes_unique as f64 / (1024.0 * 1024.0)) / (ledger.est_runtime_sec as f64 / 8.0);
        
        Ok(PerformanceMetrics {
            target_throughput_objects_per_sec: ledger.perf_target.assets_per_sec,
            estimated_completion_date: estimated_completion,
            recommended_node_type: ledger.perf_target.node_type.clone(),
            memory_requirement_gb,
            network_requirement_mbps: network_mbps,
        })
    }
    
    async fn generate_recommendations(
        summary: &ReportSummary,
        cost_breakdown: &CostBreakdown,
        performance_metrics: &PerformanceMetrics,
    ) -> Result<Vec<String>> {
        let mut recommendations = Vec::new();
        
        // Cost recommendations
        if cost_breakdown.tsa_cost_usd > cost_breakdown.total_cost_usd * 0.5 {
            recommendations.push("Consider TSA optimization strategies to reduce timestamp costs".to_string());
        }
        
        if cost_breakdown.egress_cost_usd > cost_breakdown.total_cost_usd * 0.3 {
            recommendations.push("Optimize egress by processing data in the same region as storage".to_string());
        }
        
        // Performance recommendations
        if performance_metrics.memory_requirement_gb > 16.0 {
            recommendations.push("Consider processing in smaller batches or upgrading to higher memory instances".to_string());
        }
        
        if performance_metrics.network_requirement_mbps > 500.0 {
            recommendations.push("High network requirements - ensure sufficient bandwidth or consider data transfer optimization".to_string());
        }
        
        // Deduplication recommendations
        if summary.deduplication_ratio < 0.8 {
            recommendations.push("Low deduplication ratio - consider content optimization or review duplicate detection strategy".to_string());
        }
        
        // General recommendations
        if summary.estimated_cost_usd > 1000.0 {
            recommendations.push("High estimated cost - consider processing a sample first to validate assumptions".to_string());
        }
        
        if summary.estimated_runtime_hours > 24.0 {
            recommendations.push("Long runtime expected - consider breaking into multiple phases or increasing concurrency".to_string());
        }
        
        Ok(recommendations)
    }
}

pub async fn run(args: ReportArgs) -> Result<()> {
    info!("Starting report generation");
    
    // Load ledger
    let ledger = load_ledger(&args.input).await?;
    
    // Generate report
    let report = Reporter::generate_report(&ledger).await?;
    
    // Write outputs based on format
    match args.format {
        crate::cli::ReportFormat::Html => {
            write_html_report(&report, &args.output).await?;
        }
        crate::cli::ReportFormat::Csv => {
            write_csv_report(&report, &args.output).await?;
        }
        crate::cli::ReportFormat::Json => {
            write_json_report(&report, &args.output).await?;
        }
        crate::cli::ReportFormat::All => {
            write_html_report(&report, &args.output).await?;
            write_csv_report(&report, &args.output).await?;
            write_json_report(&report, &args.output).await?;
        }
    }
    
    info!("Report generation completed for tenant: {}", ledger.tenant_id);
    
    Ok(())
}

async fn load_ledger(input_path: &PathBuf) -> Result<Ledger> {
    let content = tokio::fs::read_to_string(input_path).await
        .with_context(|| format!("Failed to read ledger file: {:?}", input_path))?;
    
    let ledger: Ledger = serde_json::from_str(&content)
        .with_context(|| "Failed to parse ledger file")?;
    
    Ok(ledger)
}

async fn write_json_report(report: &Report, output_dir: &PathBuf) -> Result<()> {
    tokio::fs::create_dir_all(output_dir).await?;
    
    let report_path = output_dir.join("report.json");
    let report_json = serde_json::to_string_pretty(report)?;
    
    tokio::fs::write(report_path, report_json).await
        .with_context(|| "Failed to write JSON report")?;
    
    info!("JSON report written to {:?}", output_dir);
    
    Ok(())
}

async fn write_csv_report(report: &Report, output_dir: &PathBuf) -> Result<()> {
    tokio::fs::create_dir_all(output_dir).await?;
    
    let report_path = output_dir.join("report.csv");
    
    let mut csv_content = String::new();
    csv_content.push_str("metric,value,unit\n");
    csv_content.push_str(&format!("total_objects,{},objects\n", report.summary.total_objects));
    csv_content.push_str(&format!("unique_objects,{},objects\n", report.summary.unique_objects));
    csv_content.push_str(&format!("total_bytes,{},bytes\n", report.summary.total_bytes));
    csv_content.push_str(&format!("unique_bytes,{},bytes\n", report.summary.unique_bytes));
    csv_content.push_str(&format!("deduplication_ratio,{:.4},ratio\n", report.summary.deduplication_ratio));
    csv_content.push_str(&format!("estimated_runtime_hours,{:.2},hours\n", report.summary.estimated_runtime_hours));
    csv_content.push_str(&format!("estimated_cost_usd,{:.2},USD\n", report.summary.estimated_cost_usd));
    csv_content.push_str(&format!("tsa_cost_usd,{:.2},USD\n", report.cost_breakdown.tsa_cost_usd));
    csv_content.push_str(&format!("egress_cost_usd,{:.2},USD\n", report.cost_breakdown.egress_cost_usd));
    csv_content.push_str(&format!("compute_cost_usd,{:.2},USD\n", report.cost_breakdown.compute_cost_usd));
    csv_content.push_str(&format!("storage_cost_usd,{:.2},USD\n", report.cost_breakdown.storage_cost_usd));
    csv_content.push_str(&format!("cost_per_object_usd,{:.4},USD\n", report.cost_breakdown.cost_per_object_usd));
    csv_content.push_str(&format!("cost_per_gb_usd,{:.2},USD\n", report.cost_breakdown.cost_per_gb_usd));
    csv_content.push_str(&format!("target_throughput_objects_per_sec,{},objects/sec\n", report.performance_metrics.target_throughput_objects_per_sec));
    csv_content.push_str(&format!("memory_requirement_gb,{:.2},GB\n", report.performance_metrics.memory_requirement_gb));
    csv_content.push_str(&format!("network_requirement_mbps,{:.2},Mbps\n", report.performance_metrics.network_requirement_mbps));
    
    tokio::fs::write(report_path, csv_content).await
        .with_context(|| "Failed to write CSV report")?;
    
    info!("CSV report written to {:?}", output_dir);
    
    Ok(())
}

async fn write_html_report(report: &Report, output_dir: &PathBuf) -> Result<()> {
    tokio::fs::create_dir_all(output_dir).await?;
    
    let report_path = output_dir.join("index.html");
    
    let html_content = format!(r#"
<!DOCTYPE html>
<html>
<head>
    <title>C2 Concierge Retro-Sign Report</title>
    <style>
        body {{ font-family: Arial, sans-serif; margin: 20px; background: #f8f9fa; }}
        .container {{ max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }}
        .header {{ text-align: center; margin-bottom: 40px; }}
        .header h1 {{ color: #2c3e50; margin-bottom: 10px; }}
        .header p {{ color: #7f8c8d; }}
        .summary-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 40px; }}
        .summary-card {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 25px; border-radius: 8px; text-align: center; }}
        .summary-card h3 {{ margin: 0 0 15px 0; font-size: 16px; opacity: 0.9; }}
        .summary-card .value {{ font-size: 32px; font-weight: bold; margin-bottom: 5px; }}
        .summary-card .unit {{ font-size: 14px; opacity: 0.8; }}
        .section {{ margin-bottom: 40px; }}
        .section h2 {{ color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px; }}
        .cost-chart {{ background: #ecf0f1; padding: 20px; border-radius: 8px; margin: 20px 0; }}
        .cost-item {{ display: flex; justify-content: space-between; align-items: center; margin: 10px 0; padding: 10px; background: white; border-radius: 4px; }}
        .cost-bar {{ height: 20px; background: #3498db; border-radius: 10px; margin-left: 10px; }}
        .recommendations {{ background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 8px; padding: 20px; }}
        .recommendations h3 {{ color: #856404; margin-top: 0; }}
        .recommendations ul {{ margin: 0; padding-left: 20px; }}
        .recommendations li {{ margin: 10px 0; color: #856404; }}
        .metrics-table {{ width: 100%; border-collapse: collapse; margin: 20px 0; }}
        .metrics-table th, .metrics-table td {{ padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }}
        .metrics-table th {{ background: #34495e; color: white; }}
        .metrics-table tr:hover {{ background: #f5f5f5; }}
        .footer {{ text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #ecf0f1; color: #7f8c8d; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>C2 Concierge Retro-Sign Report</h1>
            <p>Generated for: {} | {}</p>
        </div>
        
        <div class="summary-grid">
            <div class="summary-card">
                <h3>Total Objects</h3>
                <div class="value">{}</div>
                <div class="unit">objects</div>
            </div>
            <div class="summary-card">
                <h3>Unique Objects</h3>
                <div class="value">{}</div>
                <div class="unit">objects</div>
            </div>
            <div class="summary-card">
                <h3>Total Size</h3>
                <div class="value">{:.1}</div>
                <div class="unit">GB</div>
            </div>
            <div class="summary-card">
                <h3>Estimated Cost</h3>
                <div class="value">${:.2}</div>
                <div class="unit">USD</div>
            </div>
        </div>
        
        <div class="section">
            <h2>Summary</h2>
            <table class="metrics-table">
                <tr><th>Metric</th><th>Value</th></tr>
                <tr><td>Deduplication Ratio</td><td>{:.2}%</td></tr>
                <tr><td>Estimated Runtime</td><td>{:.1} hours</td></tr>
                <tr><td>Cost per Object</td><td>${:.4}</td></tr>
                <tr><td>Cost per GB</td><td>${:.2}</td></tr>
            </table>
        </div>
        
        <div class="section">
            <h2>Cost Breakdown</h2>
            <div class="cost-chart">
                <div class="cost-item">
                    <span>TSA Timestamps</span>
                    <span>${:.2}</span>
                </div>
                <div class="cost-item">
                    <span>Egress</span>
                    <span>${:.2}</span>
                </div>
                <div class="cost-item">
                    <span>Compute</span>
                    <span>${:.2}</span>
                </div>
                <div class="cost-item">
                    <span>Storage</span>
                    <span>${:.2}</span>
                </div>
                <div class="cost-item" style="font-weight: bold; border-top: 2px solid #3498db; padding-top: 15px;">
                    <span>Total</span>
                    <span>${:.2}</span>
                </div>
            </div>
        </div>
        
        <div class="section">
            <h2>Performance Metrics</h2>
            <table class="metrics-table">
                <tr><th>Metric</th><th>Value</th></tr>
                <tr><td>Target Throughput</td><td>{} objects/sec</td></tr>
                <tr><td>Estimated Completion</td><td>{}</td></tr>
                <tr><td>Recommended Node Type</td><td>{}</td></tr>
                <tr><td>Memory Requirement</td><td>{:.1} GB</td></tr>
                <tr><td>Network Requirement</td><td>{:.1} Mbps</td></tr>
            </table>
        </div>
        
        {}
        
        <div class="footer">
            <p>Report generated by C2 Concierge Retro-Sign v{} on {}</p>
        </div>
    </div>
</body>
</html>
"#,
        report.tenant_id,
        report.generated_at.format("%Y-%m-%d %H:%M:%S UTC"),
        report.summary.total_objects,
        report.summary.unique_objects,
        report.summary.total_bytes as f64 / (1024.0 * 1024.0 * 1024.0),
        report.summary.estimated_cost_usd,
        report.summary.deduplication_ratio * 100.0,
        report.summary.estimated_runtime_hours,
        report.cost_breakdown.cost_per_object_usd,
        report.cost_breakdown.cost_per_gb_usd,
        report.cost_breakdown.tsa_cost_usd,
        report.cost_breakdown.egress_cost_usd,
        report.cost_breakdown.compute_cost_usd,
        report.cost_breakdown.storage_cost_usd,
        report.cost_breakdown.total_cost_usd,
        report.performance_metrics.target_throughput_objects_per_sec,
        report.performance_metrics.estimated_completion_date.format("%Y-%m-%d %H:%M UTC"),
        report.performance_metrics.recommended_node_type,
        report.performance_metrics.memory_requirement_gb,
        report.performance_metrics.network_requirement_mbps,
        if report.recommendations.is_empty() {
            String::new()
        } else {
            format!(r#"
        <div class="section">
            <h2>Recommendations</h2>
            <div class="recommendations">
                <h3>Optimization Suggestions</h3>
                <ul>
                    {}
                </ul>
            </div>
        </div>
"#,
                report.recommendations.iter()
                    .map(|rec| format!("<li>{}</li>", rec))
                    .collect::<Vec<_>>()
                    .join("\n                    ")
            )
        },
        env!("CARGO_PKG_VERSION"),
        chrono::Utc::now().format("%Y-%m-%d %H:%M:%S UTC")
    );
    
    tokio::fs::write(report_path, html_content).await
        .with_context(|| "Failed to write HTML report")?;
    
    info!("HTML report written to {:?}", output_dir);
    
    Ok(())
}
