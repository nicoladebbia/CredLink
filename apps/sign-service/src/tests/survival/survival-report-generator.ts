import { writeFile } from 'fs/promises';
import { RealWorldSurvivalReport, RealWorldTestResult } from './survival-types';
import { logger } from '../../utils/logger';

/**
 * Survival Report Generator
 * 
 * Generates comprehensive reports from survival test results
 */
export class SurvivalReportGenerator {
  /**
   * Generate markdown report
   */
  async generateMarkdownReport(
    report: RealWorldSurvivalReport,
    outputPath: string
  ): Promise<void> {
    const markdown = this.buildMarkdownReport(report);
    await writeFile(outputPath, markdown, 'utf8');
    logger.info('Survival report generated', { path: outputPath });
  }

  /**
   * Generate JSON report
   */
  async generateJSONReport(
    report: RealWorldSurvivalReport,
    outputPath: string
  ): Promise<void> {
    const json = JSON.stringify(report, null, 2);
    await writeFile(outputPath, json, 'utf8');
    logger.info('JSON report generated', { path: outputPath });
  }

  /**
   * Generate HTML report
   */
  async generateHTMLReport(
    report: RealWorldSurvivalReport,
    outputPath: string
  ): Promise<void> {
    const html = this.buildHTMLReport(report);
    await writeFile(outputPath, html, 'utf8');
    logger.info('HTML report generated', { path: outputPath });
  }

  /**
   * Build markdown report
   */
  private buildMarkdownReport(report: RealWorldSurvivalReport): string {
    const lines: string[] = [];

    // Header
    lines.push('# C2PA Signature Survival Test Report\n');
    lines.push(`**Generated:** ${new Date(report.timestamp).toLocaleString()}\n`);
    lines.push('---\n');

    // Executive Summary
    lines.push('## 📊 Executive Summary\n');
    lines.push(`- **Total Scenarios Tested:** ${report.totalScenarios}`);
    lines.push(`- **Passed:** ${report.passedScenarios} (${((report.passedScenarios / report.totalScenarios) * 100).toFixed(1)}%)`);
    lines.push(`- **Failed:** ${report.failedScenarios} (${((report.failedScenarios / report.totalScenarios) * 100).toFixed(1)}%)`);
    lines.push(`- **Average Survival Rate:** ${(report.averageSurvival * 100).toFixed(1)}%`);
    lines.push(`- **Overall Status:** ${report.passedScenarios === report.totalScenarios ? '✅ PASS' : '⚠️ NEEDS ATTENTION'}\n`);

    // Critical Failures
    if (report.criticalFailures.length > 0) {
      lines.push('## 🚨 Critical Failures\n');
      report.criticalFailures.forEach(failure => {
        lines.push(`- ${failure}`);
      });
      lines.push('');
    }

    // Recommendations
    if (report.recommendations.length > 0) {
      lines.push('## 💡 Recommendations\n');
      report.recommendations.forEach(rec => {
        lines.push(`- ${rec}`);
      });
      lines.push('');
    }

    // Results by Category
    lines.push('## 📂 Results by Category\n');
    Object.entries(report.byCategory).forEach(([category, stats]) => {
      const passRate = (stats.passedScenarios / stats.totalScenarios) * 100;
      const status = passRate >= 90 ? '✅' : passRate >= 70 ? '⚠️' : '❌';
      
      lines.push(`### ${status} ${category.toUpperCase()}\n`);
      lines.push(`- **Scenarios:** ${stats.totalScenarios}`);
      lines.push(`- **Passed:** ${stats.passedScenarios}/${stats.totalScenarios} (${passRate.toFixed(1)}%)`);
      lines.push(`- **Average Survival:** ${(stats.averageSurvival * 100).toFixed(1)}%\n`);
    });

    // Results by Severity
    lines.push('## ⚡ Results by Severity\n');
    const severityOrder = ['low', 'medium', 'high', 'extreme'];
    severityOrder.forEach(severity => {
      const stats = report.bySeverity[severity];
      if (stats) {
        const passRate = (stats.passedScenarios / stats.totalScenarios) * 100;
        const status = passRate >= 90 ? '✅' : passRate >= 70 ? '⚠️' : '❌';
        
        lines.push(`### ${status} ${severity.toUpperCase()} Severity\n`);
        lines.push(`- **Scenarios:** ${stats.totalScenarios}`);
        lines.push(`- **Passed:** ${stats.passedScenarios}/${stats.totalScenarios} (${passRate.toFixed(1)}%)`);
        lines.push(`- **Average Survival:** ${(stats.averageSurvival * 100).toFixed(1)}%\n`);
      }
    });

    // Detailed Results
    lines.push('## 📋 Detailed Test Results\n');
    
    // Group by category
    const byCategory = new Map<string, RealWorldTestResult[]>();
    report.results.forEach(result => {
      const existing = byCategory.get(result.category) || [];
      existing.push(result);
      byCategory.set(result.category, existing);
    });

    byCategory.forEach((results, category) => {
      lines.push(`### ${category.toUpperCase()}\n`);
      
      results.forEach(result => {
        const status = result.passed ? '✅' : '❌';
        const survivalPercent = (result.survivalRate * 100).toFixed(1);
        const expectedPercent = (result.expectedSurvival * 100).toFixed(1);
        
        lines.push(`#### ${status} ${result.scenario} (${result.platform})\n`);
        lines.push(`- **Description:** ${result.description}`);
        lines.push(`- **Survival Rate:** ${survivalPercent}% (expected: ${expectedPercent}%)`);
        lines.push(`- **Average Confidence:** ${result.averageConfidence.toFixed(1)}`);
        lines.push(`- **Sample Size:** ${result.sampleSize}`);
        lines.push(`- **Processing Time:** ${result.processingTime}ms`);
        lines.push(`- **Severity:** ${result.severity}`);
        
        if (Object.keys(result.failureReasons).length > 0) {
          lines.push(`- **Failure Reasons:**`);
          Object.entries(result.failureReasons).forEach(([reason, count]) => {
            lines.push(`  - ${reason}: ${count}`);
          });
        }
        
        lines.push('');
      });
    });

    // Summary Table
    lines.push('## 📊 Summary Table\n');
    lines.push('| Platform | Category | Severity | Survival | Expected | Status |');
    lines.push('|----------|----------|----------|----------|----------|--------|');
    
    report.results.forEach(result => {
      const status = result.passed ? '✅' : '❌';
      const survival = `${(result.survivalRate * 100).toFixed(1)}%`;
      const expected = `${(result.expectedSurvival * 100).toFixed(1)}%`;
      
      lines.push(`| ${result.platform} | ${result.category} | ${result.severity} | ${survival} | ${expected} | ${status} |`);
    });
    
    lines.push('');

    // Footer
    lines.push('---\n');
    lines.push('*Report generated by CredLink C2PA Survival Testing Framework*\n');

    return lines.join('\n');
  }

  /**
   * Build HTML report
   */
  private buildHTMLReport(report: RealWorldSurvivalReport): string {
    const passRate = (report.passedScenarios / report.totalScenarios) * 100;
    const statusColor = passRate >= 90 ? '#10b981' : passRate >= 70 ? '#f59e0b' : '#ef4444';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>C2PA Survival Test Report</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f9fafb;
      color: #1f2937;
      padding: 2rem;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    .header {
      background: white;
      padding: 2rem;
      border-radius: 0.5rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      margin-bottom: 2rem;
    }
    h1 { font-size: 2rem; margin-bottom: 0.5rem; }
    .timestamp { color: #6b7280; font-size: 0.875rem; }
    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }
    .stat-card {
      background: white;
      padding: 1.5rem;
      border-radius: 0.5rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .stat-value {
      font-size: 2rem;
      font-weight: bold;
      color: ${statusColor};
    }
    .stat-label { color: #6b7280; font-size: 0.875rem; margin-top: 0.5rem; }
    .section {
      background: white;
      padding: 2rem;
      border-radius: 0.5rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      margin-bottom: 2rem;
    }
    h2 { font-size: 1.5rem; margin-bottom: 1rem; border-bottom: 2px solid #e5e7eb; padding-bottom: 0.5rem; }
    table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
    th, td { padding: 0.75rem; text-align: left; border-bottom: 1px solid #e5e7eb; }
    th { background: #f9fafb; font-weight: 600; }
    .status-pass { color: #10b981; font-weight: bold; }
    .status-fail { color: #ef4444; font-weight: bold; }
    .progress-bar {
      height: 0.5rem;
      background: #e5e7eb;
      border-radius: 0.25rem;
      overflow: hidden;
      margin-top: 0.5rem;
    }
    .progress-fill {
      height: 100%;
      background: ${statusColor};
      transition: width 0.3s;
    }
    .recommendation {
      background: #fef3c7;
      border-left: 4px solid #f59e0b;
      padding: 1rem;
      margin-bottom: 0.5rem;
      border-radius: 0.25rem;
    }
    .critical {
      background: #fee2e2;
      border-left: 4px solid #ef4444;
      padding: 1rem;
      margin-bottom: 0.5rem;
      border-radius: 0.25rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🛡️ C2PA Signature Survival Test Report</h1>
      <div class="timestamp">Generated: ${new Date(report.timestamp).toLocaleString()}</div>
    </div>

    <div class="summary">
      <div class="stat-card">
        <div class="stat-value">${report.totalScenarios}</div>
        <div class="stat-label">Total Scenarios</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${report.passedScenarios}</div>
        <div class="stat-label">Passed</div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${passRate}%"></div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${(report.averageSurvival * 100).toFixed(1)}%</div>
        <div class="stat-label">Average Survival</div>
      </div>
      <div class="stat-card">
        <div class="stat-value ${passRate >= 90 ? 'status-pass' : 'status-fail'}">${passRate >= 90 ? 'PASS' : 'FAIL'}</div>
        <div class="stat-label">Overall Status</div>
      </div>
    </div>

    ${report.criticalFailures.length > 0 ? `
    <div class="section">
      <h2>🚨 Critical Failures</h2>
      ${report.criticalFailures.map(f => `<div class="critical">${f}</div>`).join('')}
    </div>
    ` : ''}

    ${report.recommendations.length > 0 ? `
    <div class="section">
      <h2>💡 Recommendations</h2>
      ${report.recommendations.map(r => `<div class="recommendation">${r}</div>`).join('')}
    </div>
    ` : ''}

    <div class="section">
      <h2>📋 Test Results</h2>
      <table>
        <thead>
          <tr>
            <th>Platform</th>
            <th>Category</th>
            <th>Severity</th>
            <th>Survival Rate</th>
            <th>Expected</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${report.results.map(r => `
            <tr>
              <td>${r.platform}</td>
              <td>${r.category}</td>
              <td>${r.severity}</td>
              <td>${(r.survivalRate * 100).toFixed(1)}%</td>
              <td>${(r.expectedSurvival * 100).toFixed(1)}%</td>
              <td class="${r.passed ? 'status-pass' : 'status-fail'}">${r.passed ? '✅ PASS' : '❌ FAIL'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  </div>
</body>
</html>`;
  }

  /**
   * Generate console summary
   */
  printConsoleSummary(report: RealWorldSurvivalReport): void {
    console.log('\n' + '='.repeat(80));
    console.log('C2PA SIGNATURE SURVIVAL TEST REPORT');
    console.log('='.repeat(80));
    console.log(`\nGenerated: ${new Date(report.timestamp).toLocaleString()}\n`);

    console.log('SUMMARY:');
    console.log(`  Total Scenarios: ${report.totalScenarios}`);
    console.log(`  Passed: ${report.passedScenarios} (${((report.passedScenarios / report.totalScenarios) * 100).toFixed(1)}%)`);
    console.log(`  Failed: ${report.failedScenarios} (${((report.failedScenarios / report.totalScenarios) * 100).toFixed(1)}%)`);
    console.log(`  Average Survival: ${(report.averageSurvival * 100).toFixed(1)}%`);
    console.log(`  Status: ${report.passedScenarios === report.totalScenarios ? '✅ PASS' : '⚠️ NEEDS ATTENTION'}\n`);

    if (report.criticalFailures.length > 0) {
      console.log('CRITICAL FAILURES:');
      report.criticalFailures.forEach(f => console.log(`  ❌ ${f}`));
      console.log('');
    }

    if (report.recommendations.length > 0) {
      console.log('RECOMMENDATIONS:');
      report.recommendations.forEach(r => console.log(`  💡 ${r}`));
      console.log('');
    }

    console.log('BY CATEGORY:');
    Object.entries(report.byCategory).forEach(([category, stats]) => {
      const passRate = (stats.passedScenarios / stats.totalScenarios) * 100;
      const status = passRate >= 90 ? '✅' : passRate >= 70 ? '⚠️' : '❌';
      console.log(`  ${status} ${category}: ${passRate.toFixed(1)}% (${stats.passedScenarios}/${stats.totalScenarios})`);
    });

    console.log('\n' + '='.repeat(80) + '\n');
  }
}
