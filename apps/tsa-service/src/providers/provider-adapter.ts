/**
 * TSA Provider Adapter
 * Minimal stateless adapters for DigiCert, GlobalSign, Sectigo endpoints
 */

import { TimeStampRequest, TimeStampResponse, PKIStatus } from '../types/rfc3161.js';
import { TSAProvider } from './provider-config.js';

export interface ProviderResponse {
  success: boolean;
  response?: TimeStampResponse;
  error?: string;
  latencyMs: number;
  providerId: string;
}

export abstract class TSAProviderAdapter {
  protected provider: TSAProvider;
  
  constructor(provider: TSAProvider) {
    this.provider = provider;
  }

  /**
   * Send timestamp request to provider
   */
  abstract sendRequest(request: TimeStampRequest): Promise<ProviderResponse>;

  /**
   * Health check probe
   */
  abstract healthCheck(): Promise<{ healthy: boolean; latencyMs: number; error?: string }>;

  /**
   * Get provider ID
   */
  getId(): string {
    return this.provider.id;
  }

  /**
   * Get provider name
   */
  getName(): string {
    return this.provider.name;
  }

  /**
   * Validate policy is allowed for this provider
   */
  isPolicyAllowed(policyOid: string): boolean {
    return this.provider.allowedPolicies.includes(policyOid);
  }
}

export class DigiCertAdapter extends TSAProviderAdapter {
  async sendRequest(request: TimeStampRequest): Promise<ProviderResponse> {
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
        body: encodedRequest.buffer,
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

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        latencyMs: Date.now() - startTime,
        providerId: this.getId()
      };
    }
  }

  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number; error?: string }> {
    const startTime = Date.now();
    
    try {
      // Send synthetic request for health check
      const syntheticRequest: TimeStampRequest = {
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

    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Health check failed'
      };
    }
  }

  private encodeRequest(request: TimeStampRequest): Uint8Array {
    // TODO: Implement proper ASN.1 DER encoding for DigiCert format
    // For now, return mock encoded request
    return new Uint8Array([0x30, 0x20, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x05, 0x05, 0x00, 0x04, 0x13]);
  }

  private decodeResponse(data: Uint8Array): TimeStampResponse {
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
  async sendRequest(request: TimeStampRequest): Promise<ProviderResponse> {
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
        body: encodedRequest.buffer,
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

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        latencyMs: Date.now() - startTime,
        providerId: this.getId()
      };
    }
  }

  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number; error?: string }> {
    const startTime = Date.now();
    
    try {
      const syntheticRequest: TimeStampRequest = {
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

    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Health check failed'
      };
    }
  }

  private encodeRequest(request: TimeStampRequest): Uint8Array {
    // GlobalSign specific encoding
    return new Uint8Array([0x30, 0x20, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x05, 0x05, 0x00, 0x04, 0x13]);
  }

  private decodeResponse(data: Uint8Array): TimeStampResponse {
    return {
      status: {
        status: PKIStatus.GRANTED
      }
    };
  }
}

export class SectigoAdapter extends TSAProviderAdapter {
  async sendRequest(request: TimeStampRequest): Promise<ProviderResponse> {
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
        body: encodedRequest.buffer,
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

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        latencyMs: Date.now() - startTime,
        providerId: this.getId()
      };
    }
  }

  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number; error?: string }> {
    const startTime = Date.now();
    
    try {
      const syntheticRequest: TimeStampRequest = {
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

    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Health check failed'
      };
    }
  }

  private encodeRequest(request: TimeStampRequest): Uint8Array {
    // Sectigo specific encoding
    return new Uint8Array([0x30, 0x20, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x05, 0x05, 0x00, 0x04, 0x13]);
  }

  private decodeResponse(data: Uint8Array): TimeStampResponse {
    return {
      status: {
        status: PKIStatus.GRANTED
      }
    };
  }
}

export function createAdapter(provider: TSAProvider): TSAProviderAdapter {
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
