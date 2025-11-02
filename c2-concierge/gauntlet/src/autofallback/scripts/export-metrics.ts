#!/usr/bin/env node

/**
 * Phase 6 - Optimizer Auto-Fallback: Metrics Export Script
 * Exports system metrics for monitoring and analysis
 */

import { writeFileSync } from 'fs';
import { join } from 'path';

// Use built-in fetch for Node.js 18+
declare const fetch: (input: string | URL, init?: RequestInit) => Promise<Response>;

interface MetricsExportConfig {
  endpoint: string;
  route: string;
  format: 'json' | 'prometheus' | 'csv';
  output: string;
}

interface MetricsExportResult {
  config: MetricsExportConfig;
  metrics: any;
  timestamp: string;
  errors: string[];
}

class MetricsExporter {
  private config: MetricsExportConfig;
  private results: MetricsExportResult;

  constructor(config: MetricsExportConfig) {
    this.config = config;
    this.results = {
      config,
      metrics: {},
      timestamp: new Date().toISOString(),
      errors: []
    };
  }

  async export(): Promise<MetricsExportResult> {
    console.log(`📊 Exporting metrics for ${this.config.route} in ${this.config.format} format`);

    try {
      // Fetch current policy and metrics
      const policyResponse = await fetch(`${this.config.endpoint}/_c2/policy?route=${encodeURIComponent(this.config.route)}`);
      
      if (!policyResponse.ok) {
        throw new Error(`Failed to fetch policy: ${policyResponse.statusText}`);
      }

      const policyData = await policyResponse.json() as any;
      
      // Build metrics object
      this.results.metrics = {
        route: policyData.route,
        mode: policyData.mode,
        score: policyData.score || 0,
        samples: policyData.samples || 0,
        embedSurvival: policyData.embedSurvival || 0,
        lastDecision: policyData.lastDecision,
        timestamp: this.results.timestamp
      };

      // Format output
      let formattedOutput: string;
      
      switch (this.config.format) {
        case 'json':
          formattedOutput = JSON.stringify(this.results.metrics, null, 2);
          break;
        case 'prometheus':
          formattedOutput = this.formatPrometheus();
          break;
        case 'csv':
          formattedOutput = this.formatCSV();
          break;
        default:
          throw new Error(`Unsupported format: ${this.config.format}`);
      }

      // Write to file
      const outputFile = this.config.output || `metrics-${this.config.route}-${Date.now()}.${this.config.format}`;
      writeFileSync(outputFile, formattedOutput);

      console.log(`✅ Metrics exported to: ${outputFile}`);

    } catch (error) {
      this.results.errors.push(`Export failed: ${error}`);
    }

    return this.results;
  }

  private formatPrometheus(): string {
    const metrics = this.results.metrics;
    let output = '';

    output += `# HELP c2_autofallback_mode Current fallback mode (0=NORMAL, 1=FALLBACK_REMOTE_ONLY, 2=RECOVERY_GUARD)\n`;
    output += `# TYPE c2_autofallback_mode gauge\n`;
    output += `c2_autofallback_mode{route="${metrics.route}"} ${this.modeToNumber(metrics.mode)}\n`;

    output += `\n# HELP c2_autofallback_score Current strip-risk score\n`;
    output += `# TYPE c2_autofallback_score gauge\n`;
    output += `c2_autofallback_score{route="${metrics.route}"} ${metrics.score}\n`;

    output += `\n# HELP c2_autofallback_samples Number of samples in current window\n`;
    output += `# TYPE c2_autofallback_samples gauge\n`;
    output += `c2_autofallback_samples{route="${metrics.route}"} ${metrics.samples}\n`;

    output += `\n# HELP c2_autofallback_embed_survival Embed survival rate\n`;
    output += `# TYPE c2_autofallback_embed_survival gauge\n`;
    output += `c2_autofallback_embed_survival{route="${metrics.route}"} ${metrics.embedSurvival}\n`;

    return output;
  }

  private formatCSV(): string {
    const metrics = this.results.metrics;
    return 'route,mode,score,samples,embedSurvival,timestamp\n' +
           `${metrics.route},${metrics.mode},${metrics.score},${metrics.samples},${metrics.embedSurvival},${metrics.timestamp}\n`;
  }

  private modeToNumber(mode: string): number {
    switch (mode) {
      case 'NORMAL': return 0;
      case 'FALLBACK_REMOTE_ONLY': return 1;
      case 'RECOVERY_GUARD': return 2;
      default: return -1;
    }
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  
  const config: MetricsExportConfig = {
    endpoint: 'http://localhost:8787',
    route: 'default',
    format: 'json',
    output: ''
  };

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--endpoint':
        config.endpoint = args[++i] || '';
        break;
      case '--route':
        config.route = args[++i] || '';
        break;
      case '--format':
        config.format = args[++i] as any;
        break;
      case '--output':
        config.output = args[++i] || '';
        break;
    }
  }

  // Validate configuration
  if (!config.endpoint) {
    console.error('❌ --endpoint is required');
    process.exit(1);
  }

  if (!['json', 'prometheus', 'csv'].includes(config.format)) {
    console.error('❌ --format must be json, prometheus, or csv');
    process.exit(1);
  }

  const exporter = new MetricsExporter(config);
  const results = await exporter.export();

  if (results.errors.length > 0) {
    console.log('\n❌ Errors:');
    results.errors.forEach(error => console.log(`   - ${error}`));
  }

  // Save export results
  const resultsFile = join(process.cwd(), 'metrics-export-results.json');
  writeFileSync(resultsFile, JSON.stringify(results, null, 2));

  console.log(`\n💾 Export results saved to: ${resultsFile}`);

  // Exit with error code if there were errors
  process.exit(results.errors.length > 0 ? 1 : 0);
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ Export failed:', error);
    process.exit(1);
  });
}
