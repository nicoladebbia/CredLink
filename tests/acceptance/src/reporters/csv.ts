import { SurvivalReport, ScenarioResult, FailureCode } from '../types.js';
import { writeFileSync } from 'fs';
import { createHash } from 'crypto';

export function generateCsvReport(report: SurvivalReport, outputPath: string): void {
  // Generate detailed scenario results CSV
  const csvHeaders = [
    'run_id',
    'timestamp',
    'scenario_id',
    'sandbox',
    'remote_survives',
    'embed_survives',
    'failure_code',
    'failure_category',
    'severity',
    'manifest_status',
    'hash_alignment',
    'edge_worker_ms',
    'origin_ms',
    'manifest_fetch_ms',
    'total_ms'
  ];

  const csvRows = [csvHeaders.join(',')];

  for (const result of report.results) {
    const row = [
      report.run_id,
      report.timestamp,
      result.scenario_id,
      result.sandbox,
      result.remote_survives ? 'true' : 'false',
      result.embed_survives ? 'true' : 'false',
      result.failure_code,
      result.failure_taxonomy.category,
      result.failure_taxonomy.severity,
      result.manifest_fetch.status,
      result.manifest_fetch.hash_alignment ? 'true' : 'false',
      result.timings_ms.edge_worker,
      result.timings_ms.origin,
      result.timings_ms.manifest_fetch,
      result.timings_ms.edge_worker + result.timings_ms.origin + result.timings_ms.manifest_fetch
    ];
    csvRows.push(row.join(','));
  }

  const csvPath = `${outputPath}/survival-results.csv`;
  writeFileSync(csvPath, csvRows.join('\n'));
}

export function generateSummaryReport(report: SurvivalReport, outputPath: string): void {
  // Generate summary text report
  const summaryLines = [
    `C2 Concierge Survival Report - ${report.run_id}`,
    `Generated: ${report.timestamp}`,
    `Matrix Version: ${report.matrix_version}`,
    '',
    '=== SUMMARY METRICS ===',
    `Total Scenarios: ${report.total_scenarios}`,
    `Remote Survival Rate: ${(report.remote_survival_rate * 100).toFixed(2)}%`,
    `Embed Survival Rate (Preserve Only): ${(report.embed_survival_rate_preserve_only * 100).toFixed(1)}%`,
    `Failed Scenarios: ${report.scenarios_failed}`,
    '',
    '=== FAILURE BREAKDOWN ===',
  ];

  for (const [code, count] of Object.entries(report.failure_breakdown)) {
    if (count > 0) {
      summaryLines.push(`${code}: ${count}`);
    }
  }

  summaryLines.push('');
  summaryLines.push('=== DETERMINISTIC ARTIFACTS ===');
  summaryLines.push(`Report Hash: ${createReportHash(report)}`);
  summaryLines.push(`Verification: SHA256(${report.run_id})`);

  const summaryPath = `${outputPath}/survival-summary.txt`;
  writeFileSync(summaryPath, summaryLines.join('\n'));
}

function createReportHash(report: SurvivalReport): string {
  // Simple hash implementation for Phase 0
  const canonical = JSON.stringify({
    run_id: report.run_id,
    timestamp: report.timestamp,
    remote_survival_rate: report.remote_survival_rate,
    embed_survival_rate_preserve_only: report.embed_survival_rate_preserve_only,
    scenarios_failed: report.scenarios_failed,
    failure_breakdown: report.failure_breakdown
  }, Object.keys(report).sort());
  
  return createHash('sha256').update(canonical).digest('hex').substring(0, 16);
}
