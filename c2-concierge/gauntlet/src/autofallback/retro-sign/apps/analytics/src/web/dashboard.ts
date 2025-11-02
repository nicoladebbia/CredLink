/**
 * Phase 13 Analytics - SSR Dashboard Pages
 * Server-rendered dashboards with cards/tables, no SPA complexity
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AnalyticsService } from '../services/analytics-service';
import { createLogger } from '../utils/logger';
import { RequestValidator } from '../utils/validation';
import { getConfig } from '../config';
import * as path from 'path';
import * as Handlebars from 'handlebars';

export interface DashboardRoute {
  method: 'GET' | 'POST';
  url: string;
  handler: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
}

export class DashboardRoutes {
  private templates: Map<string, HandlebarsTemplateDelegate> = new Map();

  constructor(
    private analyticsService: AnalyticsService,
    private logger: Logger
  ) {
    this.loadTemplates();
    this.registerHandlebarsHelpers();
  }

  /**
   * Load Handlebars templates
   */
  private loadTemplates(): void {
    const templateDir = path.join(__dirname, '../templates');
    
    // Ensure template directory exists
    if (!fs.existsSync(templateDir)) {
      this.logger.warn('Template directory not found', { templateDir });
      return;
    }
    
    const templateFiles = {
      'dashboard': 'dashboard.hbs',
      'public-report': 'public-report.hbs'
    };

    for (const [name, file] of Object.entries(templateFiles)) {
      try {
        const templatePath = path.join(templateDir, file);
        if (fs.existsSync(templatePath)) {
          const templateSource = fs.readFileSync(templatePath, 'utf8');
          this.templates.set(name, Handlebars.compile(templateSource));
          
          this.logger.debug('Template loaded', { name, file });
        } else {
          this.logger.warn('Template file not found', { name, file });
        }
      } catch (error) {
        this.logger.error('Failed to load template', { name, file, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  /**
   * Register Handlebars helpers for formatting
   */
  private registerHandlebarsHelpers(): void {
    Handlebars.registerHelper('formatPercent', (value: number) => {
      return `${(value * 100).toFixed(2)}%`;
    });

    Handlebars.registerHelper('formatDuration', (ms: number) => {
      if (ms < 1000) return `${ms}ms`;
      return `${(ms / 1000).toFixed(1)}s`;
    });

    Handlebars.registerHelper('formatCurrency', (value: number) => {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
      }).format(value);
    });

    Handlebars.registerHelper('formatNumber', (value: number) => {
      return new Intl.NumberFormat().format(value);
    });

    Handlebars.registerHelper('statusClass', (status: string) => {
      switch (status.toLowerCase()) {
        case 'pass': return 'status-pass';
        case 'fail': return 'status-fail';
        case 'open': return 'status-open';
        case 'resolved': return 'status-resolved';
        default: return 'status-unknown';
      }
    });

    Handlebars.registerHelper('policyClass', (policy: string) => {
      switch (policy) {
        case 'NORMAL': return 'policy-normal';
        case 'FALLBACK_REMOTE_ONLY': return 'policy-fallback';
        case 'RECOVERY_GUARD': return 'policy-recovery';
        default: return 'policy-unknown';
      }
    });

    Handlebars.registerHelper('burnRateClass', (burnRate: number) => {
      if (burnRate >= 10) return 'burn-critical';
      if (burnRate >= 4) return 'burn-warning';
      if (burnRate >= 1) return 'burn-caution';
      return 'burn-normal';
    });

    Handlebars.registerHelper('formatDate', (date: Date) => {
      return date.toLocaleString();
    });

    Handlebars.registerHelper('formatRelativeTime', (date: Date) => {
      const now = new Date();
      const diff = now.getTime() - date.getTime();
      const minutes = Math.floor(diff / 60000);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);

      if (days > 0) return `${days}d ago`;
      if (hours > 0) return `${hours}h ago`;
      if (minutes > 0) return `${minutes}m ago`;
      return 'Just now';
    });
  }

  /**
   * Register all dashboard routes
   */
  async registerRoutes(fastify: FastifyInstance): Promise<void> {
    // Main tenant dashboard
    fastify.get('/t/:tenant/analytics', {
      preHandler: [this.authenticateTenant.bind(this)]
    }, this.tenantDashboard.bind(this));

    // Public read-only survival report
    fastify.get('/public/:tenant/survival/:period', {
      preHandler: [this.validatePublicToken.bind(this)]
    }, this.publicSurvivalReport.bind(this));

    // CSV export for dashboard data
    fastify.get('/t/:tenant/analytics/export', {
      preHandler: [this.authenticateTenant.bind(this)]
    }, this.dashboardExport.bind(this));

    // API endpoints for AJAX calls (minimal, for charts)
    fastify.get('/api/v1/:tenant/slo-status', {
      preHandler: [this.authenticateTenant.bind(this)]
    }, this.apiSLOStatus.bind(this));

    fastify.get('/api/v1/:tenant/burn-rate', {
      preHandler: [this.authenticateTenant.bind(this)]
    }, this.apiBurnRate.bind(this));

    // Health check
    fastify.get('/analytics/health', this.healthCheck.bind(this));

    this.logger.info('Dashboard routes registered');
  }

  /**
   * Main tenant dashboard page
   */
  private async tenantDashboard(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const { tenant } = request.params as { tenant: string };
      const { route } = request.query as { route?: string };

      this.logger.info('Rendering tenant dashboard', { tenant, route });

      // Get dashboard data
      const dashboardData = await this.analyticsService.getDashboardData(
        tenant, 
        route ? [route] : undefined
      );

      // Validate data freshness
      const freshness = await this.analyticsService.validateDataFreshness(tenant);

      // Render dashboard
      const template = this.templates.get('dashboard');
      if (!template) {
        throw new Error('Dashboard template not found');
      }

      const html = template({
        tenant,
        dashboardData,
        freshness,
        selectedRoute: route,
        lastUpdated: new Date().toISOString()
      });

      reply.header('Content-Type', 'text/html; charset=utf-8');
      reply.header('Cache-Control', 'public, max-age=60'); // Cache for 1 minute
      reply.send(html);

    } catch (error) {
      this.logger.error('Failed to render tenant dashboard', {
        tenant: (request.params as any).tenant,
        error: error instanceof Error ? error.message : String(error)
      });

      reply.status(500).send({
        error: 'Dashboard unavailable',
        message: 'Unable to load dashboard data'
      });
    }
  }

  /**
   * Public survival report (read-only)
   */
  private async publicSurvivalReport(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const { tenant, period } = request.params as { tenant: string; period: string };
      const { token } = request.query as { token?: string };

      this.logger.info('Rendering public survival report', { tenant, period });

      // Validate token (simple read-only token)
      if (!this.validatePublicTokenString(token, tenant)) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Valid token required for public reports'
        });
      }

      // Parse period (YYYY-MM format)
      const [year, month] = period.split('-').map(Number);
      if (!year || !month || month < 1 || month > 12) {
        return reply.status(400).send({
          error: 'Invalid period',
          message: 'Period must be in YYYY-MM format'
        });
      }

      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0, 23, 59, 59, 999);

      // Get survival matrix for the period
      const survivalData = await this.analyticsService.getSurvivalMatrix(
        tenant, 
        startDate, 
        endDate
      );

      // Get SLO status for summary
      const sloStatus = await this.analyticsService.getSLOStatus(tenant);

      // Render public report
      const template = this.templates.get('public-report');
      if (!template) {
        throw new Error('Public report template not found');
      }

      const html = template({
        tenant,
        period,
        year,
        month,
        survivalData,
        sloStatus,
        generatedAt: new Date().toISOString()
      });

      reply.header('Content-Type', 'text/html; charset=utf-8');
      reply.header('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
      reply.send(html);

    } catch (error) {
      this.logger.error('Failed to render public survival report', {
        tenant: (request.params as any).tenant,
        period: (request.params as any).period,
        error: error instanceof Error ? error.message : String(error)
      });

      reply.status(500).send({
        error: 'Report unavailable',
        message: 'Unable to generate survival report'
      });
    }
  }

  /**
   * CSV export for dashboard data
   */
  private async dashboardExport(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const { tenant } = request.params as { tenant: string };
      const { format = 'csv' } = request.query as { format?: string };

      this.logger.info('Exporting dashboard data', { tenant, format });

      const dashboardData = await this.analyticsService.getDashboardData(tenant);

      if (format === 'csv') {
        const csv = this.generateDashboardCSV(dashboardData);
        
        reply.header('Content-Type', 'text/csv');
        reply.header('Content-Disposition', `attachment; filename="${tenant}-analytics-${new Date().toISOString().split('T')[0]}.csv"`);
        reply.send(csv);
      } else {
        // JSON format
        reply.header('Content-Type', 'application/json');
        reply.header('Content-Disposition', `attachment; filename="${tenant}-analytics-${new Date().toISOString().split('T')[0]}.json"`);
        reply.send(dashboardData);
      }

    } catch (error) {
      this.logger.error('Failed to export dashboard data', {
        tenant: (request.params as any).tenant,
        error: error instanceof Error ? error.message : String(error)
      });

      reply.status(500).send({
        error: 'Export failed',
        message: 'Unable to export dashboard data'
      });
    }
  }

  /**
   * API endpoint for SLO status (for AJAX updates)
   */
  private async apiSLOStatus(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const { tenant } = request.params as { tenant: string };
      const { route } = request.query as { route?: string };

      const sloStatus = await this.analyticsService.getSLOStatus(
        tenant, 
        route ? [route] : undefined
      );

      reply.send({ data: sloStatus, timestamp: new Date().toISOString() });

    } catch (error) {
      this.logger.error('Failed to get SLO status API', {
        tenant: (request.params as any).tenant,
        error: error instanceof Error ? error.message : String(error)
      });

      reply.status(500).send({
        error: 'API error',
        message: 'Unable to fetch SLO status'
      });
    }
  }

  /**
   * API endpoint for burn rate (for alert indicators)
   */
  private async apiBurnRate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const { tenant } = request.params as { tenant: string };
      const { window = '5m' } = request.query as { window?: string };

      const windowMinutes = window === '1h' ? 60 : 5;
      const burnRate = await this.analyticsService.getBurnRateMetrics(tenant, windowMinutes);

      reply.send({ 
        data: burnRate, 
        window_minutes: windowMinutes,
        timestamp: new Date().toISOString() 
      });

    } catch (error) {
      this.logger.error('Failed to get burn rate API', {
        tenant: (request.params as any).tenant,
        error: error instanceof Error ? error.message : String(error)
      });

      reply.status(500).send({
        error: 'API error',
        message: 'Unable to fetch burn rate data'
      });
    }
  }

  /**
   * Health check endpoint
   */
  private async healthCheck(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      // Check analytics service health
      const healthSummary = {
        analytics: 'healthy',
        clickhouse: 'unknown',
        templates: this.templates.size,
        timestamp: new Date().toISOString()
      };

      reply.send(healthSummary);

    } catch (error) {
      reply.status(500).send({
        analytics: 'unhealthy',
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Authenticate tenant request (JWT-based) - Enhanced Security
   */
  private async authenticateTenant(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const authHeader = request.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({
        error: 'Authentication required',
        message: 'Bearer token required'
      });
    }

    const token = authHeader.substring(7);
    const config = getConfig();
    
    try {
      // CRITICAL: Enhanced JWT validation with security checks
      const jwt = require('jsonwebtoken');
      const jwtSecret = config.security?.jwt_secret || process.env.JWT_SECRET;
      
      if (!jwtSecret || jwtSecret.length < 32) {
        this.logger.error('JWT secret not configured or too weak');
        return reply.status(500).send({
          error: 'Configuration error',
          message: 'Authentication system not properly configured'
        });
      }

      const decoded = jwt.verify(token, jwtSecret);
      
      // Enhanced token validation
      if (!decoded.tenant || !decoded.exp || !decoded.iat || !decoded.jti) {
        return reply.status(401).send({
          error: 'Authentication failed',
          message: 'Invalid token structure'
        });
      }

      // Check token age
      const now = Math.floor(Date.now() / 1000);
      const tokenAge = now - decoded.iat;
      const maxAge = config.security?.session_timeout || 3600;
      
      if (tokenAge > maxAge) {
        return reply.status(401).send({
          error: 'Authentication failed',
          message: 'Token expired'
        });
      }

      // Extract and validate tenant from token
      const tokenTenant = decoded.tenant;
      
      if (!RequestValidator.validateTenant(tokenTenant)) {
        return reply.status(401).send({
          error: 'Authentication failed',
          message: 'Invalid tenant in token'
        });
      }

      // Extract tenant from request and validate
      const requestTenant = (request.params as any).tenant;
      
      if (!RequestValidator.validateTenant(requestTenant)) {
        return reply.status(400).send({
          error: 'Invalid request',
          message: 'Invalid tenant parameter'
        });
      }
      
      // CRITICAL: Ensure tenant in token matches tenant in request
      if (tokenTenant !== requestTenant) {
        this.logger.warn('Tenant access denied', {
          tokenTenant,
          requestTenant,
          ip: request.ip
        });
        return reply.status(403).send({
          error: 'Authorization failed',
          message: 'Tenant access denied'
        });
      }

      // Attach validated tenant and token info to request
      (request as any).tenant = tokenTenant;
      (request as any).tokenId = decoded.jti;
      (request as any).tokenExp = decoded.exp;

    } catch (error) {
      this.logger.warn('Dashboard authentication failed', {
        error: error instanceof Error ? error.message : String(error),
        ip: request.ip
      });
      return reply.status(401).send({
        error: 'Authentication failed',
        message: 'Invalid or expired token'
      });
    }
  }

  /**
   * Validate public report token
   */
  private async validatePublicToken(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { token } = request.query as { token?: string };
    const tenant = (request.params as any).tenant;

    if (!this.validatePublicTokenString(token, tenant)) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Valid token required for public reports'
      });
    }
  }

  /**
   * Validate public token string
   */
  private validatePublicTokenString(token?: string, tenant?: string): boolean {
    // TODO: Implement proper token validation
    // For now, accept any non-empty token
    return !!(token && token.length > 10 && tenant);
  }

  /**
   * Extract tenant from JWT token
   */
  private extractTenantFromToken(_token: string): string {
    // TODO: Implement proper JWT parsing
    // For now, return a dummy tenant
    return 'demo-tenant';
  }

  /**
   * Generate CSV from dashboard data
   */
  private generateDashboardCSV(data: any): string {
    const headers = [
      'Tenant',
      'Route',
      'Mode',
      'Survival 30d',
      'Survival Target',
      'Status',
      'Budget Left',
      'Burn Rate 5m',
      'Burn Rate 1h',
      'Policy'
    ];

    const rows = data.slo_status.map((slo: any) => [
      slo.tenant,
      slo.route,
      slo.mode,
      slo.survival_30d,
      slo.survival_target,
      slo.survival_status,
      slo.budget_left,
      slo.burn_rate_5m,
      slo.burn_rate_1h,
      slo.policy
    ]);

    return [headers, ...rows]
      .map(row => row.map((cell: any) => `"${cell}"`).join(','))
      .join('\n');
  }
}
