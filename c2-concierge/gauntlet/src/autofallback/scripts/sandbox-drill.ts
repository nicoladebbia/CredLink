#!/usr/bin/env node

/**
 * Phase 6 - Optimizer Auto-Fallback: Sandbox Drill Script
 * Simulates strip-happy CDN behavior to trigger auto-fallback
 */

import { writeFileSync } from 'fs';
import { join } from 'path';

// Use built-in fetch for Node.js 18+
declare const fetch: (input: string | URL, init?: RequestInit) => Promise<Response>;

interface DrillConfig {
  endpoint: string;
  route: string;
  requestRate: number; // requests per second
  duration: number; // seconds
  aggressiveTransform: boolean;
  expectedFlipTime: number; // seconds
}

interface DrillResult {
  config: DrillConfig;
  startTime: string;
  endTime: string;
  totalRequests: number;
  successfulRequests: number;
  flipDetected: boolean;
  flipTime?: number;
  flipResponse?: any;
  errors: string[];
}

class AutoFallbackDrill {
  private config: DrillConfig;
  private results: DrillResult;

  constructor(config: DrillConfig) {
    this.config = config;
    this.results = {
      config,
      startTime: new Date().toISOString(),
      endTime: '',
      totalRequests: 0,
      successfulRequests: 0,
      flipDetected: false,
      errors: []
    };
  }

  async runDrill(): Promise<DrillResult> {
    console.log(`🚀 Starting auto-fallback drill for route: ${this.config.route}`);
    console.log(`📊 Configuration:`, {
      endpoint: this.config.endpoint,
      requestRate: this.config.requestRate,
      duration: this.config.duration,
      aggressiveTransform: this.config.aggressiveTransform
    });

    const startTime = Date.now();
    const endTime = startTime + (this.config.duration * 1000);
    
    // Start monitoring for policy changes
    const monitorPromise = this.startPolicyMonitoring();
    
    // Generate load
    const loadPromise = this.generateLoad(endTime);
    
    // Wait for completion
    await Promise.all([monitorPromise, loadPromise]);
    
    this.results.endTime = new Date().toISOString();
    
    // Save results
    this.saveResults();
    
    return this.results;
  }

  private async generateLoad(endTime: number): Promise<void> {
    const intervalMs = 1000 / this.config.requestRate;
    let requestId = 0;

    while (Date.now() < endTime) {
      const requestStart = Date.now();
      
      try {
        await this.sendRequest(requestId++);
        this.results.successfulRequests++;
      } catch (error) {
        this.results.errors.push(`Request ${requestId}: ${error}`);
      }
      
      this.results.totalRequests++;
      
      // Rate limiting
      const requestDuration = Date.now() - requestStart;
      const sleepTime = Math.max(0, intervalMs - requestDuration);
      
      if (sleepTime > 0) {
        await new Promise(resolve => setTimeout(resolve, sleepTime));
      }
    }
  }

  private async sendRequest(requestId: number): Promise<void> {
    const url = new URL(this.config.endpoint);
    
    // Add aggressive transform parameters if enabled
    if (this.config.aggressiveTransform) {
      url.searchParams.set('w', '800');
      url.searchParams.set('h', '600');
      url.searchParams.set('f', 'webp'); // Force format conversion
      url.searchParams.set('q', '70'); // Aggressive compression
      url.searchParams.set('strip', 'all'); // Strip metadata
    }

    const headers = {
      'User-Agent': 'C2-AutoFallback-Drill/1.0',
      'X-Request-ID': requestId.toString(),
      'X-Drill-Timestamp': Date.now().toString()
    };

    const response = await fetch(url.toString(), { headers });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Check for policy enforcement
    const policyHeader = response.headers.get('X-C2-Policy');
    if (policyHeader === 'remote-only' && !this.results.flipDetected) {
      this.results.flipDetected = true;
      this.results.flipTime = Date.now();
      this.results.flipResponse = {
        policy: policyHeader,
        timestamp: new Date().toISOString(),
        headers: Object.fromEntries(response.headers.entries())
      };
      
      console.log(`🎯 Flip detected after ${Date.now() - Date.parse(this.results.startTime)}ms`);
    }
  }

  private async startPolicyMonitoring(): Promise<void> {
    const monitorInterval = setInterval(async () => {
      try {
        const policyResponse = await fetch(`${this.config.endpoint}/_c2/policy?route=${encodeURIComponent(this.config.route)}`);
        
        if (policyResponse.ok) {
          const policy = await policyResponse.json() as any;
          
          if (policy.mode === 'FALLBACK_REMOTE_ONLY' && !this.results.flipDetected) {
            this.results.flipDetected = true;
            this.results.flipTime = Date.now();
            this.results.flipResponse = policy;
            
            console.log(`🎯 Policy flip detected: ${policy.mode}`);
            clearInterval(monitorInterval);
          }
        }
      } catch (error) {
        this.results.errors.push(`Policy monitor: ${error}`);
      }
    }, 2000); // Check every 2 seconds

    // Stop monitoring after drill completes
    setTimeout(() => clearInterval(monitorInterval), this.config.duration * 1000 + 10000);
  }

  private saveResults(): void {
    const resultsPath = join(process.cwd(), 'artifacts', 'autofallback', 'drill-results.json');
    
    try {
      writeFileSync(resultsPath, JSON.stringify(this.results, null, 2));
      console.log(`💾 Results saved to: ${resultsPath}`);
    } catch (error) {
      console.error(`Failed to save results: ${error}`);
    }
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`
Usage: npm run drill:flip [options]

Options:
  --endpoint <url>        CDN endpoint to test
  --route <route>         Route key (e.g., cdn.example.com:/images/)
  --rate <number>         Requests per second (default: 10)
  --duration <seconds>    Test duration (default: 120)
  --aggressive            Enable aggressive transforms
  --expected-flip <sec>   Expected flip time (default: 60)

Examples:
  npm run drill:flip --endpoint https://cdn.example.com --route "cdn.example.com:/images/" --aggressive
  npm run drill:flip --endpoint https://test.cdn.com --route "test.cdn.com:/assets/" --rate 20 --duration 180
    `);
    process.exit(1);
  }

  const config: DrillConfig = {
    endpoint: '',
    route: '',
    requestRate: 10,
    duration: 120,
    aggressiveTransform: false,
    expectedFlipTime: 60
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
        config.requestRate = parseInt(args[++i] || '10');
        break;
      case '--duration':
        config.duration = parseInt(args[++i] || '120');
        break;
      case '--aggressive':
        config.aggressiveTransform = true;
        break;
      case '--expected-flip':
        config.expectedFlipTime = parseInt(args[++i] || '60');
        break;
    }
  }

  // Validate configuration
  if (!config.endpoint || !config.route) {
    console.error('❌ --endpoint and --route are required');
    process.exit(1);
  }

  // Create artifacts directory
  const artifactsDir = join(process.cwd(), 'artifacts', 'autofallback');
  try {
    require('fs').mkdirSync(artifactsDir, { recursive: true });
  } catch (error) {
    // Directory might already exist
  }

  // Run the drill
  const drill = new AutoFallbackDrill(config);
  const results = await drill.runDrill();

  // Report results
  console.log('\n📊 Drill Results:');
  console.log(`Total requests: ${results.totalRequests}`);
  console.log(`Successful requests: ${results.successfulRequests}`);
  console.log(`Flip detected: ${results.flipDetected ? 'YES' : 'NO'}`);
  
  if (results.flipDetected && results.flipTime) {
    const flipDuration = results.flipTime - Date.parse(results.startTime);
    console.log(`Flip time: ${flipDuration}ms`);
    
    if (flipDuration <= config.expectedFlipTime * 1000) {
      console.log(`✅ Flip within expected time (${config.expectedFlipTime}s)`);
    } else {
      console.log(`❌ Flip slower than expected (${config.expectedFlipTime}s)`);
    }
  } else {
    console.log(`❌ No flip detected within ${config.duration}s`);
  }

  if (results.errors.length > 0) {
    console.log(`\n⚠️  Errors: ${results.errors.length}`);
    results.errors.slice(0, 5).forEach(error => console.log(`  - ${error}`));
  }

  // Exit with appropriate code
  process.exit(results.flipDetected ? 0 : 1);
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Drill failed:', error);
    process.exit(1);
  });
}

export { AutoFallbackDrill, DrillConfig, DrillResult };
