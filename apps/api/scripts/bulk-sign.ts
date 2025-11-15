#!/usr/bin/env ts-node

/**
 * Bulk Image Signing Utility
 * 
 * Usage:
 *   ts-node scripts/bulk-sign.ts <input-dir> <output-dir> [options]
 * 
 * Options:
 *   --creator <name>       Creator name for all images
 *   --title-prefix <text>  Prefix for image titles
 *   --concurrency <n>      Number of concurrent operations (default: 5)
 */

import { promises as fs } from 'fs';
import path from 'path';
import { C2PAService } from '../src/services/c2pa-service';
import { logger } from '../src/utils/logger';

interface BulkSignOptions {
  creator?: string;
  titlePrefix?: string;
  concurrency: number;
}

async function* getImageFiles(dir: string): AsyncGenerator<string> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      yield* getImageFiles(fullPath);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
        yield fullPath;
      }
    }
  }
}

async function signImage(
  inputPath: string,
  outputPath: string,
  c2paService: C2PAService,
  options: BulkSignOptions
): Promise<{ success: boolean; error?: string }> {
  try {
    const imageBuffer = await fs.readFile(inputPath);
    const fileName = path.basename(inputPath, path.extname(inputPath));
    
    const metadata = {
      creator: options.creator || 'Bulk Signing Utility',
      title: options.titlePrefix ? `${options.titlePrefix} - ${fileName}` : fileName,
      description: `Bulk signed from ${inputPath}`,
    };
    
    const result = await c2paService.signImage(imageBuffer, metadata);
    
    // Ensure output directory exists
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    
    // Write signed image
    await fs.writeFile(outputPath, result.signedBuffer);
    
    logger.info('Image signed successfully', { inputPath, outputPath });
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to sign image', { inputPath, error: errorMessage });
    return { success: false, error: errorMessage };
  }
}

async function bulkSign(inputDir: string, outputDir: string, options: BulkSignOptions) {
  console.log('Starting bulk signing operation...');
  console.log(`Input directory: ${inputDir}`);
  console.log(`Output directory: ${outputDir}`);
  console.log(`Concurrency: ${options.concurrency}`);
  console.log('');
  
  const c2paService = new C2PAService();
  const results = { success: 0, failed: 0, total: 0 };
  const queue: Promise<void>[] = [];
  
  for await (const imagePath of getImageFiles(inputDir)) {
    const relativePath = path.relative(inputDir, imagePath);
    const outputPath = path.join(outputDir, relativePath);
    
    results.total++;
    
    const task = signImage(imagePath, outputPath, c2paService, options).then((result) => {
      if (result.success) {
        results.success++;
        console.log(`✓ ${relativePath}`);
      } else {
        results.failed++;
        console.log(`✗ ${relativePath}: ${result.error}`);
      }
    });
    
    queue.push(task);
    
    // Limit concurrency
    if (queue.length >= options.concurrency) {
      await Promise.race(queue);
      queue.splice(queue.findIndex(p => p !== undefined), 1);
    }
  }
  
  // Wait for remaining tasks
  await Promise.all(queue);
  
  // Cleanup
  await c2paService.cleanup();
  
  console.log('');
  console.log('=== Bulk Signing Complete ===');
  console.log(`Total: ${results.total}`);
  console.log(`Success: ${results.success}`);
  console.log(`Failed: ${results.failed}`);
  console.log(`Success Rate: ${((results.success / results.total) * 100).toFixed(2)}%`);
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length < 2) {
  console.error('Usage: ts-node scripts/bulk-sign.ts <input-dir> <output-dir> [options]');
  console.error('');
  console.error('Options:');
  console.error('  --creator <name>       Creator name for all images');
  console.error('  --title-prefix <text>  Prefix for image titles');
  console.error('  --concurrency <n>      Number of concurrent operations (default: 5)');
  process.exit(1);
}

const inputDir = path.resolve(args[0]);
const outputDir = path.resolve(args[1]);

const options: BulkSignOptions = {
  concurrency: 5,
};

// Parse options
for (let i = 2; i < args.length; i++) {
  switch (args[i]) {
    case '--creator':
      options.creator = args[++i];
      break;
    case '--title-prefix':
      options.titlePrefix = args[++i];
      break;
    case '--concurrency':
      options.concurrency = parseInt(args[++i], 10);
      break;
  }
}

// Run bulk signing
bulkSign(inputDir, outputDir, options).catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
