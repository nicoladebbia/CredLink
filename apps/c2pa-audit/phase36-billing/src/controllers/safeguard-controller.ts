/**
 * Phase 39 - Safeguard Controller
 * API endpoints for safeguard evaluation and management
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { SafeguardService } from '../services/safeguard-service';
import { Redis } from 'ioredis';

interface SafeguardEvaluateRequest {
  tenant_id: string;
}

interface SafeguardEvaluateResponse {
  success: boolean;
  data?: {
    tenant_id: string;
    risk_level: 'low' | 'medium' | 'high' | 'critical';
    actions: string[];
    exposure_today: number;
    margin_percent: number;
    current_usage: {
      sign_events_today: number;
      verify_events_today: number;
      cache_hit_rate: number;
      tsa_enabled: boolean;
      avg_cpu_ms: number;
      traffic_multiplier: number;
    };
    recommendations: {
      immediate: string[];
      short_term: string[];
      long_term: string[];
    };
    degradation_state: {
      cache_ttl: number;
      stale_while_revalidate: boolean;
      tsa_batching: boolean;
      read_only_verify: boolean;
    };
  };
  error?: string;
}

interface BurstCapCheckRequest {
  tenant_id: string;
}

interface BurstCapCheckResponse {
  success: boolean;
  data?: {
    tenant_id: string;
    cap_exceeded: boolean;
    exposure_percent: number;
    daily_cap: number;
    current_exposure: number;
    degradation_applied: boolean;
    alerts_sent: boolean;
  };
  error?: string;
}

interface TenantResetRequest {
  tenant_id: string;
  reason: string;
}

interface TenantResetResponse {
  success: boolean;
  data?: {
    tenant_id: string;
    reset_at: string;
    reason: string;
    previous_state: any;
  };
  error?: string;
}

interface StormConditionsRequest {
  tenant_id: string;
}

interface StormConditionsResponse {
  success: boolean;
  data?: {
    tenant_id: string;
    storm_detected: boolean;
    cache_hit_rate: number;
    traffic_multiplier: number;
    emergency_mode: boolean;
    cache_settings: {
      max_age: number;
      stale_while_revalidate: number;
    };
  };
  error?: string;
}

export class SafeguardController {
  private safeguardService: SafeguardService;

  constructor(redis: Redis) {
    this.safeguardService = new SafeguardService(redis);
  }

  /**
   * POST /safeguards/evaluate
   * Evaluate safeguards for a tenant
   */
  async evaluateSafeguards(request: FastifyRequest<{ Body: SafeguardEvaluateRequest }>, reply: FastifyReply) {
    try {
      const { tenant_id } = request.body;

      if (!tenant_id) {
        return reply.status(400).send({
          success: false,
          error: 'tenant_id is required'
        } as SafeguardEvaluateResponse);
      }

      const evaluation = await this.safeguardService.evaluateSafeguards(tenant_id);

      const response: SafeguardEvaluateResponse = {
        success: true,
        data: evaluation
      };

      return reply.send(response);
    } catch (error: any) {
      request.log.error('Safeguard evaluation failed:', error?.message || error);
      return reply.status(500).send({
        success: false,
        error: 'Internal server error during safeguard evaluation'
      } as SafeguardEvaluateResponse);
    }
  }

  /**
   * POST /safeguards/check-burst-cap
   * Check if tenant exceeds burst caps
   */
  async checkBurstCap(request: FastifyRequest<{ Body: BurstCapCheckRequest }>, reply: FastifyReply) {
    try {
      const { tenant_id } = request.body;

      if (!tenant_id) {
        return reply.status(400).send({
          success: false,
          error: 'tenant_id is required'
        } as BurstCapCheckResponse);
      }

      const capExceeded = await this.safeguardService.checkBurstCaps(tenant_id);
      const evaluation = await this.safeguardService.evaluateSafeguards(tenant_id);

      // Get burst cap details (simplified for response)
      const dailyCap = 200; // This would come from tenant's plan configuration
      const exposurePercent = evaluation.exposure_today / dailyCap;

      const response: BurstCapCheckResponse = {
        success: true,
        data: {
          tenant_id,
          cap_exceeded: capExceeded,
          exposure_percent: exposurePercent,
          daily_cap: dailyCap,
          current_exposure: evaluation.exposure_today,
          degradation_applied: evaluation.risk_level === 'critical' || evaluation.risk_level === 'high',
          alerts_sent: exposurePercent > 0.8
        }
      };

      return reply.send(response);
    } catch (error: any) {
      request.log.error('Burst cap check failed:', error?.message || error);
      return reply.status(500).send({
        success: false,
        error: 'Internal server error during burst cap check'
      } as BurstCapCheckResponse);
    }
  }

  /**
   * POST /safeguards/reset-tenant
   * Reset tenant to normal operations
   */
  async resetTenant(request: FastifyRequest<{ Body: TenantResetRequest }>, reply: FastifyReply) {
    try {
      const { tenant_id, reason } = request.body;

      if (!tenant_id || !reason) {
        return reply.status(400).send({
          success: false,
          error: 'tenant_id and reason are required'
        } as TenantResetResponse);
      }

      // Get current state before reset
      const currentState = await this.safeguardService.evaluateSafeguards(tenant_id);

      // Perform reset
      await this.safeguardService.resetTenant(tenant_id);

      const response: TenantResetResponse = {
        success: true,
        data: {
          tenant_id,
          reset_at: new Date().toISOString(),
          reason,
          previous_state: currentState
        }
      };

      // Log reset action
      request.log.info(`Tenant ${tenant_id} reset: ${reason}`);

      return reply.send(response);
    } catch (error: any) {
      request.log.error('Tenant reset failed:', error?.message || error);
      return reply.status(500).send({
        success: false,
        error: 'Internal server error during tenant reset'
      } as TenantResetResponse);
    }
  }

  /**
   * POST /safeguards/handle-storm
   * Handle storm conditions for tenant
   */
  async handleStormConditions(request: FastifyRequest<{ Body: StormConditionsRequest }>, reply: FastifyReply) {
    try {
      const { tenant_id } = request.body;

      if (!tenant_id) {
        return reply.status(400).send({
          success: false,
          error: 'tenant_id is required'
        } as StormConditionsResponse);
      }

      // Handle storm conditions
      await this.safeguardService.handleStormConditions(tenant_id);

      // Get current evaluation
      const evaluation = await this.safeguardService.evaluateSafeguards(tenant_id);

      const response: StormConditionsResponse = {
        success: true,
        data: {
          tenant_id,
          storm_detected: evaluation.current_usage.traffic_multiplier > 10 && evaluation.current_usage.cache_hit_rate < 0.5,
          cache_hit_rate: evaluation.current_usage.cache_hit_rate,
          traffic_multiplier: evaluation.current_usage.traffic_multiplier,
          emergency_mode: evaluation.risk_level === 'critical',
          cache_settings: {
            max_age: evaluation.degradation_state.cache_ttl,
            stale_while_revalidate: evaluation.degradation_state.stale_while_revalidate ? 300 : 0
          }
        }
      };

      return reply.send(response);
    } catch (error: any) {
      request.log.error('Storm conditions handling failed:', error?.message || error);
      return reply.status(500).send({
        success: false,
        error: 'Internal server error during storm conditions handling'
      } as StormConditionsResponse);
    }
  }

  /**
   * GET /safeguards/tenant/:tenant_id/history
   * Get safeguard history for tenant
   */
  async getSafeguardHistory(request: FastifyRequest<{ Params: { tenant_id: string } }>, reply: FastifyReply) {
    try {
      const { tenant_id } = request.params;

      if (!tenant_id) {
        return reply.status(400).send({
          success: false,
          error: 'tenant_id is required'
        });
      }

      // This would retrieve historical data from Redis or database
      // For now, return a placeholder response
      const response = {
        success: true,
        data: {
          tenant_id,
          evaluations: [],
          degradations: [],
          storm_activations: [],
          resets: []
        }
      };

      return reply.send(response);
    } catch (error: any) {
      request.log.error('Failed to get safeguard history:', error?.message || error);
      return reply.status(500).send({
        success: false,
        error: 'Internal server error while retrieving safeguard history'
      });
    }
  }

  /**
   * GET /safeguards/dashboard
   * Get overall safeguard dashboard data
   */
  async getSafeguardDashboard(request: FastifyRequest, reply: FastifyReply) {
    try {
      // This would aggregate data across all tenants
      // For now, return a placeholder response
      const response = {
        success: true,
        data: {
          total_tenants: 0,
          risk_distribution: {
            low: 0,
            medium: 0,
            high: 0,
            critical: 0
          },
          active_degradations: 0,
          storm_conditions: 0,
          total_exposure_today: 0,
          average_margin_percent: 0,
          alerts_triggered: 0
        }
      };

      return reply.send(response);
    } catch (error: any) {
      request.log.error('Failed to get safeguard dashboard:', error?.message || error);
      return reply.status(500).send({
        success: false,
        error: 'Internal server error while retrieving safeguard dashboard'
      });
    }
  }
}
