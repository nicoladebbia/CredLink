/**
 * Weekly Report Generator - Phase 33 Reverse Lab
 * Generates comprehensive weekly survival reports with optimizer deltas
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import type { WeeklyReport, ProviderProfile, ChangeEvent } from '@/types/index.js';

export interface ReportConfig {
  outputDir: string;
  weekId: string;
  includeDetails: boolean;
  includeCharts: boolean;
  maxProfilesPerProvider: number;
  maxEventsPerProvider: number;
}

export interface ReportData {
  profiles: ProviderProfile[];
  changeEvents: ChangeEvent[];
  systemMetrics: {
    totalRequests: number;
    successRate: number;
    averageResponseTime: number;
    blockedRequests: number;
    rateLimitHits: number;
  };
  providerStats: Record<string, {
    profileCount: number;
    changeCount: number;
    lastProfileVersion: string;
    recommendation: string;
    confidence: number;
  }>;
}

export class WeeklyReportGenerator {
  private config: ReportConfig;

  constructor(config: ReportConfig) {
    this.config = config;
    
    // Ensure output directory exists
    if (!require('fs').existsSync(this.config.outputDir)) {
      mkdirSync(this.config.outputDir, { recursive: true });
    }
  }

  async generateReport(data: ReportData): Promise<WeeklyReport> {
    const report: WeeklyReport = {
      weekId: this.config.weekId,
      generatedAt: new Date().toISOString(),
      summary: this.generateSummary(data),
      optimizerDeltas: this.generateOptimizerDeltas(data),
      performanceMetrics: this.generatePerformanceMetrics(data),
    };

    // Save report
    await this.saveReport(report);

    // Generate additional formats
    if (this.config.includeDetails) {
      await this.generateDetailedReport(report, data);
    }

    if (this.config.includeCharts) {
      await this.generateCharts(report, data);
    }

    return report;
  }

  private generateSummary(data: ReportData): WeeklyReport['summary'] {
    const uniqueProviders = new Set(data.profiles.map(p => p.provider));
    const uniqueTransforms = new Set(data.profiles.flatMap(p => p.matrix.map(m => m.transform)));

    return {
      totalProviders: uniqueProviders.size,
      totalTransforms: uniqueTransforms.size,
      totalCases: data.profiles.reduce((sum, p) => sum + p.metadata.totalCases, 0),
      changeEvents: data.changeEvents.length,
      policyUpdates: data.changeEvents.filter(e => e.severity === 'critical' || e.severity === 'warning').length,
    };
  }

  private generateOptimizerDeltas(data: ReportData): WeeklyReport['optimizerDeltas'] {
    const deltas: WeeklyReport['optimizerDeltas'] = [];

    // Group change events by provider
    const eventsByProvider = new Map<string, ChangeEvent[]>();
    for (const event of data.changeEvents) {
      if (!eventsByProvider.has(event.providerId)) {
        eventsByProvider.set(event.providerId, []);
      }
      eventsByProvider.get(event.providerId)!.push(event);
    }

    // Generate delta for each provider with changes
    for (const [providerId, events] of eventsByProvider) {
      const providerStats = data.providerStats[providerId];
      if (!providerStats) continue;

      const latestProfile = data.profiles
        .filter(p => p.provider === providerId)
        .sort((a, b) => new Date(b.metadata.generatedAt).getTime() - new Date(a.metadata.generatedAt).getTime())[0];

      if (!latestProfile) continue;

      // Determine change type and impact
      const primaryEvent = events.sort((a, b) => {
        const severityOrder: Record<string, number> = { critical: 3, warning: 2, info: 1 };
        const aSeverity = severityOrder[a.severity] || 0;
        const bSeverity = severityOrder[b.severity] || 0;
        return bSeverity - aSeverity;
      })[0];

      if (!primaryEvent || !providerStats) continue;

      const delta = {
        provider: providerId,
        changeType: primaryEvent.changeType,
        description: this.generateChangeDescription(events, latestProfile),
        evidence: primaryEvent.evidence,
        docReferences: this.extractDocReferences(providerId, events),
        impact: this.generateImpactDescription(events, providerStats),
        ruleChanges: primaryEvent.proposedRuleDiff,
      };

      deltas.push(delta);
    }

    // Sort by severity and provider
    return deltas.sort((a, b) => {
      const severityOrder: Record<string, number> = { critical: 3, warning: 2, info: 1, behavior_flip: 2, header_drift: 1, manifest_loss: 3, manifest_gain: 2 };
      const aSeverity = severityOrder[a.changeType] || 0;
      const bSeverity = severityOrder[b.changeType] || 0;
      const severityDiff = bSeverity - aSeverity;
      if (severityDiff !== 0) return severityDiff;
      return a.provider.localeCompare(b.provider);
    });
  }

  private generateChangeDescription(events: ChangeEvent[], profile: ProviderProfile): string {
    const descriptions: string[] = [];

    for (const event of events) {
      switch (event.changeType) {
        case 'behavior_flip':
          descriptions.push(`Behavior flip detected in ${event.affectedTransforms.length} transforms`);
          break;
        case 'header_drift':
          descriptions.push(`Server header drift detected`);
          break;
        case 'manifest_loss':
          descriptions.push(`C2PA manifest loss detected`);
          break;
        case 'manifest_gain':
          descriptions.push(`C2PA manifest preservation detected`);
          break;
      }
    }

    const embedRate = (profile.matrix.filter(m => m.verify.embeddedManifest.present).length / profile.matrix.length * 100).toFixed(1);
    const remoteRate = (profile.matrix.filter(m => m.verify.remoteManifest.valid).length / profile.matrix.length * 100).toFixed(1);

    return `${descriptions.join('; ')}. Current embed survival: ${embedRate}%, remote survival: ${remoteRate}%`;
  }

  private extractDocReferences(providerId: string, _events: ChangeEvent[]): string[] {
    // This would extract actual documentation references
    // For now, return mock references based on provider
    const references: string[] = [];

    switch (providerId) {
      case 'cloudflare-images':
        references.push('https://developers.cloudflare.com/images/image-resizing/format-and-quality/');
        references.push('https://blog.cloudflare.com/announcing-support-for-c2pa-content-credentials/');
        break;
      case 'fastly-io':
        references.push('https://www.fastly.com/documentation/reference/io/');
        break;
      case 'akamai-ivm':
        references.push('https://techdocs.akamai.com/ivm/docs');
        break;
      case 'cloudinary':
        references.push('https://cloudinary.com/blog/content-authenticity-initiative-c2pa-support');
        break;
      case 'imgix':
        references.push('https://docs.imgix.com/apis/url/format/format');
        break;
    }

    return references;
  }

  private generateImpactDescription(events: ChangeEvent[], _stats: any): string {
    const totalTenants = events.reduce((sum, e) => sum + e.impact.affectedTenants, 0);
    const maxEmbedDrop = Math.max(...events.map(e => e.impact.embedSurvivalDrop));
    const hasRemoteImpact = events.some(e => e.impact.remoteSurvivalAffected);

    const impacts: string[] = [];

    if (totalTenants > 0) {
      impacts.push(`${totalTenants} tenants affected`);
    }

    if (maxEmbedDrop > 0) {
      impacts.push(`embed survival dropped ${(maxEmbedDrop * 100).toFixed(1)}%`);
    }

    if (hasRemoteImpact) {
      impacts.push('remote manifest survival affected');
    }

    return impacts.length > 0 ? impacts.join('; ') : 'Minimal impact detected';
  }

  private generatePerformanceMetrics(data: ReportData): WeeklyReport['performanceMetrics'] {
    return {
      averageResponseTime: data.systemMetrics.averageResponseTime,
      successRate: data.systemMetrics.successRate,
      blockedRequests: data.systemMetrics.blockedRequests,
      rateLimitHits: data.systemMetrics.rateLimitHits,
    };
  }

  private async saveReport(report: WeeklyReport): Promise<void> {
    const filename = `weekly-report-${report.weekId}.json`;
    const filepath = join(this.config.outputDir, filename);

    writeFileSync(filepath, JSON.stringify(report, null, 2));
    
    console.log(`📊 Weekly report saved: ${filepath}`);
  }

  private async generateDetailedReport(report: WeeklyReport, data: ReportData): Promise<void> {
    const detailed = {
      ...report,
      details: {
        profiles: data.profiles.map(p => ({
          provider: p.provider,
          version: p.versionHint.profileVersion,
          generatedAt: p.metadata.generatedAt,
          totalCases: p.metadata.totalCases,
          successRate: p.metadata.successRate,
          recommendation: p.policy.recommendation,
          confidence: p.policy.confidence,
          evidence: p.policy.evidence,
          matrixSummary: {
            embedSurvival: p.matrix.filter(m => m.verify.embeddedManifest.present).length,
            remoteSurvival: p.matrix.filter(m => m.verify.remoteManifest.valid).length,
            totalTransforms: p.matrix.length,
          },
        })),
        changeEvents: data.changeEvents.map(e => ({
          id: e.id,
          providerId: e.providerId,
          changeType: e.changeType,
          severity: e.severity,
          detectedAt: e.detectedAt,
          affectedTransforms: e.affectedTransforms,
          evidence: e.evidence,
          impact: e.impact,
        })),
        providerStats: data.providerStats,
      },
    };

    const filename = `weekly-report-${report.weekId}-detailed.json`;
    const filepath = join(this.config.outputDir, filename);

    writeFileSync(filepath, JSON.stringify(detailed, null, 2));
    
    console.log(`📄 Detailed report saved: ${filepath}`);
  }

  private async generateCharts(report: WeeklyReport, data: ReportData): Promise<void> {
    // Generate chart data for visualization
    const chartData = {
      weekId: report.weekId,
      generatedAt: report.generatedAt,
      charts: {
        providerPerformance: this.generateProviderPerformanceChart(data),
        changeEventTimeline: this.generateChangeEventTimeline(data),
        survivalRates: this.generateSurvivalRatesChart(data),
        severityDistribution: this.generateSeverityDistribution(data),
      },
    };

    const filename = `weekly-report-${report.weekId}-charts.json`;
    const filepath = join(this.config.outputDir, filename);

    writeFileSync(filepath, JSON.stringify(chartData, null, 2));
    
    console.log(`📈 Chart data saved: ${filepath}`);
  }

  private generateProviderPerformanceChart(data: ReportData): any {
    const performance: Record<string, any> = {};

    for (const profile of data.profiles) {
      if (!performance[profile.provider]) {
        performance[profile.provider] = {
          profiles: [],
          averageSuccessRate: 0,
          averageConfidence: 0,
        };
      }

      performance[profile.provider].profiles.push({
        version: profile.versionHint.profileVersion,
        generatedAt: profile.metadata.generatedAt,
        successRate: profile.metadata.successRate,
        confidence: profile.policy.confidence,
        recommendation: profile.policy.recommendation,
      });
    }

    // Calculate averages
    for (const provider of Object.keys(performance)) {
      const profiles = performance[provider].profiles;
      performance[provider].averageSuccessRate = profiles.reduce((sum: number, p: any) => sum + p.successRate, 0) / profiles.length;
      performance[provider].averageConfidence = profiles.reduce((sum: number, p: any) => sum + p.confidence, 0) / profiles.length;
    }

    return performance;
  }

  private generateChangeEventTimeline(data: ReportData): any {
    const timeline = data.changeEvents.map(event => ({
      providerId: event.providerId,
      changeType: event.changeType,
      severity: event.severity,
      detectedAt: event.detectedAt,
      affectedTransforms: event.affectedTransforms.length,
    }));

    return timeline.sort((a, b) => new Date(a.detectedAt).getTime() - new Date(b.detectedAt).getTime());
  }

  private generateSurvivalRatesChart(data: ReportData): any {
    const survival: Record<string, any> = {};

    for (const profile of data.profiles) {
      if (!survival[profile.provider]) {
        survival[profile.provider] = [];
      }

      const embedRate = profile.matrix.filter(m => m.verify.embeddedManifest.present).length / profile.matrix.length;
      const remoteRate = profile.matrix.filter(m => m.verify.remoteManifest.valid).length / profile.matrix.length;

      survival[profile.provider].push({
        version: profile.versionHint.profileVersion,
        generatedAt: profile.metadata.generatedAt,
        embedSurvivalRate: embedRate,
        remoteSurvivalRate: remoteRate,
        totalCases: profile.metadata.totalCases,
      });
    }

    return survival;
  }

  private generateSeverityDistribution(data: ReportData): any {
    const distribution = {
      critical: 0,
      warning: 0,
      info: 0,
    };

    for (const event of data.changeEvents) {
      distribution[event.severity]++;
    }

    return distribution;
  }

  async generateMarkdownReport(report: WeeklyReport, data: ReportData): Promise<void> {
    const markdown = this.buildMarkdownReport(report, data);
    
    const filename = `weekly-report-${report.weekId}.md`;
    const filepath = join(this.config.outputDir, filename);

    writeFileSync(filepath, markdown);
    
    console.log(`📝 Markdown report saved: ${filepath}`);
  }

  private buildMarkdownReport(report: WeeklyReport, data: ReportData): string {
    const md = [];

    // Header
    md.push('# C2PA Reverse Lab - Weekly Survival Report');
    md.push(`**Week:** ${report.weekId}`);
    md.push(`**Generated:** ${new Date(report.generatedAt).toLocaleString()}`);
    md.push('');

    // Executive Summary
    md.push('## 📊 Executive Summary');
    md.push('');
    md.push(`- **Providers Monitored:** ${report.summary.totalProviders}`);
    md.push(`- **Transforms Tested:** ${report.summary.totalTransforms}`);
    md.push(`- **Total Test Cases:** ${report.summary.totalCases.toLocaleString()}`);
    md.push(`- **Change Events Detected:** ${report.summary.changeEvents}`);
    md.push(`- **Policy Updates Required:** ${report.summary.policyUpdates}`);
    md.push('');

    // Performance Metrics
    md.push('## ⚡ Performance Metrics');
    md.push('');
    md.push(`- **Average Response Time:** ${report.performanceMetrics.averageResponseTime.toFixed(0)}ms`);
    md.push(`- **Success Rate:** ${(report.performanceMetrics.successRate * 100).toFixed(1)}%`);
    md.push(`- **Blocked Requests:** ${report.performanceMetrics.blockedRequests.toLocaleString()}`);
    md.push(`- **Rate Limit Hits:** ${report.performanceMetrics.rateLimitHits.toLocaleString()}`);
    md.push('');

    // Optimizer Deltas
    if (report.optimizerDeltas.length > 0) {
      md.push('## 🚨 Optimizer Behavior Deltas');
      md.push('');

      for (const delta of report.optimizerDeltas) {
        const severityEmoji = {
          critical: '🔴',
          warning: '🟡',
          info: '🔵',
          behavior_flip: '🟡',
          header_drift: '🔵',
          manifest_loss: '🔴',
          manifest_gain: '🟢',
        }[delta.changeType] || '⚪';

        md.push(`### ${severityEmoji} ${delta.provider}`);
        md.push('');
        md.push(`**Change Type:** ${delta.changeType}`);
        md.push(`**Description:** ${delta.description}`);
        md.push(`**Impact:** ${delta.impact}`);
        md.push('');

        if (delta.evidence.length > 0) {
          md.push('**Evidence:**');
          for (const evidence of delta.evidence) {
            md.push(`- ${evidence}`);
          }
          md.push('');
        }

        if (delta.docReferences.length > 0) {
          md.push('**Documentation References:**');
          for (const ref of delta.docReferences) {
            md.push(`- [${new URL(ref).hostname}](${ref})`);
          }
          md.push('');
        }

        md.push('---');
        md.push('');
      }
    } else {
      md.push('## ✅ No Optimizer Behavior Changes Detected');
      md.push('');
      md.push('All monitored providers maintained consistent behavior patterns this week.');
      md.push('');
    }

    // Provider Status
    md.push('## 📈 Provider Status Summary');
    md.push('');
    md.push('| Provider | Latest Profile | Recommendation | Confidence | Changes |');
    md.push('|----------|----------------|----------------|------------|---------|');

    for (const [providerId, stats] of Object.entries(data.providerStats)) {
      const changeCount = data.changeEvents.filter(e => e.providerId === providerId).length;
      const changeIndicator = changeCount > 0 ? `🔴 ${changeCount}` : '✅';
      
      md.push(`| ${providerId} | ${stats.lastProfileVersion} | ${stats.recommendation} | ${(stats.confidence * 100).toFixed(1)}% | ${changeIndicator} |`);
    }
    md.push('');

    // Footer
    md.push('---');
    md.push('');
    md.push('*Generated by C2PA Reverse Lab v1.1.0*');
    md.push('*For detailed data, see the accompanying JSON reports*');

    return md.join('\n');
  }

  getReportHash(report: WeeklyReport): string {
    const data = JSON.stringify({
      weekId: report.weekId,
      summary: report.summary,
      optimizerDeltas: report.optimizerDeltas.map(d => ({
        provider: d.provider,
        changeType: d.changeType,
        severity: d.changeType,
      })),
    });

    return createHash('sha256').update(data).digest('hex').substring(0, 16);
  }
}
