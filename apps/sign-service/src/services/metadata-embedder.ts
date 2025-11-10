import { logger } from '../utils/logger';

/**
 * Metadata Embedder Service
 * 
 * Embeds proof URI into image metadata
 * 
 * ⚠️ MOCK IMPLEMENTATION - Replace with real EXIF/XMP embedding
 */

/**
 * Embed proof URI in image metadata
 * 
 * In production: Use Sharp to add custom EXIF/XMP field
 */
export async function embedProofUri(imageBuffer: Buffer, proofUri: string): Promise<Buffer> {
  try {
    logger.debug('Embedding proof URI in image (MOCK)', { proofUri });
    
    // Mock: Just return original buffer
    // In production: Use sharp.withMetadata()
    // const result = await sharp(imageBuffer)
    //   .withMetadata({
    //     exif: {
    //       IFD0: {
    //         'credlink:proofUri': proofUri
    //       }
    //     }
    //   })
    //   .toBuffer();
    // return result;
    
    return imageBuffer;
  } catch (error) {
    logger.error('Failed to embed proof URI', { error });
    throw error;
  }
}
