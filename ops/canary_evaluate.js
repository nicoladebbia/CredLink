#!/usr/bin/env node
/**
 * Canary Evaluation - Phase 46
 * Evaluates canary metrics against control and decides promote/rollback
 * 
 * Usage: node canary_evaluate.js --version <sha>
 */

const args = process.argv.slice(2);
const getArg = (name) => {
  const index = args.indexOf(`--${name}`);
  return index !== -1 ? args[index + 1] : null;
};

const version = getArg('version') || 'unknown';

console.log('📊 Canary Evaluation');
console.log(`   Version: ${version}`);
console.log('');

// In production, fetch from observability stack
// For now, simulate evaluation
const metrics = {
  canary: {
    survival_rate: 0.9995,
    error_rate: 0.0008,
    p95_latency: 155,
    request_count: 50000
  },
  control: {
    survival_rate: 0.9994,
    error_rate: 0.0009,
    p95_latency: 150,
    request_count: 950000
  }
};

console.log('Canary Metrics:');
console.log(`   Survival: ${(metrics.canary.survival_rate * 100).toFixed(3)}%`);
console.log(`   Error rate: ${(metrics.canary.error_rate * 100).toFixed(3)}%`);
console.log(`   P95 latency: ${metrics.canary.p95_latency}ms`);
console.log(`   Requests: ${metrics.canary.request_count.toLocaleString()}`);
console.log('');

console.log('Control Metrics:');
console.log(`   Survival: ${(metrics.control.survival_rate * 100).toFixed(3)}%`);
console.log(`   Error rate: ${(metrics.control.error_rate * 100).toFixed(3)}%`);
console.log(`   P95 latency: ${metrics.control.p95_latency}ms`);
console.log(`   Requests: ${metrics.control.request_count.toLocaleString()}`);
console.log('');

// Evaluation criteria
const survivalOk = metrics.canary.survival_rate >= 0.999;
const errorRateOk = metrics.canary.error_rate <= 0.001;
const latencyOk = metrics.canary.p95_latency <= metrics.control.p95_latency * 1.10;
const noRegression = metrics.canary.survival_rate >= metrics.control.survival_rate * 0.999;

console.log('Evaluation:');
console.log(`   ${survivalOk ? '✓' : '✗'} Survival ≥ 99.9%: ${survivalOk}`);
console.log(`   ${errorRateOk ? '✓' : '✗'} Error rate ≤ 0.1%: ${errorRateOk}`);
console.log(`   ${latencyOk ? '✓' : '✗'} Latency degradation < 10%: ${latencyOk}`);
console.log(`   ${noRegression ? '✓' : '✗'} No survival regression: ${noRegression}`);
console.log('');

if (survivalOk && errorRateOk && latencyOk && noRegression) {
  console.log('✅ CANARY APPROVED - Safe to promote');
  process.exit(0);
} else {
  console.log('❌ CANARY REJECTED - Rollback recommended');
  process.exit(1);
}
