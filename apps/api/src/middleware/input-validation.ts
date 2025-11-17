/**
 * HARSH: Input Validation Middleware
 * Comprehensive input validation for all API endpoints
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { TimeoutConfig } from '../utils/timeout-config';
import { securityMonitor, SecurityEventType } from '@credlink/security-monitor';

/**
 * HARSH: Validate and sanitize all request inputs
 */
export function validateAllInputs(req: Request, res: Response, next: NextFunction): void {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const tenantId = req.headers['x-tenant-id'] as string || 'default';
    
    try {
        // Validate query parameters
        if (req.query) {
            for (const [key, value] of Object.entries(req.query)) {
                if (typeof value === 'string' && containsSuspiciousPatterns(value)) {
                    securityMonitor.recordEvent({
                        type: SecurityEventType.XSS_ATTEMPT,
                        severity: 'high',
                        source: { ip, tenantId },
                        details: {
                            location: 'query_params',
                            parameter: key,
                            value: value.substring(0, 100)
                        }
                    });
                    res.status(400).json({
                        error: 'InvalidInput',
                        message: 'Suspicious characters detected in query parameters'
                    });
                    return;
                }
            }
        }
        
        // Validate path parameters
        if (req.params) {
            for (const [key, value] of Object.entries(req.params)) {
                if (containsSuspiciousPatterns(value)) {
                    securityMonitor.recordEvent({
                        type: SecurityEventType.XSS_ATTEMPT,
                        severity: 'high',
                        source: { ip, tenantId },
                        details: {
                            location: 'path_params',
                            parameter: key,
                            value: value.substring(0, 100)
                        }
                    });
                    res.status(400).json({
                        error: 'InvalidInput',
                        message: 'Suspicious characters detected in path parameters'
                    });
                    return;
                }
            }
        }
        
        // Validate headers (except common ones)
        const suspiciousHeaders = ['user-agent', 'referer', 'x-forwarded-for', 'x-real-ip'];
        for (const header of suspiciousHeaders) {
            const value = req.headers[header];
            if (typeof value === 'string' && containsSuspiciousPatterns(value)) {
                securityMonitor.recordEvent({
                    type: SecurityEventType.XSS_ATTEMPT,
                    severity: 'medium',
                    source: { ip, tenantId },
                    details: {
                        location: 'headers',
                        header: header,
                        value: value.substring(0, 100)
                    }
                });
                // Don't block suspicious headers, just log them
            }
        }
        
        // Validate request body size
        const contentLength = parseInt(req.headers['content-length'] || '0');
        const maxBodySize = 10 * 1024 * 1024; // 10MB
        
        if (contentLength > maxBodySize) {
            securityMonitor.recordEvent({
                type: SecurityEventType.RATE_LIMIT_EXCEEDED,
                severity: 'medium',
                source: { ip, tenantId },
                details: {
                    contentLength,
                    maxBodySize
                }
            });
            res.status(413).json({
                error: 'PayloadTooLarge',
                message: `Request body too large. Maximum size: ${maxBodySize / 1024 / 1024}MB`
            });
            return;
        }
        
        next();
    } catch (error) {
        console.error('Input validation error:', error);
        // Don't block requests on validation errors
        next();
    }
}

/**
 * Check for suspicious patterns in input
 */
function containsSuspiciousPatterns(input: string): boolean {
    if (!input || typeof input !== 'string') {
        return false;
    }
    
    const suspiciousPatterns = [
        // SQL injection patterns
        /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)\b)/i,
        /(\b(OR|AND)\s+\d+\s*=\s*\d+)/i,
        /(\b(OR|AND)\s+['"]?\w+['"]?\s*=\s*['?\w[^\]]*]?)/i,
        
        // XSS patterns
        /<script[^>]*>/gi,
        /javascript:/gi,
        /data:text\/html/gi,
        /vbscript:/gi,
        /onload\s*=/gi,
        /onerror\s*=/gi,
        /eval\s*\(/gi,
        
        // Path traversal patterns
        /\.\.[\/\\%]/gi,
        /%[^\dA-Fa-f]/, // Invalid URL encoding
        /[\\\\][\\\\][\\\\]/, // UNC paths
        
        // Command injection patterns
        /[;&|`$(){}[\]/]/,
        /\b(system|exec|shell_exec|passthru|eval)\s*\(/gi,
        
        // NoSQL injection patterns
        /(\$where|\$ne|\$gt|\$lt|\$in|\$nin|\$exists)/gi,
    ];
    
    return suspiciousPatterns.some(pattern => pattern.test(input));
}

/**
 * HARSH: Rate limiting based on input validation failures
 */
export class InputValidationRateLimiter {
    private failures: Map<string, { count: number; resetTime: number }> = new Map();
    private readonly maxFailures = 10;
    private readonly windowMs = 5 * 60 * 1000; // 5 minutes
    
    check(ip: string): boolean {
        const now = Date.now();
        const key = `input-validation:${ip}`;
        const current = this.failures.get(key);
        
        if (!current || now > current.resetTime) {
            // Reset or initialize counter
            this.failures.set(key, { count: 1, resetTime: now + this.windowMs });
            return true;
        }
        
        if (current.count >= this.maxFailures) {
            return false; // Block
        }
        
        current.count++;
        return true;
    }
    
    cleanup(): void {
        const now = Date.now();
        const keysToDelete: string[] = [];
        
        this.failures.forEach((value, key) => {
            if (now > value.resetTime) {
                keysToDelete.push(key);
            }
        });
        
        keysToDelete.forEach(key => this.failures.delete(key));
    }
}

// Global rate limiter instance
const inputValidationLimiter = new InputValidationRateLimiter();

// 🔥 CRITICAL MEMORY FIX: Store interval reference for cleanup
let cleanupInterval: NodeJS.Timeout;

// Cleanup old entries every 5 minutes
cleanupInterval = setInterval(() => inputValidationLimiter.cleanup(), TimeoutConfig.RATE_LIMIT_CLEANUP_INTERVAL);

// 🔥 MEMORY LEAK FIX: Provide cleanup function for graceful shutdown
export function cleanupInputValidationLimiter(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = undefined as any;
  }
  inputValidationLimiter.cleanup();
}

/**
 * Enhanced validation middleware with rate limiting
 */
export function validateAllInputsWithRateLimit(req: Request, res: Response, next: NextFunction): void {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    
    // Check rate limit first
    if (!inputValidationLimiter.check(ip)) {
        securityMonitor.recordEvent({
            type: SecurityEventType.RATE_LIMIT_EXCEEDED,
            severity: 'high',
            source: { ip },
            details: {
                type: 'input_validation_failures',
                limit: inputValidationLimiter['maxFailures']
            }
        });
        
        res.status(429).json({
            error: 'RateLimitExceeded',
            message: 'Too many invalid input attempts. Please try again later.'
        });
        return;
    }
    
    validateAllInputs(req, res, next);
}
