import { 
  metrics, 
  trace, 
  context, 
  SpanKind, 
  SpanStatusCode,
  Attributes,
} from '@opentelemetry/api';
import { 
  SemanticAttributes,
  SemanticResourceAttributes,
} from '@opentelemetry/semantic-conventions';
import { SLO_CONFIG, BURN_RATE_ALERTS, getErrorBudgetStatus } from '../config/slo';

// Get tracer and meter
const tracer = trace.getTracer('c2pa-billing-observability', '1.1.0');
const meter = metrics.getMeter('c2pa-billing-observability', '1.1.0');

// Metrics - RED + Business SLI blend
export class ObservabilityMetrics {
  // Request metrics (RED)
  private requestCounter = meter.createCounter('http_requests_total', {
    description: 'Total HTTP requests',
    unit: '1',
  });
  
  private requestDuration = meter.createHistogram('http_request_duration_ms', {
    description: 'HTTP request duration in milliseconds',
    unit: 'ms',
  });
  
  private errorCounter = meter.createCounter('http_errors_total', {
    description: 'Total HTTP errors',
    unit: '1',
  });
  
  // Survival metrics
  private verifyTotalCounter = meter.createCounter('verify_total_total', {
    description: 'Total verification attempts',
    unit: '1',
  });
  
  private verifyOkCounter = meter.createCounter('verify_ok_total', {
    description: 'Total successful verifications',
    unit: '1',
  });
  
  private survivalRemoteRatio = meter.createUpDownCounter('survival_remote_ratio', {
    description: 'Remote survival ratio (verified_remote_ok / verified_total)',
    unit: '1',
  });
  
  private survivalEmbedRatio = meter.createUpDownCounter('survival_embed_ratio', {
    description: 'Embed survival ratio (verified_embedded_ok / verified_total)',
    unit: '1',
  });
  
  // Latency metrics (percentiles via histogram)
  private verifyLatency = meter.createHistogram('verify_latency_ms', {
    description: 'Verify API latency in milliseconds',
    unit: 'ms',
  });
  
  private signLatency = meter.createHistogram('sign_latency_ms', {
    description: 'Sign API latency in milliseconds',
    unit: 'ms',
  });
  
  private tsaLatency = meter.createHistogram('tsa_latency_ms', {
    description: 'TSA latency in milliseconds',
    unit: 'ms',
  });
  
  private manifestFetchLatency = meter.createHistogram('manifest_fetch_latency_ms', {
    description: 'Manifest fetch latency in milliseconds',
    unit: 'ms',
  });
  
  // Error metrics by class
  private verifyFailCounter = meter.createCounter('verify_fail_total', {
    description: 'Total verification failures',
    unit: '1',
  });
  
  private discoveryFailCounter = meter.createCounter('discovery_fail_total', {
    description: 'Total discovery failures',
    unit: '1',
  });
  
  private tsaErrorCounter = meter.createCounter('tsa_error_total', {
    description: 'Total TSA errors',
    unit: '1',
  });
  
  // Cache metrics
  private cacheRequestCounter = meter.createCounter('cache_request_total', {
    description: 'Total cache requests',
    unit: '1',
  });
  
  private cacheHitCounter = meter.createCounter('cache_hit_total', {
    description: 'Total cache hits',
    unit: '1',
  });
  
  private cacheHitRatio = meter.createUpDownCounter('cache_hit_ratio', {
    description: 'Cache hit ratio',
    unit: '1',
  });
  
  // Business metrics
  private signEventsCounter = meter.createCounter('sign_events_total', {
    description: 'Total sign events',
    unit: '1',
  });
  
  private verifyEventsCounter = meter.createCounter('verify_events_total', {
    description: 'Total verify events',
    unit: '1',
  });
  
  private costAccrualCounter = meter.createUpDownCounter('cost_accrual_usd_total', {
    description: 'Cost accrual in USD',
    unit: 'USD',
  });
  
  // Log budget metrics
  private logBytesCounter = meter.createCounter('log_bytes_total', {
    description: 'Total log bytes ingested',
    unit: 'bytes',
  });
  
  private logBudgetExhausted = meter.createCounter('log_budget_exhausted_total', {
    description: 'Log budget exhausted events',
    unit: '1',
  });

  // Record HTTP request
  recordHttpRequest(attributes: Attributes, duration: number, statusCode: number) {
    const baseAttributes = {
      ...attributes,
      [SemanticAttributes.HTTP_METHOD]: attributes.method || 'unknown',
      [SemanticAttributes.HTTP_TARGET]: attributes.target || '/',
      [SemanticAttributes.HTTP_STATUS_CODE]: statusCode,
      [SemanticAttributes.HTTP_ROUTE]: attributes.route || 'unknown',
    };

    this.requestCounter.add(1, baseAttributes);
    this.requestDuration.record(duration, baseAttributes);

    if (statusCode >= 400) {
      const errorClass = statusCode >= 500 ? '5xx' : '4xx';
      this.errorCounter.add(1, { ...baseAttributes, error_class: errorClass });
    }
  }

  // Record verification
  recordVerification(attributes: Attributes, success: boolean, duration: number, discovery: 'embedded' | 'remote' | 'none') {
    const baseAttributes = {
      ...attributes,
      discovery,
      tenant_id: attributes.tenant_id || 'unknown',
      manifest_hash: attributes.manifest_hash || 'unknown',
    };

    this.verifyTotalCounter.add(1, baseAttributes);
    this.verifyLatency.record(duration, baseAttributes);
    this.verifyEventsCounter.add(1, baseAttributes);

    if (success) {
      this.verifyOkCounter.add(1, baseAttributes);
    } else {
      this.verifyFailCounter.add(1, baseAttributes);
    }

    // Update survival ratios (this would typically be calculated from time series data)
    this.updateSurvivalRatios();
  }

  // Record signing
  recordSigning(attributes: Attributes, duration: number, signType: 'embed' | 'remote', tsaEnabled: boolean, tsaLatency?: number) {
    const baseAttributes = {
      ...attributes,
      sign_type: signType,
      tsa_enabled: tsaEnabled,
      tenant_id: attributes.tenant_id || 'unknown',
      asset_id: attributes.asset_id || 'unknown',
      manifest_hash: attributes.manifest_hash || 'unknown',
    };

    this.signLatency.record(duration, baseAttributes);
    this.signEventsCounter.add(1, baseAttributes);

    if (tsaEnabled && tsaLatency) {
      this.tsaLatency.record(tsaLatency, { ...baseAttributes, tsa_vendor: attributes.tsa_vendor || 'unknown' });
    }
  }

  // Record manifest fetch
  recordManifestFetch(attributes: Attributes, duration: number, cacheHit: boolean) {
    const baseAttributes = {
      ...attributes,
      cache_hit: cacheHit,
      tenant_id: attributes.tenant_id || 'unknown',
      provider: attributes.provider || 'unknown',
    };

    this.manifestFetchLatency.record(duration, baseAttributes);
    this.cacheRequestCounter.add(1, baseAttributes);

    if (cacheHit) {
      this.cacheHitCounter.add(1, baseAttributes);
    }

    this.updateCacheHitRatio();
  }

  // Record TSA error
  recordTSAError(attributes: Attributes, errorClass: string) {
    const baseAttributes = {
      ...attributes,
      error_class: errorClass,
      tsa_vendor: attributes.tsa_vendor || 'unknown',
    };

    this.tsaErrorCounter.add(1, baseAttributes);
  }

  // Record discovery failure
  recordDiscoveryFailure(attributes: Attributes, reason: string) {
    const baseAttributes = {
      ...attributes,
      reason,
      tenant_id: attributes.tenant_id || 'unknown',
    };

    this.discoveryFailCounter.add(1, baseAttributes);
  }

  // Record cost accrual
  recordCostAccrual(attributes: Attributes, amount: number) {
    const baseAttributes = {
      ...attributes,
      tenant_id: attributes.tenant_id || 'unknown',
      service: attributes.service || 'unknown',
    };

    this.costAccrualCounter.add(amount, baseAttributes);
  }

  // Record log bytes
  recordLogBytes(attributes: Attributes, bytes: number) {
    const baseAttributes: Attributes = {
      tenant_id: attributes.tenant_id || 'unknown',
    };

    this.logBytesCounter.add(bytes, baseAttributes);

    // Check log budget (simplified - in production this would be more sophisticated)
    const monthlyBudget = SLO_CONFIG.cost.logIngestPerTenant.target;
    const currentUsage = this.getCurrentLogUsage();
    
    if (currentUsage > monthlyBudget) {
      this.logBudgetExhausted.add(1, baseAttributes);
    }
  }

  // Update survival ratios (simplified - in production this would query time series data)
  private updateSurvivalRatios() {
    // This is a placeholder - in production you'd query the actual metrics
    // For now, we'll set dummy values
    this.survivalRemoteRatio.add(0.999);
    this.survivalEmbedRatio.add(0.95);
  }

  // Update cache hit ratio (simplified)
  private updateCacheHitRatio() {
    // This is a placeholder - in production you'd query the actual metrics
    this.cacheHitRatio.add(0.85);
  }

  // Get current log usage (simplified)
  private getCurrentLogUsage(tenantId?: string): number {
    // This is a placeholder - in production you'd query the actual metrics
    return 0;
  }

  // Check SLO compliance
  checkSLOCompliance(): Record<string, any> {
    // This would typically query the actual metrics and calculate compliance
    // For now, return placeholder data
    return {
      survival_remote: {
        current: 0.999,
        target: SLO_CONFIG.survival.remote.target,
        compliant: true,
        errorBudgetStatus: getErrorBudgetStatus(0.999, SLO_CONFIG.survival.remote.target, 0.5),
      },
      survival_embed: {
        current: 0.95,
        target: SLO_CONFIG.survival.embed.target,
        compliant: true,
        errorBudgetStatus: getErrorBudgetStatus(0.95, SLO_CONFIG.survival.embed.target, 0.5),
      },
      latency_verify_p95: {
        current: 450,
        target: SLO_CONFIG.latency.verify.target,
        compliant: true,
      },
      latency_sign_embed_p95: {
        current: 750,
        target: SLO_CONFIG.latency.sign.embed.target,
        compliant: true,
      },
      latency_sign_remote_p95: {
        current: 350,
        target: SLO_CONFIG.latency.sign.remote.target,
        compliant: true,
      },
      latency_tsa_p95: {
        current: 250,
        target: SLO_CONFIG.latency.tsa.target,
        compliant: true,
      },
      cache_hit_ratio: {
        current: 0.85,
        target: SLO_CONFIG.cache.hitRatio.target,
        compliant: true,
      },
    };
  }
}

// Tracing Service
export class ObservabilityTracing {
  // Create spans for key operations
  
  static createSignAssetSpan(attributes: Attributes): any {
    const span = tracer.startSpan('sign.asset', {
      kind: SpanKind.SERVER,
      attributes: {
        ...attributes,
        [SemanticAttributes.FAAS_EXECUTION]: 'sign.asset',
        asset_id: attributes.asset_id || 'unknown',
        manifest_hash: attributes.manifest_hash || 'unknown',
        key_id: attributes.key_id || 'unknown',
        tsa_enabled: attributes.tsa_enabled || false,
        tenant_id: attributes.tenant_id || 'unknown',
      },
    });

    return span;
  }

  static createVerifyAssetSpan(attributes: Attributes): any {
    const span = tracer.startSpan('verify.asset', {
      kind: SpanKind.SERVER,
      attributes: {
        ...attributes,
        [SemanticAttributes.FAAS_EXECUTION]: 'verify.asset',
        manifest_discovery: attributes.manifest_discovery || 'none',
        badge_state: attributes.badge_state || 'unknown',
        provider: attributes.provider || 'unknown',
        tenant_id: attributes.tenant_id || 'unknown',
      },
    });

    return span;
  }

  static createEdgeFetchManifestSpan(attributes: Attributes): any {
    const span = tracer.startSpan('edge.fetch.manifest', {
      kind: SpanKind.CLIENT,
      attributes: {
        ...attributes,
        [SemanticAttributes.FAAS_EXECUTION]: 'edge.fetch.manifest',
        cache_hit: attributes.cache_hit || false,
        tenant_id: attributes.tenant_id || 'unknown',
        provider: attributes.provider || 'unknown',
      },
    });

    return span;
  }

  static createDeploymentReleaseSpan(attributes: Attributes): any {
    const span = tracer.startSpan('deployment.release', {
      kind: SpanKind.INTERNAL,
      attributes: {
        ...attributes,
        [SemanticAttributes.FAAS_EXECUTION]: 'deployment.release',
        deployment_environment: attributes.deployment_environment || 'unknown',
        release_sha: attributes.release_sha || 'unknown',
        release_version: attributes.release_version || 'unknown',
        release_time: new Date().toISOString(),
      },
    });

    return span;
  }

  static addSpanEvent(span: any, name: string, attributes?: Attributes) {
    span.addEvent(name, attributes);
  }

  static setSpanError(span: any, error: Error) {
    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
  }

  static setSpanSuccess(span: any, message?: string) {
    span.setStatus({ code: SpanStatusCode.OK, message: message || 'Success' });
  }
}

// Logging Service (OTel Logs Data Model)
export class ObservabilityLogging {
  // Emit structured log with OTel schema
  static emitLog(level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG', message: string, attributes: Attributes) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      service_name: process.env.OTEL_SERVICE_NAME || 'c2pa-billing',
      deployment_environment_name: process.env.OTEL_DEPLOYMENT_ENVIRONMENT || 'development',
      tenant_id: attributes.tenant_id || 'unknown',
      request_id: attributes.request_id || 'unknown',
      asset_id: attributes.asset_id || 'unknown',
      manifest_hash: attributes.manifest_hash || 'unknown',
      path_decision: attributes.path_decision || 'unknown',
      optimizer_vendor: attributes.optimizer_vendor || 'unknown',
      cache_hit: attributes.cache_hit || false,
      http_target: attributes.http_target || '/',
      http_status_code: attributes.http_status_code || 200,
      duration_ms: attributes.duration_ms || 0,
      release_sha: process.env.GIT_SHA || 'unknown',
      error_class: attributes.error_class || null,
      message,
      ...attributes,
    };

    // In a real implementation, this would use the OTel logs exporter
    console.log(JSON.stringify(logEntry));
  }

  static info(message: string, attributes: Attributes = {}) {
    this.emitLog('INFO', message, attributes);
  }

  static warn(message: string, attributes: Attributes = {}) {
    this.emitLog('WARN', message, attributes);
  }

  static error(message: string, attributes: Attributes = {}) {
    this.emitLog('ERROR', message, attributes);
  }

  static debug(message: string, attributes: Attributes = {}) {
    this.emitLog('DEBUG', message, attributes);
  }
}

// Export singleton instances
export const observabilityMetrics = new ObservabilityMetrics();
export const observabilityTracing = ObservabilityTracing;
export const observabilityLogging = ObservabilityLogging;
