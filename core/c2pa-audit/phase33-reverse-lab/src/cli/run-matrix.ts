#!/usr/bin/env node

/**
 * CLI Tool - Run Matrix Tests
 * Phase 33 Reverse Lab - Command Line Interface
 */

import { Command } from 'commander';
import { nanoid } from 'nanoid';
import { validateId, validateNumber, sanitizeCommaSeparatedList, SECURITY_CONFIG } from '../utils/security.js';

// Mock data for CLI when config files are missing
const PROVIDERS: Record<string, any> = {
  'cloudflare-images': { id: 'cloudflare-images', name: 'Cloudflare Images' },
  'fastly-io': { id: 'fastly-io', name: 'Fastly Image Optimizer' },
  'akamai-ivm': { id: 'akamai-ivm', name: 'Akamai Image and Video Manager' },
  'cloudinary': { id: 'cloudinary', name: 'Cloudinary' },
  'imgix': { id: 'imgix', name: 'Imgix' }
};

const TRANSFORMS: Record<string, any> = {
  'resize_1200': { id: 'resize_1200', name: 'Resize to 1200px' },
  'webp_q80': { id: 'webp_q80', name: 'WebP Quality 80' },
  'avif_q50': { id: 'avif_q50', name: 'AVIF Quality 50' },
  'crop_1x1': { id: 'crop_1x1', name: 'Crop 1:1' }
};

const getSentinelAssets = () => [
  { id: 'c2pa-demo-001', name: 'C2PA Demo Image 1' },
  { id: 'c2pa-demo-002', name: 'C2PA Demo Image 2' }
];

// Simple config loader for CLI
function loadConfig() {
  return {
    orchestrator: {
      port: 3000,
      host: 'localhost',
    },
    redis: {
      host: 'localhost',
      port: 6379,
      db: 0,
    },
    rateLimit: {
      global: 100,
      perProvider: 10,
    },
    scheduling: {
      weeklyJob: '0 2 * * 1',
      dailyCheck: '0 6 * * *',
    },
    timeouts: {
      job: 3600000,
      request: 30000,
      verification: 15000,
    },
  };
}

const program = new Command();

program
  .name('reverse-lab')
  .description('C2PA Reverse Lab CLI - Optimizer Behavior Fingerprinting')
  .version('1.1.0');

// Run matrix command
program
  .command('run-matrix')
  .description('Run a comprehensive test matrix against providers')
  .option('-p, --providers <providers>', 'Comma-separated list of provider IDs', 'cloudflare-images,fastly-io,akamai-ivm,cloudinary,imgix')
  .option('-t, --transforms <transforms>', 'Comma-separated list of transform IDs', 'resize_1200,webp_q80,avif_q50,crop_1x1')
  .option('-a, --assets <assets>', 'Comma-separated list of asset IDs (defaults to sentinel assets)')
  .option('-r, --runs <runs>', 'Number of runs per test case', '3')
  .option('--priority <priority>', 'Job priority', 'normal')
  .option('--timeout <timeout>', 'Job timeout in milliseconds', '3600000')
  .option('--cache-bust', 'Bypass caches during testing')
  .option('--wait', 'Wait for job completion and show results')
  .option('--format <format>', 'Output format', 'json')
  .action(async (options) => {
    try {
      // Default configuration
      const config = {
        orchestrator: {
          port: 3000,
          host: 'localhost',
        },
        redis: {
          host: 'localhost',
          port: 6379,
          db: 0,
        },
        rateLimit: {
          global: 100,
          perProvider: 10,
        },
        scheduling: {
          weeklyJob: '0 2 * * 1',
          dailyCheck: '0 6 * * *',
        },
        timeouts: {
          job: 3600000,
          request: 30000,
          verification: 15000,
        },
      };
      
      console.log('🚀 Starting Reverse Lab Matrix Run');
      console.log(`📊 Providers: ${options.providers}`);
      console.log(`🔄 Transforms: ${options.transforms}`);
      console.log(`🖼️  Assets: ${options.assets || 'sentinel'}`);
      console.log(`🔁 Runs: ${options.runs}`);
      console.log(`⚡ Priority: ${options.priority}`);
      
      // Validate providers
      const providerList = sanitizeCommaSeparatedList(options.providers, (p) => validateId(p, 'provider'));
      const invalidProviders = providerList.filter((p: string) => !PROVIDERS[p]);
      if (invalidProviders.length > 0) {
        console.error(`❌ Invalid providers: ${invalidProviders.join(', ')}`);
        process.exit(1);
      }
      
      // Validate transforms
      const transformList = sanitizeCommaSeparatedList(options.transforms, (t) => validateId(t, 'transform'));
      const invalidTransforms = transformList.filter((t: string) => !TRANSFORMS[t]);
      if (invalidTransforms.length > 0) {
        console.error(`❌ Invalid transforms: ${invalidTransforms.join(', ')}`);
        process.exit(1);
      }
      
      // Validate numeric inputs
      const runs = validateNumber(options.runs, 'runs', 1, SECURITY_CONFIG.MAX_RUNS);
      const timeout = validateNumber(options.timeout, 'timeout', 60000, SECURITY_CONFIG.MAX_TIMEOUT);
      
      // Prepare job specification
      const jobSpec = {
        id: nanoid(),
        providers: providerList,
        transforms: transformList,
        assets: options.assets ? sanitizeCommaSeparatedList(options.assets, (a) => validateId(a, 'asset')) : getSentinelAssets().map((a: any) => a.id),
        runs: runs,
        priority: options.priority,
        timeout: timeout,
        cacheBust: options.cacheBust || false,
        scheduledAt: new Date().toISOString(),
      };
      
      console.log(`🆔 Job ID: ${jobSpec.id}`);
      
      // Submit job to orchestrator
      const response = await fetch(`http://${config.orchestrator.host}:${config.orchestrator.port}/reverse-lab/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(jobSpec),
      });
      
      if (!response.ok) {
        const error = await response.json();
        console.error('❌ Failed to submit job:', error.error);
        process.exit(1);
      }
      
      const result = await response.json();
      console.log('✅ Job submitted successfully');
      console.log(`📈 Estimated test cases: ${result.data.estimatedCases}`);
      
      if (options.wait) {
        console.log('⏳ Waiting for job completion...');
        await waitForJobCompletion(jobSpec.id, config, options.format);
      } else {
        console.log(`🔗 Check results: http://${config.orchestrator.host}:${config.orchestrator.port}/reverse-lab/results/${jobSpec.id}`);
        console.log(`📊 View in API: http://${config.orchestrator.host}:${config.orchestrator.port}/api/v1/jobs/${jobSpec.id}`);
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('❌ Error running matrix:', errorMessage);
      process.exit(1);
    }
  });

// Profile provider command
program
  .command('profile-provider')
  .description('Generate a behavior profile for a specific provider')
  .option('-p, --provider <provider>', 'Provider ID to profile', 'cloudflare-images')
  .option('-t, --transforms <transforms>', 'Comma-separated list of transform IDs', 'resize_1200,webp_q80,avif_q50')
  .option('-a, --assets <assets>', 'Comma-separated list of asset IDs')
  .option('-r, --runs <runs>', 'Number of runs per test case', '3')
  .option('--output <output>', 'Output file path')
  .option('--format <format>', 'Output format', 'json')
  .action(async (options) => {
    try {
      const config = loadConfig();
      
      console.log(`🎯 Profiling provider: ${options.provider}`);
      console.log(`🔄 Transforms: ${options.transforms}`);
      console.log(`🔁 Runs: ${options.runs}`);
      
      // Submit profiling job
      const jobSpec = {
        id: nanoid(),
        providers: [validateId(options.provider, 'provider')],
        transforms: sanitizeCommaSeparatedList(options.transforms, (t) => validateId(t, 'transform')),
        assets: options.assets ? sanitizeCommaSeparatedList(options.assets, (a) => validateId(a, 'asset')) : [],
        runs: validateNumber(options.runs, 'runs', 1, SECURITY_CONFIG.MAX_RUNS),
        priority: 'high',
        timeout: 3600000, // 1 hour default
        cacheBust: false,
        scheduledAt: new Date().toISOString(),
      };
      
      const response = await fetch(`http://${config.orchestrator.host}:${config.orchestrator.port}/reverse-lab/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(jobSpec),
      });
      
      if (!response.ok) {
        const error = await response.json();
        console.error('❌ Failed to submit profiling job:', error.error);
        process.exit(1);
      }
      
      const result = await response.json();
      console.log('✅ Profiling job submitted');
      console.log(`🆔 Job ID: ${jobSpec.id}`);
      
      // Wait for completion and get results
      const profile = await waitForJobCompletion(jobSpec.id, config, 'json');
      
      if (options.output) {
        const fs = require('fs');
        fs.writeFileSync(options.output, JSON.stringify(profile, null, 2));
        console.log(`💾 Profile saved to: ${options.output}`);
      } else {
        console.log('\n📊 Provider Profile:');
        console.log(JSON.stringify(profile, null, 2));
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('❌ Error profiling provider:', errorMessage);
      process.exit(1);
    }
  });

// List providers command
program
  .command('list-providers')
  .description('List all available providers')
  .option('--format <format>', 'Output format', 'table')
  .action(async (options) => {
    try {
      const config = loadConfig();
      
      const response = await fetch(`http://${config.orchestrator.host}:${config.orchestrator.port}/api/v1/system/status`);
      
      if (!response.ok) {
        console.error('❌ Failed to get system status');
        process.exit(1);
      }
      
      const status = await response.json();
      
      if (options.format === 'json') {
        console.log(JSON.stringify(status.data.providers, null, 2));
      } else {
        console.log('📊 Available Providers:');
        console.log('┌─────────────────────┬─────────────────────────┬──────────────┬─────────────┐');
        console.log('│ ID                  │ Name                    │ Robots OK    │ Rate Limited│');
        console.log('├─────────────────────┼─────────────────────────┼──────────────┼─────────────┤');
        
        for (const provider of status.data.providers) {
          const robotsOk = provider.robotsCompliant ? '✅' : '❌';
          const rateLimited = provider.rateLimited ? '🔴' : '🟢';
          console.log(`│ ${provider.id.padEnd(19)} │ ${provider.name.padEnd(23)} │ ${robotsOk.padEnd(12)} │ ${rateLimited.padEnd(11)} │`);
        }
        
        console.log('└─────────────────────┴─────────────────────────┴──────────────┴─────────────┘');
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('❌ Error listing providers:', errorMessage);
      process.exit(1);
    }
  });

// Get profiles command
program
  .command('get-profiles')
  .description('Get provider behavior profiles')
  .option('-p, --provider <provider>', 'Filter by provider ID')
  .option('-l, --limit <limit>', 'Maximum number of profiles to return', '20')
  .option('--format <format>', 'Output format', 'table')
  .action(async (options) => {
    try {
      const config = loadConfig();
      
      const queryParams = new URLSearchParams({
        limit: options.limit,
      });
      
      if (options.provider) {
        queryParams.append('provider', options.provider);
      }
      
      const response = await fetch(`http://${config.orchestrator.host}:${config.orchestrator.port}/api/v1/profiles?${queryParams}`);
      
      if (!response.ok) {
        console.error('❌ Failed to get profiles');
        process.exit(1);
      }
      
      const result = await response.json();
      
      if (options.format === 'json') {
        console.log(JSON.stringify(result.data, null, 2));
      } else {
        console.log('📊 Provider Profiles:');
        console.log('┌─────────────────────┬──────────────┬─────────────┬─────────────┬─────────────┐');
        console.log('│ Provider            │ Version      │ Recommendation│ Confidence   │ Generated   │');
        console.log('├─────────────────────┼──────────────┼─────────────┼─────────────┼─────────────┤');
        
        for (const profile of result.data) {
          const provider = profile.provider.padEnd(19);
          const version = profile.versionHint.profileVersion.padEnd(12);
          const recommendation = profile.policy.recommendation.padEnd(11);
          const confidence = `${(profile.policy.confidence * 100).toFixed(1)}%`.padEnd(11);
          const generated = profile.metadata?.generatedAt 
            ? new Date(profile.metadata.generatedAt).toISOString().split('T')[0].padEnd(11)
            : 'Unknown'.padEnd(11);
          
          console.log(`│ ${provider} │ ${version} │ ${recommendation} │ ${confidence} │ ${generated} │`);
        }
        
        console.log('└─────────────────────┴──────────────┴─────────────┴─────────────┴─────────────┘');
        console.log(`\n📈 Total: ${result.pagination.total} profiles`);
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('❌ Error getting profiles:', errorMessage);
      process.exit(1);
    }
  });

// Get events command
program
  .command('get-events')
  .description('Get change events')
  .option('-p, --provider <provider>', 'Filter by provider ID')
  .option('-s, --severity <severity>', 'Filter by severity level')
  .option('-l, --limit <limit>', 'Maximum number of events to return', '20')
  .option('--format <format>', 'Output format', 'table')
  .action(async (options) => {
    try {
      const config = loadConfig();
      
      const queryParams = new URLSearchParams({
        limit: options.limit,
      });
      
      if (options.provider) {
        queryParams.append('provider', options.provider);
      }
      
      if (options.severity) {
        queryParams.append('severity', options.severity);
      }
      
      const response = await fetch(`http://${config.orchestrator.host}:${config.orchestrator.port}/api/v1/events?${queryParams}`);
      
      if (!response.ok) {
        console.error('❌ Failed to get events');
        process.exit(1);
      }
      
      const result = await response.json();
      
      if (options.format === 'json') {
        console.log(JSON.stringify(result.data, null, 2));
      } else {
        console.log('🔔 Change Events:');
        console.log('┌─────────────────────┬──────────────┬─────────────┬─────────────┬─────────────┐');
        console.log('│ Provider            │ Type         │ Severity     │ Date        │ Impact      │');
        console.log('├─────────────────────┼──────────────┼─────────────┼─────────────┼─────────────┤');
        
        for (const event of result.data) {
          const provider = event.providerId.padEnd(19);
          const type = event.changeType.padEnd(14);
          const severity = event.severity.padEnd(8);
          const date = event.detectedAt 
            ? new Date(event.detectedAt).toISOString().split('T')[0].padEnd(11)
            : 'Unknown'.padEnd(11);
          const impact = `${event.impact.affectedTenants} tenants`.padEnd(11);
          
          console.log(`│ ${provider} │ ${type} │ ${severity} │ ${date} │ ${impact} │`);
        }
        
        console.log('└─────────────────────┴──────────────┴─────────────┴─────────────┴─────────────┘');
        console.log(`\n📈 Total: ${result.pagination.total} events`);
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('❌ Error getting events:', errorMessage);
      process.exit(1);
    }
  });

// System status command
program
  .command('status')
  .description('Get system status and health')
  .option('--format <format>', 'Output format', 'table')
  .action(async (options) => {
    try {
      const config = loadConfig();
      
      const response = await fetch(`http://${config.orchestrator.host}:${config.orchestrator.port}/health`);
      
      if (!response.ok) {
        console.error('❌ Failed to get system status');
        process.exit(1);
      }
      
      const status = await response.json();
      
      if (options.format === 'json') {
        console.log(JSON.stringify(status.data, null, 2));
      } else {
        console.log('🏥 System Health:');
        console.log(`   Status: ${status.data.status}`);
        console.log(`   Uptime: ${Math.floor(status.data.uptime / 3600)}h ${Math.floor((status.data.uptime % 3600) / 60)}m`);
        console.log(`   Memory: ${Math.round(status.data.memory.heapUsed / 1024 / 1024)}MB / ${Math.round(status.data.memory.heapTotal / 1024 / 1024)}MB`);
        console.log(`   Redis: ${status.data.redis}`);
        console.log(`   Active Jobs: ${status.data.activeJobs}`);
        console.log(`   Queued Jobs: ${status.data.queuedJobs}`);
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('❌ Error getting status:', errorMessage);
      process.exit(1);
    }
  });

// Helper function to wait for job completion
async function waitForJobCompletion(jobId: string, config: any, format: string): Promise<any> {
  const maxWaitTime = 30 * 60 * 1000; // 30 minutes
  const checkInterval = 5000; // 5 seconds
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitTime) {
    const response = await fetch(`http://${config.orchestrator.host}:${config.orchestrator.port}/reverse-lab/results/${jobId}`);
    
    if (!response.ok) {
      throw new Error(`Failed to check job status: ${response.statusText}`);
    }
    
    const result = await response.json();
    
    if (result.data.status === 'completed') {
      console.log('✅ Job completed successfully!');
      console.log(`📊 Success rate: ${(result.data.summary.successRate * 100).toFixed(1)}%`);
      console.log(`⏱️  Duration: ${Math.round(result.data.summary.duration / 1000)}s`);
      
      if (format === 'json') {
        console.log('\n📄 Full Results:');
        console.log(JSON.stringify(result.data, null, 2));
      }
      
      return result.data;
    }
    
    if (result.data.status === 'failed') {
      console.error('❌ Job failed');
      process.exit(1);
    }
    
    // Show progress
    const progress = (result.data.completedCases / result.data.totalCases * 100).toFixed(1);
    process.stdout.write(`\r⏳ Progress: ${progress}% (${result.data.completedCases}/${result.data.totalCases})`);
    
    await new Promise(resolve => setTimeout(resolve, checkInterval));
  }
  
  throw new Error('Job completion timeout');
}

// Parse command line arguments
program.parse();
