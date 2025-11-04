/**
 * Example: Verify page assets on build
 * 
 * This example demonstrates how to integrate C2 Concierge verification
 * into a build process to ensure all assets have valid provenance.
 */

import { Client, ValidationError } from '@c2concierge/sdk';

// Initialize client
const client = new Client({
  apiKey: process.env.C2_API_KEY,
  telemetry: {
    enabled: process.env.NODE_ENV === 'production',
  },
});

/**
 * Verify all assets on a page and fail build if any are invalid
 */
async function verifyPageAssets(pageUrl: string, options: {
  policyId?: string;
  followLinks?: boolean;
  maxDepth?: number;
  failOnInvalid?: boolean;
} = {}): Promise<void> {
  const {
    policyId = 'default',
    followLinks = true,
    maxDepth = 2,
    failOnInvalid = true,
  } = options;

  console.log(`🔍 Verifying assets on page: ${pageUrl}`);
  
  let totalAssets = 0;
  let verifiedAssets = 0;
  let failedAssets: string[] = [];

  try {
    for await (const result of client.verifyPage(pageUrl, {
      followLinks,
      maxDepth,
      policyId,
    })) {
      totalAssets++;
      
      if (result.verified) {
        verifiedAssets++;
        console.log(`✅ ${result.url}`);
      } else {
        failedAssets.push(result.url);
        console.log(`❌ ${result.url} - ${result.error}`);
        
        if (failOnInvalid) {
          throw new Error(`Asset verification failed for ${result.url}: ${result.error}`);
        }
      }
    }

    console.log(`\n📊 Verification Summary:`);
    console.log(`   Total assets: ${totalAssets}`);
    console.log(`   Verified: ${verifiedAssets}`);
    console.log(`   Failed: ${failedAssets.length}`);

    if (failedAssets.length > 0 && !failOnInvalid) {
      console.log(`\n⚠️  Failed assets:`);
      failedAssets.forEach(url => console.log(`   - ${url}`));
    }

    if (verifiedAssets === totalAssets) {
      console.log(`\n🎉 All assets verified successfully!`);
    } else if (failOnInvalid) {
      process.exit(1);
    }
  } catch (error) {
    if (error instanceof ValidationError) {
      console.error(`\n❌ Validation Error: ${error.message}`);
      console.error(`   Hint: ${error.hint}`);
      console.error(`   Next steps: ${error.getNextSteps().join(', ')}`);
    } else if (error instanceof Error) {
      console.error(`\n❌ Error: ${error.message}`);
    }
    process.exit(1);
  }
}

/**
 * Verify multiple pages in parallel
 */
async function verifyMultiplePages(pageUrls: string[]): Promise<void> {
  console.log(`🔍 Verifying ${pageUrls.length} pages in parallel...\n`);
  
  const results = await Promise.allSettled(
    pageUrls.map(url => verifyPageAssets(url, { failOnInvalid: false }))
  );

  const successful = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;

  console.log(`\n📊 Batch Verification Summary:`);
  console.log(`   Successful: ${successful}`);
  console.log(`   Failed: ${failed}`);

  if (failed > 0) {
    console.log(`\n❌ Some pages failed verification`);
    process.exit(1);
  }
}

// ============================================================================
// Command Line Interface
// ============================================================================

if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`
Usage: node verify-on-build.js <page-url> [page-url-2] [...]

Examples:
  node verify-on-build.js https://example.com/article
  node verify-on-build.js https://example.com/page1 https://example.com/page2

Environment Variables:
  C2_API_KEY          Your C2 Concierge API key (required)
  NODE_ENV            Set to 'production' to enable telemetry
`);
    process.exit(1);
  }

  if (!process.env.C2_API_KEY) {
    console.error('❌ C2_API_KEY environment variable is required');
    process.exit(1);
  }

  if (args.length === 1) {
    // Single page verification
    verifyPageAssets(args[0]).catch(error => {
      console.error('Verification failed:', error.message);
      process.exit(1);
    });
  } else {
    // Multiple page verification
    verifyMultiplePages(args).catch(error => {
      console.error('Batch verification failed:', error.message);
      process.exit(1);
    });
  }
}

export { verifyPageAssets, verifyMultiplePages };
