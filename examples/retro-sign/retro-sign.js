/**
 * Example: Retro-sign folder with RFC-3161 timestamps
 * 
 * This example demonstrates how to sign all C2PA-compatible assets
 * in a folder with cryptographic timestamps and provenance.
 */

import { Client, ConflictError } from '@c2concierge/sdk';
import { readFile, writeFile, stat, readdir } from 'fs/promises';
import { join, extname, relative } from 'path';
import { createHash } from 'crypto';

// Initialize client
const client = new Client({
  apiKey: process.env.C2_API_KEY,
  retries: {
    maxAttempts: 3,
    baseMs: 1000,
    maxMs: 10000,
    jitter: true,
  },
});

/**
 * Validate folder path to prevent path traversal
 */
async function validateFolderPath(folderPath: string): Promise<void> {
  try {
    // Resolve to absolute path
    const absolutePath = join(process.cwd(), folderPath);
    
    // Check if path exists and is a directory
    const stats = await stat(absolutePath);
    if (!stats.isDirectory()) {
      throw new Error(`Path ${folderPath} is not a directory`);
    }
    
    // Check for path traversal attempts
    const relativePath = relative(process.cwd(), absolutePath);
    if (relativePath.startsWith('..') || relativePath.includes('..')) {
      throw new Error('Path traversal detected - folder must be within current directory');
    }
    
  } catch (error) {
    throw new Error(`Invalid folder path: ${error.message}`);
  }
}

/**
 * Sign a folder with C2PA provenance and optional RFC-3161 timestamps
 */
async function signFolder(
  folderPath: string,
  options: {
    profileId: string;
    tsa?: boolean;
    recursive?: boolean;
    filePatterns?: string[];
    idempotencyKey?: string;
    dryRun?: boolean;
  }
): Promise<{
  jobId: string;
  statusUrl: string;
  estimatedDuration: number;
  filesFound: number;
  filesToSign: string[];
}> {
  const {
    profileId,
    tsa = false,
    recursive = true,
    filePatterns = ['*.jpg', '*.jpeg', '*.png', '*.gif', '*.webp', '*.mp4', '*.mov', '*.avi', '*.pdf'],
    idempotencyKey,
    dryRun = false,
  } = options;

  console.log(`🔐 Preparing to sign folder: ${folderPath}`);
  console.log(`   Profile: ${profileId}`);
  console.log(`   RFC-3161 TSA: ${tsa ? 'enabled' : 'disabled'}`);
  console.log(`   Recursive: ${recursive}`);
  console.log(`   File patterns: ${filePatterns.join(', ')}`);

  // Validate folder path to prevent path traversal
  await validateFolderPath(folderPath);

  try {
    // Discover files to sign
    const filesToSign = await discoverFiles(folderPath, {
      patterns: filePatterns,
      recursive,
    });

    console.log(`   Found ${filesToSign.length} files to sign:`);
    filesToSign.forEach(file => console.log(`     - ${file}`));

    if (filesToSign.length === 0) {
      console.log(`⚠️  No files found to sign in ${folderPath}`);
      throw new Error('No files found to sign');
    }

    if (dryRun) {
      console.log(`🔍 Dry run mode - not actually signing files`);
      return {
        jobId: 'dry-run-job-id',
        statusUrl: 'https://dry-run.example.com/status',
        estimatedDuration: 0,
        filesFound: filesToSign.length,
        filesToSign,
      };
    }

    // Start signing job
    console.log(`\n🚀 Starting signing job...`);
    const response = await client.signFolder(folderPath, {
      profileId,
      tsa,
      recursive,
      filePatterns,
      idempotencyKey,
    });

    console.log(`✅ Signing job started successfully!`);
    console.log(`   Job ID: ${response.data.job_id}`);
    console.log(`   Status URL: ${response.data.status_url}`);
    console.log(`   Estimated duration: ${response.data.estimated_duration}s`);
    console.log(`   Files found: ${response.data.files_found}`);

    return {
      jobId: response.data.job_id,
      statusUrl: response.data.status_url,
      estimatedDuration: response.data.estimated_duration,
      filesFound: response.data.files_found,
      filesToSign,
    };

  } catch (error) {
    if (error instanceof ConflictError) {
      console.error(`\n⚠️  Conflict: ${error.message}`);
      console.error(`   Idempotency key: ${error.idempotencyKey}`);
      console.error(`   Hint: ${error.hint}`);
      console.error(`   Next steps: ${error.getNextSteps().join(', ')}`);
    } else {
      console.error(`\n❌ Failed to start signing job: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Monitor signing job progress
 */
async function monitorJob(
  jobId: string,
  options: {
    pollInterval?: number;
    timeout?: number;
    verbose?: boolean;
  } = {}
): Promise<{
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: any;
  error?: any;
  duration: number;
}> {
  const {
    pollInterval = 5000,
    timeout = 600000, // 10 minutes
    verbose = false,
  } = options;

  console.log(`\n⏳ Monitoring signing job: ${jobId}`);
  console.log(`   Poll interval: ${pollInterval}ms`);
  console.log(`   Timeout: ${timeout / 1000}s`);

  const startTime = Date.now();
  let lastStatus: string = '';

  while (Date.now() - startTime < timeout) {
    try {
      const jobStatus = await client.getJobStatus(jobId);
      
      if (jobStatus.status !== lastStatus) {
        console.log(`   Status: ${jobStatus.status}`);
        if (jobStatus.progress !== undefined) {
          console.log(`   Progress: ${jobStatus.progress}%`);
        }
        lastStatus = jobStatus.status;
      }

      if (verbose && jobStatus.status === 'running') {
        console.log(`   Updated: ${new Date(jobStatus.updated_at).toLocaleTimeString()}`);
      }

      if (jobStatus.status === 'completed') {
        const duration = Date.now() - startTime;
        console.log(`\n🎉 Job completed successfully!`);
        console.log(`   Duration: ${(duration / 1000).toFixed(1)}s`);
        console.log(`   Result: ${JSON.stringify(jobStatus.result, null, 2)}`);
        
        return {
          status: jobStatus.status,
          result: jobStatus.result,
          duration,
        };
      }

      if (jobStatus.status === 'failed') {
        const duration = Date.now() - startTime;
        console.log(`\n❌ Job failed!`);
        console.log(`   Duration: ${(duration / 1000).toFixed(1)}s`);
        console.log(`   Error: ${jobStatus.error?.message || 'Unknown error'}`);
        
        return {
          status: jobStatus.status,
          error: jobStatus.error,
          duration,
        };
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollInterval));

    } catch (error) {
      console.error(`   Error checking job status: ${error.message}`);
      // Continue polling despite errors
    }
  }

  throw new Error(`Job monitoring timed out after ${timeout / 1000}s`);
}

/**
 * Discover files in folder matching patterns
 */
async function discoverFiles(
  folderPath: string,
  options: {
    patterns: string[];
    recursive: boolean;
  }
): Promise<string[]> {
  const { patterns, recursive } = options;
  const files: string[] = [];

  async function scanDirectory(dirPath: string): Promise<void> {
    try {
      const entries = await readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = join(dirPath, entry.name);
        
        if (entry.isFile()) {
          // Check if file matches any pattern
          const ext = extname(entry.name).toLowerCase();
          const matchesPattern = patterns.some(pattern => {
            if (pattern.startsWith('*.')) {
              return ext === pattern.substring(1);
            }
            // Simple glob matching - in production, use a proper glob library
            const regex = new RegExp(pattern.replace(/\*/g, '.*').replace(/\?/g, '.'));
            return regex.test(entry.name);
          });

          if (matchesPattern) {
            files.push(fullPath);
          }
        } else if (entry.isDirectory() && recursive) {
          await scanDirectory(fullPath);
        }
      }
    } catch (error) {
      console.warn(`   Warning: Could not scan directory ${dirPath}: ${error.message}`);
    }
  }

  await scanDirectory(folderPath);
  return files;
}

/**
 * Generate signing report
 */
async function generateSigningReport(
  folderPath: string,
  jobResult: {
    status: 'pending' | 'running' | 'completed' | 'failed';
    result?: any;
    error?: any;
    duration: number;
  },
  outputPath: string
): Promise<void> {
  console.log(`\n📊 Generating signing report: ${outputPath}`);

  try {
    const report = {
      folderPath,
      timestamp: new Date().toISOString(),
      jobStatus: jobResult.status,
      duration: jobResult.duration,
      result: jobResult.result,
      error: jobResult.error,
    };

    await writeFile(outputPath, JSON.stringify(report, null, 2));
    console.log(`✅ Report generated: ${outputPath}`);

  } catch (error) {
    console.error(`❌ Failed to generate report: ${error.message}`);
    throw error;
  }
}

/**
 * Demonstrate different signing scenarios
 */
async function demonstrateSigning(): Promise<void> {
  console.log(`🎯 Demonstrating folder signing scenarios...\n`);

  // Scenario 1: Basic signing without TSA
  console.log(`1️⃣  Basic Folder Signing:`);
  console.log(`   (In practice, would sign actual folder)`);
  console.log(`   Sample command: sign-folder ./public/images --profile newsroom-default`);

  // Scenario 2: Signing with RFC-3161 timestamps
  console.log(`\n2️⃣  Signing with RFC-3161 Timestamps:`);
  console.log(`   (In practice, would sign with TSA)`);
  console.log(`   Sample command: sign-folder ./public/images --profile newsroom-default --tsa`);

  // Scenario 3: Idempotent signing for CI/CD
  console.log(`\n3️⃣  Idempotent Signing for CI/CD:`);
  console.log(`   (In practice, would use fixed idempotency key)`);
  console.log(`   Sample command: sign-folder ./public/images --profile newsroom-default --idempotency-key build-123`);

  // Scenario 4: Custom file patterns
  console.log(`\n4️⃣  Custom File Patterns:`);
  console.log(`   (In practice, would specify custom patterns)`);
  console.log(`   Sample command: sign-folder ./assets --profile photo --patterns "*.jpg,*.png"`);
}

// ============================================================================
// Command Line Interface
// ============================================================================

if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`
Usage: node retro-sign.js <command> [options]

Commands:
  folder <path> <profile-id>
    Sign folder with specified profile
  
  monitor <job-id>
    Monitor signing job progress
  
  demo
    Demonstrate signing scenarios

Options:
  --tsa                   Enable RFC-3161 timestamps
  --no-recursive          Don't process subdirectories
  --patterns <patterns>   File patterns (comma-separated, default: *.jpg,*.png,*.mp4,*.pdf)
  --idempotency-key <key> Use specific idempotency key
  --dry-run               Show what would be signed without actually signing
  --poll-interval <ms>    Job monitoring poll interval (default: 5000)
  --timeout <ms>          Job monitoring timeout (default: 600000)
  --verbose               Show detailed monitoring output
  --report <file>         Generate signing report

Examples:
  node retro-sign.js folder ./public/images newsroom-default --tsa
  node retro-sign.js folder ./assets photo --patterns "*.jpg,*.png" --dry-run
  node retro-sign.js monitor job-abc123 --verbose --report report.json
  node retro-sign.js demo

Environment Variables:
  C2_API_KEY              Your C2 Concierge API key (required)
`);
    process.exit(1);
  }

  if (!process.env.C2_API_KEY) {
    console.error('❌ C2_API_KEY environment variable is required');
    process.exit(1);
  }

  const command = args[0];

  switch (command) {
    case 'folder': {
      if (args.length < 3) {
        console.error('❌ Folder command requires: <path> <profile-id>');
        process.exit(1);
      }
      
      const [, folderPath, profileId] = args;
      const tsa = args.includes('--tsa');
      const noRecursive = args.includes('--no-recursive');
      const patternsArg = args.find(arg => arg.startsWith('--patterns='))?.split('=')[1];
      const idempotencyKey = args.find(arg => arg.startsWith('--idempotency-key='))?.split('=')[1];
      const dryRun = args.includes('--dry-run');
      const reportFile = args.find(arg => arg.startsWith('--report='))?.split('=')[1];

      const patterns = patternsArg ? patternsArg.split(',').map(p => p.trim()) : undefined;

      signFolder(folderPath, {
        profileId,
        tsa,
        recursive: !noRecursive,
        filePatterns: patterns,
        idempotencyKey,
        dryRun,
      }).then(async (job) => {
        if (!dryRun) {
          // Monitor the job
          const pollInterval = parseInt(args.find(arg => arg.startsWith('--poll-interval='))?.split('=')[1] || '5000');
          const timeout = parseInt(args.find(arg => arg.startsWith('--timeout='))?.split('=')[1] || '600000');
          const verbose = args.includes('--verbose');

          const result = await monitorJob(job.jobId, {
            pollInterval,
            timeout,
            verbose,
          });

          if (reportFile) {
            await generateSigningReport(folderPath, result, reportFile);
          }

          if (result.status === 'failed') {
            process.exit(1);
          }
        }
      }).catch(error => {
        console.error('Folder signing failed:', error.message);
        process.exit(1);
      });
      break;
    }

    case 'monitor': {
      if (args.length < 2) {
        console.error('❌ Monitor command requires: <job-id>');
        process.exit(1);
      }
      
      const [, jobId] = args;
      const pollInterval = parseInt(args.find(arg => arg.startsWith('--poll-interval='))?.split('=')[1] || '5000');
      const timeout = parseInt(args.find(arg => arg.startsWith('--timeout='))?.split('=')[1] || '600000');
      const verbose = args.includes('--verbose');
      const reportFile = args.find(arg => arg.startsWith('--report='))?.split('=')[1];

      monitorJob(jobId, {
        pollInterval,
        timeout,
        verbose,
      }).then(async (result) => {
        if (reportFile) {
          await generateSigningReport('monitored-job', result, reportFile);
        }

        if (result.status === 'failed') {
          process.exit(1);
        }
      }).catch(error => {
        console.error('Job monitoring failed:', error.message);
        process.exit(1);
      });
      break;
    }

    case 'demo': {
      demonstrateSigning().catch(error => {
        console.error('Demo failed:', error.message);
        process.exit(1);
      });
      break;
    }

    default:
      console.error(`❌ Unknown command: ${command}`);
      process.exit(1);
  }
}

export { signFolder, monitorJob, discoverFiles, generateSigningReport, demonstrateSigning };
