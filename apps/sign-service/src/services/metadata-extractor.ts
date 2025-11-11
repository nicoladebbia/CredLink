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

export class ExtractionError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = 'ExtractionError';
  }
}

export interface ExtractionResult {
  manifest: C2PAManifest | null;
  proofUri: string | null;
  source: 'jumbf' | 'exif' | 'xmp' | 'png-chunk' | 'webp-chunk' | 'partial' | 'none';
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

      // Try to extract proof URI from various EXIF fields
      let proofUri: string | null = null;
      const exif = metadata.exif as any;
      
      // Check ImageDescription
      if (exif.ImageDescription && typeof exif.ImageDescription === 'string') {
        if (exif.ImageDescription.startsWith('CredLink:')) {
          proofUri = exif.ImageDescription.replace('CredLink:', '');
        }
      }
      
      // Check IFD0.ImageDescription
      if (!proofUri && exif.IFD0?.ImageDescription) {
        const desc = exif.IFD0.ImageDescription;
        if (typeof desc === 'string' && desc.startsWith('CredLink:')) {
          proofUri = desc.replace('CredLink:', '');
        }
      }
      
      // Check Copyright field as fallback
      if (!proofUri && exif.Copyright) {
        const match = exif.Copyright.match(/https:\/\/proofs\.credlink\.com\/[a-f0-9-]+/);
        if (match) {
          proofUri = match[0];
        }
      }

      if (!proofUri) {
        throw new Error('No CredLink proof URI found in EXIF');
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
    let offset = 8; // Skip PNG signature
    let manifest: C2PAManifest | null = null;
    let proofUri: string | null = null;

    while (offset < imageBuffer.length) {
      const length = imageBuffer.readUInt32BE(offset);
      const type = imageBuffer.toString('ascii', offset + 4, offset + 8);
      const data = imageBuffer.slice(offset + 8, offset + 8 + length);

      if (type === 'c2pA') {
        try {
          manifest = JSON.parse(data.toString('utf8'));
        } catch (error) {
          logger.warn('Failed to parse PNG c2pA chunk');
        }
      } else if (type === 'crLk') {
        proofUri = data.toString('utf8');
      }

      offset += 12 + length; // length + type + data + crc

      if (type === 'IEND') break;
    }

    if (!manifest && !proofUri) {
      throw new Error('No custom PNG chunks found');
    }

    return {
      manifest,
      proofUri,
      source: 'png-chunk',
      confidence: 90,
      corrupted: false
    };
  }

  /**
   * Extract from WebP chunks (simplified)
   */
  private extractFromWebPChunks(imageBuffer: Buffer): ExtractionResult {
    // WebP extraction is complex - for now, fallback to EXIF
    throw new Error('WebP chunk extraction not implemented');
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
