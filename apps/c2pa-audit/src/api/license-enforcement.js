/**
 * Licensed Content Enforcement Hooks - Server API
 * Phase 32 v1.1 - Partner-facing verification and webhook management
 */
import { VerifyEventSystem } from '../core/verify-events.js';
import { LicenseMetadataEncoder } from '../core/license-metadata.js';
/**
 * Server API handler for license verification and enforcement
 */
export class LicenseEnforcementAPI {
    partnerConfigs = new Map();
    eventHistory = [];
    /**
     * Register partner webhook configuration
     */
    async registerWebhook(partnerId, webhookConfig) {
        // Strict input validation
        if (!partnerId || typeof partnerId !== 'string' || !/^[a-zA-Z0-9_-]{1,50}$/.test(partnerId)) {
            throw new Error('Invalid partner ID: must be alphanumeric string, max 50 chars');
        }
        if (!webhookConfig || typeof webhookConfig !== 'object') {
            throw new Error('Invalid webhook configuration: must be object');
        }
        if (!webhookConfig.url || typeof webhookConfig.url !== 'string') {
            throw new Error('Invalid webhook URL: required string');
        }
        if (!webhookConfig.secret || typeof webhookConfig.secret !== 'string') {
            throw new Error('Invalid webhook secret: required string');
        }
        if (!Array.isArray(webhookConfig.filters)) {
            throw new Error('Invalid webhook filters: must be array');
        }
        // Validate webhook URL with strict security rules
        let parsedUrl;
        try {
            parsedUrl = new URL(webhookConfig.url);
        }
        catch (error) {
            throw new Error('Invalid webhook URL: malformed URL');
        }
        // SSRF protection - only allow HTTPS and restrict to external IPs
        if (parsedUrl.protocol !== 'https:') {
            throw new Error('Invalid webhook URL: only HTTPS URLs are allowed');
        }
        // Prevent localhost and private network access
        const hostname = parsedUrl.hostname.toLowerCase();
        if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.') ||
            hostname.startsWith('10.') || hostname.startsWith('172.') || hostname.endsWith('.local')) {
            throw new Error('Invalid webhook URL: private network addresses not allowed');
        }
        // Validate secret is base64 and exactly 32 bytes when decoded
        let secretBytes;
        try {
            secretBytes = Buffer.from(webhookConfig.secret, 'base64');
        }
        catch (error) {
            throw new Error('Invalid webhook secret: must be valid base64');
        }
        if (secretBytes.length !== 32) {
            throw new Error('Invalid webhook secret: must be exactly 32 bytes when base64-decoded');
        }
        // Validate filters - only allow known event types
        const allowedEventTypes = ['verify.started', 'verify.completed', 'reuse.detected', 'softblock.triggered', 'appeal.created'];
        for (const filter of webhookConfig.filters) {
            if (typeof filter !== 'string' || !allowedEventTypes.includes(filter)) {
                throw new Error(`Invalid webhook filter: ${filter} is not a valid event type`);
            }
        }
        const config = {
            url: webhookConfig.url,
            secret: webhookConfig.secret,
            filters: webhookConfig.filters,
            partner_id: partnerId
        };
        // Store configuration
        const partnerConfig = this.partnerConfigs.get(partnerId) || {
            partner_id: partnerId,
            allow_origins: [],
            enforce: [],
            webhooks: [],
            preferences: {
                preview_degrade: { warn: { scale: 0.4, blur_px: 6 } },
                cta: { warn: 'View license / Provide proof' },
                telemetry: { events: ['verify.completed', 'softblock.triggered'] }
            }
        };
        partnerConfig.webhooks.push(config);
        this.partnerConfigs.set(partnerId, partnerConfig);
        return config;
    }
    /**
     * Verify asset and return license information
     */
    async verifyAsset(request) {
        const startTime = Date.now();
        try {
            // Strict input validation
            if (!request || typeof request !== 'object') {
                throw new Error('Invalid request: must be object');
            }
            if (!request.asset_url || typeof request.asset_url !== 'string') {
                throw new Error('Invalid asset URL: required string');
            }
            // Validate and sanitize asset URL
            let parsedAssetUrl;
            try {
                parsedAssetUrl = new URL(request.asset_url);
            }
            catch (error) {
                throw new Error('Invalid asset URL: malformed URL');
            }
            // SSRF protection - restrict protocols and validate hostname
            if (!['http:', 'https:'].includes(parsedAssetUrl.protocol)) {
                throw new Error('Invalid asset URL: only HTTP and HTTPS protocols allowed');
            }
            // Prevent access to private networks and localhost
            const hostname = parsedAssetUrl.hostname.toLowerCase();
            if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.') ||
                hostname.startsWith('10.') || hostname.startsWith('172.') || hostname.endsWith('.local')) {
                throw new Error('Invalid asset URL: private network addresses not allowed');
            }
            // Validate context if provided
            if (request.context) {
                if (typeof request.context !== 'object') {
                    throw new Error('Invalid context: must be object');
                }
                if (request.context.request_origin && typeof request.context.request_origin !== 'string') {
                    throw new Error('Invalid request_origin: must be string');
                }
                if (request.context.referrer && typeof request.context.referrer !== 'string') {
                    throw new Error('Invalid referrer: must be string');
                }
                if (request.context.user_agent && typeof request.context.user_agent !== 'string') {
                    throw new Error('Invalid user_agent: must be string');
                }
                // Sanitize and validate request_origin
                if (request.context.request_origin) {
                    try {
                        const originUrl = new URL(request.context.request_origin);
                        if (!['http:', 'https:'].includes(originUrl.protocol)) {
                            throw new Error('Invalid request_origin: only HTTP and HTTPS allowed');
                        }
                    }
                    catch (error) {
                        throw new Error('Invalid request_origin: malformed URL');
                    }
                }
            }
            // Extract manifest hash from asset URL or fetch remote manifest
            const manifestHash = await this.extractManifestHash(request.asset_url);
            // Fetch and verify manifest using CAI Verify
            const manifest = await this.fetchAndVerifyManifest(request.asset_url, manifestHash);
            // Extract license metadata
            const licenseAssertion = LicenseMetadataEncoder.extractLicenseFromManifest(manifest);
            if (!licenseAssertion) {
                throw new Error('No license metadata found in manifest');
            }
            // Validate license assertion
            const licenseValidation = LicenseMetadataEncoder.validateLicenseAssertion(licenseAssertion);
            if (!licenseValidation.valid) {
                throw new Error(`Invalid license assertion: ${licenseValidation.errors.join(', ')}`);
            }
            // Determine context and permission
            const requestOrigin = request.context?.request_origin || 'unknown';
            let partnerConfig;
            // Find partner config that allows this origin
            this.partnerConfigs.forEach((config) => {
                if (config.allow_origins.includes(requestOrigin)) {
                    partnerConfig = config;
                }
            });
            const isAllowedOrigin = partnerConfig?.allow_origins.includes(requestOrigin) || false;
            const isPermissiveLicense = licenseValidation.permission_level === 'permissive';
            const isEnforcedOrigin = partnerConfig?.enforce.includes(requestOrigin) || false;
            // Determine result and action
            let result = 'ok';
            let badgeState = 'ok';
            let previewDegrade;
            if (!isPermissiveLicense && !isAllowedOrigin) {
                result = isEnforcedOrigin ? 'block' : 'warn';
                badgeState = isEnforcedOrigin ? 'block' : 'warn';
                previewDegrade = partnerConfig?.preferences.preview_degrade.warn;
            }
            const verificationTime = Date.now() - startTime;
            const action = {
                show_badge: true,
                badge_state: badgeState,
                ...(previewDegrade && { preview_degrade: previewDegrade }),
                ...(badgeState === 'warn' && partnerConfig?.preferences.cta.warn && {
                    cta_text: partnerConfig.preferences.cta.warn
                })
            };
            const response = {
                result,
                license: {
                    license_uri: licenseAssertion.data.license.license_uri,
                    rights_page: licenseAssertion.data.license.rights_page,
                    licensor_name: licenseAssertion.data.license.licensor_name,
                    usage_terms: licenseAssertion.data.license.usage_terms,
                    permission_level: licenseValidation.permission_level
                },
                manifest_hash: manifestHash,
                signals: {
                    assertions: manifest.assertions?.map((a) => a.label) || [],
                    chain_ok: true, // Would be determined by actual verification
                    verification_time_ms: verificationTime,
                    verifier: 'cai-verify@1.0'
                },
                action
            };
            // Emit verification event
            await this.emitVerificationEvent(request, response, manifest);
            return response;
        }
        catch (error) {
            const verificationTime = Date.now() - startTime;
            console.error('Verification failed:', error);
            return {
                result: 'block',
                license: {
                    license_uri: 'unknown',
                    rights_page: 'unknown',
                    permission_level: 'prohibited'
                },
                manifest_hash: 'unknown',
                signals: {
                    assertions: [],
                    chain_ok: false,
                    verification_time_ms: verificationTime,
                    verifier: 'cai-verify@1.0'
                },
                action: {
                    show_badge: true,
                    badge_state: 'block'
                }
            };
        }
    }
    /**
     * Submit appeal for license enforcement
     */
    async submitAppeal(request) {
        const ticketId = `appeal_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        // Create appeal event
        const appealEvent = VerifyEventSystem.createAppealCreatedEvent({
            asset_id: request.asset_id,
            manifest_hash: request.manifest_hash,
            license_uri: 'unknown', // Would be fetched from manifest
            rights_page: 'unknown',
            request_origin: 'appeal_submission',
            user_claim: request.claim,
            verifier: 'cai-verify@1.0',
            chain_ok: true,
            verification_time_ms: 0
        });
        // Store appeal and emit event
        this.eventHistory.push(appealEvent);
        await this.deliverEventsToPartners(appealEvent);
        return {
            ticket_id: ticketId,
            status: 'submitted',
            estimated_response_hours: 48
        };
    }
    /**
     * Export events as NDJSON stream
     */
    async exportEvents(partnerId, filters) {
        const partnerConfig = this.partnerConfigs.get(partnerId);
        if (!partnerConfig) {
            throw new Error('Partner not found');
        }
        let events = this.eventHistory.filter(event => {
            // Filter by partner webhooks
            const hasWebhook = partnerConfig.webhooks.some(webhook => VerifyEventSystem.shouldDeliverEvent(webhook, event));
            if (!hasWebhook)
                return false;
            // Filter by date range
            if (filters.from && new Date(event.created) < new Date(filters.from))
                return false;
            if (filters.to && new Date(event.created) > new Date(filters.to))
                return false;
            // Filter by type
            if (filters.type && event.type !== filters.type)
                return false;
            return true;
        });
        // Convert to NDJSON
        return events.map(event => JSON.stringify(event)).join('\n') + '\n';
    }
    // ... (rest of the code remains the same)
    async extractManifestHash(assetUrl) {
        // In a real implementation, this would extract the hash from the URL
        // or fetch the asset and calculate its hash
        const url = new URL(assetUrl);
        const pathname = url.pathname;
        const hash = pathname.split('/').pop()?.split('.')[0] || 'unknown';
        return `sha256:${hash}`;
    }
    /**
     * Fetch and verify manifest using CAI Verify
     */
    async fetchAndVerifyManifest(_assetUrl, manifestHash) {
        // In a real implementation, this would use the CAI Verify SDK
        // For now, return a mock manifest with proper structure
        return {
            manifest_hash: manifestHash,
            claim_generator: 'C2Concierge v1.1',
            timestamp: new Date().toISOString(),
            claim_signature: {
                protected: { alg: 'ES256' },
                signature: 'mock-signature',
                certificate_chain: [],
                validation_status: { valid: true, codes: [], summary: 'Valid' }
            },
            assertions: [
                {
                    label: 'c2pa.metadata',
                    data: {
                        license: {
                            license_uri: 'https://creativecommons.org/licenses/by/4.0/',
                            rights_page: 'https://publisher.example.com/licensing/asset-123',
                            licensor_name: 'Publisher, Inc.',
                            usage_terms: 'Editorial use only; no AI training'
                        }
                    },
                    redacted: false,
                    validation_status: { valid: true, codes: [], summary: 'Valid' }
                }
            ]
        };
    }
    /**
     * Emit verification event to partner webhooks
     */
    async emitVerificationEvent(request, response, _manifest) {
        if (response.result === 'warn' || response.result === 'block') {
            const event = VerifyEventSystem.createReuseDetectedEvent({
                asset_id: 'unknown',
                manifest_hash: response.manifest_hash,
                license_uri: response.license.license_uri,
                rights_page: response.license.rights_page,
                request_origin: request.context?.request_origin || 'unknown',
                ...(request.context?.referrer && { referrer: request.context.referrer }),
                reason: response.result === 'block' ? 'origin_not_in_allowlist' : 'license_restricted',
                verifier: response.signals.verifier,
                chain_ok: response.signals.chain_ok,
                verification_time_ms: response.signals.verification_time_ms
            });
            this.eventHistory.push(event);
            await this.deliverEventsToPartners(event);
        }
    }
    /**
     * Deliver events to all relevant partner webhooks
     */
    async deliverEventsToPartners(event) {
        const deliveryPromises = [];
        this.partnerConfigs.forEach((config) => {
            for (const webhook of config.webhooks) {
                if (VerifyEventSystem.shouldDeliverEvent(webhook, event)) {
                    deliveryPromises.push(VerifyEventSystem.deliverWebhook(webhook, event).catch(error => {
                        console.error(`Webhook delivery failed for ${webhook.url}:`, error);
                    }));
                }
            }
        });
        await Promise.allSettled(deliveryPromises);
    }
    /**
     * Configure partner settings
     */
    async configurePartner(partnerId, config) {
        const existingConfig = this.partnerConfigs.get(partnerId) || {
            partner_id: partnerId,
            allow_origins: [],
            enforce: [],
            webhooks: [],
            preferences: {
                preview_degrade: { warn: { scale: 0.4, blur_px: 6 } },
                cta: { warn: 'View license / Provide proof' },
                telemetry: { events: ['verify.completed', 'softblock.triggered'] }
            }
        };
        const updatedConfig = { ...existingConfig, ...config };
        this.partnerConfigs.set(partnerId, updatedConfig);
    }
    /**
     * Get partner configuration
     */
    getPartnerConfig(partnerId) {
        return this.partnerConfigs.get(partnerId);
    }
}
//# sourceMappingURL=license-enforcement.js.map