//! Verification and survival testing for C2 Concierge Retro-Sign

use anyhow::{Context, Result};
use chrono::Utc;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Duration;
use tracing::{debug, error, info, warn};

use crate::cli::VerifyArgs;
use crate::ledger::Ledger;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerificationResult {
    pub tenant_id: String,
    pub sample_size: usize,
    pub verified_count: usize,
    pub failed_count: usize,
    pub survival_rate: f64,
    pub verification_details: Vec<VerificationDetail>,
    pub summary: VerificationSummary,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerificationDetail {
    pub asset_url: String,
    pub manifest_url: String,
    pub verification_url: String,
    pub status: VerificationStatus,
    pub response_time_ms: u64,
    pub error_message: Option<String>,
    pub headers: HashMap<String, String>,
    pub timestamp: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum VerificationStatus {
    Success,
    ManifestNotFound,
    ManifestCorrupted,
    NetworkError,
    Timeout,
   ServerError,
    InvalidResponse,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerificationSummary {
    pub total_verified: usize,
    pub survival_rate: f64,
    pub average_response_time_ms: f64,
    pub p50_response_time_ms: f64,
    pub p95_response_time_ms: f64,
    pub error_distribution: HashMap<String, usize>,
    pub recommendations: Vec<String>,
}

pub struct Verifier {
    client: Client,
    verify_url: String,
    timeout: Duration,
}

impl Verifier {
    pub fn new(verify_url: String, timeout: Duration) -> Result<Self> {
        let client = Client::builder()
            .timeout(timeout)
            .build()
            .with_context(|| "Failed to create HTTP client")?;
        
        Ok(Self {
            client,
            verify_url,
            timeout,
        })
    }
    
    pub async fn verify_sample(&self, sample_items: &[String], sample_size: usize) -> Result<VerificationResult> {
        info!("Starting verification of {} items", sample_size);
        
        let mut verification_details = Vec::new();
        let mut verified_count = 0;
        let mut failed_count = 0;
        
        // Take sample from the provided items
        let actual_sample_size = sample_size.min(sample_items.len());
        let sample = &sample_items[..actual_sample_size];
        
        for (index, asset_url) in sample.iter().enumerate() {
            debug!("Verifying asset {}/{}: {}", index + 1, actual_sample_size, asset_url);
            
            match self.verify_single_asset(asset_url).await {
                Ok(detail) => {
                    match detail.status {
                        VerificationStatus::Success => {
                            verified_count += 1;
                        }
                        _ => {
                            failed_count += 1;
                        }
                    }
                    verification_details.push(detail);
                }
                Err(e) => {
                    error!("Failed to verify asset {}: {}", asset_url, e);
                    failed_count += 1;
                    
                    verification_details.push(VerificationDetail {
                        asset_url: asset_url.clone(),
                        manifest_url: String::new(),
                        verification_url: String::new(),
                        status: VerificationStatus::NetworkError,
                        response_time_ms: 0,
                        error_message: Some(e.to_string()),
                        headers: HashMap::new(),
                        timestamp: Utc::now(),
                    });
                }
            }
            
            // Progress logging
            if (index + 1) % 100 == 0 {
                info!("Verification progress: {}/{}", index + 1, actual_sample_size);
            }
        }
        
        let survival_rate = if actual_sample_size > 0 {
            verified_count as f64 / actual_sample_size as f64 * 100.0
        } else {
            0.0
        };
        
        let summary = self.generate_summary(&verification_details, verified_count, actual_sample_size).await?;
        
        Ok(VerificationResult {
            tenant_id: "default".to_string(), // Will be set from args
            sample_size: actual_sample_size,
            verified_count,
            failed_count,
            survival_rate,
            verification_details,
            summary,
        })
    }
    
    pub async fn verify_single_asset(&self, asset_url: &str) -> Result<VerificationDetail> {
        self.verify_asset(asset_url).await
    }
    
    async fn verify_asset(&self, asset_url: &str) -> Result<VerificationDetail> {
        let start_time = std::time::Instant::now();
        
        // Construct verification URL
        let verification_url = format!("{}?asset={}", self.verify_url, urlencoding::encode(asset_url));
        
        // Make verification request
        let response = self.client
            .get(&verification_url)
            .header("User-Agent", "C2Concierge-Verifier/1.0")
            .send()
            .await
            .with_context(|| "Failed to send verification request")?;
        
        let response_time_ms = start_time.elapsed().as_millis() as u64;
        
        // Collect response headers
        let mut headers = HashMap::new();
        for (name, value) in response.headers() {
            if let Ok(value_str) = value.to_str() {
                headers.insert(name.to_string(), value_str.to_string());
            }
        }
        
        // Check response status
        if !response.status().is_success() {
            let status = match response.status().as_u16() {
                404 => VerificationStatus::ManifestNotFound,
                500..=599 => VerificationStatus::ServerError,
                _ => VerificationStatus::InvalidResponse,
            };
            
            return Ok(VerificationDetail {
                asset_url: asset_url.to_string(),
                manifest_url: String::new(),
                verification_url,
                status,
                response_time_ms,
                error_message: Some(format!("HTTP {}", response.status())),
                headers,
                timestamp: Utc::now(),
            });
        }
        
        // Parse verification response
        let verification_response: serde_json::Value = response.json().await
            .with_context(|| "Failed to parse verification response")?;
        
        // Extract manifest URL from response
        let manifest_url = verification_response.get("manifest_url")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        
        // Check verification status
        let verification_status = verification_response.get("status")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown");
        
        let status = match verification_status {
            "valid" | "success" => VerificationStatus::Success,
            "manifest_not_found" => VerificationStatus::ManifestNotFound,
            "manifest_corrupted" => VerificationStatus::ManifestCorrupted,
            "invalid_response" => VerificationStatus::InvalidResponse,
            _ => VerificationStatus::ServerError,
        };
        
        Ok(VerificationDetail {
            asset_url: asset_url.to_string(),
            manifest_url,
            verification_url,
            status,
            response_time_ms,
            error_message: None,
            headers,
            timestamp: Utc::now(),
        })
    }
    
    async fn generate_summary(
        &self,
        details: &[VerificationDetail],
        verified_count: usize,
        total_count: usize,
    ) -> Result<VerificationSummary> {
        let mut response_times: Vec<u64> = details.iter()
            .map(|d| d.response_time_ms)
            .collect();
        
        response_times.sort_unstable();
        
        let average_response_time_ms = if !response_times.is_empty() {
            response_times.iter().sum::<u64>() as f64 / response_times.len() as f64
        } else {
            0.0
        };
        
        let p50_response_time_ms = if !response_times.is_empty() {
            response_times[response_times.len() / 2] as f64
        } else {
            0.0
        };
        
        let p95_response_time_ms = if !response_times.is_empty() {
            let p95_index = (response_times.len() as f64 * 0.95) as usize;
            response_times[p95_index.min(response_times.len() - 1)] as f64
        } else {
            0.0
        };
        
        // Calculate error distribution
        let mut error_distribution: HashMap<String, usize> = HashMap::new();
        
        for detail in details {
            let error_type = match detail.status {
                VerificationStatus::Success => continue,
                VerificationStatus::ManifestNotFound => "manifest_not_found",
                VerificationStatus::ManifestCorrupted => "manifest_corrupted",
                VerificationStatus::NetworkError => "network_error",
                VerificationStatus::Timeout => "timeout",
                VerificationStatus::ServerError => "server_error",
                VerificationStatus::InvalidResponse => "invalid_response",
            };
            
            *error_distribution.entry(error_type.to_string()).or_insert(0) += 1;
        }
        
        // Generate recommendations
        let mut recommendations = Vec::new();
        
        let survival_rate = verified_count as f64 / total_count as f64 * 100.0;
        
        if survival_rate < 99.9 {
            recommendations.push("Survival rate below 99.9% - investigate CDN configuration".to_string());
        }
        
        if average_response_time_ms > 1000.0 {
            recommendations.push("High average response time - consider optimization".to_string());
        }
        
        if error_distribution.contains_key("manifest_not_found") {
            recommendations.push("Manifest not found errors - check manifest storage and linking".to_string());
        }
        
        if error_distribution.contains_key("network_error") {
            recommendations.push("Network errors - verify connectivity and retry logic".to_string());
        }
        
        Ok(VerificationSummary {
            total_verified: total_count,
            survival_rate,
            average_response_time_ms,
            p50_response_time_ms,
            p95_response_time_ms,
            error_distribution,
            recommendations,
        })
    }
}

pub async fn run(args: VerifyArgs) -> Result<()> {
    info!("Starting verification process");
    
    // Load ledger or plan to get asset URLs
    let asset_urls = load_asset_urls(&args.input).await?;
    info!("Loaded {} asset URLs for verification", asset_urls.len());
    
    // Create verifier
    let verifier = Verifier::new(
        args.verify_url.clone(),
        Duration::from_millis(args.timeout),
    ).with_context(|| "Failed to create verifier")?;
    
    // Perform verification
    let result = verifier.verify_sample(&asset_urls, args.sample).await?;
    
    // Write verification report
    write_verification_report(&result, &args.report_out).await?;
    
    info!("Verification completed: {:.2}% survival rate", result.survival_rate);
    
    // Check if survival rate meets requirements
    if result.survival_rate < 99.9 {
        warn!("Survival rate {:.2}% is below the 99.9% requirement", result.survival_rate);
        
        for recommendation in &result.summary.recommendations {
            warn!("Recommendation: {}", recommendation);
        }
    } else {
        info!("Survival rate {:.2}% meets the 99.9% requirement", result.survival_rate);
    }
    
    Ok(())
}

async fn load_asset_urls(input_path: &std::path::Path) -> Result<Vec<String>> {
    let content = tokio::fs::read_to_string(input_path).await
        .with_context(|| format!("Failed to read input file: {:?}", input_path))?;
    
    let mut asset_urls = Vec::new();
    
    // Try to parse as ledger first
    if let Ok(ledger) = serde_json::from_str::<Ledger>(&content) {
        // Extract asset URLs from ledger (this would need ledger to contain URLs)
        info!("Loaded ledger for verification");
        // For now, return empty - in real implementation, extract URLs from ledger
        return Ok(vec![]);
    }
    
    // Try to parse as plan
    for line in content.lines() {
        if line.trim().is_empty() {
            continue;
        }
        
        if let Ok(plan_item) = serde_json::from_str::<crate::planner::PlanItem>(line) {
            // Extract asset URLs from plan items
            for object in plan_item.objects {
                asset_urls.push(object.key);
            }
        }
    }
    
    info!("Loaded {} asset URLs from plan", asset_urls.len());
    
    Ok(asset_urls)
}

async fn write_verification_report(result: &VerificationResult, output_dir: &std::path::Path) -> Result<()> {
    // Create output directory
    tokio::fs::create_dir_all(output_dir).await
        .with_context(|| format!("Failed to create report directory: {:?}", output_dir))?;
    
    // Write JSON report
    let json_path = output_dir.join("verification-report.json");
    let json_content = serde_json::to_string_pretty(result)?;
    tokio::fs::write(&json_path, json_content).await?;
    
    // Write HTML report
    let html_path = output_dir.join("verification-report.html");
    let html_content = generate_html_report(result)?;
    tokio::fs::write(&html_path, html_content).await?;
    
    // Write CSV report
    let csv_path = output_dir.join("verification-details.csv");
    let csv_content = generate_csv_report(result)?;
    tokio::fs::write(&csv_path, csv_content).await?;
    
    info!("Verification report written to {:?}", output_dir);
    
    Ok(())
}

fn generate_html_report(result: &VerificationResult) -> Result<String> {
    let html = format!(r#"
<!DOCTYPE html>
<html>
<head>
    <title>C2 Concierge Verification Report</title>
    <style>
        body {{ font-family: Arial, sans-serif; margin: 20px; }}
        .summary {{ background: #f5f5f5; padding: 15px; border-radius: 5px; margin-bottom: 20px; }}
        .metrics {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin: 20px 0; }}
        .metric {{ background: white; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }}
        .metric h3 {{ margin: 0 0 10px 0; color: #333; }}
        .metric .value {{ font-size: 24px; font-weight: bold; }}
        .success {{ color: #28a745; }}
        .warning {{ color: #ffc107; }}
        .danger {{ color: #dc3545; }}
        table {{ width: 100%; border-collapse: collapse; margin: 20px 0; }}
        th, td {{ padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }}
        th {{ background-color: #f8f9fa; }}
        .recommendations {{ background: #fff3cd; padding: 15px; border-radius: 5px; }}
    </style>
</head>
<body>
    <h1>C2 Concierge Verification Report</h1>
    
    <div class="summary">
        <h2>Verification Summary</h2>
        <p>Generated: {}</p>
        <p>Tenant: {}</p>
        <p>Sample Size: {}</p>
    </div>
    
    <div class="metrics">
        <div class="metric">
            <h3>Survival Rate</h3>
            <div class="value {}">{:.2}%</div>
        </div>
        <div class="metric">
            <h3>Verified</h3>
            <div class="value success">{}</div>
        </div>
        <div class="metric">
            <h3>Failed</h3>
            <div class="value danger">{}</div>
        </div>
        <div class="metric">
            <h3>Avg Response Time</h3>
            <div class="value">{:.0}ms</div>
        </div>
    </div>
    
    <h2>Performance Metrics</h2>
    <table>
        <tr><th>Metric</th><th>Value</th></tr>
        <tr><td>P50 Response Time</td><td>{:.0}ms</td></tr>
        <tr><td>P95 Response Time</td><td>{:.0}ms</td></tr>
        <tr><td>Average Response Time</td><td>{:.0}ms</td></tr>
    </table>
    
    <h2>Error Distribution</h2>
    <table>
        <tr><th>Error Type</th><th>Count</th></tr>
        {}
    </table>
    
    {}
    
    <h2>Detailed Results</h2>
    <table>
        <tr><th>Asset URL</th><th>Status</th><th>Response Time</th><th>Error</th></tr>
        {}
    </table>
</body>
</html>
"#,
        Utc::now().format("%Y-%m-%d %H:%M:%S UTC"),
        result.tenant_id,
        result.sample_size,
        if result.survival_rate >= 99.9 { "success" } else if result.survival_rate >= 95.0 { "warning" } else { "danger" },
        result.survival_rate,
        result.verified_count,
        result.failed_count,
        result.summary.average_response_time_ms,
        result.summary.p50_response_time_ms,
        result.summary.p95_response_time_ms,
        result.summary.average_response_time_ms,
        result.summary.error_distribution.iter()
            .map(|(error_type, count)| format!("<tr><td>{}</td><td>{}</td></tr>", error_type, count))
            .collect::<Vec<_>>()
            .join("\n"),
        if result.summary.recommendations.is_empty() {
            String::new()
        } else {
            format!(r#"
    <div class="recommendations">
        <h3>Recommendations</h3>
        <ul>
            {}
        </ul>
    </div>
"#,
                result.summary.recommendations.iter()
                    .map(|rec| format!("<li>{}</li>", rec))
                    .collect::<Vec<_>>()
                    .join("\n")
            )
        },
        result.verification_details.iter()
            .take(100) // Limit to first 100 for readability
            .map(|detail| {
                format!("<tr><td>{}</td><td>{:?}</td><td>{}ms</td><td>{}</td></tr>",
                    html_escape::encode_text(&detail.asset_url),
                    detail.status,
                    detail.response_time_ms,
                    detail.error_message.as_deref().unwrap_or("")
                )
            })
            .collect::<Vec<_>>()
            .join("\n")
    );
    
    Ok(html)
}

fn generate_csv_report(result: &VerificationResult) -> Result<String> {
    let mut csv = String::new();
    csv.push_str("asset_url,manifest_url,verification_url,status,response_time_ms,error_message,timestamp\n");
    
    for detail in &result.verification_details {
        csv.push_str(&format!(
            "{},{},{},{},{},{},{}\n",
            detail.asset_url,
            detail.manifest_url,
            detail.verification_url,
            format!("{:?}", detail.status),
            detail.response_time_ms,
            detail.error_message.as_deref().unwrap_or(""),
            detail.timestamp.to_rfc3339()
        ));
    }
    
    Ok(csv)
}
