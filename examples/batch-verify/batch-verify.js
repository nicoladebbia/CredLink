/**
 * Example: Batch verify a feed of assets
 * 
 * This example demonstrates how to efficiently verify multiple assets
 * from RSS feeds, JSONL files, or simple URL lists.
 */

import { Client, RateLimitError } from '@c2concierge/sdk';
import { readFile, writeFile } from 'fs/promises';

// Initialize client
const client = new Client({
  apiKey: process.env.C2_API_KEY,
  retries: {
    maxAttempts: 3,
    baseMs: 500,
    maxMs: 3000,
    jitter: true,
  },
});

/**
 * Verify a list of asset URLs
 */
async function verifyUrlList(
  urls: string[],
  options: {
    policyId?: string;
    parallel?: boolean;
    timeoutPerAsset?: number;
    continueOnError?: boolean;
  } = {}
): Promise<{
  total: number;
  verified: number;
  failed: number;
  results: Array<{
    url: string;
    verified: boolean;
    error?: string;
    manifestUrl?: string;
  }>;
}> {
  const {
    policyId = 'default',
    parallel = true,
    timeoutPerAsset = 5000,
    continueOnError = true,
  } = options;

  console.log(`🔍 Verifying ${urls.length} assets in batch...`);
  console.log(`   Policy: ${policyId}`);
  console.log(`   Parallel: ${parallel}`);
  console.log(`   Timeout per asset: ${timeoutPerAsset}ms`);

  const results = [];
  let verified = 0;
  let failed = 0;

  try {
    for await (const result of client.batchVerify(urls, {
      policyId,
      parallel,
      timeoutPerAsset,
    })) {
      const assetResult = {
        url: result.asset.url,
        verified: result.result?.verified || false,
        error: result.error?.message,
        manifestUrl: result.result?.manifest_url,
      };

      results.push(assetResult);

      if (assetResult.verified) {
        verified++;
        console.log(`✅ ${assetResult.url}`);
        if (assetResult.manifestUrl) {
          console.log(`   Manifest: ${assetResult.manifestUrl}`);
        }
      } else {
        failed++;
        console.log(`❌ ${assetResult.url} - ${assetResult.error}`);
        
        if (!continueOnError) {
          throw new Error(`Batch verification failed for ${assetResult.url}: ${assetResult.error}`);
        }
      }
    }

    console.log(`\n📊 Batch Verification Summary:`);
    console.log(`   Total assets: ${urls.length}`);
    console.log(`   Verified: ${verified}`);
    console.log(`   Failed: ${failed}`);
    console.log(`   Success rate: ${((verified / urls.length) * 100).toFixed(1)}%`);

    return {
      total: urls.length,
      verified,
      failed,
      results,
    };

  } catch (error) {
    if (error instanceof RateLimitError) {
      console.error(`\n⏱️  Rate limited. Retry after ${error.retryAfter}s`);
      console.error(`   Hint: ${error.hint}`);
    } else {
      console.error(`\n❌ Batch verification failed: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Parse RSS feed and extract image/media URLs
 */
async function parseRssFeed(feedUrl: string): Promise<string[]> {
  console.log(`📡 Parsing RSS feed: ${feedUrl}`);

  try {
    const response = await fetch(feedUrl);
    const xml = await response.text();
    
    // Simple RSS parsing - in production, use a proper RSS parser
    const urlPattern = /<url>([^<]+)<\/url>/gi;
    const mediaPattern = /<media:content[^>]+url="([^"]+)"/gi;
    const enclosurePattern = /<enclosure[^>]+url="([^"]+)"/gi;
    
    const urls = new Set<string>();
    
    // Extract URLs from various RSS elements
    let match;
    while ((match = urlPattern.exec(xml)) !== null) {
      urls.add(match[1]);
    }
    while ((match = mediaPattern.exec(xml)) !== null) {
      urls.add(match[1]);
    }
    while ((match = enclosurePattern.exec(xml)) !== null) {
      urls.add(match[1]);
    }

    const urlList = Array.from(urls).filter(url => 
      url.match(/\.(jpg|jpeg|png|gif|webp|mp4|mov|avi|pdf)$/i)
    );

    console.log(`   Found ${urlList.length} media URLs`);
    return urlList;

  } catch (error) {
    console.error(`❌ Failed to parse RSS feed: ${error.message}`);
    throw error;
  }
}

/**
 * Parse JSONL file and extract URLs
 */
async function parseJsonlFile(filePath: string): Promise<string[]> {
  console.log(`📄 Parsing JSONL file: ${filePath}`);

  try {
    const content = await readFile(filePath, 'utf-8');
    const lines = content.trim().split('\n');
    
    const urls: string[] = [];
    
    for (const line of lines) {
      try {
        const item = JSON.parse(line);
        
        // Extract URLs from various possible fields
        if (item.url) urls.push(item.url);
        if (item.asset_url) urls.push(item.asset_url);
        if (item.media_url) urls.push(item.media_url);
        if (item.image_url) urls.push(item.image_url);
        
        // Handle nested objects
        if (item.asset && item.asset.url) urls.push(item.asset.url);
        if (item.media && item.media.url) urls.push(item.media.url);
        
      } catch (parseError) {
        console.warn(`   Skipping invalid JSON line: ${line.substring(0, 50)}...`);
      }
    }

    const uniqueUrls = [...new Set(urls)];
    console.log(`   Found ${uniqueUrls.length} unique URLs`);
    return uniqueUrls;

  } catch (error) {
    console.error(`❌ Failed to parse JSONL file: ${error.message}`);
    throw error;
  }
}

/**
 * Generate verification report
 */
async function generateReport(
  results: Array<{
    url: string;
    verified: boolean;
    error?: string;
    manifestUrl?: string;
  }>,
  outputPath: string,
  format: 'json' | 'csv' | 'html' = 'json'
): Promise<void> {
  console.log(`\n📊 Generating ${format.toUpperCase()} report: ${outputPath}`);

  const summary = {
    total: results.length,
    verified: results.filter(r => r.verified).length,
    failed: results.filter(r => !r.verified).length,
    successRate: ((results.filter(r => r.verified).length / results.length) * 100).toFixed(1),
    generatedAt: new Date().toISOString(),
  };

  try {
    switch (format) {
      case 'json':
        const jsonReport = {
          summary,
          results,
        };
        await writeFile(outputPath, JSON.stringify(jsonReport, null, 2));
        break;

      case 'csv':
        const csvHeader = 'URL,Verified,Error,ManifestUrl\n';
        const csvRows = results.map(r => 
          `"${r.url}",${r.verified},"${r.error || ''}","${r.manifestUrl || ''}"`
        ).join('\n');
        await writeFile(outputPath, csvHeader + csvRows);
        break;

      case 'html':
        const htmlReport = `
<!DOCTYPE html>
<html>
<head>
  <title>C2 Concierge Verification Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    .summary { background: #f5f5f5; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
    .success { color: #28a745; }
    .failure { color: #dc3545; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f2f2f2; }
    .verified { background-color: #d4edda; }
    .failed { background-color: #f8d7da; }
  </style>
</head>
<body>
  <h1>C2 Concierge Verification Report</h1>
  
  <div class="summary">
    <h2>Summary</h2>
    <p><strong>Total Assets:</strong> ${summary.total}</p>
    <p><strong>Verified:</strong> <span class="success">${summary.verified}</span></p>
    <p><strong>Failed:</strong> <span class="failure">${summary.failed}</span></p>
    <p><strong>Success Rate:</strong> ${summary.successRate}%</p>
    <p><strong>Generated:</strong> ${summary.generatedAt}</p>
  </div>
  
  <h2>Results</h2>
  <table>
    <thead>
      <tr>
        <th>URL</th>
        <th>Status</th>
        <th>Error</th>
        <th>Manifest URL</th>
      </tr>
    </thead>
    <tbody>
      ${results.map(r => `
        <tr class="${r.verified ? 'verified' : 'failed'}">
          <td>${r.url}</td>
          <td>${r.verified ? '✅ Verified' : '❌ Failed'}</td>
          <td>${r.error || ''}</td>
          <td>${r.manifestUrl || ''}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
</body>
</html>`;
        await writeFile(outputPath, htmlReport);
        break;
    }

    console.log(`✅ Report generated: ${outputPath}`);

  } catch (error) {
    console.error(`❌ Failed to generate report: ${error.message}`);
    throw error;
  }
}

/**
 * Demonstrate different feed types
 */
async function demonstrateFeedTypes(): Promise<void> {
  console.log(`🎯 Demonstrating batch verification with different feed types...\n`);

  // Example 1: Simple URL list
  console.log(`1️⃣  Simple URL List:`);
  const urlList = [
    'https://example.com/image1.jpg',
    'https://example.com/image2.png',
    'https://example.com/video1.mp4',
  ];
  
  await verifyUrlList(urlList, { continueOnError: false });

  // Example 2: JSONL file (would read from actual file in practice)
  console.log(`\n2️⃣  JSONL Feed:`);
  console.log(`   (In practice, would read from file)`);
  
  const sampleJsonl = [
    { url: 'https://example.com/doc1.pdf' },
    { asset: { url: 'https://example.com/image3.jpg' } },
    { media_url: 'https://example.com/video2.mp4' },
  ];
  
  const jsonlUrls = sampleJsonl.flatMap(item => 
    Object.values(item).filter(v => typeof v === 'string')
  );
  
  await verifyUrlList(jsonlUrls, { continueOnError: true });

  // Example 3: RSS feed (would fetch from actual URL in practice)
  console.log(`\n3️⃣  RSS Feed:`);
  console.log(`   (In practice, would fetch from RSS URL)`);
  console.log(`   Sample RSS feed URL: https://example.com/feed.rss`);
}

// ============================================================================
// Command Line Interface
// ============================================================================

if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`
Usage: node batch-verify.js <command> [options]

Commands:
  urls <url1> <url2> [url3...]
    Verify specific URLs
  
  jsonl <file.jsonl>
    Verify URLs from JSONL file
  
  rss <feed-url>
    Verify media URLs from RSS feed
  
  demo
    Demonstrate different feed types

Options:
  --policy <id>           Verification policy (default: default)
  --no-parallel           Process sequentially
  --timeout <ms>          Timeout per asset (default: 5000)
  --fail-fast             Stop on first error
  --report <file>         Generate report (json, csv, or html)
  --format <format>       Report format (json, csv, html)

Examples:
  node batch-verify.js urls https://a.jpg https://b.png https://c.mp4
  node batch-verify.js jsonl assets.jsonl --report report.json
  node batch-verify.js rss https://example.com/feed.rss --no-parallel
  node batch-verify.js demo

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
    case 'urls': {
      const urls = args.slice(1);
      if (urls.length === 0) {
        console.error('❌ URLs command requires at least one URL');
        process.exit(1);
      }
      
      const policy = args.find(arg => arg.startsWith('--policy='))?.split('=')[1];
      const noParallel = args.includes('--no-parallel');
      const timeout = parseInt(args.find(arg => arg.startsWith('--timeout='))?.split('=')[1] || '5000');
      const failFast = args.includes('--fail-fast');
      const reportFile = args.find(arg => arg.startsWith('--report='))?.split('=')[1];
      const reportFormat = args.find(arg => arg.startsWith('--format='))?.split('=')[1] as 'json' | 'csv' | 'html' || 'json';

      verifyUrlList(urls, {
        policyId: policy,
        parallel: !noParallel,
        timeoutPerAsset: timeout,
        continueOnError: !failFast,
      }).then(async (result) => {
        if (reportFile) {
          await generateReport(result.results, reportFile, reportFormat);
        }
      }).catch(error => {
        console.error('URL verification failed:', error.message);
        process.exit(1);
      });
      break;
    }

    case 'jsonl': {
      if (args.length < 2) {
        console.error('❌ JSONL command requires: <file.jsonl>');
        process.exit(1);
      }
      
      const [, filePath] = args;
      const policy = args.find(arg => arg.startsWith('--policy='))?.split('=')[1];
      const noParallel = args.includes('--no-parallel');
      const timeout = parseInt(args.find(arg => arg.startsWith('--timeout='))?.split('=')[1] || '5000');
      const failFast = args.includes('--fail-fast');
      const reportFile = args.find(arg => arg.startsWith('--report='))?.split('=')[1];
      const reportFormat = args.find(arg => arg.startsWith('--format='))?.split('=')[1] as 'json' | 'csv' | 'html' || 'json';

      parseJsonlFile(filePath).then(urls => {
        return verifyUrlList(urls, {
          policyId: policy,
          parallel: !noParallel,
          timeoutPerAsset: timeout,
          continueOnError: !failFast,
        });
      }).then(async (result) => {
        if (reportFile) {
          await generateReport(result.results, reportFile, reportFormat);
        }
      }).catch(error => {
        console.error('JSONL verification failed:', error.message);
        process.exit(1);
      });
      break;
    }

    case 'rss': {
      if (args.length < 2) {
        console.error('❌ RSS command requires: <feed-url>');
        process.exit(1);
      }
      
      const [, feedUrl] = args;
      const policy = args.find(arg => arg.startsWith('--policy='))?.split('=')[1];
      const noParallel = args.includes('--no-parallel');
      const timeout = parseInt(args.find(arg => arg.startsWith('--timeout='))?.split('=')[1] || '5000');
      const failFast = args.includes('--fail-fast');
      const reportFile = args.find(arg => arg.startsWith('--report='))?.split('=')[1];
      const reportFormat = args.find(arg => arg.startsWith('--format='))?.split('=')[1] as 'json' | 'csv' | 'html' || 'json';

      parseRssFeed(feedUrl).then(urls => {
        return verifyUrlList(urls, {
          policyId: policy,
          parallel: !noParallel,
          timeoutPerAsset: timeout,
          continueOnError: !failFast,
        });
      }).then(async (result) => {
        if (reportFile) {
          await generateReport(result.results, reportFile, reportFormat);
        }
      }).catch(error => {
        console.error('RSS verification failed:', error.message);
        process.exit(1);
      });
      break;
    }

    case 'demo': {
      demonstrateFeedTypes().catch(error => {
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

export { verifyUrlList, parseRssFeed, parseJsonlFile, generateReport, demonstrateFeedTypes };
