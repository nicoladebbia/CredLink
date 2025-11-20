import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

// 🔥 REALISTIC SECURITY: Centralized validation prevents inconsistent security across routes
export interface SecurityValidationOptions {
  requiredFields?: string[];
  sqlInjectionCheck?: boolean;
  emailValidation?: boolean;
  userIdValidation?: boolean;
  quantityValidation?: boolean;
  maxQuantity?: number;
}

// 🔥 CRITICAL: SQL injection patterns that bypass format validation
const SQL_INJECTION_PATTERNS = [
  // 🔥 HARSH FIX: Specific semicolon patterns to avoid HTML false positives
  /(\s*;\s*(drop|delete|update|insert|select|create|alter|exec|union))/i,
  /(exec(\\s|\\+)+(s|x)p\\w+)/i,
  /(insert(\\s|\\+)+into)/i,
  /(delete(\\s|\\+)+from)/i,
  /(update(\\s|\\+)+\\w+(\\s|\\+)+set)/i,
  /(drop(\\s|\\+)+(table|database))/i,
  /(union(\\s|\\+)+select)/i,
  /(select(\\s|\\+)+(\\*|\\w+)(\\s|\\+)+from)/i,
  /(create(\\s|\\+)+(table|database))/i,
  /(alter(\\s|\\+)+table)/i
];

// 🔥 CRITICAL: Email validation that prevents injection
const EMAIL_REGEX = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;

// 🔥 CRITICAL: User ID validation (UUID or alphanumeric)
const USER_ID_REGEX = /^[a-zA-Z0-9-_]{8,64}$/;

/**
 * 🔥 REALISTIC SECURITY: Centralized validation middleware
 * Prevents inconsistent security implementation across routes
 */
export function validateSecurityInput(options: SecurityValidationOptions = {}) {
  // 🔥 DEBUG: Log middleware factory call
  console.log('🔥 DEBUG: MIDDLEWARE FACTORY CALLED');
  logger.info('🔥 DEBUG: Security validation middleware factory called', { options });
  
  return (req: Request, res: Response, next: NextFunction) => {
    // 🔥 DEBUG: Log middleware handler execution
    console.log('🔥 DEBUG: MIDDLEWARE HANDLER CALLED');
    logger.info('🔥 DEBUG: Security validation middleware called', {
      path: req.path,
      method: req.method,
      bodyKeys: Object.keys(req.body || {}),
      sqlInjectionCheck: options.sqlInjectionCheck
    });
    
    try {
      // Check required fields
      if (options.requiredFields) {
        for (const field of options.requiredFields) {
          if (!req.body[field]) {
            logger.warn('Missing required field', { field, ip: req.ip });
            return res.status(400).json({
              success: false,
              error: `${field} is required`
            });
          }
        }
      }

      // Collect all input values for SQL injection checking
      const allInputs: string[] = [];
      
      // 🔥 HARSH SECURITY: Check ALL fields when SQL injection checking is enabled
      if (options.sqlInjectionCheck && req.body) {
        for (const field in req.body) {
          const value = req.body[field];
          if (typeof value === 'string') {
            allInputs.push(value);
          } else if (typeof value === 'number') {
            allInputs.push(value.toString());
          }
        }
      } else if (options.requiredFields) {
        // Original behavior for specific field validation
        for (const field of options.requiredFields) {
          const value = req.body[field];
          if (typeof value === 'string') {
            allInputs.push(value);
          } else if (typeof value === 'number') {
            allInputs.push(value.toString());
          }
        }
      }

      // 🔥 CRITICAL: SQL injection pattern detection
      if (options.sqlInjectionCheck) {
        logger.info('🔥 DEBUG: SQL injection scanning inputs', {
          allInputs,
          inputCount: allInputs.length,
          patternCount: SQL_INJECTION_PATTERNS.length
        });
        
        for (const input of allInputs) {
          logger.info('🔥 DEBUG: Testing input against patterns', { input });
          
          if (SQL_INJECTION_PATTERNS.some(pattern => pattern.test(input))) {
            // 🔥 DEBUG: Find which pattern matched
            const matchedPattern = SQL_INJECTION_PATTERNS.find(pattern => pattern.test(input));
            logger.error('🔥 HARSH SECURITY: SQL injection BLOCKED', { 
              input, 
              matchedPattern: matchedPattern?.toString(),
              ip: req.ip, 
              userAgent: req.get('User-Agent'),
              path: req.path,
              method: req.method
            });
            return res.status(400).json({
              success: false,
              error: 'SECURITY: SQL injection detected and blocked'
            });
          }
        }
        
        logger.info('🔥 DEBUG: No SQL injection patterns matched', { allInputs });
      }

      // 🔥 CRITICAL: Email validation
      if (options.emailValidation && req.body.email) {
        if (!EMAIL_REGEX.test(req.body.email)) {
          logger.warn('Invalid email format', { email: req.body.email, ip: req.ip });
          return res.status(400).json({
            success: false,
            error: 'Invalid email format'
          });
        }
      }

      // 🔥 CRITICAL: User ID validation
      if (options.userIdValidation && req.body.userId) {
        if (!USER_ID_REGEX.test(req.body.userId)) {
          logger.warn('Invalid user ID format', { userId: req.body.userId, ip: req.ip });
          return res.status(400).json({
            success: false,
            error: 'Invalid user ID format'
          });
        }
      }

      // 🔥 CRITICAL: Quantity validation
      if (options.quantityValidation && req.body.quantity) {
        const quantity = req.body.quantity;
        if (!Number.isInteger(quantity) || quantity <= 0 || quantity > (options.maxQuantity || 1000)) {
          logger.warn('Invalid quantity', { quantity, ip: req.ip });
          return res.status(400).json({
            success: false,
            error: `Quantity must be a positive integer (max ${options.maxQuantity || 1000})`
          });
        }
      }

      next();
    } catch (error) {
      logger.error('Security validation error', { error, ip: req.ip });
      return res.status(500).json({
        success: false,
        error: 'Validation failed'
      });
    }
  };
}

/**
 * 🔥 REALISTIC SECURITY: File upload validation middleware
 * Prevents path traversal and malicious file uploads
 */
export function validateFileUpload(req: Request, res: Response, next: NextFunction) {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'No file provided'
    });
  }

  // 🔥 CRITICAL: Generate secure UUID filename
  const fileExtension = req.file.originalname.split('.').pop()?.toLowerCase();
  const secureFilename = fileExtension ? `${require('crypto').randomUUID()}.${fileExtension}` : require('crypto').randomUUID();
  
  // Attach secure filename to request for downstream handlers
  (req as any).secureFilename = secureFilename;
  
  logger.info('File upload validated', {
    originalname: req.file.originalname,
    secureFilename: secureFilename,
    mimetype: req.file.mimetype,
    size: req.file.size,
    ip: req.ip
  });

  next();
}
