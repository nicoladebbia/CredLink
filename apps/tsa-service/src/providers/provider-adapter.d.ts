/**
 * TSA Provider Adapter
 * Minimal stateless adapters for DigiCert, GlobalSign, Sectigo endpoints
 */
import { TimeStampRequest, TimeStampResponse } from '../types/rfc3161.js';
import { TSAProvider } from './provider-config.js';
export interface ProviderResponse {
    success: boolean;
    response?: TimeStampResponse;
    error?: string;
    latencyMs: number;
    providerId: string;
}
export declare abstract class TSAProviderAdapter {
    protected provider: TSAProvider;
    constructor(provider: TSAProvider);
    /**
     * Send timestamp request to provider
     */
    abstract sendRequest(request: TimeStampRequest): Promise<ProviderResponse>;
    /**
     * Health check probe
     */
    abstract healthCheck(): Promise<{
        healthy: boolean;
        latencyMs: number;
        error?: string;
    }>;
    /**
     * Get provider ID
     */
    getId(): string;
    /**
     * Get provider name
     */
    getName(): string;
    /**
     * Validate policy is allowed for this provider
     */
    isPolicyAllowed(policyOid: string): boolean;
}
export declare class DigiCertAdapter extends TSAProviderAdapter {
    sendRequest(request: TimeStampRequest): Promise<ProviderResponse>;
    healthCheck(): Promise<{
        healthy: boolean;
        latencyMs: number;
        error?: string;
    }>;
    private encodeRequest;
    private decodeResponse;
}
export declare class GlobalSignAdapter extends TSAProviderAdapter {
    sendRequest(request: TimeStampRequest): Promise<ProviderResponse>;
    healthCheck(): Promise<{
        healthy: boolean;
        latencyMs: number;
        error?: string;
    }>;
    private encodeRequest;
    private decodeResponse;
}
export declare class SectigoAdapter extends TSAProviderAdapter {
    sendRequest(request: TimeStampRequest): Promise<ProviderResponse>;
    healthCheck(): Promise<{
        healthy: boolean;
        latencyMs: number;
        error?: string;
    }>;
    private encodeRequest;
    private decodeResponse;
}
export declare function createAdapter(provider: TSAProvider): TSAProviderAdapter;
//# sourceMappingURL=provider-adapter.d.ts.map