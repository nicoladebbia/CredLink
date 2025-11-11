import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import sharp from 'sharp';

export interface ManifestOptions {
  title?: string;
  creator?: string;
  timestamp: string;
  imageHash: string;
  imageBuffer?: Buffer;
  format?: string;
  mimeType?: string;
  customAssertions?: any[];
}

export interface C2PAManifest {
  claim_generator: {
    $id: string;
    name: string;
    version: string;
    timestamp: string;
  };
  claim_data: Array<{
    label: string;
    data: any;
  }>;
  assertions: Assertion[];
  ingredient: {
    recipe: any[];
    ingredient: any[];
  };
}

export interface Assertion {
  label: string;
  data: any;
}

export interface ImageDimensions {
  width: number;
  height: number;
}

export class ManifestBuilder {
  async build(options: ManifestOptions): Promise<C2PAManifest> {
    const manifest: C2PAManifest = {
      claim_generator: {
        $id: `urn:uuid:${uuidv4()}`,
        name: 'CredLink Signing Service',
        version: '1.0.0',
        timestamp: options.timestamp
      },
      claim_data: [
        {
          label: 'stds.schema-org.CreativeWork',
          data: {
            '@context': 'https://schema.org',
            '@type': 'CreativeWork',
            name: options.title || 'Signed Image',
            author: {
              '@type': 'Organization',
              name: options.creator || 'CredLink'
            },
            dateCreated: options.timestamp,
            identifier: options.imageHash
          }
        },
        {
          label: 'c2pa.actions',
          data: {
            actions: [
              {
                action: 'c2pa.created',
                when: options.timestamp,
                digitalSourceType: 'https://ns.adobe.com/c2pa/created/digital-source/unknown'
              }
            ]
          }
        },
        {
          label: 'c2pa.hash',
          data: {
            alg: 'sha256',
            value: options.imageHash.split(':')[1] || options.imageHash
          }
        }
      ],
      assertions: await this.buildAssertions(options),
      ingredient: {
        recipe: [],
        ingredient: []
      }
    };

    // Add custom assertions if provided
    if (options.customAssertions && options.customAssertions.length > 0) {
      manifest.assertions.push(...options.customAssertions);
    }

    // Add technical metadata
    manifest.assertions.push({
      label: 'credlink.technical',
      data: {
        serviceVersion: process.env.SERVICE_VERSION || '1.0.0',
        nodeVersion: process.version,
        platform: process.platform,
        signingAlgorithm: 'RSA-SHA256',
        manifestFormat: 'CBOR',
        embeddingStrategy: 'JUMBF'
      }
    });

    return manifest;
  }

  private async buildAssertions(options: ManifestOptions): Promise<Assertion[]> {
    const assertions: Assertion[] = [];

    // Add content type assertion
    assertions.push({
      label: 'c2pa.content-type',
      data: {
        format: options.format || 'image/jpeg',
        mime_type: options.mimeType || 'image/jpeg'
      }
    });

    // Add dimensions assertion if image data available
    if (options.imageBuffer) {
      try {
        const dimensions = await this.getImageDimensions(options.imageBuffer);
        assertions.push({
          label: 'c2pa.dimensions',
          data: {
            width: dimensions.width,
            height: dimensions.height,
            unit: 'pixels'
          }
        });
      } catch (error) {
        console.warn('Failed to extract image dimensions:', error);
      }
    }

    // Add EXIF data assertion if present
    if (options.imageBuffer) {
      try {
        const exifData = await this.extractExifData(options.imageBuffer);
        if (exifData && Object.keys(exifData).length > 0) {
          assertions.push({
            label: 'c2pa.exif',
            data: exifData
          });
        }
      } catch (error) {
        console.warn('Failed to extract EXIF data:', error);
      }
    }

    return assertions;
  }

  private async getImageDimensions(buffer: Buffer): Promise<ImageDimensions> {
    const metadata = await sharp(buffer).metadata();
    return {
      width: metadata.width || 0,
      height: metadata.height || 0
    };
  }

  private async extractExifData(buffer: Buffer): Promise<any> {
    const metadata = await sharp(buffer).metadata();
    
    if (metadata.exif) {
      // EXIF data is a Buffer, we need to parse it
      // For now, return empty object as placeholder
      // In real implementation, use exif-parser or similar
      return {};
    }
    
    return {};
  }
}
