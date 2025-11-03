#!/usr/bin/env node

/**
 * C2 Concierge Acceptance Test Runner
 * Runs acceptance tests for all CMS connectors
 */

const { program } = require('commander');
const DrupalAcceptanceTests = require('./drupal.test');
const WebflowAcceptanceTests = require('./webflow.test');
const fs = require('fs');
const path = require('path');

class AcceptanceTestRunner {
  constructor(config = {}) {
    this.config = {
      parallel: config.parallel || false,
      headless: config.headless !== false,
      timeout: config.timeout || 60000,
      outputDir: config.outputDir || './test-results',
      platforms: config.platforms || ['drupal', 'webflow'],
      ...config
    };

    this.results = [];
    this.startTime = Date.now();
  }

  /**
   * Run all acceptance tests
   */
  async runAllTests() {
    console.log('🚀 Starting C2 Concierge Acceptance Test Suite');
    console.log(`Platforms: ${this.config.platforms.join(', ')}`);
    console.log(`Parallel execution: ${this.config.parallel}`);
    console.log(`Headless mode: ${this.config.headless}`);
    console.log('='.repeat(50));

    // Ensure output directory exists
    this.ensureOutputDirectory();

    // Run tests for each platform
    if (this.config.parallel) {
      await this.runTestsParallel();
    } else {
      await this.runTestsSequential();
    }

    // Generate combined report
    this.generateCombinedReport();
    
    // Print summary
    this.printSummary();

    return this.results;
  }

  /**
   * Run tests sequentially
   */
  async runTestsSequential() {
    for (const platform of this.config.platforms) {
      console.log(`\n🧪 Running ${platform} tests...`);
      
      try {
        const platformResults = await this.runPlatformTests(platform);
        this.results.push({
          platform,
          status: 'completed',
          results: platformResults
        });
        
        console.log(`✅ ${platform} tests completed`);
        
      } catch (error) {
        console.error(`❌ ${platform} tests failed:`, error.message);
        this.results.push({
          platform,
          status: 'failed',
          error: error.message
        });
      }
    }
  }

  /**
   * Run tests in parallel
   */
  async runTestsParallel() {
    const testPromises = this.config.platforms.map(async platform => {
      console.log(`🧪 Starting ${platform} tests...`);
      
      try {
        const platformResults = await this.runPlatformTests(platform);
        console.log(`✅ ${platform} tests completed`);
        
        return {
          platform,
          status: 'completed',
          results: platformResults
        };
        
      } catch (error) {
        console.error(`❌ ${platform} tests failed:`, error.message);
        
        return {
          platform,
          status: 'failed',
          error: error.message
        };
      }
    });

    const parallelResults = await Promise.allSettled(testPromises);
    
    parallelResults.forEach(result => {
      if (result.status === 'fulfilled') {
        this.results.push(result.value);
      } else {
        console.error('Parallel test execution error:', result.reason);
      }
    });
  }

  /**
   * Run tests for a specific platform
   */
  async runPlatformTests(platform) {
    let testSuite;
    
    switch (platform) {
      case 'drupal':
        testSuite = new DrupalAcceptanceTests({
          headless: this.config.headless,
          timeout: this.config.timeout
        });
        break;
        
      case 'webflow':
        testSuite = new WebflowAcceptanceTests({
          headless: this.config.headless,
          timeout: this.config.timeout
        });
        break;
        
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }

    return await testSuite.runAllTests();
  }

  /**
   * Ensure output directory exists
   */
  ensureOutputDirectory() {
    if (!fs.existsSync(this.config.outputDir)) {
      fs.mkdirSync(this.config.outputDir, { recursive: true });
    }
  }

  /**
   * Generate combined report
   */
  generateCombinedReport() {
    const totalDuration = Date.now() - this.startTime;
    
    // Calculate overall statistics
    let totalTests = 0;
    let totalPassed = 0;
    let totalFailed = 0;
    
    this.results.forEach(platformResult => {
      if (platformResult.status === 'completed' && platformResult.results) {
        platformResult.results.forEach(testResult => {
          totalTests++;
          if (testResult.status === 'passed') {
            totalPassed++;
          } else {
            totalFailed++;
          }
        });
      }
    });
    
    const overallSuccessRate = totalTests > 0 ? (totalPassed / totalTests) * 100 : 0;
    
    // Generate combined report data
    const combinedReport = {
      timestamp: new Date().toISOString(),
      duration: totalDuration,
      summary: {
        platforms: this.config.platforms.length,
        totalTests,
        totalPassed,
        totalFailed,
        overallSuccessRate
      },
      platforms: this.results.map(platformResult => ({
        name: platformResult.platform,
        status: platformResult.status,
        testCount: platformResult.results ? platformResult.results.length : 0,
        passedCount: platformResult.results ? 
          platformResult.results.filter(r => r.status === 'passed').length : 0,
        failedCount: platformResult.results ? 
          platformResult.results.filter(r => r.status === 'failed').length : 0,
        error: platformResult.error || null
      })),
      detailedResults: this.results
    };
    
    // Save combined report
    const reportPath = path.join(this.config.outputDir, 'combined-acceptance.json');
    fs.writeFileSync(reportPath, JSON.stringify(combinedReport, null, 2));
    
    // Generate HTML report
    this.generateHtmlReport(combinedReport);
    
    return combinedReport;
  }

  /**
   * Generate HTML report
   */
  generateHtmlReport(reportData) {
    const htmlTemplate = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>C2 Concierge Acceptance Test Report</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background: #f8fafc;
            color: #334155;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        .header {
            background: white;
            padding: 24px;
            border-radius: 12px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            margin-bottom: 24px;
        }
        .header h1 {
            margin: 0 0 8px 0;
            color: #1e293b;
        }
        .header p {
            margin: 0;
            color: #64748b;
        }
        .summary {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 16px;
            margin-bottom: 24px;
        }
        .summary-card {
            background: white;
            padding: 20px;
            border-radius: 12px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            text-align: center;
        }
        .summary-card h3 {
            margin: 0 0 8px 0;
            font-size: 32px;
            font-weight: 600;
        }
        .summary-card p {
            margin: 0;
            color: #64748b;
            font-size: 14px;
        }
        .success { color: #16a34a; }
        .failure { color: #dc2626; }
        .platforms {
            background: white;
            padding: 24px;
            border-radius: 12px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .platforms h2 {
            margin: 0 0 20px 0;
            color: #1e293b;
        }
        .platform {
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 16px;
        }
        .platform:last-child {
            margin-bottom: 0;
        }
        .platform-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
        }
        .platform-name {
            font-weight: 600;
            font-size: 18px;
        }
        .platform-status {
            padding: 4px 12px;
            border-radius: 9999px;
            font-size: 12px;
            font-weight: 500;
        }
        .status-completed {
            background: #dcfce7;
            color: #16a34a;
        }
        .status-failed {
            background: #fee2e2;
            color: #dc2626;
        }
        .platform-stats {
            display: flex;
            gap: 20px;
            font-size: 14px;
            color: #64748b;
        }
        .error {
            margin-top: 12px;
            padding: 12px;
            background: #fee2e2;
            border-radius: 6px;
            color: #dc2626;
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔐 C2 Concierge Acceptance Test Report</h1>
            <p>Generated on ${new Date(reportData.timestamp).toLocaleString()}</p>
        </div>
        
        <div class="summary">
            <div class="summary-card">
                <h3 class="success">${reportData.summary.totalPassed}</h3>
                <p>Tests Passed</p>
            </div>
            <div class="summary-card">
                <h3 class="failure">${reportData.summary.totalFailed}</h3>
                <p>Tests Failed</p>
            </div>
            <div class="summary-card">
                <h3>${reportData.summary.totalTests}</h3>
                <p>Total Tests</p>
            </div>
            <div class="summary-card">
                <h3>${reportData.summary.overallSuccessRate.toFixed(1)}%</h3>
                <p>Success Rate</p>
            </div>
        </div>
        
        <div class="platforms">
            <h2>Platform Results</h2>
            ${reportData.platforms.map(platform => `
                <div class="platform">
                    <div class="platform-header">
                        <div class="platform-name">${platform.name.charAt(0).toUpperCase() + platform.name.slice(1)}</div>
                        <div class="platform-status status-${platform.status}">${platform.status}</div>
                    </div>
                    <div class="platform-stats">
                        <span>✅ ${platform.passedCount} passed</span>
                        <span>❌ ${platform.failedCount} failed</span>
                        <span>📊 ${platform.testCount} total</span>
                    </div>
                    ${platform.error ? `<div class="error">Error: ${platform.error}</div>` : ''}
                </div>
            `).join('')}
        </div>
    </div>
</body>
</html>
    `;
    
    const htmlPath = path.join(this.config.outputDir, 'acceptance-report.html');
    fs.writeFileSync(htmlPath, htmlTemplate);
  }

  /**
   * Print summary to console
   */
  printSummary() {
    console.log('\n' + '='.repeat(50));
    console.log('📊 FINAL TEST SUMMARY');
    console.log('='.repeat(50));
    
    let totalTests = 0;
    let totalPassed = 0;
    let totalFailed = 0;
    
    this.results.forEach(platformResult => {
      console.log(`\n🔧 ${platformResult.platform.toUpperCase()}:`);
      
      if (platformResult.status === 'completed' && platformResult.results) {
        const platformPassed = platformResult.results.filter(r => r.status === 'passed').length;
        const platformFailed = platformResult.results.filter(r => r.status === 'failed').length;
        const platformTotal = platformResult.results.length;
        
        totalTests += platformTotal;
        totalPassed += platformPassed;
        totalFailed += platformFailed;
        
        console.log(`   ✅ ${platformPassed}/${platformTotal} tests passed`);
        console.log(`   ❌ ${platformFailed}/${platformTotal} tests failed`);
        console.log(`   📊 ${((platformPassed / platformTotal) * 100).toFixed(1)}% success rate`);
        
      } else {
        console.log(`   ❌ Platform failed: ${platformResult.error}`);
        totalFailed++;
      }
    });
    
    console.log('\n' + '='.repeat(50));
    console.log('🎯 OVERALL RESULTS:');
    console.log(`   Total Tests: ${totalTests}`);
    console.log(`   Passed: ${totalPassed}`);
    console.log(`   Failed: ${totalFailed}`);
    console.log(`   Success Rate: ${totalTests > 0 ? ((totalPassed / totalTests) * 100).toFixed(1) : 0}%`);
    console.log(`   Duration: ${Math.round((Date.now() - this.startTime) / 1000)}s`);
    console.log('='.repeat(50));
    
    if (totalFailed === 0) {
      console.log('\n🎉 ALL TESTS PASSED! 🎉');
    } else {
      console.log(`\n⚠️  ${totalFailed} tests failed. Check reports for details.`);
    }
    
    console.log(`\n📁 Reports saved to: ${this.config.outputDir}`);
  }
}

// CLI interface
if (require.main === module) {
  const { program } = require('commander');
  
  program
    .name('acceptance-runner')
    .description('C2 Concierge acceptance test runner')
    .version('1.0.0');
  
  program
    .option('-p, --platforms <platforms>', 'Platforms to test (comma-separated)', 'drupal,webflow')
    .option('--parallel', 'Run tests in parallel')
    .option('--no-headless', 'Run tests in headed mode')
    .option('-t, --timeout <ms>', 'Test timeout in milliseconds', '60000')
    .option('-o, --output <dir>', 'Output directory for reports', './test-results');
  
  program.parse();
  
  const options = program.opts();
  
  const runner = new AcceptanceTestRunner({
    platforms: options.platforms.split(',').map(p => p.trim()),
    parallel: options.parallel,
    headless: options.headless,
    timeout: parseInt(options.timeout),
    outputDir: options.output
  });
  
  runner.runAllTests()
    .then(() => {
      console.log('\n✅ Acceptance test suite completed');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Acceptance test suite failed:', error);
      process.exit(1);
    });
}

module.exports = AcceptanceTestRunner;
