#!/usr/bin/env ts-node

/**
 * Phase 16 - Adversarial Lab v1
 * Fuzzing Runner - Automated Fuzzing Execution
 * 
 * Runs cargo-fuzz with proper thresholds and reporting
 */

import { execSync, spawn } from 'child_process';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { createLogger } from '../../src/utils/logger';

const logger = createLogger('FuzzRunner');

interface FuzzConfig {
  fuzzing: {
    max_runtime: number;
    max_memory: number;
    crash_threshold: {
      max_crashes_per_hour: number;
      max_hangs_per_hour: number;
      max_leaks_per_hour: number;
    };
    coverage_threshold: {
      min_coverage_percent: number;
      min_new_edges_per_hour: number;
      min_new_functions_per_hour: number;
    };
    performance_threshold: {
      max_exec_time_ms: number;
      max_memory_per_input_mb: number;
      max_stack_depth: number;
    };
  };
  targets: {
    c2pa_reader: {
      description: string;
      dictionary: string;
      interesting_values: string[];
    };
  };
}

interface TargetConfig {
  description: string;
  dictionary: string;
  interesting_values: string[];
}

interface FuzzResult {
  target: string;
  runtime_seconds: number;
  executions: number;
  crashes: number;
  hangs: number;
  coverage_percent: number;
  new_edges: number;
  new_functions: number;
  passed: boolean;
  artifacts: string[];
}

class FuzzRunner {
  private config: FuzzConfig;
  private fuzzDir: string;
  private artifactsDir: string;
  
  constructor() {
    this.fuzzDir = join(__dirname, '../fuzz');
    this.artifactsDir = join(this.fuzzDir, 'artifacts');
    
    // Load configuration
    const configPath = join(this.fuzzDir, 'fuzz_config.yaml');
    if (!existsSync(configPath)) {
      throw new Error(`Fuzz config not found: ${configPath}`);
    }
    
    // For now, use default config (YAML parsing would require additional deps)
    this.config = {
      fuzzing: {
        max_runtime: 300,
        max_memory: 512,
        crash_threshold: {
          max_crashes_per_hour: 0,
          max_hangs_per_hour: 1,
          max_leaks_per_hour: 0
        },
        coverage_threshold: {
          min_coverage_percent: 85,
          min_new_edges_per_hour: 10,
          min_new_functions_per_hour: 5
        },
        performance_threshold: {
          max_exec_time_ms: 1000,
          max_memory_per_input_mb: 64,
          max_stack_depth: 1000
        }
      },
      targets: {
        c2pa_reader: {
          description: "Fuzz c2pa::Reader manifest parsing",
          dictionary: "dictionaries/c2pa.dict",
          interesting_values: ["jumb", "json", "c2pa"]
        }
      }
    };
    
    // Ensure artifacts directory exists
    if (!existsSync(this.artifactsDir)) {
      mkdirSync(this.artifactsDir, { recursive: true });
    }
  }
  
  /**
   * Run all fuzz targets
   */
  async runAllTargets(): Promise<FuzzResult[]> {
    logger.info(`Starting fuzzing run with ${Object.keys(this.config.targets).length} targets`);
    
    const results: FuzzResult[] = [];
    
    for (const [targetName, targetConfig] of Object.entries(this.config.targets)) {
      logger.info(`Running fuzz target: ${targetName}`);
      
      try {
        const result = await this.runTarget(targetName, targetConfig);
        results.push(result);
        
        if (result.passed) {
          logger.info(`✅ Target ${targetName} passed`);
        } else {
          logger.error(`❌ Target ${targetName} failed`);
        }
      } catch (error) {
        logger.error(`Target ${targetName} crashed:`, error);
        results.push({
          target: targetName,
          runtime_seconds: 0,
          executions: 0,
          crashes: 1,
          hangs: 0,
          coverage_percent: 0,
          new_edges: 0,
          new_functions: 0,
          passed: false,
          artifacts: []
        });
      }
    }
    
    return results;
  }
  
  /**
   * Run a single fuzz target
   */
  private async runTarget(targetName: string, targetConfig: TargetConfig): Promise<FuzzResult> {
    const startTime = Date.now();
    
    try {
      // Check if cargo-fuzz is available
      this.checkCargoFuzz();
      
      // Run fuzzing with timeout
      const result = await this.runCargoFuzz(targetName, targetConfig);
      
      const runtime = (Date.now() - startTime) / 1000;
      
      // Evaluate against thresholds
      const passed = this.evaluateThresholds(result, runtime);
      
      return {
        ...result,
        runtime_seconds: runtime,
        passed
      };
      
    } catch (error) {
      logger.error(`Fuzz target ${targetName} failed:`, error);
      throw error;
    }
  }
  
  /**
   * Check if cargo-fuzz is installed
   */
  private checkCargoFuzz(): void {
    try {
      execSync('cargo fuzz --version', { stdio: 'pipe' });
    } catch (error) {
      logger.error('cargo-fuzz not found. Install with: cargo install cargo-fuzz');
      throw new Error('cargo-fuzz not available');
    }
  }
  
  /**
   * Run cargo-fuzz for the specified target
   */
  private async runCargoFuzz(targetName: string, targetConfig: TargetConfig): Promise<Omit<FuzzResult, 'runtime_seconds' | 'passed'>> {
    return new Promise((resolve, reject) => {
      const fuzzProcess = spawn('cargo', [
        'fuzz', 
        'run', 
        targetName,
        '--', 
        '-max_total_time=' + this.config.fuzzing.max_runtime,
        '-max_len=4096',
        '-dict=' + join(this.fuzzDir, targetConfig.dictionary)
      ], {
        cwd: this.fuzzDir,
        stdio: 'pipe'
      });
      
      let output = '';
      let errorOutput = '';
      
      fuzzProcess.stdout?.on('data', (data) => {
        output += data.toString();
      });
      
      fuzzProcess.stderr?.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      fuzzProcess.on('close', (_code) => {
        try {
          const result = this.parseFuzzOutput(output, errorOutput);
          resolve(result);
        } catch (parseError) {
          reject(parseError);
        }
      });
      
      fuzzProcess.on('error', (error) => {
        reject(error);
      });
      
      // Timeout handling
      setTimeout(() => {
        fuzzProcess.kill('SIGTERM');
      }, this.config.fuzzing.max_runtime * 1000 + 10000); // Extra 10s buffer
    });
  }
  
  /**
   * Parse cargo-fuzz output to extract metrics
   */
  private parseFuzzOutput(stdout: string, _stderr: string): Omit<FuzzResult, 'runtime_seconds' | 'passed'> {
    // Parse fuzzing statistics from output
    const lines = stdout.split('\n');
    
    let executions = 0;
    let crashes = 0;
    let hangs = 0;
    let coverage = 0;
    let newEdges = 0;
    let newFunctions = 0;
    
    for (const line of lines) {
      // Extract execution count
      const execMatch = line.match(/#(\d+)\s+DONE/);
      if (execMatch) {
        executions = parseInt(execMatch[1]);
      }
      
      // Extract crash information
      if (line.includes('CRASH')) {
        crashes++;
      }
      
      // Extract hang information  
      if (line.includes('HANG')) {
        hangs++;
      }
      
      // Extract coverage information
      const covMatch = line.match(/cov:\s*(\d+\.?\d*)/);
      if (covMatch) {
        coverage = parseFloat(covMatch[1]);
      }
      
      // Extract new edges
      const edgeMatch = line.match(/ft:\s*(\d+)/);
      if (edgeMatch) {
        newEdges = parseInt(edgeMatch[1]);
      }
      
      // Extract new functions
      const fnMatch = line.match(/fn:\s*(\d+)/);
      if (fnMatch) {
        newFunctions = parseInt(fnMatch[1]);
      }
    }
    
    // Collect artifacts
    const artifacts = this.collectArtifacts();
    
    return {
      target: 'c2pa_reader',
      executions,
      crashes,
      hangs,
      coverage_percent: coverage,
      new_edges: newEdges,
      new_functions: newFunctions,
      artifacts
    };
  }
  
  /**
   * Collect crash artifacts for analysis
   */
  private collectArtifacts(): string[] {
    const artifacts: string[] = [];
    
    try {
      const crashDir = join(this.artifactsDir, 'crashes');
      if (existsSync(crashDir)) {
        const crashFiles = execSync(`find ${crashDir} -name "*.json" -o -name "*.txt"`, { encoding: 'utf8' })
          .trim()
          .split('\n')
          .filter(f => f.length > 0);
        artifacts.push(...crashFiles);
      }
    } catch (error) {
      logger.warn('Failed to collect crash artifacts:', error);
    }
    
    return artifacts;
  }
  
  /**
   * Evaluate results against configured thresholds
   */
  private evaluateThresholds(result: Omit<FuzzResult, 'runtime_seconds' | 'passed'>, runtime: number): boolean {
    const { crash_threshold, coverage_threshold } = this.config.fuzzing;
    
    // Check crash thresholds
    if (result.crashes > crash_threshold.max_crashes_per_hour) {
      logger.error(`Too many crashes: ${result.crashes} > ${crash_threshold.max_crashes_per_hour}`);
      return false;
    }
    
    if (result.hangs > crash_threshold.max_hangs_per_hour) {
      logger.error(`Too many hangs: ${result.hangs} > ${crash_threshold.max_hangs_per_hour}`);
      return false;
    }
    
    // Check coverage thresholds
    if (result.coverage_percent < coverage_threshold.min_coverage_percent) {
      logger.error(`Coverage too low: ${result.coverage_percent}% < ${coverage_threshold.min_coverage_percent}%`);
      return false;
    }
    
    // Check performance thresholds
    if (runtime > this.config.fuzzing.max_runtime) {
      logger.error(`Runtime too long: ${runtime}s > ${this.config.fuzzing.max_runtime}s`);
      return false;
    }
    
    return true;
  }
  
  /**
   * Generate fuzzing report
   */
  generateReport(results: FuzzResult[]): void {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        total_targets: results.length,
        passed_targets: results.filter(r => r.passed).length,
        failed_targets: results.filter(r => !r.passed).length,
        total_executions: results.reduce((sum, r) => sum + r.executions, 0),
        total_crashes: results.reduce((sum, r) => sum + r.crashes, 0),
        total_hangs: results.reduce((sum, r) => sum + r.hangs, 0),
        average_coverage: results.reduce((sum, r) => sum + r.coverage_percent, 0) / results.length
      },
      results,
      config: this.config
    };
    
    const reportPath = join(this.artifactsDir, `fuzz_report_${Date.now()}.json`);
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    logger.info(`Fuzzing report generated: ${reportPath}`);
    
    // Log summary
    logger.info(`Fuzzing completed: ${report.summary.passed_targets}/${report.summary.total_targets} targets passed`);
    logger.info(`Total executions: ${report.summary.total_executions}`);
    logger.info(`Total crashes: ${report.summary.total_crashes}`);
    logger.info(`Average coverage: ${report.summary.average_coverage.toFixed(2)}%`);
  }
}

// Main execution
async function main() {
  try {
    const runner = new FuzzRunner();
    const results = await runner.runAllTargets();
    
    const allPassed = results.every(r => r.passed);
    
    runner.generateReport(results);
    
    if (allPassed) {
      logger.info('🎉 All fuzz targets passed successfully');
      process.exit(0);
    } else {
      logger.error('💥 Some fuzz targets failed');
      process.exit(1);
    }
    
  } catch (error) {
    logger.error('Fuzzing run failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
