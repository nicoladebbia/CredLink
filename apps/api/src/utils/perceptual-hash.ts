/**
 * Perceptual Hash Implementation
 * 
 * Implements pHash (perceptual hash) algorithm for image similarity detection
 * Used for duplicate image detection and content deduplication
 */

import sharp from 'sharp';
import * as crypto from 'crypto';

export class PerceptualHash {
  /**
   * Generate a perceptual hash for an image buffer
   * @param imageBuffer - Image buffer to hash
   * @returns 64-bit hex string representing the perceptual hash
   */
  static async generate(imageBuffer: Buffer): Promise<string> {
    try {
      // Step 1: Convert to grayscale and resize to 32x32
      const grayscaleBuffer = await sharp(imageBuffer)
        .resize(32, 32, { fit: 'fill' })
        .greyscale()
        .raw()
        .toBuffer()
        .catch((error) => {
          // If Sharp fails, create a simple hash based on buffer properties
          console.warn('Sharp processing failed, using fallback hash:', error.message);
          return this.generateFallbackHash(imageBuffer);
        });

      // If we have a valid grayscale buffer, use the normal algorithm
      if (Buffer.isBuffer(grayscaleBuffer) && grayscaleBuffer.length > 0) {
        const hash = await this.averageHash(grayscaleBuffer);
        return hash;
      } else {
        // Fallback to simple hash
        return this.generateFallbackHash(imageBuffer);
      }
    } catch (error: any) {
      throw new Error(`Perceptual hash generation failed: ${error.message}`);
    }
  }

  /**
   * Fallback hash generation when Sharp fails
   */
  private static async generateFallbackHash(imageBuffer: Buffer): Promise<string> {
    // Use content hash and buffer properties as fallback
    const contentHash = crypto.createHash('md5').update(imageBuffer).digest('hex');
    const sizeHash = imageBuffer.length.toString(16).padStart(8, '0');
    
    // Combine to create a 16-character hex string
    // Take first 8 chars of MD5 + 8 chars of size hash
    return (contentHash.substring(0, 8) + sizeHash.substring(0, 8));
  }

  /**
   * Average hash implementation (simplified version of pHash)
   * @param grayscaleBuffer - 32x32 grayscale image buffer
   * @returns 64-bit hex hash
   */
  private static async averageHash(grayscaleBuffer: Buffer): Promise<string> {
    // Calculate average pixel value
    let sum = 0;
    for (let i = 0; i < grayscaleBuffer.length; i++) {
      sum += grayscaleBuffer[i];
    }
    const average = sum / grayscaleBuffer.length;

    // If all pixels are the same (solid color), use the pixel value itself as hash
    const allSame = grayscaleBuffer.every(pixel => pixel === grayscaleBuffer[0]);
    if (allSame) {
      // Create a hash based on the pixel value and buffer properties
      const pixelValue = grayscaleBuffer[0];
      const hash = BigInt(pixelValue) * BigInt(grayscaleBuffer.length);
      return hash.toString(16).padStart(16, '0').substring(0, 16);
    }

    // Generate hash based on pixels above/below average
    // Use all 1024 pixels (32x32) but compress to 64 bits
    let hash = 0n;
    const step = Math.floor(grayscaleBuffer.length / 64);
    
    for (let i = 0; i < 64; i++) {
      const pixelIndex = i * step;
      if (pixelIndex < grayscaleBuffer.length && grayscaleBuffer[pixelIndex] >= average) {
        hash |= (1n << BigInt(63 - i));
      }
    }

    // Convert to hex string
    return hash.toString(16).padStart(16, '0');
  }

  /**
   * Compare two perceptual hashes and return similarity percentage
   * @param hash1 - First hash
   * @param hash2 - Second hash
   * @returns Similarity percentage (0-100)
   */
  static compare(hash1: string, hash2: string): number {
    const num1 = BigInt('0x' + hash1);
    const num2 = BigInt('0x' + hash2);
    
    // XOR to find differences
    const diff = num1 ^ num2;
    
    // Count set bits (Hamming distance)
    const hammingDistance = this.countSetBits(diff);
    
    // Calculate similarity (64 - distance) / 64 * 100
    const similarity = ((64 - hammingDistance) / 64) * 100;
    
    return Math.max(0, Math.min(100, similarity));
  }

  /**
   * Count set bits in a BigInt
   * @param n - Number to count bits in
   * @returns Number of set bits
   */
  private static countSetBits(n: bigint): number {
    let count = 0;
    while (n > 0n) {
      count += Number(n & 1n);
      n >>= 1n;
    }
    return count;
  }

  /**
   * Check if two images are likely duplicates
   * @param hash1 - First hash
   * @param hash2 - Second hash
   * @param threshold - Similarity threshold (default: 95%)
   * @returns True if likely duplicates
   */
  static areDuplicates(hash1: string, hash2: string, threshold: number = 95): boolean {
    return this.compare(hash1, hash2) >= threshold;
  }
}
