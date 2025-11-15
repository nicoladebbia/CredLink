import { XMLParser } from 'fast-xml-parser';
import * as cbor from 'cbor';
import sharp from 'sharp';
import { C2PAManifest } from './manifest-builder';
import { logger } from '../utils/logger';

/**
 * Extraction result with detailed metadata
 */
export interface AdvancedExtractionResult {
  success: boolean;
  manifest?: C2PAManifest;
  proofUri?: string;
  source: ExtractionSource;
  confidence: number;
  metadata: ExtractionMetadata;
  errors: string[];
}

export type ExtractionSource = 
  | 'jumbf-c2pa'
  | 'exif-primary'
  | 'exif-secondary'
  | 'xmp-packet'
  | 'png-chunk'
  | 'webp-chunk'
  | 'cbor-embedded'
  | 'partial-recovery'
  | 'none';

export interface ExtractionMetadata {
  imageFormat: string;
  imageSize: number;
  dimensions?: { width: number; height: number };
  extractionTime: number;
  methodsAttempted: string[];
  methodsSucceeded: string[];
  dataIntegrity: 'full' | 'partial' | 'corrupted' | 'none';
}

/**
 * Advanced Metadata Extractor
 * 
 * Multi-format, multi-method extraction with priority system
 * Supports: JUMBF, EXIF, XMP, PNG chunks, WebP chunks, CBOR
 */
export class AdvancedExtractor {
  private xmlParser: XMLParser;
  
  constructor() {
    this.xmlParser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      parseAttributeValue: true
    });
  }

  /**
   * Extract C2PA manifest from image using all available methods
   */
  async extract(imageBuffer: Buffer): Promise<AdvancedExtractionResult> {
    const startTime = Date.now();
    const methodsAttempted: string[] = [];
    const methodsSucceeded: string[] = [];
    const errors: string[] = [];

    try {
      // Get image metadata
      const metadata = await sharp(imageBuffer).metadata();
      const imageFormat = metadata.format || 'unknown';
      const dimensions = metadata.width && metadata.height 
        ? { width: metadata.width, height: metadata.height }
        : undefined;

      // Priority 1: JUMBF C2PA container (ISO standard)
      methodsAttempted.push('jumbf-c2pa');
      const jumbfResult = await this.extractFromJUMBF(imageBuffer);
      if (jumbfResult.success) {
        methodsSucceeded.push('jumbf-c2pa');
        return {
          ...jumbfResult,
          source: 'jumbf-c2pa',
          confidence: 100,
          metadata: {
            imageFormat,
            imageSize: imageBuffer.length,
            dimensions,
            extractionTime: Date.now() - startTime,
            methodsAttempted,
            methodsSucceeded,
            dataIntegrity: 'full'
          },
          errors
        };
      } else {
        errors.push(jumbfResult.error || 'JUMBF extraction failed');
      }

      // Priority 2: EXIF primary fields
      methodsAttempted.push('exif-primary');
      const exifResult = await this.extractFromEXIF(imageBuffer);
      if (exifResult.success) {
        methodsSucceeded.push('exif-primary');
        return {
          ...exifResult,
          source: 'exif-primary',
          confidence: 85,
          metadata: {
            imageFormat,
            imageSize: imageBuffer.length,
            dimensions,
            extractionTime: Date.now() - startTime,
            methodsAttempted,
            methodsSucceeded,
            dataIntegrity: 'full'
          },
          errors
        };
      } else {
        errors.push(exifResult.error || 'EXIF extraction failed');
      }

      // Priority 3: XMP packet
      methodsAttempted.push('xmp-packet');
      const xmpResult = await this.extractFromXMP(imageBuffer);
      if (xmpResult.success) {
        methodsSucceeded.push('xmp-packet');
        return {
          ...xmpResult,
          source: 'xmp-packet',
          confidence: 80,
          metadata: {
            imageFormat,
            imageSize: imageBuffer.length,
            dimensions,
            extractionTime: Date.now() - startTime,
            methodsAttempted,
            methodsSucceeded,
            dataIntegrity: 'full'
          },
          errors
        };
      } else {
        errors.push(xmpResult.error || 'XMP extraction failed');
      }

      // Priority 4: Format-specific chunks
      if (imageFormat === 'png') {
        methodsAttempted.push('png-chunk');
        const pngResult = await this.extractFromPNGChunk(imageBuffer);
        if (pngResult.success) {
          methodsSucceeded.push('png-chunk');
          return {
            ...pngResult,
            source: 'png-chunk',
            confidence: 90,
            metadata: {
              imageFormat,
              imageSize: imageBuffer.length,
              dimensions,
              extractionTime: Date.now() - startTime,
              methodsAttempted,
              methodsSucceeded,
              dataIntegrity: 'full'
            },
            errors
          };
        } else {
          errors.push(pngResult.error || 'PNG chunk extraction failed');
        }
      }

      if (imageFormat === 'webp') {
        methodsAttempted.push('webp-chunk');
        const webpResult = await this.extractFromWebPChunk(imageBuffer);
        if (webpResult.success) {
          methodsSucceeded.push('webp-chunk');
          return {
            ...webpResult,
            source: 'webp-chunk',
            confidence: 85,
            metadata: {
              imageFormat,
              imageSize: imageBuffer.length,
              dimensions,
              extractionTime: Date.now() - startTime,
              methodsAttempted,
              methodsSucceeded,
              dataIntegrity: 'full'
            },
            errors
          };
        } else {
          errors.push(webpResult.error || 'WebP chunk extraction failed');
        }
      }

      // Priority 5: CBOR embedded data
      methodsAttempted.push('cbor-embedded');
      const cborResult = await this.extractFromCBOR(imageBuffer);
      if (cborResult.success) {
        methodsSucceeded.push('cbor-embedded');
        return {
          ...cborResult,
          source: 'cbor-embedded',
          confidence: 75,
          metadata: {
            imageFormat,
            imageSize: imageBuffer.length,
            dimensions,
            extractionTime: Date.now() - startTime,
            methodsAttempted,
            methodsSucceeded,
            dataIntegrity: 'full'
          },
          errors
        };
      } else {
        errors.push(cborResult.error || 'CBOR extraction failed');
      }

      // Priority 6: Partial recovery (proof URI only)
      methodsAttempted.push('partial-recovery');
      const partialResult = await this.attemptPartialRecovery(imageBuffer);
      if (partialResult.success) {
        methodsSucceeded.push('partial-recovery');
        return {
          ...partialResult,
          source: 'partial-recovery',
          confidence: 50,
          metadata: {
            imageFormat,
            imageSize: imageBuffer.length,
            dimensions,
            extractionTime: Date.now() - startTime,
            methodsAttempted,
            methodsSucceeded,
            dataIntegrity: 'partial'
          },
          errors
        };
      } else {
        errors.push(partialResult.error || 'Partial recovery failed');
      }

      // No extraction succeeded
      return {
        success: false,
        source: 'none',
        confidence: 0,
        metadata: {
          imageFormat,
          imageSize: imageBuffer.length,
          dimensions,
          extractionTime: Date.now() - startTime,
          methodsAttempted,
          methodsSucceeded,
          dataIntegrity: 'none'
        },
        errors
      };

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('Advanced extraction failed', { error: err.message });
      return {
        success: false,
        source: 'none',
        confidence: 0,
        metadata: {
          imageFormat: 'unknown',
          imageSize: imageBuffer.length,
          extractionTime: Date.now() - startTime,
          methodsAttempted,
          methodsSucceeded,
          dataIntegrity: 'none'
        },
        errors: [...errors, err.message]
      };
    }
  }

  /**
   * Extract from JUMBF C2PA container
   */
  private async extractFromJUMBF(imageBuffer: Buffer): Promise<{ success: boolean; manifest?: C2PAManifest; proofUri?: string; error?: string }> {
    try {
      // Look for JUMBF box in JPEG APP11 segment
      if (imageBuffer.readUInt16BE(0) === 0xFFD8) { // JPEG
        let offset = 2;
        while (offset < imageBuffer.length - 4) {
          const marker = imageBuffer.readUInt16BE(offset);
          
          if (marker === 0xFFEB) { // APP11 marker
            const length = imageBuffer.readUInt16BE(offset + 2);
            const segmentData = imageBuffer.slice(offset + 4, offset + 2 + length);
            
            // Check for JUMBF signature
            if (segmentData.toString('ascii', 0, 4) === 'jumb') {
              const manifestData = this.parseJUMBFBox(segmentData);
              if (manifestData) {
                return {
                  success: true,
                  manifest: manifestData.manifest,
                  proofUri: manifestData.proofUri
                };
              }
            }
          }
          
          if ((marker & 0xFF00) !== 0xFF00) break;
          const segmentLength = imageBuffer.readUInt16BE(offset + 2);
          offset += 2 + segmentLength;
        }
      }
      
      return { success: false, error: 'No JUMBF container found' };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      return { success: false, error: err.message };
    }
  }

  /**
   * Extract from EXIF metadata
   */
  private async extractFromEXIF(imageBuffer: Buffer): Promise<{ success: boolean; manifest?: C2PAManifest; proofUri?: string; error?: string }> {
    try {
      // Try Sharp first for better WebP support
      try {
        const metadata = await sharp(imageBuffer).metadata();
        if (metadata.exif) {
          const exifData = metadata.exif.toString('utf8');
          
          // Look for CredLink prefix
          const credLinkMatch = exifData.match(/CredLink:([^\x00\n]+)/);
          if (credLinkMatch) {
            return {
              success: true,
              proofUri: credLinkMatch[1],
              manifest: undefined
            };
          }
          
          // Look for proof URI pattern
          const uriMatch = exifData.match(/(https?:\/\/proofs\.credlink\.com\/[a-zA-Z0-9-]+)/);
          if (uriMatch) {
            return {
              success: true,
              proofUri: uriMatch[1],
              manifest: undefined
            };
          }
        }
      } catch (sharpError) {
        // Fall through to exif-parser
      }
      
      // Use exif-parser as fallback for JPEG
      const exifParser = require('exif-parser');
      const parser = exifParser.create(imageBuffer);
      const result = parser.parse();
      
      // Check various EXIF fields
      const tags = result.tags;
      
      // Check ImageDescription
      if (tags.ImageDescription && typeof tags.ImageDescription === 'string') {
        if (tags.ImageDescription.startsWith('CredLink:')) {
          const proofUri = tags.ImageDescription.replace('CredLink:', '');
          return {
            success: true,
            proofUri,
            manifest: undefined // Will be fetched from remote
          };
        }
      }
      
      // Check UserComment
      if (tags.UserComment) {
        const match = tags.UserComment.match(/https:\/\/proofs\.credlink\.com\/[a-f0-9-]+/);
        if (match) {
          return {
            success: true,
            proofUri: match[0],
            manifest: undefined
          };
        }
      }
      
      // Check Copyright
      if (tags.Copyright) {
        const match = tags.Copyright.match(/https:\/\/proofs\.credlink\.com\/[a-f0-9-]+/);
        if (match) {
          return {
            success: true,
            proofUri: match[0],
            manifest: undefined
          };
        }
      }
      
      return { success: false, error: 'No CredLink proof URI in EXIF' };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      return { success: false, error: err.message };
    }
  }

  /**
   * Extract from XMP packet
   */
  private async extractFromXMP(imageBuffer: Buffer): Promise<{ success: boolean; manifest?: C2PAManifest; proofUri?: string; error?: string }> {
    try {
      // Look for XMP packet markers
      const xmpStart = Buffer.from('<?xpacket begin=');
      const xmpEnd = Buffer.from('<?xpacket end=');
      
      const startIndex = imageBuffer.indexOf(xmpStart);
      if (startIndex === -1) {
        return { success: false, error: 'No XMP packet found' };
      }
      
      const endIndex = imageBuffer.indexOf(xmpEnd, startIndex);
      if (endIndex === -1) {
        return { success: false, error: 'Incomplete XMP packet' };
      }
      
      const xmpData = imageBuffer.slice(startIndex, endIndex + xmpEnd.length).toString('utf8');
      
      // Parse XMP XML (for future use)
      // const parsed = this.xmlParser.parse(xmpData);
      
      // Look for C2PA namespace
      const proofUriMatch = xmpData.match(/credlink:proofUri="([^"]+)"/);
      if (proofUriMatch) {
        return {
          success: true,
          proofUri: proofUriMatch[1],
          manifest: undefined
        };
      }
      
      // Look for embedded manifest
      const manifestMatch = xmpData.match(/c2pa:manifest="([^"]+)"/);
      if (manifestMatch) {
        try {
          const manifestJson = Buffer.from(manifestMatch[1], 'base64').toString('utf8');
          const manifest = JSON.parse(manifestJson);
          return {
            success: true,
            manifest,
            proofUri: manifest.claim_generator?.proof_uri
          };
        } catch {
          // Invalid manifest data
        }
      }
      
      return { success: false, error: 'No C2PA data in XMP' };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      return { success: false, error: err.message };
    }
  }

  /**
   * Extract from PNG custom chunk
   */
  private async extractFromPNGChunk(imageBuffer: Buffer): Promise<{ success: boolean; manifest?: C2PAManifest; proofUri?: string; error?: string }> {
    try {
      // PNG signature
      if (imageBuffer.readUInt32BE(0) !== 0x89504E47) {
        return { success: false, error: 'Not a PNG file' };
      }
      
      let offset = 8; // Skip PNG signature
      
      while (offset < imageBuffer.length) {
        const chunkLength = imageBuffer.readUInt32BE(offset);
        const chunkType = imageBuffer.toString('ascii', offset + 4, offset + 8);
        
        // Look for our custom chunks
        if (chunkType === 'c2pA' || chunkType === 'crLk') {
          const chunkData = imageBuffer.slice(offset + 8, offset + 8 + chunkLength);
          
          try {
            const data = JSON.parse(chunkData.toString('utf8'));
            return {
              success: true,
              manifest: data.manifest || data,
              proofUri: data.proofUri || data.proof_uri || data.claim_data?.uri
            };
          } catch {
            // Try as raw proof URI
            const proofUri = chunkData.toString('utf8');
            if (proofUri.startsWith('https://') || proofUri.startsWith('http://')) {
              return {
                success: true,
                proofUri,
                manifest: undefined
              };
            }
          }
        }
        
        if (chunkType === 'IEND') break;
        
        offset += 12 + chunkLength; // length + type + data + CRC
      }
      
      return { success: false, error: 'No C2PA PNG chunk found' };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      return { success: false, error: err.message };
    }
  }

  /**
   * Extract from WebP chunk
   */
  private async extractFromWebPChunk(imageBuffer: Buffer): Promise<{ success: boolean; manifest?: C2PAManifest; proofUri?: string; error?: string }> {
    try {
      // WebP signature
      if (imageBuffer.toString('ascii', 0, 4) !== 'RIFF' || 
          imageBuffer.toString('ascii', 8, 12) !== 'WEBP') {
        return { success: false, error: 'Not a WebP file' };
      }
      
      // WebP uses EXIF chunk, fall back to EXIF extraction
      return this.extractFromEXIF(imageBuffer);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      return { success: false, error: err.message };
    }
  }

  /**
   * Extract from CBOR embedded data
   */
  private async extractFromCBOR(imageBuffer: Buffer): Promise<{ success: boolean; manifest?: C2PAManifest; proofUri?: string; error?: string }> {
    try {
      // Look for CBOR magic bytes (major type 5, map)
      const cborPattern = Buffer.from([0xA0]); // Empty map marker
      
      // Search for CBOR data
      let offset = imageBuffer.indexOf(cborPattern);
      if (offset === -1) {
        return { success: false, error: 'No CBOR data found' };
      }
      
      // Try to decode CBOR from various offsets
      while (offset !== -1 && offset < imageBuffer.length - 100) {
        try {
          const decoded = cbor.decode(imageBuffer.slice(offset, offset + 10000));
          
          if (decoded && typeof decoded === 'object') {
            if (decoded.manifest) {
              return {
                success: true,
                manifest: decoded.manifest,
                proofUri: decoded.proofUri
              };
            }
            if (decoded.proofUri) {
              return {
                success: true,
                proofUri: decoded.proofUri,
                manifest: undefined
              };
            }
          }
        } catch {
          // Not valid CBOR at this offset, continue
        }
        
        offset = imageBuffer.indexOf(cborPattern, offset + 1);
      }
      
      return { success: false, error: 'No C2PA data in CBOR' };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      return { success: false, error: err.message };
    }
  }

  /**
   * Attempt partial recovery (proof URI only)
   */
  private async attemptPartialRecovery(imageBuffer: Buffer): Promise<{ success: boolean; proofUri?: string; error?: string }> {
    try {
      // Search for proof URI pattern in raw buffer
      const bufferString = imageBuffer.toString('binary');
      const match = bufferString.match(/https:\/\/proofs\.credlink\.com\/[a-f0-9-]{36}/);
      
      if (match) {
        return {
          success: true,
          proofUri: match[0]
        };
      }
      
      return { success: false, error: 'No proof URI found in buffer' };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      return { success: false, error: err.message };
    }
  }

  /**
   * Parse JUMBF box structure
   */
  private parseJUMBFBox(data: Buffer): { manifest: C2PAManifest; proofUri: string } | null {
    try {
      // Skip JUMBF header
      let offset = 4; // 'jumb'
      
      // Read box size (skip for now)
      // const boxSize = data.readUInt32BE(offset);
      offset += 8; // Skip size (4 bytes) + type (4 bytes)
      
      // Read type UUID (16 bytes)
      offset += 16;
      
      // Read label (null-terminated string)
      let labelEnd = offset;
      while (labelEnd < data.length && data[labelEnd] !== 0) {
        labelEnd++;
      }
      offset = labelEnd + 1;
      
      // Remaining data is the manifest
      const manifestData = data.slice(offset);
      const manifestJson = manifestData.toString('utf8');
      const manifest = JSON.parse(manifestJson);
      
      // Extract proof URI
      const proofUri = manifest.claim_generator?.proof_uri || '';
      
      return { manifest, proofUri };
    } catch (error) {
      return null;
    }
  }
}
