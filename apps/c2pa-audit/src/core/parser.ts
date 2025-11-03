/**
 * C2PA Manifest Parser and Normalizer
 * Handles parsing of embedded manifests, sidecar files, and remote manifests
 * Implements normalization pipeline for consistent diff operations
 */

import { createHash } from 'crypto';
import { readFile } from 'fs/promises';
import { 
  C2PAManifest, 
  ClaimSignature, 
  Assertion, 
  Ingredient, 
  Certificate,
  ValidationStatus,
  ValidationCode,
  C2PAError,
  ParsingError
} from '@/types';
import { JSONCanonicalizer } from './canonicalizer';

/**
 * Parses and normalizes C2PA manifests from various sources
 */
export class ManifestParser {
  /**
   * Parse manifest from various input sources
   * @param source - Asset URL, sidecar URL, or file path
   * @returns Normalized C2PA manifest
   */
  static async parseManifest(source: string | ArrayBuffer | Uint8Array): Promise<C2PAManifest> {
    let rawData: ArrayBuffer;
    
    if (typeof source === 'string') {
      // CRITICAL: Validate and sanitize URL to prevent SSRF and path traversal
      if (!this.isValidSource(source)) {
        throw new ParsingError('Invalid or unsafe source URL/path', 'invalid_source');
      }
      
      if (source.startsWith('http://') || source.startsWith('https://')) {
        rawData = await this.fetchFromURL(source);
      } else {
        // CRITICAL: Prevent path traversal attacks
        const sanitizedPath = this.sanitizePath(source);
        rawData = await this.readFromFile(sanitizedPath);
      }
    } else if (source instanceof ArrayBuffer) {
      rawData = source;
    } else if (source instanceof Uint8Array) {
      rawData = source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
    } else {
      throw new ParsingError('Invalid source type', 'unknown');
    }

    // CRITICAL: Validate data size to prevent DoS attacks
    if (rawData.byteLength > 100 * 1024 * 1024) { // 100MB limit
      throw new ParsingError('Input data exceeds maximum size limit', 'size_exceeded');
    }

    // Detect input type and extract manifest
    const mimeType = this.detectMimeType(source);
    
    if (mimeType === 'application/c2pa') {
      return this.parseSidecar(rawData);
    } else if (this.isImageType(mimeType) || this.isVideoType(mimeType)) {
      return this.parseEmbeddedManifest(rawData, mimeType);
    } else if (mimeType === 'application/json') {
      return this.parseJSONManifest(rawData);
    } else {
      throw new ParsingError(`Unsupported MIME type: ${mimeType}`, mimeType);
    }
  }

  /**
   * Parse manifest from sidecar file (.c2pa)
   * @param data - Raw sidecar data
   * @returns Normalized C2PA manifest
   */
  private static async parseSidecar(data: ArrayBuffer): Promise<C2PAManifest> {
    try {
      // Parse JUMBF structure to extract manifest store
      const jumbf = await this.parseJUMBF(data);
      const manifestStore = this.extractManifestStore(jumbf);
      
      if (!manifestStore || !manifestStore.manifests || manifestStore.manifests.length === 0) {
        throw new ParsingError('No manifests found in sidecar', 'application/c2pa');
      }

      // Get the active manifest
      const activeManifest = this.findActiveManifest(manifestStore);
      
      if (!activeManifest) {
        throw new ParsingError('No active manifest found', 'application/c2pa');
      }

      return this.normalizeManifest(activeManifest);
    } catch (error) {
      throw new ParsingError(
        `Failed to parse sidecar: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'application/c2pa'
      );
    }
  }

  /**
   * Parse embedded manifest from image/video file
   * @param data - Raw asset data
   * @param mimeType - MIME type of the asset
   * @returns Normalized C2PA manifest
   */
  private static async parseEmbeddedManifest(data: ArrayBuffer, mimeType: string): Promise<C2PAManifest> {
    try {
      // Extract JUMBF from asset based on format
      let jumbfData: ArrayBuffer;
      
      if (mimeType.startsWith('image/')) {
        jumbfData = await this.extractJUMBFFromImage(data, mimeType);
      } else if (mimeType.startsWith('video/')) {
        jumbfData = await this.extractJUMBFFromVideo(data, mimeType);
      } else {
        throw new ParsingError(`Unsupported embedded format: ${mimeType}`, mimeType);
      }

      const jumbf = await this.parseJUMBF(jumbfData);
      const manifestStore = this.extractManifestStore(jumbf);
      
      if (!manifestStore || !manifestStore.manifests || manifestStore.manifests.length === 0) {
        throw new ParsingError('No embedded manifests found', mimeType);
      }

      const activeManifest = this.findActiveManifest(manifestStore);
      
      if (!activeManifest) {
        throw new ParsingError('No active embedded manifest found', mimeType);
      }

      return this.normalizeManifest(activeManifest);
    } catch (error) {
      throw new ParsingError(
        `Failed to parse embedded manifest: ${error instanceof Error ? error.message : 'Unknown error'}`,
        mimeType
      );
    }
  }

  /**
   * Parse manifest from raw JSON
   * @param data - Raw JSON data
   * @returns Normalized C2PA manifest
   */
  private static async parseJSONManifest(data: ArrayBuffer): Promise<C2PAManifest> {
    try {
      const jsonString = new TextDecoder().decode(data);
      
      // CRITICAL: Validate JSON string size before parsing
      if (jsonString.length > 10 * 1024 * 1024) { // 10MB limit
        throw new ParsingError('JSON manifest too large', 'size_exceeded');
      }
      
      // CRITICAL: Validate JSON structure before parsing
      if (jsonString.includes('__proto__') || jsonString.includes('constructor') || jsonString.includes('prototype')) {
        throw new ParsingError('Potentially malicious JSON structure', 'invalid_structure');
      }
      
      const manifest = JSON.parse(jsonString);
      
      return this.normalizeManifest(manifest);
    } catch (error) {
      throw new ParsingError(
        `Failed to parse JSON manifest: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'application/json'
      );
    }
  }

  /**
   * Normalize manifest to consistent structure for diff operations
   * @param manifest - Raw manifest data
   * @returns Normalized C2PA manifest
   */
  private static async normalizeManifest(manifest: any): Promise<C2PAManifest> {
    try {
      // Extract basic manifest information
      const normalized: C2PAManifest = {
        manifest_hash: this.calculateManifestHash(manifest),
        claim_generator: manifest.claim_generator || 'unknown',
        claim_generator_version: manifest.claim_generator_version || 'unknown',
        timestamp: manifest.timestamp || new Date().toISOString(),
        claim_signature: this.normalizeClaimSignature(manifest.claim_signature || {}),
        assertions: this.normalizeAssertions(manifest.assertions || []),
        ingredients: this.normalizeIngredients(manifest.ingredients || []),
        redactions: this.normalizeRedactions(manifest.redactions || [])
      };

      return normalized;
    } catch (error) {
      throw new ParsingError(
        `Failed to normalize manifest: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'normalization'
      );
    }
  }

  /**
   * Normalize claim signature
   * @param claimSignature - Raw claim signature data
   * @returns Normalized claim signature
   */
  private static normalizeClaimSignature(claimSignature: any): ClaimSignature {
    return {
      protected: {
        alg: claimSignature.protected?.alg || 'unknown',
        kid: claimSignature.protected?.kid,
        iat: claimSignature.protected?.iat,
        x5c: claimSignature.protected?.x5c || []
      },
      signature: claimSignature.signature || '',
      certificate_chain: this.normalizeCertificates(claimSignature.certificate_chain || []),
      validation_status: {
        valid: false,
        codes: [],
        summary: 'Not validated'
      }
    };
  }

  /**
   * Normalize assertions array
   * @param assertions - Raw assertions data
   * @returns Normalized assertions
   */
  private static normalizeAssertions(assertions: any[]): Assertion[] {
    return assertions.map(assertion => ({
      label: assertion.label || 'unknown',
      hashed_uri: assertion.hashed_uri || '',
      data: assertion.data,
      redacted: assertion.redacted || false,
      validation_status: {
        valid: false,
        codes: [],
        summary: 'Not validated'
      }
    }));
  }

  /**
   * Normalize ingredients array
   * @param ingredients - Raw ingredients data
   * @returns Normalized ingredients
   */
  private static normalizeIngredients(ingredients: any[]): Ingredient[] {
    return ingredients.map(ingredient => ({
      relationship: ingredient.relationship || 'parentOf',
      active_manifest: ingredient.active_manifest || '',
      claim_signature: ingredient.claim_signature || '',
      manifest: undefined, // Will be populated during lineage reconstruction
      validation_status: {
        valid: false,
        codes: [],
        summary: 'Not validated'
      }
    }));
  }

  /**
   * Normalize redactions array
   * @param redactions - Raw redactions data
   * @returns Normalized redactions
   */
  private static normalizeRedactions(redactions: any[]): any[] {
    return redactions.map(redaction => ({
      jumbf_uri: redaction.jumbf_uri || '',
      allowed: redaction.allowed || false,
      reason: redaction.reason
    }));
  }

  /**
   * Normalize certificates array
   * @param certificates - Raw certificates data
   * @returns Normalized certificates
   */
  private static normalizeCertificates(certificates: any[]): Certificate[] {
    return certificates.map(cert => ({
      subject: cert.subject || '',
      issuer: cert.issuer || '',
      serial_number: cert.serial_number || '',
      not_before: cert.not_before || '',
      not_after: cert.not_after || '',
      eku: cert.eku || [],
      thumbprint: this.calculateThumbprint(cert),
      trusted: false,
      revoked: false
    }));
  }

  /**
   * Calculate manifest hash using canonicalization
   * @param manifest - Manifest data
   * @returns SHA-256 hash
   */
  private static calculateManifestHash(manifest: any): string {
    return JSONCanonicalizer.hash(manifest, 'sha256');
  }

  /**
   * Calculate certificate thumbprint
   * @param certificate - Certificate data
   * @returns SHA-256 thumbprint
   */
  private static calculateThumbprint(certificate: any): string {
    if (certificate.raw) {
      return createHash('sha256').update(certificate.raw).digest('hex');
    }
    // Fallback to hashing the canonicalized certificate data
    return JSONCanonicalizer.hash(certificate, 'sha256');
  }

  /**
   * CRITICAL: Validate source URL/path to prevent SSRF and path traversal attacks
   * @param source - Source URL or path
   * @returns True if source is safe
   */
  private static isValidSource(source: string): boolean {
    // Check for null bytes and control characters
    if (source.includes('\0') || /[\x00-\x1F\x7F]/.test(source)) {
      return false;
    }

    // For URLs, validate against SSRF
    if (source.startsWith('http://') || source.startsWith('https://')) {
      try {
        const url = new URL(source);
        
        // Block private/internal ranges to prevent SSRF
        const hostname = url.hostname;
        if (this.isPrivateIP(hostname) || this.isLocalhost(hostname)) {
          return false;
        }
        
        // Only allow http/https schemes
        if (!['http:', 'https:'].includes(url.protocol)) {
          return false;
        }
        
        // Block suspicious ports
        const blockedPorts = [22, 23, 25, 53, 135, 139, 445, 993, 995];
        if (url.port && blockedPorts.includes(parseInt(url.port))) {
          return false;
        }
        
        return true;
      } catch {
        return false;
      }
    }
    
    // For file paths, check for path traversal
    return !this.hasPathTraversal(source);
  }

  /**
   * CRITICAL: Check if hostname is a private IP range
   * @param hostname - Hostname to check
   * @returns True if private IP
   */
  private static isPrivateIP(hostname: string): boolean {
    const privateRanges = [
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /^192\.168\./,
      /^127\./,
      /^169\.254\./,
      /^::1$/,
      /^fc00:/,
      /^fe80:/
    ];
    
    return privateRanges.some(range => range.test(hostname));
  }

  /**
   * CRITICAL: Check if hostname is localhost
   * @param hostname - Hostname to check
   * @returns True if localhost
   */
  private static isLocalhost(hostname: string): boolean {
    return hostname === 'localhost' || hostname === '0.0.0.0';
  }

  /**
   * CRITICAL: Check for path traversal attempts
   * @param path - Path to check
   * @returns True if path traversal detected
   */
  private static hasPathTraversal(path: string): boolean {
    // Check for common path traversal patterns
    const traversalPatterns = [
      /\.\.[\/\\]/,
      /[\/\\]\.\./,
      /\.\.%2f/i,
      /\.\.%5c/i,
      /%2e%2e[\/\\]/i
    ];
    
    return traversalPatterns.some(pattern => pattern.test(path));
  }

  /**
   * CRITICAL: Sanitize file path to prevent path traversal
   * @param path - Input path
   * @returns Sanitized path
   */
  private static sanitizePath(path: string): string {
    // Remove any path traversal attempts
    return path.replace(/[\/\\]\.\.[\/\\]/g, '/')
               .replace(/\.\.[\/\\]/g, '')
               .replace(/[\/\\]\.\./g, '');
  }

  /**
   * Detect MIME type of input source
   * @param source - Input source
   * @returns MIME type string
   */
  private static detectMimeType(source: string | ArrayBuffer | Uint8Array): string {
    if (typeof source === 'string') {
      // Check file extension
      const extension = source.split('.').pop()?.toLowerCase();
      if (extension === 'c2pa') {
        return 'application/c2pa';
      }
      // Basic MIME type detection without external dependency
      const mimeTypes: Record<string, string> = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'webp': 'image/webp',
        'mp4': 'video/mp4',
        'mov': 'video/quicktime',
        'json': 'application/json'
      };
      return mimeTypes[extension || ''] || 'application/octet-stream';
    }
    
    // For binary data, we'd need to analyze the bytes
    // For now, assume it's JSON
    return 'application/json';
  }

  /**
   * Check if MIME type is an image
   * @param mimeType - MIME type to check
   * @returns True if image type
   */
  private static isImageType(mimeType: string): boolean {
    return mimeType.startsWith('image/');
  }

  /**
   * Check if MIME type is a video
   * @param mimeType - MIME type to check
   * @returns True if video type
   */
  private static isVideoType(mimeType: string): boolean {
    return mimeType.startsWith('video/');
  }

  /**
   * Fetch data from URL
   * @param url - URL to fetch
   * @returns ArrayBuffer with data
   */
  private static async fetchFromURL(url: string): Promise<ArrayBuffer> {
    try {
      // CRITICAL: Set timeout to prevent hanging requests
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      // Use Node.js built-in fetch in Node 18+ with security controls
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'C2PA-Audit-Tool/1.0.0',
          'Accept': 'application/json, application/c2pa, image/*, video/*'
        }
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      // CRITICAL: Check content length to prevent DoS
      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength) > 100 * 1024 * 1024) { // 100MB limit
        throw new Error('Content too large');
      }
      
      const data = await response.arrayBuffer();
      
      // CRITICAL: Final size check
      if (data.byteLength > 100 * 1024 * 1024) {
        throw new Error('Downloaded content exceeds maximum size limit');
      }
      
      return data;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ParsingError('Request timeout - possible DoS attempt', 'timeout');
      }
      throw new ParsingError(
        `Failed to fetch from URL: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'url'
      );
    }
  }

  /**
   * Read data from file
   * @param path - File path to read
   * @returns ArrayBuffer with data
   */
  private static async readFromFile(path: string): Promise<ArrayBuffer> {
    try {
      // CRITICAL: Check file size before reading to prevent DoS
      const { stat } = await import('fs/promises');
      const fileStats = await stat(path);
      
      if (fileStats.size > 100 * 1024 * 1024) { // 100MB limit
        throw new ParsingError('File exceeds maximum size limit', 'size_exceeded');
      }
      
      const data = await readFile(path);
      
      // CRITICAL: Final size check
      if (data.length > 100 * 1024 * 1024) {
        throw new ParsingError('File content exceeds maximum size limit', 'size_exceeded');
      }
      
      // Handle Buffer properly for ArrayBuffer conversion
      if (data instanceof ArrayBuffer) {
        return data;
      }
      return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    } catch (error) {
      if (error instanceof ParsingError) {
        throw error;
      }
      throw new ParsingError(
        `Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'file'
      );
    }
  }

  /**
   * Parse JUMBF structure (placeholder implementation)
   * @param data - Raw JUMBF data
   * @returns Parsed JUMBF object
   */
  private static async parseJUMBF(data: ArrayBuffer): Promise<any> {
    // JUMBF parsing implementation would go here
    // For now, return a placeholder structure
    throw new ParsingError('JUMBF parsing not yet implemented', 'jumbf');
  }

  /**
   * Extract manifest store from JUMBF
   * @param jumbf - Parsed JUMBF object
   * @returns Manifest store object
   */
  private static extractManifestStore(jumbf: any): any {
    // Manifest store extraction implementation would go here
    // For now, return a placeholder structure
    throw new ParsingError('Manifest store extraction not yet implemented', 'store_extraction');
  }

  /**
   * Find active manifest in manifest store
   * @param manifestStore - Manifest store object
   * @returns Active manifest object
   */
  private static findActiveManifest(manifestStore: any): any {
    // Active manifest detection implementation would go here
    // For now, return the first manifest as placeholder
    throw new ParsingError('Active manifest detection not yet implemented', 'active_manifest');
  }

  /**
   * Extract JUMBF from image file
   * @param data - Raw image data
   * @param mimeType - Image MIME type
   * @returns JUMBF data as ArrayBuffer
   */
  private static async extractJUMBFFromImage(data: ArrayBuffer, mimeType: string): Promise<ArrayBuffer> {
    // Image JUMBF extraction implementation would go here
    // For now, throw a descriptive error
    throw new ParsingError(`Image JUMBF extraction not yet implemented for ${mimeType}`, 'image_jumbf');
  }

  /**
   * Extract JUMBF from video file
   * @param data - Raw video data
   * @param mimeType - Video MIME type
   * @returns JUMBF data as ArrayBuffer
   */
  private static async extractJUMBFFromVideo(data: ArrayBuffer, mimeType: string): Promise<ArrayBuffer> {
    // Video JUMBF extraction implementation would go here
    // For now, throw a descriptive error
    throw new ParsingError(`Video JUMBF extraction not yet implemented for ${mimeType}`, 'video_jumbf');
  }
}
