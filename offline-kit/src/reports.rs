use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use maud::{html, Markup, DOCTYPE};
use qrcode::QrCode;
use base64::Engine;
use std::io::Write;

use crate::verification::{VerificationResult, Verdict};

/// Report generator for offline verification results
pub struct ReportGenerator {
    include_qr: bool,
}

impl ReportGenerator {
    pub fn new(include_qr: bool) -> Self {
        Self { include_qr }
    }
    
    /// Generate report in specified format
    pub fn generate(
        &self,
        result: &VerificationResult,
        output_path: &std::path::Path,
        format: ReportFormat,
    ) -> Result<()> {
        // Validate output path to prevent directory traversal
        let path_str = output_path.to_string_lossy();
        if path_str.contains("..") || path_str.contains('~') || !path_str.contains('.') {
            return Err(anyhow!("Invalid output file path"));
        }
        
        // Get parent directory and ensure it exists or can be created
        if let Some(parent) = output_path.parent() {
            // Validate parent directory path
            let parent_str = parent.to_string_lossy();
            if parent_str.contains("..") || parent_str.contains('~') {
                return Err(anyhow!("Invalid parent directory path"));
            }
            
            if !parent.exists() {
                std::fs::create_dir_all(parent)
                    .context("Failed to create output directory")?;
            }
            
            // Check if parent directory is within allowed bounds
            let canonical_parent = parent.canonicalize()
                .context("Failed to canonicalize parent directory")?;
            
            let current_dir = std::env::current_dir()
                .context("Failed to get current directory")?;
            
            if !canonical_parent.starts_with(&current_dir) && 
               !canonical_parent.starts_with("/tmp") && 
               !canonical_parent.starts_with("/var/tmp") {
                return Err(anyhow!("Output directory must be within current directory or temp directory"));
            }
        }
        
        match format {
            ReportFormat::Html => self.generate_html_report(result, output_path)?,
            ReportFormat::Json => self.generate_json_report(result, output_path)?,
            ReportFormat::Pdf => self.generate_pdf_report(result, output_path)?,
        }
        
        Ok(())
    }
    
    /// Generate HTML report
    fn generate_html_report(&self, result: &VerificationResult, output_path: &std::path::Path) -> Result<()> {
        let html_content = self.render_html_report(result)?;
        
        std::fs::write(output_path, html_content.into_string())
            .context("Failed to write HTML report")?;
        
        Ok(())
    }
    
    /// Render HTML report using Maud templates
    fn render_html_report(&self, result: &VerificationResult) -> Result<Markup> {
        let qr_code_data = if self.include_qr {
            Some(self.generate_qr_code_data(&result.asset_id)?)
        } else {
            None
        };
        
        let html = html! {
            (DOCTYPE)
            html lang="en" {
                head {
                    meta charset="UTF-8";
                    meta name="viewport" content="width=device-width, initial-scale=1.0";
                    title { "C2 Concierge Offline Verification Report" }
                    style { (self.get_report_styles()) }
                }
                body {
                    div class="report-container" {
                        // Header
                        header class="report-header" {
                            h1 { "C2 Concierge Offline Verification Report" }
                            div class="header-meta" {
                                span class="offline-indicator" { "🔒 OFFLINE MODE" }
                                span class="timestamp" { (format!("Generated: {}", Utc::now().format("%Y-%m-%d %H:%M:%S UTC"))) }
                            }
                        }
                        
                        // Verdict Summary
                        section class="verdict-section" {
                            div class=(format!("verdict-badge {}", result.verdict.color())) {
                                span class="verdict-icon" { (self.get_verdict_icon(&result.verdict)) }
                                div {
                                    h2 { (format!("{:?}", result.verdict)) }
                                    p { (self.get_verdict_description(&result.verdict)) }
                                }
                            }
                        }
                        
                        // Asset Information
                        section class="asset-section" {
                            h3 { "Asset Information" }
                            div class="info-grid" {
                                div class="info-item" {
                                    span class="label" { "File Path:" }
                                    span class="value" { (result.asset_path.display()) }
                                }
                                div class="info-item" {
                                    span class="label" { "Asset ID:" }
                                    span class="value mono" { (result.asset_id) }
                                }
                                div class="info-item" {
                                    span class="label" { "Trust As-Of:" }
                                    span class="value" { (result.trust_as_of.format("%Y-%m-%d %H:%M:%S UTC")) }
                                }
                                div class="info-item" {
                                    span class="label" { "Network Status:" }
                                    span class="value offline" { "DISABLED" }
                                }
                            }
                        }
                        
                        // Verification Steps
                        section class="steps-section" {
                            h3 { "Verification Steps" }
                            table class="steps-table" {
                                thead {
                                    tr {
                                        th { "Step" }
                                        th { "Status" }
                                        th { "Message" }
                                        th { "Timestamp" }
                                    }
                                }
                                tbody {
                                    @for step in &result.steps {
                                        tr class=(format!("status-{}", step.status.to_string().to_lowercase())) {
                                            td { (step.step_name) }
                                            td { (self.format_step_status(&step.status)) }
                                            td { (step.message) }
                                            td { (step.timestamp.format("%H:%M:%S")) }
                                        }
                                    }
                                }
                            }
                        }
                        
                        // Warnings
                        @if !result.warnings.is_empty() {
                            section class="warnings-section" {
                                h3 { "⚠️ Warnings" }
                                ul class="warnings-list" {
                                    @for warning in &result.warnings {
                                        li { (warning) }
                                    }
                                }
                            }
                        }
                        
                        // Unresolved References
                        @if !result.unresolved_references.is_empty() {
                            section class="unresolved-section" {
                                h3 { "🌐 Unresolved References (Offline)" }
                                p class="unresolved-note" {
                                    "The following references could not be verified because network access is disabled in offline mode."
                                }
                                ul class="unresolved-list" {
                                    @for ref_uri in &result.unresolved_references {
                                        li class="mono" { (ref_uri) }
                                    }
                                }
                            }
                        }
                        
                        // Timestamp Verification
                        @if let Some(timestamp) = &result.timestamp_verification {
                            section class="timestamp-section" {
                                h3 { "⏰ RFC 3161 Timestamp Verification" }
                                div class="timestamp-details" {
                                    div class="timestamp-item" {
                                        span class="label" { "Valid:" }
                                        span class=(format!("value {}", if timestamp.is_valid { "success" } else { "error" })) {
                                            (if timestamp.is_valid { "✓ Yes" } else { "✗ No" })
                                        }
                                    }
                                    div class="timestamp-item" {
                                        span class="label" { "TSA:" }
                                        span class="value" { (timestamp.tsa_id) }
                                    }
                                    div class="timestamp-item" {
                                        span class="label" { "Timestamp:" }
                                        span class="value" { (timestamp.timestamp.format("%Y-%m-%d %H:%M:%S UTC")) }
                                    }
                                    div class="timestamp-item" {
                                        span class="label" { "Message Imprint:" }
                                        span class=(format!("value {}", if timestamp.imprint_valid { "success" } else { "error" })) {
                                            (if timestamp.imprint_valid { "✓ Valid" } else { "✗ Invalid" })
                                        }
                                    }
                                    div class="timestamp-item" {
                                        span class="label" { "Signature:" }
                                        span class=(format!("value {}", if timestamp.signature_valid { "success" } else { "error" })) {
                                            (if timestamp.signature_valid { "✓ Valid" } else { "✗ Invalid" })
                                        }
                                    }
                                    div class="timestamp-item" {
                                        span class="label" { "Certificate Chain:" }
                                        span class=(format!("value {}", if timestamp.chain_valid { "success" } else { "error" })) {
                                            (if timestamp.chain_valid { "✓ Valid" } else { "✗ Invalid" })
                                        }
                                    }
                                }
                            }
                        }
                        
                        // QR Code Section
                        @if let Some(qr_data) = qr_code_data {
                            section class="qr-section" {
                                h3 { "📱 Online Re-check" }
                                div class="qr-container" {
                                    div class="qr-code" {
                                        img src=(format!("data:image/png;base64,{}", qr_data)) alt="QR Code" />
                                    }
                                    div class="qr-info" {
                                        p {
                                            strong { "Scan to verify online:" }
                                        }
                                        p class="qr-instruction" {
                                            "Use your mobile device to scan this QR code and re-check the verification online. "
                                            "This will provide current revocation status and resolve any remote references."
                                        }
                                        p class="qr-url mono" {
                                            (format!("https://verify.c2concierge.org/asset/{}", result.asset_id))
                                        }
                                    }
                                }
                            }
                        }
                        
                        // Footer
                        footer class="report-footer" {
                            div class="footer-content" {
                                p { "Generated by C2 Concierge Offline Verification Kit v1.0.0" }
                                p { "Security Level: MAXIMUM | Network Access: DISABLED" }
                                p { (format!("Report ID: {}", self.generate_report_id())) }
                            }
                        }
                    }
                }
            }
        };
        
        Ok(html)
    }
    
    /// Generate JSON report
    fn generate_json_report(&self, result: &VerificationResult, output_path: &std::path::Path) -> Result<()> {
        let json_report = serde_json::json!({
            "report_metadata": {
                "generated_at": Utc::now(),
                "generator": "C2 Concierge Offline Verification Kit",
                "version": "1.0.0",
                "security_level": "MAXIMUM",
                "network_access": "DISABLED",
                "report_id": self.generate_report_id()
            },
            "verification_result": result,
            "qr_code": if self.include_qr {
                Some({
                    let qr_data = self.generate_qr_code_data(&result.asset_id)?;
                    serde_json::json!({
                        "data_url": format!("data:image/png;base64,{}", qr_data),
                        "verify_url": format!("https://verify.c2concierge.org/asset/{}", result.asset_id)
                    })
                })
            } else {
                None
            }
        });
        
        std::fs::write(
            output_path,
            serde_json::to_string_pretty(&json_report)?
        ).context("Failed to write JSON report")?;
        
        Ok(())
    }
    
    /// Generate PDF report
    fn generate_pdf_report(&self, result: &VerificationResult, output_path: &std::path::Path) -> Result<()> {
        // For now, generate HTML and note that PDF conversion would require additional dependencies
        let html_path = output_path.with_extension("html");
        self.generate_html_report(result, &html_path)?;
        
        // In a real implementation, this would use a PDF generation library
        // For now, we'll create a simple text-based report
        let pdf_content = self.generate_text_report(result)?;
        
        std::fs::write(output_path, pdf_content)
            .context("Failed to write PDF report")?;
        
        Ok(())
    }
    
    /// Generate text-based report (fallback for PDF)
    fn generate_text_report(&self, result: &VerificationResult) -> Result<String> {
        let mut content = String::new();
        
        content.push_str("C2 Concierge Offline Verification Report\n");
        content.push_str("==========================================\n\n");
        
        content.push_str(&format!("Generated: {}\n", Utc::now().format("%Y-%m-%d %H:%M:%S UTC")));
        content.push_str("Network Status: DISABLED\n");
        content.push_str("Security Level: MAXIMUM\n\n");
        
        content.push_str("VERDICT: ");
        content.push_str(&format!("{:?}\n\n", result.verdict));
        
        content.push_str("ASSET INFORMATION:\n");
        content.push_str("------------------\n");
        content.push_str(&format!("File: {}\n", result.asset_path.display()));
        content.push_str(&format!("Asset ID: {}\n", result.asset_id));
        content.push_str(&format!("Trust As-Of: {}\n\n", result.trust_as_of.format("%Y-%m-%d %H:%M:%S UTC")));
        
        content.push_str("VERIFICATION STEPS:\n");
        content.push_str("-------------------\n");
        for step in &result.steps {
            content.push_str(&format!(
                "{}: {} - {}\n",
                step.step_name,
                self.format_step_status(&step.status),
                step.message
            ));
        }
        
        if !result.warnings.is_empty() {
            content.push_str("\nWARNINGS:\n");
            content.push_str("---------\n");
            for warning in &result.warnings {
                content.push_str(&format!("• {}\n", warning));
            }
        }
        
        if !result.unresolved_references.is_empty() {
            content.push_str("\nUNRESOLVED REFERENCES (OFFLINE):\n");
            content.push_str("----------------------------------\n");
            for ref_uri in &result.unresolved_references {
                content.push_str(&format!("• {}\n", ref_uri));
            }
        }
        
        if self.include_qr {
            content.push_str(&format!(
                "\nONLINE RE-CHECK URL:\n{}",
                format!("https://verify.c2concierge.org/asset/{}", result.asset_id)
            ));
        }
        
        Ok(content)
    }
    
    /// Generate QR code data URL
    fn generate_qr_code_data(&self, asset_id: &str) -> Result<String> {
        let verify_url = format!("https://verify.c2concierge.org/asset/{}", asset_id);
        
        let qr_code = QrCode::new(&verify_url)
            .context("Failed to create QR code")?;
        
        let image = qr_code.render::<image::Luma<u8>>().build();
        
        let mut buffer = Vec::new();
        let mut cursor = std::io::Cursor::new(&mut buffer);
        
        image.write_to(&mut cursor, image::ImageFormat::Png)
            .context("Failed to encode QR code as PNG")?;
        
        Ok(base64::engine::general_purpose::STANDARD.encode(&buffer))
    }
    
    /// Get report CSS styles
    fn get_report_styles(&self) -> &'static str {
        include_str!("../assets/report-styles.css")
    }
    
    /// Get verdict icon
    fn get_verdict_icon(&self, verdict: &Verdict) -> &'static str {
        match verdict {
            Verdict::Verified => "✅",
            Verdict::VerifiedWithWarnings => "⚠️",
            Verdict::Unverified => "❌",
            Verdict::Unresolved => "🌐",
            Verdict::TrustOutdated => "⏰",
        }
    }
    
    /// Get verdict description
    fn get_verdict_description(&self, verdict: &Verdict) -> &'static str {
        match verdict {
            Verdict::Verified => "Asset is fully verified and trusted",
            Verdict::VerifiedWithWarnings => "Asset verified with some warnings",
            Verdict::Unverified => "Asset signature is invalid or tampered",
            Verdict::Unresolved => "Contains unresolved remote references (offline)",
            Verdict::TrustOutdated => "Trust pack is outdated but signature is valid",
        }
    }
    
    /// Format step status for display
    fn format_step_status(&self, status: &crate::verification::StepStatus) -> &'static str {
        match status {
            crate::verification::StepStatus::Passed => "✓ Passed",
            crate::verification::StepStatus::Failed => "✗ Failed",
            crate::verification::StepStatus::Warning => "⚠ Warning",
            crate::verification::StepStatus::Skipped => "- Skipped",
        }
    }
    
    /// Generate unique report ID
    fn generate_report_id(&self) -> String {
        use sha2::{Sha256, Digest};
        
        let mut hasher = Sha256::new();
        hasher.update(Utc::now().timestamp().to_string().as_bytes());
        hasher.update("c2c-offline-report".as_bytes());
        
        format!("{:x}", hasher.finalize())[..16].to_string()
    }
}

/// Report format options
#[derive(Debug, Clone)]
pub enum ReportFormat {
    Html,
    Json,
    Pdf,
}

impl std::str::FromStr for ReportFormat {
    type Err = anyhow::Error;
    
    fn from_str(s: &str) -> Result<Self> {
        match s.to_lowercase().as_str() {
            "html" => Ok(ReportFormat::Html),
            "json" => Ok(ReportFormat::Json),
            "pdf" => Ok(ReportFormat::Pdf),
            _ => Err(anyhow::anyhow!("Invalid report format: {}", s)),
        }
    }
}
