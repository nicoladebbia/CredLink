#!/usr/bin/env tsx

/**
 * CI Script: OpenSSL ts -verify Parity Tests
 * Ensures our validator matches OpenSSL behavior before each release
 */

import { OpenSSLParityTester } from '../src/verification/openssl-parity.js';

async function main() {
  console.log('🔒 Running OpenSSL ts -verify Parity Tests\n');
  
  const tester = new OpenSSLParityTester();
  
  try {
    // Run parity tests
    console.log('📋 Executing test suite...');
    const results = await tester.runParityTests();
    
    // Generate report
    const report = tester.generateReport(results);
    
    // Display results
    console.log('\n📊 Test Results Summary:');
    console.log(`   Total Tests: ${report.summary.total}`);
    console.log(`   Passed: ${report.summary.passed}`);
    console.log(`   Failed: ${report.summary.failed}`);
    console.log(`   Parity Rate: ${report.summary.parity_rate.toFixed(1)}%`);
    
    if (report.failures.length > 0) {
      console.log('\n❌ Parity Test Failures:');
      for (const failure of report.failures) {
        console.log(`\n   Test: ${failure.testCase}`);
        console.log(`   Our Result: ${failure.ourResult.valid ? 'VALID' : 'INVALID'}${failure.ourResult.reason ? ` (${failure.ourResult.reason})` : ''}`);
        console.log(`   OpenSSL Result: ${failure.opensslResult.valid ? 'VALID' : 'INVALID'}${failure.opensslResult.output ? ` (${failure.opensslResult.output.trim()})` : ''}`);
        console.log(`   Differences: ${failure.differences.join(', ')}`);
      }
    }
    
    console.log('\n💡 Recommendations:');
    for (const recommendation of report.recommendations) {
      console.log(`   • ${recommendation}`);
    }
    
    // Exit with appropriate code
    if (report.summary.failed > 0) {
      console.log('\n🚫 OpenSSL parity tests FAILED');
      console.log('Validator does not match OpenSSL behavior - FIX REQUIRED');
      process.exit(1);
    } else {
      console.log('\n✅ OpenSSL parity tests PASSED');
      console.log('Validator maintains perfect OpenSSL parity');
      process.exit(0);
    }
    
  } catch (error) {
    console.error('\n💥 Test execution failed:', error);
    process.exit(1);
  }
}

// Check if OpenSSL is available
async function checkOpenSSL() {
  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    await execAsync('openssl version');
    return true;
  } catch {
    console.error('❌ OpenSSL is not available or not in PATH');
    console.error('Please install OpenSSL to run parity tests');
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  checkOpenSSL().then(() => main());
}

export { main as runParityTests };
