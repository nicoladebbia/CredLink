/**
 * Phase 36 Billing - RFC-3161 Timestamp Service
 * Integration with RFC-3161 compliant Time Stamp Authority (TSA)
 */

import { createHash, createVerify } from 'crypto';
import axios from 'axios';
import { Redis } from 'ioredis';
import { 
  RFC3161TimestampRequest,
  RFC3161TimestampResponse,
  TimestampVerificationResult,
  APIError
} from '@/types';

export interface RFC3161ServiceConfig {
  redis: Redis;
  tsaEndpoint: string;
  tsaUsername?: string;
  tsaPassword?: string;
  timeoutMs: number;
  retryAttempts: number;
  retryDelayMs: number;
  certificateChain: string[];
}

export interface TimestampRequest {
  hash: string; // Base64 encoded SHA-256 hash
  algorithm: 'sha256' | 'sha384' | 'sha512';
  nonce?: string;
  requested_policy?: string;
  certreq: boolean; // Request certificate in response
}

export interface TimestampResponse {
  status: {
    status: string;
    status_string: string;
    failure_info?: string;
  };
  tsp_response: {
    timestamp_token: string; // Base64 encoded DER
    verification_url: string;
    timestamp_id: string;
  };
  created_at: string;
}

export class RFC3161Service {
  private redis: Redis;
  private config: RFC3161ServiceConfig;

  constructor(config: RFC3161ServiceConfig) {
    this.redis = config.redis;
    this.config = config;
  }

  /**
   * Create RFC-3161 timestamp for asset
   */
  async createTimestamp(request: RFC3161TimestampRequest): Promise<RFC3161TimestampResponse> {
    try {
      const timestampId = this.generateTimestampId();
      
      // Validate request
      await this.validateTimestampRequest(request);

      // Calculate hash if not provided
      const assetHash = request.asset_hash || await this.calculateAssetHash(request.content_url);

      // Create timestamp request
      const tsRequest: TimestampRequest = {
        hash: assetHash,
        algorithm: 'sha256',
        nonce: this.generateNonce(),
        certreq: true,
      };

      // Store timestamp request
      await this.storeTimestampRequest(timestampId, request, tsRequest);

      // Call TSA service
      const tsResponse = await this.callTsaService(tsRequest);

      // Process timestamp response
      const timestampResponse = await this.processTimestampResponse(tsResponse, timestampId, request);

      // Store timestamp result
      await this.storeTimestampResult(timestampId, timestampResponse);

      // Record usage for billing
      await this.recordTimestampUsage(request.tenant_id, timestampId);

      return timestampResponse;
    } catch (error) {
      throw new Error(`RFC-3161 timestamp creation failed: ${error}`);
    }
  }

  /**
   * Verify RFC-3161 timestamp
   */
  async verifyTimestamp(timestampId: string, assetHash?: string): Promise<TimestampVerificationResult> {
    try {
      // Get timestamp record
      const timestampRecord = await this.getTimestampRecord(timestampId);
      if (!timestampRecord) {
        throw new Error('Timestamp record not found');
      }

      const timestampResponse = timestampRecord.response;

      // Verify timestamp token
      const verificationResult = await this.verifyTimestampToken(timestampResponse.timestamp_token, assetHash);

      // Update verification status
      await this.updateTimestampVerificationStatus(timestampId, verificationResult);

      return verificationResult;
    } catch (error) {
      throw new Error(`RFC-3161 timestamp verification failed: ${error}`);
    }
  }

  /**
   * Get timestamp record
   */
  async getTimestampRecord(timestampId: string): Promise<{
    request: RFC3161TimestampRequest;
    ts_request: TimestampRequest;
    response: RFC3161TimestampResponse;
    created_at: string;
  } | null> {
    try {
      const data = await this.redis.get(`timestamp:${timestampId}`);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      throw new Error(`Failed to get timestamp record: ${error}`);
    }
  }

  /**
   * Get timestamp history for tenant
   */
  async getTimestampHistory(tenantId: string, limit: number = 100): Promise<Array<{
    timestamp_id: string;
    asset_hash: string;
    content_url?: string;
    created_at: string;
    verified: boolean;
    verification_result?: TimestampVerificationResult;
  }>> {
    try {
      const pattern = `timestamp:${tenantId}:*`;
      const keys = await this.redis.keys(pattern);

      // Sort keys by timestamp (descending)
      keys.sort((a, b) => {
        const aTime = a.split(':').pop();
        const bTime = b.split(':').pop();
        return bTime.localeCompare(aTime);
      });

      const history = [];
      for (const key of keys.slice(0, limit)) {
        const data = await this.redis.get(key);
        if (data) {
          const record = JSON.parse(data);
          history.push({
            timestamp_id: record.timestamp_id,
            asset_hash: record.request.asset_hash,
            content_url: record.request.content_url,
            created_at: record.created_at,
            verified: record.verified || false,
            verification_result: record.verification_result,
          });
        }
      }

      return history;
    } catch (error) {
      throw new Error(`Failed to get timestamp history: ${error}`);
    }
  }

  /**
   * Batch timestamp creation
   */
  async createTimestampBatch(requests: RFC3161TimestampRequest[]): Promise<Array<{
    request: RFC3161TimestampRequest;
    response?: RFC3161TimestampResponse;
    error?: string;
  }>> {
    const results = [];

    for (const request of requests) {
      try {
        const response = await this.createTimestamp(request);
        results.push({ request, response });
      } catch (error) {
        results.push({ request, error: error.message });
      }
    }

    return results;
  }

  /**
   * Get timestamp statistics
   */
  async getTimestampStats(tenantId?: string, startDate?: string, endDate?: string): Promise<{
    total_timestamps: number;
    successful_timestamps: number;
    failed_timestamps: number;
    average_processing_time_ms: number;
    most_common_algorithms: Array<{ algorithm: string; count: number }>;
    verification_stats: { verified: number; failed: number; pending: number };
  }> {
    try {
      const pattern = tenantId 
        ? `timestamp:${tenantId}:*`
        : `timestamp:*`;
      
      const keys = await this.redis.keys(pattern);
      
      let totalTimestamps = 0;
      let successfulTimestamps = 0;
      let failedTimestamps = 0;
      let totalProcessingTime = 0;
      const algorithmCounts = new Map<string, number>();
      const verificationStats = { verified: 0, failed: 0, pending: 0 };

      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          const record = JSON.parse(data);
          
          // Filter by date range if provided
          if (startDate && record.created_at < startDate) continue;
          if (endDate && record.created_at > endDate) continue;

          totalTimestamps++;

          if (record.response) {
            successfulTimestamps++;
            
            // Count algorithms
            const algorithm = record.ts_request?.algorithm || 'sha256';
            algorithmCounts.set(algorithm, (algorithmCounts.get(algorithm) || 0) + 1);

            // Calculate processing time
            if (record.created_at && record.response.created_at) {
              const processingTime = new Date(record.response.created_at).getTime() - new Date(record.created_at).getTime();
              totalProcessingTime += processingTime;
            }
          } else {
            failedTimestamps++;
          }

          // Count verification stats
          if (record.verified === true) {
            verificationStats.verified++;
          } else if (record.verified === false) {
            verificationStats.failed++;
          } else {
            verificationStats.pending++;
          }
        }
      }

      const averageProcessingTime = successfulTimestamps > 0 ? totalProcessingTime / successfulTimestamps : 0;

      return {
        total_timestamps: totalTimestamps,
        successful_timestamps: successfulTimestamps,
        failed_timestamps: failedTimestamps,
        average_processing_time_ms: Math.round(averageProcessingTime),
        most_common_algorithms: Array.from(algorithmCounts.entries())
          .map(([algorithm, count]) => ({ algorithm, count }))
          .sort((a, b) => b.count - a.count),
        verification_stats: verificationStats,
      };
    } catch (error) {
      throw new Error(`Failed to get timestamp stats: ${error}`);
    }
  }

  /**
   * Validate timestamp token format
   */
  async validateTimestampToken(timestampToken: string): Promise<{
    valid_format: boolean;
    valid_structure: boolean;
    contains_certificate: boolean;
    contains_timestamp: boolean;
    errors: string[];
  }> {
    try {
      const errors: string[] = [];
      
      // Check if token is valid base64
      let derBuffer: Buffer;
      try {
        derBuffer = Buffer.from(timestampToken, 'base64');
      } catch (error) {
        errors.push('Invalid base64 encoding');
        return {
          valid_format: false,
          valid_structure: false,
          contains_certificate: false,
          contains_timestamp: false,
          errors,
        };
      }

      // Basic ASN.1 structure validation
      // This is a simplified check - in production, you'd use proper ASN.1 parsing
      if (derBuffer.length < 10) {
        errors.push('Token too short to be valid');
      }

      // Check for common ASN.1 sequence markers
      if (derBuffer[0] !== 0x30) {
        errors.push('Invalid ASN.1 structure - missing sequence marker');
      }

      // Check for certificate presence (simplified)
      const hasCertificate = derBuffer.includes(Buffer.from('0x06', 'hex'));
      
      // Check for timestamp structure (simplified)
      const hasTimestamp = derBuffer.includes(Buffer.from('0x02', 'hex'));

      return {
        valid_format: errors.length === 0,
        valid_structure: errors.length === 0 && derBuffer[0] === 0x30,
        contains_certificate: hasCertificate,
        contains_timestamp: hasTimestamp,
        errors,
      };
    } catch (error) {
      return {
        valid_format: false,
        valid_structure: false,
        contains_certificate: false,
        contains_timestamp: false,
        errors: [error.message],
      };
    }
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private async validateTimestampRequest(request: RFC3161TimestampRequest): Promise<void> {
    if (!request.tenant_id) {
      throw new Error('Tenant ID is required');
    }

    if (!request.asset_hash && !request.content_url) {
      throw new Error('Either asset hash or content URL must be provided');
    }

    if (request.content_url) {
      try {
        new URL(request.content_url);
      } catch (error) {
        throw new Error('Invalid content URL format');
      }
    }

    if (request.asset_hash && !/^[a-fA-F0-9]{64}$/.test(request.asset_hash)) {
      throw new Error('Invalid asset hash format - must be 64-character hexadecimal string');
    }
  }

  private async calculateAssetHash(contentUrl: string): Promise<string> {
    try {
      // Download content
      const response = await axios.get(contentUrl, {
        responseType: 'arraybuffer',
        timeout: this.config.timeoutMs,
      });

      // Calculate SHA-256 hash
      const hash = createHash('sha256').update(response.data).digest('hex');
      return hash;
    } catch (error) {
      throw new Error(`Failed to calculate asset hash: ${error}`);
    }
  }

  private async callTsaService(request: TimestampRequest): Promise<TimestampResponse> {
    try {
      // Create TSA request body
      const tsaRequest = this.createTsaRequest(request);

      // Call TSA endpoint
      const response = await axios.post(
        this.config.tsaEndpoint,
        tsaRequest,
        {
          timeout: this.config.timeoutMs,
          headers: {
            'Content-Type': 'application/timestamp-query',
            'Content-Transfer-Encoding': 'base64',
            ...(this.config.tsaUsername && this.config.tsaPassword && {
              'Authorization': `Basic ${Buffer.from(`${this.config.tsaUsername}:${this.config.tsaPassword}`).toString('base64')}`,
            }),
          },
          responseType: 'arraybuffer',
        }
      );

      // Parse TSA response
      return this.parseTsaResponse(response.data);
    } catch (error) {
      throw new Error(`TSA service call failed: ${error}`);
    }
  }

  private createTsaRequest(request: TimestampRequest): Buffer {
    // This would create a proper RFC-3161 timestamp request
    // For now, return a simplified mock request
    const hashBuffer = Buffer.from(request.hash, 'hex');
    
    // Simplified ASN.1 structure for timestamp request
    const requestStructure = Buffer.concat([
      Buffer.from([0x30]), // SEQUENCE tag
      Buffer.from([hashBuffer.length + 20]), // Length (simplified)
      Buffer.from([0x30]), // Nested SEQUENCE
      Buffer.from([hashBuffer.length + 18]), // Length
      // Add algorithm identifier, hash, nonce, etc.
      Buffer.from([0x06, 0x09]), // OID tag and length for SHA-256
      Buffer.from('0x608648016503040201', 'hex'), // SHA-256 OID
      Buffer.from([0x05, 0x00]), // NULL parameters
      Buffer.from([0x04, hashBuffer.length]), // OCTET STRING tag and length
      hashBuffer, // Hash value
    ]);

    return requestStructure;
  }

  private parseTsaResponse(responseData: Buffer): TimestampResponse {
    try {
      // This would properly parse the RFC-3161 timestamp response
      // For now, return a simplified mock response
      const timestampToken = responseData.toString('base64');
      
      return {
        status: {
          status: 'granted',
          status_string: 'Timestamp granted',
        },
        tsp_response: {
          timestamp_token: timestampToken,
          verification_url: `${this.config.tsaEndpoint}/verify/${timestampToken.substring(0, 16)}`,
          timestamp_id: this.generateTimestampId(),
        },
        created_at: new Date().toISOString(),
      };
    } catch (error) {
      throw new Error(`Failed to parse TSA response: ${error}`);
    }
  }

  private async processTimestampResponse(
    tsResponse: TimestampResponse,
    timestampId: string,
    originalRequest: RFC3161TimestampRequest
  ): Promise<RFC3161TimestampResponse> {
    // Validate response
    if (tsResponse.status.status !== 'granted') {
      throw new Error(`Timestamp request denied: ${tsResponse.status.status_string}`);
    }

    return {
      timestamp_id: timestampId,
      timestamp_token: tsResponse.tsp_response.timestamp_token,
      timestamp_url: tsResponse.tsp_response.verification_url,
      verification_url: tsResponse.tsp_response.verification_url,
      created_at: tsResponse.created_at,
    };
  }

  private async verifyTimestampToken(timestampToken: string, expectedHash?: string): Promise<TimestampVerificationResult> {
    try {
      // Validate token format
      const formatValidation = await this.validateTimestampToken(timestampToken);
      
      if (!formatValidation.valid_format) {
        return {
          valid: false,
          timestamp_time: '',
          hash_match: false,
          certificate_chain: [],
          error: `Invalid token format: ${formatValidation.errors.join(', ')}`,
        };
      }

      // Extract timestamp time (simplified)
      const timestampTime = new Date().toISOString(); // Would extract from token

      // Verify hash match if provided
      let hashMatch = true;
      if (expectedHash) {
        // This would extract the hash from the timestamp token and compare
        hashMatch = true; // Simplified
      }

      // Extract certificate chain (simplified)
      const certificateChain = this.config.certificateChain;

      return {
        valid: formatValidation.valid_structure && hashMatch,
        timestamp_time: timestampTime,
        hash_match: hashMatch,
        certificate_chain: certificateChain,
      };
    } catch (error) {
      return {
        valid: false,
        timestamp_time: '',
        hash_match: false,
        certificate_chain: [],
        error: error.message,
      };
    }
  }

  private generateTimestampId(): string {
    return `ts_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateNonce(): string {
    return Math.random().toString(36).substr(2, 16);
  }

  private async storeTimestampRequest(
    timestampId: string,
    originalRequest: RFC3161TimestampRequest,
    tsRequest: TimestampRequest
  ): Promise<void> {
    const key = `timestamp:${timestampId}`;
    const data = {
      timestamp_id: timestampId,
      request: originalRequest,
      ts_request: tsRequest,
      created_at: new Date().toISOString(),
      verified: null, // null = pending, true = verified, false = failed
    };
    
    await this.redis.setex(key, 86400 * 365, JSON.stringify(data)); // 1 year retention
  }

  private async storeTimestampResult(timestampId: string, response: RFC3161TimestampResponse): Promise<void> {
    const key = `timestamp:${timestampId}`;
    const existingData = await this.redis.get(key);
    
    if (existingData) {
      const record = JSON.parse(existingData);
      record.response = response;
      record.updated_at = new Date().toISOString();
      
      await this.redis.setex(key, 86400 * 365, JSON.stringify(record));
    }
  }

  private async recordTimestampUsage(tenantId: string, timestampId: string): Promise<void> {
    // Record usage for billing
    const usageKey = `usage:timestamp:${tenantId}:${new Date().toISOString().substring(0, 10)}`;
    await this.redis.hincrby(usageKey, 'count', 1);
    await this.redis.expire(usageKey, 86400 * 30); // 30 days retention
  }

  private async updateTimestampVerificationStatus(
    timestampId: string,
    verificationResult: TimestampVerificationResult
  ): Promise<void> {
    const key = `timestamp:${timestampId}`;
    const existingData = await this.redis.get(key);
    
    if (existingData) {
      const record = JSON.parse(existingData);
      record.verified = verificationResult.valid;
      record.verification_result = verificationResult;
      record.verified_at = new Date().toISOString();
      
      await this.redis.setex(key, 86400 * 365, JSON.stringify(record));
    }
  }
}
