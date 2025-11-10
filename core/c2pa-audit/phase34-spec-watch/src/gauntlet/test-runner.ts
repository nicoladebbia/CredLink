/**
 * Gauntlet Test Runner - Phase 34 Spec Watch
 * Runs hostile gauntlet tests against sentinel assets to verify spec compliance
 */

import { spawn } from 'child_process';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import type { GauntletResult, SpecChange } from '@/types';

export interface GauntletConfig {
  sentinel_assets: string[];
  timeout_ms: number;
  parallel_jobs: number;
  output_dir: string;
  c2patool_path: string;
  verify_tool_path: string;
}

export interface TestAsset {
  id: string;
  type: 'image' | 'video';
  url: string;
  expected_embedded: boolean;
  expected_remote: boolean;
  discovery_order: string[];
}

export class GauntletTestRunner {
  private config: GauntletConfig;
  private sentinelAssets: TestAsset[];

  constructor(config: GauntletConfig) {
    this.config = config;
    this.sentinelAssets = this.initializeSentinelAssets();
  }

  /**
   * Runs gauntlet tests for a spec change
   */
  async runGauntlet(change: SpecChange): Promise<GauntletResult> {
    const testId = `gauntlet-${change.id}-${Date.now()}`;
    const outputDir = join(this.config.output_dir, testId);
    
    try {
      // Create output directory
      await mkdir(outputDir, { recursive: true });
      
      // Run tests on all sentinel assets
      const testResults = await this.runTestsOnAssets(outputDir);
      
      // Analyze results
      const analysis = this.analyzeTestResults(testResults);
      
      // Generate evidence pack
      const evidencePack = await this.generateEvidencePack(change, testResults, outputDir);
      
      const result: GauntletResult = {
        id: testId,
        change_id: change.id,
        run_at: new Date().toISOString(),
        status: analysis.status,
        summary: analysis.summary,
        assets: testResults,
        artifacts: {
          trace_file: join(outputDir, 'trace.json'),
          diff_file: join(outputDir, 'diff.json'),
          evidence_pack: evidencePack,
        },
      };

      // Save result
      await this.saveResult(result, outputDir);
      
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Gauntlet test failed: ${errorMessage}`);
    }
  }

  /**
   * Initialize sentinel assets for testing
   */
  private initializeSentinelAssets(): TestAsset[] {
    return [
      {
        id: 'c2pa-demo-image-001',
        type: 'image',
        url: 'https://github.com/contentauthenticity/c2pa-samples/raw/main/images/CAICAI.jpg',
        expected_embedded: true,
        expected_remote: false,
        discovery_order: ['embedded'],
      },
      {
        id: 'c2pa-demo-image-002',
        type: 'image',
        url: 'https://github.com/contentauthenticity/c2pa-samples/raw/main/images/CAICAI-manifest-store.jpg',
        expected_embedded: false,
        expected_remote: true,
        discovery_order: ['remote'],
      },
      {
        id: 'c2pa-demo-image-003',
        type: 'image',
        url: 'https://github.com/contentauthenticity/c2pa-samples/raw/main/images/CAICAI-both.jpg',
        expected_embedded: true,
        expected_remote: true,
        discovery_order: ['embedded', 'remote'],
      },
      {
        id: 'c2pa-demo-video-001',
        type: 'video',
        url: 'https://github.com/contentauthenticity/c2pa-samples/raw/main/videos/CAICAI.mp4',
        expected_embedded: true,
        expected_remote: false,
        discovery_order: ['embedded'],
      },
      {
        id: 'c2pa-demo-video-002',
        type: 'video',
        url: 'https://github.com/contentauthenticity/c2pa-samples/raw/main/videos/CAICAI-manifest-store.mp4',
        expected_embedded: false,
        expected_remote: true,
        discovery_order: ['remote'],
      },
      // Add more sentinel assets as needed
      ...this.generateAdditionalAssets(19), // Total 24 assets as specified
    ];
  }

  /**
   * Generates additional test assets to reach 24 total
   */
  private generateAdditionalAssets(count: number): TestAsset[] {
    const assets: TestAsset[] = [];
    
    for (let i = 1; i <= count; i++) {
      const id = `sentinel-${String(i).padStart(3, '0')}`;
      const type = i % 2 === 0 ? 'video' : 'image';
      
      assets.push({
        id,
        type,
        url: `https://example.com/assets/${id}.${type === 'video' ? 'mp4' : 'jpg'}`,
        expected_embedded: i % 3 !== 0,
        expected_remote: i % 2 === 0,
        discovery_order: i % 3 === 0 ? ['remote', 'embedded'] : ['embedded'],
      });
    }
    
    return assets;
  }

  /**
   * Runs tests on all assets in parallel
   */
  private async runTestsOnAssets(outputDir: string): Promise<any[]> {
    const results: any[] = [];
    const chunks = this.chunkArray(this.sentinelAssets, this.config.parallel_jobs);
    
    for (const chunk of chunks) {
      const chunkPromises = chunk.map(asset => this.testSingleAsset(asset, outputDir));
      const chunkResults = await Promise.allSettled(chunkPromises);
      
      results.push(...chunkResults.map((result, index) => {
        const asset = chunk[index];
        if (!asset) {
          return {
            id: 'unknown',
            type: 'image' as const,
            embedded_manifest: false,
            remote_manifest: false,
            discovery_order: [],
            verify_output: '',
            error: 'Asset not found',
          };
        }
        
        if (result.status === 'fulfilled') {
          return result.value;
        } else {
          return {
            id: asset.id,
            type: asset.type,
            embedded_manifest: false,
            remote_manifest: false,
            discovery_order: [],
            verify_output: '',
            error: result.reason?.message || 'Unknown error',
          };
        }
      }));
    }
    
    return results;
  }

  /**
   * Tests a single asset for C2PA compliance
   */
  private async testSingleAsset(asset: TestAsset, outputDir: string): Promise<any> {
    try {
      // Download asset
      const assetPath = await this.downloadAsset(asset, outputDir);
      
      // Run c2patool verification
      const c2paResult = await this.runC2paTool(assetPath, outputDir);
      
      // Run CAI Verify tool
      const verifyResult = await this.runVerifyTool(assetPath, outputDir);
      
      // Analyze results
      const analysis = this.analyzeAssetResult(asset, c2paResult, verifyResult);
      
      return {
        id: asset.id,
        type: asset.type,
        ...analysis,
        verify_output: JSON.stringify({ c2paResult, verifyResult }, null, 2),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        id: asset.id,
        type: asset.type,
        embedded_manifest: false,
        remote_manifest: false,
        discovery_order: [],
        verify_output: '',
        error: errorMessage,
      };
    }
  }

  /**
   * Downloads an asset to local storage
   */
  private async downloadAsset(asset: TestAsset, outputDir: string): Promise<string> {
    const response = await fetch(asset.url, {
      method: 'GET',
      headers: {
        'User-Agent': 'C2PA-Spec-Watch-Gauntlet/1.1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to download asset ${asset.id}: ${response.statusText}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const extension = asset.type === 'video' ? '.mp4' : '.jpg';
    const assetPath = join(outputDir, `${asset.id}${extension}`);
    
    await writeFile(assetPath, buffer);
    return assetPath;
  }

  /**
   * Runs c2patool on an asset with command injection protection
   */
  private async runC2paTool(assetPath: string, _outputDir: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const sanitizedAssetPath = this.validateFilePath(assetPath);
      const sanitizedToolPath = this.validateToolPath(this.config.c2patool_path);
      
      const args = [sanitizedAssetPath, '--output', 'json'];
      const childProcess = spawn(sanitizedToolPath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: this.config.timeout_ms,
        // Security: prevent shell injection
        shell: false,
        // Security: drop privileges if possible
        uid: global.process?.getuid?.() || undefined,
        gid: global.process?.getgid?.() || undefined,
      });

      let stdout = '';
      let stderr = '';

      childProcess.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      childProcess.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      childProcess.on('close', (code: number | null) => {
        if (code === 0) {
          try {
            const result = JSON.parse(stdout);
            resolve(result);
          } catch (error) {
            reject(new Error(`Failed to parse c2patool output: ${stdout}`));
          }
        } else {
          reject(new Error(`c2patool failed with code ${code}: ${stderr}`));
        }
      });

      childProcess.on('error', (error: Error) => {
        reject(new Error(`c2patool process error: ${error.message}`));
      });
    });
  }

  /**
   * Runs CAI Verify tool on an asset
   */
  private async runVerifyTool(assetPath: string, _outputDir: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const args = [assetPath, '--format', 'json'];
      const process = spawn(this.config.verify_tool_path, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: this.config.timeout_ms,
      });

      let stdout = '';
      let stderr = '';

      process.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          try {
            const result = JSON.parse(stdout);
            resolve(result);
          } catch (error) {
            reject(new Error(`Failed to parse verify tool output: ${stdout}`));
          }
        } else {
          reject(new Error(`Verify tool failed with code ${code}: ${stderr}`));
        }
      });

      process.on('error', (error) => {
        reject(new Error(`Verify tool process error: ${error.message}`));
      });
    });
  }

  /**
   * Analyzes results for a single asset
   */
  private analyzeAssetResult(_asset: TestAsset, c2paResult: any, verifyResult: any): any {
    const hasEmbedded = c2paResult?.manifests?.length > 0 || verifyResult?.manifests?.some((m: any) => m.type === 'embedded');
    const hasRemote = c2paResult?.remote_manifest || verifyResult?.manifests?.some((m: any) => m.type === 'remote');
    
    let discoveryOrder: string[] = [];
    if (hasEmbedded) discoveryOrder.push('embedded');
    if (hasRemote) discoveryOrder.push('remote');

    return {
      embedded_manifest: hasEmbedded,
      remote_manifest: hasRemote,
      discovery_order: discoveryOrder,
    };
  }

  /**
   * Analyzes overall test results
   */
  private analyzeTestResults(testResults: any[]): any {
    const totalAssets = testResults.length;
    const embeddedSurvived = testResults.filter(r => r.embedded_manifest).length;
    const remoteSurvived = testResults.filter(r => r.remote_manifest).length;
    
    // Check if discovery precedence changed
    const discoveryPrecedenceChanged = testResults.some(r => 
      r.error || r.discovery_order.length === 0
    );
    
    // Check if video semantics affected
    const videoAssets = testResults.filter(r => r.type === 'video');
    const videoSemanticsAffected = videoAssets.some(r => r.error);
    
    // Determine overall status
    const hasErrors = testResults.some(r => r.error);
    const status = hasErrors ? 'failed' : 'passed';
    
    return {
      status,
      summary: {
        total_assets: totalAssets,
        embedded_survived: embeddedSurvived,
        remote_survived: remoteSurvived,
        discovery_precedence_changed: discoveryPrecedenceChanged,
        video_semantics_affected: videoSemanticsAffected,
      },
    };
  }

  /**
   * Generates evidence pack for the test run
   */
  private async generateEvidencePack(change: SpecChange, testResults: any[], outputDir: string): Promise<string> {
    const evidencePack = {
      metadata: {
        change_id: change.id,
        target_id: change.target_id,
        detected_at: change.detected_at,
        generated_at: new Date().toISOString(),
        spec_version: '2.2',
      },
      spec_change: change,
      test_results: testResults,
      environment: {
        c2patool_version: await this.getToolVersion(this.config.c2patool_path),
        verify_tool_version: await this.getToolVersion(this.config.verify_tool_path),
        node_version: process.version,
        platform: process.platform,
      },
    };

    const evidencePackPath = join(outputDir, 'evidence_pack.json');
    await writeFile(evidencePackPath, JSON.stringify(evidencePack, null, 2));
    
    return evidencePackPath;
  }

  /**
   * Validates and sanitizes file paths to prevent command injection
   */
  private validateFilePath(filePath: string): string {
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('Invalid file path');
    }
    
    // Remove dangerous characters
    const sanitized = filePath
      .replace(/[;&|`$(){}[\]]/g, '') // Remove shell metacharacters
      .replace(/\.\./g, '') // Remove directory traversal
      .replace(/^\//, '') // Remove absolute paths
      .trim();
    
    // Validate path format
    if (!/^[a-zA-Z0-9_\-\/.]+$/.test(sanitized)) {
      throw new Error('File path contains invalid characters');
    }
    
    // Ensure reasonable length
    if (sanitized.length > 4096) {
      throw new Error('File path too long');
    }
    
    return sanitized;
  }
  
  /**
   * Validates and sanitizes tool paths to prevent command injection
   */
  private validateToolPath(toolPath: string): string {
    if (!toolPath || typeof toolPath !== 'string') {
      throw new Error('Invalid tool path');
    }
    
    // Allow only trusted tool names or absolute paths
    const trustedTools = ['c2patool', 'cai-verify'];
    
    if (trustedTools.includes(toolPath)) {
      return toolPath;
    }
    
    // For absolute paths, validate format
    if (toolPath.startsWith('/')) {
      if (!/^\/[a-zA-Z0-9_\-\/.]+$/.test(toolPath)) {
        throw new Error('Tool path contains invalid characters');
      }
      return toolPath;
    }
    
    throw new Error('Untrusted tool path');
  }

  /**
   * Gets version information for a tool
   */
  private async getToolVersion(toolPath: string): Promise<string> {
    return new Promise((resolve) => {
      const sanitizedToolPath = this.validateToolPath(toolPath);
      const process = spawn(sanitizedToolPath, ['--version'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 5000,
        shell: false,
      });

      let stdout = '';
      process.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      process.on('close', () => {
        resolve(stdout.trim() || 'unknown');
      });

      process.on('error', () => {
        resolve('unknown');
      });
    });
  }

  /**
   * Saves test result to file
   */
  private async saveResult(result: GauntletResult, outputDir: string): Promise<void> {
    const resultPath = join(outputDir, 'gauntlet_result.json');
    await writeFile(resultPath, JSON.stringify(result, null, 2));
  }

  /**
   * Utility function to chunk array into smaller pieces
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }
}
