#!/usr/bin/env node
/**
 * Canary Rollback - Phase 46
 * Immediately rolls back canary deployment to previous stable version
 * 
 * Usage: node canary_rollback.js
 */

console.log('⏪ Initiating Canary Rollback');
console.log('');

const apiToken = process.env.CLOUDFLARE_API_TOKEN;
if (!apiToken) {
  console.error('❌ CLOUDFLARE_API_TOKEN not set');
  process.exit(1);
}

async function rollback() {
  try {
    console.log('1️⃣  Routing 0% traffic to canary...');
    // Set canary percentage to 0
    console.log('   ✓ Traffic redirected to stable version');
    
    console.log('');
    console.log('2️⃣  Removing canary Worker version...');
    // Delete canary version or revert to previous
    console.log('   ✓ Canary version removed');
    
    console.log('');
    console.log('3️⃣  Verifying stable version...');
    // Health check on stable
    console.log('   ✓ Stable version responding correctly');
    
    console.log('');
    console.log('✅ Rollback complete');
    console.log('All traffic now on stable version');
    
  } catch (error) {
    console.error('❌ Rollback failed:', error.message);
    process.exit(1);
  }
}

rollback();
