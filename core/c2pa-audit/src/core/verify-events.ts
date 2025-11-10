/**
 * Licensed Content Enforcement Hooks - Verify Events System
 * Phase 32 v1.1 - HMAC-signed webhook events for license enforcement
 */

export interface VerifyEvent {
  /** Unique event identifier */
  id: string;
  /** Event type */
  type: 'verify.started' | 'verify.completed' | 'reuse.detected' | 'softblock.triggered' | 'appeal.created';
  /** ISO 8601 timestamp */
  created: string;
  /** Asset information */
  asset: {
    asset_id: string;
    manifest_hash: string;
    variant_uri?: string;
  };
  /** License information */
  license: {
    license_uri: string;
    rights_page: string;
  };
  /** Verification results */
  verify: {
    result: 'ok' | 'warn' | 'block';
    assertions: string[];
  };
  /** Request context */
  context: {
    request_origin: string;
    referrer?: string;
    user_agent?: string;
  };
  /** Reason for event (if applicable) */
  reason?: string;
  /** Debug information */
  debug: {
    verifier: string;
    chain_ok: boolean;
    verification_time_ms: number;
  };
}

export interface WebhookConfig {
  /** Webhook URL */
  url: string;
  /** Base64-encoded 32-byte secret */
  secret: string;
  /** Event types to deliver */
  filters: string[];
  /** Partner identifier */
  partner_id: string;
}

export interface EventDelivery {
  /** Event being delivered */
  event: VerifyEvent;
  /** Delivery attempt number */
  attempt: number;
  /** Next retry timestamp if failed */
  retry_after?: string;
  /** Delivery status */
  status: 'pending' | 'delivered' | 'failed' | 'retrying';
}

/**
 * Webhook signature verification and event delivery system
 */
export class VerifyEventSystem {
  private static readonly MAX_TIMESTAMP_SKEW = 5 * 60; // 5 minutes
  private static readonly REPLAY_CACHE_TTL = 10 * 60; // 10 minutes
  private static readonly MAX_RETRIES = 12;
  private static readonly BASE_RETRY_DELAY = 1000; // 1 second
  private static readonly MAX_RETRY_DELAY = 24 * 60 * 60 * 1000; // 24 hours

  private static replayCache = new Map<string, number>();

  /**
   * Generate unique event ID
   */
  static generateEventId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 15);
    return `evt_${timestamp}${random}`;
  }

  /**
   * Create HMAC signature for webhook payload
   */
  static createSignature(payload: string, secret: string, timestamp: number): string {
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
  private static constantTimeCompare(a: string, b: string): boolean {
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
  static verifySignature(payload: string, signature: string, secret: string): boolean {
    try {
      // Validate inputs
      if (!payload || typeof payload !== 'string' || !signature || typeof signature !== 'string' || !secret || typeof secret !== 'string') {
        return false;
      }

      // Parse signature header with strict validation
      const signatureParts = signature.split(',');
      let timestamp: number | undefined;
      let v1Signature: string | undefined;

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
        } else if (part.startsWith('v1=')) {
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
        return crypto.timingSafeEqual(
          Buffer.from(v1Signature, 'hex'),
          Buffer.from(expectedV1, 'hex')
        );
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
    } catch (error: unknown) {
      console.error('Signature verification error:', error);
      return false;
    }
  }

  /**
   * Clean expired entries from replay cache
   */
  private static cleanReplayCache(now: number): void {
    const expiredKeys: string[] = [];
    this.replayCache.forEach((timestamp: number, key: string) => {
      if (now - timestamp > this.REPLAY_CACHE_TTL) {
        expiredKeys.push(key);
      }
    });
    expiredKeys.forEach(key => this.replayCache.delete(key));
  }

  /**
   * Create verify event
   */
  static createVerifyEvent(type: VerifyEvent['type'], data: {
    asset: { asset_id: string; manifest_hash: string; variant_uri?: string };
    license: { license_uri: string; rights_page: string };
    verify: { result: 'ok' | 'warn' | 'block'; assertions: string[] };
    context: { request_origin: string; referrer?: string; user_agent?: string };
    reason?: string;
    verifier: string;
    chain_ok: boolean;
    verification_time_ms: number;
  }): VerifyEvent {
    const event: VerifyEvent = {
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
  static calculateRetryDelay(attempt: number): number {
    const delay = this.BASE_RETRY_DELAY * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 0.3 * delay; // Add 30% jitter
    return Math.min(delay + jitter, this.MAX_RETRY_DELAY);
  }

  /**
   * Deliver webhook event with retry logic
   */
  static async deliverWebhook(
    webhook: WebhookConfig,
    event: VerifyEvent,
    currentAttempt: number = 1
  ): Promise<EventDelivery> {
    const payload = JSON.stringify(event);
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = this.createSignature(payload, webhook.secret, timestamp);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'CredLink-Webhook/1.1',
      'CredLink-Signature': signature,
      'X-Event-ID': event.id,
      'X-Event-Type': event.type
    };

    try {
      // In Node.js environment, use node-fetch or built-in fetch if available
      const fetchOptions: RequestInit = {
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
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error: unknown) {
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
  static shouldDeliverEvent(webhook: WebhookConfig, event: VerifyEvent): boolean {
    return webhook.filters.includes(event.type) || webhook.filters.includes('*');
  }

  /**
   * Create reuse detected event
   */
  static createReuseDetectedEvent(data: {
    asset_id: string;
    manifest_hash: string;
    variant_uri?: string;
    license_uri: string;
    rights_page: string;
    request_origin: string;
    referrer?: string;
    reason: string;
    verifier: string;
    chain_ok: boolean;
    verification_time_ms: number;
  }): VerifyEvent {
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
  static createSoftblockTriggeredEvent(data: {
    asset_id: string;
    manifest_hash: string;
    license_uri: string;
    rights_page: string;
    request_origin: string;
    reason: string;
    verifier: string;
    chain_ok: boolean;
    verification_time_ms: number;
  }): VerifyEvent {
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
  static createAppealCreatedEvent(data: {
    asset_id: string;
    manifest_hash: string;
    license_uri: string;
    rights_page: string;
    request_origin: string;
    user_claim: string;
    verifier: string;
    chain_ok: boolean;
    verification_time_ms: number;
  }): VerifyEvent {
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
