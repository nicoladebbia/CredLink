#!/usr/bin/env node

import { readFileSync } from 'fs';
import { join } from 'path';
import { program } from 'commander';
import { loadMatrix } from './loadMatrix.js';
import { SandboxManager } from './sandboxes.js';
import { runScenario } from './runScenario.js';
import { generateSurvivalReport } from './reporters/json.js';
import { generateJunitReport } from './reporters/junit.js';
import { generateCsvReport, generateSummaryReport } from './reporters/csv.js';

interface Options {
  matrix: string;
  out: string;
  sandbox?: string;
  verbose?: boolean;
}

async function main(): Promise<void> {
  program
    .name('acceptance')
    .description('C2 Concierge Acceptance Test Harness')
    .requiredOption('-m, --matrix <path>', 'Path to hostile-path-matrix.yaml')
    .requiredOption('-o, --out <path>', 'Output directory for artifacts')
    .option('-s, --sandbox <name>', 'Run only specific sandbox')
    .option('-v, --verbose', 'Verbose output')
    .parse();

  const options = program.opts() as Options;

  if (options.verbose) {
    console.log('Loading hostile path matrix...');
  }

  // Load the matrix
  const matrix = loadMatrix(options.matrix);
  
  if (options.verbose) {
    console.log(`Loaded ${matrix.scenarios.length} scenarios from matrix v${matrix.version}`);
  }

  // Filter scenarios if sandbox specified
  let scenarios = matrix.scenarios;
  if (options.sandbox) {
    scenarios = scenarios.filter(s => s.sandbox === options.sandbox);
    if (options.verbose) {
      console.log(`Filtered to ${scenarios.length} scenarios for sandbox: ${options.sandbox}`);
    }
  }

  // Initialize sandbox manager
  const sandboxManager = new SandboxManager();
  
  try {
    if (options.verbose) {
      console.log('Starting sandboxes...');
    }
    
    await sandboxManager.startAll();
    
    if (options.verbose) {
      console.log('Running scenarios...');
    }

    // Run all scenarios
    const results = [];
    for (const scenario of scenarios) {
      if (options.verbose) {
        console.log(`Running scenario: ${scenario.id} in ${scenario.sandbox}`);
      }
      
      const sandboxUrl = sandboxManager.getSandboxUrl(scenario.sandbox);
      const result = await runScenario(scenario, sandboxUrl, options.out);
      results.push(result);
      
      if (options.verbose) {
        const status = result.remote_survives ? 'PASS' : 'FAIL';
        console.log(`  ${status}: ${result.scenario_id} (remote: ${result.remote_survives}, embed: ${result.embed_survives}, code: ${result.failure_code})`);
      }
    }

    // Generate reports
    if (options.verbose) {
      console.log('Generating reports...');
    }

    const survivalReport = generateSurvivalReport(
      results,
      matrix.version,
      join(options.out, 'survival.json')
    );

    const junitReport = generateJunitReport(
      survivalReport,
      join(options.out, 'junit.xml')
    );

    // Generate deterministic text/CSV artifacts
    generateCsvReport(survivalReport, options.out);
    generateSummaryReport(survivalReport, options.out);

    // Print summary
    console.log('\n=== Acceptance Test Summary ===');
    console.log(`Run ID: ${survivalReport.run_id}`);
    console.log(`Total Scenarios: ${survivalReport.total_scenarios}`);
    console.log(`Remote Survival Rate: ${(survivalReport.remote_survival_rate * 100).toFixed(2)}%`);
    console.log(`Embed Survival Rate (Preserve): ${(survivalReport.embed_survival_rate_preserve_only * 100).toFixed(2)}%`);
    console.log(`Failed Scenarios: ${survivalReport.scenarios_failed}`);
    
    console.log('\n=== Failure Breakdown ===');
    for (const [code, count] of Object.entries(survivalReport.failure_breakdown)) {
      if (count > 0) {
        console.log(`${code}: ${count}`);
      }
    }
    
    if (survivalReport.scenarios_failed > 0) {
      console.log('\nFailed Scenarios:');
      results
        .filter(r => !r.remote_survives)
        .forEach(r => {
          console.log(`  - ${r.scenario_id} (${r.sandbox}) - ${r.failure_code}`);
          if (r.error) {
            console.log(`    Error: ${r.error}`);
          }
        });
    }

    console.log('\n=== Deterministic Artifacts Generated ===');
    console.log('✅ survival.json (machine-readable)');
    console.log('✅ survival-results.csv (deterministic CSV)');
    console.log('✅ survival-summary.txt (human-readable)');

    // Exit with error code if remote survival below threshold
    if (survivalReport.remote_survival_rate < 0.999) {
      console.error('\n❌ Remote survival rate below 99.9% threshold!');
      process.exit(1);
    }

    console.log('\n✅ All acceptance tests passed!');
    
  } catch (error) {
    console.error('Acceptance test failed:', error);
    process.exit(1);
  } finally {
    // Clean up sandboxes
    try {
      await sandboxManager.stopAll();
    } catch (error) {
      console.warn('Failed to stop sandboxes:', error);
    }
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

export { main };
