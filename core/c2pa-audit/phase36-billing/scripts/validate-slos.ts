#!/usr/bin/env ts-node

/**
 * SLO Validation Script
 * Validates SLO compliance and generates reports
 */

import axios from 'axios';
import { SLO_CONFIG, BURN_RATE_ALERTS, getErrorBudgetStatus } from '../src/config/slo';

interface SLOValidationResult {
  sloName: string;
  current: number;
  target: number;
  compliant: boolean;
  errorBudgetStatus?: any;
  trend?: number;
  lastUpdated: string;
}

interface BurnRateAlert {
  name: string;
  burnRate: number;
  window: string;
  threshold: number;
  current: number;
  triggered: boolean;
  severity: 'critical' | 'warning' | 'info';
}

class SLOValidator {
  private prometheusUrl: string;
  private tempoUrl: string;
  private lokiUrl: string;

  constructor() {
    this.prometheusUrl = process.env.PROMETHEUS_URL || 'http://localhost:9090';
    this.tempoUrl = process.env.TEMPO_URL || 'http://localhost:3200';
    this.lokiUrl = process.env.LOKI_URL || 'http://localhost:3100';
  }

  // Query Prometheus for metric values
  private async queryPrometheus(query: string): Promise<any> {
    try {
      const response = await axios.get(`${this.prometheusUrl}/api/v1/query`, {
        params: { query },
        timeout: 30000,
      });
      
      if (response.data.status !== 'success') {
        throw new Error(`Prometheus query failed: ${response.data.error}`);
      }
      
      return response.data.data.result;
    } catch (error) {
      console.error(`Error querying Prometheus: ${error}`);
      return null;
    }
  }

  // Validate survival SLOs
  async validateSurvivalSLOs(): Promise<SLOValidationResult[]> {
    const results: SLOValidationResult[] = [];

    // Remote survival ratio
    const remoteQuery = 'sum(rate(verify_ok_total{discovery="remote"}[30d])) / sum(rate(verify_total_total[30d]))';
    const remoteResult = await this.queryPrometheus(remoteQuery);
    
    if (remoteResult && remoteResult.length > 0) {
      const currentValue = parseFloat(remoteResult[0].value[1]);
      const target = SLO_CONFIG.survival.remote.target;
      
      results.push({
        sloName: 'survival_remote_ratio',
        current: currentValue,
        target,
        compliant: currentValue >= target,
        errorBudgetStatus: getErrorBudgetStatus(currentValue, target, 0.5),
        lastUpdated: new Date().toISOString(),
      });
    }

    // Embed survival ratio
    const embedQuery = 'sum(rate(verify_ok_total{discovery="embedded",path="preserve"}[30d])) / sum(rate(verify_total_total[30d]))';
    const embedResult = await this.queryPrometheus(embedQuery);
    
    if (embedResult && embedResult.length > 0) {
      const currentValue = parseFloat(embedResult[0].value[1]);
      const target = SLO_CONFIG.survival.embed.target;
      
      results.push({
        sloName: 'survival_embed_ratio',
        current: currentValue,
        target,
        compliant: currentValue >= target,
        errorBudgetStatus: getErrorBudgetStatus(currentValue, target, 0.5),
        lastUpdated: new Date().toISOString(),
      });
    }

    return results;
  }

  // Validate latency SLOs
  async validateLatencySLOs(): Promise<SLOValidationResult[]> {
    const results: SLOValidationResult[] = [];

    // Verify p95 latency
    const verifyQuery = 'histogram_quantile(0.95, sum(rate(verify_latency_ms_bucket[30d])) by (le))';
    const verifyResult = await this.queryPrometheus(verifyQuery);
    
    if (verifyResult && verifyResult.length > 0) {
      const currentValue = parseFloat(verifyResult[0].value[1]);
      const target = SLO_CONFIG.latency.verify.target;
      
      results.push({
        sloName: 'verify_latency_p95',
        current: currentValue,
        target,
        compliant: currentValue <= target,
        lastUpdated: new Date().toISOString(),
      });
    }

    // Sign p95 latency (embed)
    const signEmbedQuery = 'histogram_quantile(0.95, sum(rate(sign_latency_ms_bucket{sign_type="embed"}[30d])) by (le))';
    const signEmbedResult = await this.queryPrometheus(signEmbedQuery);
    
    if (signEmbedResult && signEmbedResult.length > 0) {
      const currentValue = parseFloat(signEmbedResult[0].value[1]);
      const target = SLO_CONFIG.latency.sign.embed.target;
      
      results.push({
        sloName: 'sign_latency_embed_p95',
        current: currentValue,
        target,
        compliant: currentValue <= target,
        lastUpdated: new Date().toISOString(),
      });
    }

    // Sign p95 latency (remote)
    const signRemoteQuery = 'histogram_quantile(0.95, sum(rate(sign_latency_ms_bucket{sign_type="remote"}[30d])) by (le))';
    const signRemoteResult = await this.queryPrometheus(signRemoteQuery);
    
    if (signRemoteResult && signRemoteResult.length > 0) {
      const currentValue = parseFloat(signRemoteResult[0].value[1]);
      const target = SLO_CONFIG.latency.sign.remote.target;
      
      results.push({
        sloName: 'sign_latency_remote_p95',
        current: currentValue,
        target,
        compliant: currentValue <= target,
        lastUpdated: new Date().toISOString(),
      });
    }

    // TSA p95 latency
    const tsaQuery = 'histogram_quantile(0.95, sum(rate(tsa_latency_ms_bucket[30d])) by (le,tsa_vendor))';
    const tsaResult = await this.queryPrometheus(tsaQuery);
    
    if (tsaResult && tsaResult.length > 0) {
      const currentValue = parseFloat(tsaResult[0].value[1]);
      const target = SLO_CONFIG.latency.tsa.target;
      
      results.push({
        sloName: 'tsa_latency_p95',
        current: currentValue,
        target,
        compliant: currentValue <= target,
        lastUpdated: new Date().toISOString(),
      });
    }

    return results;
  }

  // Validate error rate SLOs
  async validateErrorRateSLOs(): Promise<SLOValidationResult[]> {
    const results: SLOValidationResult[] = [];

    // Overall error rate
    const overallQuery = 'sum(rate(error_total{class!="4xx"}[30d])) / sum(rate(request_total[30d]))';
    const overallResult = await this.queryPrometheus(overallQuery);
    
    if (overallResult && overallResult.length > 0) {
      const currentValue = parseFloat(overallResult[0].value[1]);
      const target = SLO_CONFIG.errorRate.overall.target;
      
      results.push({
        sloName: 'overall_error_rate',
        current: currentValue,
        target,
        compliant: currentValue <= target,
        lastUpdated: new Date().toISOString(),
      });
    }

    // Verify error rate
    const verifyQuery = 'sum(rate(verify_fail_total[30d])) / sum(rate(verify_total_total[30d]))';
    const verifyResult = await this.queryPrometheus(verifyQuery);
    
    if (verifyResult && verifyResult.length > 0) {
      const currentValue = parseFloat(verifyResult[0].value[1]);
      const target = SLO_CONFIG.errorRate.verifyFail.target;
      
      results.push({
        sloName: 'verify_error_rate',
        current: currentValue,
        target,
        compliant: currentValue <= target,
        lastUpdated: new Date().toISOString(),
      });
    }

    // TSA error rate
    const tsaQuery = 'sum(rate(tsa_error_total[30d])) by (tsa_vendor)';
    const tsaResult = await this.queryPrometheus(tsaQuery);
    
    if (tsaResult && tsaResult.length > 0) {
      tsaResult.forEach((result: any) => {
        const currentValue = parseFloat(result.value[1]);
        const target = SLO_CONFIG.errorRate.tsaError.target;
        const vendor = result.metric.tsa_vendor || 'unknown';
        
        results.push({
          sloName: `tsa_error_rate_${vendor}`,
          current: currentValue,
          target,
          compliant: currentValue <= target,
          lastUpdated: new Date().toISOString(),
        });
      });
    }

    return results;
  }

  // Validate cache SLOs
  async validateCacheSLOs(): Promise<SLOValidationResult[]> {
    const results: SLOValidationResult[] = [];

    // Cache hit ratio
    const cacheQuery = 'sum(rate(cache_hit_total[30d])) / sum(rate(cache_request_total[30d]))';
    const cacheResult = await this.queryPrometheus(cacheQuery);
    
    if (cacheResult && cacheResult.length > 0) {
      const currentValue = parseFloat(cacheResult[0].value[1]);
      const target = SLO_CONFIG.cache.hitRatio.target;
      
      results.push({
        sloName: 'cache_hit_ratio',
        current: currentValue,
        target,
        compliant: currentValue >= target,
        lastUpdated: new Date().toISOString(),
      });
    }

    return results;
  }

  // Check burn rate alerts
  async checkBurnRateAlerts(): Promise<BurnRateAlert[]> {
    const alerts: BurnRateAlert[] = [];

    // Check critical burn rate (14.4x for 1h)
    const criticalQuery = '((1 - (sum(rate(verify_ok_total{discovery="remote"}[1h])) / sum(rate(verify_total_total{discovery="remote"}[1h]))) / 0.001)';
    const criticalResult = await this.queryPrometheus(criticalQuery);
    
    if (criticalResult && criticalResult.length > 0) {
      const currentBurnRate = parseFloat(criticalResult[0].value[1]);
      const threshold = BURN_RATE_ALERTS.paging[0].burnRate;
      
      alerts.push({
        name: 'critical_burn_rate_1h',
        burnRate: currentBurnRate,
        window: '1h',
        threshold,
        current: currentBurnRate,
        triggered: currentBurnRate >= threshold,
        severity: 'critical',
      });
    }

    // Check high burn rate (6x for 6h)
    const highQuery = '((1 - (sum(rate(verify_ok_total{discovery="remote"}[6h])) / sum(rate(verify_total_total{discovery="remote"}[6h]))) / 0.001)';
    const highResult = await this.queryPrometheus(highQuery);
    
    if (highResult && highResult.length > 0) {
      const currentBurnRate = parseFloat(highResult[0].value[1]);
      const threshold = BURN_RATE_ALERTS.paging[1].burnRate;
      
      alerts.push({
        name: 'high_burn_rate_6h',
        burnRate: currentBurnRate,
        window: '6h',
        threshold,
        current: currentBurnRate,
        triggered: currentBurnRate >= threshold,
        severity: 'critical',
      });
    }

    // Check moderate burn rate (2x for 24h)
    const moderateQuery = '((1 - (sum(rate(verify_ok_total{discovery="remote"}[24h])) / sum(rate(verify_total_total{discovery="remote"}[24h]))) / 0.001)';
    const moderateResult = await this.queryPrometheus(moderateQuery);
    
    if (moderateResult && moderateResult.length > 0) {
      const currentBurnRate = parseFloat(moderateResult[0].value[1]);
      const threshold = BURN_RATE_ALERTS.ticketing[0].burnRate;
      
      alerts.push({
        name: 'moderate_burn_rate_24h',
        burnRate: currentBurnRate,
        window: '24h',
        threshold,
        current: currentBurnRate,
        triggered: currentBurnRate >= threshold,
        severity: 'warning',
      });
    }

    return alerts;
  }

  // Generate comprehensive SLO report
  async generateSLOReport(): Promise<void> {
    console.log('🔍 Validating SLOs...\n');

    const survivalResults = await this.validateSurvivalSLOs();
    const latencyResults = await this.validateLatencySLOs();
    const errorRateResults = await this.validateErrorRateSLOs();
    const cacheResults = await this.validateCacheSLOs();
    const burnRateAlerts = await this.checkBurnRateAlerts();

    // Survival SLOs
    console.log('📊 Survival SLOs:');
    survivalResults.forEach(result => {
      const status = result.compliant ? '✅' : '❌';
      const percentage = (result.current * 100).toFixed(3);
      const targetPercentage = (result.target * 100).toFixed(3);
      
      console.log(`  ${status} ${result.sloName}: ${percentage}% (target: ${targetPercentage}%)`);
      
      if (result.errorBudgetStatus) {
        const budget = (result.errorBudgetStatus.errorBudget * 100).toFixed(3);
        const consumed = (result.errorBudgetStatus.errorBudgetConsumed * 100).toFixed(3);
        const remaining = (result.errorBudgetStatus.errorBudgetRemaining * 100).toFixed(3);
        const timeToExhaust = result.errorBudgetStatus.timeToExhaust;
        
        console.log(`     Budget: ${budget}% | Consumed: ${consumed}% | Remaining: ${remaining}%`);
        console.log(`     Time to exhaust: ${timeToExhaust === Infinity ? '∞' : `${timeToExhaust.toFixed(1)} days`}`);
        console.log(`     Status: ${result.errorBudgetStatus.status}`);
      }
    });

    // Latency SLOs
    console.log('\n⚡ Latency SLOs:');
    latencyResults.forEach(result => {
      const status = result.compliant ? '✅' : '❌';
      console.log(`  ${status} ${result.sloName}: ${result.current.toFixed(1)}ms (target: ≤${result.target}ms)`);
    });

    // Error Rate SLOs
    console.log('\n🚨 Error Rate SLOs:');
    errorRateResults.forEach(result => {
      const status = result.compliant ? '✅' : '❌';
      const percentage = (result.current * 100).toFixed(3);
      const targetPercentage = (result.target * 100).toFixed(3);
      
      console.log(`  ${status} ${result.sloName}: ${percentage}% (target: ≤${targetPercentage}%)`);
    });

    // Cache SLOs
    console.log('\n💾 Cache SLOs:');
    cacheResults.forEach(result => {
      const status = result.compliant ? '✅' : '❌';
      const percentage = (result.current * 100).toFixed(1);
      const targetPercentage = (result.target * 100).toFixed(1);
      
      console.log(`  ${status} ${result.sloName}: ${percentage}% (target: ≥${targetPercentage}%)`);
    });

    // Burn Rate Alerts
    console.log('\n🔥 Burn Rate Alerts:');
    burnRateAlerts.forEach(alert => {
      const status = alert.triggered ? '🚨' : '✅';
      const severity = alert.severity.toUpperCase();
      
      console.log(`  ${status} ${alert.name} (${severity}): ${alert.burnRate.toFixed(2)}x (threshold: ≥${alert.threshold}x)`);
      
      if (alert.triggered) {
        console.log(`     ⚠️  BURN RATE ALERT TRIGGERED - Window: ${alert.window}`);
        
        if (alert.severity === 'critical') {
          console.log(`     📞 PAGE ON-CALL IMMEDIATELY`);
        } else {
          console.log(`     🎫 CREATE INCIDENT TICKET`);
        }
      }
    });

    // Overall compliance summary
    const allResults = [...survivalResults, ...latencyResults, ...errorRateResults, ...cacheResults];
    const compliantCount = allResults.filter(r => r.compliant).length;
    const totalCount = allResults.length;
    const compliancePercentage = (compliantCount / totalCount) * 100;

    console.log('\n📈 Overall SLO Compliance:');
    console.log(`  ${compliantCount}/${totalCount} SLOs compliant (${compliancePercentage.toFixed(1)}%)`);

    const triggeredAlerts = burnRateAlerts.filter(a => a.triggered);
    if (triggeredAlerts.length > 0) {
      console.log(`\n🚨 ${triggeredAlerts.length} burn rate alerts triggered`);
      const criticalAlerts = triggeredAlerts.filter(a => a.severity === 'critical');
      if (criticalAlerts.length > 0) {
        console.log(`📞 ${criticalAlerts.length} critical alerts require immediate paging`);
      }
    } else {
      console.log('\n✅ No burn rate alerts triggered');
    }

    // Exit with appropriate code
    const hasViolations = allResults.some(r => !r.compliant) || triggeredAlerts.some(a => a.severity === 'critical');
    process.exit(hasViolations ? 1 : 0);
  }
}

// Main execution
async function main() {
  const validator = new SLOValidator();
  
  try {
    await validator.generateSLOReport();
  } catch (error) {
    console.error('❌ SLO validation failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { SLOValidator };
