/**
 * Licensed Content Enforcement Hooks - Verify Events System
 * Phase 32 v1.1 - HMAC-signed webhook events for license enforcement
 */
/**
 * Webhook signature verification and event delivery system
 */
export class VerifyEventSystem {
    static MAX_TIMESTAMP_SKEW = 5 * 60; // 5 minutes
    static REPLAY_CACHE_TTL = 10 * 60; // 10 minutes
    static MAX_RETRIES = 12;
    static BASE_RETRY_DELAY = 1000; // 1 second
    static MAX_RETRY_DELAY = 24 * 60 * 60 * 1000; // 24 hours
    static replayCache = new Map();
    /**
     * Generate unique event ID
     */
    static generateEventId() {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2, 15);
        return `evt_${timestamp}${random}`;
    }
    /**
     * Create HMAC signature for webhook payload
     */
    static createSignature(payload, secret, timestamp) {
        // Validate inputs
        if (!payload || typeof payload !== 'string' || !secret || typeof secret !== 'string' || !timestamp || timestamp < 0) {
            throw new Error('Invalid inputs for signature creation');
        }
        const signedPayload = `${timestamp}.${payload}`;
        const crypto = require('crypto');
        const hmac = crypto.createHmac('sha256', Buffer.from(secret, 'base64'));
        hmac.update(signedPayload);
        const signature = hmac.digest('hex');
        return `t=${timestamp},v1=${signature}`;
    }
    /**
     * Constant-time string comparison to prevent timing attacks
     */
    static constantTimeCompare(a, b) {
        if (a.length !== b.length) {
            return false;
        }
        let result = 0;
        for (let i = 0; i < a.length; i++) {
            result |= a.charCodeAt(i) ^ b.charCodeAt(i);
        }
        return result === 0;
    }
    /**
     * Verify webhook signature
     */
    static verifySignature(payload, signature, secret) {
        try {
            // Validate inputs
            if (!payload || typeof payload !== 'string' || !signature || typeof signature !== 'string' || !secret || typeof secret !== 'string') {
                return false;
            }
            // Parse signature header with strict validation
            const signatureParts = signature.split(',');
            let timestamp;
            let v1Signature;
            for (const part of signatureParts) {
                if (part.startsWith('t=')) {
                    const timeStr = part.substring(2);
                    // Validate timestamp is numeric and reasonable
                    if (!/^\d+$/.test(timeStr)) {
                        return false;
                    }
                    timestamp = parseInt(timeStr, 10);
                    // Reject timestamps that are too old or future (beyond reasonable range)
                    const now = Math.floor(Date.now() / 1000);
                    const maxFuture = now + 300; // Allow 5 minutes clock skew
                    const minPast = now - 31536000; // Reject timestamps older than 1 year
                    if (timestamp > maxFuture || timestamp < minPast) {
                        return false;
                    }
                }
                else if (part.startsWith('v1=')) {
                    v1Signature = part.substring(3);
                    // Validate signature format (hex string)
                    if (!/^[a-f0-9]{64}$/i.test(v1Signature)) {
                        return false;
                    }
                }
            }
            if (!timestamp || !v1Signature) {
                return false;
            }
            // Check timestamp skew with stricter validation
            const now = Math.floor(Date.now() / 1000);
            if (Math.abs(now - timestamp) > this.MAX_TIMESTAMP_SKEW) {
                return false;
            }
            // Check replay cache with proper key generation
            const cacheKey = `${timestamp}:${v1Signature.substring(0, 16)}`;
            const cachedTime = this.replayCache.get(cacheKey);
            if (cachedTime && (now - cachedTime) < this.REPLAY_CACHE_TTL) {
                return false; // Replay detected
            }
            // Verify HMAC with constant-time comparison
            const expectedSignature = this.createSignature(payload, secret, timestamp);
            const expectedParts = expectedSignature.split(',');
            const expectedV1 = expectedParts.find(p => p.startsWith('v1='))?.substring(3);
            if (!expectedV1) {
                return false;
            }
            // Use proper constant-time comparison
            const crypto = require('crypto');
            if (crypto.timingSafeEqual) {
                return crypto.timingSafeEqual(Buffer.from(v1Signature, 'hex'), Buffer.from(expectedV1, 'hex'));
            }
            // Fallback constant-time comparison (never use regular === for crypto)
            const isValid = this.constantTimeCompare(v1Signature, expectedV1);
            if (!isValid) {
                return false;
            }
            // Add to replay cache only after successful verification
            this.replayCache.set(cacheKey, now);
            // Clean old entries from replay cache
            this.cleanReplayCache(now);
            return true;
        }
        catch (error) {
            console.error('Signature verification error:', error);
            return false;
        }
    }
    /**
     * Clean expired entries from replay cache
     */
    static cleanReplayCache(now) {
        const expiredKeys = [];
        this.replayCache.forEach((timestamp, key) => {
            if (now - timestamp > this.REPLAY_CACHE_TTL) {
                expiredKeys.push(key);
            }
        });
        expiredKeys.forEach(key => this.replayCache.delete(key));
    }
    /**
     * Create verify event
     */
    static createVerifyEvent(type, data) {
        const event = {
            id: this.generateEventId(),
            type,
            created: new Date().toISOString(),
            asset: {
                asset_id: data.asset.asset_id,
                manifest_hash: data.asset.manifest_hash,
                ...(data.asset.variant_uri && { variant_uri: data.asset.variant_uri })
            },
            license: data.license,
            verify: data.verify,
            context: {
                request_origin: data.context.request_origin,
                ...(data.context.referrer && { referrer: data.context.referrer }),
                ...(data.context.user_agent && { user_agent: data.context.user_agent })
            },
            debug: {
                verifier: data.verifier,
                chain_ok: data.chain_ok,
                verification_time_ms: data.verification_time_ms
            }
        };
        if (data.reason) {
            event.reason = data.reason;
        }
        return event;
    }
    /**
     * Calculate exponential backoff delay
     */
    static calculateRetryDelay(attempt) {
        const delay = this.BASE_RETRY_DELAY * Math.pow(2, attempt - 1);
        const jitter = Math.random() * 0.3 * delay; // Add 30% jitter
        return Math.min(delay + jitter, this.MAX_RETRY_DELAY);
    }
    /**
     * Deliver webhook event with retry logic
     */
    static async deliverWebhook(webhook, event, currentAttempt = 1) {
        const payload = JSON.stringify(event);
        const timestamp = Math.floor(Date.now() / 1000);
        const signature = this.createSignature(payload, webhook.secret, timestamp);
        const headers = {
            'Content-Type': 'application/json',
            'User-Agent': 'C2Concierge-Webhook/1.1',
            'C2-Signature': signature,
            'X-Event-ID': event.id,
            'X-Event-Type': event.type
        };
        try {
            // In Node.js environment, use node-fetch or built-in fetch if available
            const fetchOptions = {
                method: 'POST',
                headers,
                body: payload
            };
            // Add timeout if AbortSignal.timeout is available
            if (typeof AbortSignal.timeout === 'function') {
                fetchOptions.signal = AbortSignal.timeout(30000);
            }
            const response = await fetch(webhook.url, fetchOptions);
            if (response.status >= 200 && response.status < 300) {
                return {
                    event,
                    attempt: currentAttempt,
                    status: 'delivered'
                };
            }
            else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
        }
        catch (error) {
            if (currentAttempt >= this.MAX_RETRIES) {
                return {
                    event,
                    attempt: currentAttempt,
                    status: 'failed'
                };
            }
            const retryDelay = this.calculateRetryDelay(currentAttempt);
            const retryAfter = new Date(Date.now() + retryDelay).toISOString();
            return {
                event,
                attempt: currentAttempt,
                retry_after: retryAfter,
                status: 'retrying'
            };
        }
    }
    /**
     * Filter events based on webhook configuration
     */
    static shouldDeliverEvent(webhook, event) {
        return webhook.filters.includes(event.type) || webhook.filters.includes('*');
    }
    /**
     * Create reuse detected event
     */
    static createReuseDetectedEvent(data) {
        return this.createVerifyEvent('reuse.detected', {
            asset: {
                asset_id: data.asset_id,
                manifest_hash: data.manifest_hash,
                ...(data.variant_uri && { variant_uri: data.variant_uri })
            },
            license: {
                license_uri: data.license_uri,
                rights_page: data.rights_page
            },
            verify: {
                result: 'warn',
                assertions: ['c2pa.metadata']
            },
            context: {
                request_origin: data.request_origin,
                ...(data.referrer && { referrer: data.referrer })
            },
            reason: data.reason,
            verifier: data.verifier,
            chain_ok: data.chain_ok,
            verification_time_ms: data.verification_time_ms
        });
    }
    /**
     * Create softblock triggered event
     */
    static createSoftblockTriggeredEvent(data) {
        return this.createVerifyEvent('softblock.triggered', {
            asset: {
                asset_id: data.asset_id,
                manifest_hash: data.manifest_hash
            },
            license: {
                license_uri: data.license_uri,
                rights_page: data.rights_page
            },
            verify: {
                result: 'warn',
                assertions: ['c2pa.metadata']
            },
            context: {
                request_origin: data.request_origin
            },
            reason: data.reason,
            verifier: data.verifier,
            chain_ok: data.chain_ok,
            verification_time_ms: data.verification_time_ms
        });
    }
    /**
     * Create appeal created event
     */
    static createAppealCreatedEvent(data) {
        return this.createVerifyEvent('appeal.created', {
            asset: {
                asset_id: data.asset_id,
                manifest_hash: data.manifest_hash
            },
            license: {
                license_uri: data.license_uri,
                rights_page: data.rights_page
            },
            verify: {
                result: 'warn',
                assertions: ['c2pa.metadata']
            },
            context: {
                request_origin: data.request_origin
            },
            reason: `User appeal: ${data.user_claim}`,
            verifier: data.verifier,
            chain_ok: data.chain_ok,
            verification_time_ms: data.verification_time_ms
        });
    }
}
//# sourceMappingURL=verify-events.js.map