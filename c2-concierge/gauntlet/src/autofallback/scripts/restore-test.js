#!/usr/bin/env node
"use strict";
/**
 * Phase 6 - Optimizer Auto-Fallback: Restore Test Script
 * Tests system recovery after removing strip-risk transforms
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RestoreTest = void 0;
const fs_1 = require("fs");
const path_1 = require("path");
class RestoreTest {
    config;
    results;
    constructor(config) {
        this.config = config;
        this.results = {
            config,
            startTime: new Date().toISOString(),
            endTime: '',
            restoreDetected: false,
            policyHistory: [],
            errors: []
        };
    }
    async runTest() {
        console.log(`🔄 Starting restore test for route: ${this.config.route}`);
        console.log(`⏱️  Hysteresis period: ${this.config.hysteresisPeriod}s`);
        console.log(`📊 Monitoring duration: ${this.config.monitoringDuration}s`);
        const startTime = Date.now();
        const endTime = startTime + (this.config.monitoringDuration * 1000);
        // Start policy monitoring
        const monitorPromise = this.startPolicyMonitoring(endTime);
        // Generate clean traffic (no aggressive transforms)
        const trafficPromise = this.generateCleanTraffic(endTime);
        // Wait for completion
        await Promise.all([monitorPromise, trafficPromise]);
        this.results.endTime = new Date().toISOString();
        // Save results
        this.saveResults();
        return this.results;
    }
    async generateCleanTraffic(endTime) {
        const intervalMs = 1000 / this.config.requestRate;
        let requestId = 0;
        while (Date.now() < endTime) {
            const requestStart = Date.now();
            try {
                await this.sendCleanRequest(requestId++);
            }
            catch (error) {
                this.results.errors.push(`Clean request ${requestId}: ${error}`);
            }
            // Rate limiting
            const requestDuration = Date.now() - requestStart;
            const sleepTime = Math.max(0, intervalMs - requestDuration);
            if (sleepTime > 0) {
                await new Promise(resolve => setTimeout(resolve, sleepTime));
            }
        }
    }
    async sendCleanRequest(requestId) {
        const url = new URL(this.config.endpoint);
        // Send clean requests without aggressive transforms
        url.searchParams.set('w', '800');
        url.searchParams.set('h', '600');
        // No format conversion, no aggressive compression, no metadata stripping
        const headers = {
            'User-Agent': 'C2-Restore-Test/1.0',
            'X-Request-ID': requestId.toString(),
            'X-Test-Type': 'restore-verification'
        };
        const response = await fetch(url.toString(), { headers });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
    }
    async startPolicyMonitoring(endTime) {
        const pollInterval = 5000; // Poll every 5 seconds
        let previousMode = '';
        const poll = async () => {
            if (Date.now() >= endTime)
                return;
            try {
                const policyResponse = await fetch(`${this.config.endpoint}/_c2/policy?route=${encodeURIComponent(this.config.route)}`);
                if (policyResponse.ok) {
                    const policy = await policyResponse.json();
                    // Record policy state
                    this.results.policyHistory.push({
                        timestamp: new Date().toISOString(),
                        mode: policy.mode || 'NORMAL',
                        score: policy.score || 0,
                        embedSurvival: policy.embedSurvival || 1.0
                    });
                    // Check for recovery
                    if (previousMode === 'FALLBACK_REMOTE_ONLY' && policy.mode === 'NORMAL') {
                        this.results.restoreDetected = true;
                        this.results.restoreTime = Date.now();
                        console.log(`✅ Restore detected at ${new Date().toISOString()}`);
                        return; // Stop monitoring after restore
                    }
                    if (previousMode === 'FALLBACK_REMOTE_ONLY' && policy.mode === 'RECOVERY_GUARD') {
                        console.log(`🔄 Recovery guard activated at ${new Date().toISOString()}`);
                    }
                    previousMode = policy.mode;
                }
            }
            catch (error) {
                this.results.errors.push(`Policy monitor: ${error}`);
            }
            // Schedule next poll
            setTimeout(poll, pollInterval);
        };
        // Start polling
        poll();
    }
    saveResults() {
        const resultsPath = (0, path_1.join)(process.cwd(), 'artifacts', 'autofallback', 'restore-results.json');
        try {
            (0, fs_1.writeFileSync)(resultsPath, JSON.stringify(this.results, null, 2));
            console.log(`💾 Restore results saved to: ${resultsPath}`);
        }
        catch (error) {
            console.error(`Failed to save restore results: ${error}`);
        }
    }
}
exports.RestoreTest = RestoreTest;
// CLI interface
async function main() {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.log(`
Usage: npm run drill:restore [options]

Options:
  --endpoint <url>        CDN endpoint to test
  --route <route>         Route key (e.g., cdn.example.com:/images/)
  --rate <number>         Requests per second (default: 5)
  --hysteresis <seconds>  Hysteresis period (default: 600)
  --duration <seconds>    Monitoring duration (default: 900)

Examples:
  npm run drill:restore --endpoint https://cdn.example.com --route "cdn.example.com:/images/"
  npm run drill:restore --endpoint https://test.cdn.com --route "test.cdn.com:/assets/" --hysteresis 300
    `);
        process.exit(1);
    }
    const config = {
        endpoint: '',
        route: '',
        requestRate: 5,
        hysteresisPeriod: 600,
        monitoringDuration: 900
    };
    // Parse arguments
    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--endpoint':
                config.endpoint = args[++i] || '';
                break;
            case '--route':
                config.route = args[++i] || '';
                break;
            case '--rate':
                config.requestRate = parseInt(args[++i] || '5');
                break;
            case '--hysteresis':
                config.hysteresisPeriod = parseInt(args[++i] || '600');
                break;
            case '--duration':
                config.monitoringDuration = parseInt(args[++i] || '900');
                break;
        }
    }
    // Validate configuration
    if (!config.endpoint || !config.route) {
        console.error('❌ --endpoint and --route are required');
        process.exit(1);
    }
    // Create artifacts directory
    const artifactsDir = (0, path_1.join)(process.cwd(), 'artifacts', 'autofallback');
    try {
        require('fs').mkdirSync(artifactsDir, { recursive: true });
    }
    catch (error) {
        // Directory might already exist
    }
    // Run the test
    const test = new RestoreTest(config);
    const results = await test.runTest();
    // Report results
    console.log('\n📊 Restore Test Results:');
    console.log(`Restore detected: ${results.restoreDetected ? 'YES' : 'NO'}`);
    console.log(`Policy samples collected: ${results.policyHistory.length}`);
    if (results.restoreDetected && results.restoreTime) {
        const restoreDuration = results.restoreTime - Date.parse(results.startTime);
        console.log(`Restore time: ${restoreDuration}ms`);
        if (restoreDuration <= config.hysteresisPeriod * 1000) {
            console.log(`✅ Restore within hysteresis period (${config.hysteresisPeriod}s)`);
        }
        else {
            console.log(`⚠️  Restore slower than hysteresis period (${config.hysteresisPeriod}s)`);
        }
    }
    else {
        console.log(`❌ No restore detected within ${config.monitoringDuration}s`);
    }
    // Show policy progression
    if (results.policyHistory.length > 0) {
        console.log('\n📈 Policy Progression:');
        results.policyHistory.forEach((entry, i) => {
            const time = new Date(entry.timestamp).toLocaleTimeString();
            console.log(`  ${i + 1}. ${time} - ${entry.mode} (score: ${entry.score}, embed: ${(entry.embedSurvival * 100).toFixed(1)}%)`);
        });
    }
    if (results.errors.length > 0) {
        console.log(`\n⚠️  Errors: ${results.errors.length}`);
        results.errors.slice(0, 5).forEach(error => console.log(`  - ${error}`));
    }
    // Exit with appropriate code
    process.exit(results.restoreDetected ? 0 : 1);
}
// Run if called directly
if (require.main === module) {
    main().catch(error => {
        console.error('Restore test failed:', error);
        process.exit(1);
    });
}
//# sourceMappingURL=restore-test.js.map