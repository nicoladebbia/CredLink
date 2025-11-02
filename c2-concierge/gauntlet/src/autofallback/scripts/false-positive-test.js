#!/usr/bin/env node
"use strict";
/**
 * Phase 6 - Optimizer Auto-Fallback: False Positive Test Script
 * Tests that legitimate CDN optimizations don't trigger fallback
 */
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const path_1 = require("path");
class FalsePositiveTester {
    config;
    results;
    constructor(config) {
        this.config = config;
        this.results = {
            config,
            startTime: new Date().toISOString(),
            endTime: '',
            totalRequests: 0,
            falsePositiveDetected: false,
            finalMode: 'NORMAL',
            errors: []
        };
    }
    async run() {
        console.log(`🧪 Starting false positive test for ${this.config.route}`);
        console.log(`⏱️  Duration: ${this.config.duration}s at ${this.config.requestRate} req/s`);
        const endTime = Date.now() + (this.config.duration * 1000);
        const interval = 1000 / this.config.requestRate;
        while (Date.now() < endTime) {
            await this.sendLegitimateRequest();
            await new Promise(resolve => setTimeout(resolve, interval));
        }
        // Check final policy state
        await this.checkFinalState();
        this.results.endTime = new Date().toISOString();
        return this.results;
    }
    async sendLegitimateRequest() {
        try {
            const response = await fetch(this.config.endpoint + this.config.route, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; C2PA-Test/1.0)',
                    'Accept': 'image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Cache-Control': 'max-age=0'
                }
            });
            this.results.totalRequests++;
            if (!response.ok) {
                this.results.errors.push(`HTTP ${response.status} on request ${this.results.totalRequests}`);
            }
        }
        catch (error) {
            this.results.errors.push(`Request ${this.results.totalRequests}: ${error}`);
        }
    }
    async checkFinalState() {
        try {
            const policyResponse = await fetch(`${this.config.endpoint}/_c2/policy?route=${encodeURIComponent(this.config.route)}`);
            if (policyResponse.ok) {
                const policy = await policyResponse.json();
                this.results.finalMode = policy.mode;
                if (policy.mode !== 'NORMAL') {
                    this.results.falsePositiveDetected = true;
                    console.log(`❌ False positive detected: Policy flipped to ${policy.mode}`);
                }
                else {
                    console.log(`✅ No false positive: Policy remained NORMAL`);
                }
            }
        }
        catch (error) {
            this.results.errors.push(`Policy check: ${error}`);
        }
    }
}
// CLI interface
async function main() {
    const args = process.argv.slice(2);
    const config = {
        endpoint: 'http://localhost:8787',
        route: '/images/photo.jpg',
        requestRate: 5,
        duration: 60
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
            case '--duration':
                config.duration = parseInt(args[++i] || '60');
                break;
        }
    }
    // Validate configuration
    if (!config.endpoint || !config.route) {
        console.error('❌ --endpoint and --route are required');
        process.exit(1);
    }
    const tester = new FalsePositiveTester(config);
    const results = await tester.run();
    // Save results
    const resultsFile = (0, path_1.join)(process.cwd(), 'false-positive-results.json');
    (0, fs_1.writeFileSync)(resultsFile, JSON.stringify(results, null, 2));
    console.log(`\n📊 Test completed:`);
    console.log(`   Total requests: ${results.totalRequests}`);
    console.log(`   False positive: ${results.falsePositiveDetected ? 'YES' : 'NO'}`);
    console.log(`   Final mode: ${results.finalMode}`);
    console.log(`   Errors: ${results.errors.length}`);
    console.log(`\n💾 Results saved to: ${resultsFile}`);
    // Exit with error code if false positive detected
    process.exit(results.falsePositiveDetected ? 1 : 0);
}
if (require.main === module) {
    main().catch(error => {
        console.error('❌ Test failed:', error);
        process.exit(1);
    });
}
//# sourceMappingURL=false-positive-test.js.map