/**
 * Phase 38 - Cloudflare Worker Security Hardening
 * Implements Workers security model with header validation, request isolation, and egress controls
 */

// Define ExecutionContext interface for Cloudflare Workers
interface ExecutionContext {
  waitUntil(promise: Promise<any>): void;
  passThroughOnException(): void;
}

interface SecurityConfig {
  allowedEgressHosts: string[];
  allowedHeaders: string[];
  blockedHeaders: string[];
  maxRequestSize: number;
  maxResponseSize: number;
  timeoutMs: number;
  enableCORS: boolean;
  allowedOrigins: string[];
  rateLimitPerIp: number;
  rateLimitWindow: number;
}

interface RequestContext {
  id: string;
  timestamp: number;
  clientIP: string;
  userAgent: string;
  origin: string;
  method: string;
  url: string;
  headers: Record<string, string>;
}

interface SecurityViolation {
  type: 'header_injection' | 'request_smuggling' | 'cache_poisoning' | 'egress_violation' | 'size_limit' | 'rate_limit';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  context: RequestContext;
  blocked: boolean;
}

/**
 * Security Worker for Cloudflare Workers Environment
 */
export class SecurityWorker {
  private config: SecurityConfig;
  private rateLimitMap: Map<string, { count: number; resetTime: number }> = new Map();
  
  constructor(config: Partial<SecurityConfig> = {}) {
    this.config = {
      allowedEgressHosts: [
        'api.stripe.com',
        'tsa.c2pa.org',
        'manifests.c2pa.org',
        'storage.c2pa.org',
      ],
      allowedHeaders: [
        'accept',
        'accept-language',
        'content-type',
        'authorization',
        'x-api-key',
        'x-request-id',
        'x-forwarded-for',
        'user-agent',
        'dpop',
        'x-signed-intent',
      ],
      blockedHeaders: [
        'host',
        'connection',
        'upgrade',
        'proxy-authorization',
        'te',
        'trailers',
        'transfer-encoding',
        'via',
        'forwarded',
        'x-forwarded-host',
        'x-forwarded-proto',
        'x-forwarded-port',
        'x-forwarded-server',
        'x-real-ip',
        'x-client-ip',
        'x-cluster-client-ip',
        'cf-connecting-ip',
        'cf-ray',
        'cf-visitor',
        'cf-ipcountry',
        'cf-ewf-via',
        'cf-warp-tag-id',
        'cf-chl-bypass',
        'cf-ewf-hash',
      ],
      maxRequestSize: 10 * 1024 * 1024, // 10MB
      maxResponseSize: 50 * 1024 * 1024, // 50MB
      timeoutMs: 30000, // 30 seconds
      enableCORS: true,
      allowedOrigins: [
        'https://app.c2pa-concierge.org',
        'https://console.c2pa-concierge.org',
        'https://c2pa-concierge.org',
      ],
      rateLimitPerIp: 100, // 100 requests per window
      rateLimitWindow: 60000, // 1 minute
      ...config,
    };
  }
  
  /**
   * Main security handler for incoming requests
   */
  async handleRequest(request: Request, env: any, ctx: ExecutionContext): Promise<Response> {
    const requestId = this.generateRequestId();
    const startTime = Date.now();
    
    try {
      // Extract request context
      const requestContext = this.extractRequestContext(request, requestId);
      
      // Apply security checks
      const violations = await this.performSecurityChecks(request, requestContext);
      
      // Log violations
      if (violations.length > 0) {
        await this.logViolations(violations);
        
        // Block request if critical violations found
        const criticalViolations = violations.filter(v => v.severity === 'critical');
        if (criticalViolations.length > 0) {
          return this.createSecurityResponse('Request blocked due to security violations', 403, {
            'X-Security-Violations': criticalViolations.map(v => v.type).join(','),
            'X-Request-ID': requestId,
          });
        }
      }
      
      // Check rate limits
      const rateLimitResult = this.checkRateLimit(requestContext.clientIP);
      if (!rateLimitResult.allowed) {
        return this.createSecurityResponse('Rate limit exceeded', 429, {
          'X-RateLimit-Limit': this.config.rateLimitPerIp.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': rateLimitResult.resetTime.toString(),
          'X-Request-ID': requestId,
        });
      }
      
      // Sanitize headers
      const sanitizedHeaders = this.sanitizeHeaders(request.headers);
      
      // Create sanitized request
      const sanitizedRequest = new Request(request.url, {
        method: request.method,
        headers: sanitizedHeaders,
        body: request.body,
        redirect: request.redirect,
        integrity: request.integrity,
        keepalive: request.keepalive,
        signal: request.signal,
      });
      
      // Add security context to request
      (sanitizedRequest as any).securityContext = {
        requestId,
        violations: violations.map(v => v.type),
        clientIP: requestContext.clientIP,
        userAgent: requestContext.userAgent,
      };
      
      // Forward to origin with timeout
      const response = await this.forwardToOrigin(sanitizedRequest, env, ctx);
      
      // Apply response security controls
      const securedResponse = await this.secureResponse(response, requestContext);
      
      // Add security headers
      this.addSecurityHeaders(securedResponse, requestId, violations);
      
      // Log successful request
      await this.logRequest(requestContext, violations, Date.now() - startTime);
      
      return securedResponse;
      
    } catch (error) {
      console.error('Security worker error:', error);
      
      return this.createSecurityResponse('Internal security error', 500, {
        'X-Request-ID': requestId,
        'X-Error': 'security_processing_failed',
      });
    }
  }
  
  /**
   * Extract request context for analysis
   */
  private extractRequestContext(request: Request, requestId: string): RequestContext {
    const url = new URL(request.url);
    
    return {
      id: requestId,
      timestamp: Date.now(),
      clientIP: request.headers.get('cf-connecting-ip') || 
                request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
                'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown',
      origin: request.headers.get('origin') || 'unknown',
      method: request.method,
      url: request.url,
      headers: Object.fromEntries(request.headers.entries()),
    };
  }
  
  /**
   * Perform comprehensive security checks
   */
  private async performSecurityChecks(request: Request, context: RequestContext): Promise<SecurityViolation[]> {
    const violations: SecurityViolation[] = [];
    
    // Check for header injection attempts
    violations.push(...this.checkHeaderInjection(request.headers, context));
    
    // Check for request smuggling
    violations.push(...this.checkRequestSmuggling(request, context));
    
    // Check for cache poisoning attempts
    violations.push(...this.checkCachePoisoning(request, context));
    
    // Check request size limits
    violations.push(...this.checkRequestSize(request, context));
    
    // Check egress violations
    violations.push(...this.checkEgressViolations(request, context));
    
    // Check for suspicious patterns
    violations.push(...this.checkSuspiciousPatterns(request, context));
    
    return violations;
  }
  
  /**
   * Check for header injection attacks
   */
  private checkHeaderInjection(headers: Headers, context: RequestContext): SecurityViolation[] {
    const violations: SecurityViolation[] = [];
    
    for (const [name, value] of headers.entries()) {
      const headerName = name.toLowerCase();
      
      // Check for blocked headers
      if (this.config.blockedHeaders.includes(headerName)) {
        violations.push({
          type: 'header_injection',
          severity: 'high',
          description: `Blocked header detected: ${name}`,
          context,
          blocked: true,
        });
        continue;
      }
      
      // Check for header injection patterns
      if (value && this.containsInjectionPatterns(value)) {
        violations.push({
          type: 'header_injection',
          severity: 'medium',
          description: `Suspicious header value in ${name}: ${value.substring(0, 100)}`,
          context,
          blocked: false,
        });
      }
      
      // Check for newline injection
      if (value && (value.includes('\r') || value.includes('\n'))) {
        violations.push({
          type: 'header_injection',
          severity: 'high',
          description: `Newline character detected in header ${name}`,
          context,
          blocked: true,
        });
      }
    }
    
    return violations;
  }
  
  /**
   * Check for HTTP request smuggling
   */
  private checkRequestSmuggling(request: Request, context: RequestContext): SecurityViolation[] {
    const violations: SecurityViolation[] = [];
    
    // Check Content-Length header
    const contentLength = request.headers.get('content-length');
    if (contentLength && isNaN(parseInt(contentLength))) {
      violations.push({
        type: 'request_smuggling',
        severity: 'high',
        description: 'Invalid Content-Length header',
        context,
        blocked: true,
      });
    }
    
    // Check Transfer-Encoding header
    const transferEncoding = request.headers.get('transfer-encoding');
    if (transferEncoding && transferEncoding.toLowerCase() !== 'identity') {
      violations.push({
        type: 'request_smuggling',
        severity: 'critical',
        description: 'Dangerous Transfer-Encoding header detected',
        context,
        blocked: true,
      });
    }
    
    // Check for chunked encoding conflicts
    if (contentLength && transferEncoding) {
      violations.push({
        type: 'request_smuggling',
        severity: 'high',
        description: 'Content-Length and Transfer-Encoding conflict',
        context,
        blocked: true,
      });
    }
    
    return violations;
  }
  
  /**
   * Check for cache poisoning attempts
   */
  private checkCachePoisoning(request: Request, context: RequestContext): SecurityViolation[] {
    const violations: SecurityViolation[] = [];
    
    const _url = new URL(request.url);
    
    // Check for suspicious query parameters
    const suspiciousParams = ['_escaped_fragment_', '_ga', '_gl', 'utm_content', 'fbclid'];
    for (const param of suspiciousParams) {
      if (_url.searchParams.has(param)) {
        violations.push({
          type: 'cache_poisoning',
          severity: 'low',
          description: `Suspicious query parameter: ${param}`,
          context,
          blocked: false,
        });
      }
    }
    
    // Check for cache manipulation headers
    const cacheHeaders = ['if-modified-since', 'if-none-match', 'cache-control'];
    for (const header of cacheHeaders) {
      const value = request.headers.get(header);
      if (value && this.containsCacheManipulationPatterns(value)) {
        violations.push({
          type: 'cache_poisoning',
          severity: 'medium',
          description: `Suspicious cache header: ${header}`,
          context,
          blocked: false,
        });
      }
    }
    
    return violations;
  }
  
  /**
   * Check request size limits
   */
  private checkRequestSize(request: Request, context: RequestContext): SecurityViolation[] {
    const violations: SecurityViolation[] = [];
    
    const contentLength = request.headers.get('content-length');
    if (contentLength) {
      const size = parseInt(contentLength);
      if (size > this.config.maxRequestSize) {
        violations.push({
          type: 'size_limit',
          severity: 'medium',
          description: `Request size ${size} exceeds limit ${this.config.maxRequestSize}`,
          context,
          blocked: true,
        });
      }
    }
    
    return violations;
  }
  
  /**
   * Check egress violations
   */
  private checkEgressViolations(request: Request, context: RequestContext): SecurityViolation[] {
    const violations: SecurityViolation[] = [];
    
    const url = new URL(request.url);
    const hostname = url.hostname;
    
    // Check if hostname is in allowed list
    if (!this.config.allowedEgressHosts.includes(hostname)) {
      violations.push({
        type: 'egress_violation',
        severity: 'high',
        description: `Egress to non-allowed host: ${hostname}`,
        context,
        blocked: true,
      });
    }
    
    return violations;
  }
  
  /**
   * Check for suspicious patterns
   */
  private checkSuspiciousPatterns(request: Request, context: RequestContext): SecurityViolation[] {
    const violations: SecurityViolation[] = [];
    
    const url = new URL(request.url);
    
    // Check for path traversal
    if (url.pathname.includes('../') || url.pathname.includes('..\\')) {
      violations.push({
        type: 'header_injection',
        severity: 'high',
        description: 'Path traversal attempt detected',
        context,
        blocked: true,
      });
    }
    
    // Check for SQL injection patterns
    const sqlPatterns = ['union select', 'drop table', 'insert into', 'delete from'];
    const queryString = url.search.toLowerCase();
    
    for (const pattern of sqlPatterns) {
      if (queryString.includes(pattern)) {
        violations.push({
          type: 'header_injection',
          severity: 'medium',
          description: `SQL injection pattern detected: ${pattern}`,
          context,
          blocked: false,
        });
      }
    }
    
    return violations;
  }
  
  /**
   * Sanitize headers by removing blocked ones
   */
  private sanitizeHeaders(headers: Headers): Headers {
    const sanitized = new Headers();
    
    for (const [name, value] of headers.entries()) {
      const headerName = name.toLowerCase();
      
      // Skip blocked headers
      if (this.config.blockedHeaders.includes(headerName)) {
        continue;
      }
      
      // Only allow whitelisted headers
      if (this.config.allowedHeaders.includes(headerName)) {
        sanitized.set(name, value);
      }
    }
    
    return sanitized;
  }
  
  /**
   * Check rate limits
   */
  private checkRateLimit(clientIP: string): { allowed: boolean; resetTime: number } {
    const now = Date.now();
    
    // Clean up expired entries
    for (const [ip, data] of this.rateLimitMap.entries()) {
      if (data.resetTime < now) {
        this.rateLimitMap.delete(ip);
      }
    }
    
    // Get current count for this IP
    const current = this.rateLimitMap.get(clientIP) || { count: 0, resetTime: now + this.config.rateLimitWindow };
    
    if (current.count >= this.config.rateLimitPerIp) {
      return {
        allowed: false,
        resetTime: current.resetTime,
      };
    }
    
    // Increment count
    current.count++;
    this.rateLimitMap.set(clientIP, current);
    
    return {
      allowed: true,
      resetTime: current.resetTime,
    };
  }
  
  /**
   * Forward request to origin with timeout
   */
  private async forwardToOrigin(request: Request, _env: any, _ctx: ExecutionContext): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);
    
    try {
      const response = await fetch(request, {
        signal: controller.signal,
        // Note: cf options would be available in actual Cloudflare Workers environment
        // For TypeScript compatibility, we'll omit them here
      });
      
      clearTimeout(timeoutId);
      return response;
      
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }
  
  /**
   * Apply response security controls
   */
  private async secureResponse(response: Response, _context: RequestContext): Promise<Response> {
    // Check response size
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > this.config.maxResponseSize) {
      return this.createSecurityResponse('Response too large', 413);
    }
    
    // Sanitize response headers
    const sanitizedHeaders = new Headers();
    
    for (const [name, value] of response.headers.entries()) {
      const headerName = name.toLowerCase();
      
      // Remove sensitive headers
      const sensitiveHeaders = ['server', 'x-powered-by', 'x-aspnet-version', 'x-generator'];
      if (!sensitiveHeaders.includes(headerName)) {
        sanitizedHeaders.set(name, value);
      }
    }
    
    // Create new response with sanitized headers
    const responseBody = response.body;
    return new Response(responseBody, {
      status: response.status,
      statusText: response.statusText,
      headers: sanitizedHeaders,
    });
  }
  
  /**
   * Add security headers to response
   */
  private addSecurityHeaders(response: Response, requestId: string, violations: SecurityViolation[]): void {
    response.headers.set('X-Request-ID', requestId);
    response.headers.set('X-Security-Processed', 'true');
    response.headers.set('X-Violations-Count', violations.length.toString());
    
    if (violations.length > 0) {
      response.headers.set('X-Security-Violations', violations.map(v => v.type).join(','));
    }
    
    // Add standard security headers
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('X-XSS-Protection', '1; mode=block');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    
    // Add CSP header
    response.headers.set('Content-Security-Policy', 
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https://api.stripe.com"
    );
  }
  
  /**
   * Create security response
   */
  private createSecurityResponse(message: string, status: number, headers?: Record<string, string>): Response {
    const response = new Response(JSON.stringify({
      error: 'Security violation',
      message,
      timestamp: new Date().toISOString(),
    }), {
      status,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    });
    
    return response;
  }
  
  /**
   * Helper methods
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }
  
  private containsInjectionPatterns(value: string): boolean {
    const patterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi,
      /eval\s*\(/gi,
      /expression\s*\(/gi,
    ];
    
    return patterns.some(pattern => pattern.test(value));
  }
  
  private containsCacheManipulationPatterns(value: string): boolean {
    const patterns = [
      /no-cache/gi,
      /no-store/gi,
      /must-revalidate/gi,
      /max-age\s*=\s*0/gi,
    ];
    
    return patterns.some(pattern => pattern.test(value));
  }
  
  private async logViolations(violations: SecurityViolation[]): Promise<void> {
    for (const violation of violations) {
      console.warn('Security violation detected:', {
        type: violation.type,
        severity: violation.severity,
        description: violation.description,
        clientIP: violation.context.clientIP,
        userAgent: violation.context.userAgent,
        url: violation.context.url,
        timestamp: new Date().toISOString(),
      });
    }
  }
  
  private async logRequest(context: RequestContext, violations: SecurityViolation[], duration: number): Promise<void> {
    console.log('Request processed:', {
      requestId: context.id,
      clientIP: context.clientIP,
      method: context.method,
      url: context.url,
      violations: violations.length,
      duration,
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Export the worker for Cloudflare Workers deployment
 */
export default {
  async fetch(request: Request, env: any, ctx: ExecutionContext): Promise<Response> {
    const securityWorker = new SecurityWorker({
      allowedEgressHosts: env.ALLOWED_EGREG_HOSTS?.split(',') || [
        'api.stripe.com',
        'tsa.c2pa.org',
        'manifests.c2pa.org',
        'storage.c2pa.org',
      ],
      rateLimitPerIp: parseInt(env.RATE_LIMIT_PER_IP) || 100,
      maxRequestSize: parseInt(env.MAX_REQUEST_SIZE) || 10485760,
    });
    
    return await securityWorker.handleRequest(request, env, ctx);
  },
};
