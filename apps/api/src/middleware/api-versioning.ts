import { Request, Response, NextFunction } from 'express';
import { DateUtils } from '@credlink/config';
import { logger } from '../utils/logger';

/**
 * API Versioning Middleware
 * 
 * Handles API version detection and deprecation warnings
 * Supports both URL path versioning (/v1/) and header-based versioning
 */
export function apiVersioning(req: Request, res: Response, next: NextFunction): void {
  // Detect API version from URL path
  const pathMatch = req.path.match(/^\/v(\d+)\//);
  const urlVersion = pathMatch ? pathMatch[1] : null;
  
  // Detect API version from Accept header
  const acceptHeader = req.get('Accept') || '';
  const headerVersion = acceptHeader.match(/application\/vnd\.credlink\.v(\d+)\+json/)?.[1];
  
  // Determine the effective version
  const apiVersion = urlVersion || headerVersion || 'legacy';
  
  // Add version info to request
  req.apiVersion = apiVersion;
  
  // Set version headers
  if (apiVersion !== 'legacy') {
    res.setHeader('X-API-Version', `v${apiVersion}`);
    res.setHeader('X-API-Stable', 'true');
  }
  
  // Handle legacy root endpoints with deprecation warnings
  if (apiVersion === 'legacy' && ['/sign', '/verify', '/docs'].includes(req.path)) {
    // 🔥 HARDCODED DATE ELIMINATION: Use dynamic sunset date calculation
    const sunsetDate = DateUtils.getApiSunsetDate();
    
    res.setHeader('X-API-Deprecated', 'true');
    res.setHeader('X-API-Sunset', sunsetDate);
    res.setHeader('X-API-Migration', `Use /v1${req.path} instead`);
    res.setHeader('X-API-Version', 'legacy');
    
    // Log deprecation warning
    console.warn('Legacy API endpoint accessed', {
      endpoint: req.path,
      method: req.method,
      ip: req.ip,
      sunsetDate,
      userAgent: req.get('User-Agent'),
      migrationPath: `/v1${req.path}`
    });
    
    // Add deprecation warning to response if it's JSON
    const originalJson = res.json;
    res.json = function(data: any) {
      if (data && typeof data === 'object') {
        data._warnings = data._warnings || [];
        data._warnings.push({
          type: 'deprecated_endpoint',
          message: `This endpoint is deprecated and will be removed on ${sunsetDate}`,
          migration: `Use /v1${req.path} instead`,
          sunset: sunsetDate
        });
      }
      return originalJson.call(this, data);
    };
  }
  
  // Log API version usage
  logger.info('API request', {
    version: apiVersion,
    path: req.path,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    isDeprecated: apiVersion === 'legacy'
  });
  
  next();
}

/**
 * Extend Request interface to include API version
 */
declare global {
  namespace Express {
    interface Request {
      apiVersion?: string;
    }
  }
}
