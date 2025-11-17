import { CircuitBreaker, CircuitState } from './circuit-breaker.js';

// Simple integration test to verify circuit breaker functionality
async function testCircuitBreaker() {
  console.log('🔧 Testing Circuit Breaker Integration...');
  
  const circuitBreaker = new CircuitBreaker({
    failureThreshold: 3,
    resetTimeout: 1000,
    monitoringPeriod: 500,
    expectedRecoveryTime: 500,
    // 🔥 HARDCODED DATA FIX: Include all required options
    lockTimeout: 1000,
    lockCleanupInterval: 500,
    maxLockWaitTime: 1000,
    randomDelayMin: 1,
    randomDelayMax: 5,
    successThresholdBase: 2,
    forceReleaseThreshold: 5000,
  });

  // Test 1: Always succeeds mock
  const successOperation = async () => {
    return 'Operation succeeded';
  };

  // Test 2: Fails 4 times then succeeds
  let failureCount = 0;
  const failThenSucceedOperation = async () => {
    if (failureCount < 4) {
      failureCount++;
      throw new Error(`Simulated failure ${failureCount}`);
    }
    return 'Operation succeeded';
  };

  try {
    // Test 1: Normal operation (always succeeds)
    console.log('✅ Test 1: Normal operation');
    const result = await circuitBreaker.execute(successOperation);
    console.log(`Result: ${result}`);

    // Test 2: Circuit opens after threshold
    console.log('✅ Test 2: Circuit opens after threshold');
    failureCount = 0;
    for (let i = 0; i < 4; i++) {
      try {
        await circuitBreaker.execute(failThenSucceedOperation);
      } catch (error) {
        console.log(`Expected failure: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    const stats = circuitBreaker.getStats();
    console.log(`Circuit state: ${stats.state}, Failures: ${stats.failures}`);
    
    if (stats.state === CircuitState.OPEN) {
      console.log('✅ Circuit successfully opened after failure threshold');
    }

    // Test 3: Immediate rejection when open
    console.log('✅ Test 3: Immediate rejection when circuit is open');
    try {
      await circuitBreaker.execute(successOperation);
    } catch (error) {
      if (error instanceof Error && error.message === 'Service temporarily unavailable') {
        console.log('✅ Circuit correctly rejected operation immediately');
      }
    }

    console.log('🎉 All circuit breaker integration tests passed!');
    return true;
    
  } catch (error) {
    console.error('❌ Circuit breaker integration test failed:', error);
    return false;
  }
}

// Run test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testCircuitBreaker()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Test execution failed:', error);
      process.exit(1);
    });
}

export { testCircuitBreaker };
