/**
 * Phase 39 - Pricing Discount Service
 * Discount ladders, enterprise minimums, and volume pricing calculations
 */

import { Redis } from 'ioredis';
import { EconomicsService } from './economics-service';

interface DiscountTier {
  min_verify_events: number;
  min_sign_events: number;
  min_cache_hit_rate: number;
  max_cpu_ms: number;
  discount_percent: number;
  tier_name: string;
}

interface EnterpriseMinimum {
  tenant_id: string;
  fixed_costs_monthly: number;
  peak_reserve_multiplier: number;
  minimum_contract_value: number;
  custom_pricing: boolean;
  volume_discounts: DiscountTier[];
  sla_requirements: {
    uptime: number;
    support_response_time: number;
    dedicated_resources: boolean;
  };
}

interface VolumePricingRequest {
  tenant_id: string;
  plan: string;
  estimated_sign_events: number;
  estimated_verify_events: number;
  estimated_cache_hit_rate: number;
  estimated_cpu_ms: number;
  annual: boolean;
  enterprise: boolean;
}

interface VolumePricingResponse {
  base_pricing: {
    monthly_fee: number;
    per_sign_cost: number;
    per_verify_cost: number;
  };
  applied_discounts: Array<{
    tier_name: string;
    discount_percent: number;
    savings_amount: number;
    reason: string;
  }>;
  final_pricing: {
    monthly_fee: number;
    per_sign_cost: number;
    per_verify_cost: number;
    effective_monthly_cost: number;
  };
  enterprise_minimums?: {
    minimum_monthly: number;
    peak_reserve: number;
    custom_terms: boolean;
  };
  annual_pricing?: {
    monthly_equivalent: number;
    annual_total: number;
    total_savings: number;
    savings_percent: number;
  };
}

interface DiscountEligibility {
  volume_discount_eligible: boolean;
  annual_discount_eligible: boolean;
  enterprise_minimum_applies: boolean;
  custom_pricing_available: boolean;
  recommended_tier: string;
}

export class PricingDiscountService {
  private economicsService: EconomicsService;
  private redis: Redis;
  private discountTiers: DiscountTier[];
  private enterpriseMinimums: Map<string, EnterpriseMinimum> = new Map();

  constructor(redis: Redis) {
    this.redis = redis;
    this.economicsService = new EconomicsService(redis);
    this.discountTiers = [];
    this.initializeDiscountTiers();
  }

  private initializeDiscountTiers(): void {
    this.discountTiers = [
      {
        min_verify_events: 100000,
        min_sign_events: 1000,
        min_cache_hit_rate: 0.90,
        max_cpu_ms: 80,
        discount_percent: 0.05,
        tier_name: 'Volume Bronze'
      },
      {
        min_verify_events: 500000,
        min_sign_events: 5000,
        min_cache_hit_rate: 0.92,
        max_cpu_ms: 70,
        discount_percent: 0.10,
        tier_name: 'Volume Silver'
      },
      {
        min_verify_events: 1000000,
        min_sign_events: 10000,
        min_cache_hit_rate: 0.95,
        max_cpu_ms: 60,
        discount_percent: 0.15,
        tier_name: 'Volume Gold'
      },
      {
        min_verify_events: 5000000,
        min_sign_events: 50000,
        min_cache_hit_rate: 0.96,
        max_cpu_ms: 50,
        discount_percent: 0.20,
        tier_name: 'Volume Platinum'
      },
      {
        min_verify_events: 10000000,
        min_sign_events: 100000,
        min_cache_hit_rate: 0.97,
        max_cpu_ms: 45,
        discount_percent: 0.25,
        tier_name: 'Volume Enterprise'
      }
    ];
  }

  /**
   * Calculate volume pricing with discounts
   */
  async calculateVolumePricing(request: VolumePricingRequest): Promise<VolumePricingResponse> {
    const costModel = this.economicsService.getCostModel();
    const planConfig = costModel.plans[request.plan];

    if (!planConfig) {
      throw new Error(`Unknown plan: ${request.plan}`);
    }

    // Get base pricing
    const basePricing = this.calculateBasePricing(planConfig, costModel);

    // Determine eligibility
    const eligibility = await this.determineDiscountEligibility(request);

    // Apply volume discounts
    const appliedDiscounts = await this.calculateApplicableDiscounts(request, eligibility);

    // Calculate final pricing
    const finalPricing = this.applyDiscountsToBasePricing(basePricing, appliedDiscounts);

    // Add enterprise minimums if applicable
    let enterpriseMinimums;
    if (eligibility.enterprise_minimum_applies) {
      enterpriseMinimums = await this.calculateEnterpriseMinimums(request);
    }

    // Add annual pricing if requested
    let annualPricing;
    if (request.annual && eligibility.annual_discount_eligible) {
      annualPricing = this.calculateAnnualPricing(finalPricing, costModel);
    }

    const response: VolumePricingResponse = {
      base_pricing: basePricing,
      applied_discounts: appliedDiscounts,
      final_pricing: finalPricing,
      enterprise_minimums: enterpriseMinimums,
      annual_pricing: annualPricing
    };

    // Cache pricing calculation
    await this.cachePricingCalculation(request, response);

    return response;
  }

  private calculateBasePricing(planConfig: any, costModel: any): {
    monthly_fee: number;
    per_sign_cost: number;
    per_verify_cost: number;
  } {
    return {
      monthly_fee: planConfig.monthly_fee,
      per_sign_cost: 0.05, // $0.05 per sign event
      per_verify_cost: 0.01 // $0.01 per verify event
    };
  }

  private async determineDiscountEligibility(request: VolumePricingRequest): Promise<DiscountEligibility> {
    const volumeDiscountEligible = this.checkVolumeDiscountEligibility(request);
    const annualDiscountEligible = request.annual;
    const enterpriseMinimumApplies = request.enterprise;
    const customPricingAvailable = request.enterprise && request.estimated_verify_events > 5000000;

    const recommendedTier = this.getRecommendedDiscountTier(request);

    return {
      volume_discount_eligible: volumeDiscountEligible,
      annual_discount_eligible: annualDiscountEligible,
      enterprise_minimum_applies: enterpriseMinimumApplies,
      custom_pricing_available: customPricingAvailable,
      recommended_tier: recommendedTier
    };
  }

  private checkVolumeDiscountEligibility(request: VolumePricingRequest): boolean {
    return request.estimated_verify_events >= 100000 && 
           request.estimated_cache_hit_rate >= 0.90 &&
           request.estimated_cpu_ms <= 80;
  }

  private getRecommendedDiscountTier(request: VolumePricingRequest): string {
    for (const tier of this.discountTiers.reverse()) {
      if (request.estimated_verify_events >= tier.min_verify_events &&
          request.estimated_sign_events >= tier.min_sign_events &&
          request.estimated_cache_hit_rate >= tier.min_cache_hit_rate &&
          request.estimated_cpu_ms <= tier.max_cpu_ms) {
        return tier.tier_name;
      }
    }
    return 'Standard Pricing';
  }

  private async calculateApplicableDiscounts(request: VolumePricingRequest, eligibility: DiscountEligibility): Promise<Array<{
    tier_name: string;
    discount_percent: number;
    savings_amount: number;
    reason: string;
  }>> {
    const discounts = [];
    const basePricing = this.calculateBasePricing(
      this.economicsService.getCostModel().plans[request.plan],
      this.economicsService.getCostModel()
    );

    // Volume discount
    if (eligibility.volume_discount_eligible) {
      const tier = this.discountTiers.find(t => t.tier_name === eligibility.recommended_tier);
      if (tier) {
        const monthlyUsageCost = (request.estimated_sign_events * basePricing.per_sign_cost) + 
                                (request.estimated_verify_events * basePricing.per_verify_cost);
        const savings = monthlyUsageCost * tier.discount_percent;

        discounts.push({
          tier_name: tier.tier_name,
          discount_percent: tier.discount_percent,
          savings_amount: savings,
          reason: `Volume discount: ${request.estimated_verify_events.toLocaleString()} verify events, ${Math.round(request.estimated_cache_hit_rate * 100)}% cache hit rate`
        });
      }
    }

    // Annual discount
    if (eligibility.annual_discount_eligible) {
      const costModel = this.economicsService.getCostModel();
      const annualDiscount = 1 - costModel.discounts.annual_multiplier;
      const annualSavings = basePricing.monthly_fee * 12 * annualDiscount;

      discounts.push({
        tier_name: 'Annual Prepay',
        discount_percent: annualDiscount,
        savings_amount: annualSavings,
        reason: 'Annual prepay discount - 12% off for cash flow commitment'
      });
    }

    // Enterprise custom pricing
    if (eligibility.custom_pricing_available) {
      discounts.push({
        tier_name: 'Enterprise Custom',
        discount_percent: 0.05, // Additional 5% for enterprise
        savings_amount: basePricing.monthly_fee * 0.05 * 12, // Annual savings
        reason: 'Enterprise custom pricing - high volume commitment'
      });
    }

    return discounts;
  }

  private applyDiscountsToBasePricing(basePricing: any, discounts: any[]): {
    monthly_fee: number;
    per_sign_cost: number;
    per_verify_cost: number;
    effective_monthly_cost: number;
  } {
    let monthlyFee = basePricing.monthly_fee;
    let perSignCost = basePricing.per_sign_cost;
    let perVerifyCost = basePricing.per_verify_cost;

    // Apply discounts
    for (const discount of discounts) {
      if (discount.tier_name.includes('Volume') || discount.tier_name.includes('Enterprise')) {
        perSignCost *= (1 - discount.discount_percent);
        perVerifyCost *= (1 - discount.discount_percent);
      } else if (discount.tier_name.includes('Annual')) {
        monthlyFee *= (1 - discount.discount_percent);
      }
    }

    const effectiveMonthlyCost = monthlyFee;

    return {
      monthly_fee: monthlyFee,
      per_sign_cost: perSignCost,
      per_verify_cost: perVerifyCost,
      effective_monthly_cost: effectiveMonthlyCost
    };
  }

  private async calculateEnterpriseMinimums(request: VolumePricingRequest): Promise<{
    minimum_monthly: number;
    peak_reserve: number;
    custom_terms: boolean;
  }> {
    const enterpriseConfig = this.enterpriseMinimums.get(request.tenant_id);
    
    if (enterpriseConfig) {
      return {
        minimum_monthly: enterpriseConfig.minimum_contract_value,
        peak_reserve: enterpriseConfig.fixed_costs_monthly * enterpriseConfig.peak_reserve_multiplier,
        custom_terms: enterpriseConfig.custom_pricing
      };
    }

    // Default enterprise minimums
    const baseMonthly = this.economicsService.getCostModel().plans.enterprise_2k.monthly_fee;
    const fixedCosts = baseMonthly * 0.3; // 30% for fixed costs
    const peakReserve = fixedCosts * 10; // 10x burst capacity

    return {
      minimum_monthly: baseMonthly,
      peak_reserve: peakReserve,
      custom_terms: request.estimated_verify_events > 5000000
    };
  }

  private calculateAnnualPricing(finalPricing: any, costModel: any): {
    monthly_equivalent: number;
    annual_total: number;
    total_savings: number;
    savings_percent: number;
  } {
    const standardAnnual = finalPricing.monthly_fee * 12;
    const discountedAnnual = standardAnnual * costModel.discounts.annual_multiplier;
    const totalSavings = standardAnnual - discountedAnnual;
    const savingsPercent = (totalSavings / standardAnnual) * 100;

    return {
      monthly_equivalent: discountedAnnual / 12,
      annual_total: discountedAnnual,
      total_savings: totalSavings,
      savings_percent: savingsPercent
    };
  }

  /**
   * Set enterprise minimum configuration for tenant
   */
  setEnterpriseMinimum(tenantId: string, config: EnterpriseMinimum): void {
    this.enterpriseMinimums.set(tenantId, config);
  }

  /**
   * Get discount tiers
   */
  getDiscountTiers(): DiscountTier[] {
    return [...this.discountTiers];
  }

  /**
   * Calculate ROI for optimization improvements
   */
  async calculateOptimizationROI(
    currentUsage: VolumePricingRequest,
    optimizedUsage: {
      cache_hit_rate: number;
      cpu_ms: number;
    }
  ): Promise<{
    current_monthly_cost: number;
    optimized_monthly_cost: number;
    monthly_savings: number;
      annual_savings: number;
      roi_percent: number;
    recommendations: string[];
  }> {
    const currentPricing = await this.calculateVolumePricing(currentUsage);
    
    const optimizedRequest = {
      ...currentUsage,
      estimated_cache_hit_rate: optimizedUsage.cache_hit_rate,
      estimated_cpu_ms: optimizedUsage.cpu_ms
    };
    
    const optimizedPricing = await this.calculateVolumePricing(optimizedRequest);

    const currentMonthly = currentPricing.final_pricing.effective_monthly_cost + 
                         (currentUsage.estimated_sign_events * currentPricing.final_pricing.per_sign_cost) +
                         (currentUsage.estimated_verify_events * currentPricing.final_pricing.per_verify_cost);

    const optimizedMonthly = optimizedPricing.final_pricing.effective_monthly_cost + 
                           (currentUsage.estimated_sign_events * optimizedPricing.final_pricing.per_sign_cost) +
                           (currentUsage.estimated_verify_events * optimizedPricing.final_pricing.per_verify_cost);

    const monthlySavings = currentMonthly - optimizedMonthly;
    const annualSavings = monthlySavings * 12;
    const roiPercent = (monthlySavings / currentMonthly) * 100;

    const recommendations = [];
    
    if (optimizedUsage.cache_hit_rate > currentUsage.estimated_cache_hit_rate) {
      recommendations.push(`Improve cache hit rate from ${Math.round(currentUsage.estimated_cache_hit_rate * 100)}% to ${Math.round(optimizedUsage.cache_hit_rate * 100)}%`);
    }

    if (optimizedUsage.cpu_ms < currentUsage.estimated_cpu_ms) {
      recommendations.push(`Optimize CPU usage from ${currentUsage.estimated_cpu_ms}ms to ${optimizedUsage.cpu_ms}ms`);
    }

    return {
      current_monthly_cost: currentMonthly,
      optimized_monthly_cost: optimizedMonthly,
      monthly_savings: monthlySavings,
      annual_savings: annualSavings,
      roi_percent: roiPercent,
      recommendations
    };
  }

  /**
   * Get pricing recommendations for tenant
   */
  async getPricingRecommendations(tenantId: string, currentUsage: VolumePricingRequest): Promise<{
    current_plan_optimal: boolean;
    recommended_plan: string;
    potential_savings: number;
    optimization_opportunities: Array<{
      type: string;
      description: string;
      estimated_savings: number;
      implementation_effort: 'low' | 'medium' | 'high';
    }>;
  }> {
    const currentPricing = await this.calculateVolumePricing(currentUsage);
    
    // Test other plans
    const plans = ['starter_199', 'pro_699', 'enterprise_2k'] as const;
    let bestPlan = currentUsage.plan;
    let lowestCost = currentPricing.final_pricing.effective_monthly_cost;

    for (const plan of plans) {
      if (plan !== currentUsage.plan) {
        const testPricing = await this.calculateVolumePricing({
          ...currentUsage,
          plan
        });
        
        if (testPricing.final_pricing.effective_monthly_cost < lowestCost) {
          lowestCost = testPricing.final_pricing.effective_monthly_cost;
          bestPlan = plan;
        }
      }
    }

    const currentPlanOptimal = bestPlan === currentUsage.plan;
    const potentialSavings = currentPlanOptimal ? 0 : 
      (currentPricing.final_pricing.effective_monthly_cost - lowestCost);

    // Optimization opportunities
    const optimizationOpportunities = [];

    if (currentUsage.estimated_cache_hit_rate < 0.95) {
      optimizationOpportunities.push({
        type: 'cache_optimization',
        description: 'Improve cache hit rate to 95% for volume discounts',
        estimated_savings: currentPricing.final_pricing.effective_monthly_cost * 0.05,
        implementation_effort: 'medium' as const
      });
    }

    if (currentUsage.estimated_cpu_ms > 60) {
      optimizationOpportunities.push({
        type: 'cpu_optimization',
        description: 'Optimize edge compute to under 60ms average',
        estimated_savings: currentPricing.final_pricing.effective_monthly_cost * 0.03,
        implementation_effort: 'low' as const
      });
    }

    if (!currentUsage.annual && currentUsage.estimated_verify_events > 100000) {
      optimizationOpportunities.push({
        type: 'annual_billing',
        description: 'Switch to annual billing for 12% discount',
        estimated_savings: currentPricing.final_pricing.effective_monthly_cost * 12 * 0.12,
        implementation_effort: 'low' as const
      });
    }

    return {
      current_plan_optimal: currentPlanOptimal,
      recommended_plan: bestPlan,
      potential_savings: potentialSavings,
      optimization_opportunities: optimizationOpportunities
    };
  }

  private async cachePricingCalculation(request: VolumePricingRequest, response: VolumePricingResponse): Promise<void> {
    const cacheKey = `pricing:volume:${JSON.stringify(request)}`;
    await this.redis.setex(cacheKey, 300, JSON.stringify(response)); // Cache for 5 minutes
  }

  /**
   * Validate pricing model coherence
   */
  async validatePricingCoherence(): Promise<{
    coherent: boolean;
    issues: Array<{
      type: string;
      description: string;
      severity: 'low' | 'medium' | 'high';
    }>;
  }> {
    const costModel = this.economicsService.getCostModel();
    const issues = [];

    // Check discount tiers are logical
    for (let i = 1; i < this.discountTiers.length; i++) {
      const current = this.discountTiers[i];
      const previous = this.discountTiers[i - 1];

      if (current.discount_percent <= previous.discount_percent) {
        issues.push({
          type: 'discount_tier_logic',
          description: `Discount tier ${current.tier_name} has lower discount than ${previous.tier_name}`,
          severity: 'high' as const
        });
      }
    }

    // Check enterprise minimums are above base pricing
    const enterpriseBase = costModel.plans.enterprise_2k.monthly_fee;
    for (const [tenantId, config] of this.enterpriseMinimums.entries()) {
      if (config.minimum_contract_value < enterpriseBase) {
        issues.push({
          type: 'enterprise_minimum',
          description: `Enterprise minimum for ${tenantId} is below base enterprise pricing`,
          severity: 'medium' as const
        });
      }
    }

    return {
      coherent: issues.length === 0,
      issues
    };
  }
}
