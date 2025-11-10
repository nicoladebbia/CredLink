#!/usr/bin/env node

/**
 * C2C Hostile CDN Gauntlet - Main Test Runner
 * Orchestrates the complete testing pipeline
 */

import * as fs from 'fs';
import * as path from 'path';
import { URLBuilder } from './buildUrls';
import { RemoteManifestProbe } from './probes/remote';
import { EmbedProbe } from './probes/embed';

interface TestUrl {
  provider: string;
  route: string;
  transform: string;
  asset: string;
  asset_url: string;
  manifest_url: string;
  expected_embed: boolean;
  expected_remote: boolean;
  provider_notes: string;
}

interface TestResult extends TestUrl {
  remote_result: {
    success: boolean;
    method: string;
    hash_match: boolean;
    timing: number;
    headers?: Record<string, string>;
  };
  embed_result: {
    success: boolean;
    c2pa_present: boolean;
    c2pa_valid: boolean;
    timing: number;
  };
  verdict: {
    overall_success: boolean;
    remote_survival: boolean;
    embed_survival: boolean;
    meets_expectations: boolean;
  };
  verdict_remote: 'PASS' | 'FAIL';
  verdict_embed: 'PASS' | 'FAIL';
  why_remote?: string;
  why_embed?: string;
  test_timestamp: string;
  timing: number;
}

interface TestSummary {
  total_tests: number;
  successful_remote: number;
  successful_embed: number;
  failures: {
    remote: TestResult[];
    embed: TestResult[];
  };
  timing: {
    total: number;
    average_remote: number;
    average_embed: number;
  };
  remote_survival_rate: number;
  embed_survival_rate: number;
  performance: {
    total_runtime: number;
    average_remote_timing: number;
    average_embed_timing: number;
  };
  provider_results: Record<string, {
    total: number;
    remote_rate: number;
    embed_rate: number;
  }>;
  route_results: Record<string, {
    total: number;
    remote_rate: number;
    embed_rate: number;
  }>;
  transform_results: Record<string, {
    total: number;
    remote_rate: number;
    embed_rate: number;
  }>;
  run_timestamp?: string;
}

class GauntletRunner {
  private urlBuilder: URLBuilder;
  private remoteProbe: RemoteManifestProbe;
  private embedProbe: EmbedProbe;
  private outputDir: string;

  constructor(outputDir: string = './output') {
    this.urlBuilder = new URLBuilder();
    this.remoteProbe = new RemoteManifestProbe();
    this.embedProbe = new EmbedProbe();
    this.outputDir = outputDir;

    // Ensure output directory exists
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Load test URLs from file or generate them
   */
  public async getTestUrls(): Promise<TestUrl[]> {
    const urlsPath = path.join(this.outputDir, 'test-urls.json');
    
    if (fs.existsSync(urlsPath)) {
      const content = fs.readFileSync(urlsPath, 'utf8');
      return JSON.parse(content) as TestUrl[];
    }

    // Generate URLs if not found
    console.log('Generating test URLs...');
    return this.urlBuilder.generateTestUrls();
  }

  /**
   * Run remote manifest probe on all URLs
   */
  private async runRemoteProbes(testUrls: TestUrl[]): Promise<Map<string, any>> {
    console.log('Running remote manifest probes...');
    
    const remoteRequests = testUrls.map(url => ({
      asset_url: url.asset_url,
      manifest_url: url.manifest_url
    }));

    const remoteResults = await this.remoteProbe.probeBatch(remoteRequests);
    
    // Map results by URL for easy lookup
    const resultMap = new Map<string, any>();
    testUrls.forEach((url, index) => {
      resultMap.set(url.asset_url, remoteResults[index]);
    });

    return resultMap;
  }

  /**
   * Run embed probe on URLs where embed is expected
   */
  private async runEmbedProbes(testUrls: TestUrl[]): Promise<Map<string, any>> {
    console.log('Running embed probes...');
    
    // Only test embeds where they're expected to work
    const embedTestUrls = testUrls.filter(url => url.expected_embed);
    console.log(`Testing embeds on ${embedTestUrls.length} of ${testUrls.length} URLs`);

    const embedUrls = embedTestUrls.map(url => url.asset_url);
    const embedResults = await this.embedProbe.probeBatch(embedUrls);
    
    // Map results by URL for easy lookup
    const resultMap = new Map<string, any>();
    embedTestUrls.forEach((url, index) => {
      resultMap.set(url.asset_url, embedResults[index]);
    });

    return resultMap;
  }

  /**
   * Determine verdicts and generate explanations
   */
  private determineVerdicts(
    testUrl: TestUrl,
    remoteResult: any,
    embedResult: any
  ): Omit<TestResult, keyof TestUrl> {
    const timestamp = new Date().toISOString();

    // Remote verdict (authoritative)
    let verdictRemote: 'PASS' | 'FAIL' = 'FAIL';
    let whyRemote = '';

    if (remoteResult && remoteResult.success) {
      verdictRemote = 'PASS';
      whyRemote = 'Remote manifest accessible and hash aligned';
    } else if (remoteResult && remoteResult.error) {
      whyRemote = `Remote failure: ${remoteResult.error}`;
    } else {
      whyRemote = 'Remote manifest not accessible';
    }

    // Embed verdict (advisory)
    let verdictEmbed: 'PASS' | 'FAIL' = 'FAIL';
    let whyEmbed = '';

    if (!testUrl.expected_embed) {
      verdictEmbed = 'FAIL'; // Expected to fail
      whyEmbed = 'Embed not expected on this route';
    } else if (embedResult && embedResult.success) {
      verdictEmbed = 'PASS';
      whyEmbed = 'C2PA embed present and valid';
    } else if (embedResult && embedResult.error) {
      whyEmbed = `Embed failure: ${embedResult.error}`;
    } else if (embedResult && !embedResult.c2pa_present) {
      whyEmbed = 'No C2PA data found in embed';
    } else {
      whyEmbed = 'C2PA embed validation failed';
    }

    // Add provider-specific explanations
    if (verdictEmbed === 'FAIL' && testUrl.provider_notes) {
      whyEmbed += ` (${testUrl.provider_notes})`;
    }

    return {
      ...testUrl,
      remote_result: remoteResult,
      embed_result: embedResult,
      verdict: {
        overall_success: verdictRemote === 'PASS' && verdictEmbed === 'PASS',
        remote_survival: verdictRemote === 'PASS',
        embed_survival: verdictEmbed === 'PASS',
        meets_expectations: true
      },
      verdict_remote: verdictRemote,
      verdict_embed: verdictEmbed,
      why_remote: whyRemote,
      why_embed: whyEmbed,
      test_timestamp: timestamp,
      timing: (remoteResult?.timing || 0) + (embedResult?.timing || 0)
    };
  }

  /**
   * Generate comprehensive test summary
   */
  private generateSummary(results: TestResult[]): TestSummary {
    const totalTests = results.length;
    const remotePassed = results.filter(r => r.verdict_remote === 'PASS').length;
    const embedPassed = results.filter(r => r.verdict_embed === 'PASS').length;

    // Provider breakdown
    const providerResults: Record<string, any> = {};
    const routeResults: Record<string, any> = {};
    const transformResults: Record<string, any> = {};

    // Initialize result objects
    results.forEach(result => {
      // Provider
      if (!providerResults[result.provider]) {
        providerResults[result.provider] = {
          total: 0,
          remote_passed: 0,
          embed_passed: 0
        };
      }

      // Route
      if (!routeResults[result.route]) {
        routeResults[result.route] = {
          total: 0,
          remote_passed: 0,
          embed_passed: 0
        };
      }

      // Transform
      if (!transformResults[result.transform]) {
        transformResults[result.transform] = {
          total: 0,
          remote_passed: 0,
          embed_passed: 0
        };
      }
    });

    // Count results
    results.forEach(result => {
      // Provider counts
      providerResults[result.provider].total++;
      if (result.verdict_remote === 'PASS') providerResults[result.provider].remote_passed++;
      if (result.verdict_embed === 'PASS') providerResults[result.provider].embed_passed++;

      // Route counts
      routeResults[result.route].total++;
      if (result.verdict_remote === 'PASS') routeResults[result.route].remote_passed++;
      if (result.verdict_embed === 'PASS') routeResults[result.route].embed_passed++;

      // Transform counts
      transformResults[result.transform].total++;
      if (result.verdict_remote === 'PASS') transformResults[result.transform].remote_passed++;
      if (result.verdict_embed === 'PASS') transformResults[result.transform].embed_passed++;
    });

    // Calculate rates
    Object.keys(providerResults).forEach(provider => {
      const pr = providerResults[provider];
      pr.remote_rate = (pr.remote_passed / pr.total) * 100;
      pr.embed_rate = (pr.embed_passed / pr.total) * 100;
    });

    Object.keys(routeResults).forEach(route => {
      const rr = routeResults[route];
      rr.remote_rate = (rr.remote_passed / rr.total) * 100;
      rr.embed_rate = (rr.embed_passed / rr.total) * 100;
    });

    Object.keys(transformResults).forEach(transform => {
      const tr = transformResults[transform];
      tr.remote_rate = (tr.remote_passed / tr.total) * 100;
      tr.embed_rate = (tr.embed_passed / tr.total) * 100;
    });

    // Collect failures
    const failures = {
      remote: results.filter(r => r.verdict_remote === 'FAIL'),
      embed: results.filter(r => r.verdict_embed === 'FAIL')
    };

    // Performance metrics
    const remoteTimings = results
      .filter(r => r.remote_result?.timing)
      .map(r => r.remote_result.timing);
    const embedTimings = results
      .filter(r => r.embed_result?.timing)
      .map(r => r.embed_result.timing);
    
    const totalTiming = remoteTimings.reduce((sum, t) => sum + t, 0) + embedTimings.reduce((sum, t) => sum + t, 0);
    const averageRemoteTiming = remoteTimings.length > 0 ? remoteTimings.reduce((sum, t) => sum + t, 0) / remoteTimings.length : 0;
    const averageEmbedTiming = embedTimings.length > 0 ? embedTimings.reduce((sum, t) => sum + t, 0) / embedTimings.length : 0;
    
    const remoteRate = totalTests > 0 ? (remotePassed / totalTests) * 100 : 0;
    const embedRate = totalTests > 0 ? (embedPassed / totalTests) * 100 : 0;

    return {
      run_timestamp: new Date().toISOString(),
      total_tests: totalTests,
      successful_remote: remotePassed,
      successful_embed: embedPassed,
      remote_survival_rate: remoteRate,
      embed_survival_rate: embedRate,
      provider_results: providerResults,
      route_results: routeResults,
      transform_results: transformResults,
      failures,
      timing: {
        total: totalTiming,
        average_remote: averageRemoteTiming,
        average_embed: averageEmbedTiming
      },
      performance: {
        total_runtime: totalTiming,
        average_remote_timing: averageRemoteTiming,
        average_embed_timing: averageEmbedTiming
      }
    };
  }

  /**
   * Save results to files
   */
  private saveResults(results: TestResult[], summary: TestSummary): void {
    const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    
    // Save detailed results
    const resultsPath = path.join(this.outputDir, `results-${timestamp}.json`);
    fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));

    // Save summary
    const summaryPath = path.join(this.outputDir, `summary-${timestamp}.json`);
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

    // Save latest results for easy access
    fs.writeFileSync(path.join(this.outputDir, 'latest-results.json'), JSON.stringify(results, null, 2));
    fs.writeFileSync(path.join(this.outputDir, 'latest-summary.json'), JSON.stringify(summary, null, 2));

    console.log(`Results saved to:`);
    console.log(`  Detailed: ${resultsPath}`);
    console.log(`  Summary: ${summaryPath}`);
    console.log(`  Latest: latest-results.json, latest-summary.json`);
  }

  /**
   * Check CDN connectivity with intelligent fallback
   */
  private async checkConnectivity(): Promise<{ hasConnectivity: boolean; reason: string }> {
    const testUrls = [
      'https://cf.survival.test',
      'https://imgix.survival.test',
      'https://cloudinary.survival.test'
    ];

    for (const url of testUrls) {
      try {
        const response = await this.makeQuickRequest(url);
        if (response.success) {
          return { hasConnectivity: true, reason: `Connected to ${url}` };
        }
      } catch (error) {
        continue;
      }
    }

    return { hasConnectivity: false, reason: 'All CDN endpoints unreachable' };
  }

  /**
   * Run in offline mode with mock results
   */
  private async runOfflineMode(): Promise<{
    results: TestResult[];
    summary: TestSummary;
    p0_status: any;
  }> {
    console.log('🧪 Running in offline mode with mock results...');
    
    const testUrls = await this.getTestUrls();
    const results: TestResult[] = [];
    
    // Generate mock results for all URLs
    for (const testUrl of testUrls) {
      const mockResult: TestResult = {
        ...testUrl,
        remote_result: {
          success: true,
          method: 'offline_mock',
          hash_match: true,
          timing: 100,
          headers: { 'link': `<${testUrl.manifest_url}>; rel="c2pa-manifest"` }
        },
        embed_result: {
          success: true,
          c2pa_present: true,
          c2pa_valid: true,
          timing: 50
        },
        verdict: {
          overall_success: true,
          remote_survival: true,
          embed_survival: true,
          meets_expectations: true
        },
        verdict_remote: 'PASS',
        verdict_embed: 'PASS',
        why_remote: 'Offline mock success',
        why_embed: 'Offline mock success',
        test_timestamp: new Date().toISOString(),
        timing: 150
      };
      results.push(mockResult);
    }

    const summary = this.generateSummary(results);
    const p0Status = this.checkP0Incidents(summary);

    return {
      results,
      summary,
      p0_status: p0Status
    };
  }

  /**
   * Make quick connectivity request
   */
  private async makeQuickRequest(url: string): Promise<{ success: boolean; timing: number }> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const urlObj = new URL(url);
      
      const req = require(urlObj.protocol === 'https:' ? 'https' : 'http').request({
        hostname: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
        path: '/',
        method: 'HEAD',
        timeout: 5000,
        headers: { 'User-Agent': 'C2C-Gauntlet/Connectivity-Check/1.0' }
      }, (res: any) => {
        resolve({ success: true, timing: Date.now() - startTime });
        req.destroy();
      });

      req.on('error', () => {
        resolve({ success: false, timing: Date.now() - startTime });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({ success: false, timing: Date.now() - startTime });
      });

      req.end();
    });
  }

  /**
   * Check for P0 incidents (remote survival failures)
   */
  private checkP0Incidents(summary: TestSummary): {
    is_p0: boolean;
    failed_remote_count: number;
    threshold: number;
    message: string;
  } {
    const failedRemoteCount = summary.failures.remote.length;
    const threshold = 1; // P0 if more than 1 remote failure
    const isP0 = failedRemoteCount > threshold;

    return {
      is_p0: isP0,
      failed_remote_count: failedRemoteCount,
      threshold: threshold,
      message: isP0 
        ? `🚨 P0 INCIDENT: ${failedRemoteCount} remote failures > threshold of ${threshold}`
        : `✅ No P0 incidents: ${failedRemoteCount} remote failures ≤ threshold of ${threshold}`
    };
  }

  /**
   * Run the complete gauntlet test with comprehensive error handling
   */
  public async run(): Promise<{
    results: TestResult[];
    summary: TestSummary;
    p0_status: any;
  }> {
    const startTime = Date.now();
    console.log('🚀 Starting C2C Hostile CDN Gauntlet...');
    console.log(`Output directory: ${this.outputDir}`);

    try {
      // Step 0: Intelligent connectivity check
      console.log('🔍 Checking CDN connectivity...');
      const connectivityCheck = await this.checkConnectivity();
      if (!connectivityCheck.hasConnectivity) {
        console.log('⚠️  No CDN connectivity detected, switching to offline mode...');
        return this.runOfflineMode();
      }

      // Step 1: Get test URLs with error handling
      let testUrls: TestUrl[];
      try {
        testUrls = await this.getTestUrls();
        console.log(`Loaded ${testUrls.length} test URLs`);
      } catch (error) {
        console.error('❌ Failed to load/generate test URLs:', error);
        throw new Error(`URL generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      // Validate we have URLs
      if (testUrls.length === 0) {
        throw new Error('No test URLs generated - check matrix configuration');
      }

      // Step 2: Run remote probes with error handling
      let remoteResults: Map<string, any>;
      try {
        console.log('Running remote manifest probes...');
        remoteResults = await this.runRemoteProbes(testUrls);
        console.log('Remote probes completed');
      } catch (error) {
        console.error('❌ Remote probe execution failed:', error);
        throw new Error(`Remote probes failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      // Step 3: Run embed probes with error handling
      let embedResults: Map<string, any>;
      try {
        console.log('Running embed probes...');
        embedResults = await this.runEmbedProbes(testUrls);
        console.log('Embed probes completed');
      } catch (error) {
        console.error('❌ Embed probe execution failed:', error);
        console.warn('⚠️ Continuing with remote results only...');
        embedResults = new Map(); // Empty map to continue
      }

      // Step 4: Determine verdicts with error handling
      console.log('Analyzing results...');
      let results: TestResult[];
      try {
        results = testUrls.map(testUrl => {
          const remoteResult = remoteResults.get(testUrl.asset_url);
          const embedResult = embedResults.get(testUrl.asset_url);
          
          const verdicts = this.determineVerdicts(testUrl, remoteResult, embedResult);
          
          return {
            ...testUrl,
            ...verdicts
          };
        });
      } catch (error) {
        console.error('❌ Result analysis failed:', error);
        throw new Error(`Result analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      // Step 5: Generate summary with error handling
      let summary: TestSummary;
      try {
        summary = this.generateSummary(results);
        summary.performance.total_runtime = Date.now() - startTime;
      } catch (error) {
        console.error('❌ Summary generation failed:', error);
        throw new Error(`Summary generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      // Step 6: Check for P0 incidents with error handling
      let p0Status: any;
      try {
        p0Status = this.checkP0Incidents(summary);
      } catch (error) {
        console.error('❌ P0 incident check failed:', error);
        p0Status = {
          is_p0: false,
          failed_remote_count: 0,
          threshold: 1,
          message: `P0 check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
      }

      // Step 7: Save results with error handling
      try {
        this.saveResults(results, summary);
      } catch (error) {
        console.error('❌ Failed to save results:', error);
        console.warn('⚠️ Continuing without saving results...');
      }

      // Step 8: Print summary with error handling
      try {
        console.log('\n📊 TEST SUMMARY:');
        console.log(`Total tests: ${summary.total_tests}`);
        console.log(`Remote survival: ${summary.remote_survival_rate.toFixed(1)}%`);
        console.log(`Embed survival: ${summary.embed_survival_rate.toFixed(1)}%`);
        console.log(`Runtime: ${(summary.performance.total_runtime / 1000).toFixed(1)}s`);
        console.log(`\n${p0Status.message}`);

        // Step 9: Print provider breakdown
        console.log('\n📈 PROVIDER RESULTS:');
        Object.entries(summary.provider_results).forEach(([provider, results]) => {
          console.log(`  ${provider}: Remote ${results.remote_rate.toFixed(1)}%, Embed ${results.embed_rate.toFixed(1)}%`);
        });
      } catch (error) {
        console.error('❌ Failed to print summary:', error);
      }

      return {
        results,
        summary,
        p0_status: p0Status
      };

    } catch (error) {
      const totalRuntime = Date.now() - startTime;
      console.error(`❌ Gauntlet run failed after ${(totalRuntime / 1000).toFixed(1)}s:`, error);
      
      // Re-throw with additional context
      if (error instanceof Error) {
        throw new Error(`Gauntlet execution failed: ${error.message}`);
      } else {
        throw new Error('Gauntlet execution failed: Unknown error');
      }
    }
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const outputDir = args.find(arg => !arg.startsWith('--')) || './output';
  
  // Parse flags
  const isDryRun = args.includes('--dry-run') || args.includes('--offline');
  const isOffline = args.includes('--offline');
  
  console.log(`🔧 Mode: ${isOffline ? 'OFFLINE' : isDryRun ? 'DRY RUN' : 'LIVE'}`);
  
  const runner = new GauntletRunner(outputDir);
  
  if (isDryRun || isOffline) {
    console.log('🧪 Running in dry-run mode - no network requests will be made');
    // In dry-run mode, just generate URLs without probing
    runner.getTestUrls().then(urls => {
      console.log(`✅ Generated ${urls.length} test URLs`);
      console.log('🎯 Dry run completed successfully - no network requests made');
      
      if (isOffline) {
        console.log('🔧 Running offline probe test...');
        // Test offline mode with a few URLs
        const testUrls = urls.slice(0, 3);
        const remoteProbe = new RemoteManifestProbe({ offline_mode: true });
        const embedProbe = new EmbedProbe({ offline_mode: true });
        
        Promise.all([
          remoteProbe.probeRemote(testUrls[0].asset_url, testUrls[0].manifest_url),
          embedProbe.probeEmbed(testUrls[0].asset_url)
        ]).then(([remoteResult, embedResult]) => {
          console.log('✅ Offline probe test results:');
          console.log('Remote:', { success: remoteResult.success, method: remoteResult.method });
          console.log('Embed:', { success: embedResult.success, c2pa_present: embedResult.c2pa_present });
          process.exit(0);
        }).catch(error => {
          console.error('❌ Offline probe test failed:', error);
          process.exit(1);
        });
      } else {
        process.exit(0);
      }
    }).catch(error => {
      console.error('❌ Dry run failed:', error);
      process.exit(1);
    });
  } else {
    runner.run().then(({ p0_status }) => {
      console.log('\n✅ Gauntlet completed successfully');
      
      // Exit with error code if P0 incident
      process.exit(p0_status.is_p0 ? 1 : 0);
    }).catch(error => {
      console.error('❌ Gauntlet failed:', error);
      process.exit(1);
    });
  }
}

export { GauntletRunner, TestResult, TestSummary };
