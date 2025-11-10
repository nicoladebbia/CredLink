#!/usr/bin/env ts-node

/**
 * Dashboard Generation Script
 * Generates Grafana dashboards for C2PA Billing System Observability
 */

import fs from 'fs';
import path from 'path';
import { SLO_CONFIG } from '../src/config/slo';

interface GrafanaDashboard {
  id?: number;
  uid?: string;
  title: string;
  tags: string[];
  timezone: string;
  panels: any[];
  templating: {
    list: any[];
  };
  time: {
    from: string;
    to: string;
  };
  refresh: string;
}

interface PanelConfig {
  title: string;
  type: string;
  targets: any[];
  gridPos: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  options?: any;
  fieldConfig?: any;
}

class DashboardGenerator {
  private outputDir: string;

  constructor() {
    this.outputDir = path.join(__dirname, '../dashboards');
    this.ensureOutputDir();
  }

  private ensureOutputDir(): void {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  // Generate survival overview dashboard (executive)
  generateSurvivalOverviewDashboard(): GrafanaDashboard {
    const dashboard: GrafanaDashboard = {
      title: 'C2PA - Survival Overview (Executive)',
      tags: ['c2pa', 'survival', 'executive'],
      timezone: 'browser',
      panels: [],
      templating: {
        list: [
          {
            name: 'tenant',
            type: 'query',
            datasource: 'Prometheus',
            query: 'label_values(verify_total_total, tenant_id)',
            includeAll: true,
            allValue: '.*',
            current: {
              selected: false,
              text: 'All',
              value: '$__all',
            },
          },
        ],
      },
      time: {
        from: 'now-30d',
        to: 'now',
      },
      refresh: '1h',
    };

    // Survival Remote Ratio with burn-down gauge
    dashboard.panels.push({
      title: 'Remote Survival Ratio (30-day)',
      type: 'stat',
      targets: [
        {
          expr: 'sum(rate(verify_ok_total{discovery="remote", tenant_id=~"$tenant"}[30d])) / sum(rate(verify_total_total{discovery="remote", tenant_id=~"$tenant"}[30d]))',
          legendFormat: 'Current',
          refId: 'A',
        },
        {
          expr: `${SLO_CONFIG.survival.remote.target}`,
          legendFormat: 'Target',
          refId: 'B',
        },
      ],
      gridPos: { x: 0, y: 0, w: 12, h: 8 },
      options: {
        reduceOptions: {
          values: false,
          calcs: ['lastNotNull'],
          fields: '',
        },
        orientation: 'auto',
        textMode: 'auto',
        colorMode: 'value',
        graphMode: 'area',
        justifyMode: 'auto',
      },
      fieldConfig: {
        defaults: {
          unit: 'percentunit',
          thresholds: {
            steps: [
              { color: 'red', value: 0 },
              { color: 'yellow', value: SLO_CONFIG.survival.remote.target - 0.01 },
              { color: 'green', value: SLO_CONFIG.survival.remote.target },
            ],
          },
        },
      },
    });

    // Survival Embed Ratio
    dashboard.panels.push({
      title: 'Embed Survival Ratio (30-day)',
      type: 'stat',
      targets: [
        {
          expr: 'sum(rate(verify_ok_total{discovery="embedded", path="preserve", tenant_id=~"$tenant"}[30d])) / sum(rate(verify_total_total{discovery="embedded", tenant_id=~"$tenant"}[30d]))',
          legendFormat: 'Current',
          refId: 'A',
        },
        {
          expr: `${SLO_CONFIG.survival.embed.target}`,
          legendFormat: 'Target',
          refId: 'B',
        },
      ],
      gridPos: { x: 12, y: 0, w: 12, h: 8 },
      options: {
        reduceOptions: {
          values: false,
          calcs: ['lastNotNull'],
          fields: '',
        },
        orientation: 'auto',
        textMode: 'auto',
        colorMode: 'value',
        graphMode: 'area',
        justifyMode: 'auto',
      },
      fieldConfig: {
        defaults: {
          unit: 'percentunit',
          thresholds: {
            steps: [
              { color: 'red', value: 0 },
              { color: 'yellow', value: SLO_CONFIG.survival.embed.target - 0.05 },
              { color: 'green', value: SLO_CONFIG.survival.embed.target },
            ],
          },
        },
      },
    });

    // Top offenders by optimizer/vendor
    dashboard.panels.push({
      title: 'Top Offenders by Optimizer/Vendor',
      type: 'table',
      targets: [
        {
          expr: 'sum by (optimizer_vendor) (rate(verify_fail_total{tenant_id=~"$tenant"}[30d])) / sum by (optimizer_vendor) (rate(verify_total_total{tenant_id=~"$tenant"}[30d]))',
          legendFormat: '{{optimizer_vendor}}',
          refId: 'A',
          format: 'table',
        },
      ],
      gridPos: { x: 0, y: 8, w: 24, h: 8 },
      options: {
        showHeader: true,
      },
      fieldConfig: {
        defaults: {
          unit: 'percentunit',
          thresholds: {
            steps: [
              { color: 'green', value: 0 },
              { color: 'yellow', value: 0.01 },
              { color: 'red', value: 0.05 },
            ],
          },
        },
      },
    });

    // Error budget burn rate
    dashboard.panels.push({
      title: 'Error Budget Burn Rate',
      type: 'graph',
      targets: [
        {
          expr: '(1 - (sum(rate(verify_ok_total{discovery="remote", tenant_id=~"$tenant"}[1h])) / sum(rate(verify_total_total{discovery="remote", tenant_id=~"$tenant"}[1h]))) / 0.001',
          legendFormat: 'Burn Rate (1h)',
          refId: 'A',
        },
        {
          expr: '14.4',
          legendFormat: 'Critical Threshold (1h)',
          refId: 'B',
        },
      ],
      gridPos: { x: 0, y: 16, w: 12, h: 8 },
      options: {
        legend: {
          displayMode: 'list',
          placement: 'bottom',
        },
      },
    });

    // Monthly trend
    dashboard.panels.push({
      title: 'Survival Trend (30-day)',
      type: 'graph',
      targets: [
        {
          expr: 'sum(rate(verify_ok_total{discovery="remote", tenant_id=~"$tenant"}[30d])) / sum(rate(verify_total_total{discovery="remote", tenant_id=~"$tenant"}[30d]))',
          legendFormat: 'Remote Survival',
          refId: 'A',
        },
        {
          expr: 'sum(rate(verify_ok_total{discovery="embedded", path="preserve", tenant_id=~"$tenant"}[30d])) / sum(rate(verify_total_total{discovery="embedded", tenant_id=~"$tenant"}[30d]))',
          legendFormat: 'Embed Survival',
          refId: 'B',
        },
      ],
      gridPos: { x: 12, y: 16, w: 12, h: 8 },
      options: {
        legend: {
          displayMode: 'list',
          placement: 'bottom',
        },
      },
    });

    return dashboard;
  }

  // Generate latency and errors dashboard
  generateLatencyErrorsDashboard(): GrafanaDashboard {
    const dashboard: GrafanaDashboard = {
      title: 'C2PA - Latency & Errors',
      tags: ['c2pa', 'latency', 'errors'],
      timezone: 'browser',
      panels: [],
      templating: {
        list: [
          {
            name: 'tenant',
            type: 'query',
            datasource: 'Prometheus',
            query: 'label_values(verify_total_total, tenant_id)',
            includeAll: true,
            allValue: '.*',
            current: {
              selected: false,
              text: 'All',
              value: '$__all',
            },
          },
        ],
      },
      time: {
        from: 'now-24h',
        to: 'now',
      },
      refresh: '5m',
    };

    // Verify latency p95/p99
    dashboard.panels.push({
      title: 'Verify Latency (p95/p99)',
      type: 'graph',
      targets: [
        {
          expr: 'histogram_quantile(0.95, sum(rate(verify_latency_ms_bucket{tenant_id=~"$tenant"}[24h])) by (le))',
          legendFormat: 'p95',
          refId: 'A',
        },
        {
          expr: 'histogram_quantile(0.99, sum(rate(verify_latency_ms_bucket{tenant_id=~"$tenant"}[24h])) by (le))',
          legendFormat: 'p99',
          refId: 'B',
        },
        {
          expr: `${SLO_CONFIG.latency.verify.target}`,
          legendFormat: 'SLO Target',
          refId: 'C',
        },
      ],
      gridPos: { x: 0, y: 0, w: 12, h: 8 },
      options: {
        legend: {
          displayMode: 'list',
          placement: 'bottom',
        },
      },
    });

    // Sign latency p95/p99
    dashboard.panels.push({
      title: 'Sign Latency (p95/p99)',
      type: 'graph',
      targets: [
        {
          expr: 'histogram_quantile(0.95, sum(rate(sign_latency_ms_bucket{sign_type="embed", tenant_id=~"$tenant"}[24h])) by (le))',
          legendFormat: 'Embed p95',
          refId: 'A',
        },
        {
          expr: 'histogram_quantile(0.95, sum(rate(sign_latency_ms_bucket{sign_type="remote", tenant_id=~"$tenant"}[24h])) by (le))',
          legendFormat: 'Remote p95',
          refId: 'B',
        },
        {
          expr: `${SLO_CONFIG.latency.sign.embed.target}`,
          legendFormat: 'Embed SLO Target',
          refId: 'C',
        },
        {
          expr: `${SLO_CONFIG.latency.sign.remote.target}`,
          legendFormat: 'Remote SLO Target',
          refId: 'D',
        },
      ],
      gridPos: { x: 12, y: 0, w: 12, h: 8 },
      options: {
        legend: {
          displayMode: 'list',
          placement: 'bottom',
        },
      },
    });

    // Error rate by class
    dashboard.panels.push({
      title: 'Error Rate by Class',
      type: 'graph',
      targets: [
        {
          expr: 'sum(rate(error_total{class="5xx", tenant_id=~"$tenant"}[24h])) / sum(rate(request_total{tenant_id=~"$tenant"}[24h]))',
          legendFormat: '5xx Errors',
          refId: 'A',
        },
        {
          expr: 'sum(rate(error_total{class="4xx", tenant_id=~"$tenant"}[24h])) / sum(rate(request_total{tenant_id=~"$tenant"}[24h]))',
          legendFormat: '4xx Errors',
          refId: 'B',
        },
        {
          expr: 'sum(rate(verify_fail_total{tenant_id=~"$tenant"}[24h])) / sum(rate(verify_total_total{tenant_id=~"$tenant"}[24h]))',
          legendFormat: 'Verify Failures',
          refId: 'C',
        },
        {
          expr: 'sum(rate(discovery_fail_total{tenant_id=~"$tenant"}[24h])) / sum(rate(verify_total_total{tenant_id=~"$tenant"}[24h]))',
          legendFormat: 'Discovery Failures',
          refId: 'D',
        },
      ],
      gridPos: { x: 0, y: 8, w: 24, h: 8 },
      options: {
        legend: {
          displayMode: 'list',
          placement: 'bottom',
        },
      },
    });

    // Request volume
    dashboard.panels.push({
      title: 'Request Volume',
      type: 'graph',
      targets: [
        {
          expr: 'sum(rate(request_total{tenant_id=~"$tenant"}[24h])) by (method)',
          legendFormat: '{{method}}',
          refId: 'A',
        },
      ],
      gridPos: { x: 0, y: 16, w: 12, h: 8 },
      options: {
        legend: {
          displayMode: 'list',
          placement: 'bottom',
        },
      },
    });

    // Slow requests with exemplars
    dashboard.panels.push({
      title: 'Slow Requests with Traces',
      type: 'heatmap',
      targets: [
        {
          expr: 'sum(rate(verify_latency_ms_bucket{tenant_id=~"$tenant"}[24h])) by (le)',
          legendFormat: '{{le}}',
          refId: 'A',
        },
      ],
      gridPos: { x: 12, y: 16, w: 12, h: 8 },
      options: {
        tooltip: {
          mode: 'all',
          sort: 'desc',
        },
      },
    });

    return dashboard;
  }

  // Generate edge and storage dashboard
  generateEdgeStorageDashboard(): GrafanaDashboard {
    const dashboard: GrafanaDashboard = {
      title: 'C2PA - Edge & Storage',
      tags: ['c2pa', 'edge', 'storage', 'cache'],
      timezone: 'browser',
      panels: [],
      templating: {
        list: [
          {
            name: 'tenant',
            type: 'query',
            datasource: 'Prometheus',
            query: 'label_values(cache_request_total, tenant_id)',
            includeAll: true,
            allValue: '.*',
            current: {
              selected: false,
              text: 'All',
              value: '$__all',
            },
          },
          {
            name: 'provider',
            type: 'query',
            datasource: 'Prometheus',
            query: 'label_values(manifest_fetch_latency_ms_bucket, provider)',
            includeAll: true,
            allValue: '.*',
            current: {
              selected: false,
              text: 'All',
              value: '$__all',
            },
          },
        ],
      },
      time: {
        from: 'now-24h',
        to: 'now',
      },
      refresh: '5m',
    };

    // Manifest fetch latency
    dashboard.panels.push({
      title: 'Manifest Fetch Latency',
      type: 'graph',
      targets: [
        {
          expr: 'histogram_quantile(0.95, sum(rate(manifest_fetch_latency_ms_bucket{tenant_id=~"$tenant", provider=~"$provider"}[24h])) by (le, provider))',
          legendFormat: 'p95 - {{provider}}',
          refId: 'A',
        },
        {
          expr: 'histogram_quantile(0.99, sum(rate(manifest_fetch_latency_ms_bucket{tenant_id=~"$tenant", provider=~"$provider"}[24h])) by (le, provider))',
          legendFormat: 'p99 - {{provider}}',
          refId: 'B',
        },
        {
          expr: `${SLO_CONFIG.latency.manifestFetch.target}`,
          legendFormat: 'SLO Target',
          refId: 'C',
        },
      ],
      gridPos: { x: 0, y: 0, w: 12, h: 8 },
      options: {
        legend: {
          displayMode: 'list',
          placement: 'bottom',
        },
      },
    });

    // Cache hit ratio
    dashboard.panels.push({
      title: 'Cache Hit Ratio',
      type: 'stat',
      targets: [
        {
          expr: 'sum(rate(cache_hit_total{tenant_id=~"$tenant", provider=~"$provider"}[24h])) / sum(rate(cache_request_total{tenant_id=~"$tenant", provider=~"$provider"}[24h]))',
          legendFormat: 'Current',
          refId: 'A',
        },
        {
          expr: `${SLO_CONFIG.cache.hitRatio.target}`,
          legendFormat: 'Target',
          refId: 'B',
        },
      ],
      gridPos: { x: 12, y: 0, w: 12, h: 8 },
      options: {
        reduceOptions: {
          values: false,
          calcs: ['lastNotNull'],
          fields: '',
        },
        orientation: 'auto',
        textMode: 'auto',
        colorMode: 'value',
        graphMode: 'area',
        justifyMode: 'auto',
      },
      fieldConfig: {
        defaults: {
          unit: 'percentunit',
          thresholds: {
            steps: [
              { color: 'red', value: 0 },
              { color: 'yellow', value: SLO_CONFIG.cache.hitRatio.target - 0.1 },
              { color: 'green', value: SLO_CONFIG.cache.hitRatio.target },
            ],
          },
        },
      },
    });

    // TSA panel
    dashboard.panels.push({
      title: 'TSA Performance',
      type: 'graph',
      targets: [
        {
          expr: 'histogram_quantile(0.95, sum(rate(tsa_latency_ms_bucket{tenant_id=~"$tenant"}[24h])) by (le, tsa_vendor))',
          legendFormat: 'p95 - {{tsa_vendor}}',
          refId: 'A',
        },
        {
          expr: `${SLO_CONFIG.latency.tsa.target}`,
          legendFormat: 'SLO Target',
          refId: 'B',
        },
      ],
      gridPos: { x: 0, y: 8, w: 12, h: 8 },
      options: {
        legend: {
          displayMode: 'list',
          placement: 'bottom',
        },
      },
    });

    // TSA error rate
    dashboard.panels.push({
      title: 'TSA Error Rate by Provider',
      type: 'graph',
      targets: [
        {
          expr: 'sum(rate(tsa_error_total{tenant_id=~"$tenant"}[24h])) by (tsa_vendor) / sum(rate(tsa_request_total{tenant_id=~"$tenant"}[24h])) by (tsa_vendor)',
          legendFormat: '{{tsa_vendor}}',
          refId: 'A',
        },
      ],
      gridPos: { x: 12, y: 8, w: 12, h: 8 },
      options: {
        legend: {
          displayMode: 'list',
          placement: 'bottom',
        },
      },
    });

    // Storage usage
    dashboard.panels.push({
      title: 'Storage Usage by Provider',
      type: 'piechart',
      targets: [
        {
          expr: 'sum(storage_bytes_total{tenant_id=~"$tenant", provider=~"$provider"}) by (provider)',
          legendFormat: '{{provider}}',
          refId: 'A',
        },
      ],
      gridPos: { x: 0, y: 16, w: 12, h: 8 },
      options: {
        legend: {
          displayMode: 'list',
          placement: 'right',
        },
      },
    });

    // Network bandwidth
    dashboard.panels.push({
      title: 'Network Bandwidth',
      type: 'graph',
      targets: [
        {
          expr: 'sum(rate(network_bytes_sent_total{tenant_id=~"$tenant", provider=~"$provider"}[24h])) by (provider)',
          legendFormat: 'Sent - {{provider}}',
          refId: 'A',
        },
        {
          expr: 'sum(rate(network_bytes_received_total{tenant_id=~"$tenant", provider=~"$provider"}[24h])) by (provider)',
          legendFormat: 'Received - {{provider}}',
          refId: 'B',
        },
      ],
      gridPos: { x: 12, y: 16, w: 12, h: 8 },
      options: {
        legend: {
          displayMode: 'list',
          placement: 'bottom',
        },
      },
    });

    return dashboard;
  }

  // Generate finance dashboard
  generateFinanceDashboard(): GrafanaDashboard {
    const dashboard: GrafanaDashboard = {
      title: 'C2PA - Finance',
      tags: ['c2pa', 'finance', 'cost'],
      timezone: 'browser',
      panels: [],
      templating: {
        list: [
          {
            name: 'tenant',
            type: 'query',
            datasource: 'Prometheus',
            query: 'label_values(cost_accrual_usd_total, tenant_id)',
            includeAll: true,
            allValue: '.*',
            current: {
              selected: false,
              text: 'All',
              value: '$__all',
            },
          },
        ],
      },
      time: {
        from: 'now-30d',
        to: 'now',
      },
      refresh: '1h',
    };

    // Per-tenant cost accrual
    dashboard.panels.push({
      title: 'Cost Accrual per Tenant',
      type: 'graph',
      targets: [
        {
          expr: 'sum(rate(cost_accrual_usd_total{tenant_id=~"$tenant"}[30d])) by (tenant_id)',
          legendFormat: '{{tenant_id}}',
          refId: 'A',
        },
      ],
      gridPos: { x: 0, y: 0, w: 12, h: 8 },
      options: {
        legend: {
          displayMode: 'list',
          placement: 'bottom',
        },
      },
    });

    // Revenue vs cost
    dashboard.panels.push({
      title: 'Revenue vs Cost',
      type: 'graph',
      targets: [
        {
          expr: 'sum(rate(revenue_usd_total{tenant_id=~"$tenant"}[30d]))',
          legendFormat: 'Revenue',
          refId: 'A',
        },
        {
          expr: 'sum(rate(cost_accrual_usd_total{tenant_id=~"$tenant"}[30d]))',
          legendFormat: 'Cost',
          refId: 'B',
        },
      ],
      gridPos: { x: 12, y: 0, w: 12, h: 8 },
      options: {
        legend: {
          displayMode: 'list',
          placement: 'bottom',
        },
      },
    });

    // Cost breakdown by service
    dashboard.panels.push({
      title: 'Cost Breakdown by Service',
      type: 'piechart',
      targets: [
        {
          expr: 'sum(rate(cost_accrual_usd_total{tenant_id=~"$tenant"}[30d])) by (service)',
          legendFormat: '{{service}}',
          refId: 'A',
        },
      ],
      gridPos: { x: 0, y: 8, w: 12, h: 8 },
      options: {
        legend: {
          displayMode: 'list',
          placement: 'right',
        },
      },
    });

    // Event costs
    dashboard.panels.push({
      title: 'Event Costs',
      type: 'table',
      targets: [
        {
          expr: 'sum(rate(sign_events_total{tenant_id=~"$tenant"}[30d])) by (tenant_id) * 0.01',
          legendFormat: 'Sign Events - {{tenant_id}}',
          refId: 'A',
          format: 'table',
        },
        {
          expr: 'sum(rate(verify_events_total{tenant_id=~"$tenant"}[30d])) by (tenant_id) * 0.005',
          legendFormat: 'Verify Events - {{tenant_id}}',
          refId: 'B',
          format: 'table',
        },
        {
          expr: 'sum(rate(tsa_requests_total{tenant_id=~"$tenant"}[30d])) by (tenant_id) * 0.50',
          legendFormat: 'TSA Requests - {{tenant_id}}',
          refId: 'C',
          format: 'table',
        },
      ],
      gridPos: { x: 12, y: 8, w: 12, h: 8 },
      options: {
        showHeader: true,
      },
    });

    // Churn correlation
    dashboard.panels.push({
      title: 'Churn vs Reliability Correlation',
      type: 'scatter',
      targets: [
        {
          expr: 'sum(rate(churn_events_total{tenant_id=~"$tenant"}[30d])) by (tenant_id)',
          legendFormat: 'Churn Rate',
          refId: 'A',
        },
      ],
      gridPos: { x: 0, y: 16, w: 24, h: 8 },
      options: {
        legend: {
          displayMode: 'list',
          placement: 'bottom',
        },
      },
    });

    return dashboard;
  }

  // Generate burn rate dashboard
  generateBurnRateDashboard(): GrafanaDashboard {
    const dashboard: GrafanaDashboard = {
      title: 'C2PA - Burn Rate Monitoring',
      tags: ['c2pa', 'burn-rate', 'slo'],
      timezone: 'browser',
      panels: [],
      templating: {
        list: [],
      },
      time: {
        from: 'now-24h',
        to: 'now',
      },
      refresh: '1m',
    };

    // 5m@1h burn rate
    dashboard.panels.push({
      title: 'Burn Rate - 5m@1h (Critical)',
      type: 'graph',
      targets: [
        {
          expr: '(1 - (sum(rate(verify_ok_total{discovery="remote"}[1h])) / sum(rate(verify_total_total{discovery="remote"}[1h]))) / 0.001',
          legendFormat: 'Current Burn Rate',
          refId: 'A',
        },
        {
          expr: '14.4',
          legendFormat: 'Critical Threshold (PAGE)',
          refId: 'B',
        },
      ],
      gridPos: { x: 0, y: 0, w: 12, h: 8 },
      options: {
        legend: {
          displayMode: 'list',
          placement: 'bottom',
        },
        alert: {
          alertRuleTags: {},
          conditions: [
            {
              evaluator: { params: [14.4], type: 'gt' },
              operator: { type: 'and' },
              query: { params: ['A', '5m', 'now'] },
              reducer: { params: [], type: 'last' },
              type: 'query',
            },
          ],
          executionErrorState: 'alerting',
          for: '5m',
          frequency: '1m',
          handler: 1,
          name: 'Critical Burn Rate Alert',
          noDataState: 'no_data',
          notifications: [],
        },
      },
    });

    // 30m@6h burn rate
    dashboard.panels.push({
      title: 'Burn Rate - 30m@6h (Critical)',
      type: 'graph',
      targets: [
        {
          expr: '(1 - (sum(rate(verify_ok_total{discovery="remote"}[6h])) / sum(rate(verify_total_total{discovery="remote"}[6h]))) / 0.001',
          legendFormat: 'Current Burn Rate',
          refId: 'A',
        },
        {
          expr: '6.0',
          legendFormat: 'High Threshold (PAGE)',
          refId: 'B',
        },
      ],
      gridPos: { x: 12, y: 0, w: 12, h: 8 },
      options: {
        legend: {
          displayMode: 'list',
          placement: 'bottom',
        },
      },
    });

    // 2h@24h burn rate
    dashboard.panels.push({
      title: 'Burn Rate - 2h@24h (Ticket)',
      type: 'graph',
      targets: [
        {
          expr: '(1 - (sum(rate(verify_ok_total{discovery="remote"}[24h])) / sum(rate(verify_total_total{discovery="remote"}[24h]))) / 0.001',
          legendFormat: 'Current Burn Rate',
          refId: 'A',
        },
        {
          expr: '2.0',
          legendFormat: 'Moderate Threshold (TICKET)',
          refId: 'B',
        },
      ],
      gridPos: { x: 0, y: 8, w: 12, h: 8 },
      options: {
        legend: {
          displayMode: 'list',
          placement: 'bottom',
        },
      },
    });

    // 1d@30d burn rate
    dashboard.panels.push({
      title: 'Burn Rate - 1d@30d (Trend)',
      type: 'graph',
      targets: [
        {
          expr: '(1 - (sum(rate(verify_ok_total{discovery="remote"}[30d])) / sum(rate(verify_total_total{discovery="remote"}[30d]))) / 0.001',
          legendFormat: 'Current Burn Rate',
          refId: 'A',
        },
      ],
      gridPos: { x: 12, y: 8, w: 12, h: 8 },
      options: {
        legend: {
          displayMode: 'list',
          placement: 'bottom',
        },
      },
    });

    // Error budget remaining
    dashboard.panels.push({
      title: 'Error Budget Remaining',
      type: 'stat',
      targets: [
        {
          expr: 'max((1 - (sum(rate(verify_ok_total{discovery="remote"}[30d])) / sum(rate(verify_total_total{discovery="remote"}[30d]))) / 0.001 * 100)',
          legendFormat: 'Budget Consumed %',
          refId: 'A',
        },
      ],
      gridPos: { x: 0, y: 16, w: 12, h: 8 },
      options: {
        reduceOptions: {
          values: false,
          calcs: ['lastNotNull'],
          fields: '',
        },
        orientation: 'auto',
        textMode: 'auto',
        colorMode: 'value',
        graphMode: 'area',
        justifyMode: 'auto',
      },
      fieldConfig: {
        defaults: {
          unit: 'percent',
          thresholds: {
            steps: [
              { color: 'green', value: 0 },
              { color: 'yellow', value: 50 },
              { color: 'red', value: 100 },
            ],
          },
        },
      },
    });

    // Time to exhaust
    dashboard.panels.push({
      title: 'Time to Exhaust (days)',
      type: 'stat',
      targets: [
        {
          expr: '(0.001 - (1 - (sum(rate(verify_ok_total{discovery="remote"}[30d])) / sum(rate(verify_total_total{discovery="remote"}[30d]))) / 1000) / ((1 - (sum(rate(verify_ok_total{discovery="remote"}[1h])) / sum(rate(verify_total_total{discovery="remote"}[1h]))) / 0.001) * 30',
          legendFormat: 'Days Remaining',
          refId: 'A',
        },
      ],
      gridPos: { x: 12, y: 16, w: 12, h: 8 },
      options: {
        reduceOptions: {
          values: false,
          calcs: ['lastNotNull'],
          fields: '',
        },
        orientation: 'auto',
        textMode: 'auto',
        colorMode: 'value',
        graphMode: 'area',
        justifyMode: 'auto',
      },
      fieldConfig: {
        defaults: {
          unit: 'd',
          thresholds: {
            steps: [
              { color: 'red', value: 0 },
              { color: 'yellow', value: 7 },
              { color: 'green', value: 30 },
            ],
          },
        },
      },
    });

    return dashboard;
  }

  // Save dashboard to file
  private saveDashboard(dashboard: GrafanaDashboard, filename: string): void {
    const filePath = path.join(this.outputDir, filename);
    const dashboardJson = JSON.stringify(dashboard, null, 2);
    
    fs.writeFileSync(filePath, dashboardJson);
    console.log(`✅ Generated dashboard: ${filePath}`);
  }

  // Generate all dashboards
  generateAllDashboards(): void {
    console.log('🎨 Generating Grafana dashboards...\n');

    // Generate each dashboard
    const survivalDashboard = this.generateSurvivalOverviewDashboard();
    const latencyErrorsDashboard = this.generateLatencyErrorsDashboard();
    const edgeStorageDashboard = this.generateEdgeStorageDashboard();
    const financeDashboard = this.generateFinanceDashboard();
    const burnRateDashboard = this.generateBurnRateDashboard();

    // Save dashboards
    this.saveDashboard(survivalDashboard, 'c2pa-survival-overview.json');
    this.saveDashboard(latencyErrorsDashboard, 'c2pa-latency-errors.json');
    this.saveDashboard(edgeStorageDashboard, 'c2pa-edge-storage.json');
    this.saveDashboard(financeDashboard, 'c2pa-finance.json');
    this.saveDashboard(burnRateDashboard, 'c2pa-burn-rate.json');

    console.log('\n📊 Dashboard generation completed!');
    console.log(`📁 Dashboards saved to: ${this.outputDir}`);
    console.log('\n📋 Import instructions:');
    console.log('1. Open Grafana');
    console.log('2. Go to Dashboards → Import');
    console.log('3. Upload the JSON files from the dashboards directory');
    console.log('4. Configure Prometheus and Loki data sources');
    console.log('5. Set up alerts and notifications');
  }
}

// Main execution
async function main() {
  const generator = new DashboardGenerator();
  
  try {
    generator.generateAllDashboards();
  } catch (error) {
    console.error('❌ Dashboard generation failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { DashboardGenerator };
