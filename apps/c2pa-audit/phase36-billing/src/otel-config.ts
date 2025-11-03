import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-otlp-http';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { Resource } from '@opentelemetry/resources';
import { 
  SemanticResourceAttributes
} from '@opentelemetry/semantic-conventions';
import { B3Propagator } from '@opentelemetry/propagator-b3';
import { SimpleSpanProcessor, BatchSpanProcessor } from '@opentelemetry/sdk-trace-node';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';

// Environment configuration
const OTEL_EXPORTER_OTLP_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318';
const OTEL_EXPORTER_OTLP_TRACES_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || `${OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`;
const OTEL_EXPORTER_OTLP_METRICS_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT || `${OTEL_EXPORTER_OTLP_ENDPOINT}/v1/metrics`;
const OTEL_EXPORTER_OTLP_LOGS_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT || `${OTEL_EXPORTER_OTLP_ENDPOINT}/v1/logs`;
const PROMETHEUS_ENDPOINT = process.env.PROMETHEUS_ENDPOINT || '0.0.0.0:9464';
const OTEL_SERVICE_NAME = process.env.OTEL_SERVICE_NAME || 'c2pa-billing';
const OTEL_SERVICE_NAMESPACE = process.env.OTEL_SERVICE_NAMESPACE || 'c2pa';
const OTEL_SERVICE_VERSION = process.env.OTEL_SERVICE_VERSION || '1.1.0';
const OTEL_DEPLOYMENT_ENVIRONMENT = process.env.OTEL_DEPLOYMENT_ENVIRONMENT || process.env.NODE_ENV || 'development';
const OTEL_RESOURCE_ATTRIBUTES = process.env.OTEL_RESOURCE_ATTRIBUTES || '';
const GIT_SHA = process.env.GIT_SHA || 'unknown';

// Parse resource attributes from environment
const parseResourceAttributes = (attributes: string): Record<string, string> => {
  const result: Record<string, string> = {};
  if (!attributes) return result;
  
  attributes.split(',').forEach(attr => {
    const [key, value] = attr.split('=').map(s => s.trim());
    if (key && value) {
      result[key] = value;
    }
  });
  
  return result;
};

// Create resource with semantic conventions
const createResource = (): Resource => {
  const attributes = parseResourceAttributes(OTEL_RESOURCE_ATTRIBUTES);
  
  return new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: OTEL_SERVICE_NAME,
    [SemanticResourceAttributes.SERVICE_NAMESPACE]: OTEL_SERVICE_NAMESPACE,
    [SemanticResourceAttributes.SERVICE_VERSION]: OTEL_SERVICE_VERSION,
    [SemanticResourceAttributes.SERVICE_INSTANCE_ID]: `${OTEL_SERVICE_NAME}-${process.pid}`,
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: OTEL_DEPLOYMENT_ENVIRONMENT,
    [SemanticResourceAttributes.PROCESS_PID]: process.pid.toString(),
    [SemanticResourceAttributes.PROCESS_EXECUTABLE_NAME]: 'node',
    [SemanticResourceAttributes.PROCESS_EXECUTABLE_PATH]: process.execPath,
    [SemanticResourceAttributes.PROCESS_COMMAND]: process.argv.join(' '),
    [SemanticResourceAttributes.PROCESS_COMMAND_ARGS]: JSON.stringify(process.argv),
    [SemanticResourceAttributes.PROCESS_RUNTIME_NAME]: 'nodejs',
    [SemanticResourceAttributes.PROCESS_RUNTIME_VERSION]: process.version,
    [SemanticResourceAttributes.PROCESS_RUNTIME_DESCRIPTION]: 'Node.js',
    [SemanticResourceAttributes.HOST_NAME]: require('os').hostname(),
    [SemanticResourceAttributes.HOST_ARCH]: process.arch,
    [SemanticResourceAttributes.HOST_ID]: (() => {
      try {
        const interfaces = require('os').networkInterfaces();
        const eth0 = interfaces.eth0;
        if (eth0 && eth0.length > 0) {
          return eth0[0].address || 'unknown';
        }
        return 'unknown';
      } catch (error) {
        return 'unknown';
      }
    })(),
    'deployment.release.sha': GIT_SHA,
    'deployment.release.time': new Date().toISOString(),
    ...attributes
  });
};

// Create exporters
const createTraceExporter = () => {
  return new OTLPTraceExporter({
    url: OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
    headers: {
      'Content-Type': 'application/json',
    },
  });
};

const createMetricExporter = () => {
  return new OTLPMetricExporter({
    url: OTEL_EXPORTER_OTLP_METRICS_ENDPOINT,
    headers: {
      'Content-Type': 'application/json',
    },
  });
};

const createLogExporter = () => {
  return new OTLPTraceExporter({
    url: OTEL_EXPORTER_OTLP_LOGS_ENDPOINT,
    headers: {
      'Content-Type': 'application/json',
    },
  });
};

const createPrometheusExporter = () => {
  return new PrometheusExporter({
    port: 9464,
    endpoint: '/metrics',
    preventServerStart: false,
  });
};

// Initialize OpenTelemetry SDK
export const initializeOpenTelemetry = (): NodeSDK => {
  const resource = createResource();
  
  // Create exporters
  const traceExporter = createTraceExporter();
  const metricExporter = createMetricExporter();
  const prometheusExporter = createPrometheusExporter();
  
  // Create SDK
  const sdk = new NodeSDK({
    resource,
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': {
          enabled: false,
        },
      }),
    ],
    textMapPropagator: new B3Propagator(),
  });
  
  // Start SDK
  sdk.start();
  
  console.log(`OpenTelemetry initialized for ${OTEL_SERVICE_NAME} in ${OTEL_DEPLOYMENT_ENVIRONMENT}`);
  console.log(`Traces: ${OTEL_EXPORTER_OTLP_TRACES_ENDPOINT}`);
  console.log(`Metrics: ${OTEL_EXPORTER_OTLP_METRICS_ENDPOINT}`);
  console.log(`Logs: ${OTEL_EXPORTER_OTLP_LOGS_ENDPOINT}`);
  console.log(`Prometheus: http://${PROMETHEUS_ENDPOINT}/metrics`);
  
  return sdk;
};

// Export configuration for external use
export const otelConfig = {
  serviceName: OTEL_SERVICE_NAME,
  serviceNamespace: OTEL_SERVICE_NAMESPACE,
  serviceVersion: OTEL_SERVICE_VERSION,
  deploymentEnvironment: OTEL_DEPLOYMENT_ENVIRONMENT,
  tracesEndpoint: OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
  metricsEndpoint: OTEL_EXPORTER_OTLP_METRICS_ENDPOINT,
  logsEndpoint: OTEL_EXPORTER_OTLP_LOGS_ENDPOINT,
  prometheusEndpoint: `http://${PROMETHEUS_ENDPOINT}/metrics`,
  gitSha: GIT_SHA,
};
