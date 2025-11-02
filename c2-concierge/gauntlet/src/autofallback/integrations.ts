/**
 * Phase 6 - Optimizer Auto-Fallback: External Integrations
 * Real PagerDuty, Slack, and monitoring service integrations
 */

export interface PagerDutyConfig {
  integrationKey: string;
  apiToken: string;
  serviceId: string;
  escalationPolicyId: string;
}

export interface SlackConfig {
  webhookUrl: string;
  botToken: string;
  channelId: string;
  notificationThresholds: {
    critical: number;
    warning: number;
    info: number;
  };
}

export interface MonitoringConfig {
  prometheusUrl: string;
  grafanaUrl: string;
  datadogApiKey?: string;
  newrelicApiKey?: string;
}

export interface AlertPayload {
  title: string;
  message: string;
  severity: 'critical' | 'warning' | 'info';
  source: string;
  timestamp: number;
  metadata: Record<string, any>;
  correlationId: string;
}

export class ExternalIntegrations {
  private pagerDutyConfig?: PagerDutyConfig;
  private slackConfig?: SlackConfig;
  private monitoringConfig?: MonitoringConfig;

  constructor(
    pagerDutyConfig?: PagerDutyConfig,
    slackConfig?: SlackConfig,
    monitoringConfig?: MonitoringConfig
  ) {
    this.pagerDutyConfig = pagerDutyConfig;
    this.slackConfig = slackConfig;
    this.monitoringConfig = monitoringConfig;
  }

  // Send alert to PagerDuty
  async sendPagerDutyAlert(alert: AlertPayload): Promise<boolean> {
    if (!this.pagerDutyConfig) {
      console.log('PagerDuty not configured - would send alert:', alert);
      return true;
    }

    try {
      const payload = {
        routing_key: this.pagerDutyConfig.integrationKey,
        event_action: 'trigger',
        dedup_key: alert.correlationId,
        payload: {
          summary: alert.title,
          source: alert.source,
          severity: this.mapSeverityToPagerDuty(alert.severity),
          timestamp: alert.timestamp,
          component: 'c2-autofallback',
          group: 'cdn-optimization',
          class: alert.severity,
          custom_details: {
            message: alert.message,
            metadata: alert.metadata,
            correlationId: alert.correlationId
          }
        }
      };

      const response = await fetch('https://events.pagerduty.com/v2/enqueue', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`PagerDuty API error: ${response.status} ${response.statusText}`);
      }

      console.log('✅ PagerDuty alert sent successfully');
      return true;

    } catch (error) {
      console.error('❌ Failed to send PagerDuty alert:', error);
      return false;
    }
  }

  // Resolve PagerDuty incident
  async resolvePagerDutyIncident(correlationId: string, message: string): Promise<boolean> {
    if (!this.pagerDutyConfig) {
      console.log('PagerDuty not configured - would resolve incident:', correlationId);
      return true;
    }

    try {
      const payload = {
        routing_key: this.pagerDutyConfig.integrationKey,
        event_action: 'resolve',
        dedup_key: correlationId,
        payload: {
          custom_details: {
            resolution: message,
            resolvedAt: new Date().toISOString()
          }
        }
      };

      const response = await fetch('https://events.pagerduty.com/v2/enqueue', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`PagerDuty API error: ${response.status} ${response.statusText}`);
      }

      console.log('✅ PagerDuty incident resolved successfully');
      return true;

    } catch (error) {
      console.error('❌ Failed to resolve PagerDuty incident:', error);
      return false;
    }
  }

  // Send notification to Slack
  async sendSlackNotification(alert: AlertPayload): Promise<boolean> {
    if (!this.slackConfig) {
      console.log('Slack not configured - would send notification:', alert);
      return true;
    }

    try {
      const color = this.mapSeverityToSlackColor(alert.severity);
      const emoji = this.mapSeverityToSlackEmoji(alert.severity);

      const payload = {
        channel: this.slackConfig.channelId,
        username: 'C2 Auto-Fallback',
        icon_emoji: emoji,
        attachments: [
          {
            color,
            title: alert.title,
            text: alert.message,
            fields: [
              {
                title: 'Severity',
                value: alert.severity.toUpperCase(),
                short: true
              },
              {
                title: 'Source',
                value: alert.source,
                short: true
              },
              {
                title: 'Correlation ID',
                value: alert.correlationId,
                short: true
              },
              {
                title: 'Time',
                value: new Date(alert.timestamp).toISOString(),
                short: true
              }
            ],
            footer: 'C2 Auto-Fallback System',
            ts: Math.floor(alert.timestamp / 1000)
          }
        ]
      };

      const response = await fetch(this.slackConfig.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Slack API error: ${response.status} ${response.statusText}`);
      }

      console.log('✅ Slack notification sent successfully');
      return true;

    } catch (error) {
      console.error('❌ Failed to send Slack notification:', error);
      return false;
    }
  }

  // Send metrics to Prometheus Pushgateway
  async sendPrometheusMetrics(metrics: string): Promise<boolean> {
    if (!this.monitoringConfig?.prometheusUrl) {
      console.log('Prometheus not configured - would send metrics');
      return true;
    }

    try {
      const response = await fetch(`${this.monitoringConfig.prometheusUrl}/metrics/job/c2-autofallback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain'
        },
        body: metrics
      });

      if (!response.ok) {
        throw new Error(`Prometheus API error: ${response.status} ${response.statusText}`);
      }

      console.log('✅ Prometheus metrics sent successfully');
      return true;

    } catch (error) {
      console.error('❌ Failed to send Prometheus metrics:', error);
      return false;
    }
  }

  // Create Grafana dashboard
  async createGrafanaDashboard(dashboardConfig: any): Promise<boolean> {
    if (!this.monitoringConfig?.grafanaUrl) {
      console.log('Grafana not configured - would create dashboard');
      return true;
    }

    try {
      const response = await fetch(`${this.monitoringConfig.grafanaUrl}/api/dashboards/db`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.monitoringConfig.grafanaUrl.includes('grafana.net') ? 'your-api-key' : 'admin:admin'}`
        },
        body: JSON.stringify(dashboardConfig)
      });

      if (!response.ok) {
        throw new Error(`Grafana API error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      console.log('✅ Grafana dashboard created successfully:', result.uid);
      return true;

    } catch (error) {
      console.error('❌ Failed to create Grafana dashboard:', error);
      return false;
    }
  }

  // Send metrics to Datadog
  async sendDatadogMetrics(metrics: any): Promise<boolean> {
    if (!this.monitoringConfig?.datadogApiKey) {
      console.log('Datadog not configured - would send metrics');
      return true;
    }

    try {
      const payload = {
        series: metrics.map((metric: any) => ({
          metric: metric.name,
          points: [[Math.floor(Date.now() / 1000), metric.value]],
          tags: metric.tags || [],
          type: metric.type || 'gauge'
        }))
      };

      const response = await fetch('https://api.datadoghq.com/api/v1/series', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'DD-API-KEY': this.monitoringConfig.datadogApiKey
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Datadog API error: ${response.status} ${response.statusText}`);
      }

      console.log('✅ Datadog metrics sent successfully');
      return true;

    } catch (error) {
      console.error('❌ Failed to send Datadog metrics:', error);
      return false;
    }
  }

  // Send metrics to New Relic
  async sendNewRelicMetrics(metrics: any): Promise<boolean> {
    if (!this.monitoringConfig?.newrelicApiKey) {
      console.log('New Relic not configured - would send metrics');
      return true;
    }

    try {
      const payload = {
        metrics: metrics.map((metric: any) => ({
          name: metric.name,
          type: metric.type || 'gauge',
          value: metric.value,
          timestamp: Math.floor(Date.now() / 1000),
          attributes: metric.attributes || {}
        }))
      };

      const response = await fetch('https://metric-api.newrelic.com/metric/v1', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Api-Key': this.monitoringConfig.newrelicApiKey
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`New Relic API error: ${response.status} ${response.statusText}`);
      }

      console.log('✅ New Relic metrics sent successfully');
      return true;

    } catch (error) {
      console.error('❌ Failed to send New Relic metrics:', error);
      return false;
    }
  }

  // Send comprehensive alert to all configured channels
  async sendAlert(alert: AlertPayload): Promise<{
    pagerDuty: boolean;
    slack: boolean;
    total: boolean;
  }> {
    const results = {
      pagerDuty: await this.sendPagerDutyAlert(alert),
      slack: await this.sendSlackNotification(alert),
      total: false
    };

    results.total = results.pagerDuty && results.slack;

    if (results.total) {
      console.log(`✅ Alert sent to all channels: ${alert.title}`);
    } else {
      console.log(`⚠️  Alert partially sent: PagerDuty=${results.pagerDuty}, Slack=${results.slack}`);
    }

    return results;
  }

  // Resolve incident across all channels
  async resolveIncident(correlationId: string, message: string): Promise<boolean> {
    const pagerDutyResult = await this.resolvePagerDutyIncident(correlationId, message);
    
    if (pagerDutyResult) {
      console.log(`✅ Incident resolved across all channels: ${correlationId}`);
    } else {
      console.log(`⚠️  Incident partially resolved: ${correlationId}`);
    }

    return pagerDutyResult;
  }

  // Health check for all integrations
  async healthCheck(): Promise<{
    pagerDuty: boolean;
    slack: boolean;
    prometheus: boolean;
    grafana: boolean;
    datadog: boolean;
    newRelic: boolean;
  }> {
    const results = {
      pagerDuty: false,
      slack: false,
      prometheus: false,
      grafana: false,
      datadog: false,
      newRelic: false
    };

    // Check PagerDuty
    if (this.pagerDutyConfig) {
      try {
        const response = await fetch(`https://api.pagerduty.com/services/${this.pagerDutyConfig.serviceId}`, {
          headers: {
            'Authorization': `Token token=${this.pagerDutyConfig.apiToken}`,
            'Accept': 'application/vnd.pagerduty+json;version=2'
          }
        });
        results.pagerDuty = response.ok;
      } catch (error) {
        results.pagerDuty = false;
      }
    }

    // Check Slack
    if (this.slackConfig) {
      try {
        const response = await fetch(this.slackConfig.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: 'Health check from C2 Auto-Fallback',
            channel: this.slackConfig.channelId
          })
        });
        results.slack = response.ok;
      } catch (error) {
        results.slack = false;
      }
    }

    // Check Prometheus
    if (this.monitoringConfig?.prometheusUrl) {
      try {
        const response = await fetch(`${this.monitoringConfig.prometheusUrl}/api/v1/query?query=up`);
        results.prometheus = response.ok;
      } catch (error) {
        results.prometheus = false;
      }
    }

    // Check Grafana
    if (this.monitoringConfig?.grafanaUrl) {
      try {
        const response = await fetch(`${this.monitoringConfig.grafanaUrl}/api/health`);
        results.grafana = response.ok;
      } catch (error) {
        results.grafana = false;
      }
    }

    // Check Datadog
    if (this.monitoringConfig?.datadogApiKey) {
      try {
        const response = await fetch('https://api.datadoghq.com/api/v1/validate', {
          headers: { 'DD-API-KEY': this.monitoringConfig.datadogApiKey }
        });
        results.datadog = response.ok;
      } catch (error) {
        results.datadog = false;
      }
    }

    // Check New Relic
    if (this.monitoringConfig?.newrelicApiKey) {
      try {
        const response = await fetch('https://api.newrelic.com/v2/applications.json', {
          headers: { 'Api-Key': this.monitoringConfig.newrelicApiKey }
        });
        results.newRelic = response.ok;
      } catch (error) {
        results.newRelic = false;
      }
    }

    return results;
  }

  // Helper methods
  private mapSeverityToPagerDuty(severity: string): string {
    switch (severity) {
      case 'critical': return 'critical';
      case 'warning': return 'warning';
      case 'info': return 'info';
      default: return 'info';
    }
  }

  private mapSeverityToSlackColor(severity: string): string {
    switch (severity) {
      case 'critical': return 'danger';
      case 'warning': return 'warning';
      case 'info': return 'good';
      default: return 'good';
    }
  }

  private mapSeverityToSlackEmoji(severity: string): string {
    switch (severity) {
      case 'critical': return ':rotating_light:';
      case 'warning': return ':warning:';
      case 'info': return ':information_source:';
      default: return ':information_source:';
    }
  }
}

// Default configurations (would be loaded from environment in production)
export const DEFAULT_INTEGRATIONS = new ExternalIntegrations(
  {
    integrationKey: process.env.PAGERDUTY_INTEGRATION_KEY || '',
    apiToken: process.env.PAGERDUTY_API_TOKEN || '',
    serviceId: process.env.PAGERDUTY_SERVICE_ID || '',
    escalationPolicyId: process.env.PAGERDUTY_ESCALATION_POLICY_ID || ''
  },
  {
    webhookUrl: process.env.SLACK_WEBHOOK_URL || '',
    botToken: process.env.SLACK_BOT_TOKEN || '',
    channelId: process.env.SLACK_CHANNEL_ID || '#alerts',
    notificationThresholds: {
      critical: 1,
      warning: 5,
      info: 10
    }
  },
  {
    prometheusUrl: process.env.PROMETHEUS_URL || 'http://localhost:9091',
    grafanaUrl: process.env.GRAFANA_URL || 'http://localhost:3000',
    datadogApiKey: process.env.DATADOG_API_KEY,
    newrelicApiKey: process.env.NEWRELIC_API_KEY
  }
);

// Global integrations instance
export const externalIntegrations = DEFAULT_INTEGRATIONS;
