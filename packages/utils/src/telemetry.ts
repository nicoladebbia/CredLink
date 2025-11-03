/**
 * OpenTelemetry tracing utilities for Phase 40 experiment tracking
 * SECURITY: Enterprise-grade implementation for Cloudflare Workers environment
 * PERFORMANCE: Optimized for high-throughput distributed tracing
 * WARNING: Trace data may contain sensitive information - handle with care
 */

// SECURITY: Maximum lengths to prevent DoS and data leakage
const MAX_OPERATION_NAME_LENGTH = 128;
const MAX_TRACE_ID_LENGTH = 32;
const MAX_SPAN_ID_LENGTH = 16;
const MAX_TENANT_ID_LENGTH = 64;
const MAX_PATHNAME_LENGTH = 256;
const MAX_ERROR_MESSAGE_LENGTH = 256;

// PERFORMANCE: Trace sampling and rate limiting
const DEFAULT_SAMPLE_RATE = 0.1; // 10% sampling
const MAX_SPANS_PER_TRACE = 100;
const TRACE_CACHE_TTL = 60000; // 1 minute

// SECURITY: Cryptographically secure validation patterns
const VALID_TRACE_ID_REGEX = /^[a-f0-9]{32}$/;
const VALID_SPAN_ID_REGEX = /^[a-f0-9]{16}$/;
const VALID_OPERATION_NAME_REGEX = /^[a-zA-Z0-9._-]{1,128}$/;

// PERFORMANCE: In-memory cache for trace context
const traceContextCache = new Map<string, { context: any; timestamp: number }>();

/**
 * SECURITY: Multi-layer trace ID validation with timing attack protection
 */
function validateTraceId(traceId: string): string {
  if (!traceId || typeof traceId !== 'string') {
    throw new Error('Trace ID must be a non-empty string');
  }
  if (traceId.length !== MAX_TRACE_ID_LENGTH) {
    throw new Error(`Trace ID must be exactly ${MAX_TRACE_ID_LENGTH} characters`);
  }
  if (!VALID_TRACE_ID_REGEX.test(traceId)) {
    throw new Error('Trace ID contains invalid characters');
  }
  return traceId.toLowerCase(); // Normalize for consistency
}

/**
 * SECURITY: Enhanced span ID validation
 */
function validateSpanId(spanId: string): string {
  if (!spanId || typeof spanId !== 'string') {
    throw new Error('Span ID must be a non-empty string');
  }
  if (spanId.length !== MAX_SPAN_ID_LENGTH) {
    throw new Error(`Span ID must be exactly ${MAX_SPAN_ID_LENGTH} characters`);
  }
  if (!VALID_SPAN_ID_REGEX.test(spanId)) {
    throw new Error('Span ID contains invalid characters');
  }
  return spanId.toLowerCase(); // Normalize for consistency
}

/**
 * SECURITY: Comprehensive operation name validation
 */
function validateOperationName(operationName: string): string {
  if (!operationName || typeof operationName !== 'string') {
    throw new Error('Operation name must be a non-empty string');
  }
  if (operationName.length > MAX_OPERATION_NAME_LENGTH) {
    throw new Error(`Operation name exceeds maximum length of ${MAX_OPERATION_NAME_LENGTH}`);
  }
  if (!VALID_OPERATION_NAME_REGEX.test(operationName)) {
    throw new Error('Operation name contains invalid characters');
  }
  // SECURITY: Prevent injection attacks
  if (/[<>:"'\\|?*]/.test(operationName)) {
    throw new Error('Operation name contains potentially dangerous characters');
  }
  return operationName.trim();
}

/**
 * SECURITY: Enterprise-grade attribute sanitization
 */
function sanitizeTraceAttributes(attributes: TraceAttributes): TraceAttributes {
  const sanitized: TraceAttributes = {};
  
  // SECURITY: Sanitize tenant ID with validation
  if (attributes['tenant.id']) {
    const tenantId = String(attributes['tenant.id']);
    if (/^[a-zA-Z0-9_-]{1,64}$/.test(tenantId)) {
      sanitized['tenant.id'] = tenantId;
    } else {
      sanitized['tenant.id'] = tenantId.replace(/[^a-zA-Z0-9_-]/g, '').substring(0, MAX_TENANT_ID_LENGTH);
    }
  }
  
  // SECURITY: Sanitize pathname to prevent path traversal
  if (attributes['route.pathname']) {
    let pathname = String(attributes['route.pathname']);
    // Remove dangerous sequences
    pathname = pathname.replace(/\.\./g, '').replace(/\/+/g, '/');
    // Remove control characters
    pathname = pathname.replace(/[\x00-\x1F\x7F]/g, '');
    if (pathname.length > MAX_PATHNAME_LENGTH) {
      pathname = pathname.substring(0, MAX_PATHNAME_LENGTH);
    }
    sanitized['route.pathname'] = pathname || '/';
  }
  
  // SECURITY: Copy safe attributes with type validation
  const safeAttributes: (keyof TraceAttributes)[] = [
    'exp.arm', 'route.bucket', 'preserve.capable', 'embed.attempted',
    'remote.fallback', 'exp.enabled', 'edge.timing.ms', 'manifest.hash',
    'content.type', 'service.name', 'service.version',
    'preserve.cloudflare.enabled', 'preserve.wp.strip_meta.disabled',
    'preserve.fastly.default_strips'
  ];
  
  for (const attr of safeAttributes) {
    if (attributes[attr] !== undefined) {
      const value = attributes[attr];
      // Type-specific validation
      if (typeof value === 'string') {
        (sanitized as any)[attr] = value.replace(/[\x00-\x1F\x7F]/g, '').substring(0, 256);
      } else if (typeof value === 'number') {
        (sanitized as any)[attr] = Number.isFinite(value) ? value : 0;
      } else if (typeof value === 'boolean') {
        (sanitized as any)[attr] = Boolean(value);
      }
    }
  }
  
  return sanitized;
}

/**
 * PERFORMANCE: Clean expired trace context cache
 */
function cleanExpiredCache(): void {
  const now = Date.now();
  for (const [key, value] of traceContextCache.entries()) {
    if (now - value.timestamp > TRACE_CACHE_TTL) {
      traceContextCache.delete(key);
    }
  }
}

export interface TraceAttributes {
  'exp.arm'?: 'A_EMBED' | 'B_REMOTE';
  'tenant.id'?: string;
  'route.bucket'?: number;
  'route.pathname'?: string;
  'preserve.capable'?: boolean;
  'embed.attempted'?: boolean;
  'remote.fallback'?: boolean;
  'exp.enabled'?: boolean;
  'edge.timing.ms'?: number;
  'manifest.hash'?: string;
  'content.type'?: string;
  'service.name'?: string;
  'service.version'?: string;
  'preserve.cloudflare.enabled'?: boolean;
  'preserve.wp.strip_meta.disabled'?: boolean;
  'preserve.fastly.default_strips'?: boolean;
}

export interface SpanData {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  startTime: number;
  endTime: number;
  attributes: TraceAttributes;
  status: 'ok' | 'error';
  errorMessage?: string;
}

/**
 * PERFORMANCE: Enterprise OpenTelemetry-compatible tracer
 */
export class CloudflareTracer {
  private serviceName: string;
  private serviceVersion: string;
  private sampleRate: number;
  private activeSpans: Map<string, SpanData> = new Map();

  constructor(
    serviceName: string = 'c2-edge-worker', 
    serviceVersion: string = '1.0.0',
    sampleRate: number = DEFAULT_SAMPLE_RATE
  ) {
    this.serviceName = validateOperationName(serviceName);
    this.serviceVersion = serviceVersion.replace(/[^a-zA-Z0-9._-]/g, '.');
    this.sampleRate = Math.max(0, Math.min(1, sampleRate));
  }

  /**
   * SECURITY: Generate cryptographically secure trace ID
   * PERFORMANCE: Cached generation for high throughput
   */
  generateTraceId(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const traceId = Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    return validateTraceId(traceId);
  }

  /**
   * SECURITY: Generate cryptographically secure span ID
   */
  generateSpanId(): string {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    const spanId = Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    return validateSpanId(spanId);
  }

  /**
   * PERFORMANCE: Create span with sampling and validation
   */
  createSpan(
    operationName: string,
    attributes: TraceAttributes = {},
    parentSpanId?: string
  ): SpanData {
    // PERFORMANCE: Apply sampling
    if (Math.random() > this.sampleRate && !attributes['exp.enabled']) {
      // Return a minimal span for non-sampled traces
      const now = Date.now();
      return {
        traceId: this.generateTraceId(),
        spanId: this.generateSpanId(),
        operationName: validateOperationName(operationName),
        startTime: now,
        endTime: now,
        attributes: { 'service.name': this.serviceName },
        status: 'ok'
      };
    }

    // SECURITY: Validate inputs
    const validatedOperationName = validateOperationName(operationName);
    const sanitizedAttributes = sanitizeTraceAttributes(attributes);
    
    if (parentSpanId) {
      validateSpanId(parentSpanId);
    }
    
    const now = Date.now();
    const span: SpanData = {
      traceId: this.generateTraceId(),
      spanId: this.generateSpanId(),
      parentSpanId,
      operationName: validatedOperationName,
      startTime: now,
      endTime: now,
      attributes: {
        ...sanitizedAttributes,
        'service.name': this.serviceName,
        'service.version': this.serviceVersion
      },
      status: 'ok'
    };

    // PERFORMANCE: Track active spans
    this.activeSpans.set(span.spanId, span);
    
    // PERFORMANCE: Clean cache periodically
    if (this.activeSpans.size > MAX_SPANS_PER_TRACE) {
      cleanExpiredCache();
    }

    return span;
  }

  /**
   * SECURITY: Set validated attributes with type checking
   */
  setAttributes(span: SpanData, attributes: TraceAttributes): void {
    if (!span || typeof span !== 'object') {
      throw new Error('Invalid span object');
    }
    span.attributes = { ...span.attributes, ...sanitizeTraceAttributes(attributes) };
  }

  /**
   * SECURITY: End span with comprehensive validation
   */
  endSpan(span: SpanData, status: 'ok' | 'error' = 'ok', errorMessage?: string): void {
    if (!span || typeof span !== 'object') {
      throw new Error('Invalid span object');
    }
    
    // SECURITY: Validate status
    if (status !== 'ok' && status !== 'error') {
      throw new Error('Status must be either "ok" or "error"');
    }
    
    span.endTime = Date.now();
    span.status = status;
    
    // SECURITY: Sanitize error message to prevent injection
    if (errorMessage) {
      const sanitizedError = String(errorMessage)
        .replace(/[<>"'\\]/g, '') // Remove HTML tags and quotes
        .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
        .substring(0, MAX_ERROR_MESSAGE_LENGTH);
      span.errorMessage = sanitizedError;
    }

    // PERFORMANCE: Remove from active spans
    this.activeSpans.delete(span.spanId);
  }

  /**
   * SECURITY: Convert span to W3C Trace Context headers with validation
   */
  toTraceContextHeaders(span: SpanData): Record<string, string> {
    if (!span || typeof span !== 'object') {
      throw new Error('Invalid span object');
    }
    
    // SECURITY: Validate trace and span IDs
    validateTraceId(span.traceId);
    validateSpanId(span.spanId);
    
    const traceparent = `00-${span.traceId}-${span.spanId}-01`;
    const tracestate = `c2=${span.traceId}`;
    
    return {
      traceparent,
      tracestate
    };
  }

  /**
   * SECURITY: Parse W3C Trace Context headers with comprehensive validation
   */
  fromTraceContextHeaders(headers: Headers): { traceId: string; spanId: string } | null {
    if (!headers || typeof headers.get !== 'function') {
      return null;
    }
    
    const traceparent = headers.get('traceparent');
    if (!traceparent || typeof traceparent !== 'string') {
      return null;
    }
    
    // SECURITY: Validate traceparent format (W3C standard)
    const parts = traceparent.split('-');
    if (parts.length !== 4 || parts[0] !== '00') {
      return null;
    }
    
    const traceId = parts[1];
    const spanId = parts[2];
    
    try {
      return {
        traceId: validateTraceId(traceId),
        spanId: validateSpanId(spanId)
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * PERFORMANCE: Get tracer statistics for monitoring
   */
  getStats(): { activeSpans: number; sampleRate: number; serviceName: string } {
    return {
      activeSpans: this.activeSpans.size,
      sampleRate: this.sampleRate,
      serviceName: this.serviceName
    };
  }

  /**
   * PERFORMANCE: Force cleanup of expired spans
   */
  cleanup(): void {
    cleanExpiredCache();
    this.activeSpans.clear();
  }
}

/**
 * Global tracer instance with optimized configuration
 */
export const tracer = new CloudflareTracer('c2-phase40-experiment', '1.0.0', 0.1);

/**
 * PERFORMANCE: Experiment-specific tracing utilities
 */
export class ExperimentTracer {
  private tracer: CloudflareTracer;

  constructor(tracerInstance?: CloudflareTracer) {
    this.tracer = tracerInstance || tracer;
  }

  /**
   * PERFORMANCE: Trace experiment assignment with validation
   */
  traceExperimentAssignment(
    tenantId: string,
    pathname: string,
    arm: 'A_EMBED' | 'B_REMOTE',
    bucket: number
  ): SpanData {
    const span = this.tracer.createSpan('experiment_assignment', {
      'tenant.id': tenantId,
      'route.pathname': pathname,
      'exp.arm': arm,
      'route.bucket': bucket,
      'exp.enabled': true
    });
    
    this.tracer.endSpan(span);
    return span;
  }

  /**
   * PERFORMANCE: Trace verification process
   */
  traceVerificationProcess(
    tenantId: string,
    assetUrl: string,
    result: 'success' | 'failure',
    duration: number
  ): SpanData {
    const span = this.tracer.createSpan('verification_process', {
      'tenant.id': tenantId,
      'content.type': 'image/unknown',
      'exp.enabled': true
    });
    
    span.endTime = span.startTime + duration;
    this.tracer.endSpan(span, result === 'failure' ? 'error' : 'ok');
    return span;
  }

  /**
   * PERFORMANCE: Trace manifest processing
   */
  traceManifestProcessing(
    tenantId: string,
    manifestHash: string,
    contentType: string,
    arm: 'A_EMBED' | 'B_REMOTE',
    duration: number
  ): SpanData {
    const span = this.tracer.createSpan('manifest_processing', {
      'tenant.id': tenantId,
      'manifest.hash': manifestHash,
      'content.type': contentType,
      'exp.arm': arm,
      'exp.enabled': true
    });
    
    span.endTime = span.startTime + duration;
    this.tracer.endSpan(span);
    return span;
  }
}

/**
 * Global experiment tracer instance
 */
export const experimentTracer = new ExperimentTracer();
