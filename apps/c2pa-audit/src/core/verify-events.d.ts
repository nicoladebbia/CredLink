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
export declare class VerifyEventSystem {
    private static readonly MAX_TIMESTAMP_SKEW;
    private static readonly REPLAY_CACHE_TTL;
    private static readonly MAX_RETRIES;
    private static readonly BASE_RETRY_DELAY;
    private static readonly MAX_RETRY_DELAY;
    private static replayCache;
    /**
     * Generate unique event ID
     */
    static generateEventId(): string;
    /**
     * Create HMAC signature for webhook payload
     */
    static createSignature(payload: string, secret: string, timestamp: number): string;
    /**
     * Constant-time string comparison to prevent timing attacks
     */
    private static constantTimeCompare;
    /**
     * Verify webhook signature
     */
    static verifySignature(payload: string, signature: string, secret: string): boolean;
    /**
     * Clean expired entries from replay cache
     */
    private static cleanReplayCache;
    /**
     * Create verify event
     */
    static createVerifyEvent(type: VerifyEvent['type'], data: {
        asset: {
            asset_id: string;
            manifest_hash: string;
            variant_uri?: string;
        };
        license: {
            license_uri: string;
            rights_page: string;
        };
        verify: {
            result: 'ok' | 'warn' | 'block';
            assertions: string[];
        };
        context: {
            request_origin: string;
            referrer?: string;
            user_agent?: string;
        };
        reason?: string;
        verifier: string;
        chain_ok: boolean;
        verification_time_ms: number;
    }): VerifyEvent;
    /**
     * Calculate exponential backoff delay
     */
    static calculateRetryDelay(attempt: number): number;
    /**
     * Deliver webhook event with retry logic
     */
    static deliverWebhook(webhook: WebhookConfig, event: VerifyEvent, currentAttempt?: number): Promise<EventDelivery>;
    /**
     * Filter events based on webhook configuration
     */
    static shouldDeliverEvent(webhook: WebhookConfig, event: VerifyEvent): boolean;
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
    }): VerifyEvent;
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
    }): VerifyEvent;
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
    }): VerifyEvent;
}
//# sourceMappingURL=verify-events.d.ts.map