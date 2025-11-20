import { resolve, normalize, join, sep } from 'path';
import { logger } from './logger';

/**
 * 🔥 CRITICAL SECURITY FIX: Path Validation Utility
 * 
 * Prevents path traversal attacks (../../../etc/passwd)
 * Validates all file system operations for security
 */

export interface PathValidationResult {
  valid: boolean;
  safePath?: string;
  error?: string;
}

export class PathValidator {
  private static readonly DANGEROUS_PATTERNS = [
    /\.\./g,           // Directory traversal
    /\0/g,             // Null byte injection
    /[<>:"|?*]/g,      // Windows invalid characters
    /\\/g,             // Backslashes (normalize to forward slashes)
    /^\/\//,           // UNC paths
    /^[a-zA-Z]:\\/g,   // Windows drive letters
  ];

  private static readonly ALLOWED_EXTENSIONS = [
    '.json', '.txt', '.csv', '.xml', '.yaml', '.yml',
    '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg',
    '.pdf', '.doc', '.docx', '.zip', '.tar', '.gz'
  ];

  /**
   * Validates and sanitizes file paths to prevent traversal attacks
   */
  static validatePath(
    inputPath: string, 
    basePath?: string, 
    options?: {
      allowTraversal?: boolean;
      allowedExtensions?: string[];
      maxPathLength?: number;
    }
  ): PathValidationResult {
    try {
      // 🔥 SECURITY: Input validation
      if (!inputPath || typeof inputPath !== 'string') {
        const error = 'Invalid path: non-empty string required';
        logger.warn('Path validation failed - invalid input', { inputPath });
        return { valid: false, error };
      }

      // 🔥 SECURITY: Length limit to prevent DoS
      const maxLength = options?.maxPathLength || 1000;
      if (inputPath.length > maxLength) {
        const error = `Path too long: maximum ${maxLength} characters`;
        logger.error('Path validation failed - path too long', { 
          inputPath, 
          length: inputPath.length 
        });
        return { valid: false, error };
      }

      // 🔥 SECURITY: Check for dangerous patterns
      for (const pattern of this.DANGEROUS_PATTERNS) {
        if (pattern.test(inputPath)) {
          const error = 'Dangerous characters detected in path';
          logger.error('Path validation failed - dangerous pattern', { 
            inputPath, 
            pattern: pattern.source 
          });
          return { valid: false, error };
        }
      }

      // 🔥 SECURITY: Normalize path
      const normalizedPath = normalize(inputPath).replace(/\\/g, '/');

      // 🔥 SECURITY: Prevent absolute paths unless explicitly allowed
      if (normalizedPath.startsWith('/') && !options?.allowTraversal) {
        const error = 'Absolute paths not allowed';
        logger.error('Path validation failed - absolute path', { normalizedPath });
        return { valid: false, error };
      }

      // 🔥 SECURITY: Check for path traversal attempts
      if (normalizedPath.includes('../') && !options?.allowTraversal) {
        const error = 'Path traversal not allowed';
        logger.error('Path validation failed - traversal attempt', { normalizedPath });
        return { valid: false, error };
      }

      // 🔥 SECURITY: Validate file extension
      if (options?.allowedExtensions) {
        const hasValidExtension = options.allowedExtensions.some(ext => 
          normalizedPath.toLowerCase().endsWith(ext.toLowerCase())
        );
        if (!hasValidExtension) {
          const error = `Invalid file extension. Allowed: ${options.allowedExtensions.join(', ')}`;
          logger.error('Path validation failed - invalid extension', { 
            normalizedPath, 
            allowedExtensions: options.allowedExtensions 
          });
          return { valid: false, error };
        }
      }

      // 🔥 SECURITY: Resolve against base path if provided
      let safePath: string;
      if (basePath) {
        safePath = resolve(basePath, normalizedPath);
        
        // 🔥 SECURITY: Ensure resolved path is still within base path
        if (!safePath.startsWith(resolve(basePath))) {
          const error = 'Resolved path escapes base directory';
          logger.error('Path validation failed - path escape', { 
            inputPath, 
            basePath, 
            safePath 
          });
          return { valid: false, error };
        }
      } else {
        safePath = normalizedPath;
      }

      logger.debug('Path validation successful', { 
        inputPath, 
        safePath, 
        basePath 
      });

      return { valid: true, safePath };

    } catch (error: any) {
      const errorMessage = `Path validation error: ${error.message}`;
      logger.error('Path validation failed with exception', { 
        inputPath, 
        error: error.message 
      });
      return { valid: false, error: errorMessage };
    }
  }

  /**
   * Validates proof file paths specifically
   */
  static validateProofPath(proofId: string, storagePath: string): PathValidationResult {
    // 🔥 SECURITY: Strict proof ID validation
    const proofIdPattern = /^[a-zA-Z0-9_-]+$/;
    if (!proofIdPattern.test(proofId)) {
      const error = 'Invalid proof ID format';
      logger.error('Proof path validation failed - invalid ID', { proofId });
      return { valid: false, error };
    }

    // 🔥 SECURITY: Construct safe proof file path
    const proofPath = join(storagePath, `${proofId}.json`);
    
    return this.validatePath(proofPath, storagePath, {
      allowedExtensions: ['.json'],
      allowTraversal: false
    });
  }

  /**
   * Validates API key file paths
   */
  static validateApiKeyPath(keyId: string, configPath: string): PathValidationResult {
    // 🔥 SECURITY: Strict key ID validation
    const keyIdPattern = /^[a-zA-Z0-9_-]+$/;
    if (!keyIdPattern.test(keyId)) {
      const error = 'Invalid key ID format';
      logger.error('API key path validation failed - invalid ID', { keyId });
      return { valid: false, error };
    }

    const keyPath = join(configPath, `${keyId}.json`);
    
    return this.validatePath(keyPath, configPath, {
      allowedExtensions: ['.json'],
      allowTraversal: false
    });
  }

  /**
   * Validates certificate file paths
   */
  static validateCertificatePath(certName: string, certPath: string): PathValidationResult {
    // 🔥 SECURITY: Certificate name validation
    const certPattern = /^[a-zA-Z0-9._-]+\.(crt|pem|key|p12)$/;
    if (!certPattern.test(certName)) {
      const error = 'Invalid certificate name format';
      logger.error('Certificate path validation failed - invalid name', { certName });
      return { valid: false, error };
    }

    const fullCertPath = join(certPath, certName);
    
    return this.validatePath(fullCertPath, certPath, {
      allowedExtensions: ['.crt', '.pem', '.key', '.p12'],
      allowTraversal: false
    });
  }

  /**
   * Safe file join with validation
   */
  static safeJoin(basePath: string, ...paths: string[]): PathValidationResult {
    const joinedPath = join(basePath, ...paths);
    return this.validatePath(joinedPath, basePath, { allowTraversal: false });
  }

  /**
   * Checks if path is within allowed directories
   */
  static isPathAllowed(path: string, allowedPaths: string[]): boolean {
    try {
      const resolvedPath = resolve(path);
      return allowedPaths.some(allowedPath => 
        resolvedPath.startsWith(resolve(allowedPath))
      );
    } catch (error) {
      logger.error('Path allowed check failed', { path, error });
      return false;
    }
  }
}

// Export convenience functions
export const validatePath = PathValidator.validatePath;
export const validateProofPath = PathValidator.validateProofPath;
export const validateApiKeyPath = PathValidator.validateApiKeyPath;
export const validateCertificatePath = PathValidator.validateCertificatePath;
export const safeJoin = PathValidator.safeJoin;
export const isPathAllowed = PathValidator.isPathAllowed;
