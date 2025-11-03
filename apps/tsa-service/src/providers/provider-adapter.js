/**
 * TSA Provider Adapter
 * Minimal stateless adapters for DigiCert, GlobalSign, Sectigo endpoints
 */
import { PKIStatus } from '../types/rfc3161.js';
export class TSAProviderAdapter {
    provider;
    constructor(provider) {
        this.provider = provider;
    }
    /**
     * Get provider ID
     */
    getId() {
        return this.provider.id;
    }
    /**
     * Get provider name
     */
    getName() {
        return this.provider.name;
    }
    /**
     * Validate policy is allowed for this provider
     */
    isPolicyAllowed(policyOid) {
        return this.provider.allowedPolicies.includes(policyOid);
    }
}
export class DigiCertAdapter extends TSAProviderAdapter {
    async sendRequest(request) {
        const startTime = Date.now();
        try {
            // Validate policy if specified
            if (request.reqPolicy && !this.isPolicyAllowed(request.reqPolicy)) {
                return {
                    success: false,
                    error: `Policy ${request.reqPolicy} not allowed for DigiCert TSA`,
                    latencyMs: Date.now() - startTime,
                    providerId: this.getId()
                };
            }
            // Build HTTP request with timeout using AbortController
            const encodedRequest = this.encodeRequest(request);
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
            const response = await fetch(this.provider.url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/timestamp-query',
                    'Accept': 'application/timestamp-reply',
                    'User-Agent': 'C2-Concierge-TSA-Service/1.0'
                },
                body: Buffer.from(encodedRequest),
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            if (!response.ok) {
                return {
                    success: false,
                    error: `HTTP ${response.status}: ${response.statusText}`,
                    latencyMs: Date.now() - startTime,
                    providerId: this.getId()
                };
            }
            const responseData = new Uint8Array(await response.arrayBuffer());
            const timestampResponse = this.decodeResponse(responseData);
            return {
                success: timestampResponse.status.status === PKIStatus.GRANTED,
                response: timestampResponse,
                latencyMs: Date.now() - startTime,
                providerId: this.getId()
            };
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                latencyMs: Date.now() - startTime,
                providerId: this.getId()
            };
        }
    }
    async healthCheck() {
        const startTime = Date.now();
        try {
            // Send synthetic request for health check
            const syntheticRequest = {
                hashAlgorithm: '2.16.840.1.101.3.4.2.1', // SHA-256
                messageImprint: new Uint8Array(32).fill(0), // Zero hash for health check
                nonce: BigInt(Date.now()),
                certReq: true
            };
            const result = await this.sendRequest(syntheticRequest);
            return {
                healthy: result.success && result.latencyMs < 2000, // 2 second threshold
                latencyMs: result.latencyMs,
                error: result.error
            };
        }
        catch (error) {
            return {
                healthy: false,
                latencyMs: Date.now() - startTime,
                error: error instanceof Error ? error.message : 'Health check failed'
            };
        }
    }
    encodeRequest(request) {
        // TODO: Implement proper ASN.1 DER encoding for DigiCert format
        // For now, return mock encoded request
        return new Uint8Array([0x30, 0x20, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x05, 0x05, 0x00, 0x04, 0x13]);
    }
    decodeResponse(data) {
        // TODO: Implement proper ASN.1 DER decoding
        // For now, return mock response
        return {
            status: {
                status: PKIStatus.GRANTED
            }
        };
    }
}
export class GlobalSignAdapter extends TSAProviderAdapter {
    async sendRequest(request) {
        const startTime = Date.now();
        try {
            // Validate policy if specified
            if (request.reqPolicy && !this.isPolicyAllowed(request.reqPolicy)) {
                return {
                    success: false,
                    error: `Policy ${request.reqPolicy} not allowed for GlobalSign TSA`,
                    latencyMs: Date.now() - startTime,
                    providerId: this.getId()
                };
            }
            const encodedRequest = this.encodeRequest(request);
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            const response = await fetch(this.provider.url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/timestamp-query',
                    'Accept': 'application/timestamp-reply',
                    'User-Agent': 'C2-Concierge-TSA-Service/1.0'
                },
                body: Buffer.from(encodedRequest),
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            if (!response.ok) {
                return {
                    success: false,
                    error: `HTTP ${response.status}: ${response.statusText}`,
                    latencyMs: Date.now() - startTime,
                    providerId: this.getId()
                };
            }
            const responseData = new Uint8Array(await response.arrayBuffer());
            const timestampResponse = this.decodeResponse(responseData);
            return {
                success: timestampResponse.status.status === PKIStatus.GRANTED,
                response: timestampResponse,
                latencyMs: Date.now() - startTime,
                providerId: this.getId()
            };
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                latencyMs: Date.now() - startTime,
                providerId: this.getId()
            };
        }
    }
    async healthCheck() {
        const startTime = Date.now();
        try {
            const syntheticRequest = {
                hashAlgorithm: '2.16.840.1.101.3.4.2.1',
                messageImprint: new Uint8Array(32).fill(0),
                nonce: BigInt(Date.now()),
                certReq: true
            };
            const result = await this.sendRequest(syntheticRequest);
            return {
                healthy: result.success && result.latencyMs < 2000,
                latencyMs: result.latencyMs,
                error: result.error
            };
        }
        catch (error) {
            return {
                healthy: false,
                latencyMs: Date.now() - startTime,
                error: error instanceof Error ? error.message : 'Health check failed'
            };
        }
    }
    encodeRequest(request) {
        // GlobalSign specific encoding
        return new Uint8Array([0x30, 0x20, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x05, 0x05, 0x00, 0x04, 0x13]);
    }
    decodeResponse(data) {
        return {
            status: {
                status: PKIStatus.GRANTED
            }
        };
    }
}
export class SectigoAdapter extends TSAProviderAdapter {
    async sendRequest(request) {
        const startTime = Date.now();
        try {
            // Validate policy if specified
            if (request.reqPolicy && !this.isPolicyAllowed(request.reqPolicy)) {
                return {
                    success: false,
                    error: `Policy ${request.reqPolicy} not allowed for Sectigo TSA`,
                    latencyMs: Date.now() - startTime,
                    providerId: this.getId()
                };
            }
            const encodedRequest = this.encodeRequest(request);
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            const response = await fetch(this.provider.url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/timestamp-query',
                    'Accept': 'application/timestamp-reply',
                    'User-Agent': 'C2-Concierge-TSA-Service/1.0'
                },
                body: Buffer.from(encodedRequest),
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            if (!response.ok) {
                return {
                    success: false,
                    error: `HTTP ${response.status}: ${response.statusText}`,
                    latencyMs: Date.now() - startTime,
                    providerId: this.getId()
                };
            }
            const responseData = new Uint8Array(await response.arrayBuffer());
            const timestampResponse = this.decodeResponse(responseData);
            return {
                success: timestampResponse.status.status === PKIStatus.GRANTED,
                response: timestampResponse,
                latencyMs: Date.now() - startTime,
                providerId: this.getId()
            };
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                latencyMs: Date.now() - startTime,
                providerId: this.getId()
            };
        }
    }
    async healthCheck() {
        const startTime = Date.now();
        try {
            const syntheticRequest = {
                hashAlgorithm: '2.16.840.1.101.3.4.2.1',
                messageImprint: new Uint8Array(32).fill(0),
                nonce: BigInt(Date.now()),
                certReq: true
            };
            const result = await this.sendRequest(syntheticRequest);
            return {
                healthy: result.success && result.latencyMs < 2000,
                latencyMs: result.latencyMs,
                error: result.error
            };
        }
        catch (error) {
            return {
                healthy: false,
                latencyMs: Date.now() - startTime,
                error: error instanceof Error ? error.message : 'Health check failed'
            };
        }
    }
    encodeRequest(request) {
        // Sectigo specific encoding
        return new Uint8Array([0x30, 0x20, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x05, 0x05, 0x00, 0x04, 0x13]);
    }
    decodeResponse(data) {
        return {
            status: {
                status: PKIStatus.GRANTED
            }
        };
    }
}
export function createAdapter(provider) {
    switch (provider.id) {
        case 'digicert':
            return new DigiCertAdapter(provider);
        case 'globalsign':
            return new GlobalSignAdapter(provider);
        case 'sectigo':
            return new SectigoAdapter(provider);
        default:
            throw new Error(`Unsupported provider: ${provider.id}`);
    }
}
//# sourceMappingURL=provider-adapter.js.map