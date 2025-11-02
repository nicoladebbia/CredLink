#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { mkdirSync } from 'fs';

// Security: HTML escaping function to prevent XSS
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
    .replace(/\//g, "&#x2F;");
}

// Security: Validate file path to prevent path traversal
function validateFilePath(filePath: string): string {
  const resolved = resolve(filePath);
  if (!resolved.startsWith(process.cwd())) {
    throw new Error('Path traversal detected');
  }
  return resolved;
}

// Security: Validate URL to prevent malicious links
function validateUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

interface SurvivalReport {
  run_id: string;
  timestamp: string;
  matrix_version: number;
  total_scenarios: number;
  remote_survival_rate: number;
  embed_survival_rate_preserve_only: number;
  scenarios_failed: number;
  results: Array<{
    scenario_id: string;
    sandbox: string;
    remote_survives: boolean;
    embed_survives: boolean;
    headers_snapshot: Record<string, string>;
    manifest_fetch: {
      status: number;
      hash_alignment: boolean;
      url: string;
    };
    timings_ms: {
      edge_worker: number;
      origin: number;
      manifest_fetch: number;
    };
    error?: string;
  }>;
}

function generateHTMLReport(report: SurvivalReport): string {
  const passedCount = report.results.filter(r => r.remote_survives).length;
  const failedCount = report.results.filter(r => !r.remote_survives).length;
  const overallStatus = report.remote_survival_rate >= 0.999 ? 'PASS' : 'FAIL';
  const statusColor = overallStatus === 'PASS' ? '#10b981' : '#ef4444';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>C2 Concierge Survival Report</title>
    <!-- Security: Content Security Policy -->
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; font-src 'self'; object-src 'none'; media-src 'none'; frame-src 'none';">
    <meta http-equiv="X-Content-Type-Options" content="nosniff">
    <meta http-equiv="X-Frame-Options" content="DENY">
    <meta http-equiv="X-XSS-Protection" content="1; mode=block">
    <meta http-equiv="Referrer-Policy" content="strict-origin-when-cross-origin">
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f8fafc;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 8px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #1e40af 0%, #3730a3 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }
        .header h1 {
            margin: 0;
            font-size: 2.5rem;
            font-weight: 700;
        }
        .header .subtitle {
            margin-top: 10px;
            opacity: 0.9;
            font-size: 1.1rem;
        }
        .status-badge {
            display: inline-block;
            padding: 8px 16px;
            border-radius: 20px;
            font-weight: 600;
            font-size: 0.9rem;
            margin-top: 15px;
            background-color: ${statusColor};
            color: white;
        }
        .metrics {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            padding: 30px;
            background: #f1f5f9;
        }
        .metric {
            text-align: center;
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        }
        .metric-value {
            font-size: 2rem;
            font-weight: 700;
            color: #1e293b;
        }
        .metric-label {
            color: #64748b;
            font-size: 0.9rem;
            margin-top: 5px;
        }
        .results {
            padding: 30px;
        }
        .results h2 {
            margin-top: 0;
            color: #1e293b;
        }
        .scenario-grid {
            display: grid;
            gap: 15px;
        }
        .scenario {
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 20px;
            background: white;
            transition: all 0.2s;
        }
        .scenario:hover {
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        .scenario.pass {
            border-left: 4px solid #10b981;
        }
        .scenario.fail {
            border-left: 4px solid #ef4444;
        }
        .scenario-header {
            display: flex;
            justify-content: between;
            align-items: center;
            margin-bottom: 10px;
        }
        .scenario-id {
            font-weight: 600;
            font-size: 1.1rem;
            color: #1e293b;
        }
        .scenario-sandbox {
            display: inline-block;
            padding: 4px 8px;
            background: #e2e8f0;
            border-radius: 4px;
            font-size: 0.8rem;
            color: #475569;
            margin-left: 10px;
        }
        .scenario-status {
            display: flex;
            gap: 10px;
            margin-top: 10px;
        }
        .status-indicator {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 0.8rem;
            font-weight: 500;
        }
        .status-indicator.pass {
            background: #dcfce7;
            color: #166534;
        }
        .status-indicator.fail {
            background: #fee2e2;
            color: #991b1b;
        }
        .scenario-details {
            margin-top: 15px;
            font-size: 0.9rem;
            color: #64748b;
        }
        .detail-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 5px;
        }
        .detail-row span:first-child {
            font-weight: 500;
        }
        .safe-link {
            color: #3b82f6;
            text-decoration: none;
        }
        .safe-link:hover {
            text-decoration: underline;
        }
        .error-message {
            background: #fee2e2;
            border: 1px solid #fecaca;
            border-radius: 4px;
            padding: 10px;
            margin-top: 10px;
            color: #991b1b;
            font-size: 0.9rem;
        }
        .footer {
            padding: 20px 30px;
            background: #f8fafc;
            border-top: 1px solid #e2e8f0;
            color: #64748b;
            font-size: 0.9rem;
            text-align: center;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>C2 Concierge Survival Report</h1>
            <div class="subtitle">Phase 0 - Control Fabric & Survival Doctrine</div>
            <div class="status-badge">${escapeHtml(overallStatus)}</div>
        </div>

        <div class="metrics">
            <div class="metric">
                <div class="metric-value">${(report.remote_survival_rate * 100).toFixed(2)}%</div>
                <div class="metric-label">Remote Survival Rate</div>
            </div>
            <div class="metric">
                <div class="metric-value">${(report.embed_survival_rate_preserve_only * 100).toFixed(1)}%</div>
                <div class="metric-label">Embed Survival (Preserve)</div>
            </div>
            <div class="metric">
                <div class="metric-value">${passedCount}/${report.total_scenarios}</div>
                <div class="metric-label">Scenarios Passed</div>
            </div>
            <div class="metric">
                <div class="metric-value">${report.scenarios_failed}</div>
                <div class="metric-label">Failed Scenarios</div>
            </div>
        </div>

        <div class="results">
            <h2>Scenario Results</h2>
            <div class="scenario-grid">
                ${report.results.map(result => `
                    <div class="scenario ${result.remote_survives ? 'pass' : 'fail'}">
                        <div class="scenario-header">
                            <div>
                                <span class="scenario-id">${escapeHtml(result.scenario_id)}</span>
                                <span class="scenario-sandbox">${escapeHtml(result.sandbox)}</span>
                            </div>
                        </div>
                        <div class="scenario-status">
                            <span class="status-indicator ${result.remote_survives ? 'pass' : 'fail'}">
                                ${result.remote_survives ? '✓' : '✗'} Remote: ${result.remote_survives ? 'Survives' : 'Failed'}
                            </span>
                            <span class="status-indicator ${result.embed_survives ? 'pass' : 'fail'}">
                                ${result.embed_survives ? '✓' : '✗'} Embed: ${result.embed_survives ? 'Survives' : 'Failed'}
                            </span>
                        </div>
                        <div class="scenario-details">
                            <div class="detail-row">
                                <span>Manifest Status:</span>
                                <span>${result.manifest_fetch.status} (${result.manifest_fetch.hash_alignment ? 'Hash OK' : 'Hash Mismatch'})</span>
                            </div>
                            <div class="detail-row">
                                <span>Total Time:</span>
                                <span>${result.timings_ms.origin + result.timings_ms.manifest_fetch}ms</span>
                            </div>
                            <div class="detail-row">
                                <span>Policy:</span>
                                <span>${escapeHtml(result.headers_snapshot['x-c2-policy'] || 'None')}</span>
                            </div>
                            ${result.manifest_fetch.url && validateUrl(result.manifest_fetch.url) ? `
                            <div class="detail-row">
                                <span>Manifest URL:</span>
                                <span><a href="${escapeHtml(result.manifest_fetch.url)}" target="_blank" class="safe-link" rel="noopener noreferrer">${escapeHtml(result.manifest_fetch.url)}</a></span>
                            </div>` : ''}
                        </div>
                        ${result.error ? `<div class="error-message">Error: ${escapeHtml(result.error)}</div>` : ''}
                    </div>
                `).join('')}
            </div>
        </div>

        <div class="footer">
            <p>Report generated: ${escapeHtml(new Date(report.timestamp).toLocaleString())}</p>
            <p>Run ID: ${escapeHtml(report.run_id)} | Matrix Version: ${report.matrix_version}</p>
        </div>
    </div>
</body>
</html>`;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: node index.js <survival.json> <output.html>');
    process.exit(1);
  }

  const [inputPath, outputPath] = args;
  
  try {
    // Security: Validate input file path
    const validatedInputPath = validateFilePath(inputPath);
    
    // Security: Validate and create output directory
    const validatedOutputPath = validateFilePath(outputPath);
    mkdirSync(dirname(validatedOutputPath), { recursive: true });
    
    const reportData = readFileSync(validatedInputPath, 'utf8');
    const report: SurvivalReport = JSON.parse(reportData);
    
    // Security: Validate report structure
    if (!report || typeof report !== 'object' || !report.results || !Array.isArray(report.results)) {
      throw new Error('Invalid report structure');
    }
    
    const html = generateHTMLReport(report);
    writeFileSync(validatedOutputPath, html);
    
    console.log(`✅ HTML report generated: ${validatedOutputPath}`);
  } catch (error) {
    console.error('❌ Failed to generate report:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
