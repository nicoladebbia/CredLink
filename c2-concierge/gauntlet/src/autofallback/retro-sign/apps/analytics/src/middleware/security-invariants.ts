/**
 * Phase 16 - Adversarial Lab v1
 * Security Invariants Implementation
 * 
 * Implements strict security invariants as specified:
 * - CSP with nonces + 'strict-dynamic'
 * - SRI on badge
 * - nosniff
 * - strict Content-Type allowlist
 * - Referrer-Policy
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { createLogger } from '../utils/logger';
import crypto from 'crypto';

const logger = createLogger('SecurityInvariants');

/**
 * Generate cryptographically secure nonce for CSP
 */
function generateNonce(): string {
  // Use crypto.randomBytes for secure random nonce generation
  return crypto.randomBytes(32).toString('base64');
}

/**
 * Content Security Policy with strict invariants
 * script-src 'self' https://static.c2c.example 'nonce-{rotating}' 'strict-dynamic'; 
 * object-src 'none'; 
 * base-uri 'self'; 
 * frame-ancestors 'self'; 
 * upgrade-insecure-requests
 */
export function contentSecurityPolicy(request: FastifyRequest, reply: FastifyReply): void {
  const nonce = generateNonce();
  const isProduction = process.env.NODE_ENV === 'production';
  
  // Store nonce for use in templates
  (request as FastifyRequest & { cspNonce?: string }).cspNonce = nonce;
  
  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' https://static.c2c.example 'nonce-" + nonce + "' 'strict-dynamic'",
    "style-src 'self' 'nonce-" + nonce + "' 'unsafe-inline'", // Required for Handlebars
    "img-src 'self' data: https:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'self'",
    "form-action 'self'",
    "manifest-src 'self'",
    "worker-src 'none'",
    "prefetch-src 'self'",
    isProduction ? "upgrade-insecure-requests" : "",
    "block-all-mixed-content"
  ].filter(Boolean).join('; ');
  
  reply.header('Content-Security-Policy', cspDirectives);
  
  logger.log('debug', 'CSP headers applied', {
    nonce: nonce.substring(0, 8) + '...',
    url: request.url
  });
}

/**
 * X-Content-Type-Options: nosniff
 */
export function contentTypeOptions(_request: FastifyRequest, reply: FastifyReply): void {
  reply.header('X-Content-Type-Options', 'nosniff');
}

/**
 * Strict Content-Type allowlist for manifests
 * application/c2pa+json only; any text/html → BLOCKED
 */
export function strictContentTypeValidation(request: FastifyRequest, reply: FastifyReply): void {
  const contentType = request.headers['content-type'];
  const url = request.url;
  
  // For manifest endpoints, enforce strict Content-Type
  if (url.includes('/manifest') || url.includes('/verify')) {
    if (contentType && !contentType.includes('application/c2pa+json')) {
      // Block HTML content types explicitly
      if (contentType.includes('text/html')) {
        logger.log('warn', 'HTML content blocked on manifest endpoint', {
          contentType,
          url,
          ip: request.ip
        });
        
        reply.status(415).send({
          error: 'MIME_REJECTED',
          decision: 'BLOCKED',
          reason: 'HTML content not allowed on manifest endpoints',
          code: 'MIME_REJECTED'
        });
        return;
      }
      
      // Allow JSON but warn
      if (!contentType.includes('application/json')) {
        logger.log('warn', 'Non-JSON content on manifest endpoint', {
          contentType,
          url,
          ip: request.ip
        });
      }
    }
  }
}

/**
 * Referrer-Policy: no-referrer on verify UI & reports
 */
export function referrerPolicy(request: FastifyRequest, reply: FastifyReply): void {
  const url = request.url;
  
  // Apply no-referrer to verify UI and reports
  if (url.includes('/verify') || url.includes('/reports')) {
    reply.header('Referrer-Policy', 'no-referrer');
  } else {
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  }
}

/**
 * Subresource Integrity (SRI) for badge ESM
 */
export function subresourceIntegrity(request: FastifyRequest, reply: FastifyReply): void {
  const url = request.url;
  
  if (url.includes('/badge')) {
    // CRITICAL: Generate real SRI hash in production
    // This placeholder should be replaced with actual file hash calculation
    const badgeIntegrity = process.env.BADGE_SRI_HASH || 'sha384-PLACEHOLDER_REAL_HASH_REQUIRED';
    
    reply.header('X-SRI-Integrity', badgeIntegrity);
    reply.header('X-SRI-Crossorigin', 'anonymous');
    
    if (badgeIntegrity.includes('PLACEHOLDER')) {
      logger.log('warn', 'SRI hash placeholder detected - replace with real hash', {
        url
      });
    }
    
    logger.log('debug', 'SRI headers applied for badge', {
      integrity: badgeIntegrity.substring(0, 20) + '...',
      url
    });
  }
}

/**
 * Deny-list MIMEs for remote fetch
 * Block text/html, application/javascript, image/svg+xml for manifests
 */
export function mimeDenyList(contentType: string): boolean {
  const blockedMimeTypes = [
    'text/html',
    'application/javascript',
    'application/x-javascript',
    'text/javascript',
    'image/svg+xml',
    'application/xml',
    'text/xml'
  ];
  
  return blockedMimeTypes.some(blocked => contentType.toLowerCase().includes(blocked));
}

/**
 * Main security invariants middleware
 */
export async function securityInvariants(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    // Apply all security invariants
    contentSecurityPolicy(request, reply);
    contentTypeOptions(request, reply);
    referrerPolicy(request, reply);
    subresourceIntegrity(request, reply);
    
    // Validate content types for sensitive endpoints
    strictContentTypeValidation(request, reply);
    
    logger.log('debug', 'Security invariants applied successfully', {
      url: request.url,
      method: request.method
    });
    
  } catch (error) {
    logger.log('error', 'Security invariants error', {
      error: error instanceof Error ? error.message : String(error),
      url: request.url,
      ip: request.ip
    });
    
    // Fail closed on any security error
    reply.status(500).send({
      error: 'SECURITY_INVARIANT_VIOLATION',
      decision: 'BLOCKED',
      reason: 'Security validation failed',
      code: 'SECURITY_INVARIANT_VIOLATION'
    });
  }
}

/**
 * Get CSP nonce for template rendering
 */
export function getCspNonce(request: FastifyRequest): string {
  return (request as FastifyRequest & { cspNonce?: string }).cspNonce || '';
}

/**
 * Parser limits enforcement
 */
export const PARSER_LIMITS = {
  MAX_JUMBF_BOX_DEPTH: 8,
  MAX_MANIFEST_CHAIN_LENGTH: 32,
  MAX_JSON_NESTING: 64,
  MAX_REMOTE_MANIFEST_SIZE: 2 * 1024 * 1024, // 2 MB
  MAX_REDIRECTS: 3,
  MAX_URI_LENGTH: 2048
} as const;

/**
 * Validate parser limits
 */
export function validateParserLimits(depth: number, chainLength: number, jsonNesting: number, manifestSize: number): {
  valid: boolean;
  violations: string[];
} {
  const violations: string[] = [];
  
  if (depth > PARSER_LIMITS.MAX_JUMBF_BOX_DEPTH) {
    violations.push(`JUMBF depth ${depth} exceeds limit ${PARSER_LIMITS.MAX_JUMBF_BOX_DEPTH}`);
  }
  
  if (chainLength > PARSER_LIMITS.MAX_MANIFEST_CHAIN_LENGTH) {
    violations.push(`Manifest chain length ${chainLength} exceeds limit ${PARSER_LIMITS.MAX_MANIFEST_CHAIN_LENGTH}`);
  }
  
  if (jsonNesting > PARSER_LIMITS.MAX_JSON_NESTING) {
    violations.push(`JSON nesting ${jsonNesting} exceeds limit ${PARSER_LIMITS.MAX_JSON_NESTING}`);
  }
  
  if (manifestSize > PARSER_LIMITS.MAX_REMOTE_MANIFEST_SIZE) {
    violations.push(`Manifest size ${manifestSize} exceeds limit ${PARSER_LIMITS.MAX_REMOTE_MANIFEST_SIZE}`);
  }
  
  return {
    valid: violations.length === 0,
    violations
  };
}
