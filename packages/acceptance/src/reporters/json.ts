import { SurvivalReport, ScenarioResult, FailureCode } from '../types.js';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname, resolve } from 'path';

// Security: Validate file path to prevent path traversal
function validateFilePath(filePath: string): string {
  const resolved = resolve(filePath);
  if (!resolved.startsWith(process.cwd())) {
    throw new Error('Path traversal detected');
  }
  return resolved;
}

// Security: Validate report structure
function validateReport(results: ScenarioResult[]): void {
  if (!Array.isArray(results)) {
    throw new Error('Invalid results: expected array');
  }
  
  if (results.length > 10000) { // Reasonable limit
    throw new Error('Invalid results: too many scenarios');
  }
  
  for (const result of results) {
    if (!result || typeof result !== 'object') {
      throw new Error('Invalid result: expected object');
    }
    
    if (!result.scenario_id || typeof result.scenario_id !== 'string') {
      throw new Error('Invalid result: missing or invalid scenario_id');
    }
    
    if (!result.sandbox || typeof result.sandbox !== 'string') {
      throw new Error('Invalid result: missing or invalid sandbox');
    }
    
    if (typeof result.remote_survives !== 'boolean') {
      throw new Error('Invalid result: missing or invalid remote_survives');
    }
    
    if (typeof result.embed_survives !== 'boolean') {
      throw new Error('Invalid result: missing or invalid embed_survives');
    }
  }
}

export function generateSurvivalReport(
  results: ScenarioResult[],
  matrixVersion: number,
  outputPath: string
): SurvivalReport {
  try {
    // Security: Validate inputs
    validateReport(results);
    
    if (typeof matrixVersion !== 'number' || matrixVersion < 0 || matrixVersion > 9999) {
      throw new Error('Invalid matrix version');
    }
    
    const validatedOutputPath = validateFilePath(outputPath);

    const run_id = `run-${Date.now()}`;
    const timestamp = new Date().toISOString();
    
    const totalScenarios = results.length;
    const remoteSurvivals = results.filter(r => r.remote_survives).length;
    const preserveEmbedResults = results.filter(r => r.sandbox === 'preserve-embed');
    const embedSurvivals = preserveEmbedResults.filter(r => r.embed_survives).length;
    
    const remote_survival_rate = totalScenarios > 0 ? remoteSurvivals / totalScenarios : 0;
    const embed_survival_rate_preserve_only = preserveEmbedResults.length > 0 
      ? embedSurvivals / preserveEmbedResults.length 
      : 0;
    
    const scenarios_failed = results.filter(r => !r.remote_survives).length;

    // Calculate failure breakdown
    const failure_breakdown: Record<FailureCode, number> = {
      'SURVIVED': 0,
      'BROKEN_MANIFEST': 0,
      'BROKEN_LINK': 0,
      'BROKEN_HEADERS': 0,
      'DESTROYED_EMBED': 0,
      'DESTROYED_CONTENT': 0,
      'INACCESSIBLE': 0,
      'INACCESSIBLE_404': 0,
      'INACCESSIBLE_TIMEOUT': 0
    };

    for (const result of results) {
      if (Object.prototype.hasOwnProperty.call(failure_breakdown, result.failure_code)) {
        failure_breakdown[result.failure_code]++;
      }
    }

    const report: SurvivalReport = {
      run_id,
      timestamp,
      matrix_version: matrixVersion,
      total_scenarios: totalScenarios,
      remote_survival_rate,
      embed_survival_rate_preserve_only,
      scenarios_failed,
      failure_breakdown,
      results
    };

    // Ensure output directory exists
    mkdirSync(dirname(validatedOutputPath), { recursive: true });
    
    // Write the report with safe JSON serialization
    const jsonString = JSON.stringify(report, null, 2);
    if (jsonString.length > 50 * 1024 * 1024) { // 50MB limit
      throw new Error('Report too large');
    }
    
    writeFileSync(validatedOutputPath, jsonString);

    return report;
  } catch (error) {
    throw new Error(`Failed to generate survival report: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
