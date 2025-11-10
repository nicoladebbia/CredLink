/**
 * Phase 39 - Pricing Controller
 * Public plan calculator and internal pricing simulation API
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { EconomicsService } from '../services/economics-service';
import { Redis } from 'ioredis';

interface PricingSimulateRequest {
  assets: number;
  verifies_per_asset: number;
  cache_hit_rate: number;
  tsa: boolean;
  stack: 'r2+workers' | 's3+workers';
  plan: 'starter_199' | 'pro_699' | 'enterprise_2k';
  period_days?: number;
  annual?: boolean;
}

interface PricingSimulateResponse {
  success: boolean;
  data?: {
    cogs_breakdown: {
      storage: number;
      compute: number;
      tsa: number;
      network_ops: number;
      total: number;
    };
    gross_margin_percent: number;
    revenue: number;
    exposure_today: number;
    cap_recommendations: {
      daily_burst_cap: number;
      recommended_degradation: string[];
      kill_switch_risk: boolean;
    };
    invoice_estimate: {
      base_fee: number;
      overage_sign: number;
      overage_verify: number;
      total: number;
    };
    storm_impact: {
      worst_case_daily: number;
      cache_miss_cost_multiplier: number;
      recommended_swr_settings: {
        max_age: number;
        stale_while_revalidate: number;
      };
    };
    annual_savings?: {
      monthly_equivalent: number;
      annual_total: number;
      savings_percent: number;
    };
  };
  error?: string;
}

interface PlanComparisonRequest {
  assets: number;
  verifies_per_asset: number;
  cache_hit_rate: number;
  tsa: boolean;
  stack: 'r2+workers' | 's3+workers';
}

interface PlanComparisonResponse {
  success: boolean;
  data?: {
    starter: {
      monthly_cost: number;
      recommended: boolean;
      reasons: string[];
    };
    pro: {
      monthly_cost: number;
      recommended: boolean;
      reasons: string[];
    };
    enterprise: {
      monthly_cost: number;
      recommended: boolean;
      reasons: string[];
    };
    optimization_suggestions: {
      improve_cache_hit: {
        current: number;
        target: number;
        savings: number;
        method: string;
      };
      reduce_tsa: {
        current_usage: number;
        savings: number;
        recommendation: string;
      };
    };
  };
  error?: string;
}

export class PricingController {
  private economicsService: EconomicsService;

  constructor(redis: Redis) {
    this.economicsService = new EconomicsService(redis);
  }

  /**
   * POST /pricing/simulate
   * Run pricing simulation for specific plan and usage
   */
  async simulatePricing(request: FastifyRequest<{ Body: PricingSimulateRequest }>, reply: FastifyReply) {
    try {
      const { assets, verifies_per_asset, cache_hit_rate, tsa, stack, plan, period_days, annual } = request.body;

      // Validate inputs
      if (assets < 0 || verifies_per_asset < 0 || cache_hit_rate < 0 || cache_hit_rate > 1) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid input parameters'
        } as PricingSimulateResponse);
      }

      const result = await this.economicsService.simulatePricing({
        assets,
        verifies_per_asset,
        cache_hit_rate,
        tsa,
        stack,
        plan,
        period_days
      });

      const response: PricingSimulateResponse = {
        success: true,
        data: result
      };

      // Add annual pricing if requested
      if (annual) {
        const costModel = this.economicsService.getCostModel();
        const annualTotal = result.invoice_estimate.total * 12 * costModel.discounts.annual_multiplier;
        const monthlyEquivalent = annualTotal / 12;
        const savingsPercent = ((result.invoice_estimate.total * 12 - annualTotal) / (result.invoice_estimate.total * 12)) * 100;

        response.data!.annual_savings = {
          monthly_equivalent: monthlyEquivalent,
          annual_total: annualTotal,
          savings_percent: savingsPercent
        };
      }

      return reply.send(response);
    } catch (error: any) {
      request.log.error('Pricing simulation failed:', error?.message || error);
      return reply.status(500).send({
        success: false,
        error: 'Internal server error during pricing simulation'
      } as PricingSimulateResponse);
    }
  }

  /**
   * POST /pricing/compare
   * Compare all plans for given usage profile
   */
  async comparePlans(request: FastifyRequest<{ Body: PlanComparisonRequest }>, reply: FastifyReply) {
    try {
      const { assets, verifies_per_asset, cache_hit_rate, tsa, stack } = request.body;

      // Validate inputs
      if (assets < 0 || verifies_per_asset < 0 || cache_hit_rate < 0 || cache_hit_rate > 1) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid input parameters'
        } as PlanComparisonResponse);
      }

      const plans = ['starter_199', 'pro_699', 'enterprise_2k'] as const;
      const results: any = {};

      // Simulate each plan
      for (const plan of plans) {
        const result = await this.economicsService.simulatePricing({
          assets,
          verifies_per_asset,
          cache_hit_rate,
          tsa,
          stack,
          plan
        });

        const planKey = plan.replace('_199', '').replace('_699', '').replace('_2k', '');
        results[planKey] = {
          monthly_cost: result.invoice_estimate.total,
          recommended: false,
          reasons: [] as string[]
        };
      }

      // Determine recommendations
      const starter = results.starter;
      const pro = results.pro;
      const enterprise = results.enterprise;

      // Starter recommendations
      if (assets <= 1000 && verifies_per_asset <= 20) {
        starter.recommended = true;
        starter.reasons.push('Ideal for low-volume usage');
      } else if (starter.monthly_cost > 400) {
        starter.reasons.push('Consider upgrading to Pro for better value');
      }

      // Pro recommendations
      if (assets > 1000 && assets <= 10000) {
        pro.recommended = true;
        pro.reasons.push('Best balance of features and cost');
      } else if (pro.cap_recommendations.kill_switch_risk) {
        pro.reasons.push('May exceed burst caps during peak usage');
      }

      // Enterprise recommendations
      if (assets > 10000 || pro.cap_recommendations.kill_switch_risk) {
        enterprise.recommended = true;
        enterprise.reasons.push('Required for high-volume usage');
        if (pro.cap_recommendations.kill_switch_risk) {
          enterprise.reasons.push('Provides higher burst caps for safety');
        }
      }

      // Optimization suggestions
      const currentCacheCost = results.pro.monthly_cost;
      const optimizedCacheCost = await this.economicsService.simulatePricing({
        assets,
        verifies_per_asset,
        cache_hit_rate: 0.95, // Optimized cache hit rate
        tsa,
        stack,
        plan: 'pro_699'
      });

      const cacheSavings = currentCacheCost - optimizedCacheCost.invoice_estimate.total;

      const currentTsaCost = await this.economicsService.simulatePricing({
        assets,
        verifies_per_asset,
        cache_hit_rate,
        tsa: true,
        stack,
        plan: 'pro_699'
      });

      const noTsaCost = await this.economicsService.simulatePricing({
        assets,
        verifies_per_asset,
        cache_hit_rate,
        tsa: false,
        stack,
        plan: 'pro_699'
      });

      const tsaSavings = currentTsaCost.invoice_estimate.total - noTsaCost.invoice_estimate.total;

      const response: PlanComparisonResponse = {
        success: true,
        data: {
          ...results,
          optimization_suggestions: {
            improve_cache_hit: {
              current: cache_hit_rate,
              target: 0.95,
              savings: cacheSavings,
              method: 'Implement CDN caching headers and Link header optimization'
            },
            reduce_tsa: {
              current_usage: tsa ? assets : 0,
              savings: tsaSavings,
              recommendation: tsaSavings > 50 ? 'Consider TSA only for critical assets' : 'Current TSA usage is optimal'
            }
          }
        }
      };

      return reply.send(response);
    } catch (error: any) {
      request.log.error('Plan comparison failed:', error?.message || error);
      return reply.status(500).send({
        success: false,
        error: 'Internal server error during plan comparison'
      } as PlanComparisonResponse);
    }
  }

  /**
   * GET /pricing/model
   * Get current cost model (public version)
   */
  async getCostModel(request: FastifyRequest, reply: FastifyReply) {
    try {
      const model = this.economicsService.getCostModel();
      
      // Return sanitized version for public consumption
      const publicModel = {
        version: model.version,
        last_updated: model.last_updated,
        plans: {
          starter_199: model.plans.starter_199,
          pro_699: model.plans.pro_699,
          enterprise_2k: model.plans.enterprise_2k
        },
        discounts: {
          annual_multiplier: model.discounts.annual_multiplier
        }
      };

      return reply.send({
        success: true,
        data: publicModel
      });
    } catch (error: any) {
      request.log.error('Failed to get cost model:', error?.message || error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to retrieve cost model'
      });
    }
  }

  /**
   * POST /pricing/optimizer
   * Suggest optimizations for better pricing
   */
  async optimizePricing(request: FastifyRequest<{ Body: PricingSimulateRequest }>, reply: FastifyReply) {
    try {
      const { assets, verifies_per_asset, cache_hit_rate, tsa, stack, plan } = request.body;

      const currentResult = await this.economicsService.simulatePricing({
        assets,
        verifies_per_asset,
        cache_hit_rate,
        tsa,
        stack,
        plan
      });

      const optimizations: any[] = [];

      // Cache optimization
      if (cache_hit_rate < 0.9) {
        const optimizedCache = await this.economicsService.simulatePricing({
          assets,
          verifies_per_asset,
          cache_hit_rate: 0.9,
          tsa,
          stack,
          plan
        });

        optimizations.push({
          type: 'cache_optimization',
          description: 'Improve cache hit rate from ' + Math.round(cache_hit_rate * 100) + '% to 90%',
          current_cost: currentResult.invoice_estimate.total,
          optimized_cost: optimizedCache.invoice_estimate.total,
          savings: currentResult.invoice_estimate.total - optimizedCache.invoice_estimate.total,
          implementation: [
            'Configure CDN caching headers',
            'Implement Link header optimization',
            'Use stale-while-revalidate for better UX'
          ]
        });
      }

      // TSA optimization
      if (tsa && assets > 1000) {
        const optimizedTsa = await this.economicsService.simulatePricing({
          assets,
          verifies_per_asset,
          cache_hit_rate,
          tsa: false,
          stack,
          plan
        });

        const tsaSavings = currentResult.invoice_estimate.total - optimizedTsa.invoice_estimate.total;
        
        if (tsaSavings > 20) {
          optimizations.push({
            type: 'tsa_optimization',
            description: 'Selective TSA usage for critical assets only',
            current_cost: currentResult.invoice_estimate.total,
            optimized_cost: optimizedTsa.invoice_estimate.total,
            savings: tsaSavings,
            implementation: [
              'Enable TSA only for high-value assets',
              'Use batch TSA for bulk operations',
              'Consider TSA vendor switching for better rates'
            ]
          });
        }
      }

      // Plan optimization
      const plans = ['starter_199', 'pro_699', 'enterprise_2k'] as const;
      for (const planOption of plans) {
        if (planOption !== plan) {
          const planResult = await this.economicsService.simulatePricing({
            assets,
            verifies_per_asset,
            cache_hit_rate,
            tsa,
            stack,
            plan: planOption
          });

          if (planResult.gross_margin_percent > currentResult.gross_margin_percent + 0.1) {
            optimizations.push({
              type: 'plan_optimization',
              description: `Switch to ${planOption.replace('_', ' ').toUpperCase()} plan`,
              current_cost: currentResult.invoice_estimate.total,
              optimized_cost: planResult.invoice_estimate.total,
              savings: currentResult.invoice_estimate.total - planResult.invoice_estimate.total,
              implementation: [
                'Contact support to upgrade/downgrade plan',
                'Update billing preferences',
                'Review new plan limits and caps'
              ]
            });
          }
        }
      }

      return reply.send({
        success: true,
        data: {
          current_analysis: currentResult,
          optimizations: optimizations.sort((a, b) => b.savings - a.savings),
          total_potential_savings: optimizations.reduce((sum, opt) => sum + opt.savings, 0)
        }
      });
    } catch (error: any) {
      request.log.error('Pricing optimization failed:', error?.message || error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to generate pricing optimizations'
      });
    }
  }
}
