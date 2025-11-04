/**
 * Example: Inject Link headers into static HTML
 * 
 * This example demonstrates how to inject C2PA manifest Link headers
 * into static HTML files to enable automatic manifest discovery.
 */

import { Client } from '@c2concierge/sdk';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';

// Initialize client
const client = new Client({
  apiKey: process.env.C2_API_KEY,
});

/**
 * Inject Link headers into HTML content
 */
async function injectLinksIntoHtml(
  html: string,
  manifestUrl: string,
  options: {
    strategy?: 'sha256_path' | 'content_hash' | 'custom';
    selector?: string;
  } = {}
): Promise<string> {
  const { strategy = 'sha256_path', selector } = options;

  console.log(`🔗 Injecting Link headers into HTML...`);
  console.log(`   Strategy: ${strategy}`);
  console.log(`   Manifest URL: ${manifestUrl}`);

  try {
    const response = await client.injectLink(html, {
      manifestUrl,
      strategy,
      selector,
    });

    console.log(`✅ Successfully injected ${response.data.links_injected} Link headers`);
    console.log(`   Processed assets: ${response.data.assets_processed.join(', ')}`);

    return response.data.html;
  } catch (error) {
    console.error(`❌ Failed to inject Link headers: ${error.message}`);
    throw error;
  }
}

/**
 * Process a single HTML file
 */
async function processHtmlFile(
  inputPath: string,
  outputPath: string,
  manifestUrl: string,
  options: {
    strategy?: 'sha256_path' | 'content_hash' | 'custom';
    selector?: string;
    backup?: boolean;
  } = {}
): Promise<void> {
  const { backup = true } = options;

  console.log(`\n📄 Processing HTML file: ${inputPath}`);

  try {
    // Read input file
    const html = await readFile(inputPath, 'utf-8');
    console.log(`   Read ${html.length} characters from ${inputPath}`);

    // Create backup if requested
    if (backup) {
      const backupPath = `${inputPath}.backup`;
      await writeFile(backupPath, html);
      console.log(`   Created backup: ${backupPath}`);
    }

    // Inject Link headers
    const modifiedHtml = await injectLinksIntoHtml(html, manifestUrl, options);

    // Write output file
    await writeFile(outputPath, modifiedHtml);
    console.log(`   ✅ Wrote modified HTML to: ${outputPath}`);

    // Show diff summary
    const originalLines = html.split('\n').length;
    const modifiedLines = modifiedHtml.split('\n').length;
    console.log(`   📊 Lines: ${originalLines} → ${modifiedLines} (+${modifiedLines - originalLines})`);

  } catch (error) {
    console.error(`❌ Failed to process ${inputPath}: ${error.message}`);
    throw error;
  }
}

/**
 * Process multiple HTML files in a directory
 */
async function processHtmlDirectory(
  inputDir: string,
  outputDir: string,
  manifestUrl: string,
  options: {
    pattern?: string;
    recursive?: boolean;
    strategy?: 'sha256_path' | 'content_hash' | 'custom';
    selector?: string;
    backup?: boolean;
  } = {}
): Promise<void> {
  const { pattern = '*.html', recursive = false } = options;

  console.log(`\n📁 Processing HTML directory: ${inputDir}`);
  console.log(`   Pattern: ${pattern}`);
  console.log(`   Recursive: ${recursive}`);
  console.log(`   Output: ${outputDir}`);

  // This would typically use a glob library like 'glob'
  // For simplicity, we'll use a basic implementation
  const { readdir } = await import('fs/promises');
  
  try {
    const files = await readdir(inputDir, { withFileTypes: true });
    let processedCount = 0;

    for (const file of files) {
      const fullPath = join(inputDir, file.name);
      
      if (file.isFile() && file.name.endsWith('.html')) {
        const outputFile = join(outputDir, file.name);
        await processHtmlFile(fullPath, outputFile, manifestUrl, options);
        processedCount++;
      } else if (file.isDirectory() && recursive) {
        // Recursively process subdirectories
        const subInputDir = fullPath;
        const subOutputDir = join(outputDir, file.name);
        
        // Ensure output subdirectory exists
        const { mkdir } = await import('fs/promises');
        await mkdir(subOutputDir, { recursive: true });
        
        await processHtmlDirectory(subInputDir, subOutputDir, manifestUrl, options);
      }
    }

    console.log(`\n🎉 Processed ${processedCount} HTML files in ${inputDir}`);

  } catch (error) {
    console.error(`❌ Failed to process directory ${inputDir}: ${error.message}`);
    throw error;
  }
}

/**
 * Example: Different manifest URL strategies
 */
async function demonstrateStrategies(): Promise<void> {
  const sampleHtml = `
<!DOCTYPE html>
<html>
<head>
  <title>Sample Page</title>
</head>
<body>
  <h1>Sample Content</h1>
  <img src="image1.jpg" alt="Image 1" />
  <img src="image2.png" alt="Image 2" />
  <video src="video.mp4" controls></video>
</body>
</html>`;

  console.log(`🎯 Demonstrating different Link injection strategies...\n`);

  // Strategy 1: SHA-256 path
  console.log(`1️⃣  SHA-256 Path Strategy:`);
  const sha256Html = await injectLinksIntoHtml(sampleHtml, 'https://manifests.example.com/{sha256}.c2pa', {
    strategy: 'sha256_path',
  });
  console.log(`   Generated HTML preview:\n${sha256Html.substring(0, 300)}...\n`);

  // Strategy 2: Content hash
  console.log(`2️⃣  Content Hash Strategy:`);
  const contentHashHtml = await injectLinksIntoHtml(sampleHtml, 'https://manifests.example.com/{contentHash}.c2pa', {
    strategy: 'content_hash',
  });
  console.log(`   Generated HTML preview:\n${contentHashHtml.substring(0, 300)}...\n`);

  // Strategy 3: Custom URL
  console.log(`3️⃣  Custom URL Strategy:`);
  const customHtml = await injectLinksIntoHtml(sampleHtml, 'https://cdn.example.com/manifests/{id}.c2pa', {
    strategy: 'custom',
  });
  console.log(`   Generated HTML preview:\n${customHtml.substring(0, 300)}...\n`);
}

// ============================================================================
// Command Line Interface
// ============================================================================

if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`
Usage: node inject-link.js <command> [options]

Commands:
  file <input.html> <output.html> <manifest-url>
    Process a single HTML file
  
  dir <input-dir> <output-dir> <manifest-url>
    Process all HTML files in a directory
  
  demo
    Demonstrate different injection strategies

Options:
  --strategy <strategy>    Injection strategy (sha256_path, content_hash, custom)
  --selector <css>         CSS selector for assets (default: img[src], video[src], audio[src])
  --no-backup             Don't create backup files
  --recursive             Process subdirectories (directory mode only)

Examples:
  node inject-link.js file index.html index-out.html "https://manifests.example.com/{sha256}.c2pa"
  node inject-link.js dir ./src ./dist "https://cdn.example.com/manifests/{id}.c2pa" --recursive
  node inject-link.js demo

Environment Variables:
  C2_API_KEY              Your C2 Concierge API key (required)
`);
    process.exit(1);
  }

  if (!process.env.C2_API_KEY) {
    console.error('❌ C2_API_KEY environment variable is required');
    process.exit(1);
  }

  const command = args[0];

  switch (command) {
    case 'file': {
      if (args.length < 4) {
        console.error('❌ File command requires: <input.html> <output.html> <manifest-url>');
        process.exit(1);
      }
      
      const [, inputPath, outputPath, manifestUrl] = args;
      const strategy = args.find(arg => arg.startsWith('--strategy='))?.split('=')[1];
      const selector = args.find(arg => arg.startsWith('--selector='))?.split('=')[1];
      const noBackup = args.includes('--no-backup');

      processHtmlFile(inputPath, outputPath, manifestUrl, {
        strategy: strategy as any,
        selector,
        backup: !noBackup,
      }).catch(error => {
        console.error('File processing failed:', error.message);
        process.exit(1);
      });
      break;
    }

    case 'dir': {
      if (args.length < 4) {
        console.error('❌ Directory command requires: <input-dir> <output-dir> <manifest-url>');
        process.exit(1);
      }
      
      const [, inputDir, outputDir, manifestUrl] = args;
      const strategy = args.find(arg => arg.startsWith('--strategy='))?.split('=')[1];
      const selector = args.find(arg => arg.startsWith('--selector='))?.split('=')[1];
      const noBackup = args.includes('--no-backup');
      const recursive = args.includes('--recursive');

      processHtmlDirectory(inputDir, outputDir, manifestUrl, {
        strategy: strategy as any,
        selector,
        backup: !noBackup,
        recursive,
      }).catch(error => {
        console.error('Directory processing failed:', error.message);
        process.exit(1);
      });
      break;
    }

    case 'demo': {
      demonstrateStrategies().catch(error => {
        console.error('Demo failed:', error.message);
        process.exit(1);
      });
      break;
    }

    default:
      console.error(`❌ Unknown command: ${command}`);
      process.exit(1);
  }
}

export { injectLinksIntoHtml, processHtmlFile, processHtmlDirectory, demonstrateStrategies };
