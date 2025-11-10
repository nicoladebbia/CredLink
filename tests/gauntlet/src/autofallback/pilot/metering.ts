/**
 * Phase 7 - Pilot Metering Infrastructure
 * Real-time event tracking and reporting for pilot program
 */

export interface SignEvent {
  ts: string;
  tenant_id: string;
  asset_id: string;
  asset_url: string;
  mode: 'remote' | 'embed';
  status: 'ok' | 'error';
  sign_ms: number;
  manifest_url: string;
  error?: string;
}

export interface VerifyEvent {
  ts: string;
  tenant_id: string;
  asset_url: string;
  route: string;
  status: 'ok' | 'error';
  verify_ms: number;
  manifest_hash: string;
  manifest_url: string;
  user_agent?: string;
  referrer?: string;
  error?: string;
}

export interface SurvivalCounter {
  ts: string;
  tenant_id: string;
  route: string;
  asset_url: string;
  remote_survives: boolean;
  embed_survives: boolean;
  optimizer_detected?: string;
  response_headers: Record<string, string>;
}

export interface DailyRollup {
  date: string;
  tenant_id: string;
  assets_signed: number;
  verifications: number;
  remote_survival: number;
  embed_survival_preserve: number;
  p95_verify_ms: number;
  p95_sign_ms: number;
  incidents: number;
  unique_routes: number;
  top_breakpoints: Array<{
    url: string;
    count: number;
    error_type: string;
  }>;
}

export class PilotMetering {
  private signEvents: SignEvent[] = [];
  private verifyEvents: VerifyEvent[] = [];
  private survivalCounters: SurvivalCounter[] = [];
  private dailyRollups: Map<string, DailyRollup> = new Map();

  constructor() {
    // Validate environment
    this.validateEnvironment();
  }

  private validateEnvironment() {
    // Check required globals
    if (typeof process === 'undefined') {
      console.warn('PilotMetering: Running in browser environment, some features may be limited');
    }

    // Validate data structures
    if (!this.signEvents || !Array.isArray(this.signEvents)) {
      throw new Error('PilotMetering: Failed to initialize sign events array');
    }
    
    if (!this.verifyEvents || !Array.isArray(this.verifyEvents)) {
      throw new Error('PilotMetering: Failed to initialize verify events array');
    }
    
    if (!this.survivalCounters || !Array.isArray(this.survivalCounters)) {
      throw new Error('PilotMetering: Failed to initialize survival counters array');
    }
  }

  private validateSignEvent(event: SignEvent): boolean {
    return (
      typeof event === 'object' &&
      typeof event.ts === 'string' &&
      typeof event.tenant_id === 'string' &&
      typeof event.asset_id === 'string' &&
      typeof event.asset_url === 'string' &&
      ['remote', 'embed'].includes(event.mode) &&
      ['ok', 'error'].includes(event.status) &&
      typeof event.sign_ms === 'number' &&
      event.sign_ms >= 0 &&
      typeof event.manifest_url === 'string' &&
      (event.error === undefined || typeof event.error === 'string')
    );
  }

  private validateVerifyEvent(event: VerifyEvent): boolean {
    return (
      typeof event === 'object' &&
      typeof event.ts === 'string' &&
      typeof event.tenant_id === 'string' &&
      typeof event.asset_url === 'string' &&
      typeof event.route === 'string' &&
      ['ok', 'error'].includes(event.status) &&
      typeof event.verify_ms === 'number' &&
      event.verify_ms >= 0 &&
      typeof event.manifest_hash === 'string' &&
      typeof event.manifest_url === 'string' &&
      (event.user_agent === undefined || typeof event.user_agent === 'string') &&
      (event.referrer === undefined || typeof event.referrer === 'string') &&
      (event.error === undefined || typeof event.error === 'string')
    );
  }

  private validateSurvivalCounter(event: SurvivalCounter): boolean {
    return (
      typeof event === 'object' &&
      typeof event.ts === 'string' &&
      typeof event.tenant_id === 'string' &&
      typeof event.route === 'string' &&
      typeof event.asset_url === 'string' &&
      typeof event.remote_survives === 'boolean' &&
      typeof event.embed_survives === 'boolean' &&
      (event.optimizer_detected === undefined || typeof event.optimizer_detected === 'string') &&
      typeof event.response_headers === 'object' &&
      event.response_headers !== null
    );
  }

  // Record a signing event
  recordSignEvent(event: SignEvent): void {
    try {
      if (!this.validateSignEvent(event)) {
        console.error('PilotMetering: Invalid sign event:', event);
        return;
      }

      // Check for duplicate events
      const isDuplicate = this.signEvents.some(existing => 
        existing.asset_id === event.asset_id && 
        existing.ts === event.ts
      );

      if (isDuplicate) {
        console.warn('PilotMetering: Duplicate sign event detected:', event.asset_id);
        return;
      }

      this.signEvents.push(event);
      this.updateDailyRollup(event.tenant_id);
      
      console.log(`Sign event recorded: ${event.asset_id} for tenant ${event.tenant_id}`);
      
    } catch (error) {
      console.error('PilotMetering: Failed to record sign event:', error);
    }
  }

  // Record a verification event
  recordVerifyEvent(event: VerifyEvent): void {
    try {
      if (!this.validateVerifyEvent(event)) {
        console.error('PilotMetering: Invalid verify event:', event);
        return;
      }

      // Check for duplicate events (within 1 minute window)
      const eventTime = new Date(event.ts).getTime();
      const isDuplicate = this.verifyEvents.some(existing => {
        const existingTime = new Date(existing.ts).getTime();
        return existing.asset_url === event.asset_url && 
               Math.abs(eventTime - existingTime) < 60000; // 1 minute
      });

      if (isDuplicate) {
        console.warn('PilotMetering: Duplicate verify event detected:', event.asset_url);
        return;
      }

      this.verifyEvents.push(event);
      this.updateDailyRollup(event.tenant_id);
      
      console.log(`Verify event recorded: ${event.asset_url} for tenant ${event.tenant_id}`);
      
    } catch (error) {
      console.error('PilotMetering: Failed to record verify event:', error);
    }
  }

  // Record a survival counter event
  recordSurvivalCounter(event: SurvivalCounter): void {
    try {
      if (!this.validateSurvivalCounter(event)) {
        console.error('PilotMetering: Invalid survival counter event:', event);
        return;
      }

      this.survivalCounters.push(event);
      this.updateDailyRollup(event.tenant_id);
      
      console.log(`Survival counter recorded: ${event.asset_url} - Remote: ${event.remote_survives}, Embed: ${event.embed_survives}`);
      
    } catch (error) {
      console.error('PilotMetering: Failed to record survival counter:', error);
    }
  }

  // Get tenant metrics for dashboard
  getTenantMetrics(tenantId: string, days: number = 7): {
    summary: any;
    daily: DailyRollup[];
    routes: any[];
    incidents: any[];
  } {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const recentEvents = {
      signs: this.signEvents.filter(e => e.tenant_id === tenantId && new Date(e.ts) > cutoffDate),
      verifies: this.verifyEvents.filter(e => e.tenant_id === tenantId && new Date(e.ts) > cutoffDate),
      survival: this.survivalCounters.filter(e => e.tenant_id === tenantId && new Date(e.ts) > cutoffDate)
    };

    const summary = this.calculateSummary(recentEvents);
    const daily = this.getDailyRollups(tenantId, days);
    const routes = this.getRouteMetrics(tenantId);
    const incidents = this.getIncidents(tenantId, days);

    return { summary, daily, routes, incidents };
  }

  // Generate survival report for tenant
  generateSurvivalReport(tenantId: string): {
    executive: any;
    routes: any[];
    breakpoints: any[];
    compliance: any;
    recommendations: string[];
  } {
    const metrics = this.getTenantMetrics(tenantId, 14);
    
    const executive = {
      survival_rate: metrics.summary.remote_survival,
      latency_p95: metrics.summary.p95_verify_ms,
      assets_processed: metrics.summary.assets_signed,
      incidents: metrics.summary.incidents,
      status: this.getOverallStatus(metrics.summary)
    };

    const routes = metrics.routes.map(route => ({
      path: route.path,
      page_type: route.page_type,
      remote_survival: route.remote_survival,
      embed_survival: route.embed_survival,
      p95_latency: route.p95_verify_ms,
      status: route.remote_survival >= 99.9 ? 'Pass' : 'Fail'
    }));

    const breakpoints = this.identifyBreakpoints(tenantId);
    const compliance = this.assessCompliance(tenantId);
    const recommendations = this.generateRecommendations(metrics, breakpoints);

    return { executive, routes, breakpoints, compliance, recommendations };
  }

  // Export events in NDJSON format
  exportEvents(tenantId: string, eventType: 'sign' | 'verify' | 'survival'): string {
    let events: any[] = [];

    switch (eventType) {
      case 'sign':
        events = this.signEvents.filter(e => e.tenant_id === tenantId);
        break;
      case 'verify':
        events = this.verifyEvents.filter(e => e.tenant_id === tenantId);
        break;
      case 'survival':
        events = this.survivalCounters.filter(e => e.tenant_id === tenantId);
        break;
    }

    return events.map(e => JSON.stringify(e)).join('\n');
  }

  // Get pilot progress towards goals
  getPilotProgress(tenantId: string): {
    day: number;
    assets_signed: number;
    assets_target: number;
    survival_rate: number;
    survival_target: number;
    latency_p95: number;
    latency_target: number;
    routes_covered: number;
    routes_target: number;
    on_track: boolean;
  } {
    const metrics = this.getTenantMetrics(tenantId, 14);
    const summary = metrics.summary;
    
    const day = Math.floor((Date.now() - new Date('2024-10-31').getTime()) / (1000 * 60 * 60 * 24));
    const expectedDay = Math.min(day, 14);

    const progress = {
      day: expectedDay,
      assets_signed: summary.assets_signed,
      assets_target: Math.min(200, Math.floor(200 * expectedDay / 14)),
      survival_rate: summary.remote_survival,
      survival_target: 99.9,
      latency_p95: summary.p95_verify_ms,
      latency_target: 600,
      routes_covered: summary.unique_routes,
      routes_target: Math.min(3, Math.floor(3 * expectedDay / 14)),
      on_track: true
    };

    // Check if on track
    progress.on_track = 
      progress.assets_signed >= progress.assets_target * 0.8 &&
      progress.survival_rate >= progress.survival_target * 0.99 &&
      progress.latency_p95 <= progress.latency_target &&
      progress.routes_covered >= progress.routes_target;

    return progress;
  }

  // Private helper methods
  private calculateSummary(events: any): any {
    const { signs, verifies, survival } = events;

    return {
      assets_signed: signs.length,
      verifications: verifies.length,
      remote_survival: this.calculateSurvivalRate(survival, 'remote'),
      embed_survival: this.calculateSurvivalRate(survival, 'embed'),
      p95_verify_ms: this.calculateP95(verifies.map(v => v.verify_ms)),
      p95_sign_ms: this.calculateP95(signs.map(s => s.sign_ms)),
      incidents: this.countIncidents(verifies),
      unique_routes: new Set(survival.map(s => s.route)).size
    };
  }

  private calculateSurvivalRate(survival: SurvivalCounter[], type: 'remote' | 'embed'): number {
    if (survival.length === 0) return 0;
    
    const survived = survival.filter(s => type === 'remote' ? s.remote_survives : s.embed_survives).length;
    return (survived / survival.length) * 100;
  }

  private calculateP95(values: number[]): number {
    if (values.length === 0) return 0;
    
    const sorted = values.sort((a, b) => a - b);
    const index = Math.floor(sorted.length * 0.95);
    return sorted[index] || 0;
  }

  private countIncidents(verifies: VerifyEvent[]): number {
    return verifies.filter(v => v.status === 'error').length;
  }

  private updateDailyRollup(tenantId: string): void {
    const today = new Date().toISOString().split('T')[0];
    const key = `${tenantId}-${today}`;

    if (!this.dailyRollups.has(key)) {
      this.dailyRollups.set(key, {
        date: today,
        tenant_id: tenantId,
        assets_signed: 0,
        verifications: 0,
        remote_survival: 0,
        embed_survival_preserve: 0,
        p95_verify_ms: 0,
        p95_sign_ms: 0,
        incidents: 0,
        unique_routes: 0,
        top_breakpoints: []
      });
    }
  }

  private getDailyRollups(tenantId: string, days: number): DailyRollup[] {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    return Array.from(this.dailyRollups.values())
      .filter(r => r.tenant_id === tenantId && new Date(r.date) > cutoffDate)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  private getRouteMetrics(tenantId: string): any[] {
    const routeEvents = this.survivalCounters.filter(e => e.tenant_id === tenantId);
    const routeMap = new Map<string, any>();

    routeEvents.forEach(event => {
      if (!routeMap.has(event.route)) {
        routeMap.set(event.route, {
          path: event.route,
          page_type: this.inferPageType(event.route),
          verifies: 0,
          remote_survives: 0,
          embed_survives: 0,
          verify_times: []
        });
      }

      const route = routeMap.get(event.route);
      route.verifies++;
      if (event.remote_survives) route.remote_survives++;
      if (event.embed_survives) route.embed_survives++;
      
      const verifyEvent = this.verifyEvents.find(v => v.asset_url === event.asset_url);
      if (verifyEvent) {
        route.verify_times.push(verifyEvent.verify_ms);
      }
    });

    return Array.from(routeMap.values()).map(route => ({
      ...route,
      remote_survival: route.verifies > 0 ? (route.remote_survives / route.verifies) * 100 : 0,
      embed_survival: route.verifies > 0 ? (route.embed_survives / route.verifies) * 100 : 0,
      p95_verify_ms: this.calculateP95(route.verify_times)
    }));
  }

  private getIncidents(tenantId: string, days: number): any[] {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    return this.verifyEvents
      .filter(e => e.tenant_id === tenantId && e.status === 'error' && new Date(e.ts) > cutoffDate)
      .map(e => ({
        timestamp: e.ts,
        asset_url: e.asset_url,
        error: e.error || 'Unknown error',
        route: e.route
      }));
  }

  private inferPageType(route: string): string {
    if (route.includes('/product') || route.includes('/item')) return 'Product Page';
    if (route.includes('/article') || route.includes('/blog')) return 'Article Page';
    if (route.includes('/gallery') || route.includes('/collection')) return 'Gallery Page';
    if (route === '/' || route.includes('/home')) return 'Homepage';
    return 'Other';
  }

  private getOverallStatus(summary: any): 'Pass' | 'Warning' | 'Fail' {
    if (summary.remote_survival >= 99.9 && summary.p95_verify_ms <= 600 && summary.incidents === 0) {
      return 'Pass';
    } else if (summary.remote_survival >= 99.0 && summary.p95_verify_ms <= 800) {
      return 'Warning';
    } else {
      return 'Fail';
    }
  }

  private identifyBreakpoints(tenantId: string): any[] {
    const incidents = this.getIncidents(tenantId, 14);
    const breakpointMap = new Map<string, any>();

    incidents.forEach(incident => {
      const key = incident.error;
      if (!breakpointMap.has(key)) {
        breakpointMap.set(key, {
          type: incident.error,
          count: 0,
          urls: [],
          first_seen: incident.timestamp,
          last_seen: incident.timestamp
        });
      }

      const breakpoint = breakpointMap.get(key);
      breakpoint.count++;
      if (!breakpoint.urls.includes(incident.asset_url)) {
        breakpoint.urls.push(incident.asset_url);
      }
      if (new Date(incident.timestamp) > new Date(breakpoint.last_seen)) {
        breakpoint.last_seen = incident.timestamp;
      }
    });

    return Array.from(breakpointMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  private assessCompliance(tenantId: string): any {
    const metrics = this.getTenantMetrics(tenantId, 14);
    
    return {
      training_mining: {
        status: 'Compliant',
        description: 'Training data mining prohibited in all manifests'
      },
      ai_transparency: {
        status: metrics.summary.remote_survival >= 99.0 ? 'Met' : 'Partial',
        description: 'Content Credentials provide AI transparency'
      },
      provenance: {
        status: metrics.summary.remote_survival >= 99.5 ? 'Met' : 'Partial',
        description: 'Digital provenance maintained across CDN'
      },
      verification: {
        status: metrics.summary.p95_verify_ms <= 600 ? 'Met' : 'Partial',
        description: 'Verification performance meets requirements'
      }
    };
  }

  private generateRecommendations(metrics: any, breakpoints: any[]): string[] {
    const recommendations: string[] = [];

    if (metrics.summary.remote_survival < 99.9) {
      recommendations.push('Implement HTML fallback for CDN optimizer header stripping');
    }

    if (metrics.summary.p95_verify_ms > 600) {
      recommendations.push('Optimize manifest caching and CDN distribution');
    }

    if (breakpoints.length > 0) {
      recommendations.push(`Address ${breakpoints.length} critical breakpoints affecting survival`);
    }

    if (metrics.summary.unique_routes < 3) {
      recommendations.push('Expand testing to additional route types (gallery, search, etc.)');
    }

    if (recommendations.length === 0) {
      recommendations.push('All targets met - prepare for paid conversion');
    }

    return recommendations;
  }
}

// Global metering instance
export const pilotMetering = new PilotMetering();
