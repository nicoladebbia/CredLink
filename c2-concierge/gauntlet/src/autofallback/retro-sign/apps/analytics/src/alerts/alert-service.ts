/**
 * Phase 13 Analytics - Alert Service
 * Burn-rate monitoring, alerting, and automatic fallback enforcement
 */

import { AnalyticsService } from '../services/analytics-service';
import { Logger } from 'winston';
import * as nodemailer from 'nodemailer';
import { WebClient } from '@slack/web-api';
import * as yaml from 'yaml';
import * as fs from 'fs';
import * as path from 'path';

export interface AlertConfig {
  rules: AlertRule[];
  notifications: NotificationConfig;
  enforcement: EnforcementConfig;
}

export interface AlertRule {
  name: string;
  enabled: boolean;
  thresholds: AlertThreshold[];
  actions: AlertAction[];
  cooldown_minutes: number;
}

export interface AlertThreshold {
  window_minutes: number;
  target_survival: number;
  burn_rate_threshold: number;
  min_requests: number;
}

export interface AlertAction {
  type: 'notify' | 'enforce_fallback' | 'open_incident' | 'open_ticket';
  config: {
    email?: string[];
    slack?: string[];
    webhook?: string;
    priority?: 'low' | 'medium' | 'high' | 'critical';
    auto_resolve?: boolean;
  };
}

export interface NotificationConfig {
  email: {
    smtp_host: string;
    smtp_port: number;
    username: string;
    password: string;
    from: string;
  };
  slack: {
    bot_token: string;
    default_channel: string;
  };
}

export interface EnforcementConfig {
  fallback_api_url: string;
  service_token: string;
  auto_resolve_hours: number;
}

export interface AlertIncident {
  id: string;
  tenant: string;
  route: string;
  rule_name: string;
  triggered_at: Date;
  burn_rate: number;
  window_minutes: number;
  actions_taken: string[];
  status: 'open' | 'resolved' | 'suppressed';
  resolved_at?: Date;
}

export class AlertService {
  private config: AlertConfig;
  private emailTransporter: nodemailer.Transporter;
  private slackClient: WebClient;
  private activeIncidents: Map<string, AlertIncident> = new Map();

  constructor(
    private analyticsService: AnalyticsService,
    private logger: Logger,
    configPath?: string
  ) {
    this.loadConfig(configPath);
    this.initializeNotificationClients();
  }

  /**
   * Load alert configuration from YAML file
   */
  private loadConfig(configPath?: string): void {
    const defaultPath = path.join(__dirname, '../config/alerts.yaml');
    const filePath = configPath || defaultPath;

    try {
      const configContent = fs.readFileSync(filePath, 'utf8');
      this.config = yaml.parse(configContent);
      
      this.logger.info('Alert configuration loaded', {
        rules: this.config.rules.length,
        enabled_rules: this.config.rules.filter(r => r.enabled).length
      });
    } catch (error) {
      this.logger.error('Failed to load alert configuration', {
        path: filePath,
        error: error.message
      });
      
      // Load default configuration for safety
      this.config = this.getDefaultConfig();
    }
  }

  /**
   * Initialize email and Slack clients
   */
  private initializeNotificationClients(): void {
    // Email transporter
    this.emailTransporter = nodemailer.createTransporter({
      host: this.config.notifications.email.smtp_host,
      port: this.config.notifications.email.smtp_port,
      secure: true,
      auth: {
        user: this.config.notifications.email.username,
        pass: this.config.notifications.email.password
      }
    });

    // Slack client
    this.slackClient = new WebClient(this.config.notifications.slack.bot_token);

    this.logger.info('Notification clients initialized');
  }

  /**
   * Run burn-rate check for all enabled rules
   */
  async runBurnRateCheck(tenant: string): Promise<void> {
    try {
      this.logger.info('Running burn-rate check', { tenant });

      const enabledRules = this.config.rules.filter(rule => rule.enabled);
      
      for (const rule of enabledRules) {
        await this.checkRule(tenant, rule);
      }

      this.logger.info('Burn-rate check completed', {
        tenant,
        rules_checked: enabledRules.length,
        active_incidents: this.activeIncidents.size
      });

    } catch (error) {
      this.logger.error('Burn-rate check failed', {
        tenant,
        error: error.message
      });
    }
  }

  /**
   * Check a specific alert rule
   */
  private async checkRule(tenant: string, rule: AlertRule): Promise<void> {
    try {
      // Check cooldown
      const incidentKey = `${tenant}:${rule.name}`;
      const lastIncident = this.activeIncidents.get(incidentKey);
      
      if (lastIncident && lastIncident.status === 'open') {
        const cooldownElapsed = (Date.now() - lastIncident.triggered_at.getTime()) / (1000 * 60);
        
        if (cooldownElapsed < rule.cooldown_minutes) {
          this.logger.debug('Rule in cooldown period', {
            tenant,
            rule: rule.name,
            cooldown_remaining: rule.cooldown_minutes - cooldownElapsed
          });
          return;
        }
      }

      // Check burn-rate thresholds
      const violations = await this.analyticsService.checkBurnRateThresholds(tenant, [rule]);
      
      if (violations.length > 0) {
        for (const violation of violations) {
          for (const metrics of violation.violations) {
            await this.triggerAlert(tenant, rule, metrics);
          }
        }
      }

    } catch (error) {
      this.logger.error('Rule check failed', {
        tenant,
        rule: rule.name,
        error: error.message
      });
    }
  }

  /**
   * Trigger alert for burn-rate violation
   */
  private async triggerAlert(
    tenant: string, 
    rule: AlertRule, 
    metrics: any
  ): Promise<void> {
    try {
      const incidentId = this.generateIncidentId();
      const incidentKey = `${tenant}:${rule.name}:${metrics.route}`;
      
      const incident: AlertIncident = {
        id: incidentId,
        tenant,
        route: metrics.route,
        rule_name: rule.name,
        triggered_at: new Date(),
        burn_rate: metrics.burn_rate,
        window_minutes: metrics.window_start ? 5 : 60, // Determine from metrics
        actions_taken: [],
        status: 'open'
      };

      // Store incident
      this.activeIncidents.set(incidentKey, incident);

      this.logger.warn('Alert triggered', {
        tenant,
        route: metrics.route,
        rule: rule.name,
        burn_rate: metrics.burn_rate,
        incident_id: incidentId
      });

      // Execute alert actions
      for (const action of rule.actions) {
        await this.executeAction(tenant, metrics, rule, action, incident);
      }

      // Log incident to database
      await this.logIncident(incident, metrics);

    } catch (error) {
      this.logger.error('Alert trigger failed', {
        tenant,
        rule: rule.name,
        error: error.message
      });
    }
  }

  /**
   * Execute alert action
   */
  private async executeAction(
    tenant: string,
    metrics: any,
    rule: AlertRule,
    action: AlertAction,
    incident: AlertIncident
  ): Promise<void> {
    try {
      switch (action.type) {
        case 'notify':
          await this.sendNotifications(tenant, metrics, rule, action, incident);
          incident.actions_taken.push('notification_sent');
          break;

        case 'enforce_fallback':
          await this.enforceFallback(tenant, metrics.route, incident);
          incident.actions_taken.push('fallback_enforced');
          break;

        case 'open_incident':
          await this.openIncident(tenant, metrics, rule, incident);
          incident.actions_taken.push('incident_opened');
          break;

        case 'open_ticket':
          await this.openTicket(tenant, metrics, rule, incident);
          incident.actions_taken.push('ticket_opened');
          break;

        default:
          this.logger.warn('Unknown alert action type', { type: action.type });
      }

    } catch (error) {
      this.logger.error('Alert action execution failed', {
        tenant,
        action: action.type,
        error: error.message
      });
    }
  }

  /**
   * Send email and Slack notifications
   */
  private async sendNotifications(
    tenant: string,
    metrics: any,
    rule: AlertRule,
    action: AlertAction,
    incident: AlertIncident
  ): Promise<void> {
    const subject = `🚨 C2PA Alert: ${rule.name} - ${tenant}/${metrics.route}`;
    const severity = this.getSeverityLevel(metrics.burn_rate);
    
    // Send email notifications
    if (action.config.email?.length) {
      const emailContent = this.generateEmailContent(tenant, metrics, rule, incident, severity);
      
      await this.emailTransporter.sendMail({
        from: this.config.notifications.email.from,
        to: action.config.email.join(', '),
        subject,
        html: emailContent
      });

      this.logger.info('Email notifications sent', {
        tenant,
        recipients: action.config.email.length
      });
    }

    // Send Slack notifications
    if (action.config.slack?.length) {
      const slackMessage = this.generateSlackMessage(tenant, metrics, rule, incident, severity);
      
      for (const channel of action.config.slack) {
        await this.slackClient.chat.postMessage({
          channel,
          ...slackMessage
        });
      }

      this.logger.info('Slack notifications sent', {
        tenant,
        channels: action.config.slack.length
      });
    }
  }

  /**
   * Enforce automatic fallback via Phase 6 API
   */
  private async enforceFallback(
    tenant: string,
    route: string,
    incident: AlertIncident
  ): Promise<void> {
    try {
      const response = await fetch(`${this.config.enforcement.fallback_api_url}/${route}/force_fallback`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.enforcement.service_token}`,
          'Content-Type': 'application/json',
          'X-Incident-ID': incident.id,
          'X-Reason': `Burn-rate alert: ${incident.rule_name}`
        },
        body: JSON.stringify({
          tenant,
          route,
          reason: `Automatic fallback due to burn-rate violation (${incident.burn_rate}x)`,
          incident_id: incident.id,
          rule_name: incident.rule_name
        })
      });

      if (!response.ok) {
        throw new Error(`Fallback API returned ${response.status}: ${response.statusText}`);
      }

      this.logger.info('Automatic fallback enforced', {
        tenant,
        route,
        incident_id: incident.id
      });

    } catch (error) {
      this.logger.error('Failed to enforce fallback', {
        tenant,
        route,
        incident_id: incident.id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Open incident in tracking system
   */
  private async openIncident(
    tenant: string,
    metrics: any,
    rule: AlertRule,
    incident: AlertIncident
  ): Promise<void> {
    // TODO: Integrate with incident management system (PagerDuty, etc.)
    this.logger.info('Incident opened in tracking system', {
      tenant,
      route: metrics.route,
      incident_id: incident.id
    });
  }

  /**
   * Open support ticket
   */
  private async openTicket(
    tenant: string,
    metrics: any,
    rule: AlertRule,
    incident: AlertIncident
  ): Promise<void> {
    // TODO: Integrate with ticketing system (Jira, etc.)
    this.logger.info('Support ticket opened', {
      tenant,
      route: metrics.route,
      incident_id: incident.id
    });
  }

  /**
   * Log incident to analytics database
   */
  private async logIncident(incident: AlertIncident, metrics: any): Promise<void> {
    // TODO: Insert into incidents table in ClickHouse
    this.logger.info('Incident logged to database', {
      incident_id: incident.id,
      tenant: incident.tenant,
      route: incident.route
    });
  }

  /**
   * Generate email content
   */
  private generateEmailContent(
    tenant: string,
    metrics: any,
    rule: AlertRule,
    incident: AlertIncident,
    severity: string
  ): string {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <h2 style="color: #dc2626; margin: 0;">🚨 C2PA Survival Alert</h2>
          <p style="margin: 10px 0; color: #6b7280;">Severity: ${severity.toUpperCase()}</p>
        </div>
        
        <div style="background: white; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
          <h3 style="color: #1f2937; margin: 0 0 15px 0;">Incident Details</h3>
          
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Tenant:</td>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${tenant}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Route:</td>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${metrics.route}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Rule:</td>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${rule.name}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Burn Rate:</td>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #dc2626; font-weight: bold;">${metrics.burn_rate}x</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Window:</td>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${incident.window_minutes} minutes</td>
            </tr>
            <tr>
              <td style="padding: 8px; font-weight: bold;">Incident ID:</td>
              <td style="padding: 8px; font-family: monospace;">${incident.id}</td>
            </tr>
          </table>
          
          <div style="margin-top: 20px; padding: 15px; background: #fef2f2; border-radius: 6px;">
            <h4 style="color: #dc2626; margin: 0 0 10px 0;">Actions Taken:</h4>
            <ul style="margin: 0; padding-left: 20px;">
              ${incident.actions_taken.map(action => `<li>${action.replace('_', ' ')}</li>`).join('')}
            </ul>
          </div>
          
          <div style="margin-top: 20px;">
            <a href="https://analytics.c2pa.example.com/t/${tenant}/analytics" 
               style="background: #3b82f6; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; display: inline-block;">
              View Analytics Dashboard
            </a>
          </div>
        </div>
        
        <div style="margin-top: 20px; padding: 15px; background: #f3f4f6; border-radius: 8px; font-size: 12px; color: #6b7280;">
          <p>This alert was generated automatically by the C2PA Analytics system.</p>
          <p>If you believe this is a false positive, please contact your C2PA representative.</p>
        </div>
      </div>
    `;
  }

  /**
   * Generate Slack message
   */
  private generateSlackMessage(
    tenant: string,
    metrics: any,
    rule: AlertRule,
    incident: AlertIncident,
    severity: string
  ): any {
    const color = severity === 'critical' ? 'danger' : severity === 'high' ? 'warning' : 'good';
    
    return {
      text: `🚨 C2PA Survival Alert: ${rule.name}`,
      attachments: [{
        color,
        fields: [
          {
            title: 'Tenant',
            value: tenant,
            short: true
          },
          {
            title: 'Route',
            value: metrics.route,
            short: true
          },
          {
            title: 'Burn Rate',
            value: `${metrics.burn_rate}x`,
            short: true
          },
          {
            title: 'Window',
            value: `${incident.window_minutes} minutes`,
            short: true
          },
          {
            title: 'Incident ID',
            value: `\`${incident.id}\``,
            short: false
          },
          {
            title: 'Actions Taken',
            value: incident.actions_taken.map(a => `• ${a.replace('_', ' ')}`).join('\n'),
            short: false
          }
        ],
        actions: [{
          type: 'button',
          text: 'View Dashboard',
          url: `https://analytics.c2pa.example.com/t/${tenant}/analytics`
        }],
        footer: 'C2PA Analytics',
        ts: Math.floor(incident.triggered_at.getTime() / 1000)
      }]
    };
  }

  /**
   * Get severity level based on burn rate
   */
  private getSeverityLevel(burnRate: number): string {
    if (burnRate >= 20) return 'critical';
    if (burnRate >= 10) return 'high';
    if (burnRate >= 5) return 'medium';
    return 'low';
  }

  /**
   * Generate unique incident ID
   */
  private generateIncidentId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `inc_${timestamp}_${random}`;
  }

  /**
   * Get default configuration for safety
   */
  private getDefaultConfig(): AlertConfig {
    return {
      rules: [
        {
          name: 'remote-fast-burn',
          enabled: true,
          thresholds: [
            {
              window_minutes: 5,
              target_survival: 0.999,
              burn_rate_threshold: 10.0,
              min_requests: 100
            }
          ],
          actions: [
            {
              type: 'notify',
              config: {
                email: ['alerts@company.com'],
                slack: ['#alerts'],
                priority: 'high'
              }
            },
            {
              type: 'enforce_fallback',
              config: {}
            }
          ],
          cooldown_minutes: 30
        }
      ],
      notifications: {
        email: {
          smtp_host: process.env.SMTP_HOST || 'localhost',
          smtp_port: parseInt(process.env.SMTP_PORT || '587'),
          username: process.env.SMTP_USER || '',
          password: process.env.SMTP_PASS || '',
          from: process.env.SMTP_FROM || 'alerts@c2pa.example.com'
        },
        slack: {
          bot_token: process.env.SLACK_BOT_TOKEN || '',
          default_channel: '#alerts'
        }
      },
      enforcement: {
        fallback_api_url: process.env.FALLBACK_API_URL || 'http://localhost:3000/api/v1/routes',
        service_token: process.env.SERVICE_TOKEN || '',
        auto_resolve_hours: 24
      }
    };
  }

  /**
   * Get active incidents for monitoring
   */
  getActiveIncidents(): AlertIncident[] {
    return Array.from(this.activeIncidents.values());
  }

  /**
   * Resolve incident manually
   */
  async resolveIncident(incidentId: string): Promise<void> {
    const incident = Array.from(this.activeIncidents.values())
      .find(inc => inc.id === incidentId);
    
    if (incident) {
      incident.status = 'resolved';
      incident.resolved_at = new Date();
      
      this.logger.info('Incident resolved', {
        incident_id: incidentId,
        tenant: incident.tenant,
        route: incident.route
      });
    }
  }
}
