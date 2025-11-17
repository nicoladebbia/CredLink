#!/usr/bin/env node

/**
 * Memory stress test for LRU cache implementation
 * Tests Step 9 LRU cache under extreme load conditions
 */

// Fix module resolution by using relative path and CommonJS
const { LRUCacheFactory } = require('./packages/cache/dist/index.js');

console.log('🧪 Starting LRU Cache Memory Stress Test...');

// Create a small cache to force rapid eviction
const cache = LRUCacheFactory.createCertificateCache({
  maxSize: 100, // Very small to stress test eviction
  ttlMs: 1000, // 1 second TTL
  cleanupIntervalMs: 500 // Fast cleanup
});

let operations = 0;
let errors = 0;

// Monitor memory usage
const startMemory = process.memoryUsage();
console.log('📊 Initial memory usage:', startMemory);

// Stress test: Rapid insertions to trigger eviction and cleanup
const stressTest = setInterval(() => {
  try {
    for (let i = 0; i < 1000; i++) {
      cache.set(`key-${operations}`, {
        id: operations,
        data: 'x'.repeat(1024), // 1KB per entry
        timestamp: new Date()
      });
      operations++;
    }
    
    // Random access to mix operations
    for (let i = 0; i < 100; i++) {
      const randomKey = `key-${Math.floor(Math.random() * operations)}`;
      cache.get(randomKey);
    }
    
    // Check memory usage every 10000 operations
    if (operations % 10000 === 0) {
      const currentMemory = process.memoryUsage();
      const memoryGrowth = currentMemory.heapUsed - startMemory.heapUsed;
      
      console.log(`📈 Operations: ${operations}, Memory growth: ${(memoryGrowth / 1024 / 1024).toFixed(2)}MB`);
      
      // Fail if memory grows more than 50MB
      if (memoryGrowth > 50 * 1024 * 1024) {
        console.error('❌ MEMORY LEAK DETECTED: Memory growing too fast');
        clearInterval(stressTest);
        process.exit(1);
      }
    }
    
  } catch (error) {
    errors++;
    if (errors > 10) {
      console.error('❌ Too many errors in stress test:', error);
      clearInterval(stressTest);
      process.exit(1);
    }
  }
}, 10);

// Run for 30 seconds
setTimeout(() => {
  clearInterval(stressTest);
  
  const endMemory = process.memoryUsage();
  const totalMemoryGrowth = endMemory.heapUsed - startMemory.heapUsed;
  
  console.log('✅ Stress test completed');
  console.log(`📊 Final stats:`);
  console.log(`  - Total operations: ${operations}`);
  console.log(`  - Errors: ${errors}`);
  console.log(`  - Memory growth: ${(totalMemoryGrowth / 1024 / 1024).toFixed(2)}MB`);
  
  // Test cache destruction
  cache.destroy();
  
  // Final memory check after destruction
  setTimeout(() => {
    const finalMemory = process.memoryUsage();
    const memoryAfterCleanup = finalMemory.heapUsed - startMemory.heapUsed;
    
    console.log(`🧹 Memory after cleanup: ${(memoryAfterCleanup / 1024 / 1024).toFixed(2)}MB`);
    
    if (memoryAfterCleanup < 10 * 1024 * 1024) { // Less than 10MB growth
      console.log('✅ LRU Cache stress test PASSED - No memory leaks detected');
      process.exit(0);
    } else {
      console.error('❌ LRU Cache stress test FAILED - Memory not properly cleaned up');
      process.exit(1);
    }
  }, 2000);
}, 30000);
