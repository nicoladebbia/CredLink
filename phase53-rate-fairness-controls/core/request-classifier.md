# Phase 53 — Request Classification Implementation

## Request Classification System

### Request Classifier
```typescript
import { EventEmitter } from 'events';
import { randomBytes } from 'crypto';

/**
 * Request classifier for different traffic types
 * Implements classification logic for free/anonymous, paid, and privileged traffic
 */
export class RequestClassifier extends EventEmitter {
  private readonly config: ClassificationConfig;
  private readonly tenantRegistry: TenantRegistry;
  private readonly globalPoolMonitor: GlobalPoolMonitor;

  constructor(
    config: ClassificationConfig,
    tenantRegistry: TenantRegistry,
    globalPoolMonitor: GlobalPoolMonitor
  ) {
    super();
    this.config = config;
    this.tenantRegistry = tenantRegistry;
    this.globalPoolMonitor = globalPoolMonitor;
  }

  /**
   * Classify incoming request
   * Returns classification with routing decisions
   */
  async classify(request: IncomingRequest): Promise<ClassificationResult> {
    const startTime = Date.now();
    
    try {
      // Step 1: Identify tenant
      const tenantInfo = await this.identifyTenant(request);
      
      // Step 2: Determine request class
      const requestClass = this.determineRequestClass(tenantInfo, request);
      
      // Step 3: Apply routing rules
      const routingDecision = await this.applyRoutingRules(requestClass, request);
      
      // Step 4: Check global pool availability for anonymous requests
      if (requestClass === 'anonymous') {
        const globalPoolAvailable = await this.globalPoolMonitor.checkAvailability();
        if (!globalPoolAvailable) {
          return {
            requestClass: 'anonymous',
            tenantInfo: null,
            routingDecision: 'reject',
            reason: 'global_pool_exhausted',
            retryAfter: this.config.anonymousRetryAfter,
            processingTime: Date.now() - startTime
          };
        }
      }
      
      const result: ClassificationResult = {
        requestClass,
        tenantInfo,
        routingDecision,
        reason: this.getRoutingReason(routingDecision, requestClass),
        processingTime: Date.now() - startTime
      };

      this.emit('request_classified', result);
      return result;
      
    } catch (error) {
      this.emit('classification_error', error);
      
      return {
        requestClass: 'anonymous',
        tenantInfo: null,
        routingDecision: 'reject',
        reason: 'classification_error',
        processingTime: Date.now() - startTime
      };
    }
  }

  /**
   * Identify tenant from request
   */
  private async identifyTenant(request: IncomingRequest): Promise<TenantInfo | null> {
    // Check API key first
    const apiKey = this.extractApiKey(request);
    if (apiKey) {
      const tenant = await this.tenantRegistry.getByApiKey(apiKey);
      if (tenant) {
        return tenant;
      }
    }

    // Check JWT token
    const token = this.extractAuthToken(request);
    if (token) {
      const tenant = await this.tenantRegistry.getByToken(token);
      if (tenant) {
        return tenant;
      }
    }

    // Check for session cookie (web interface)
    const sessionId = this.extractSessionId(request);
    if (sessionId) {
      const tenant = await this.tenantRegistry.getBySession(sessionId);
      if (tenant) {
        return tenant;
      }
    }

    return null; // Anonymous
  }

  /**
   * Determine request class based on tenant and request type
   */
  private determineRequestClass(
    tenantInfo: TenantInfo | null,
    request: IncomingRequest
  ): RequestClass {
    if (!tenantInfo) {
      return 'anonymous';
    }

    // Check for privileged event mode
    if (this.isEventModeRequest(request, tenantInfo)) {
      return 'privileged';
    }

    // Check tenant tier
    if (tenantInfo.tier === 'starter' || tenantInfo.tier === 'growth' || tenantInfo.tier === 'scale') {
      return 'paid';
    }

    return 'anonymous'; // Fallback
  }

  /**
   * Apply routing rules based on classification
   */
  private async applyRoutingRules(
    requestClass: RequestClass,
    request: IncomingRequest
  ): Promise<RoutingDecision> {
    switch (requestClass) {
      case 'anonymous':
        return this.handleAnonymousRequest(request);
        
      case 'paid':
        return this.handlePaidRequest(request);
        
      case 'privileged':
        return this.handlePrivilegedRequest(request);
        
      default:
        return 'reject';
    }
  }

  private handleAnonymousRequest(request: IncomingRequest): RoutingDecision {
    // Anonymous requests: cache-only during contention
    if (this.isCacheOnlyRequest(request)) {
      return 'cache_only';
    }
    
    // Check if request type is allowed for anonymous
    if (!this.isAllowedForAnonymous(request)) {
      return 'reject';
    }
    
    return 'cache_first';
  }

  private handlePaidRequest(request: IncomingRequest): RoutingDecision {
    // Paid requests: full access with rate limiting
    return 'full_access';
  }

  private handlePrivilegedRequest(request: IncomingRequest): RoutingDecision {
    // Privileged requests: bypass global pool, elevated priority
    return 'priority_access';
  }

  private isEventModeRequest(request: IncomingRequest, tenantInfo: TenantInfo): boolean {
    const eventModeHeader = request.headers['x-event-mode'];
    const eventToken = request.headers['x-event-token'];
    
    if (!eventModeHeader || !eventToken) {
      return false;
    }

    // Validate event token for trusted tenants
    return this.tenantRegistry.validateEventToken(tenantInfo.id, eventToken);
  }

  private isCacheOnlyRequest(request: IncomingRequest): boolean {
    // Verify requests are always cache-first for anonymous
    return request.path.includes('/verify');
  }

  private isAllowedForAnonymous(request: IncomingRequest): boolean {
    const allowedPaths = ['/verify', '/status', '/health'];
    return allowedPaths.some(path => request.path.startsWith(path));
  }

  private extractApiKey(request: IncomingRequest): string | null {
    const apiKey = request.headers['x-api-key'];
    if (apiKey && typeof apiKey === 'string' && apiKey.length > 0) {
      return apiKey;
    }
    
    const authHeader = request.headers['authorization'];
    if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }
    
    return null;
  }

  private extractAuthToken(request: IncomingRequest): string | null {
    const authHeader = request.headers['authorization'];
    if (!authHeader) {
      return null;
    }

    if (authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    return null;
  }

  private extractSessionToken(request: IncomingRequest): string | null {
    const cookieHeader = request.headers['cookie'];
    if (!cookieHeader || typeof cookieHeader !== 'string') {
      return null;
    }
    
    const cookies = cookieHeader.split(';').map(c => c.trim());
    const sessionCookie = cookies.find(c => c.startsWith('session='));
    
    if (sessionCookie && sessionCookie.length > 8) {
      const token = sessionCookie.substring(8);
      // Validate session token format
      if (token.length > 10 && /^[a-zA-Z0-9_-]+$/.test(token)) {
        return token;
      }
    }
    
    return null;
  }

  private getRoutingReason(decision: RoutingDecision, requestClass: RequestClass): string {
    switch (decision) {
      case 'cache_only':
        return 'anonymous_cache_only';
      case 'cache_first':
        return 'anonymous_cache_first';
      case 'full_access':
        return 'paid_full_access';
      case 'priority_access':
        return 'privileged_priority';
      case 'reject':
        return requestClass === 'anonymous' ? 'anonymous_not_allowed' : 'request_rejected';
      default:
        return 'unknown';
    }
  }

  /**
   * Get classification statistics
   */
  getStatistics(): ClassificationStatistics {
    return {
      totalClassified: this.metrics.totalClassified,
      anonymousRequests: this.metrics.anonymousRequests,
      paidRequests: this.metrics.paidRequests,
      privilegedRequests: this.metrics.privilegedRequests,
      averageProcessingTime: this.metrics.averageProcessingTime,
      errorRate: this.metrics.errorRate
    };
  }

  private metrics = {
    totalClassified: 0,
    anonymousRequests: 0,
    paidRequests: 0,
    privilegedRequests: 0,
    averageProcessingTime: 0,
    errorRate: 0
  };
}

/**
 * Tenant registry for managing tenant information
 */
export class TenantRegistry {
  private readonly tenants: Map<string, TenantInfo> = new Map();
  private readonly apiKeys: Map<string, string> = new Map(); // apiKey -> tenantId
  private readonly eventTokens: Map<string, EventToken> = new Map();

  constructor() {
    this.loadDefaultTenants();
  }

  async getByApiKey(apiKey: string): Promise<TenantInfo | null> {
    const tenantId = this.apiKeys.get(apiKey);
    return tenantId ? this.tenants.get(tenantId) || null : null;
  }

  async getByToken(token: string): Promise<TenantInfo | null> {
    // In a real implementation, validate JWT token
    // For now, return null
    return null;
  }

  async getBySession(sessionId: string): Promise<TenantInfo | null> {
    // In a real implementation, validate session
    // For now, return null
    return null;
  }

  validateEventToken(tenantId: string, eventToken: string): boolean {
    const token = this.eventTokens.get(eventToken);
    return token ? token.tenantId === tenantId && token.expiresAt > Date.now() : false;
  }

  private loadDefaultTenants(): void {
    // Load default tenants for testing
    const defaultTenants: TenantInfo[] = [
      {
        id: 'tenant_starter_001',
        name: 'Starter Tenant',
        tier: 'starter',
        apiKey: 'starter_key_001',
        rateLimit: { steadyRps: 300, burstTokens: 1200 },
        eventMode: false
      },
      {
        id: 'tenant_growth_001',
        name: 'G Tenant',
        tier: 'growth',
        apiKey: 'growth_key_abc123',
        rateLimit: { steadyRps: 360, burstTokens: 1440 },
        eventMode: false
      },
      {
        id: 'tenant_scale_001',
        name: 'Scale Tenant',
        tier: 'scale',
        apiKey: 'scale_key_xyz',
        rateLimit: { steadyRps: 600, burstTokens: 2400 },
        eventMode: false
      },
      {
        id: 'tenant_newsroom_001',
        name: 'Newsroom Tenant',
        tier: 'scale',
        apiKey: 'newsroom_key_123',
        rateLimit: { steadyRps: 100, burstTokens: 2400 },
        eventMode: true // Privileged tenant
      }
    ];

    for (const tenant of defaultTenants) {
      this.tenants.set(tenant.id, tenant);
      this.apiKeys.set(tenant.apiKey, tenant.id);
    }

    // Add event tokens for privileged tenants
    this.eventTokens.set('event_token_newsroom_001', {
      tenantId: 'tenant_newsroom_001',
      expiresAt: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
    });
  }
}

/**
 * Global pool monitor for anonymous traffic protection
 */
export class GlobalPoolMonitor {
  private readonly config: GlobalPoolConfig;
  private currentUtilization = 0;

  constructor(config: GlobalPoolConfig) {
    this.config = config;
  }

  async checkAvailability(): Promise<boolean> {
    // Simulate global pool check
    const utilizationPercentage = (this.currentUtilization / this.config.maxRps) * 100;
    
    return utilizationPercentage < this.config.anonymousThreshold;
  }

  updateUtilization(currentRps: number): void {
    this.currentUtilization = currentRps;
  }

  getUtilization(): number {
    return this.currentUtilization;
  }

  getAvailabilityStatus(): PoolStatus {
    const utilizationPercentage = (this.currentUtilization / this.config.maxRps) * 100;
    
    return {
      currentRps: this.currentUtilization,
      maxRps: this.config.maxRps,
      utilizationPercentage,
      availableForAnonymous: utilizationPercentage < this.config.anonymousThreshold,
      status: utilizationPercentage >= 90 ? 'critical' : 
              utilizationPercentage >= 80 ? 'warning' : 'healthy'
    };
  }
}

/**
 * Event mode manager for privileged tenant elevation
 */
export class EventModeManager {
  private readonly activeEvents: Map<string, ActiveEvent> = new Map();

  /**
   * Activate event mode for tenant
   */
  async activateEventMode(
    tenantId: string,
    eventConfig: EventConfig
  ): Promise<void> {
    const activeEvent: ActiveEvent = {
      tenantId,
      config: eventConfig,
      activatedAt: Date.now(),
      expiresAt: Date.now() + (eventConfig.durationMinutes * 60 * 1000)
    };

    this.activeEvents.set(tenantId, activeEvent);
    
    // Generate event token
    const eventToken = this.generateEventToken(tenantId, activeEvent);
    
    // Store token for validation
    // In a real implementation, this would be in Redis
    this.emit('event_mode_activated', { tenantId, eventToken });
  }

  /**
   * Deactivate event mode for tenant
   */
  async deactivateEventMode(tenantId: string): Promise<void> {
    this.activeEvents.delete(tenantId);
    this.emit('event_mode_deactivated', { tenantId });
  }

  /**
   * Check if tenant has active event mode
   */
  hasActiveEventMode(tenantId: string): boolean {
    const event = this.activeEvents.get(tenantId);
    if (!event) {
      return false;
    }

    // Check if event has expired
    if (Date.now() > event.expiresAt) {
      this.activeEvents.delete(tenantId);
      return false;
    }

    return true;
  }

  /**
   * Get active event configuration
   */
  getEventConfig(tenantId: string): EventConfig | null {
    const event = this.activeEvents.get(tenantId);
    if (!event || Date.now() > event.expiresAt) {
      return null;
    }

    return event.config;
  }

  private generateEventToken(tenantId: string, event: ActiveEvent): string {
    // Generate cryptographically secure token
    const tokenData = `${event.tenantId}:${event.eventId}:${event.expiresAt}`;
    const hash = require('crypto').createHash('sha256').update(tokenData).digest('hex');
    const randomSuffix = randomBytes(8).toString('hex');
    return `${hash}_${randomSuffix}`;
  }

  /**
   * Cleanup expired events
   */
  cleanupExpiredEvents(): void {
    const now = Date.now();
    
    for (const [tenantId, event] of this.activeEvents.entries()) {
      if (now > event.expiresAt) {
        this.activeEvents.delete(tenantId);
      }
    }
  }
}

// Type definitions
export interface IncomingRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  body?: any;
  timestamp?: number;
}

export interface ClassificationResult {
  requestClass: RequestClass;
  tenantInfo: TenantInfo | null;
  routingDecision: RoutingDecision;
  reason: string;
  processingTime: number;
  retryAfter?: number;
}

export type RequestClass = 'anonymous' | 'paid' | 'privileged';
export type RoutingDecision = 'cache_only' | 'cache_first' | 'full_access' | 'priority_access' | 'reject';

export interface TenantInfo {
  id: string;
  tier: TenantTier;
}

export type TenantTier = 'starter' | 'growth' | 'scale';

export interface RateLimitInfo {
  steadyRps: number;
  burstTokens: number;
}

export interface EventToken {
  tenantId: string;
  expiresAt: number;
}

export interface PoolStatus {
  currentRps: number;
  maxRps: number;
  utilizationPercentage: number;
  availableForAnonymous: boolean;
  status: 'healthy' | 'warning' | 'critical';
}

export interface ActiveEvent {
  tenantId: string;
  config: EventConfig;
  activatedAt: number;
  expiresAt: number;
}

export interface EventConfig {
  durationMinutes: number;
  elevatedRateLimit: RateLimitInfo;
  bypassGlobalPool: boolean;
  priority: number;
}

export interface ClassificationStatistics {
  totalClassified: number;
  anonymousRequests: number;
  paidRequests: number;
  privilegedRequests: number;
  averageProcessingTime: number;
  errorRate: number;
}

export interface ClassificationConfig {
  anonymousRetryAfter: number;
  enableEventMode: boolean;
}

export interface GlobalPoolConfig {
  maxRps: number;
  anonymousThreshold: number; // Percentage threshold for anonymous traffic
}

// Default configurations
export const DEFAULT_CLASSIFICATION_CONFIG: ClassificationConfig = {
  anonymousRetryAfter: 30,
  enableEventMode: true
};

export const DEFAULT_GLOBAL_POOL_CONFIG: GlobalPoolConfig = {
  maxRps: 50000,
  anonymousThreshold: 20 // 20% threshold for anonymous traffic
};
```
