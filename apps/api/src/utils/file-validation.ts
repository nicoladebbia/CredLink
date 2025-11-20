import { logger } from './logger';

/**
 * 🔥 CRITICAL SECURITY FIX: File validation with magic number checks
 * Prevents malicious file uploads with fake extensions
 */

export interface FileValidationResult {
  valid: boolean;
  mimeType: string;
  extension: string;
  errors: string[];
}

export class FileValidator {
  private static readonly MAGIC_NUMBERS: Record<string, { signature: number[], mimeType: string, extension: string }> = {
    // JPEG images
    'jpeg': {
      signature: [0xFF, 0xD8, 0xFF],
      mimeType: 'image/jpeg',
      extension: 'jpg'
    },
    // PNG images
    'png': {
      signature: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
      mimeType: 'image/png',
      extension: 'png'
    },
    // GIF images
    'gif': {
      signature: [0x47, 0x49, 0x46, 0x38],
      mimeType: 'image/gif',
      extension: 'gif'
    },
    // WebP images
    'webp': {
      signature: [0x52, 0x49, 0x46, 0x46], // RIFF
      mimeType: 'image/webp',
      extension: 'webp'
    },
    // TIFF images
    'tiff': {
      signature: [0x49, 0x49, 0x2A, 0x00], // Little-endian TIFF
      mimeType: 'image/tiff',
      extension: 'tiff'
    },
    'tiff_be': {
      signature: [0x4D, 0x4D, 0x00, 0x2A], // Big-endian TIFF
      mimeType: 'image/tiff',
      extension: 'tiff'
    },
    // BMP images
    'bmp': {
      signature: [0x42, 0x4D],
      mimeType: 'image/bmp',
      extension: 'bmp'
    }
  };

  /**
   * Validate file buffer against magic numbers
   */
  static validateFile(buffer: Buffer, expectedExtension?: string): FileValidationResult {
    const errors: string[] = [];
    
    if (!buffer || buffer.length < 4) {
      errors.push('File is too small to be valid');
      return { valid: false, mimeType: '', extension: '', errors };
    }

    // Check magic numbers
    const detectedType = this.detectFileType(buffer);
    
    if (!detectedType) {
      errors.push('File type not recognized or unsupported');
      return { valid: false, mimeType: '', extension: '', errors };
    }

    // If extension provided, verify it matches the detected type
    if (expectedExtension) {
      const normalizedExpected = expectedExtension.toLowerCase().replace('.', '');
      const normalizedDetected = detectedType.extension.toLowerCase();
      
      if (normalizedExpected !== normalizedDetected) {
        errors.push(`File extension ${expectedExtension} does not match actual file type ${detectedType.mimeType}`);
        
        // Allow certain common variations (e.g., jpeg vs jpg)
        if (!((normalizedExpected === 'jpg' && normalizedDetected === 'jpg') ||
              (normalizedExpected === 'jpeg' && normalizedDetected === 'jpg'))) {
          return { valid: false, mimeType: detectedType.mimeType, extension: detectedType.extension, errors };
        }
      }
    }

    // Additional checks for specific formats
    this.performAdditionalValidation(buffer, detectedType, errors);

    return {
      valid: errors.length === 0,
      mimeType: detectedType.mimeType,
      extension: detectedType.extension,
      errors
    };
  }

  /**
   * Detect file type from magic numbers
   */
  private static detectFileType(buffer: Buffer): { mimeType: string, extension: string } | null {
    for (const [type, info] of Object.entries(this.MAGIC_NUMBERS)) {
      if (this.matchesSignature(buffer, info.signature)) {
        // Special check for WebP (RIFF container)
        if (type === 'webp') {
          // Verify it's actually WebP by checking for "WEBP" at offset 8
          if (buffer.length >= 12) {
            const webpSignature = buffer.slice(8, 12);
            if (webpSignature.toString('ascii') === 'WEBP') {
              return { mimeType: info.mimeType, extension: info.extension };
            }
          }
          continue;
        }
        
        return { mimeType: info.mimeType, extension: info.extension };
      }
    }
    
    return null;
  }

  /**
   * Check if buffer matches signature
   */
  private static matchesSignature(buffer: Buffer, signature: number[]): boolean {
    if (buffer.length < signature.length) {
      return false;
    }
    
    for (let i = 0; i < signature.length; i++) {
      if (buffer[i] !== signature[i]) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Additional format-specific validation
   */
  private static performAdditionalValidation(buffer: Buffer, fileType: { mimeType: string, extension: string }, errors: string[]): void {
    switch (fileType.mimeType) {
      case 'image/jpeg':
        this.validateJPEG(buffer, errors);
        break;
      case 'image/png':
        this.validatePNG(buffer, errors);
        break;
      case 'image/webp':
        this.validateWebP(buffer, errors);
        break;
    }
  }

  /**
   * JPEG-specific validation
   */
  private static validateJPEG(buffer: Buffer, errors: string[]): void {
    // Check for JPEG end marker
    const hasEndMarker = buffer.includes(Buffer.from([0xFF, 0xD9]));
    if (!hasEndMarker) {
      errors.push('JPEG file appears to be truncated or corrupted');
    }
  }

  /**
   * PNG-specific validation
   */
  private static validatePNG(buffer: Buffer, errors: string[]): void {
    // Check for PNG IEND chunk
    const iendChunk = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82]);
    const hasIEND = buffer.includes(iendChunk);
    if (!hasIEND) {
      errors.push('PNG file appears to be truncated or corrupted');
    }
  }

  /**
   * WebP-specific validation
   */
  private static validateWebP(buffer: Buffer, errors: string[]): void {
    if (buffer.length < 20) {
      errors.push('WebP file is too small');
      return;
    }
    
    // Check VP8/VP8L/VP8X chunk signature
    const chunkSignature = buffer.slice(12, 16).toString('ascii');
    const validSignatures = ['VP8 ', 'VP8L', 'VP8X'];
    
    if (!validSignatures.includes(chunkSignature)) {
      errors.push('Invalid WebP format signature');
    }
  }

  /**
   * Get allowed MIME types
   */
  static getAllowedMimeTypes(): string[] {
    return Object.values(this.MAGIC_NUMBERS)
      .map(info => info.mimeType)
      .filter((value, index, self) => self.indexOf(value) === index);
  }

  /**
   * Get allowed extensions
   */
  static getAllowedExtensions(): string[] {
    return Object.values(this.MAGIC_NUMBERS)
      .map(info => info.extension)
      .filter((value, index, self) => self.indexOf(value) === index);
  }
}

/**
 * Middleware function for file validation
 */
export function validateUploadedFile(buffer: Buffer, expectedExtension?: string): FileValidationResult {
  return FileValidator.validateFile(buffer, expectedExtension);
}
