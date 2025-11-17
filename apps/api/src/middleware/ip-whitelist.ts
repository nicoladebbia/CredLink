/**
 * IP Whitelist Middleware
 * 
 * Restricts access to sensitive endpoints based on IP address.
 * Supports both direct IP checks and Cloudflare's CF-Connecting-IP header.
 * 
 * SECURITY: Use this for admin, debug, and metrics endpoints.
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import ipaddr from 'ipaddr.js';

export interface IPWhitelistOptions {
  /**
   * List of allowed IP addresses (CIDR notation supported)
   * Examples: '192.168.1.1', '10.0.0.0/8', '2001:db8::/32'
   */
  allowedIPs?: string[];
  
  /**
   * List of allowed IP ranges
   */
  allowedRanges?: Array<{
    start: string;
    end: string;
  }>;
  
  /**
   * Allow localhost/loopback addresses
   * Default: true
   */
  allowLocalhost?: boolean;
  
  /**
   * Allow private/internal IP ranges (10.x.x.x, 192.168.x.x, 172.16.x.x)
   * Default: false (for security)
   */
  allowPrivateRanges?: boolean;
  
  /**
   * Trust Cloudflare's CF-Connecting-IP header
   * Default: true
   */
  trustCloudflare?: boolean;
  
  /**
   * Custom error message
   */
  errorMessage?: string;
  
  /**
   * Log blocked requests
   * Default: true
   */
  logBlocked?: boolean;
}

/**
 * Parse CIDR notation and check if IP is in range
 */
function isIPInCIDR(ip: string, cidr: string): boolean {
  try {
    const addr = ipaddr.process(ip);
    const range = ipaddr.parseCIDR(cidr);
    return addr.match(range);
  } catch (error) {
    logger.warn('Failed to parse IP or CIDR', { ip, cidr, error });
    return false;
  }
}

/**
 * Check if IP is in a range
 */
function isIPInRange(ip: string, start: string, end: string): boolean {
  try {
    const addr = ipaddr.process(ip);
    const startAddr = ipaddr.process(start);
    const endAddr = ipaddr.process(end);
    
    const ipBytes = addr.toByteArray();
    const startBytes = startAddr.toByteArray();
    const endBytes = endAddr.toByteArray();
    
    for (let i = 0; i < ipBytes.length; i++) {
      if (ipBytes[i] < startBytes[i] || ipBytes[i] > endBytes[i]) {
        return false;
      }
    }
    
    return true;
  } catch (error) {
    logger.warn('Failed to check IP range', { ip, start, end, error });
    return false;
  }
}

/**
 * Check if IP is localhost
 */
function isLocalhost(ip: string): boolean {
  try {
    const addr = ipaddr.process(ip);
    return addr.range() === 'loopback';
  } catch {
    return ip === process.env.ALLOWED_LOCALHOST || ip === process.env.ALLOWED_LOOPBACK_IP || ip === process.env.ALLOWED_IPV6_LOOPBACK;
  }
}

/**
 * Check if IP is in private range
 */
function isPrivateIP(ip: string): boolean {
  try {
    const addr = ipaddr.process(ip);
    const range = addr.range();
    return range === 'private' || range === 'linkLocal' || range === 'uniqueLocal';
  } catch {
    return false;
  }
}

/**
 * Extract real IP address from request
 */
function extractIPAddress(req: Request, trustCloudflare: boolean = true): string {
  // Priority 1: Cloudflare's CF-Connecting-IP header (if trusted)
  if (trustCloudflare) {
    const cfIP = req.headers['cf-connecting-ip'];
    if (cfIP && typeof cfIP === 'string') {
      return cfIP;
    }
  }
  
  // Priority 2: X-Forwarded-For header (first IP in the chain)
  const xForwardedFor = req.headers['x-forwarded-for'];
  if (xForwardedFor && typeof xForwardedFor === 'string') {
    const ips = xForwardedFor.split(',').map(ip => ip.trim());
    if (ips.length > 0) {
      return ips[0];
    }
  }
  
  // Priority 3: X-Real-IP header
  const xRealIP = req.headers['x-real-ip'];
  if (xRealIP && typeof xRealIP === 'string') {
    return xRealIP;
  }
  
  // Priority 4: Direct connection IP
  return req.ip || req.socket.remoteAddress || 'unknown';
}

/**
 * Create IP whitelist middleware
 */
export function createIPWhitelist(options: IPWhitelistOptions = {}) {
  const {
    allowedIPs = [],
    allowedRanges = [],
    allowLocalhost = true,
    allowPrivateRanges = false,
    trustCloudflare = true,
    errorMessage = 'Access denied: IP address not whitelisted',
    logBlocked = true,
  } = options;
  
  // Load additional IPs from environment if configured
  const envIPs = process.env.IP_WHITELIST?.split(',').map(ip => ip.trim()) || [];
  const allAllowedIPs = [...allowedIPs, ...envIPs];
  
  logger.info('IP whitelist middleware initialized', {
    allowedIPCount: allAllowedIPs.length,
    allowLocalhost,
    allowPrivateRanges,
    trustCloudflare,
  });
  
  return (req: Request, res: Response, next: NextFunction): void => {
    const clientIP = extractIPAddress(req, trustCloudflare);
    
    // Check localhost
    if (allowLocalhost && isLocalhost(clientIP)) {
      logger.debug('IP whitelist: localhost access allowed', { ip: clientIP, path: req.path });
      return next();
    }
    
    // Check private ranges
    if (allowPrivateRanges && isPrivateIP(clientIP)) {
      logger.debug('IP whitelist: private IP access allowed', { ip: clientIP, path: req.path });
      return next();
    }
    
    // Check exact IP matches and CIDR ranges
    for (const allowed of allAllowedIPs) {
      if (allowed.includes('/')) {
        // CIDR notation
        if (isIPInCIDR(clientIP, allowed)) {
          logger.debug('IP whitelist: CIDR match', { ip: clientIP, cidr: allowed, path: req.path });
          return next();
        }
      } else {
        // Exact match
        if (clientIP === allowed) {
          logger.debug('IP whitelist: exact match', { ip: clientIP, path: req.path });
          return next();
        }
      }
    }
    
    // Check IP ranges
    for (const range of allowedRanges) {
      if (isIPInRange(clientIP, range.start, range.end)) {
        logger.debug('IP whitelist: range match', { ip: clientIP, range, path: req.path });
        return next();
      }
    }
    
    // IP not whitelisted
    if (logBlocked) {
      logger.warn('IP whitelist: access denied', {
        ip: clientIP,
        path: req.path,
        method: req.method,
        userAgent: req.headers['user-agent'],
      });
    }
    
    res.status(403).json({
      error: errorMessage,
      statusCode: 403,
    });
  };
}

/**
 * 🔥 CRITICAL FIX: Lazy initialization to prevent 4x duplication
 * Module-level code was executing on every import, creating exponential instances
 */
let _admin: any = null;
let _metrics: any = null;
let _health: any = null;
let _debug: any = null;

/**
 * Predefined whitelists for common use cases
 */
export const ipWhitelists = {
  /**
   * Admin endpoints - very restrictive
   * Only localhost and explicitly configured IPs
   */
  get admin() {
    if (!_admin) {
      _admin = createIPWhitelist({
        allowLocalhost: true,
        allowPrivateRanges: false,
        errorMessage: 'Access denied: Admin endpoint requires whitelisted IP',
        logBlocked: true,
      });
    }
    return _admin;
  },
  
  /**
   * Metrics/monitoring endpoints
   * Localhost + monitoring service IPs
   */
  get metrics() {
    if (!_metrics) {
      _metrics = createIPWhitelist({
        allowLocalhost: true,
        allowPrivateRanges: false, // Set to true if Prometheus is on internal network
        allowedIPs: [
          // Add your monitoring service IPs here
          // Example: Grafana Cloud IPs, Datadog agents, etc.
        ],
        errorMessage: 'Access denied: Metrics endpoint requires whitelisted IP',
        logBlocked: true,
      });
    }
    return _metrics;
  },
  
  /**
   * Health check endpoints
   * More permissive for load balancers and monitoring
   */
  get health() {
    if (!_health) {
      _health = createIPWhitelist({
        allowLocalhost: true,
        allowPrivateRanges: true, // Allow AWS VPC, internal load balancers
        errorMessage: 'Access denied: Health check endpoint requires whitelisted IP',
        logBlocked: false, // Don't spam logs with health check denials
      });
    }
    return _health;
  },
  
  /**
   * Debug endpoints (development only)
   * Only enabled in non-production environments
   */
  get debug() {
    if (!_debug) {
      _debug = process.env.NODE_ENV === 'production'
        ? createIPWhitelist({
            allowLocalhost: false,
            allowPrivateRanges: false,
            trustCloudflare: false,
            errorMessage: 'Debug endpoints disabled in production',
            logBlocked: true,
          })
        : createIPWhitelist({
            allowLocalhost: true,
            allowPrivateRanges: true,
            trustCloudflare: true,
            errorMessage: 'Access denied: Debug endpoint requires whitelisted IP',
            logBlocked: true,
          });
    }
    return _debug;
  },
};

/**
 * Utility: Get client IP address
 * Useful for logging and debugging
 */
export function getClientIP(req: Request): string {
  return extractIPAddress(req);
}

/**
 * Utility: Check if IP is whitelisted without blocking
 * Useful for conditional logic based on IP
 */
export function checkIPWhitelisted(
  ip: string,
  options: IPWhitelistOptions = {}
): boolean {
  const {
    allowedIPs = [],
    allowedRanges = [],
    allowLocalhost = true,
    allowPrivateRanges = false,
  } = options;
  
  if (allowLocalhost && isLocalhost(ip)) return true;
  if (allowPrivateRanges && isPrivateIP(ip)) return true;
  
  for (const allowed of allowedIPs) {
    if (allowed.includes('/')) {
      if (isIPInCIDR(ip, allowed)) return true;
    } else {
      if (ip === allowed) return true;
    }
  }
  
  for (const range of allowedRanges) {
    if (isIPInRange(ip, range.start, range.end)) return true;
  }
  
  return false;
}
