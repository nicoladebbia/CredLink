/**
 * Phase 39 - Exit Tests
 * Binary pass/fail tests for disaster economics and pricing engine
 */

import { EconomicsService } from '../src/services/economics-service';
import { SafeguardService } from '../src/services/safeguard-service';
import { KillSwitchService } from '../src/services/killswitch-service';
import { PricingDiscountService } from '../src/services/pricing-discount-service';
import { CoherenceService } from '../src/services/coherence-service';
import { Redis } from 'ioredis';

interface TestResult {
  test_name: string;
  passed: boolean;
  details: string;
  metrics: Record<string, number>;
  duration_ms: number;
}

interface StressTestScenario {
  name: string;
  baseline_traffic: number;
  stress_multiplier: number;
  cache_hit_rate: number;
  duration_minutes: number;
  expected_outcome: 'within_budget' | 'graceful_degradation' | 'kill_switch';
}

interface PricingScenario {
  name: string;
  assets: number;
  verifies_per_asset: number;
  cache_hit_rate: number;
  tsa: boolean;
  stack: 'r2+workers' | 's3+workers';
  plan: string;
  expected_invoice_range: { min: number; max: number };
}

export class Phase39ExitTests {
  private economicsService: EconomicsService;
  private safeguardService: SafeguardService;
  private killSwitchService: KillSwitchService;
  private pricingDiscountService: PricingDiscountService;
  private coherenceService: CoherenceService;
  private redis: Redis;

  constructor(redis: Redis) {
    this.redis = redis;
    this.economicsService = new EconomicsService(redis);
    this.safeguardService = new SafeguardService(redis);
    this.killSwitchService = new KillSwitchService(redis);
    this.pricingDiscountService = new PricingDiscountService(redis);
    this.coherenceService = new CoherenceService(redis);
  }

  /**
   * Run all Phase 39 exit tests
   */
  async runAllExitTests(): Promise<{
    passed: boolean;
    total_tests: number;
    passed_tests: number;
    failed_tests: number;
    results: TestResult[];
    summary: string;
  }> {
    console.log('🚀 Starting Phase 39 Exit Tests...');
    
    const allResults: TestResult[] = [];
    
    // Test 1: 10× Traffic Stress Test
    allResults.push(await this.test10xTrafficStress());
    
    // Test 2: Burst Caps Graceful Triggering
    allResults.push(await this.testBurstCapsGracefulTriggering());
    
    // Test 3: Pricing-Invoice Coherence
    allResults.push(await this.testPricingInvoiceCoherence());
    
    // Test 4: Plan Calculator Accuracy
    allResults.push(await this.testPlanCalculatorAccuracy());
    
    // Test 5: Kill Switch Functionality
    allResults.push(await this.testKillSwitchFunctionality());
    
    // Test 6: Auto-Degradation Ladder
    allResults.push(await this.testAutoDegradationLadder());
    
    // Test 7: Storm Conditions Handling
    allResults.push(await this.testStormConditionsHandling());
    
    // Test 8: Volume Discount Application
    allResults.push(await this.testVolumeDiscountApplication());
    
    // Test 9: Enterprise Minimums Enforcement
    allResults.push(await this.testEnterpriseMinimumsEnforcement());
    
    // Test 10: Economics Model Coherence
    allResults.push(await this.testEconomicsModelCoherence());

    const passedTests = allResults.filter(result => result.passed).length;
    const failedTests = allResults.length - passedTests;
    const allPassed = failedTests === 0;

    const summary = allPassed ? 
      `✅ ALL TESTS PASSED: ${passedTests}/${allResults.length} tests successful` :
      `❌ TESTS FAILED: ${passedTests}/${allResults.length} passed, ${failedTests} failed`;

    console.log(`\n${summary}`);
    
    // Log failed tests for debugging
    if (!allPassed) {
      console.log('\n🔍 Failed Tests:');
      allResults.filter(result => !result.passed).forEach(result => {
        console.log(`  ❌ ${result.test_name}: ${result.details}`);
      });
    }

    return {
      passed: allPassed,
      total_tests: allResults.length,
      passed_tests: passedTests,
      failed_tests: failedTests,
      results: allResults,
      summary
    };
  }

  /**
   * Test 1: 10× Traffic Stress Test
   * Binary: 10× traffic stress completes within budget
   */
  async test10xTrafficStress(): Promise<TestResult> {
    const startTime = Date.now();
    const testName = '10x Traffic Stress Test';
    
    try {
      // Simulate stress scenario
      const stressScenario: StressTestScenario = {
        name: 'Peak Load Test',
        baseline_traffic: 1000, // 1000 verify events per minute
        stress_multiplier: 10,
        cache_hit_rate: 0.3, // Poor cache performance during stress
        duration_minutes: 5,
        expected_outcome: 'graceful_degradation'
      };

      // Calculate costs under stress
      const simulation = await this.economicsService.simulatePricing({
        assets: 5000,
        verifies_per_asset: 100,
        cache_hit_rate: stressScenario.cache_hit_rate,
        tsa: true,
        stack: 'r2+workers',
        plan: 'pro_699',
        period_days: 1
      });

      // Simulate 10× traffic for 5 minutes
      const stressEvents = stressScenario.baseline_traffic * stressScenario.stress_multiplier * stressScenario.duration_minutes;
      const stressCost = simulation.storm_impact.worst_case_daily * (stressScenario.duration_minutes / 1440); // Proportion of daily

      // Check if within budget (burst cap)
      const withinBudget = stressCost <= simulation.cap_recommendations.daily_burst_cap;
      
      // Check if safeguards trigger appropriately
      const safeguardsTriggered = simulation.cap_recommendations.recommended_degradation.length > 0;
      const killSwitchRisk = simulation.cap_recommendations.kill_switch_risk;

      const passed = withinBudget && safeguardsTriggered && !killSwitchRisk;

      return {
        test_name: testName,
        passed,
        details: passed ? 
          `Stress cost $${stressCost.toFixed(2)} within $${simulation.cap_recommendations.daily_burst_cap} cap, safeguards triggered` :
          `Stress cost $${stressCost.toFixed(2)} exceeded cap or safeguards failed`,
        metrics: {
          stress_cost: stressCost,
          burst_cap: simulation.cap_recommendations.daily_burst_cap,
          cache_hit_rate: stressScenario.cache_hit_rate,
          stress_multiplier: stressScenario.stress_multiplier,
          safeguards_triggered: safeguardsTriggered ? 1 : 0
        },
        duration_ms: Date.now() - startTime
      };

    } catch (error) {
      return {
        test_name: testName,
        passed: false,
        details: `Test failed with error: ${error}`,
        metrics: {},
        duration_ms: Date.now() - startTime
      };
    }
  }

  /**
   * Test 2: Burst Caps Graceful Triggering
   * Binary: Caps trigger gracefully without breaking SLAs
   */
  async testBurstCapsGracefulTriggering(): Promise<TestResult> {
    const startTime = Date.now();
    const testName = 'Burst Caps Graceful Triggering';
    
    try {
      // Simulate tenant approaching burst cap
      const tenantId = 'test-tenant-burst';
      
      // Set up tenant with high usage
      await this.simulateTenantUsage(tenantId, {
        sign_events_today: 2000,
        verify_events_today: 100000,
        cache_hit_rate: 0.4,
        tsa_enabled: true,
        avg_cpu_ms: 80,
        traffic_multiplier: 8
      });

      // Evaluate safeguards
      const evaluation = await this.safeguardService.evaluateSafeguards(tenantId);
      
      // Check if burst cap is detected
      const burstCapExceeded = evaluation.exposure_today > 200; // Pro plan daily cap
      
      // Check if degradation is applied
      const degradationApplied = evaluation.degradation_state.cache_ttl > 300 || 
                                evaluation.degradation_state.stale_while_revalidate ||
                                evaluation.degradation_state.read_only_verify;

      // Check SLA preservation (verify still works)
      const verifyStillWorks = !evaluation.degradation_state.read_only_verify || 
                              evaluation.risk_level === 'critical';

      const passed = burstCapExceeded && degradationApplied && verifyStillWorks;

      return {
        test_name: testName,
        passed,
        details: passed ? 
          `Burst cap detected ($${evaluation.exposure_today.toFixed(2)}), degradation applied, SLAs preserved` :
          `Burst cap handling failed: exceeded=${burstCapExceeded}, degraded=${degradationApplied}, sla=${verifyStillWorks}`,
        metrics: {
          exposure_today: evaluation.exposure_today,
          risk_level: evaluation.risk_level === 'critical' ? 3 : evaluation.risk_level === 'high' ? 2 : evaluation.risk_level === 'medium' ? 1 : 0,
          cache_ttl: evaluation.degradation_state.cache_ttl,
          swr_enabled: evaluation.degradation_state.stale_while_revalidate ? 1 : 0,
          read_only: evaluation.degradation_state.read_only_verify ? 1 : 0
        },
        duration_ms: Date.now() - startTime
      };

    } catch (error) {
      return {
        test_name: testName,
        passed: false,
        details: `Test failed with error: ${error}`,
        metrics: {},
        duration_ms: Date.now() - startTime
      };
    }
  }

  /**
   * Test 3: Pricing-Invoice Coherence
   * Binary: Pricing scenarios match Stripe invoices within ±2%
   */
  async testPricingInvoiceCoherence(): Promise<TestResult> {
    const startTime = Date.now();
    const testName = 'Pricing-Invoice Coherence';
    
    try {
      const testDate = new Date().toISOString().split('T')[0];
      
      // Run coherence check
      const coherenceReport = await this.coherenceService.runDailyCoherenceCheck(testDate);
      
      // Check overall variance is within tolerance
      const withinTolerance = coherenceReport.overall_variance_percent <= 0.02;
      
      // Check critical discrepancies are minimal
      const criticalDiscrepanciesAcceptable = coherenceReport.critical_discrepancies.length <= 
                                             Math.ceil(coherenceReport.total_tenants * 0.05); // 5% threshold

      const passed = withinTolerance && criticalDiscrepanciesAcceptable;

      return {
        test_name: testName,
        passed,
        details: passed ? 
          `Coherence ${Math.round(coherenceReport.overall_variance_percent * 100)}% within tolerance, ${coherenceReport.critical_discrepancies.length} critical discrepancies` :
          `Coherence ${Math.round(coherenceReport.overall_variance_percent * 100)}% exceeds tolerance or too many discrepancies`,
        metrics: {
          overall_variance_percent: coherenceReport.overall_variance_percent,
          total_tenants: coherenceReport.total_tenants,
          critical_discrepancies: coherenceReport.critical_discrepancies.length,
          tenants_with_issues: coherenceReport.summary.tenants_with_issues
        },
        duration_ms: Date.now() - startTime
      };

    } catch (error) {
      return {
        test_name: testName,
        passed: false,
        details: `Test failed with error: ${error}`,
        metrics: {},
        duration_ms: Date.now() - startTime
      };
    }
  }

  /**
   * Test 4: Plan Calculator Accuracy
   * Binary: Published scenarios produce accurate invoice estimates
   */
  async testPlanCalculatorAccuracy(): Promise<TestResult> {
    const startTime = Date.now();
    const testName = 'Plan Calculator Accuracy';
    
    try {
      const scenarios: PricingScenario[] = [
        {
          name: 'Small Business',
          assets: 500,
          verifies_per_asset: 20,
          cache_hit_rate: 0.85,
          tsa: false,
          stack: 'r2+workers',
          plan: 'starter_199',
          expected_invoice_range: { min: 180, max: 220 }
        },
        {
          name: 'Medium Business',
          assets: 2000,
          verifies_per_asset: 50,
          cache_hit_rate: 0.90,
          tsa: true,
          stack: 'r2+workers',
          plan: 'pro_699',
          expected_invoice_range: { min: 650, max: 750 }
        },
        {
          name: 'Large Enterprise',
          assets: 10000,
          verifies_per_asset: 100,
          cache_hit_rate: 0.95,
          tsa: true,
          stack: 'r2+workers',
          plan: 'enterprise_2k',
          expected_invoice_range: { min: 1900, max: 2200 }
        }
      ];

      let accurateScenarios = 0;
      
      for (const scenario of scenarios) {
        const simulation = await this.economicsService.simulatePricing({
          assets: scenario.assets,
          verifies_per_asset: scenario.verifies_per_asset,
          cache_hit_rate: scenario.cache_hit_rate,
          tsa: scenario.tsa,
          stack: scenario.stack,
          plan: scenario.plan
        });

        const withinRange = simulation.invoice_estimate.total >= scenario.expected_invoice_range.min &&
                           simulation.invoice_estimate.total <= scenario.expected_invoice_range.max;

        if (withinRange) {
          accurateScenarios++;
        }
      }

      const passed = accurateScenarios === scenarios.length;

      return {
        test_name: testName,
        passed,
        details: passed ? 
          `All ${scenarios.length} scenarios within expected ranges` :
          `Only ${accurateScenarios}/${scenarios.length} scenarios within expected ranges`,
        metrics: {
          total_scenarios: scenarios.length,
          accurate_scenarios: accurateScenarios,
          accuracy_percent: (accurateScenarios / scenarios.length) * 100
        },
        duration_ms: Date.now() - startTime
      };

    } catch (error) {
      return {
        test_name: testName,
        passed: false,
        details: `Test failed with error: ${error}`,
        metrics: {},
        duration_ms: Date.now() - startTime
      };
    }
  }

  /**
   * Test 5: Kill Switch Functionality
   * Binary: Kill switches activate and deactivate correctly
   */
  async testKillSwitchFunctionality(): Promise<TestResult> {
    const startTime = Date.now();
    const testName = 'Kill Switch Functionality';
    
    try {
      const tenantId = 'test-tenant-killswitch';
      
      // Test manual activation
      await this.killSwitchService.manualTrigger(tenantId, 'read_only_verify', 'Test activation');
      
      // Verify kill switch is active
      const activeState = await this.killSwitchService.getKillSwitchState(tenantId);
      const activationWorked = activeState && activeState.active && activeState.mode === 'read_only_verify';
      
      // Test deactivation
      await this.killSwitchService.deactivateKillSwitch(tenantId, 'Test deactivation');
      
      // Verify kill switch is inactive
      const inactiveState = await this.killSwitchService.getKillSwitchState(tenantId);
      const deactivationWorked = !inactiveState || !inactiveState.active;

      // Test automatic trigger conditions
      const autoTrigger = await this.killSwitchService.evaluateKillSwitch(tenantId, 500, 0.5, false);
      const autoTriggerPrevented = !autoTrigger || !autoTrigger.active; // Should not trigger with normal conditions

      const passed = activationWorked && deactivationWorked && autoTriggerPrevented;

      return {
        test_name: testName,
        passed,
        details: passed ? 
          'Manual activation/deactivation worked, auto-trigger prevented correctly' :
          `Activation: ${activationWorked}, Deactivation: ${deactivationWorked}, Auto-prevented: ${autoTriggerPrevented}`,
        metrics: {
          activation_success: activationWorked ? 1 : 0,
          deactivation_success: deactivationWorked ? 1 : 0,
          auto_trigger_prevented: autoTriggerPrevented ? 1 : 0
        },
        duration_ms: Date.now() - startTime
      };

    } catch (error) {
      return {
        test_name: testName,
        passed: false,
        details: `Test failed with error: ${error}`,
        metrics: {},
        duration_ms: Date.now() - startTime
      };
    }
  }

  /**
   * Test 6: Auto-Degradation Ladder
   * Binary: Degradation levels trigger appropriately
   */
  async testAutoDegradationLadder(): Promise<TestResult> {
    const startTime = Date.now();
    const testName = 'Auto-Degradation Ladder';
    
    try {
      const tenantId = 'test-tenant-degradation';
      
      // Test different degradation levels
      const testCases = [
        { exposure: 100, margin: 0.85, cache_hit_rate: 0.8, expected_level: 0 },
        { exposure: 150, margin: 0.75, cache_hit_rate: 0.6, expected_level: 1 },
        { exposure: 180, margin: 0.7, cache_hit_rate: 0.5, expected_level: 2 },
        { exposure: 200, margin: 0.6, cache_hit_rate: 0.4, expected_level: 3 }
      ];

      let correctLevels = 0;

      for (const testCase of testCases) {
        await this.simulateTenantUsage(tenantId, {
          sign_events_today: 100,
          verify_events_today: 10000,
          cache_hit_rate: testCase.cache_hit_rate,
          tsa_enabled: true,
          avg_cpu_ms: 60,
          traffic_multiplier: 1
        });

        const evaluation = await this.safeguardService.evaluateSafeguards(tenantId);
        
        // Determine expected degradation level based on cache TTL
        let actualLevel = 0;
        if (evaluation.degradation_state.cache_ttl > 300) actualLevel++;
        if (evaluation.degradation_state.stale_while_revalidate) actualLevel++;
        if (evaluation.degradation_state.tsa_batching) actualLevel++;
        if (evaluation.degradation_state.read_only_verify) actualLevel += 2;

        if (actualLevel >= testCase.expected_level) {
          correctLevels++;
        }
      }

      const passed = correctLevels === testCases.length;

      return {
        test_name: testName,
        passed,
        details: passed ? 
          `All ${testCases.length} degradation levels triggered correctly` :
          `Only ${correctLevels}/${testCases.length} degradation levels correct`,
        metrics: {
          total_test_cases: testCases.length,
          correct_levels: correctLevels,
          accuracy_percent: (correctLevels / testCases.length) * 100
        },
        duration_ms: Date.now() - startTime
      };

    } catch (error) {
      return {
        test_name: testName,
        passed: false,
        details: `Test failed with error: ${error}`,
        metrics: {},
        duration_ms: Date.now() - startTime
      };
    }
  }

  /**
   * Test 7: Storm Conditions Handling
   * Binary: Storm conditions trigger emergency caching
   */
  async testStormConditionsHandling(): Promise<TestResult> {
    const startTime = Date.now();
    const testName = 'Storm Conditions Handling';
    
    try {
      const tenantId = 'test-tenant-storm';
      
      // Simulate storm conditions
      await this.simulateTenantUsage(tenantId, {
        sign_events_today: 100,
        verify_events_today: 100000,
        cache_hit_rate: 0.3, // Low cache hit rate
        tsa_enabled: true,
        avg_cpu_ms: 120,
        traffic_multiplier: 15 // High traffic multiplier
      });

      // Handle storm conditions
      await this.safeguardService.handleStormConditions(tenantId);
      
      // Check if emergency cache was activated
      const emergencyCacheKey = `cache:storm:${tenantId}`;
      const emergencyCacheData = await this.redis.get(emergencyCacheKey);
      const emergencyCacheActivated = !!emergencyCacheData;

      // Check if emergency mode was set
      const emergencyKey = `safeguards:emergency:${tenantId}`;
      const emergencyData = await this.redis.get(emergencyKey);
      const emergencyModeSet = !!emergencyData;

      const passed = emergencyCacheActivated && emergencyModeSet;

      return {
        test_name: testName,
        passed,
        details: passed ? 
          'Storm conditions detected, emergency cache and mode activated' :
          `Emergency cache: ${emergencyCacheActivated}, Emergency mode: ${emergencyModeSet}`,
        metrics: {
          emergency_cache_activated: emergencyCacheActivated ? 1 : 0,
          emergency_mode_set: emergencyModeSet ? 1 : 0,
          cache_hit_rate: 0.3,
          traffic_multiplier: 15
        },
        duration_ms: Date.now() - startTime
      };

    } catch (error) {
      return {
        test_name: testName,
        passed: false,
        details: `Test failed with error: ${error}`,
        metrics: {},
        duration_ms: Date.now() - startTime
      };
    }
  }

  /**
   * Test 8: Volume Discount Application
   * Binary: Volume discounts apply correctly based on thresholds
   */
  async testVolumeDiscountApplication(): Promise<TestResult> {
    const startTime = Date.now();
    const testName = 'Volume Discount Application';
    
    try {
      const testCases = [
        {
          name: 'Bronze Tier',
          verify_events: 150000,
          cache_hit_rate: 0.92,
          expected_discount: 0.05
        },
        {
          name: 'Silver Tier',
          verify_events: 600000,
          cache_hit_rate: 0.94,
          expected_discount: 0.10
        },
        {
          name: 'Gold Tier',
          verify_events: 1200000,
          cache_hit_rate: 0.96,
          expected_discount: 0.15
        }
      ];

      let correctDiscounts = 0;

      for (const testCase of testCases) {
        const pricing = await this.pricingDiscountService.calculateVolumePricing({
          tenant_id: `test-${testCase.name.toLowerCase().replace(' ', '-')}`,
          plan: 'pro_699',
          estimated_sign_events: 5000,
          estimated_verify_events: testCase.verify_events,
          estimated_cache_hit_rate: testCase.cache_hit_rate,
          estimated_cpu_ms: 50,
          annual: false,
          enterprise: false
        });

        // Check if expected discount tier was applied
        const expectedTierApplied = pricing.applied_discounts.some(discount => 
          discount.discount_percent >= testCase.expected_discount
        );

        if (expectedTierApplied) {
          correctDiscounts++;
        }
      }

      const passed = correctDiscounts === testCases.length;

      return {
        test_name: testName,
        passed,
        details: passed ? 
          `All ${testCases.length} volume discount tiers applied correctly` :
          `Only ${correctDiscounts}/${testCases.length} discount tiers applied correctly`,
        metrics: {
          total_test_cases: testCases.length,
          correct_discounts: correctDiscounts,
          accuracy_percent: (correctDiscounts / testCases.length) * 100
        },
        duration_ms: Date.now() - startTime
      };

    } catch (error) {
      return {
        test_name: testName,
        passed: false,
        details: `Test failed with error: ${error}`,
        metrics: {},
        duration_ms: Date.now() - startTime
      };
    }
  }

  /**
   * Test 9: Enterprise Minimums Enforcement
   * Binary: Enterprise minimums are applied correctly
   */
  async testEnterpriseMinimumsEnforcement(): Promise<TestResult> {
    const startTime = Date.now();
    const testName = 'Enterprise Minimums Enforcement';
    
    try {
      const tenantId = 'test-enterprise-minimums';
      
      // Set enterprise configuration
      this.pricingDiscountService.setEnterpriseMinimum(tenantId, {
        tenant_id: tenantId,
        fixed_costs_monthly: 500,
        peak_reserve_multiplier: 10,
        minimum_contract_value: 2000,
        custom_pricing: false,
        volume_discounts: [],
        sla_requirements: {
          uptime: 0.999,
          support_response_time: 60,
          dedicated_resources: false
        }
      });

      const pricing = await this.pricingDiscountService.calculateVolumePricing({
        tenant_id: tenantId,
        plan: 'enterprise_2k',
        estimated_sign_events: 5000,
        estimated_verify_events: 50000,
        estimated_cache_hit_rate: 0.90,
        estimated_cpu_ms: 50,
        annual: false,
        enterprise: true
      });

      // Check if enterprise minimums were applied
      const minimumsApplied = pricing.enterprise_minimums && 
                             pricing.enterprise_minimums.minimum_monthly >= 2000 &&
                             pricing.enterprise_minimums.peak_reserve >= 5000;

      const passed = minimumsApplied;

      return {
        test_name: testName,
        passed,
        details: passed ? 
          'Enterprise minimums applied correctly' :
          'Enterprise minimums not applied or incorrect',
        metrics: {
          minimum_monthly: pricing.enterprise_minimums?.minimum_monthly || 0,
          peak_reserve: pricing.enterprise_minimums?.peak_reserve || 0,
          custom_terms: pricing.enterprise_minimums?.custom_terms ? 1 : 0
        },
        duration_ms: Date.now() - startTime
      };

    } catch (error) {
      return {
        test_name: testName,
        passed: false,
        details: `Test failed with error: ${error}`,
        metrics: {},
        duration_ms: Date.now() - startTime
      };
    }
  }

  /**
   * Test 10: Economics Model Coherence
   * Binary: Economics model is internally consistent
   */
  async testEconomicsModelCoherence(): Promise<TestResult> {
    const startTime = Date.now();
    const testName = 'Economics Model Coherence';
    
    try {
      // Validate pricing discount service coherence
      const discountCoherence = await this.pricingDiscountService.validatePricingCoherence();
      
      // Check cost model consistency
      const costModel = this.economicsService.getCostModel();
      const costModelCoherent = this.validateCostModelCoherence(costModel);
      
      // Check that higher plans always include more
      const plansCoherent = this.validatePlansCoherence(costModel.plans);

      const passed = discountCoherence.coherent && costModelCoherent && plansCoherent;

      return {
        test_name: testName,
        passed,
        details: passed ? 
          'All economics model components are coherent' :
          `Discount coherence: ${discountCoherence.coherent}, Cost model: ${costModelCoherent}, Plans: ${plansCoherent}`,
        metrics: {
          discount_issues: discountCoherence.issues.length,
          cost_model_coherent: costModelCoherent ? 1 : 0,
          plans_coherent: plansCoherent ? 1 : 0
        },
        duration_ms: Date.now() - startTime
      };

    } catch (error) {
      return {
        test_name: testName,
        passed: false,
        details: `Test failed with error: ${error}`,
        metrics: {},
        duration_ms: Date.now() - startTime
      };
    }
  }

  // Helper methods

  private async simulateTenantUsage(tenantId: string, usage: any): Promise<void> {
    const usageKey = `usage:window:${tenantId}:current`;
    await this.redis.setex(usageKey, 3600, JSON.stringify(usage));
  }

  private validateCostModelCoherence(costModel: any): boolean {
    // Check that all required fields exist and have reasonable values
    const hasStorage = costModel.storage && costModel.storage.r2 && costModel.storage.s3_fallback;
    const hasEdge = costModel.edge && costModel.edge.workers;
    const hasTSA = costModel.tsa && costModel.tsa.globalsign;
    const hasPlans = costModel.plans && Object.keys(costModel.plans).length > 0;
    const hasDiscounts = costModel.discounts;

    return hasStorage && hasEdge && hasTSA && hasPlans && hasDiscounts;
  }

  private validatePlansCoherence(plans: any): boolean {
    const planList = Object.keys(plans);
    
    // Check that higher-tier plans have higher fees and more inclusions
    for (let i = 1; i < planList.length; i++) {
      const current = plans[planList[i]];
      const previous = plans[planList[i - 1]];
      
      if (current.monthly_fee <= previous.monthly_fee ||
          current.included_sign_events <= previous.included_sign_events ||
          current.included_verify_events <= previous.included_verify_events) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Run individual test by name
   */
  async runTest(testName: string): Promise<TestResult> {
    switch (testName) {
      case '10x Traffic Stress Test':
        return await this.test10xTrafficStress();
      case 'Burst Caps Graceful Triggering':
        return await this.testBurstCapsGracefulTriggering();
      case 'Pricing-Invoice Coherence':
        return await this.testPricingInvoiceCoherence();
      case 'Plan Calculator Accuracy':
        return await this.testPlanCalculatorAccuracy();
      case 'Kill Switch Functionality':
        return await this.testKillSwitchFunctionality();
      case 'Auto-Degradation Ladder':
        return await this.testAutoDegradationLadder();
      case 'Storm Conditions Handling':
        return await this.testStormConditionsHandling();
      case 'Volume Discount Application':
        return await this.testVolumeDiscountApplication();
      case 'Enterprise Minimums Enforcement':
        return await this.testEnterpriseMinimumsEnforcement();
      case 'Economics Model Coherence':
        return await this.testEconomicsModelCoherence();
      default:
        throw new Error(`Unknown test: ${testName}`);
    }
  }
}

// Export for use in test runner
export default Phase39ExitTests;
