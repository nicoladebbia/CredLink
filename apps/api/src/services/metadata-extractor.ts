/**
 * Metadata Extractor Service
 * 
 * Real implementation with multiple extraction strategies for maximum recovery:
 * 1. JUMBF container parsing (primary C2PA method)
 * 2. EXIF metadata extraction
 * 3. XMP metadata extraction
 * 4. Custom PNG/WebP chunk parsing
 * 5. Fallback to partial/corrupted data recovery
 */

import sharp from 'sharp';
import { logger } from '../utils/logger';
import { JUMBFBuilder } from './jumbf-builder';
import { C2PAManifest } from './manifest-builder';
// BRUTAL FIX: exif-parser doesn't have proper TypeScript declarations
// eslint-disable-next-line @typescript-eslint/no-var-requires
const exifParser = require('exif-parser');

export class ExtractionError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = 'ExtractionError';
  }
}

export interface ExtractionResult {
  manifest: C2PAManifest | null;
  proofUri: string | null;
  source: 'jumbf' | 'exif' | 'xmp' | 'png-chunk' | 'webp-chunk' | 'c2pa-chunk' | 'xmp-chunk' | 'exif-chunk' | 'partial' | 'none';
  confidence: number; // 0-100
  corrupted: boolean;
}

export class MetadataExtractor {
  /**
   * Extract C2PA manifest and proof URI with multiple fallback strategies
   */
  async extract(imageBuffer: Buffer): Promise<ExtractionResult> {
    try {
      // Try extraction methods in order of reliability
      const methods = [
        () => this.extractFromJUMBF(imageBuffer),
        () => this.extractFromEXIF(imageBuffer),
        () => this.extractFromXMP(imageBuffer),
        () => this.extractFromCustomChunks(imageBuffer),
        () => this.extractPartial(imageBuffer)
      ];

      for (const method of methods) {
        try {
          const result = await method();
          if (result.manifest || result.proofUri) {
            logger.info('Metadata extracted successfully', { source: result.source });
            return result;
          }
        } catch (error: any) {
          logger.debug('Extraction method failed', { error: error.message });
          continue;
        }
      }

      return {
        manifest: null,
        proofUri: null,
        source: 'none',
        confidence: 0,
        corrupted: false
      };
    } catch (error: any) {
      logger.error('Extraction failed', { error: error.message });
      throw new ExtractionError(`Extraction failed: ${error.message}`, 'EXTRACTION_FAILED');
    }
  }

  /**
   * Extract from JUMBF container (primary C2PA method)
   */
  private async extractFromJUMBF(imageBuffer: Buffer): Promise<ExtractionResult> {
    const format = this.detectImageFormat(imageBuffer);

    if (format !== 'image/jpeg') {
      throw new Error('JUMBF only supported for JPEG');
    }

    // Parse JPEG segments
    const segments = this.parseJPEGSegments(imageBuffer);

    // Find APP11 segment (0xFFEB) containing JUMBF
    const jumbfSegment = segments.find(s => s.marker === 0xFFEB);

    if (!jumbfSegment) {
      throw new Error('No JUMBF segment found');
    }

    // Parse JUMBF container
    const container = JUMBFBuilder.parse(jumbfSegment.data);

    if (!container || !JUMBFBuilder.validate(container)) {
      throw new Error('Invalid JUMBF container');
    }

    // Extract manifest and proof URI
    const manifestBuffer = JUMBFBuilder.extractManifest(container);
    const proofUri = JUMBFBuilder.extractProofUri(container);

    let manifest: C2PAManifest | null = null;
    if (manifestBuffer) {
      try {
        manifest = JSON.parse(manifestBuffer.toString('utf8'));
      } catch (error) {
        logger.warn('Failed to parse manifest JSON');
      }
    }

    return {
      manifest,
      proofUri,
      source: 'jumbf',
      confidence: 100,
      corrupted: false
    };
  }

  /**
   * Extract from EXIF metadata
   */
  private async extractFromEXIF(imageBuffer: Buffer): Promise<ExtractionResult> {
    try {
      const metadata = await sharp(imageBuffer).metadata();

      if (!metadata.exif) {
        throw new Error('No EXIF data');
      }

      // Parse EXIF buffer using exif-parser
      let proofUri: string | null = null;

      try {
        const parser = exifParser.create(metadata.exif);
        const result = parser.parse();
        const tags = result.tags || {};

        // Check ImageDescription tag (0x010E / 270)
        if (tags.ImageDescription && typeof tags.ImageDescription === 'string') {
          if (tags.ImageDescription.startsWith('CredLink:')) {
            proofUri = tags.ImageDescription.replace('CredLink:', '');
          }
        }

        // Check Copyright field as fallback (0x8298 / 33432)
        if (!proofUri && tags.Copyright && typeof tags.Copyright === 'string') {
          const match = tags.Copyright.match(/https:\/\/proofs\.credlink\.com\/[a-f0-9-]+/);
          if (match) {
            proofUri = match[0];
          }
        }

        // Check Artist field as additional fallback (0x013B / 315)
        if (!proofUri && tags.Artist && typeof tags.Artist === 'string') {
          if (tags.Artist.startsWith('CredLink:')) {
            proofUri = tags.Artist.replace('CredLink:', '');
          }
        }
      } catch (parseError) {
        // If exif-parser fails, try to extract from raw buffer as string
        const exifString = metadata.exif.toString('utf8');
        const match = exifString.match(/CredLink:(https:\/\/[^\s\0]+)/);
        if (match) {
          proofUri = match[1];
        }
      }

      if (!proofUri) {
        throw new Error('No CredLink proof URI found in EXIF');
      }

      // Validate proof URI format and security
      if (!this.isValidProofUri(proofUri)) {
        throw new Error('Invalid proof URI format');
      }

      return {
        manifest: null,
        proofUri,
        source: 'exif',
        confidence: 80,
        corrupted: false
      };
    } catch (error) {
      throw new Error('EXIF extraction failed');
    }
  }

  /**
   * Extract from XMP metadata
   */
  private async extractFromXMP(imageBuffer: Buffer): Promise<ExtractionResult> {
    try {
      const metadata = await sharp(imageBuffer).metadata();
      
      if (!metadata.xmp) {
        throw new Error('No XMP data');
      }

      // Parse XMP (simplified - real implementation would use XML parser)
      const xmpString = metadata.xmp.toString('utf8');
      
      // Look for c2pa:manifest
      const manifestMatch = xmpString.match(/c2pa:manifest="([^"]+)"/);
      const proofUri = manifestMatch ? manifestMatch[1] : null;

      return {
        manifest: null,
        proofUri,
        source: 'xmp',
        confidence: 75,
        corrupted: false
      };
    } catch (error) {
      throw new Error('XMP extraction failed');
    }
  }

  /**
   * Extract from custom PNG/WebP chunks
   */
  private async extractFromCustomChunks(imageBuffer: Buffer): Promise<ExtractionResult> {
    const format = this.detectImageFormat(imageBuffer);

    if (format === 'image/png') {
      return this.extractFromPNGChunks(imageBuffer);
    } else if (format === 'image/webp') {
      return this.extractFromWebPChunks(imageBuffer);
    }

    throw new Error('Not a PNG or WebP image');
  }

  /**
   * Extract from PNG custom chunks
   */
  private extractFromPNGChunks(imageBuffer: Buffer): ExtractionResult {
    // Validate PNG signature
    if (imageBuffer.length < 8 || !imageBuffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) {
      throw new Error('Invalid PNG signature');
    }

    let offset = 8; // Skip PNG signature
    let manifest: C2PAManifest | null = null;
    let proofUri: string | null = null;
    let chunksFound = 0;

    logger.info('Starting PNG chunk extraction');

    while (offset < imageBuffer.length) {
      if (offset + 8 > imageBuffer.length) {
        throw new Error('Invalid PNG chunk header');
      }

      const length = imageBuffer.readUInt32BE(offset);
      const type = imageBuffer.toString('ascii', offset + 4, offset + 8);
      
      // Validate chunk size
      const chunkSize = 12 + length; // length + type + data + crc
      if (offset + chunkSize > imageBuffer.length) {
        throw new Error(`Invalid chunk size for ${type}`);
      }

      const data = imageBuffer.slice(offset + 8, offset + 8 + length);

      if (type === 'c2pA') {
        try {
          const manifestData = JSON.parse(data.toString('utf8'));
          logger.info('Found c2pA chunk with manifest data');
          manifest = manifestData;
          chunksFound++;
        } catch (error) {
          logger.warn('Failed to parse PNG c2pA chunk', { error: (error as Error).message, dataSize: data.length });
        }
      } else if (type === 'crLk') {
        proofUri = data.toString('utf8');
        logger.info('Found crLk chunk with proof URI', { proofUri });
        chunksFound++;
      }

      offset += chunkSize;

      if (type === 'IEND') {
        logger.info(`Reached IEND chunk, found ${chunksFound} custom chunks`);
        break;
      }
    }

    if (!manifest && !proofUri) {
      logger.warn('No custom PNG chunks found during extraction');
      throw new Error('No custom PNG chunks found');
    }

    logger.info(`PNG chunk extraction successful: manifest=${!!manifest}, proofUri=${!!proofUri}`);

    return {
      manifest,
      proofUri,
      source: 'png-chunk',
      confidence: manifest && proofUri ? 95 : 85,
      corrupted: false
    };
  }

  /**
   * Extract from WebP chunks (RIFF container format)
   * Supports: EXIF, XMP (META), and custom C2PA chunks
   */
  private extractFromWebPChunks(imageBuffer: Buffer): ExtractionResult {
    try {
      // Validate WebP format
      if (imageBuffer.toString('ascii', 0, 4) !== 'RIFF') {
        throw new Error('Not a valid RIFF container');
      }
      
      if (imageBuffer.toString('ascii', 8, 12) !== 'WEBP') {
        throw new Error('Not a WebP file');
      }
      
      // Parse all chunks in the WebP file
      const chunks = this.parseWebPChunks(imageBuffer);
      
      // Try to extract from custom C2PA chunk first (highest fidelity)
      const c2paChunk = chunks.find(c => c.fourcc === 'C2PA');
      if (c2paChunk) {
        try {
          const c2paData = JSON.parse(c2paChunk.data.toString('utf8'));
          return {
            manifest: c2paData.manifest,
            proofUri: c2paData.manifest?.claim_generator?.proof_uri || null,
            source: 'c2pa-chunk',
            confidence: 100,
            corrupted: false
          };
        } catch (error) {
          logger.warn('Failed to parse C2PA chunk', { error });
        }
      }
      
      // Try XMP (META) chunk next
      const metaChunk = chunks.find(c => c.fourcc === 'META');
      if (metaChunk) {
        try {
          const xmpData = metaChunk.data.toString('utf8');
          const proofUri = this.extractProofUriFromXMP(xmpData);
          const manifest = this.extractManifestFromXMP(xmpData);
          
          if (proofUri || manifest) {
            return {
              manifest,
              proofUri,
              source: 'xmp-chunk',
              confidence: 90,
              corrupted: false
            };
          }
        } catch (error) {
          logger.warn('Failed to parse XMP chunk', { error });
        }
      }
      
      // Try EXIF chunk as fallback
      const exifChunk = chunks.find(c => c.fourcc === 'EXIF');
      if (exifChunk) {
        try {
          const exifData = exifChunk.data.toString('utf8');
          const proofMatch = exifData.match(/CredLink:(https:\/\/[^\s]+)/);
          
          if (proofMatch) {
            return {
              manifest: null,
              proofUri: proofMatch[1],
              source: 'exif-chunk',
              confidence: 70,
              corrupted: false
            };
          }
        } catch (error) {
          logger.warn('Failed to parse EXIF chunk', { error });
        }
      }
      
      // No C2PA data found
      return {
        manifest: null,
        proofUri: null,
        source: 'none',
        confidence: 0,
        corrupted: false
      };
    } catch (error: any) {
      logger.error('WebP chunk extraction failed', { error: error.message });
      throw new ExtractionError('WebP extraction failed', 'WEBP_EXTRACTION_FAILED');
    }
  }

  /**
   * Parse WebP RIFF chunks
   */
  private parseWebPChunks(buffer: Buffer): Array<{fourcc: string; data: Buffer}> {
    const chunks: Array<{fourcc: string; data: Buffer}> = [];
    let offset = 12; // Skip 'RIFF' header (4) + size (4) + 'WEBP' (4)
    
    while (offset < buffer.length - 8) {
      // Read chunk FourCC (4 bytes)
      const fourcc = buffer.toString('ascii', offset, offset + 4);
      
      // Read chunk size (4 bytes, little-endian)
      const chunkSize = buffer.readUInt32LE(offset + 4);
      
      // Read chunk data
      const data = buffer.slice(offset + 8, offset + 8 + chunkSize);
      
      chunks.push({ fourcc, data });
      
      // Move to next chunk (chunks are padded to even size)
      const paddedSize = (chunkSize + 1) & ~1;
      offset += 8 + paddedSize;
    }
    
    logger.debug('Parsed WebP chunks', {
      chunkCount: chunks.length,
      chunkTypes: chunks.map(c => c.fourcc)
    });
    
    return chunks;
  }

  /**
   * Extract proof URI from XMP data
   */
  private extractProofUriFromXMP(xmpData: string): string | null {
    try {
      // Look for c2pa:ProofURI tag
      const uriMatch = xmpData.match(/<c2pa:ProofURI>(https:\/\/[^<]+)<\/c2pa:ProofURI>/);
      return uriMatch ? uriMatch[1] : null;
    } catch {
      return null;
    }
  }

  /**
   * Extract manifest from XMP data
   */
  private extractManifestFromXMP(xmpData: string): any | null {
    try {
      // Extract basic manifest data from XMP
      const claimGenMatch = xmpData.match(/<c2pa:ClaimGenerator>([^<]+)<\/c2pa:ClaimGenerator>/);
      const versionMatch = xmpData.match(/<c2pa:ClaimGeneratorVersion>([^<]+)<\/c2pa:ClaimGeneratorVersion>/);
      const timestampMatch = xmpData.match(/<c2pa:Timestamp>([^<]+)<\/c2pa:Timestamp>/);
      
      if (claimGenMatch) {
        return {
          claim_generator: {
            name: claimGenMatch[1],
            version: versionMatch ? versionMatch[1] : '1.0'
          },
          timestamp: timestampMatch ? timestampMatch[1] : new Date().toISOString()
        };
      }
      
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Attempt partial/corrupted data recovery
   */
  private async extractPartial(imageBuffer: Buffer): Promise<ExtractionResult> {
    try {
      // Try to extract at least the proof URI from any metadata
      const metadata = await sharp(imageBuffer).metadata();
      
      // Search all metadata fields for CredLink patterns
      const metadataStr = JSON.stringify(metadata);
      const uriMatch = metadataStr.match(/https:\/\/proofs\.credlink\.com\/[a-f0-9-]+/);
      
      if (uriMatch) {
        return {
          manifest: null,
          proofUri: uriMatch[0],
          source: 'partial',
          confidence: 50,
          corrupted: true
        };
      }
    } catch (error) {
      // Ignore
    }

    throw new Error('No partial data found');
  }

  /**
   * Parse JPEG segments
   */
  private parseJPEGSegments(buffer: Buffer): Array<{ marker: number; data: Buffer }> {
    const segments: Array<{ marker: number; data: Buffer }> = [];
    let offset = 0;

    // SOI
    if (buffer.readUInt16BE(offset) === 0xFFD8) {
      offset += 2;
    }

    while (offset < buffer.length - 1) {
      const marker = buffer.readUInt16BE(offset);

      if (marker === 0xFFD9 || marker === 0xFFDA) {
        break;
      }

      if ((marker & 0xFF00) === 0xFF00) {
        offset += 2;

        if (marker >= 0xFFD0 && marker <= 0xFFD7) {
          continue;
        }

        const length = buffer.readUInt16BE(offset);
        const data = buffer.slice(offset, offset + length);
        offset += length;

        segments.push({ marker, data });
      } else {
        break;
      }
    }

    return segments;
  }

  /**
   * Detect image format
   */
  private detectImageFormat(buffer: Buffer): string {
    const signature = buffer.toString('hex', 0, 12);

    if (signature.startsWith('ffd8ff')) return 'image/jpeg';
    if (signature.startsWith('89504e470d0a1a0a')) return 'image/png';
    if (signature.startsWith('52494646') && buffer.toString('ascii', 8, 12) === 'WEBP') {
      return 'image/webp';
    }

    throw new ExtractionError('Unknown image format', 'UNKNOWN_FORMAT');
  }

  /**
   * Validate proof URI format and security
   */
  private isValidProofUri(uri: string): boolean {
    try {
      // Must be a valid URL
      const url = new URL(uri);

      // Must use HTTPS (security requirement)
      if (url.protocol !== 'https:') {
        return false;
      }

      // Must have a valid hostname (no localhost, IP addresses for security)
      if (url.hostname === 'localhost' ||
          url.hostname === '127.0.0.1' ||
          url.hostname.startsWith('192.168.') ||
          url.hostname.startsWith('10.') ||
          url.hostname.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/)) {
        return false;
      }

      // Must have a proper domain
      if (!url.hostname.includes('.')) {
        return false;
      }

      // Must not be too long (prevent DoS)
      if (uri.length > 2000) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Legacy functions for backward compatibility
 */
export async function extractManifest(imageBuffer: Buffer): Promise<C2PAManifest | null> {
  try {
    const extractor = new MetadataExtractor();
    const result = await extractor.extract(imageBuffer);
    return result.manifest;
  } catch (error) {
    logger.error('Failed to extract manifest', { error });
    return null;
  }
}

export async function extractProofUri(imageBuffer: Buffer): Promise<string | null> {
  try {
    const extractor = new MetadataExtractor();
    const result = await extractor.extract(imageBuffer);
    return result.proofUri;
  } catch (error) {
    logger.error('Failed to extract proof URI', { error });
    return null;
  }
}
