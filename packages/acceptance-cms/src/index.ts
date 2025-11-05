#!/usr/bin/env node

/**
 * C2 Concierge CMS Acceptance Testing Framework
 * Main entry point for running CMS acceptance tests
 */

import { runWordPressTests } from './wp-test.js';
import { runShopifyTests } from './shopify-test.js';

async function main() {
  console.log('🚀 Starting C2 Concierge CMS Acceptance Tests');
  
  const args = process.argv.slice(2);
  const cmsType = args[0];
  
  try {
    switch (cmsType) {
      case 'wordpress':
      case 'wp':
        await runWordPressTests();
        break;
      case 'shopify':
        await runShopifyTests();
        break;
      default:
        console.log('📋 Running all CMS tests...');
        await runWordPressTests();
        await runShopifyTests();
        break;
    }
    
    console.log('✅ All CMS acceptance tests completed successfully');
  } catch (error) {
    console.error('❌ CMS acceptance tests failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { main };
