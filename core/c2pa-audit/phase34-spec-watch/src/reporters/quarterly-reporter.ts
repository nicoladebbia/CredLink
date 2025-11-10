/**
 * Quarterly Report Generator - Phase 34 Spec Watch
 * Generates customer-facing quarterly spec watch reports
 */

import { writeFile } from 'fs/promises';
import { join } from 'path';
import { format, endOfQuarter, startOfQuarter, isAfter, isBefore } from 'date-fns';
import type { QuarterlyReport, SpecChange, GauntletResult } from '@/types';

export interface QuarterlyReporterConfig {
  output_dir: string;
  template_dir: string;
  delivery_day: number; // Day of month for delivery
  recipients: string[];
  auto_email: boolean;
  email_config?: {
    smtp_host: string;
    smtp_port: number;
    username: string;
    password: string;
    from_address: string;
  };
}

export class QuarterlyReporter {
  private config: QuarterlyReporterConfig;

  constructor(config: QuarterlyReporterConfig) {
    this.config = config;
  }

  /**
   * Generates quarterly report for a specific quarter
   */
  async generateQuarterlyReport(
    quarter: string,
    changes: SpecChange[],
    gauntletResults: GauntletResult[],
    upstreamContributions: { id: string; title: string; url: string; date: string }[] = []
  ): Promise<QuarterlyReport> {
    const reportId = `quarterly-report-${quarter}-${Date.now()}`;
    const generatedAt = new Date().toISOString();

    // Filter changes for the quarter
    const quarterChanges = this.filterChangesByQuarter(changes, quarter);
    
    // Analyze impact
    const impactAnalysis = this.analyzeImpact(quarterChanges, gauntletResults);
    
    // Generate customer actions
    const customerActions = this.generateCustomerActions(impactAnalysis);
    
    // Compile SDK changes
    const sdkChanges = this.compileSdkChanges(changes);

    const report: QuarterlyReport = {
      id: reportId,
      quarter,
      generated_at: generatedAt,
      summary: {
        total_changes: quarterChanges.length,
        critical_changes: quarterChanges.filter(c => c.severity === 'critical').length,
        gauntlet_runs: gauntletResults.length,
        upstream_contributions: upstreamContributions.length,
      },
      sections: {
        what_changed: this.generateWhatChanged(quarterChanges),
        impact_analysis: impactAnalysis,
        our_response: this.generateOurResponse(quarterChanges, gauntletResults),
        customer_actions: customerActions,
      },
      appendix: {
        sdk_changes: sdkChanges,
        conformance_news: this.extractConformanceNews(changes),
      },
    };

    // Save report
    await this.saveReport(report);

    // Send email if enabled
    if (this.config.auto_email) {
      await this.sendReportEmail(report);
    }

    return report;
  }

  /**
   * Filters changes by quarter
   */
  private filterChangesByQuarter(changes: SpecChange[], quarter: string): SpecChange[] {
    const [year, quarterNum] = quarter.split('-Q').map(Number);
    if (!year || !quarterNum) {
      throw new Error(`Invalid quarter format: ${quarter}`);
    }
    const quarterStart = startOfQuarter(new Date(year, (quarterNum - 1) * 3, 1));
    const quarterEnd = endOfQuarter(quarterStart);

    return changes.filter(change => {
      const changeDate = new Date(change.detected_at);
      return isAfter(changeDate, quarterStart) && isBefore(changeDate, quarterEnd);
    });
  }

  /**
   * Generates "What Changed" section
   */
  private generateWhatChanged(changes: SpecChange[]): any[] {
    return changes.map(change => {
      const specRefs = change.spec_references.map(ref => ref.url);
      
      return {
        title: change.title,
        description: change.description,
        spec_refs: specRefs,
        impact: this.assessChangeImpact(change),
      };
    });
  }

  /**
   * Analyzes impact of changes
   */
  private analyzeImpact(changes: SpecChange[], gauntletResults: GauntletResult[]): any[] {
    const impacts: any[] = [];

    // Discovery impact
    const discoveryChanges = changes.filter(c => 
      c.sections.some(s => s.new_content?.toLowerCase().includes('discovery'))
    );
    
    if (discoveryChanges.length > 0) {
      impacts.push({
        area: 'discovery',
        effect: `${discoveryChanges.length} changes to manifest discovery rules detected`,
        mitigation: 'Updated discovery algorithms to handle new precedence rules',
      });
    }

    // Remote manifest impact
    const remoteChanges = changes.filter(c => 
      c.sections.some(s => s.new_content?.toLowerCase().includes('remote'))
    );
    
    if (remoteChanges.length > 0) {
      impacts.push({
        area: 'remote_manifest',
        effect: 'Remote manifest durability requirements updated',
        mitigation: 'Enhanced remote manifest fetching and validation logic',
      });
    }

    // Video semantics impact
    const videoChanges = changes.filter(c => 
      c.sections.some(s => s.new_content?.toLowerCase().includes('video'))
    );
    
    if (videoChanges.length > 0) {
      impacts.push({
        area: 'video_semantics',
        effect: 'Video label and player compatibility requirements changed',
        mitigation: 'Updated video processing pipeline to support new semantics',
      });
    }

    // Security impact
    const securityChanges = changes.filter(c => 
      c.sections.some(s => s.new_content?.toLowerCase().includes('security'))
    );
    
    if (securityChanges.length > 0) {
      impacts.push({
        area: 'security',
        effect: 'Security validation requirements strengthened',
        mitigation: 'Implemented enhanced validation and replay protection',
      });
    }

    // Gauntlet impact
    const failedGauntletRuns = gauntletResults.filter(r => r.status === 'failed');
    
    if (failedGauntletRuns.length > 0) {
      impacts.push({
        area: 'compliance',
        effect: `${failedGauntletRuns.length} gauntlet runs failed, indicating implementation gaps`,
        mitigation: 'Updated validation rules and test vectors to ensure compliance',
      });
    }

    return impacts;
  }

  /**
   * Generates "Our Response" section
   */
  private generateOurResponse(changes: SpecChange[], gauntletResults: GauntletResult[]): any[] {
    const responses: any[] = [];

    // Critical changes response
    const criticalChanges = changes.filter(c => c.severity === 'critical');
    if (criticalChanges.length > 0) {
      responses.push({
        action: 'Immediate specification clarification and implementation updates',
        status: 'completed',
        timeline: 'Within 24 hours of detection',
      });
    }

    // High severity changes response
    const highChanges = changes.filter(c => c.severity === 'high');
    if (highChanges.length > 0) {
      responses.push({
        action: 'Updated validation rules and test vectors',
        status: 'completed',
        timeline: 'Within 3 business days',
      });
    }

    // Gauntlet failures response
    const failedRuns = gauntletResults.filter(r => r.status === 'failed');
    if (failedRuns.length > 0) {
      responses.push({
        action: 'Enhanced test coverage and fixed implementation gaps',
        status: 'in_progress',
        timeline: 'Within 5 business days',
      });
    }

    // Upstream contributions
    responses.push({
      action: 'Submitted upstream contributions for specification improvements',
      status: 'completed',
      timeline: 'Ongoing throughout quarter',
    });

    return responses;
  }

  /**
   * Generates customer action items
   */
  private generateCustomerActions(impactAnalysis: any[]): any[] {
    const actions: any[] = [];

    impactAnalysis.forEach(impact => {
      switch (impact.area) {
        case 'discovery':
          actions.push({
            action: 'Update manifest discovery logic to handle new precedence rules',
            priority: 'required',
            deadline: 'Within 30 days',
          });
          break;

        case 'remote_manifest':
          actions.push({
            action: 'Enable remote manifest header support in your C2PA implementation',
            priority: 'recommended',
            deadline: 'Within 60 days',
          });
          break;

        case 'video_semantics':
          actions.push({
            action: 'Update video players to support new label semantics',
            priority: 'recommended',
            deadline: 'Within 90 days',
          });
          break;

        case 'security':
          actions.push({
            action: 'Rotate cryptographic keys and update validation lifetime settings',
            priority: 'required',
            deadline: 'Within 14 days',
          });
          break;

        case 'compliance':
          actions.push({
            action: 'Run updated conformance tests and validate manifest survival',
            priority: 'required',
            deadline: 'Within 45 days',
          });
          break;
      }
    });

    // Add general maintenance action
    actions.push({
      action: 'No immediate action required - monitoring for further changes',
      priority: 'optional',
    });

    return actions;
  }

  /**
   * Compiles SDK changes from upstream
   */
  private compileSdkChanges(changes: SpecChange[]): any[] {
    const sdkTargets = ['c2patool-changelog', 'rust-sdk-releases', 'cai-verify-changelog'];
    
    return sdkTargets.map(target => {
      const targetChanges = changes.filter(c => c.target_id === target);
      
      return {
        sdk: target.replace('-changelog', '').replace('-releases', ''),
        version: this.extractLatestVersion(targetChanges),
        breaking_changes: targetChanges.some(c => c.severity === 'critical' || c.severity === 'high'),
        api_diffs: targetChanges.length > 0 ? 'See attached changelog' : undefined,
      };
    }).filter(sdk => sdk.version !== 'unknown');
  }

  /**
   * Extracts conformance news from changes
   */
  private extractConformanceNews(changes: SpecChange[]): any[] {
    const conformanceChanges = changes.filter(c => c.target_id === 'conformance-news');
    
    return conformanceChanges.map(change => ({
      title: change.title,
      url: 'https://contentauthenticity.org/news',
      impact: this.assessChangeImpact(change),
    }));
  }

  /**
   * Assesses impact level of a change
   */
  private assessChangeImpact(change: SpecChange): string {
    switch (change.severity) {
      case 'critical':
        return 'Critical - immediate action required';
      case 'high':
        return 'High - significant implementation impact';
      case 'medium':
        return 'Medium - moderate changes needed';
      case 'low':
        return 'Low - minor updates or clarifications';
      default:
        return 'Unknown - requires investigation';
    }
  }

  /**
   * Extracts latest version from changes
   */
  private extractLatestVersion(changes: SpecChange[]): string {
    if (changes.length === 0) return 'unknown';
    
    // Look for version patterns in change content
    const versionRegex = /v?(\d+\.\d+\.\d+)/g;
    
    for (const change of changes) {
      const content = change.sections.map(s => s.new_content).join(' ');
      const matches = content.match(versionRegex);
      if (matches) {
        return matches[0];
      }
    }
    
    return 'unknown';
  }

  /**
   * Saves report to file
   */
  private async saveReport(report: QuarterlyReport): Promise<void> {
    const filename = `C2PA-Spec-Watch-Report-${report.quarter}.md`;
    const filepath = join(this.config.output_dir, filename);
    
    const markdown = this.formatReportAsMarkdown(report);
    await writeFile(filepath, markdown);

    // Also save as JSON
    const jsonFilepath = join(this.config.output_dir, `C2PA-Spec-Watch-Report-${report.quarter}.json`);
    await writeFile(jsonFilepath, JSON.stringify(report, null, 2));
  }

  /**
   * Formats report as Markdown
   */
  private formatReportAsMarkdown(report: QuarterlyReport): string {
    const generatedDate = format(new Date(report.generated_at), 'MMMM dd, yyyy');
    
    return `# C2PA Specification Watch Report - ${report.quarter}

**Generated:** ${generatedDate}  
**Report ID:** ${report.id}

## Executive Summary

This quarter we detected **${report.summary.total_changes}** specification changes, with **${report.summary.critical_changes}** critical items requiring immediate attention. Our gauntlet testing ran **${report.summary.gauntlet_runs}** times to validate implementation compliance, and we contributed **${report.summary.upstream_contributions}** improvements to the upstream specification.

## What Changed

${report.sections.what_changed.map(change => `
### ${change.title}

${change.description}

**Impact:** ${change.impact}

**Specification References:**
${change.spec_refs.map(ref => `- [${ref}](${ref})`).join('\n')}
`).join('\n')}

## Impact Analysis

${report.sections.impact_analysis.map(impact => `
### ${impact.area.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}

**Effect:** ${impact.effect}

**Mitigation:** ${impact.mitigation}
`).join('\n')}

## Our Response

${report.sections.our_response.map(response => `
### ${response.action}

- **Status:** ${response.status}
- **Timeline:** ${response.timeline}
`).join('\n')}

## What You Should Do

${report.sections.customer_actions.map(action => `
### ${action.priority.toUpperCase()}: ${action.action}

${action.deadline ? `**Deadline:** ${action.deadline}` : ''}
`).join('\n')}

## Appendix

### SDK/Tool Changes

${report.appendix.sdk_changes.map(sdk => `
#### ${sdk.sdk}

- **Version:** ${sdk.version}
- **Breaking Changes:** ${sdk.breaking_changes ? 'Yes' : 'No'}
${sdk.api_diffs ? `- **API Differences:** ${sdk.api_diffs}` : ''}
`).join('\n')}

### Conformance News

${report.appendix.conformance_news.map(news => `
#### ${news.title}

**Impact:** ${news.impact}
**URL:** ${news.url}
`).join('\n')}

---

*This report is generated by the C2PA Spec Watch System v1.1.0, which continuously monitors the C2PA specification, guidance documents, and upstream tool changes to ensure implementation stability and compliance.*

For questions or additional information, contact the C2PA Audit Team.
`;
  }

  /**
   * Sends report via email
   */
  private async sendReportEmail(_report: QuarterlyReport): Promise<void> {
    if (!this.config.email_config) {
      console.log('Email configuration not provided, skipping email delivery');
      return;
    }

    // This would integrate with an email service like nodemailer
    console.log(`Email delivery not implemented - would send to ${this.config.recipients.join(', ')}`);
  }

  /**
   * Gets the next quarterly report due date
   */
  getNextReportDueDate(): Date {
    const now = new Date();
    const quarterEnd = endOfQuarter(now);
    const deliveryDate = new Date(quarterEnd.getFullYear(), quarterEnd.getMonth(), this.config.delivery_day);
    
    // If delivery day has passed this quarter, schedule for next quarter
    if (isAfter(now, deliveryDate)) {
      const nextQuarter = new Date(quarterEnd);
      nextQuarter.setMonth(nextQuarter.getMonth() + 1);
      return endOfQuarter(nextQuarter);
    }
    
    return deliveryDate;
  }

  /**
   * Checks if quarterly report is due
   */
  isReportDue(): boolean {
    const now = new Date();
    const dueDate = this.getNextReportDueDate();
    const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    return daysUntilDue <= 7; // Due within 7 days
  }
}
