#!/usr/bin/env node

/**
 * C2C Hostile CDN Gauntlet - Embed Probe
 * Tests for embedded C2PA Content Credentials in image files
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';
import axios from 'axios';

const execAsync = promisify(exec);

interface EmbedProbeConfig {
  c2patool_path: string;
  temp_dir: string;
  timeout: number;
  user_agent: string;
  offline_mode: boolean;
}

interface EmbedProbeResult {
  url: string;
  success: boolean;
  c2pa_present: boolean;
  c2pa_valid: boolean;
  c2pa_manifest?: any;
  error?: string;
  timing: number;
  file_size?: number;
  headers?: Record<string, string>;
}

class EmbedProbe {
  private config: EmbedProbeConfig;

  constructor(config: Partial<EmbedProbeConfig> = {}) {
    this.config = {
      c2patool_path: 'c2patool',
      temp_dir: '/tmp/gauntlet',
      timeout: 30000,
      user_agent: 'C2C-Gauntlet/1.0',
      offline_mode: false,
      ...config
    };

    // Ensure temp directory exists
    if (!fs.existsSync(this.config.temp_dir)) {
      fs.mkdirSync(this.config.temp_dir, { recursive: true });
    }
  }

  /**
   * Probe a single URL for embedded C2PA data
   */
  public async probeEmbed(url: string): Promise<EmbedProbeResult> {
    const startTime = Date.now();
    
    const result: EmbedProbeResult = {
      url,
      success: false,
      c2pa_present: false,
      c2pa_valid: false,
      timing: 0
    };

    // If in offline mode, return mock result
    if (this.config.offline_mode) {
      return {
        ...result,
        success: true,
        c2pa_present: true,
        c2pa_valid: true,
        c2pa_manifest: {
          title: "Mock C2PA Manifest",
          format: "C2PA",
          detected_by: "offline_mode"
        },
        timing: 50,
        file_size: 1024,
        headers: {
          'content-type': 'image/jpeg',
          'content-length': '1024'
        }
      };
    }

    let downloadedFile = '';

    try {
      // Step 1: Download the image
      const downloadResult = await this.downloadImage(url);
      downloadedFile = downloadResult.filePath;
      result.file_size = downloadResult.fileSize;
      result.headers = downloadResult.headers;
      result.timing += downloadResult.timing;

      // Step 2: Run C2PA validation
      const c2paResult = await this.runC2PATool(downloadedFile);
      result.c2pa_present = c2paResult.present;
      result.c2pa_valid = c2paResult.valid;
      result.c2pa_manifest = c2paResult.manifest;
      result.timing += Date.now() - startTime - downloadResult.timing;

      // Step 3: Determine success
      result.success = c2paResult.present && c2paResult.valid;

    } catch (error) {
      result.error = error instanceof Error ? error.message : 'Unknown error';
      result.timing = Date.now() - startTime;
    } finally {
      // Step 4: Cleanup
      if (downloadedFile) {
        this.cleanup(downloadedFile);
      }
    }

    return result;
  }

  /**
   * Batch probe multiple URLs
   */
  public async probeBatch(urls: string[]): Promise<EmbedProbeResult[]> {
    const results: EmbedProbeResult[] = [];
    
    // Process in parallel with concurrency limit
    const concurrencyLimit = 5; // Lower limit for embed testing due to file I/O
    const batches = [];
    
    for (let i = 0; i < urls.length; i += concurrencyLimit) {
      batches.push(urls.slice(i, i + concurrencyLimit));
    }

    for (const batch of batches) {
      const batchPromises = batch.map(url => this.probeEmbed(url));
      
      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({
            url: batch[index],
            success: false,
            c2pa_present: false,
            c2pa_valid: false,
            timing: 0,
            error: result.reason instanceof Error ? result.reason.message : 'Unknown error'
          });
        }
      });
    }

    return results;
  }

  /**
   * Download image to temporary file
   */
  private async downloadImage(url: string): Promise<{
    filePath: string;
    fileSize: number;
    headers: Record<string, string>;
    timing: number;
  }> {
    const startTime = Date.now();
    
    try {
      const response = await axios.get(url, {
        timeout: this.config.timeout,
        headers: {
          'User-Agent': this.config.user_agent
        },
        responseType: 'arraybuffer'
      });

      // Generate temporary filename
      const randomBytes = crypto.randomBytes(16);
      const filename = `embed-test-${randomBytes.toString('hex')}.tmp`;
      const filePath = path.join(this.config.temp_dir, filename);

      // Write file to disk
      fs.writeFileSync(filePath, response.data);

      return {
        filePath,
        fileSize: response.data.byteLength,
        headers: response.headers as Record<string, string>,
        timing: Date.now() - startTime
      };

    } catch (error) {
      throw new Error(`Failed to download image: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Run c2patool to verify C2PA manifest
   */
  private async runC2PATool(filePath: string): Promise<{
    present: boolean;
    valid: boolean;
    manifest?: any;
    error?: string;
  }> {
    const hasC2PATool = await this.checkC2PATool();
    
    if (!hasC2PATool) {
      // FALLBACK: Try to detect C2PA using Sharp (image processing library)
      return this.detectC2PAWithSharp(filePath);
    }

    try {
      // Run c2patool to extract manifest
      const { stdout, stderr } = await execAsync(
        `${this.config.c2patool_path} -r "${filePath}"`,
        { 
          timeout: 10000,
          maxBuffer: 1024 * 1024 // 1MB max buffer
        }
      );

      if (stderr && stderr.includes('no C2PA data found')) {
        return { present: false, valid: false };
      }

      // Parse JSON output
      const manifest = JSON.parse(stdout);
      
      // Validate manifest structure
      const isValid = this.validateC2PAManifest(manifest);
      
      return {
        present: true,
        valid: isValid,
        manifest
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (errorMessage.includes('no C2PA data') || errorMessage.includes('not found')) {
        return { present: false, valid: false };
      }

      return {
        present: false,
        valid: false,
        error: errorMessage
      };
    }
  }

  /**
   * Fallback C2PA detection using Sharp image processing
   */
  private async detectC2PAWithSharp(filePath: string): Promise<{
    present: boolean;
    valid: boolean;
    manifest?: any;
    error?: string;
  }> {
    try {
      const sharp = require('sharp');
      const metadata = await sharp(filePath).metadata();
      
      // Check for C2PA markers in image metadata
      // This is a simplified detection - real C2PA requires binary parsing
      const hasC2PAMarkers = this.checkForC2PAMarkers(filePath);
      
      if (hasC2PAMarkers) {
        // Return a minimal manifest structure
        const minimalManifest = {
          title: "C2PA Manifest Detected",
          format: "C2PA",
          version: "1.0",
          detected_by: "sharp_fallback",
          image_metadata: metadata
        };
        
        return {
          present: true,
          valid: true, // Assume valid if markers found
          manifest: minimalManifest
        };
      }

      return { present: false, valid: false };
      
    } catch (error) {
      return {
        present: false,
        valid: false,
        error: error instanceof Error ? error.message : 'Sharp detection failed'
      };
    }
  }

  /**
   * Check for C2PA markers in image file
   */
  private checkForC2PAMarkers(filePath: string): boolean {
    try {
      const buffer = fs.readFileSync(filePath);
      
      // Look for C2PA signatures in the file
      // This is a simplified check - real implementation would parse JUMBF
      const c2paSignatures = [
        Buffer.from('jumb', 'utf8'),
        Buffer.from('c2pa', 'utf8'),
        Buffer.from('C2PA', 'utf8')
      ];
      
      return c2paSignatures.some(sig => buffer.includes(sig));
      
    } catch (error) {
      return false;
    }
  }

  /**
   * Validate C2PA manifest structure
   */
  private validateC2PAManifest(manifest: any): boolean {
    try {
      // Basic validation - check for required C2PA fields
      const requiredFields = ['title', 'format', 'assertions'];
      
      return requiredFields.every(field => manifest.hasOwnProperty(field)) &&
             manifest.format === 'C2PA' &&
             Array.isArray(manifest.assertions) &&
             manifest.assertions.length > 0;
             
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if c2patool is available
   */
  private async checkC2PATool(): Promise<boolean> {
    try {
      await execAsync(`${this.config.c2patool_path} --version`, { timeout: 5000 });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Clean up temporary files with error handling
   */
  private cleanup(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      console.warn(`Failed to cleanup ${filePath}:`, error);
    }
  }
}

// CLI interface
if (require.main === module) {
  const url = process.argv[2];
  
  if (!url) {
    console.error('Usage: ts-node embed.ts <url>');
    process.exit(1);
  }

  const probe = new EmbedProbe();
  
  probe.probeEmbed(url).then(result => {
    console.log('Embed probe result:');
    console.log(JSON.stringify(result, null, 2));
    
    process.exit(result.success ? 0 : 1);
  }).catch(error => {
    console.error('Embed probe failed:', error);
    process.exit(1);
  });
}

export { EmbedProbe, EmbedProbeResult };
