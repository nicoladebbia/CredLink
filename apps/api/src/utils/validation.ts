import { AppError } from '../middleware/error-handler';
import { securityMonitor, SecurityEventType } from '@credlink/security-monitor';

/**
 * Magic byte patterns for valid image formats
 */
const VALID_IMAGE_MAGIC_BYTES = {
  'image/jpeg': [0xFF, 0xD8, 0xFF],
  'image/png': [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
  'image/webp': [0x52, 0x49, 0x46, 0x46], // RIFF
  'image/gif': [0x47, 0x49, 0x46, 0x38], // GIF8
  'image/bmp': [0x42, 0x4D], // BM
  'image/tiff': [0x49, 0x49, 0x2A, 0x00], // II*\0
};

/**
 * HARSH: Validate image magic bytes and detect malicious files
 * 
 * This function prevents dangerous file uploads by checking the actual
 * binary magic bytes against the declared mimetype.
 * 
 * @param buffer - File buffer to validate
 * @param mimetype - Declared mimetype
 * @param context - Request context for security monitoring
 * @throws AppError if validation fails
 */
export function validateImageMagicBytes(
  buffer: Buffer, 
  mimetype: string, 
  context: { ip: string; originalname: string }
): void {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8) {
    securityMonitor.recordEvent({
      type: SecurityEventType.MALICIOUS_UPLOAD,
      severity: 'high',
      source: { ip: context.ip },
      details: {
        reason: 'invalid_buffer',
        filename: context.originalname,
        size: buffer?.length || 0
      }
    });
    throw new AppError(400, 'Invalid file format');
  }

  const expectedBytes = VALID_IMAGE_MAGIC_BYTES[mimetype as keyof typeof VALID_IMAGE_MAGIC_BYTES];
  if (!expectedBytes) {
    securityMonitor.recordEvent({
      type: SecurityEventType.MALICIOUS_UPLOAD,
      severity: 'medium',
      source: { ip: context.ip },
      details: {
        reason: 'unsupported_mimetype',
        mimetype,
        filename: context.originalname
      }
    });
    throw new AppError(400, `Unsupported file type: ${mimetype}`);
  }

  // Check magic bytes match
  for (let i = 0; i < expectedBytes.length; i++) {
    if (buffer[i] !== expectedBytes[i]) {
      securityMonitor.recordEvent({
        type: SecurityEventType.MALICIOUS_UPLOAD,
        severity: 'high',
        source: { ip: context.ip },
        details: {
          reason: 'magic_bytes_mismatch',
          expected: expectedBytes.map(b => `0x${b.toString(16).padStart(2, '0')}`).join(' '),
          actual: Array.from(buffer.slice(0, expectedBytes.length))
            .map(b => `0x${b.toString(16).padStart(2, '0')}`).join(' '),
          filename: context.originalname
        }
      });
      throw new AppError(400, 'File does not match declared format');
    }
  }
}

/**
 * Validate file size against maximum allowed
 * 
 * @param size - File size in bytes
 * @param maxSize - Maximum allowed size in bytes
 * @param context - Request context for security monitoring
 * @throws AppError if file is too large
 */
export function validateFileSize(
  size: number,
  maxSize: number,
  context: { ip: string; originalname: string }
): void {
  if (size > maxSize) {
    securityMonitor.recordEvent({
      type: SecurityEventType.MALICIOUS_UPLOAD,
      severity: 'medium',
      source: { ip: context.ip },
      details: {
        reason: 'file_too_large',
        size,
        maxSize,
        filename: context.originalname
      }
    });
    throw new AppError(413, `File too large. Maximum size is ${Math.round(maxSize / 1024 / 1024)}MB`);
  }
}

/**
 * Validate filename for security
 * 
 * @param filename - Original filename
 * @param context - Request context for security monitoring
 * @throws AppError if filename is dangerous
 */
export function validateFilename(
  filename: string,
  context: { ip: string }
): void {
  // Check for dangerous filename patterns
  const dangerousPatterns = [
    /\.\./,  // Directory traversal
    /[<>:"\\|?*]/,  // Invalid characters
    /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i,  // Reserved Windows names
    /^\./,  // Hidden files
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(filename)) {
      securityMonitor.recordEvent({
        type: SecurityEventType.MALICIOUS_UPLOAD,
        severity: 'medium',
        source: { ip: context.ip },
        details: {
          reason: 'dangerous_filename',
          filename,
          pattern: pattern.toString()
        }
      });
      throw new AppError(400, 'Dangerous filename detected');
    }
  }

  // Check filename length
  if (filename.length > 255) {
    securityMonitor.recordEvent({
      type: SecurityEventType.MALICIOUS_UPLOAD,
      severity: 'low',
      source: { ip: context.ip },
      details: {
        reason: 'filename_too_long',
        filename,
        length: filename.length
      }
    });
    throw new AppError(400, 'Filename too long');
  }
}

/**
 * Validate mimetype is in allowed list
 * 
 * @param mimetype - File mimetype
 * @param allowedMimetypes - List of allowed mimetypes
 * @param context - Request context for security monitoring
 * @throws AppError if mimetype is not allowed
 */
export function validateMimetype(
  mimetype: string,
  allowedMimetypes: string[],
  context: { ip: string; originalname: string }
): void {
  if (!allowedMimetypes.includes(mimetype)) {
    securityMonitor.recordEvent({
      type: SecurityEventType.MALICIOUS_UPLOAD,
      severity: 'medium',
      source: { ip: context.ip },
      details: {
        reason: 'invalid_mimetype',
        mimetype,
        filename: context.originalname
      }
    });
    throw new AppError(400, `Unsupported file type: ${mimetype}. Only images are allowed.`);
  }
}

/**
 * Comprehensive file validation for uploads
 * 
 * @param buffer - File buffer
 * @param mimetype - Declared mimetype
 * @param originalname - Original filename
 * @param size - File size in bytes
 * @param maxSize - Maximum allowed size
 * @param context - Request context
 */
export function validateFileUpload(
  buffer: Buffer,
  mimetype: string,
  originalname: string,
  size: number,
  maxSize: number,
  context: { ip: string }
): void {
  const fileContext = { ip: context.ip, originalname };

  // Validate filename
  validateFilename(originalname, context);

  // Validate file size
  validateFileSize(size, maxSize, fileContext);

  // Validate mimetype
  const allowedMimetypes = Object.keys(VALID_IMAGE_MAGIC_BYTES);
  validateMimetype(mimetype, allowedMimetypes, fileContext);

  // Validate magic bytes
  validateImageMagicBytes(buffer, mimetype, fileContext);
}
