/**
 * Perceptual Hash Utility
 * Simple image hashing for duplicate detection
 */

import sharp from 'sharp';
import * as crypto from 'crypto';

export class PerceptualHash {
  /**
   * Generate perceptual hash for an image
   */
  static async generate(imageBuffer: Buffer): Promise<string> {
    try {
      // Resize to 8x8 grayscale
      const resized = await sharp(imageBuffer)
        .resize(8, 8, { fit: 'fill' })
        .grayscale()
        .raw()
        .toBuffer();

      // Calculate average pixel value
      let sum = 0;
      for (const pixel of resized) {
        sum += pixel;
      }
      const average = sum / resized.length;

      // Generate hash based on pixels above/below average
      let hash = '';
      for (const pixel of resized) {
        hash += pixel >= average ? '1' : '0';
      }

      // Convert binary to hex
      return BigInt('0b' + hash).toString(16).padStart(16, '0');
    } catch (error) {
      // Fallback to SHA256 if perceptual hash fails
      return crypto.createHash('sha256').update(imageBuffer).digest('hex').substring(0, 16);
    }
  }
}
