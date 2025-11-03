/**
 * Phase 38 - Billing Abuse Guards
 * Implements Stripe rate limit compliance, idempotency enforcement, and abuse detection
 */

import { Redis } from 'ioredis';
import { createHash } from 'crypto';
import Stripe from 'stripe';

// Idempotency configuration
interface IdempotencyConfig {
  keyLength: number;
  defaultTtl: number; // 24 hours in seconds
  maxTtl: number; // 7 days in seconds
  keyPrefix: string;
}

// Rate limit configuration following Stripe limits
interface RateLimitConfig {
  stripeApiLimit: number; // 25 requests per second
  safetyBuffer: number; // 5 requests per second buffer
  windowSize: number; // 1 second window
  burstAllowance: number; // Allow occasional bursts
}

// Abuse detection thresholds
interface AbuseThresholds {
  maxFailedAttempts: number; // Per hour
  maxRefundRequests: number; // Per hour
  maxChargebackRisk: number; // Risk score threshold
  suspiciousPatternThreshold: number; // Pattern detection score
}

// Billing event structure for tracking
interface BillingEvent {
  id: string;
  type: 'charge' | 'refund' | 'dispute' | 'inquiry';
  tenantId: string;
  amount: number;
  currency: string;
  status: 'pending' | 'completed' | 'failed' | 'reversed';
  metadata: Record<string, any>;
  timestamp: number;
  riskScore: number;
  idempotencyKey?: string;
  clientIp?: string;
  userAgent?: string;
}

export class BillingAbuseGuards {
  private redis: Redis;
  private stripe: Stripe;
  private idempotencyConfig: IdempotencyConfig;
  private rateLimitConfig: RateLimitConfig;
  private abuseThresholds: AbuseThresholds;
  
  constructor(redis: Redis, stripe: Stripe) {
    this.redis = redis;
    this.stripe = stripe;
    this.idempotencyConfig = {
      keyLength: 32,
      defaultTtl: 24 * 60 * 60, // 24 hours
      maxTtl: 7 * 24 * 60 * 60, // 7 days
      keyPrefix: 'billing_idempotency:',
    };
    this.rateLimitConfig = {
      stripeApiLimit: 25,
      safetyBuffer: 5,
      windowSize: 1,
      burstAllowance: 3,
    };
    this.abuseThresholds = {
      maxFailedAttempts: 10,
      maxRefundRequests: 5,
      maxChargebackRisk: 80,
      suspiciousPatternThreshold: 70,
    };
  }
  
  /**
   * Generate secure idempotency key
   */
  generateIdempotencyKey(tenantId: string, operation: string, data: any): string {
    const keyData = {
      tenantId,
      operation,
      data: JSON.stringify(data),
      timestamp: Math.floor(Date.now() / 1000),
    };
    
    const keyString = JSON.stringify(keyData);
    const hash = createHash('sha256').update(keyString).digest('hex');
    
    return hash.substring(0, this.idempotencyConfig.keyLength);
  }
  
  /**
   * Validate and store idempotency key
   */
  async validateIdempotencyKey(
    key: string,
    operation: string,
    ttl?: number
  ): Promise<{
    valid: boolean;
    existingResponse?: any;
    error?: string;
  }> {
    try {
      const idempotencyKey = `${this.idempotencyConfig.keyPrefix}${key}`;
      
      // Check if key exists
      const existingData = await this.redis.get(idempotencyKey);
      
      if (existingData) {
        const parsed = JSON.parse(existingData);
        
        // Check if operation matches
        if (parsed.operation !== operation) {
          return {
            valid: false,
            error: 'Idempotency key already used for different operation',
          };
        }
        
        // Return existing response
        return {
          valid: true,
          existingResponse: parsed.response,
        };
      }
      
      // Mark key as used temporarily to prevent race conditions
      const tempData = {
        operation,
        status: 'processing',
        timestamp: Date.now(),
      };
      
      await this.redis.setex(
        idempotencyKey,
        300, // 5 minutes temporary lock
        JSON.stringify(tempData)
      );
      
      return { valid: true };
      
    } catch (error) {
      console.error('Idempotency validation failed:', error);
      return {
        valid: false,
        error: 'Idempotency verification failed',
      };
    }
  }
  
  /**
   * Store successful response for idempotency key
   */
  async storeIdempotencyResponse(
    key: string,
    operation: string,
    response: any,
    ttl?: number
  ): Promise<void> {
    try {
      const idempotencyKey = `${this.idempotencyConfig.keyPrefix}${key}`;
      const effectiveTtl = Math.min(
        ttl || this.idempotencyConfig.defaultTtl,
        this.idempotencyConfig.maxTtl
      );
      
      const data = {
        operation,
        response,
        timestamp: Date.now(),
        status: 'completed',
      };
      
      await this.redis.setex(idempotencyKey, effectiveTtl, JSON.stringify(data));
      
    } catch (error) {
      console.error('Failed to store idempotency response:', error);
    }
  }
  
  /**
   * Check Stripe API rate limits with safety buffer
   */
  async checkStripeRateLimit(): Promise<{
    allowed: boolean;
    remaining: number;
    resetTime: Date;
    retryAfter?: number;
  }> {
    try {
      const now = Math.floor(Date.now() / 1000);
      const windowStart = now - this.rateLimitConfig.windowSize;
      const rateLimitKey = 'stripe_rate_limit:current_window';
      
      // Get current request count
      const currentCount = parseInt(await this.redis.get(rateLimitKey) || '0');
      const effectiveLimit = this.rateLimitConfig.stripeApiLimit - this.rateLimitConfig.safetyBuffer;
      
      if (currentCount >= effectiveLimit) {
        return {
          allowed: false,
          remaining: 0,
          resetTime: new Date((windowStart + 1) * 1000),
          retryAfter: 1,
        };
      }
      
      return {
        allowed: true,
        remaining: effectiveLimit - currentCount,
        resetTime: new Date((windowStart + 1) * 1000),
      };
      
    } catch (error) {
      console.error('Rate limit check failed:', error);
      // Fail open to avoid service disruption
      return {
        allowed: true,
        remaining: this.rateLimitConfig.safetyBuffer,
        resetTime: new Date(Date.now() + 1000),
      };
    }
  }
  
  /**
   * Record Stripe API call for rate limiting
   */
  async recordStripeApiCall(): Promise<void> {
    try {
      const now = Math.floor(Date.now() / 1000);
      const windowStart = now - this.rateLimitConfig.windowSize;
      const rateLimitKey = 'stripe_rate_limit:current_window';
      
      // Increment counter
      await this.redis.incr(rateLimitKey);
      
      // Set expiry
      await this.redis.expire(rateLimitKey, this.rateLimitConfig.windowSize * 2);
      
    } catch (error) {
      console.error('Failed to record Stripe API call:', error);
    }
  }
  
  /**
   * Analyze billing request for abuse patterns
   */
  async analyzeBillingRequest(
    tenantId: string,
    requestType: 'charge' | 'refund',
    amount: number,
    clientIp?: string,
    userAgent?: string
  ): Promise<{
    riskScore: number;
    allowed: boolean;
    reasons: string[];
    recommendations: string[];
  }> {
    try {
      const riskFactors: Array<{ score: number; reason: string }> = [];
      const recommendations: string[] = [];
      
      // Check tenant's recent failure rate
      const failureRate = await this.getTenantFailureRate(tenantId);
      if (failureRate > 0.3) { // 30% failure rate
        riskFactors.push({
          score: 25,
          reason: 'High recent failure rate',
        });
        recommendations.push('Require additional verification');
      }
      
      // Check refund frequency
      if (requestType === 'refund') {
        const refundRate = await this.getTenantRefundRate(tenantId);
        if (refundRate > 0.1) { // 10% refund rate
          riskFactors.push({
            score: 30,
            reason: 'High refund frequency',
          });
          recommendations.push('Implement refund cooldown');
        }
      }
      
      // Check amount patterns
      const amountAnomaly = await this.detectAmountAnomaly(tenantId, amount);
      if (amountAnomaly > 0.7) { // 70% anomaly score
        riskFactors.push({
          score: 20,
          reason: 'Unusual transaction amount',
        });
        recommendations.push('Require manual review for large amounts');
      }
      
      // Check velocity (requests per time period)
      const velocityScore = await this.checkRequestVelocity(tenantId, clientIp);
      if (velocityScore > 0.8) { // 80% velocity threshold
        riskFactors.push({
          score: 35,
          reason: 'High request velocity',
        });
        recommendations.push('Implement rate limiting');
      }
      
      // Check geographic patterns
      if (clientIp) {
        const geoRisk = await this.analyzeGeographicRisk(tenantId, clientIp);
        if (geoRisk > 0.6) { // 60% geographic risk
          riskFactors.push({
            score: 15,
            reason: 'Suspicious geographic pattern',
          });
          recommendations.push('Require location verification');
        }
      }
      
      // Calculate total risk score
      const totalRiskScore = riskFactors.reduce((sum, factor) => sum + factor.score, 0);
      const reasons = riskFactors.map(factor => factor.reason);
      
      // Determine if request should be allowed
      const allowed = totalRiskScore < this.abuseThresholds.suspiciousPatternThreshold;
      
      return {
        riskScore: Math.min(totalRiskScore, 100),
        allowed,
        reasons,
        recommendations,
      };
      
    } catch (error) {
      console.error('Abuse analysis failed:', error);
      // Fail open with moderate risk
      return {
        riskScore: 50,
        allowed: true,
        reasons: ['Analysis service unavailable'],
        recommendations: ['Monitor transaction manually'],
      };
    }
  }
  
  /**
   * Get tenant's recent failure rate
   */
  private async getTenantFailureRate(tenantId: string): Promise<number> {
    try {
      const now = Date.now();
      const hourAgo = now - (60 * 60 * 1000);
      
      const failedKey = `billing_events:${tenantId}:failed:${Math.floor(hourAgo / (60 * 60 * 1000))}`;
      const totalKey = `billing_events:${tenantId}:total:${Math.floor(hourAgo / (60 * 60 * 1000))}`;
      
      const [failed, total] = await Promise.all([
        this.redis.get(failedKey),
        this.redis.get(totalKey),
      ]);
      
      const failedCount = parseInt(failed || '0');
      const totalCount = parseInt(total || '0');
      
      return totalCount > 0 ? failedCount / totalCount : 0;
      
    } catch (error) {
      console.error('Failed to get failure rate:', error);
      return 0;
    }
  }
  
  /**
   * Get tenant's refund rate
   */
  private async getTenantRefundRate(tenantId: string): Promise<number> {
    try {
      const now = Date.now();
      const dayAgo = now - (24 * 60 * 60 * 1000);
      
      const refundKey = `billing_events:${tenantId}:refund:${Math.floor(dayAgo / (24 * 60 * 60 * 1000))}`;
      const chargeKey = `billing_events:${tenantId}:charge:${Math.floor(dayAgo / (24 * 60 * 60 * 1000))}`;
      
      const [refunds, charges] = await Promise.all([
        this.redis.get(refundKey),
        this.redis.get(chargeKey),
      ]);
      
      const refundCount = parseInt(refunds || '0');
      const chargeCount = parseInt(charges || '0');
      
      return chargeCount > 0 ? refundCount / chargeCount : 0;
      
    } catch (error) {
      console.error('Failed to get refund rate:', error);
      return 0;
    }
  }
  
  /**
   * Detect amount anomalies
   */
  private async detectAmountAnomaly(tenantId: string, amount: number): Promise<number> {
    try {
      // Get historical amounts for the tenant
      const historyKey = `billing_amounts:${tenantId}`;
      const amounts = await this.redis.lrange(historyKey, 0, 99); // Last 100 transactions
      
      if (amounts.length < 5) {
        return 0; // Not enough data
      }
      
      const numericAmounts = amounts.map(a => parseFloat(a));
      const mean = numericAmounts.reduce((sum, a) => sum + a, 0) / numericAmounts.length;
      const variance = numericAmounts.reduce((sum, a) => sum + Math.pow(a - mean, 2), 0) / numericAmounts.length;
      const stdDev = Math.sqrt(variance);
      
      // Calculate Z-score
      const zScore = Math.abs((amount - mean) / stdDev);
      
      // Convert to anomaly score (0-1)
      return Math.min(zScore / 3, 1); // 3 standard deviations = 100% anomaly
      
    } catch (error) {
      console.error('Failed to detect amount anomaly:', error);
      return 0;
    }
  }
  
  /**
   * Check request velocity
   */
  private async checkRequestVelocity(tenantId: string, clientIp?: string): Promise<number> {
    try {
      const now = Math.floor(Date.now() / 1000);
      const minuteAgo = now - 60;
      
      const tenantKey = `request_velocity:${tenantId}:${Math.floor(minuteAgo / 60)}`;
      const ipKey = clientIp ? `request_velocity:${clientIp}:${Math.floor(minuteAgo / 60)}` : null;
      
      const [tenantCount, ipCount] = await Promise.all([
        this.redis.get(tenantKey),
        ipKey ? this.redis.get(ipKey) : Promise.resolve('0'),
      ]);
      
      const tenantRequests = parseInt(tenantCount || '0');
      const ipRequests = parseInt(ipCount || '0');
      
      // Calculate velocity score based on thresholds
      const tenantScore = Math.min(tenantRequests / 30, 1); // 30 requests per minute = 100%
      const ipScore = Math.min(ipRequests / 10, 1); // 10 requests per minute = 100%
      
      return Math.max(tenantScore, ipScore);
      
    } catch (error) {
      console.error('Failed to check request velocity:', error);
      return 0;
    }
  }
  
  /**
   * Analyze geographic risk patterns
   */
  private async analyzeGeographicRisk(tenantId: string, clientIp: string): Promise<number> {
    try {
      // Get previous locations for tenant
      const locationKey = `tenant_locations:${tenantId}`;
      const previousLocations = await this.redis.smembers(locationKey);
      
      // Get current location (simplified - in production, use GeoIP database)
      const currentLocation = this.extractLocationFromIp(clientIp);
      
      if (!currentLocation) {
        return 0.5; // Unknown location = moderate risk
      }
      
      // Check if this is a new location
      if (!previousLocations.includes(currentLocation)) {
        // Check how many different locations have been seen
        if (previousLocations.length > 5) {
          return 0.8; // Many different locations = high risk
        }
        return 0.6; // New location = moderate-high risk
      }
      
      return 0.1; // Known location = low risk
      
    } catch (error) {
      console.error('Failed to analyze geographic risk:', error);
      return 0;
    }
  }
  
  /**
   * Extract location from IP (simplified implementation)
   */
  private extractLocationFromIp(ip: string): string {
    // In production, use a proper GeoIP database
    // This is a simplified example
    if (ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) {
      return 'private';
    }
    
    // Simple country code extraction (placeholder)
    return 'unknown';
  }
  
  /**
   * Record billing event for analysis
   */
  async recordBillingEvent(event: BillingEvent): Promise<void> {
    try {
      const now = Date.now();
      const hour = Math.floor(now / (60 * 60 * 1000));
      const day = Math.floor(now / (24 * 60 * 60 * 1000));
      
      // Record total events
      await this.redis.incr(`billing_events:${event.tenantId}:total:${hour}`);
      await this.redis.expire(`billing_events:${event.tenantId}:total:${hour}`, 25 * 60 * 60);
      
      // Record specific event types
      if (event.status === 'failed') {
        await this.redis.incr(`billing_events:${event.tenantId}:failed:${hour}`);
        await this.redis.expire(`billing_events:${event.tenantId}:failed:${hour}`, 25 * 60 * 60);
      }
      
      if (event.type === 'refund') {
        await this.redis.incr(`billing_events:${event.tenantId}:refund:${day}`);
        await this.redis.expire(`billing_events:${event.tenantId}:refund:${day}`, 8 * 24 * 60 * 60);
      }
      
      if (event.type === 'charge') {
        await this.redis.incr(`billing_events:${event.tenantId}:charge:${day}`);
        await this.redis.expire(`billing_events:${event.tenantId}:charge:${day}`, 8 * 24 * 60 * 60);
      }
      
      // Record amount history for anomaly detection
      const amountKey = `billing_amounts:${event.tenantId}`;
      await this.redis.lpush(amountKey, event.amount.toString());
      await this.redis.ltrim(amountKey, 0, 99); // Keep last 100
      await this.redis.expire(amountKey, 30 * 24 * 60 * 60); // 30 days
      
      // Record request velocity
      const minute = Math.floor(now / (60 * 1000));
      if (event.clientIp) {
        await this.redis.incr(`request_velocity:${event.clientIp}:${minute}`);
        await this.redis.expire(`request_velocity:${event.clientIp}:${minute}`, 5 * 60);
      }
      await this.redis.incr(`request_velocity:${event.tenantId}:${minute}`);
      await this.redis.expire(`request_velocity:${event.tenantId}:${minute}`, 5 * 60);
      
      // Record geographic patterns
      if (event.clientIp) {
        const location = this.extractLocationFromIp(event.clientIp);
        if (location) {
          await this.redis.sadd(`tenant_locations:${event.tenantId}`, location);
          await this.redis.expire(`tenant_locations:${event.tenantId}`, 7 * 24 * 60 * 60);
        }
      }
      
    } catch (error) {
      console.error('Failed to record billing event:', error);
    }
  }
  
  /**
   * Generate dispute evidence bundle
   */
  async generateDisputeEvidence(tenantId: string, chargeId: string): Promise<{
    evidence: any;
    metadata: any;
  }> {
    try {
      // Collect all relevant evidence
      const evidence = {
        chargeDetails: await this.stripe.charges.retrieve(chargeId),
        billingEvents: await this.getTenantBillingEvents(tenantId, chargeId),
        riskAnalysis: await this.getHistoricalRiskAnalysis(tenantId),
        ipHistory: await this.getTenantIpHistory(tenantId),
        amountHistory: await this.getTenantAmountHistory(tenantId),
        velocityData: await this.getTenantVelocityData(tenantId),
        geographicData: await this.getTenantGeographicData(tenantId),
        idempotencyRecords: await this.getIdempotencyRecords(tenantId, chargeId),
      };
      
      const metadata = {
        generatedAt: new Date().toISOString(),
        tenantId,
        chargeId,
        evidenceVersion: '1.0',
        complianceFrameworks: ['PCI-DSS', 'SOX', 'GDPR'],
        retentionPeriod: '7 years',
      };
      
      return { evidence, metadata };
      
    } catch (error) {
      console.error('Failed to generate dispute evidence:', error);
      throw new Error('Evidence generation failed');
    }
  }
  
  /**
   * Helper methods for evidence collection
   */
  private async getTenantBillingEvents(tenantId: string, chargeId: string): Promise<any[]> {
    // Implementation would retrieve relevant billing events
    return [];
  }
  
  private async getHistoricalRiskAnalysis(tenantId: string): Promise<any> {
    // Implementation would retrieve risk analysis history
    return {};
  }
  
  private async getTenantIpHistory(tenantId: string): Promise<string[]> {
    // Implementation would retrieve IP history
    return [];
  }
  
  private async getTenantAmountHistory(tenantId: string): Promise<number[]> {
    try {
      const amountKey = `billing_amounts:${tenantId}`;
      return (await this.redis.lrange(amountKey, 0, 49)).map(a => parseFloat(a));
    } catch (error) {
      console.error('Failed to get amount history:', error);
      return [];
    }
  }
  
  private async getTenantVelocityData(tenantId: string): Promise<any> {
    // Implementation would retrieve velocity data
    return {};
  }
  
  private async getTenantGeographicData(tenantId: string): Promise<string[]> {
    try {
      const locationKey = `tenant_locations:${tenantId}`;
      return await this.redis.smembers(locationKey);
    } catch (error) {
      console.error('Failed to get geographic data:', error);
      return [];
    }
  }
  
  private async getIdempotencyRecords(tenantId: string, chargeId: string): Promise<any[]> {
    // Implementation would retrieve idempotency records
    return [];
  }
}
