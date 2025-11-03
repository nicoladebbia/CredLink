/**
 * Phase 31 - Range Index Generator
 * Ingests SSAI logs/packager events and emits signed, cacheable JSON
 */

import { createHash, randomBytes, createSign, createVerify } from 'crypto';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { sign, verify, Algorithm } from 'jsonwebtoken';
import { join, dirname, resolve } from 'path';

export interface SSAIEvent {
  splice_event_id: string;
  start_time: string; // ISO 8601
  end_time: string;   // ISO 8601
  scte35_hex?: string;
  ad_manifest_url: string;
  ad_creative_id: string;
  advertiser_id: string;
}

export interface PackagerConfig {
  stream_id: string;
  program_manifest_url: string;
  output_directory: string;
  private_key_path: string; // Path to private key for signing
  public_key_path: string; // Path to public key for verification
  key_id: string; // Key identifier for rotation
  cache_ttl_seconds: number;
}

export class RangeIndexGeneratorTool {
  private config: PackagerConfig;
  private readonly MAX_EVENTS_PER_INDEX = 1000;
  private readonly MAX_URL_LENGTH = 2048;
  private readonly MIN_CACHE_TTL = 30; // 30 seconds minimum
  private readonly MAX_CACHE_TTL = 3600; // 1 hour maximum

  constructor(config: PackagerConfig) {
    this.validateConfig(config);
    this.config = config;
    
    // Ensure output directory exists
    this.ensureDirectoryExists(config.output_directory);
  }

  /**
   * Validate configuration parameters
   */
  private validateConfig(config: PackagerConfig): void {
    // Validate stream_id
    if (!config.stream_id || typeof config.stream_id !== 'string') {
      throw new Error('stream_id is required and must be a string');
    }
    
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(config.stream_id)) {
      throw new Error('stream_id must be 1-64 characters of alphanumeric, underscore, or hyphen');
    }

    // Validate program_manifest_url
    if (!this.validateHTTPSUrl(config.program_manifest_url)) {
      throw new Error('program_manifest_url must be a valid HTTPS URL');
    }

    // Validate output_directory
    if (!config.output_directory || typeof config.output_directory !== 'string') {
      throw new Error('output_directory is required and must be a string');
    }

    // Validate key paths
    if (!config.private_key_path || !existsSync(config.private_key_path)) {
      throw new Error('private_key_path must exist');
    }

    if (!config.public_key_path || !existsSync(config.public_key_path)) {
      throw new Error('public_key_path must exist');
    }

    // Validate key_id
    if (!config.key_id || typeof config.key_id !== 'string' || config.key_id.length > 64) {
      throw new Error('key_id is required and must be <= 64 characters');
    }

    // Validate cache_ttl_seconds
    if (typeof config.cache_ttl_seconds !== 'number' || 
        config.cache_ttl_seconds < this.MIN_CACHE_TTL || 
        config.cache_ttl_seconds > this.MAX_CACHE_TTL) {
      throw new Error(`cache_ttl_seconds must be between ${this.MIN_CACHE_TTL} and ${this.MAX_CACHE_TTL}`);
    }
  }

  /**
   * Validate HTTPS URL
   */
  private validateHTTPSUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'https:' && 
             parsed.hostname.length > 0 &&
             url.length <= this.MAX_URL_LENGTH;
    } catch {
      return false;
    }
  }

  /**
   * Validate ISO 8601 timestamp
   */
  private validateTimestamp(timestamp: string): boolean {
    if (!timestamp || typeof timestamp !== 'string') return false;
    
    const date = new Date(timestamp);
    const now = new Date();
    const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    const oneYearFromNow = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
    
    return !isNaN(date.getTime()) && 
           date >= oneYearAgo && 
           date <= oneYearFromNow &&
           timestamp.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/);
  }

  /**
   * Validate SCTE-35 hex format
   */
  private validateSCTE35(scte35?: string): boolean {
    if (!scte35) return true; // Optional field
    return /^[0-9a-fA-F]+$/.test(scte35) && 
           scte35.length >= 16 && 
           scte35.length <= 512;
  }

  /**
   * Ensure directory exists
   */
  private ensureDirectoryExists(dirPath: string): void {
    const resolvedPath = resolve(dirPath);
    if (!existsSync(resolvedPath)) {
      mkdirSync(resolvedPath, { recursive: true });
    }
  }

  /**
   * Generate range index from SSAI logs (AWS MediaTailor/MediaPackage format)
   */
  generateFromSSAILogs(ssaiEvents: SSAIEvent[]): string {
    // Validate input
    if (!Array.isArray(ssaiEvents)) {
      throw new Error('ssaiEvents must be an array');
    }

    if (ssaiEvents.length > this.MAX_EVENTS_PER_INDEX) {
      throw new Error(`Too many events: maximum ${this.MAX_EVENTS_PER_INDEX} per index`);
    }

    const ranges = ssaiEvents.map((event, index) => {
      // Validate each event
      if (!event.splice_event_id || typeof event.splice_event_id !== 'string') {
        throw new Error(`Invalid splice_event_id at index ${index}`);
      }

      if (!this.validateTimestamp(event.start_time)) {
        throw new Error(`Invalid start_time at index ${index}`);
      }

      if (!this.validateTimestamp(event.end_time)) {
        throw new Error(`Invalid end_time at index ${index}`);
      }

      if (new Date(event.start_time) >= new Date(event.end_time)) {
        throw new Error(`start_time must be before end_time at index ${index}`);
      }

      if (!this.validateSCTE35(event.scte35_hex)) {
        throw new Error(`Invalid scte35_hex format at index ${index}`);
      }

      if (!this.validateHTTPSUrl(event.ad_manifest_url)) {
        throw new Error(`Invalid ad_manifest_url at index ${index} - must be HTTPS`);
      }

      if (!event.ad_creative_id || typeof event.ad_creative_id !== 'string') {
        throw new Error(`Invalid ad_creative_id at index ${index}`);
      }

      if (!event.advertiser_id || typeof event.advertiser_id !== 'string') {
        throw new Error(`Invalid advertiser_id at index ${index}`);
      }

      return {
        id: `splice-${event.splice_event_id}`,
        type: 'ad' as const,
        start: event.start_time,
        end: event.end_time,
        scte35: event.scte35_hex,
        manifest: event.ad_manifest_url,
        metadata: {
          creative_id: event.ad_creative_id,
          advertiser_id: event.advertiser_id
        }
      };
    });

    // Sort ranges by start time
    ranges.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

    // Check for overlapping ranges
    for (let i = 1; i < ranges.length; i++) {
      const prevEnd = new Date(ranges[i - 1].end).getTime();
      const currentStart = new Date(ranges[i].start).getTime();
      if (currentStart < prevEnd) {
        throw new Error(`Overlapping ranges detected: ${ranges[i - 1].id} and ${ranges[i].id}`);
      }
    }

    const rangeIndex = {
      stream_id: this.config.stream_id,
      unit: 'program_time' as const,
      program: {
        manifest: this.config.program_manifest_url
      },
      ranges,
      version: this.generateSecureVersion(ranges),
      generated_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + this.config.cache_ttl_seconds * 1000).toISOString()
    };

    // Sign the range index for authenticity
    const signedIndex = this.signRangeIndex(rangeIndex);
    
    // Write to file with secure permissions
    const outputPath = join(this.config.output_directory, `range-index-${this.config.stream_id}.json`);
    writeFileSync(outputPath, JSON.stringify(signedIndex, null, 2), { mode: 0o640 });
    
    return outputPath;
  }

  /**
   * Generate from packager events (Unified Origin, etc.)
   */
  generateFromPackagerEvents(events: Array<{
    type: 'daterange' | 'cue_out' | 'cue_in';
    id?: string;
    start_date?: string;
    duration?: number;
    cue_out_duration?: number;
    manifest_url?: string;
  }>): string {
    if (!Array.isArray(events) || events.length > this.MAX_EVENTS_PER_INDEX) {
      throw new Error('Invalid events array or exceeds maximum size');
    }

    const ranges: any[] = [];
    let currentAdStart: string | null = null;
    let currentAdId: string | null = null;

    for (const event of events) {
      switch (event.type) {
        case 'daterange':
          if (event.id && event.start_date && event.duration && event.manifest_url) {
            if (!this.validateTimestamp(event.start_date)) {
              throw new Error('Invalid start_date in daterange event');
            }

            if (typeof event.duration !== 'number' || event.duration <= 0 || event.duration > 3600) {
              throw new Error('Invalid duration in daterange event');
            }

            if (!this.validateHTTPSUrl(event.manifest_url)) {
              throw new Error('Invalid manifest_url in daterange event');
            }

            const endDate = new Date(event.start_date);
            endDate.setSeconds(endDate.getSeconds() + event.duration);
            
            ranges.push({
              id: event.id,
              type: 'ad',
              start: event.start_date,
              end: endDate.toISOString(),
              manifest: event.manifest_url
            });
          }
          break;
          
        case 'cue_out':
          if (event.cue_out_duration) {
            if (typeof event.cue_out_duration !== 'number' || event.cue_out_duration <= 0) {
              throw new Error('Invalid cue_out_duration');
            }
            currentAdStart = new Date().toISOString();
            currentAdId = `cue-${Date.now()}`;
          }
          break;
          
        case 'cue_in':
          if (currentAdStart && currentAdId) {
            const end = new Date().toISOString();
            ranges.push({
              id: currentAdId,
              type: 'ad',
              start: currentAdStart,
              end: end,
              manifest: this.config.program_manifest_url // Fallback to program
            });
            
            currentAdStart = null;
            currentAdId = null;
          }
          break;
          
        default:
          throw new Error(`Unknown event type: ${(event as any).type}`);
      }
    }

    return this.generateFromSSAILogs(ranges.map(range => ({
      splice_event_id: range.id.replace('splice-', ''),
      start_time: range.start,
      end_time: range.end,
      ad_manifest_url: range.manifest,
      ad_creative_id: 'unknown',
      advertiser_id: 'unknown'
    })));
  }

  /**
   * Load private key securely
   */
  private loadPrivateKey(): string {
    try {
      const privateKey = readFileSync(this.config.private_key_path, 'utf-8');
      
      // Basic key validation
      if (!privateKey.includes('-----BEGIN') || !privateKey.includes('-----END')) {
        throw new Error('Invalid private key format');
      }
      
      return privateKey;
    } catch (error) {
      throw new Error(`Failed to load private key: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Load public key securely
   */
  private loadPublicKey(): string {
    try {
      const publicKey = readFileSync(this.config.public_key_path, 'utf-8');
      
      // Basic key validation
      if (!publicKey.includes('-----BEGIN') || !publicKey.includes('-----END')) {
        throw new Error('Invalid public key format');
      }
      
      return publicKey;
    } catch (error) {
      throw new Error(`Failed to load public key: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate secure version hash using SHA-256
   */
  private generateSecureVersion(ranges: any[]): string {
    const hashInput = ranges.map(r => `${r.id}:${r.start}:${r.end}:${r.manifest}`).join('|');
    return createHash('sha256').update(hashInput).digest('hex').substring(0, 16);
  }

  /**
   * Sign range index with secure asymmetric JWT
   */
  private signRangeIndex(rangeIndex: any): any {
    const privateKey = this.loadPrivateKey();
    
    // Add security metadata
    const secureIndex = {
      ...rangeIndex,
      security: {
        key_id: this.config.key_id,
        algorithm: 'RS256',
        issued_at: new Date().toISOString(),
        nonce: randomBytes(16).toString('hex')
      }
    };

    const signature = sign(secureIndex, privateKey, { 
      algorithm: 'RS256',
      expiresIn: this.config.cache_ttl_seconds,
      keyid: this.config.key_id
    });
    
    return {
      ...secureIndex,
      signature: signature
    };
  }

  /**
   * Validate signed range index with public key
   */
  static validateSignedIndex(signedIndex: any, publicKeyPath: string): boolean {
    try {
      // Validate input structure
      if (!signedIndex || typeof signedIndex !== 'object') {
        return false;
      }

      if (!signedIndex.signature || !signedIndex.security) {
        return false;
      }

      // Load public key
      if (!existsSync(publicKeyPath)) {
        throw new Error('Public key file does not exist');
      }
      
      const publicKey = readFileSync(publicKeyPath, 'utf-8');
      
      // Basic key validation
      if (!publicKey.includes('-----BEGIN') || !publicKey.includes('-----END')) {
        throw new Error('Invalid public key format');
      }
      
      // Remove signature for validation
      const { signature, security, ...indexData } = signedIndex;
      
      // Verify JWT signature with public key
      const decoded = verify(signature, publicKey, { algorithms: ['RS256'] });
      
      // Compare decoded payload with index data
      const payloadValid = JSON.stringify(decoded) === JSON.stringify(indexData);
      
      // Validate security metadata
      const securityValid = security && 
        security.algorithm === 'RS256' && 
        security.nonce && 
        security.issued_at &&
        typeof security.key_id === 'string';
      
      return payloadValid && securityValid;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get configuration summary
   */
  getConfigSummary(): Omit<PackagerConfig, 'private_key_path' | 'public_key_path'> & {
    has_keys: boolean;
  } {
    return {
      stream_id: this.config.stream_id,
      program_manifest_url: this.config.program_manifest_url,
      output_directory: this.config.output_directory,
      key_id: this.config.key_id,
      cache_ttl_seconds: this.config.cache_ttl_seconds,
      has_keys: existsSync(this.config.private_key_path) && existsSync(this.config.public_key_path)
    };
  }
}

// CLI interface for the tool
export class RangeIndexCLI {
  static async run(): Promise<void> {
    const args = process.argv.slice(2);
    
    if (args.length < 3) {
      console.log('Usage: range-index-generator <config.json> <input.json> <output-dir>');
      process.exit(1);
    }
    
    const [configPath, inputPath, outputDir] = args;
    
    try {
      // Load configuration
      const config: PackagerConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
      config.output_directory = outputDir;
      
      // Load input events
      const input: SSAIEvent[] = JSON.parse(readFileSync(inputPath, 'utf-8'));
      
      // Generate range index
      const generator = new RangeIndexGeneratorTool(config);
      const outputPath = generator.generateFromSSAILogs(input);
      
      console.log(`✅ Range index generated successfully: ${outputPath}`);
      
    } catch (error) {
      console.error('❌ Failed to generate range index:', error);
      process.exit(1);
    }
  }
}

// Export for programmatic use
export default RangeIndexGeneratorTool;
