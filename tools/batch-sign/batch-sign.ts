#!/usr/bin/env node
/**
 * Batch Signing CLI
 * 
 * Sign multiple images in a batch operation
 * 
 * Usage:
 *   npm run batch-sign -- --input ./images --output ./signed
 *   npm run batch-sign -- --input ./images/*.jpg --creator "Batch Job"
 */

import { Command } from 'commander';
import { C2PAService } from '../services/c2pa-service';
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, existsSync } from 'fs';
import { join, basename, extname, dirname } from 'path';
import { logger } from '../utils/logger';
import * as glob from 'glob';

interface BatchSignOptions {
  input: string;
  output?: string;
  creator?: string;
  title?: string;
  parallel?: number;
  format?: 'json' | 'csv' | 'text';
}

interface BatchResult {
  filename: string;
  success: boolean;
  proofUri?: string;
  error?: string;
  duration: number;
}

class BatchSignCLI {
  private c2paService: C2PAService;
  private results: BatchResult[] = [];

  constructor() {
    this.c2paService = new C2PAService();
  }

  /**
   * Run batch signing operation
   */
  async run(options: BatchSignOptions): Promise<void> {
    const startTime = Date.now();
    
    console.log('🚀 CredLink Batch Signing CLI');
    console.log('================================\n');
    
    // Resolve input files
    const inputFiles = this.resolveInputFiles(options.input);
    
    if (inputFiles.length === 0) {
      console.error('❌ No input files found');
      process.exit(1);
    }
    
    console.log(`📁 Found ${inputFiles.length} file(s) to process`);
    console.log(`⚙️  Parallel jobs: ${options.parallel || 1}\n`);
    
    // Ensure output directory exists
    if (options.output && !existsSync(options.output)) {
      mkdirSync(options.output, { recursive: true });
    }
    
    // Process files
    const parallelLimit = options.parallel || 1;
    await this.processFilesInBatches(inputFiles, options, parallelLimit);
    
    // Generate report
    const duration = Date.now() - startTime;
    this.generateReport(duration, options.format || 'text');
    
    // Exit with appropriate code
    const failedCount = this.results.filter(r => !r.success).length;
    process.exit(failedCount > 0 ? 1 : 0);
  }

  /**
   * Resolve input files from glob pattern or directory
   */
  private resolveInputFiles(input: string): string[] {
    // Check if it's a glob pattern
    if (input.includes('*')) {
      return glob.sync(input);
    }
    
    // Check if it's a directory
    try {
      const stats = statSync(input);
      if (stats.isDirectory()) {
        return this.getImageFilesFromDirectory(input);
      } else if (stats.isFile()) {
        return [input];
      }
    } catch (error) {
      console.error(`❌ Input not found: ${input}`);
      return [];
    }
    
    return [];
  }

  /**
   * Get all image files from a directory
   */
  private getImageFilesFromDirectory(dir: string): string[] {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
    const files: string[] = [];
    
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stats = statSync(fullPath);
      
      if (stats.isFile()) {
        const ext = extname(entry).toLowerCase();
        if (imageExtensions.includes(ext)) {
          files.push(fullPath);
        }
      }
    }
    
    return files;
  }

  /**
   * Process files in batches with parallelism
   */
  private async processFilesInBatches(
    files: string[],
    options: BatchSignOptions,
    parallelLimit: number
  ): Promise<void> {
    const chunks: string[][] = [];
    for (let i = 0; i < files.length; i += parallelLimit) {
      chunks.push(files.slice(i, i + parallelLimit));
    }
    
    let processed = 0;
    for (const chunk of chunks) {
      const promises = chunk.map(file => this.processFile(file, options));
      await Promise.all(promises);
      
      processed += chunk.length;
      console.log(`✓ Processed ${processed}/${files.length} files`);
    }
  }

  /**
   * Process a single file
   */
  private async processFile(
    filePath: string,
    options: BatchSignOptions
  ): Promise<void> {
    const startTime = Date.now();
    const filename = basename(filePath);
    
    try {
      // Read image file
      const imageBuffer = readFileSync(filePath);
      
      // Sign image
      const result = await this.c2paService.signImage(imageBuffer, {
        creator: options.creator,
        title: options.title || filename
      });
      
      // Write signed image to output
      if (options.output) {
        const outputPath = join(options.output, filename);
        writeFileSync(outputPath, result.signedBuffer);
      }
      
      const duration = Date.now() - startTime;
      this.results.push({
        filename,
        success: true,
        proofUri: result.proofUri,
        duration
      });
      
      logger.info('File signed successfully', { filename, proofUri: result.proofUri });
      
    } catch (error: any) {
      const duration = Date.now() - startTime;
      this.results.push({
        filename,
        success: false,
        error: error.message,
        duration
      });
      
      logger.error('File signing failed', { filename, error: error.message });
    }
  }

  /**
   * Generate and display report
   */
  private generateReport(totalDuration: number, format: string): void {
    const successful = this.results.filter(r => r.success);
    const failed = this.results.filter(r => !r.success);
    const avgDuration = this.results.reduce((sum, r) => sum + r.duration, 0) / this.results.length;
    
    console.log('\n================================');
    console.log('📊 Batch Signing Report');
    console.log('================================\n');
    
    if (format === 'json') {
      console.log(JSON.stringify({
        summary: {
          total: this.results.length,
          successful: successful.length,
          failed: failed.length,
          totalDuration,
          avgDuration
        },
        results: this.results
      }, null, 2));
    } else if (format === 'csv') {
      console.log('filename,success,proofUri,error,duration');
      this.results.forEach(r => {
        console.log(`${r.filename},${r.success},${r.proofUri || ''},${r.error || ''},${r.duration}`);
      });
    } else {
      // Text format
      console.log(`Total files:     ${this.results.length}`);
      console.log(`✅ Successful:   ${successful.length}`);
      console.log(`❌ Failed:       ${failed.length}`);
      console.log(`⏱️  Total time:   ${(totalDuration / 1000).toFixed(2)}s`);
      console.log(`📊 Avg time:     ${(avgDuration / 1000).toFixed(2)}s/file\n`);
      
      if (failed.length > 0) {
        console.log('Failed files:');
        failed.forEach(r => {
          console.log(`  ❌ ${r.filename}: ${r.error}`);
        });
        console.log('');
      }
      
      console.log('Proof URIs:');
      successful.forEach(r => {
        console.log(`  ✅ ${r.filename}: ${r.proofUri}`);
      });
    }
  }
}

// CLI setup
const program = new Command();

program
  .name('batch-sign')
  .description('Batch sign multiple images with C2PA credentials')
  .requiredOption('-i, --input <pattern>', 'Input files (glob pattern, directory, or single file)')
  .option('-o, --output <directory>', 'Output directory for signed images')
  .option('-c, --creator <name>', 'Creator name for C2PA metadata')
  .option('-t, --title <title>', 'Title for C2PA metadata')
  .option('-p, --parallel <number>', 'Number of parallel signing jobs', '1')
  .option('-f, --format <format>', 'Output format (text, json, csv)', 'text')
  .action(async (options: any) => {
    const cli = new BatchSignCLI();
    await cli.run({
      input: options.input,
      output: options.output,
      creator: options.creator,
      title: options.title,
      parallel: parseInt(options.parallel),
      format: options.format
    });
  });

program.parse();
