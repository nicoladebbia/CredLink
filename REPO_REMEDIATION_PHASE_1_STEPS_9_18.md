# CredLink Remediation Phase 1: Steps 9-18
## Completing Critical Security & Correctness Fixes

---

### Step 9: CRED-009 - Memory Leak Fixes with LRU Caching

**Owner**: Backend Lead  
**Effort**: 2 days  
**Risk**: Medium (caching behavior changes)  
**Blocked By**: Steps 0, 6  
**Blocks**: Step 32

**Rationale**: **CRITICAL** - Multiple in-memory caches grow without bounds. Evidence:
- `apps/api/src/services/proof-storage.ts:26-27` - `private cache: Map<string, ProofRecord> = new Map()`
- `packages/security-monitor/src/index.ts:66-67` - `private events: SecurityEvent[] = []` unbounded array
- No size limits or TTL policies implemented

**Prerequisites**:
- All existing tests passing
- Memory usage baseline established
- Cache performance requirements defined

**Implementation**:

**1. LRU Cache Implementation**:
```typescript
// packages/cache/src/lru-cache.ts
export interface LRUCacheOptions {
    maxSize: number;
    ttlMs?: number;
    onEvict?: (key: string, value: any) => void;
}

export class LRUCache<K, V> {
    private cache: Map<K, { value: V; timestamp: number }> = new Map();
    private maxSize: number;
    private ttlMs?: number;
    private onEvict?: (key: K, value: V) => void;

    constructor(options: LRUCacheOptions) {
        this.maxSize = options.maxSize;
        this.ttlMs = options.ttlMs;
        this.onEvict = options.onEvict;
    }

    get(key: K): V | undefined {
        const entry = this.cache.get(key);
        
        if (!entry) {
            return undefined;
        }

        // Check TTL
        if (this.ttlMs && Date.now() - entry.timestamp > this.ttlMs) {
            this.cache.delete(key);
            return undefined;
        }

        // Move to end (LRU)
        this.cache.delete(key);
        this.cache.set(key, entry);
        
        return entry.value;
    }

    set(key: K, value: V): void {
        // Remove existing entry
        if (this.cache.has(key)) {
            this.cache.delete(key);
        }

        // Evict if over size limit
        while (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            const firstValue = this.cache.get(firstKey)!;
            this.cache.delete(firstKey);
            
            if (this.onEvict) {
                this.onEvict(firstKey, firstValue.value);
            }
        }

        // Add new entry
        this.cache.set(key, {
            value,
            timestamp: Date.now()
        });
    }

    has(key: K): boolean {
        const entry = this.cache.get(key);
        
        if (!entry) {
            return false;
        }

        // Check TTL
        if (this.ttlMs && Date.now() - entry.timestamp > this.ttlMs) {
            this.cache.delete(key);
            return false;
        }

        return true;
    }

    delete(key: K): boolean {
        return this.cache.delete(key);
    }

    clear(): void {
        this.cache.clear();
    }

    size(): number {
        return this.cache.size;
    }

    cleanup(): number {
        if (!this.ttlMs) {
            return 0;
        }

        const now = Date.now();
        const keysToDelete: K[] = [];
        
        for (const [key, entry] of this.cache.entries()) {
            if (now - entry.timestamp > this.ttlMs) {
                keysToDelete.push(key);
            }
        }

        for (const key of keysToDelete) {
            const entry = this.cache.get(key)!;
            this.cache.delete(key);
            
            if (this.onEvict) {
                this.onEvict(key, entry.value);
            }
        }

        return keysToDelete.length;
    }

    getStats(): { size: number; maxSize: number; hitRate?: number } {
        return {
            size: this.cache.size,
            maxSize: this.maxSize
        };
    }
}
```

**2. Enhanced Proof Storage with LRU**:
```typescript
// apps/api/src/services/proof-storage-lru.ts
import { LRUCache } from '@credlink/cache';
import { randomUUID } from 'crypto';
import { C2PAManifest } from './manifest-builder';
import { logger } from '../utils/logger';
import { DataEncryption } from './encryption';
import { writeFile, readFile, mkdir, access } from 'fs/promises';
import { join } from 'path';

export class LRUProofStorage {
    private cache: LRUCache<string, ProofRecord>;
    private hashIndex: LRUCache<string, string>;
    private storagePath: string;
    private useLocalFilesystem: boolean;
    private encryption: DataEncryption;
    private writeQueue: Promise<void> = Promise.resolve();
    private cleanupInterval: NodeJS.Timeout;

    constructor() {
        this.storagePath = process.env.PROOF_STORAGE_PATH || './proofs';
        this.useLocalFilesystem = process.env.USE_LOCAL_PROOF_STORAGE === 'true';
        this.encryption = new DataEncryption({
            kmsKeyId: process.env.KMS_KEY_ID
        });

        // Initialize LRU caches with size limits
        this.cache = new LRUCache<string, ProofRecord>({
            maxSize: 10000, // Max 10,000 proofs in memory
            ttlMs: 60 * 60 * 1000, // 1 hour TTL
            onEvict: (key, value) => {
                logger.debug('Proof evicted from cache', { proofId: key });
            }
        });

        this.hashIndex = new LRUCache<string, string>({
            maxSize: 10000,
            ttlMs: 60 * 60 * 1000,
            onEvict: (key, value) => {
                logger.debug('Hash index evicted', { imageHash: key });
            }
        });

        if (this.useLocalFilesystem) {
            this.ensureStorageDirectory();
        }

        // Start cleanup interval
        this.cleanupInterval = setInterval(() => {
            this.cleanupCaches();
        }, 5 * 60 * 1000); // Every 5 minutes
    }

    async storeProof(manifest: C2PAManifest, imageHash: string): Promise<string> {
        try {
            const proofId = randomUUID();
            const proofDomain = process.env.PROOF_URI_DOMAIN || 'https://proofs.credlink.com';
            const proofUri = `${proofDomain}/${proofId}`;
            
            const expiresAt = Date.now() + (365 * 24 * 60 * 60 * 1000);
            
            const proofRecord: ProofRecord = {
                proofId,
                proofUri,
                imageHash,
                manifest,
                timestamp: new Date().toISOString(),
                signature: 'pending-signature',
                expiresAt
            };

            // Store in LRU cache
            this.cache.set(proofId, proofRecord);
            this.hashIndex.set(imageHash, proofId);

            // Queue async write operation
            this.writeQueue = this.writeQueue.then(async () => {
                if (this.useLocalFilesystem) {
                    await this.storeProofLocal(proofRecord);
                }
            }).catch(error => {
                logger.error('Failed to store proof locally', { 
                    proofId, 
                    error: error.message 
                });
            });

            logger.info('Proof stored successfully', {
                proofId,
                imageHash,
                storage: this.useLocalFilesystem ? 'filesystem' : 'memory',
                cacheSize: this.cache.size()
            });

            return proofUri;

        } catch (error: any) {
            logger.error('Failed to store proof', { error: error.message });
            throw new Error(`Proof storage failed: ${error.message}`);
        }
    }

    async getProof(proofId: string): Promise<ProofRecord | null> {
        // Check LRU cache first
        const cached = this.cache.get(proofId);
        if (cached) {
            return cached;
        }

        // Check filesystem if enabled
        if (this.useLocalFilesystem) {
            try {
                const proof = await this.getProofLocal(proofId);
                if (proof) {
                    // Update cache
                    this.cache.set(proofId, proof);
                    this.hashIndex.set(proof.imageHash, proofId);
                    return proof;
                }
            } catch (error) {
                logger.warn('Failed to read proof from filesystem', { 
                    proofId, 
                    error: error.message 
                });
            }
        }

        return null;
    }

    private cleanupCaches(): void {
        const cacheCleanup = this.cache.cleanup();
        const hashCleanup = this.hashIndex.cleanup();
        
        if (cacheCleanup > 0 || hashCleanup > 0) {
            logger.debug('Cache cleanup completed', {
                proofCacheCleaned: cacheCleanup,
                hashCacheCleaned: hashCleanup,
                proofCacheSize: this.cache.size(),
                hashCacheSize: this.hashIndex.size()
            });
        }
    }

    getMemoryUsage(): { proofCache: any; hashCache: any } {
        return {
            proofCache: this.cache.getStats(),
            hashCache: this.hashIndex.getStats()
        };
    }

    async close(): Promise<void> {
        // Wait for all pending writes
        await this.writeQueue;
        
        // Clear intervals
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        
        // Clear caches
        this.cache.clear();
        this.hashIndex.clear();
        
        logger.info('LRUProofStorage closed successfully');
    }
}
```

**3. Enhanced Security Monitor with Bounded Events**:
```typescript
// packages/security-monitor/src/security-monitor-bounded.ts
import { LRUCache } from '@credlink/cache';
import { SecurityEvent, SecurityAlert, AlertProvider } from './types.js';

export interface BoundedSecurityMonitorConfig {
    maxEventsInMemory: number;
    eventRetentionMs: number;
    maxAlertsInQueue: number;
    alertQueueRetentionMs: number;
}

export class BoundedSecurityMonitor {
    private events: LRUCache<string, SecurityEvent>;
    private alertQueue: LRUCache<string, SecurityAlert>;
    private alertProviders: AlertProvider[] = [];
    private config: BoundedSecurityMonitorConfig;
    private metrics = {
        eventsProcessed: 0,
        alertsSent: 0,
        eventsDropped: 0,
        alertsDropped: 0
    };

    constructor(config: Partial<BoundedSecurityMonitorConfig> = {}) {
        this.config = {
            maxEventsInMemory: 10000,
            eventRetentionMs: 24 * 60 * 60 * 1000, // 24 hours
            maxAlertsInQueue: 1000,
            alertQueueRetentionMs: 60 * 60 * 1000, // 1 hour
            ...config
        };

        this.events = new LRUCache<string, SecurityEvent>({
            maxSize: this.config.maxEventsInMemory,
            ttlMs: this.config.eventRetentionMs,
            onEvict: (key, event) => {
                this.metrics.eventsDropped++;
                logger.debug('Security event evicted', { eventId: key, eventType: event.type });
            }
        });

        this.alertQueue = new LRUCache<string, SecurityAlert>({
            maxSize: this.config.maxAlertsInQueue,
            ttlMs: this.config.alertQueueRetentionMs,
            onEvict: (key, alert) => {
                this.metrics.alertsDropped++;
                logger.warn('Security alert dropped due to queue overflow', { 
                    alertId: key, 
                    alertType: alert.type 
                });
            }
        });

        this.startAlertProcessor();
    }

    async recordEvent(event: SecurityEvent): Promise<void> {
        this.metrics.eventsProcessed++;

        // Store in bounded cache
        this.events.set(event.id, event);

        // Check if this should trigger an alert
        if (this.shouldAlert(event)) {
            const alert: SecurityAlert = {
                id: randomUUID(),
                severity: this.determineSeverity(event),
                type: event.type,
                message: this.generateAlertMessage(event),
                details: {
                    eventId: event.id,
                    subject: event.subject,
                    context: event.context,
                    metrics: this.calculateAlertMetrics(event)
                },
                timestamp: new Date(),
                source: 'credlink-security-monitor',
                correlationId: event.context?.request_id
            };

            this.queueAlert(alert);
        }

        // Log memory usage
        if (this.metrics.eventsProcessed % 1000 === 0) {
            logger.info('Security monitor metrics', {
                ...this.metrics,
                eventCacheSize: this.events.size(),
                alertQueueSize: this.alertQueue.size()
            });
        }
    }

    private queueAlert(alert: SecurityAlert): void {
        this.alertQueue.set(alert.id, alert);
        this.processAlertQueue();
    }

    private async processAlertQueue(): Promise<void> {
        const alerts: SecurityAlert[] = [];
        
        // Get all alerts from queue
        for (const [id, alert] of this.alertQueue['cache'].entries()) {
            alerts.push(alert);
            this.alertQueue.delete(id);
        }

        if (alerts.length === 0) {
            return;
        }

        // Send alerts
        const sendPromises = this.alertProviders.map(provider =>
            Promise.all(alerts.map(alert =>
                provider.send(alert).catch(error => {
                    logger.error('Alert provider failed', { 
                        provider: provider.constructor.name, 
                        alertId: alert.id, 
                        error: error.message 
                    });
                })
            ))
        );

        await Promise.allSettled(sendPromises);
        this.metrics.alertsSent += alerts.length;
    }

    getMetrics(): any {
        return {
            ...this.metrics,
            eventCache: this.events.getStats(),
            alertQueue: this.alertQueue.getStats()
        };
    }

    async close(): Promise<void> {
        this.events.clear();
        this.alertQueue.clear();
        logger.info('BoundedSecurityMonitor closed', { finalMetrics: this.metrics });
    }
}
```

**Tests to Add**:
```typescript
// packages/cache/src/__tests__/lru-cache.test.ts
import { LRUCache } from '../lru-cache';

describe('LRUCache', () => {
    test('evicts items when size limit reached', () => {
        const cache = new LRUCache<string, string>({ maxSize: 2 });
        
        cache.set('a', 'value1');
        cache.set('b', 'value2');
        cache.set('c', 'value3'); // Should evict 'a'
        
        expect(cache.get('a')).toBeUndefined();
        expect(cache.get('b')).toBe('value2');
        expect(cache.get('c')).toBe('value3');
    });

    test('respects TTL', async () => {
        const cache = new LRUCache<string, string>({ 
            maxSize: 10, 
            ttlMs: 100 
        });
        
        cache.set('key', 'value');
        expect(cache.get('key')).toBe('value');
        
        await new Promise(resolve => setTimeout(resolve, 150));
        expect(cache.get('key')).toBeUndefined();
    });

    test('calls onEvict callback', () => {
        const evictedItems: Array<[string, string]> = [];
        const cache = new LRUCache<string, string>({
            maxSize: 1,
            onEvict: (key, value) => evictedItems.push([key, value])
        });
        
        cache.set('a', 'value1');
        cache.set('b', 'value2'); // Should evict 'a'
        
        expect(evictedItems).toHaveLength(1);
        expect(evictedItems[0]).toEqual(['a', 'value1']);
    });

    test('cleanup removes expired items', async () => {
        const cache = new LRUCache<string, string>({ 
            maxSize: 10, 
            ttlMs: 100 
        });
        
        cache.set('a', 'value1');
        cache.set('b', 'value2');
        
        await new Promise(resolve => setTimeout(resolve, 150));
        
        const cleanedCount = cache.cleanup();
        expect(cleanedCount).toBe(2);
        expect(cache.size()).toBe(0);
    });
});
```

**Memory Usage Monitoring**:
```typescript
// scripts/monitor-memory-usage.js
import { LRUProofStorage } from '../apps/api/src/services/proof-storage-lru.js';

async function monitorMemoryUsage() {
    const storage = new LRUProofStorage();
    
    // Fill cache with test data
    for (let i = 0; i < 15000; i++) {
        await storage.storeProof(
            { claim_generator: `test-${i}`, format: 'c2pa' },
            `hash-${i}`
        );
    }
    
    const usage = storage.getMemoryUsage();
    console.log('Memory usage:', usage);
    
    // Should show size at max (10,000) with evictions happening
    expect(usage.proofCache.size).toBe(10000);
    expect(usage.hashCache.size).toBe(10000);
    
    await storage.close();
}
```

**Validation**:
- [ ] LRU cache evicts items when size limit reached
- [ ] TTL functionality works correctly
- [ ] Memory usage stays bounded under load
- [ ] Cache cleanup removes expired items
- [ ] Performance impact < 5ms per operation
- [ ] No memory leaks detected in long-running tests
- [ ] Security monitor events bounded
- [ ] Alert queue prevents overflow

**Security Checks**:
```bash
# Test memory exhaustion resistance
node scripts/test-memory-exhaustion.js

# Verify cache eviction doesn't lose critical data
node scripts/test-cache-eviction-safety.js

# Monitor memory growth over time
node scripts/monitor-memory-growth.js
```

**Artifacts**:
- Commit: "fix(memory): implement LRU caching to prevent memory leaks [CRED-009]"
- PR: #009-lru-caching
- Tag: memory-lru-v1.0.0
- Changelog: "### Performance\n- Implemented LRU caching with size limits and TTL\n- Added memory usage monitoring and cleanup\n- Fixed memory leaks in security monitor and proof storage"

**Rollback**:
```bash
git revert HEAD
# Restore unbounded Map usage
cp apps/api/src/services/proof-storage.ts.backup apps/api/src/services/proof-storage.ts
```

**Score Impact**: +4.0 (Performance: 10→12, Reliability +2)  
**New Score**: 58.8/100

---

### Step 10: RBAC Middleware Integration

**Owner**: Backend Lead  
**Effort**: 2 days  
**Risk**: Medium (authentication flow changes)  
**Blocked By**: Steps 0, 4  
**Blocks**: Step 11

**Rationale**: RBAC system exists but isn't integrated into authentication middleware. Evidence:
- `packages/rbac/src/rbac.ts` provides `check` function but no Express middleware
- `apps/api/src/middleware/auth.ts` only handles API key authentication
- No authorization checks in routes

**Implementation**:

**1. RBAC Middleware**:
```typescript
// packages/rbac/src/rbac-middleware.ts
import { Request, Response, NextFunction } from 'express';
import { DatabaseRBAC } from './database-rbac.js';
import { Subject, Action, Resource, Context } from './types.js';

declare global {
    namespace Express {
        interface Request {
            rbacContext?: {
                subject: Subject;
                permissions: string[];
            };
        }
    }
}

export interface RBACMiddlewareOptions {
    rbac: DatabaseRBAC;
    getResource?: (req: Request) => Resource;
    getAction?: (req: Request) => Action;
    onUnauthorized?: (req: Request, res: Response, reason: string) => void;
}

export class RBACMiddleware {
    private rbac: DatabaseRBAC;
    private getResource: (req: Request) => Resource;
    private getAction: (req: Request) => Action;
    private onUnauthorized: (req: Request, res: Response, reason: string) => void;

    constructor(options: RBACMiddlewareOptions) {
        this.rbac = options.rbac;
        this.getResource = options.getResource || this.defaultGetResource;
        this.getAction = options.getAction || this.defaultGetAction;
        this.onUnauthorized = options.onUnauthorized || this.defaultOnUnauthorized;
    }

    requirePermission(verb: string, resource: string) {
        return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
            try {
                // Build RBAC context
                const subject = this.buildSubject(req);
                const action = { verb, resource };
                const resourceObj = this.getResource(req);
                const context = this.buildContext(req);

                // Check permission
                const result = await this.rbac.check(subject, action, resourceObj, context);

                if (result.allow) {
                    // Attach RBAC context to request
                    req.rbacContext = {
                        subject,
                        permissions: [] // Could be populated from role data
                    };
                    
                    next();
                } else {
                    this.onUnauthorized(req, res, result.reason || 'Permission denied');
                }

            } catch (error) {
                console.error('RBAC check error:', error);
                this.onUnauthorized(req, res, 'Authorization error');
            }
        };
    }

    requireRole(roleName: string) {
        return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
            try {
                const subject = this.buildSubject(req);
                
                if (!subject.roles.includes(roleName)) {
                    this.onUnauthorized(req, res, `Role '${roleName}' required`);
                    return;
                }

                req.rbacContext = {
                    subject,
                    permissions: []
                };

                next();

            } catch (error) {
                console.error('Role check error:', error);
                this.onUnauthorized(req, res, 'Authorization error');
            }
        };
    }

    private buildSubject(req: Request): Subject {
        // Extract from API key authentication
        if (req.apiKeyInfo) {
            return {
                user_id: req.apiKeyInfo.clientId,
                org_id: 'default', // Could be extracted from API key metadata
                roles: [] // Would be loaded from database
            };
        }

        // Extract from JWT authentication (if implemented)
        if (req.user) {
            return {
                user_id: req.user.id,
                org_id: req.user.orgId,
                roles: req.user.roles || []
            };
        }

        throw new Error('No authentication context found');
    }

    private defaultGetResource(req: Request): Resource {
        return {
            type: req.route?.path || 'unknown',
            org_id: req.rbacContext?.subject.org_id || 'unknown'
        };
    }

    private defaultGetAction(req: Request): Action {
        return {
            verb: req.method.toLowerCase(),
            resource: req.route?.path || 'unknown'
        };
    }

    private buildContext(req: Request): Context {
        return {
            timestamp: new Date(),
            request_id: req.id || 'unknown',
            ip_address: req.ip,
            user_agent: req.get('User-Agent'),
            path: req.path,
            method: req.method
        };
    }

    private defaultOnUnauthorized(req: Request, res: Response, reason: string): void {
        res.status(403).json({
            error: 'Unauthorized',
            message: reason,
            path: req.path,
            method: req.method
        });
    }
}
```

**2. Updated Routes with RBAC**:
```typescript
// apps/api/src/routes/sign-rbac.ts
import { Router } from 'express';
import { RBACMiddleware } from '@credlink/rbac';
import { c2paService } from '../services/c2pa-service.js';
import { upload } from '../middleware/upload.js';
import { validateImageMagicBytes } from '../utils/validation.js';

const router = Router();

export function createSignRouter(rbacMiddleware: RBACMiddleware): Router {
    // Require 'sign' permission
    router.post('/', 
        rbacMiddleware.requirePermission('create', 'sign'),
        upload.single('image'),
        async (req, res, next) => {
            try {
                if (!req.file) {
                    return res.status(400).json({
                        error: 'No file uploaded',
                        message: 'Please provide an image file for signing'
                    });
                }

                // Validate image
                validateImageMagicBytes(req.file.buffer, req.file.mimetype);

                // Sign image
                const signingResult = await c2paService.signImage(req.file.buffer, {
                    customAssertions: req.body.customAssertions,
                    clientId: req.rbacContext?.subject.user_id,
                    orgId: req.rbacContext?.subject.org_id
                });

                res.set('X-Proof-Uri', signingResult.proofUri);
                res.send(signingResult.signedBuffer);

            } catch (error) {
                next(error);
            }
        }
    );

    // Require 'admin' role for bulk operations
    router.post('/bulk',
        rbacMiddleware.requireRole('org_admin'),
        upload.array('images', 10),
        async (req, res, next) => {
            // Bulk signing implementation
        }
    );

    return router;
}
```

**3. Integration with Authentication Middleware**:
```typescript
// apps/api/src/middleware/auth-rbac-integration.ts
import { Request, Response, NextFunction } from 'express';
import { EnhancedApiKeyAuth } from './auth-enhanced.js';
import { RBACMiddleware } from '@credlink/rbac';

export class AuthRBACIntegration {
    private apiKeyAuth: EnhancedApiKeyAuth;
    private rbacMiddleware: RBACMiddleware;

    constructor(apiKeyAuth: EnhancedApiKeyAuth, rbacMiddleware: RBACMiddleware) {
        this.apiKeyAuth = apiKeyAuth;
        this.rbacMiddleware = rbacMiddleware;
    }

    authenticateAndAuthorize = (verb: string, resource: string) => {
        return [
            this.apiKeyAuth.authenticate,
            this.rbacMiddleware.requirePermission(verb, resource)
        ];
    };

    authenticateAndRequireRole = (roleName: string) => {
        return [
            this.apiKeyAuth.authenticate,
            this.rbacMiddleware.requireRole(roleName)
        ];
    };
}
```

**Tests to Add**:
```typescript
// packages/rbac/src/__tests__/rbac-middleware.test.ts
import { RBACMiddleware } from '../rbac-middleware';
import { DatabaseRBAC } from '../database-rbac';
import { Request, Response } from 'express';

describe('RBACMiddleware', () => {
    let rbac: DatabaseRBAC;
    let middleware: RBACMiddleware;

    beforeAll(async () => {
        rbac = new DatabaseRBAC(testPool);
        middleware = new RBACMiddleware({ rbac });
        
        // Setup test roles
        await rbac.addRole({
            id: 'signer',
            name: 'Signer',
            permissions: [
                { id: 'sign_perm', verb: 'create', resource: 'sign' }
            ]
        });
    });

    test('allows access with correct permission', async () => {
        const req = {
            apiKeyInfo: { clientId: 'user123' },
            route: { path: '/sign' },
            method: 'POST',
            ip: '127.0.0.1',
            get: jest.fn()
        } as any;

        const res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        } as any;

        const next = jest.fn();

        // Mock RBAC check to return true
        jest.spyOn(rbac, 'check').mockResolvedValue({ allow: true });

        const middlewareFn = middleware.requirePermission('create', 'sign');
        await middlewareFn(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(req.rbacContext).toBeDefined();
    });

    test('denies access without permission', async () => {
        const req = {
            apiKeyInfo: { clientId: 'user456' },
            route: { path: '/admin' },
            method: 'GET',
            ip: '127.0.0.1',
            get: jest.fn()
        } as any;

        const res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        } as any;

        const next = jest.fn();

        // Mock RBAC check to return false
        jest.spyOn(rbac, 'check').mockResolvedValue({ 
            allow: false, 
            reason: 'Permission denied' 
        });

        const middlewareFn = middleware.requirePermission('read', 'admin');
        await middlewareFn(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({
            error: 'Unauthorized',
            message: 'Permission denied'
        });
        expect(next).not.toHaveBeenCalled();
    });
});
```

**Validation**:
- [ ] RBAC middleware integrates with authentication
- [ ] Permission checks work correctly
- [ ] Role-based access functions properly
- [ ] Unauthorized requests are rejected
- [ ] RBAC context attached to requests
- [ ] Error handling graceful
- [ ] Performance impact < 5ms per check
- [ ] Audit logging complete

**Security Checks**:
```bash
# Test permission bypass attempts
node scripts/test-permission-bypass.js

# Verify role isolation
node scripts/test-role-isolation.js

# Test authorization caching
node scripts/test-auth-caching.js
```

**Artifacts**:
- Commit: "feat(rbac): integrate middleware with authentication [CRED-010]"
- PR: #010-rbac-middleware
- Tag: rbac-integration-v1.0.0
- Changelog: "### Security\n- Integrated RBAC middleware with authentication\n- Added permission and role-based route protection\n- Enhanced authorization context in requests"

**Rollback**:
```bash
git revert HEAD
# Remove RBAC middleware from routes
```

**Score Impact**: +3.0 (Security: 18→19, Architecture: 7→8)  
**New Score**: 61.8/100

---

[Continue with Steps 11-18 in final segment...]
