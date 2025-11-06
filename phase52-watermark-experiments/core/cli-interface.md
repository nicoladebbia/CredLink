# CLI Interface for Watermark Operations

## Command Line Interface Implementation

### CLI Commands Structure
```typescript
#!/usr/bin/env node

import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import { WatermarkSignRequest, WatermarkVerifyResponse, TenantWatermarkConfig } from './watermark-config';
import { PayloadGeneratorFactory } from './payload-generator';
import { DCTWatermarkFactory } from '../watermarking/dct-watermark-embedder';
import { DCTWatermarkDetectorFactory } from '../detectors/dct-watermark-detector';
import { ResearchWatermarkInterface } from '../watermarking/latent-watermark-embedder';

const program = new Command();

program
  .name('c2c-watermark')
  .description('C2 Concierge Watermark CLI - Experimental watermark embedding and detection')
  .version('1.1.0');

/**
 * Sign command - Embed watermark into asset
 */
program
  .command('sign')
  .description('Embed watermark into an asset (experimental, opt-in only)')
  .requiredOption('-i, --input <path>', 'Input asset path')
  .requiredOption('-o, --output <path>', 'Output asset path')
  .requiredOption('-m, --manifest <hash>', 'Manifest hash (64-character hex)')
  .option('-p, --profile <profile>', 'Watermark profile: off, dct_ecc_v1, latent_x', 'off')
  .option('-s, --strength <number>', 'Watermark strength (0.1-0.9)', '0.3')
  .option('--salt <hex>', 'Custom salt (hex string)')
  .option('-t, --tenant <id>', 'Tenant ID for logging')
  .option('--log-file <path>', 'Log file path')
  .option('--dry-run', 'Show what would be done without executing')
  .action(async (options) => {
    try {
      await handleSignCommand(options);
    } catch (error) {
      console.error('❌ Sign command failed:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

/**
 * Verify command - Detect watermark in asset
 */
program
  .command('verify')
  .description('Detect watermark in an asset and verify binding')
  .requiredOption('-i, --input <path>', 'Input asset path')
  .requiredOption('-m, --manifest <hash>', 'Expected manifest hash (64-character hex)')
  .option('-p, --profile <profile>', 'Detection profile: dct_ecc_v1, latent_x', 'dct_ecc_v1')
  .option('-t, --tenant <id>', 'Tenant ID for configuration')
  .option('--sensitivity <number>', 'Detection sensitivity (0.0-1.0)', '0.5')
  .option('--json', 'Output results as JSON')
  .option('--verbose', 'Verbose output')
  .action(async (options) => {
    try {
      await handleVerifyCommand(options);
    } catch (error) {
      console.error('❌ Verify command failed:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

/**
 * Test command - Run robustness tests
 */
program
  .command('test')
  .description('Run watermark robustness tests')
  .requiredOption('-i, --input <path>', 'Input image path')
  .requiredOption('-m, --manifest <hash>', 'Manifest hash (64-character hex)')
  .option('-o, --output <path>', 'Output test results directory', './test-results')
  .option('--variations', 'Run extended test variations')
  .option('--profile <profile>', 'Test profile: dct_ecc_v1', 'dct_ecc_v1')
  .option('--format <format>', 'Report format: markdown, json, csv', 'markdown')
  .action(async (options) => {
    try {
      await handleTestCommand(options);
    } catch (error) {
      console.error('❌ Test command failed:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

/**
 * Config command - Manage tenant watermark configuration
 */
program
  .command('config')
  .description('Manage watermark configuration')
  .requiredOption('-t, --tenant <id>', 'Tenant ID')
  .option('--enable', 'Enable watermark hints for tenant')
  .option('--disable', 'Disable watermark hints for tenant')
  .option('--profile <profile>', 'Set watermark profile')
  .option('--sensitivity <number>', 'Set detection sensitivity')
  .option('--show', 'Show current configuration')
  .action(async (options) => {
    try {
      await handleConfigCommand(options);
    } catch (error) {
      console.error('❌ Config command failed:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

/**
 * Batch command - Process multiple assets
 */
program
  .command('batch')
  .description('Process multiple assets in batch')
  .requiredOption('-i, --input-dir <path>', 'Input directory')
  .requiredOption('-o, --output-dir <path>', 'Output directory')
  .requiredOption('-m, --manifest <hash>', 'Manifest hash')
  .option('-p, --profile <profile>', 'Watermark profile', 'dct_ecc_v1')
  .option('--pattern <pattern>', 'File pattern (glob)', '*.{jpg,jpeg,png,webp}')
  .option('--parallel <number>', 'Parallel processing count', '4')
  .option('--continue-on-error', 'Continue processing on errors')
  .action(async (options) => {
    try {
      await handleBatchCommand(options);
    } catch (error) {
      console.error('❌ Batch command failed:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Command Handlers

async function handleSignCommand(options: any): Promise<void> {
  console.log('🔒 Watermark Sign Command');
  console.log(`Input: ${options.input}`);
  console.log(`Output: ${options.output}`);
  console.log(`Profile: ${options.profile}`);
  
  // Validate inputs
  await validateInputFile(options.input);
  await validateManifestHash(options.manifest);
  await validateProfile(options.profile);
  
  if (options.profile === 'off') {
    console.log('⚠️  Watermarking is disabled - copying file without modification');
    if (!options.dryRun) {
      await copyFile(options.input, options.output);
    }
    console.log('✅ File copied successfully');
    return;
  }
  
  // Load input asset
  const inputData = await fs.readFile(options.input);
  
  // Generate payload
  const payloadGenerator = PayloadGeneratorFactory.createStandard();
  const payload = payloadGenerator.generatePayload(options.manifest, options.salt);
  
  console.log(`📋 Generated payload: ${payload.truncatedHash.length + payload.salt.length + payload.reserved.length + 1} bytes`);
  
  // Embed watermark based on profile
  let outputData: ArrayBuffer;
  
  if (options.profile === 'dct_ecc_v1') {
    const embedder = DCTWatermarkFactory.createWithStrength(parseFloat(options.strength));
    outputData = await embedder.embedWatermark(inputData, payload);
    console.log('💧 DCT watermark embedded successfully');
  } else if (options.profile === 'latent_x') {
    console.log('⚠️  Latent watermark is research-only and requires latent tensor input');
    throw new Error('Latent watermark requires latent tensor, not image data');
  } else {
    throw new Error(`Unsupported profile: ${options.profile}`);
  }
  
  // Write output
  if (!options.dryRun) {
    await fs.writeFile(options.output, new Uint8Array(outputData));
    console.log(`✅ Watermarked asset saved to: ${options.output}`);
  } else {
    console.log('🔍 Dry run - would save watermarked asset');
  }
  
  // Log operation
  if (options.logFile) {
    await logOperation({
      operation: 'sign',
      tenantId: options.tenant || 'unknown',
      inputFile: options.input,
      outputFile: options.output,
      manifestHash: options.manifest,
      profile: options.profile,
      strength: parseFloat(options.strength),
      timestamp: new Date().toISOString()
    }, options.logFile);
  }
}

async function handleVerifyCommand(options: any): Promise<void> {
  console.log('🔍 Watermark Verify Command');
  console.log(`Input: ${options.input}`);
  console.log(`Manifest: ${options.manifest}`);
  console.log(`Profile: ${options.profile}`);
  
  // Validate inputs
  await validateInputFile(options.input);
  await validateManifestHash(options.manifest);
  
  // Load input asset
  const inputData = await fs.readFile(options.input);
  
  // Detect watermark based on profile
  let detectionResult: any;
  
  if (options.profile === 'dct_ecc_v1') {
    const detector = DCTWatermarkDetectorFactory.createDefault();
    detectionResult = await detector.detectWatermark(inputData);
  } else if (options.profile === 'latent_x') {
    console.log('⚠️  Latent watermark detection is research-only');
    throw new Error('Latent watermark detection requires latent tensor, not image data');
  } else {
    throw new Error(`Unsupported profile: ${options.profile}`);
  }
  
  // Verify payload binding
  const payloadGenerator = PayloadGeneratorFactory.createStandard();
  const payloadBinding = new (await import('./payload-generator')).PayloadBinding(payloadGenerator);
  
  let payloadBindOk = false;
  if (detectionResult.payload) {
    const bindingResult = payloadBinding.verifyBinding(detectionResult.payload, options.manifest);
    payloadBindOk = bindingResult.binds;
  }
  
  // Prepare results
  const results: WatermarkVerifyResponse = {
    watermarkHint: detectionResult.match ? {
      present: true,
      confidence: detectionResult.confidence,
      payloadBindOk,
      profile: options.profile,
      note: 'Hint only',
      detectedAt: new Date()
    } : undefined,
    c2paStatus: 'unknown', // Would be determined by separate C2PA verification
    processingTimeMs: detectionResult.processingTimeMs
  };
  
  // Output results
  if (options.json) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    console.log('\n📊 Verification Results:');
    console.log(`Watermark Detected: ${detectionResult.match ? '✅ Yes' : '❌ No'}`);
    
    if (detectionResult.match) {
      console.log(`Confidence: ${Math.round(detectionResult.confidence * 100)}%`);
      console.log(`Payload Version: ${detectionResult.payloadVersion}`);
      console.log(`Manifest Binding: ${payloadBindOk ? '✅ Valid' : '❌ Invalid'}`);
      console.log(`Processing Time: ${detectionResult.processingTimeMs.toFixed(2)}ms`);
    }
    
    if (detectionResult.error) {
      console.log(`Error: ${detectionResult.error}`);
    }
    
    if (options.verbose && detectionResult.payload) {
      console.log('\n🔋 Payload Details:');
      console.log(`Version: ${detectionResult.payload.version}`);
      console.log(`Truncated Hash: ${Buffer.from(detectionResult.payload.truncatedHash).toString('hex')}`);
      console.log(`Salt: ${Buffer.from(detectionResult.payload.salt).toString('hex')}`);
    }
  }
}

async function handleTestCommand(options: any): Promise<void> {
  console.log('🧪 Watermark Robustness Test');
  console.log(`Input: ${options.input}`);
  console.log(`Output: ${options.output}`);
  
  // Validate inputs
  await validateInputFile(options.input);
  await validateManifestHash(options.manifest);
  
  // Create output directory
  await fs.mkdir(options.output, { recursive: true });
  
  // Import evaluation system
  const { RobustnessEvaluator, RobustnessReporter } = await import('../evaluation/robustness-evaluation');
  
  // Run evaluation
  const evaluator = new RobustnessEvaluator();
  const inputData = await fs.readFile(options.input);
  
  console.log('🔄 Running robustness evaluation...');
  const evaluation = await evaluator.runRobustnessEvaluation(
    inputData,
    options.manifest,
    options.variations
  );
  
  // Generate report
  const reporter = new RobustnessReporter();
  const report = reporter.generateMarkdownReport(
    evaluation.summary,
    evaluation.visualQualityReport,
    evaluation.results
  );
  
  // Save report
  const reportPath = path.join(options.output, `robustness-report-${Date.now()}.md`);
  await fs.writeFile(reportPath, report);
  
  // Save detailed results
  const resultsPath = path.join(options.output, `detailed-results-${Date.now()}.json`);
  await fs.writeFile(resultsPath, JSON.stringify(evaluation, null, 2));
  
  // Display summary
  console.log('\n📈 Evaluation Summary:');
  console.log(`Total Tests: ${evaluation.summary.totalTests}`);
  console.log(`Successful Detections: ${evaluation.summary.successfulDetections}`);
  console.log(`Average Confidence Retention: ${Math.round(evaluation.summary.averageConfidenceRetention * 100)}%`);
  console.log(`Meets Target Thresholds: ${evaluation.summary.meetsTargetThresholds ? '✅ Yes' : '❌ No'}`);
  
  console.log('\n🎯 Target Thresholds:');
  console.log(`JPEG 75 Quality: ${evaluation.summary.targetThresholds.jpeg75 ? '✅ Pass' : '❌ Fail'}`);
  console.log(`10% Crop: ${evaluation.summary.targetThresholds.crop10 ? '✅ Pass' : '❌ Fail'}`);
  console.log(`Overall: ${evaluation.summary.targetThresholds.overall ? '✅ Pass' : '❌ Fail'}`);
  
  console.log('\n🎨 Visual Quality:');
  console.log(`Average SSIM: ${evaluation.visualQualityReport.averageSSIM.toFixed(4)}`);
  console.log(`Average PSNR: ${evaluation.visualQualityReport.averagePSNR.toFixed(2)}dB`);
  console.log(`Average LPIPS: ${evaluation.visualQualityReport.averageLPIPS.toFixed(4)}`);
  console.log(`Meets Quality Thresholds: ${evaluation.visualQualityReport.meetsQualityThresholds ? '✅ Yes' : '❌ No'}`);
  
  console.log(`\n📄 Reports saved to:`);
  console.log(`- ${reportPath}`);
  console.log(`- ${resultsPath}`);
}

async function handleConfigCommand(options: any): Promise<void> {
  console.log('⚙️  Watermark Configuration');
  console.log(`Tenant: ${options.tenant}`);
  
  // Load or create tenant config
  const configPath = path.join('./config', `tenant-${options.tenant}.json`);
  
  let config: TenantWatermarkConfig;
  
  try {
    const configData = await fs.readFile(configPath, 'utf-8');
    config = JSON.parse(configData);
  } catch (error) {
    // Create default config
    config = {
      enabled: false,
      profile: 'off',
      sensitivity: 0.5,
      suppressAssetClasses: [],
      lastUpdated: new Date(),
      updatedBy: 'cli'
    };
  }
  
  // Apply configuration changes
  if (options.enable !== undefined) {
    config.enabled = options.enable;
  }
  
  if (options.profile !== undefined) {
    config.profile = options.profile as any;
  }
  
  if (options.sensitivity !== undefined) {
    config.sensitivity = parseFloat(options.sensitivity);
  }
  
  config.lastUpdated = new Date();
  config.updatedBy = 'cli';
  
  // Save configuration
  await fs.mkdir('./config', { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(config, null, 2));
  
  // Display configuration
  if (options.show || !options.enable && !options.disable && !options.profile) {
    console.log('\n📋 Current Configuration:');
    console.log(`Enabled: ${config.enabled ? '✅ Yes' : '❌ No'}`);
    console.log(`Profile: ${config.profile}`);
    console.log(`Sensitivity: ${Math.round(config.sensitivity * 100)}%`);
    console.log(`Suppress Asset Classes: ${config.suppressAssetClasses.join(', ') || 'None'}`);
    console.log(`Last Updated: ${config.lastUpdated.toISOString()}`);
    console.log(`Updated By: ${config.updatedBy}`);
  } else {
    console.log('✅ Configuration updated successfully');
  }
}

async function handleBatchCommand(options: any): Promise<void> {
  console.log('📦 Batch Processing');
  console.log(`Input Directory: ${options.inputDir}`);
  console.log(`Output Directory: ${options.outputDir}`);
  console.log(`Pattern: ${options.pattern}`);
  console.log(`Parallel: ${options.parallel}`);
  
  // Validate directories
  await validateDirectory(options.inputDir);
  await fs.mkdir(options.outputDir, { recursive: true });
  
  // Find matching files
  const files = await findFiles(options.inputDir, options.pattern);
  console.log(`Found ${files.length} files to process`);
  
  // Process files in parallel batches
  const parallelCount = parseInt(options.parallel);
  const results: Array<{ file: string; success: boolean; error?: string }> = [];
  
  for (let i = 0; i < files.length; i += parallelCount) {
    const batch = files.slice(i, i + parallelCount);
    
    console.log(`Processing batch ${Math.floor(i / parallelCount) + 1}/${Math.ceil(files.length / parallelCount)}...`);
    
    const batchPromises = batch.map(async (file) => {
      try {
        const relativePath = path.relative(options.inputDir, file);
        const outputPath = path.join(options.outputDir, relativePath);
        
        await fs.mkdir(path.dirname(outputPath), { recursive: true });
        
        // Process individual file
        await processSingleFile(file, outputPath, options.manifest, options.profile);
        
        return { file, success: true };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        if (!options.continueOnError) {
          throw error;
        }
        
        return { file, success: false, error: errorMessage };
      }
    });
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
  }
  
  // Display results
  const successful = results.filter(r => r.success).length;
  const failed = results.length - successful;
  
  console.log('\n📊 Batch Processing Results:');
  console.log(`Total Files: ${results.length}`);
  console.log(`Successful: ${successful} ✅`);
  console.log(`Failed: ${failed} ${failed > 0 ? '❌' : '✅'}`);
  
  if (failed > 0) {
    console.log('\n❌ Failed Files:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`- ${r.file}: ${r.error}`);
    });
  }
}

// Helper Functions

async function validateInputFile(filePath: string): Promise<void> {
  try {
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) {
      throw new Error(`Not a file: ${filePath}`);
    }
  } catch (error) {
    throw new Error(`Cannot access file: ${filePath}`);
  }
}

async function validateDirectory(dirPath: string): Promise<void> {
  try {
    const stats = await fs.stat(dirPath);
    if (!stats.isDirectory()) {
      throw new Error(`Not a directory: ${dirPath}`);
    }
  } catch (error) {
    throw new Error(`Cannot access directory: ${dirPath}`);
  }
}

async function validateManifestHash(hash: string): Promise<void> {
  if (!/^[a-fA-F0-9]{64}$/.test(hash)) {
    throw new Error('Manifest hash must be a 64-character hex string (SHA256)');
  }
}

async function validateProfile(profile: string): Promise<void> {
  const validProfiles = ['off', 'dct_ecc_v1', 'latent_x'];
  if (!validProfiles.includes(profile)) {
    throw new Error(`Invalid profile: ${profile}. Valid profiles: ${validProfiles.join(', ')}`);
  }
}

async function copyFile(src: string, dst: string): Promise<void> {
  // SECURITY: Added path validation to prevent traversal attacks
  if (!src || !dst || typeof src !== 'string' || typeof dst !== 'string') {
    throw new Error('Invalid file paths');
  }
  
  // Normalize and validate source path
  const normalizedSrc = path.normalize(src);
  const normalizedDst = path.normalize(dst);
  
  // Prevent path traversal in source
  if (normalizedSrc !== src || src.includes('..') || src.includes('~')) {
    throw new Error('Path traversal detected in source path');
  }
  
  // Prevent path traversal in destination
  if (normalizedDst !== dst || dst.includes('..') || dst.includes('~')) {
    throw new Error('Path traversal detected in destination path');
  }
  
  // Ensure destination directory exists
  await fs.mkdir(path.dirname(dst), { recursive: true });
  
  // Validate source file exists and is accessible
  const srcStats = await fs.stat(src);
  if (!srcStats.isFile()) {
    throw new Error('Source is not a file');
  }
  
  // Copy file with size limits to prevent DoS
  const data = await fs.readFile(src);
  if (data.length > 100 * 1024 * 1024) { // 100MB limit
    throw new Error('File too large for copying');
  }
  
  await fs.writeFile(dst, data);
}

async function findFiles(dir: string, pattern: string): Promise<string[]> {
  // SECURITY: Fixed path traversal and regex injection vulnerabilities
  // Validate and sanitize inputs
  if (!dir || typeof dir !== 'string') {
    throw new Error('Invalid directory path');
  }
  if (!pattern || typeof pattern !== 'string') {
    throw new Error('Invalid pattern');
  }
  
  // Prevent path traversal attacks
  const normalizedDir = path.normalize(dir);
  if (normalizedDir !== dir || dir.includes('..') || dir.includes('~')) {
    throw new Error('Path traversal detected in directory path');
  }
  
  // Simplified glob implementation with security fixes
  const files: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  
  // SECURITY: Sanitize pattern to prevent regex injection
  const sanitizedPattern = pattern
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // Escape regex metacharacters
    .replace(/\\\*/g, '.*') // Restore safe wildcard
    .replace(/\\\{([^}]+)\\\}/g, '($1)'); // Restore safe groups
  
  for (const entry of entries) {
    // SECURITY: Prevent path traversal in entry names
    if (entry.name.includes('..') || entry.name.includes('/') || entry.name.includes('\\')) {
      continue; // Skip suspicious entries
    }
    
    const fullPath = path.join(dir, entry.name);
    
    // SECURITY: Ensure resolved path stays within base directory
    const resolvedPath = path.resolve(fullPath);
    const baseDir = path.resolve(dir);
    if (!resolvedPath.startsWith(baseDir)) {
      continue; // Skip paths outside base directory
    }
    
    if (entry.isDirectory()) {
      // SECURITY: Limit recursion depth to prevent directory traversal attacks
      const relativePath = path.relative(dir, fullPath);
      if (relativePath.split(path.sep).length > 5) {
        continue; // Skip deep directories
      }
      
      const subFiles = await findFiles(fullPath, pattern);
      files.push(...subFiles);
    } else if (entry.isFile()) {
      // SECURITY: Use safe pattern matching
      if (pattern.includes('*') || pattern.includes('{')) {
        try {
          // Use sanitized pattern with proper escaping
          const regex = new RegExp(`^${sanitizedPattern}$`);
          
          if (regex.test(entry.name)) {
            files.push(fullPath);
          }
        } catch (regexError) {
          // Skip invalid regex patterns
          continue;
        }
      } else if (entry.name === pattern) {
        files.push(fullPath);
      }
    }
  }
  
  return files;
}

async function processSingleFile(
  inputPath: string,
  outputPath: string,
  manifestHash: string,
  profile: string
): Promise<void> {
  const inputData = await fs.readFile(inputPath);
  
  if (profile === 'off') {
    await fs.writeFile(outputPath, inputData);
    return;
  }
  
  const payloadGenerator = PayloadGeneratorFactory.createStandard();
  const payload = payloadGenerator.generatePayload(manifestHash);
  
  let outputData: ArrayBuffer;
  
  if (profile === 'dct_ecc_v1') {
    const embedder = DCTWatermarkFactory.createDefault();
    outputData = await embedder.embedWatermark(inputData, payload);
  } else {
    throw new Error(`Unsupported profile: ${profile}`);
  }
  
  await fs.writeFile(outputPath, new Uint8Array(outputData));
}

async function logOperation(operation: any, logFile: string): Promise<void> {
  const logEntry = {
    ...operation,
    timestamp: new Date().toISOString()
  };
  
  const logLine = JSON.stringify(logEntry) + '\n';
  
  try {
    await fs.appendFile(logFile, logLine);
  } catch (error) {
    console.warn(`Warning: Could not write to log file ${logFile}:`, error);
  }
}

// Main execution
if (require.main === module) {
  program.parse();
}

export { program };
```
