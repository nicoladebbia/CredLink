/**
 * Phase 35 Leaderboard - Core Testing Engine
 * Executes vendor testing matrix with C2PA verification
 */

import { spawn } from 'child_process';
import { readFile, mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { createHash } from 'crypto';
import fetch from 'node-fetch';
import { 
  TestExecution, 
  ExecutionResult, 
  VerifyResult, 
  DiscoveryResult, 
  Artifact,
  Vendor,
  TestAsset,
  Transform
} from '@/types';
import { validateUrl, createSecureHash } from '@/utils/security';
import { SECURITY_CONFIG } from '@/utils/security';

export interface TestingEngineConfig {
  outputDir: string;
  c2patoolPath: string;
  verifyToolPath: string;
  timeoutMs: number;
  maxConcurrentTests: number;
  retryAttempts: number;
  retryDelayMs: number;
}

export class TestingEngine {
  private config: TestingEngineConfig;
  private activeTests = new Map<string, TestExecution>();
  private testQueue: TestExecution[] = [];
  private isRunning = false;

  constructor(config: TestingEngineConfig) {
    this.config = config;
  }

  /**
   * Execute full testing matrix for a vendor
   */
  async executeVendorTests(
    vendor: Vendor, 
    assets: TestAsset[], 
    configType: 'default' | 'best-practice' = 'default'
  ): Promise<TestExecution[]> {
    const executions: TestExecution[] = [];
    
    for (const asset of assets) {
      for (const transform of vendor.testing.transforms) {
        const execution = await this.executeSingleTest(vendor, asset, transform, configType);
        executions.push(execution);
      }
    }
    
    return executions;
  }

  /**
   * Execute single test case
   */
  async executeSingleTest(
    vendor: Vendor,
    asset: TestAsset,
    transform: Transform,
    configType: 'default' | 'best-practice' = 'default'
  ): Promise<TestExecution> {
    const executionId = this.generateExecutionId(vendor.id, asset.id, transform.id, configType);
    
    const execution: TestExecution = {
      id: executionId,
      vendorId: vendor.id,
      assetId: asset.id,
      transformId: transform.id,
      config: configType,
      timestamp: new Date(),
      duration: 0,
      result: {} as ExecutionResult,
      artifacts: []
    };

    this.activeTests.set(executionId, execution);
    
    try {
      const startTime = Date.now();
      
      // Step 1: Execute transformation
      const transformResult = await this.executeTransformation(vendor, asset, transform, configType);
      
      // Step 2: Verify C2PA Content Credentials
      const verifyResult = await this.verifyContentCredentials(transformResult.filePath);
      
      // Step 3: Test remote manifest discovery
      const discoveryResult = await this.testRemoteManifestDiscovery(transformResult.headers);
      
      // Step 4: Generate artifacts
      const artifacts = await this.generateArtifacts(execution, transformResult, verifyResult, discoveryResult);
      
      execution.result = {
        success: transformResult.success,
        statusCode: transformResult.statusCode,
        headers: transformResult.headers,
        contentType: transformResult.contentType,
        contentLength: transformResult.contentLength,
        contentHash: transformResult.contentHash,
        verifyResult,
        discoveryResult,
        errors: transformResult.errors
      };
      
      execution.duration = Date.now() - startTime;
      execution.artifacts = artifacts;
      
    } catch (error) {
      const errorStartTime = Date.now();
      execution.result = {
        success: false,
        statusCode: 0,
        headers: {},
        contentType: '',
        contentLength: 0,
        contentHash: '',
        verifyResult: this.createFailedVerifyResult(error),
        discoveryResult: this.createFailedDiscoveryResult(error),
        errors: [error instanceof Error ? error.message : String(error)]
      };
      execution.duration = Date.now() - errorStartTime;
    }
    
    this.activeTests.delete(executionId);
    return execution;
  }

  /**
   * Execute image transformation via vendor API
   */
  private async executeTransformation(
    vendor: Vendor,
    asset: TestAsset,
    transform: Transform,
    configType: 'default' | 'best-practice'
  ): Promise<{
    success: boolean;
    statusCode: number;
    headers: Record<string, string>;
    contentType: string;
    contentLength: number;
    contentHash: string;
    filePath: string;
    errors: string[];
  }> {
    const endpoint = vendor.testing.endpoints[0];
    if (!endpoint) {
      throw new Error(`No testing endpoint configured for vendor ${vendor.id}`);
    }
    
    const params = this.buildTransformParams(vendor, transform, configType);
    const url = this.buildTransformUrl(endpoint.baseUrl, asset.url, params);
    
    // Validate URL for security
    if (!validateUrl(url)) {
      throw new Error(`Invalid transform URL: ${url}`);
    }
    
    const outputFilename = this.generateOutputFilename(vendor.id, asset.id, transform.id, configType);
    const outputPath = join(this.config.outputDir, 'transformed', outputFilename);
    
    // Ensure output directory exists
    await mkdir(join(this.config.outputDir, 'transformed'), { recursive: true });
    
    try {
      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);
      
      const response = await fetch(url, {
        method: endpoint.method || 'GET',
        headers: {
          'User-Agent': 'C2PA-Leaderboard/1.1.0',
          'Accept': 'image/*',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'close',
          ...(endpoint.headers || {})
        },
        signal: controller.signal,
        // Set size limit to prevent excessive downloads
        // @ts-ignore - sizeLimit is not in standard RequestInit but supported by node-fetch
        sizeLimit: SECURITY_CONFIG.MAX_CONTENT_LENGTH
      });
      
      clearTimeout(timeoutId);
      
      // Check response size before processing
      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength) > SECURITY_CONFIG.MAX_CONTENT_LENGTH) {
        throw new Error(`Response too large: ${contentLength} bytes`);
      }
      
      if (!response.ok) {
        return {
          success: false,
          statusCode: response.status,
          headers: this.parseHeaders(response.headers as any),
          contentType: '',
          contentLength: 0,
          contentHash: '',
          filePath: '',
          errors: [`HTTP ${response.status}: ${response.statusText}`]
        };
      }
      
      const buffer = await response.arrayBuffer();
      const content = new Uint8Array(buffer);
      
      // Validate content size
      if (content.length > SECURITY_CONFIG.MAX_CONTENT_LENGTH) {
        throw new Error(`Downloaded content too large: ${content.length} bytes`);
      }
      
      // Save transformed image
      await writeFile(outputPath, content);
      
      // Calculate content hash
      const contentHash = createHash('sha256').update(content).digest('hex');
      
      return {
        success: true,
        statusCode: response.status,
        headers: this.parseHeaders(response.headers as any),
        contentType: response.headers.get('content-type') || '',
        contentLength: content.length,
        contentHash,
        filePath: outputPath,
        errors: []
      };
      
    } catch (error) {
      return {
        success: false,
        statusCode: 0,
        headers: {},
        contentType: '',
        contentLength: 0,
        contentHash: '',
        filePath: '',
        errors: [error instanceof Error ? error.message : String(error)]
      };
    }
  }

  /**
   * Verify C2PA Content Credentials using c2patool
   */
  private async verifyContentCredentials(imagePath: string): Promise<VerifyResult> {
    try {
      const result = await this.runC2paTool(imagePath);
      
      return {
        manifestFound: result.manifests?.length > 0,
        manifestType: result.manifests?.length > 0 ? 
          (result.manifests[0].type === 'embedded' ? 'embedded' : 'remote') : 'none',
        manifestValid: result.validation?.valid || false,
        manifestHash: result.manifests?.[0]?.hash,
        signatureValid: result.validation?.signature_valid || false,
        assertions: result.assertions || [],
        tool: 'c2patool',
        version: '0.10.0',
        output: JSON.stringify(result, null, 2)
      };
      
    } catch (error) {
      return this.createFailedVerifyResult(error);
    }
  }

  /**
   * Test remote manifest discovery
   */
  private async testRemoteManifestDiscovery(headers: Record<string, string>): Promise<DiscoveryResult> {
    const linkHeader = headers['link'];
    const startTime = Date.now();
    
    if (!linkHeader || !linkHeader.includes('rel="c2pa-manifest"')) {
      return {
        linkHeaderFound: false,
        manifestAccessible: false,
        discoveryLatency: Date.now() - startTime,
        mixedContent: false
      };
    }
    
    // Extract manifest URL from Link header
    const manifestUrlMatch = linkHeader.match(/<([^>]+)>;\s*rel="c2pa-manifest"/);
    if (!manifestUrlMatch) {
      return {
        linkHeaderFound: true,
        linkHeaderValue: linkHeader,
        manifestAccessible: false,
        discoveryLatency: Date.now() - startTime,
        mixedContent: false
      };
    }
    
    const manifestUrl = manifestUrlMatch[1];
    
    // Check for mixed content
    if (!manifestUrl) {
      return this.createFailedDiscoveryResult('No manifest URL found');
    }
    
    const isSecure = manifestUrl.startsWith('https://');
    const mixedContent = !isSecure;
    
    try {
      // Validate manifest URL
      if (!validateUrl(manifestUrl)) {
        throw new Error(`Invalid manifest URL: ${manifestUrl}`);
      }
      
      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(manifestUrl, {
        method: 'HEAD',
        headers: {
          'User-Agent': 'C2PA-Leaderboard/1.1.0',
          'Accept': 'application/c2pa, application/json',
          'Connection': 'close'
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      return {
        linkHeaderFound: true,
        linkHeaderValue: linkHeader,
        manifestAccessible: response.ok,
        manifestUrl: response.ok ? manifestUrl : undefined,
        discoveryLatency: Date.now() - startTime,
        mixedContent
      };
      
    } catch (error) {
      return {
        linkHeaderFound: true,
        linkHeaderValue: linkHeader,
        manifestAccessible: false,
        discoveryLatency: Date.now() - startTime,
        mixedContent
      };
    }
  }

  /**
   * Run c2patool for verification with security hardening
   */
  private async runC2paTool(imagePath: string): Promise<any> {
    return new Promise((resolve, reject) => {
      // Validate input path to prevent directory traversal
      if (imagePath.includes('..') || imagePath.includes('~')) {
        reject(new Error('Invalid image path'));
        return;
      }
      
      const args = [imagePath, '--output', 'json'];
      const childProcess = spawn(this.config.c2patoolPath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: this.config.timeoutMs,
        shell: false,
        // Security hardening options
        detached: false,
        uid: undefined, // Run as current user, consider dedicated user
        gid: undefined,
        // Environment isolation
        env: {
          ['PATH']: process.env['PATH'],
          HOME: '/tmp',
          TMPDIR: '/tmp',
          NODE_ENV: 'production'
        }
      }) as any;
      
      let stdout = '';
      let stderr = '';
      
      // Limit output size to prevent memory exhaustion
      const MAX_OUTPUT_SIZE = 1024 * 1024; // 1MB
      
      childProcess.stdout?.on('data', (data: any) => {
        stdout += data.toString();
        if (stdout.length > MAX_OUTPUT_SIZE) {
          childProcess.kill('SIGKILL');
          reject(new Error('c2patool output too large'));
          return;
        }
      });
      
      childProcess.stderr?.on('data', (data: any) => {
        stderr += data.toString();
        if (stderr.length > MAX_OUTPUT_SIZE) {
          childProcess.kill('SIGKILL');
          reject(new Error('c2patool error output too large'));
          return;
        }
      });
      
      childProcess.on('close', (code: any) => {
        if (code === 0) {
          try {
            const result = JSON.parse(stdout);
            resolve(result);
          } catch (parseError) {
            reject(new Error(`Failed to parse c2patool output: ${parseError}`));
          }
        } else {
          reject(new Error(`c2patool failed with code ${code}: ${stderr}`));
        }
      });
      
      childProcess.on('error', (error: any) => {
        reject(new Error(`c2patool process error: ${error.message}`));
      });
      
      // Ensure process cleanup
      const killTimeout = setTimeout(() => {
        childProcess.kill('SIGKILL');
        reject(new Error('c2patool execution timeout'));
      }, this.config.timeoutMs + 5000);
      
      childProcess.on('close', () => {
        clearTimeout(killTimeout);
      });
    });
  }

  /**
   * Generate test artifacts
   */
  private async generateArtifacts(
    execution: TestExecution,
    transformResult: any,
    verifyResult: VerifyResult,
    discoveryResult: DiscoveryResult
  ): Promise<Artifact[]> {
    const artifacts: Artifact[] = [];
    const artifactDir = join(this.config.outputDir, 'artifacts', execution.id);
    await mkdir(artifactDir, { recursive: true });
    
    // Save verification output
    const verifyOutputPath = join(artifactDir, 'verify-output.json');
    await writeFile(verifyOutputPath, verifyResult.output);
    artifacts.push({
      type: 'verify-output',
      filename: 'verify-output.json',
      path: verifyOutputPath,
      hash: createSecureHash(verifyResult.output),
      size: verifyResult.output.length
    });
    
    // Save headers
    const headersPath = join(artifactDir, 'headers.json');
    const headersJson = JSON.stringify(transformResult.headers, null, 2);
    await writeFile(headersPath, headersJson);
    artifacts.push({
      type: 'headers',
      filename: 'headers.json',
      path: headersPath,
      hash: createSecureHash(headersJson),
      size: headersJson.length
    });
    
    // Save curl command for reproduction
    const curlCommand = this.generateCurlCommand(execution, transformResult);
    const curlPath = join(artifactDir, 'reproduce.sh');
    await writeFile(curlPath, curlCommand);
    artifacts.push({
      type: 'curl-log',
      filename: 'reproduce.sh',
      path: curlPath,
      hash: createSecureHash(curlCommand),
      size: curlCommand.length
    });
    
    // Reference to transformed image
    if (transformResult.filePath) {
      artifacts.push({
        type: 'transformed',
        filename: `transformed-${execution.id}.jpg`,
        path: transformResult.filePath,
        hash: transformResult.contentHash,
        size: transformResult.contentLength
      });
    }
    
    return artifacts;
  }

  /**
   * Build transformation parameters
   */
  private buildTransformParams(
    vendor: Vendor,
    transform: Transform,
    configType: 'default' | 'best-practice'
  ): Record<string, string> {
    const params = { ...transform.params };
    
    if (configType === 'best-practice' && vendor.testing.preserveToggle) {
      const toggle = vendor.testing.preserveToggle;
      params[toggle.param] = toggle.value;
    }
    
    return params;
  }

  /**
   * Build transformation URL
   */
  private buildTransformUrl(
    baseUrl: string,
    assetUrl: string,
    params: Record<string, string>
  ): string {
    const url = new URL(baseUrl.replace('{image_id}', encodeURIComponent(assetUrl)));
    
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
    
    return url.toString();
  }

  /**
   * Parse fetch headers into plain object
   */
  private parseHeaders(headers: Headers): Record<string, string> {
    const result: Record<string, string> = {};
    headers.forEach((value, key) => {
      result[key.toLowerCase()] = value;
    });
    return result;
  }

  /**
   * Generate execution ID
   */
  private generateExecutionId(
    vendorId: string,
    assetId: string,
    transformId: string,
    configType: string
  ): string {
    return `${vendorId}-${assetId}-${transformId}-${configType}-${Date.now()}`;
  }

  /**
   * Generate output filename
   */
  private generateOutputFilename(
    vendorId: string,
    assetId: string,
    transformId: string,
    configType: string
  ): string {
    return `${vendorId}-${assetId}-${transformId}-${configType}.jpg`;
  }

  /**
   * Generate curl command for reproduction
   */
  private generateCurlCommand(
    execution: TestExecution,
    transformResult: any
  ): string {
    const headers = Object.entries(transformResult.headers)
      .map(([key, value]) => `-H "${key}: ${value}"`)
      .join(' \\\n  ');
    
    return `#!/bin/bash
# C2PA Leaderboard Test Reproduction
# Execution ID: ${execution.id}
# Vendor: ${execution.vendorId}
# Asset: ${execution.assetId}
# Transform: ${execution.transformId}
# Config: ${execution.config}

curl -X GET \\
  ${headers} \\
  -o "transformed-${execution.id}.jpg" \\
  -v \\
  "${transformResult.url}"

# Verify with c2patool
c2patool "transformed-${execution.id}.jpg" --output json
`;
  }

  /**
   * Create failed verify result
   */
  private createFailedVerifyResult(error: any): VerifyResult {
    return {
      manifestFound: false,
      manifestType: 'none',
      manifestValid: false,
      signatureValid: false,
      assertions: [],
      tool: 'c2patool',
      version: '0.10.0',
      output: JSON.stringify({ error: error instanceof Error ? error.message : String(error) })
    };
  }

  /**
   * Create failed discovery result
   */
  private createFailedDiscoveryResult(error: any): DiscoveryResult {
    return {
      linkHeaderFound: false,
      manifestAccessible: false,
      discoveryLatency: 0,
      mixedContent: false
    };
  }

  /**
   * Get active test count
   */
  getActiveTestCount(): number {
    return this.activeTests.size;
  }

  /**
   * Get test execution by ID
   */
  getExecution(id: string): TestExecution | undefined {
    return this.activeTests.get(id);
  }

  /**
   * Cancel test execution
   */
  async cancelExecution(id: string): Promise<boolean> {
    const execution = this.activeTests.get(id);
    if (execution) {
      this.activeTests.delete(id);
      return true;
    }
    return false;
  }
}
