import { SurvivalReport } from '../types.js';
import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { mkdirSync } from 'fs';

// Security: XML escaping function to prevent XML injection
function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/\n/g, "&#10;")
    .replace(/\r/g, "&#13;")
    .replace(/\t/g, "&#9;");
}

// Security: Validate file path to prevent path traversal
function validateFilePath(filePath: string): string {
  const resolved = resolve(filePath);
  if (!resolved.startsWith(process.cwd())) {
    throw new Error('Path traversal detected');
  }
  return resolved;
}

export function generateJunitReport(report: SurvivalReport, outputPath: string): void {
  // Security: Validate report structure
  if (!report || typeof report !== 'object' || !report.results || !Array.isArray(report.results)) {
    throw new Error('Invalid report structure');
  }

  const { results, run_id, timestamp, remote_survival_rate, scenarios_failed } = report;
  
  // Security: Validate and create output directory
  const validatedOutputPath = validateFilePath(outputPath);
  mkdirSync(dirname(validatedOutputPath), { recursive: true });
  
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += `<testsuites name="${escapeXml('C2 Concierge Acceptance Tests')}" tests="${results.length}" failures="${scenarios_failed}" timestamp="${escapeXml(timestamp)}">\n`;
  xml += `  <testsuite name="${escapeXml('Survival Matrix')}" tests="${results.length}" failures="${scenarios_failed}" skipped="0">\n`;

  for (const result of results) {
    // Security: Validate result structure
    if (!result || typeof result !== 'object' || !result.scenario_id || !result.sandbox) {
      continue; // Skip invalid results
    }

    const status = result.remote_survives ? 'passed' : 'failed';
    const time = (result.timings_ms.origin + result.timings_ms.manifest_fetch) / 1000;
    
    xml += `    <testcase name="${escapeXml(result.scenario_id)}" classname="${escapeXml(`acceptance.${result.sandbox}`)}" time="${time}">\n`;
    
    if (!result.remote_survives) {
      const failureMessage = result.error || 
        `Remote survival failed. Expected: true, Got: false. Embed survival: ${result.embed_survives}`;
      xml += `      <failure message="${escapeXml(failureMessage)}">\n`;
      xml += `        <![CDATA[${escapeXml(failureMessage)}]]>\n`;
      xml += `      </failure>\n`;
    }
    
    xml += `    </testcase>\n`;
  }

  xml += `  </testsuite>\n`;
  xml += `</testsuites>\n`;

  writeFileSync(validatedOutputPath, xml);
}
