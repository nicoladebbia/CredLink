import { Request, Response, NextFunction } from 'express';
import DOMPurify from 'isomorphic-dompurify';
import { logger } from '../utils/logger';

/**
 * 🔥 REALISTIC SECURITY: HTML sanitization middleware
 * Prevents XSS attacks by sanitizing all user-provided HTML content
 */
export function sanitizeHtmlInput(req: Request, res: Response, next: NextFunction) {
  try {
    // Sanitize all string fields in request body
    if (req.body && typeof req.body === 'object') {
      sanitizeObject(req.body);
    }

    // Sanitize query parameters
    if (req.query && typeof req.query === 'object') {
      sanitizeObject(req.query);
    }

    // Sanitize URL parameters
    if (req.params && typeof req.params === 'object') {
      sanitizeObject(req.params);
    }

    next();
  } catch (error) {
    logger.error('HTML sanitization error', { error, ip: req.ip });
    return res.status(400).json({
      success: false,
      error: 'Invalid content detected'
    });
  }
}

/**
 * 🔥 CRITICAL: Recursively sanitize all string values in an object
 */
function sanitizeObject(obj: any): void {
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const value = obj[key];
      
      if (typeof value === 'string') {
        // 🔥 SECURITY: Sanitize HTML content while preserving safe formatting
        const sanitized = DOMPurify.sanitize(value, {
          ALLOWED_TAGS: [
            'p', 'br', 'strong', 'em', 'u', 'ol', 'ul', 'li',
            'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote',
            'code', 'pre'
          ],
          ALLOWED_ATTR: ['class'],
          ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp|data):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
          ADD_ATTR: ['target'],
          FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'textarea'],
          FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur']
        });

        // 🔥 CRITICAL: Log if content was modified (potential XSS attempt)
        if (sanitized !== value) {
          logger.warn('XSS attempt detected and sanitized', {
            field: key,
            originalLength: value.length,
            sanitizedLength: sanitized.length,
            ip: 'sanitizer-context'
          });
        }

        obj[key] = sanitized;
      } else if (typeof value === 'object' && value !== null) {
        // Recursively sanitize nested objects
        sanitizeObject(value);
      }
    }
  }
}

/**
 * 🔥 SECURITY: Sanitize specific field (for targeted sanitization)
 */
export function sanitizeField(content: string, allowedTags?: string[]): string {
  return DOMPurify.sanitize(content, {
    ALLOWED_TAGS: allowedTags || ['p', 'br', 'strong', 'em'],
    ALLOWED_ATTR: ['class'],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'textarea'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur']
  });
}

/**
 * 🔥 SECURITY: Strict sanitization for system-critical fields
 */
export function strictSanitize(content: string): string {
  return DOMPurify.sanitize(content, {
    ALLOWED_TAGS: [], // No HTML tags allowed
    ALLOWED_ATTR: [],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'textarea'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur']
  });
}
