# Quality Bar & Performance Badges

## Probation System

### Provisional Status (First 60 Days)
```javascript
class ProbationManager {
  async activateProbation(partnerId) {
    const probation = {
      partnerId,
      status: 'provisional',
      startedAt: new Date(),
      endsAt: this.calculateProbationEnd(),
      requirements: {
        ttiThreshold: this.getTTIThreshold(partnerId.certificationTrack),
        minInstalls: 3,
        survivalRate: 0.999,
        responseTime: this.getResponseTimeSLA(partnerId.certificationTrack)
      },
      badges: 'gray', // All badges grayed out during probation
      monitoring: {
        dailyChecks: true,
        weeklyReports: true,
        realTimeAlerts: true
      }
    };
    
    await this.saveProbation(probation);
    await this.updateDirectoryStatus(partnerId, 'provisional');
    await this.notifyProbationStart(partnerId);
    
    return probation;
  }
  
  getTTIThreshold(track) {
    const thresholds = {
      installer: 15 * 60 * 1000,  // 15 minutes
      auditor: 4 * 60 * 60 * 1000,  // 4 hours
      enterprise: 24 * 60 * 60 * 1000  // 24 hours
    };
    return thresholds[track] || thresholds.installer;
  }
  
  async evaluateProbationPerformance(partnerId) {
    const probation = await this.getActiveProbation(partnerId);
    const metrics = await this.getPerformanceMetrics(partnerId);
    
    const evaluation = {
      passed: true,
      issues: [],
      recommendations: []
    };
    
    // Check TTI compliance
    if (metrics.avgTTI > probation.requirements.ttiThreshold) {
      evaluation.passed = false;
      evaluation.issues.push(`TTI exceeds threshold: ${metrics.avgTTI}ms > ${probation.requirements.ttiThreshold}ms`);
      evaluation.recommendations.push('Optimize installation process or upgrade infrastructure');
    }
    
    // Check minimum installs
    if (metrics.totalInstalls < probation.requirements.minInstalls) {
      evaluation.passed = false;
      evaluation.issues.push(`Insufficient installations: ${metrics.totalInstalls} < ${probation.requirements.minInstalls}`);
      evaluation.recommendations.push('Complete required certification installations');
    }
    
    // Check survival rate
    if (metrics.survivalRate < probation.requirements.survivalRate) {
      evaluation.passed = false;
      evaluation.issues.push(`Survival rate below threshold: ${(metrics.survivalRate * 100).toFixed(3)}% < 99.9%`);
      evaluation.recommendations.push('Review manifest configuration and testing procedures');
    }
    
    // Check response time SLA
    if (metrics.avgResponseTime > probation.requirements.responseTime) {
      evaluation.passed = false;
      evaluation.issues.push(`Response time SLA breach: ${metrics.avgResponseTime}ms > ${probation.requirements.responseTime}ms`);
      evaluation.recommendations.push('Improve support response procedures');
    }
    
    await this.updateProbationEvaluation(partnerId, evaluation);
    
    return evaluation;
  }
  
  async completeProbation(partnerId) {
    const evaluation = await this.evaluateProbationPerformance(partnerId);
    
    if (evaluation.passed) {
      await this.grantFullCertification(partnerId);
      await this.activateBadges(partnerId);
      await this.updateDirectoryStatus(partnerId, 'active');
      await this.notifyProbationSuccess(partnerId);
    } else {
      await this.extendProbation(partnerId, 30); // 30 day extension
      await this.notifyProbationFailure(partnerId, evaluation);
    }
  }
}
```

### Performance Monitoring During Probation
```javascript
class ProbationMonitor {
  async startMonitoring(partnerId) {
    const monitor = {
      partnerId,
      checks: {
        daily: this.scheduleDailyChecks(partnerId),
        weekly: this.scheduleWeeklyReports(partnerId),
        realTime: this.enableRealTimeAlerts(partnerId)
      },
      thresholds: await this.getProbationThresholds(partnerId),
      alerts: {
        email: true,
        sms: false,
        webhook: true
      }
    };
    
    await this.saveMonitoringConfig(monitor);
    return monitor;
  }
  
  async performDailyCheck(partnerId) {
    const metrics = await this.getDailyMetrics(partnerId);
    const thresholds = await this.getProbationThresholds(partnerId);
    
    const alerts = [];
    
    // TTI check
    if (metrics.tti > thresholds.tti) {
      alerts.push({
        type: 'tti_breach',
        severity: 'warning',
        message: `Daily TTI exceeded threshold: ${metrics.tti}ms`,
        recommendation: 'Monitor installation performance trends'
      });
    }
    
    // Survival rate check
    if (metrics.survivalRate < thresholds.survivalRate) {
      alerts.push({
        type: 'survival_drop',
        severity: 'critical',
        message: `Survival rate dropped: ${(metrics.survivalRate * 100).toFixed(3)}%`,
        recommendation: 'Immediate review of manifest configuration required'
      });
    }
    
    if (alerts.length > 0) {
      await this.sendProbationAlerts(partnerId, alerts);
    }
    
    return { metrics, alerts };
  }
}
```

## Performance Badge System

### Fast Installer Badge
```javascript
class FastInstallerBadge {
  static requirements = {
    p50TTI: 20 * 60 * 1000,  // 20 minutes
    p95TTI: 45 * 60 * 1000,  // 45 minutes
    minInstalls: 10,
    track: ['installer', 'auditor'],
    period: '30d'
  };
  
  async evaluateEligibility(partnerId) {
    const metrics = await this.getTTIMetrics(partnerId, this.requirements.period);
    
    const eligibility = {
      qualified: true,
      criteria: {},
      nextCheck: new Date(Date.now() + (24 * 60 * 60 * 1000)) // 24 hours
    };
    
    // Check p50 TTI
    eligibility.criteria.p50TTI = {
      current: metrics.p50,
      threshold: this.requirements.p50TTI,
      passed: metrics.p50 <= this.requirements.p50TTI
    };
    
    // Check p95 TTI
    eligibility.criteria.p95TTI = {
      current: metrics.p95,
      threshold: this.requirements.p95TTI,
      passed: metrics.p95 <= this.requirements.p95TTI
    };
    
    // Check minimum installs
    eligibility.criteria.minInstalls = {
      current: metrics.totalInstalls,
      threshold: this.requirements.minInstalls,
      passed: metrics.totalInstalls >= this.requirements.minInstalls
    };
    
    // Overall qualification
    eligibility.qualified = Object.values(eligibility.criteria).every(c => c.passed);
    
    if (eligibility.qualified) {
      await this.awardBadge(partnerId, 'fast-installer');
    } else {
      await this.removeBadge(partnerId, 'fast-installer');
    }
    
    return eligibility;
  }
  
  async generateBadgeSVG(partnerId) {
    const metrics = await this.getCurrentMetrics(partnerId);
    
    return `
      <svg width="120" height="40" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="fastGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style="stop-color:#00C853;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#00E676;stop-opacity:1" />
          </linearGradient>
        </defs>
        <rect width="120" height="40" rx="6" fill="url(#fastGradient)"/>
        <text x="60" y="16" font-family="Arial, sans-serif" font-size="10" fill="white" text-anchor="middle" font-weight="bold">FAST</text>
        <text x="60" y="28" font-family="Arial, sans-serif" font-size="8" fill="white" text-anchor="middle">INSTALLER</text>
        <text x="60" y="36" font-family="Arial, sans-serif" font-size="6" fill="white" text-anchor="middle">${Math.round(metrics.p50 / 60000)}m TTI</text>
      </svg>
    `;
  }
}
```

### Compliance Pro Badge
```javascript
class ComplianceProBadge {
  static requirements = {
    evidencePackExports: 3,
    validationScore: 0.95,
    auditPassRate: 1.0,
    period: '90d'
  };
  
  async evaluateEligibility(partnerId) {
    const compliance = await this.getComplianceMetrics(partnerId, this.requirements.period);
    
    const eligibility = {
      qualified: true,
      criteria: {},
      evidence: []
    };
    
    // Check evidence pack exports
    const evidencePacks = await this.getValidatedEvidencePacks(partnerId);
    eligibility.criteria.evidencePackExports = {
      current: evidencePacks.length,
      threshold: this.requirements.evidencePackExports,
      passed: evidencePacks.length >= this.requirements.evidencePackExports,
      evidence: evidencePacks.map(pack => ({
        id: pack.id,
        validatedAt: pack.validatedAt,
        score: pack.validationScore
      }))
    };
    
    // Check validation scores
    const avgValidationScore = evidencePacks.reduce((sum, pack) => sum + pack.validationScore, 0) / evidencePacks.length;
    eligibility.criteria.validationScore = {
      current: avgValidationScore,
      threshold: this.requirements.validationScore,
      passed: avgValidationScore >= this.requirements.validationScore
    };
    
    // Check audit pass rate
    const audits = await this.getRecentAudits(partnerId);
    const passRate = audits.filter(audit => audit.status === 'passed').length / audits.length;
    eligibility.criteria.auditPassRate = {
      current: passRate,
      threshold: this.requirements.auditPassRate,
      passed: passRate >= this.requirements.auditPassRate
    };
    
    eligibility.qualified = Object.values(eligibility.criteria).every(c => c.passed);
    
    if (eligibility.qualified) {
      await this.awardBadge(partnerId, 'compliance-pro');
    }
    
    return eligibility;
  }
  
  async generateBadgeSVG(partnerId) {
    const evidenceCount = await this.getValidatedEvidencePackCount(partnerId);
    
    return `
      <svg width="120" height="40" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="complianceGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style="stop-color:#1976D2;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#2196F3;stop-opacity:1" />
          </linearGradient>
        </defs>
        <rect width="120" height="40" rx="6" fill="url(#complianceGradient)"/>
        <text x="60" y="16" font-family="Arial, sans-serif" font-size="10" fill="white" text-anchor="middle" font-weight="bold">COMPLIANCE</text>
        <text x="60" y="28" font-family="Arial, sans-serif" font-size="8" fill="white" text-anchor="middle">PRO</text>
        <text x="60" y="36" font-family="Arial, sans-serif" font-size="6" fill="white" text-anchor="middle">${evidenceCount} Evidence Packs</text>
      </svg>
    `;
  }
}
```

### Five-Star NPS Badge
```javascript
class FiveStarNPSBadge {
  static requirements = {
    npsScore: 60,
    minResponses: 10,
    period: '90d',
    consistency: 2 // Number of consecutive quarters
  };
  
  async evaluateEligibility(partnerId) {
    const npsData = await this.getNPSHistory(partnerId, this.requirements.period);
    
    const eligibility = {
      qualified: true,
      criteria: {},
      trend: []
    };
    
    // Check current NPS score
    const currentNPS = this.calculateNPS(npsData.current.responses);
    eligibility.criteria.currentNPS = {
      current: currentNPS,
      threshold: this.requirements.npsScore,
      passed: currentNPS >= this.requirements.npsScore,
      responseCount: npsData.current.responses.length
    };
    
    // Check minimum responses
    eligibility.criteria.minResponses = {
      current: npsData.current.responses.length,
      threshold: this.requirements.minResponses,
      passed: npsData.current.responses.length >= this.requirements.minResponses
    };
    
    // Check consistency (consecutive quarters)
    const qualifyingQuarters = npsData.quarterly.filter(quarter => 
      quarter.nps >= this.requirements.npsScore && 
      quarter.responses.length >= this.requirements.minResponses
    );
    
    eligibility.criteria.consistency = {
      current: qualifyingQuarters.length,
      threshold: this.requirements.consistency,
      passed: qualifyingQuarters.length >= this.requirements.consistency,
      quarters: qualifyingQuarters.map(q => ({
        period: q.period,
        nps: q.nps,
        responses: q.responses.length
      }))
    };
    
    eligibility.qualified = Object.values(eligibility.criteria).every(c => c.passed);
    
    if (eligibility.qualified) {
      await this.awardBadge(partnerId, 'five-star-nps');
    }
    
    return eligibility;
  }
  
  calculateNPS(responses) {
    if (responses.length === 0) return 0;
    
    const promoters = responses.filter(r => r.score >= 9).length;
    const detractors = responses.filter(r => r.score <= 6).length;
    const total = responses.length;
    
    const promoterPercentage = (promoters / total) * 100;
    const detractorPercentage = (detractors / total) * 100;
    
    return Math.round(promoterPercentage - detractorPercentage);
  }
  
  async generateBadgeSVG(partnerId) {
    const currentNPS = await this.getCurrentNPS(partnerId);
    const stars = this.generateStars(currentNPS);
    
    return `
      <svg width="120" height="40" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="npsGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style="stop-color:#FF6F00;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#FFB300;stop-opacity:1" />
          </linearGradient>
        </defs>
        <rect width="120" height="40" rx="6" fill="url(#npsGradient)"/>
        <text x="60" y="16" font-family="Arial, sans-serif" font-size="10" fill="white" text-anchor="middle" font-weight="bold">5-STAR</text>
        <text x="60" y="28" font-family="Arial, sans-serif" font-size="8" fill="white" text-anchor="middle">NPS</text>
        <text x="60" y="36" font-family="Arial, sans-serif" font-size="6" fill="white" text-anchor="middle">${stars} ${currentNPS}</text>
      </svg>
    `;
  }
  
  generateStars(npsScore) {
    if (npsScore >= 70) return '★★★★★';
    if (npsScore >= 50) return '★★★★☆';
    if (npsScore >= 30) return '★★★☆☆';
    if (npsScore >= 10) return '★★☆☆☆';
    return '★☆☆☆☆';
  }
}
```

## Performance Badge Engine

### Badge Management System
```javascript
class PerformanceBadgeEngine {
  constructor() {
    this.badgeTypes = {
      'fast-installer': FastInstallerBadge,
      'compliance-pro': ComplianceProBadge,
      'five-star-nps': FiveStarNPSBadge
    };
    this.evaluationSchedule = '0 2 * * *'; // Daily at 2 AM
  }
  
  async evaluateAllBadges(partnerId) {
    const results = {};
    
    for (const [badgeType, BadgeClass] of Object.entries(this.badgeTypes)) {
      try {
        const badge = new BadgeClass();
        results[badgeType] = await badge.evaluateEligibility(partnerId);
      } catch (error) {
        console.error(`Failed to evaluate ${badgeType} for partner ${partnerId}:`, error);
        results[badgeType] = { qualified: false, error: error.message };
      }
    }
    
    await this.updatePartnerBadges(partnerId, results);
    await this.notifyBadgeChanges(partnerId, results);
    
    return results;
  }
  
  async awardBadge(partnerId, badgeType) {
    const badge = {
      id: this.generateBadgeId(),
      partnerId,
      type: badgeType,
      awardedAt: new Date(),
      status: 'active',
      svgUrl: await this.generateBadgeSVG(partnerId, badgeType)
    };
    
    await this.saveBadge(badge);
    await this.updateDirectoryBadges(partnerId);
    
    return badge;
  }
  
  async removeBadge(partnerId, badgeType) {
    await this.deactivateBadge(partnerId, badgeType);
    await this.updateDirectoryBadges(partnerId);
    await this.notifyBadgeRemoval(partnerId, badgeType);
  }
  
  async scheduleEvaluations() {
    // Run daily evaluations for all active partners
    const activePartners = await this.getActivePartners();
    
    for (const partner of activePartners) {
      await this.evaluateAllBadges(partner.id);
    }
  }
}
```

### Badge Display System
```javascript
class BadgeDisplay {
  async getPartnerBadges(partnerId) {
    const badges = await this.getActiveBadges(partnerId);
    
    return {
      certification: badges.filter(b => b.type.startsWith('certified')),
      performance: badges.filter(b => !b.type.startsWith('certified')),
      total: badges.length,
      svgUrls: badges.map(badge => ({
        type: badge.type,
        svgUrl: badge.svgUrl,
        alt: this.generateBadgeAlt(badge)
      }))
    };
  }
  
  generateBadgeAlt(badge) {
    const altTexts = {
      'fast-installer': 'Fast Installer - Quick Implementation Expert',
      'compliance-pro': 'Compliance Pro - Evidence Pack Specialist',
      'five-star-nps': 'Five Star NPS - Excellent Customer Satisfaction'
    };
    
    return altTexts[badge.type] || `${badge.type} Badge`;
  }
  
  async renderBadgeHTML(partnerId) {
    const badges = await this.getPartnerBadges(partnerId);
    
    let html = '<div class="partner-badges">';
    
    // Certification badges first
    for (const badge of badges.certification) {
      html += `
        <div class="badge certification-badge">
          <img src="${badge.svgUrl}" alt="${this.generateBadgeAlt(badge)}" 
               width="120" height="40" loading="lazy" />
        </div>
      `;
    }
    
    // Performance badges
    for (const badge of badges.performance) {
      html += `
        <div class="badge performance-badge">
          <img src="${badge.svgUrl}" alt="${this.generateBadgeAlt(badge)}" 
               width="120" height="40" loading="lazy" />
        </div>
      `;
    }
    
    html += '</div>';
    
    return html;
  }
}
```

## Quality Assurance & Monitoring

### Performance Threshold Monitoring
```javascript
class QualityMonitor {
  async monitorPerformanceThresholds() {
    const partners = await this.getActivePartners();
    const alerts = [];
    
    for (const partner of partners) {
      const metrics = await this.getRealTimeMetrics(partner.id);
      const thresholds = await this.getPartnerThresholds(partner.id);
      
      // TTI threshold breach
      if (metrics.currentTTI > thresholds.ttiWarning) {
        alerts.push({
          partnerId: partner.id,
          type: 'tti_warning',
          severity: 'warning',
          message: `TTI approaching threshold: ${metrics.currentTTI}ms`,
          recommendation: 'Monitor installation performance'
        });
      }
      
      if (metrics.currentTTI > thresholds.ttiCritical) {
        alerts.push({
          partnerId: partner.id,
          type: 'tti_critical',
          severity: 'critical',
          message: `TTI threshold breached: ${metrics.currentTTI}ms`,
          recommendation: 'Immediate optimization required'
        });
      }
      
      // Survival rate drop
      if (metrics.survivalRate < thresholds.survivalWarning) {
        alerts.push({
          partnerId: partner.id,
          type: 'survival_warning',
          severity: 'warning',
          message: `Survival rate declining: ${(metrics.survivalRate * 100).toFixed(3)}%`,
          recommendation: 'Review manifest configuration'
        });
      }
    }
    
    if (alerts.length > 0) {
      await this.processQualityAlerts(alerts);
    }
    
    return alerts;
  }
  
  async processQualityAlerts(alerts) {
    for (const alert of alerts) {
      // Categorize by severity
      if (alert.severity === 'critical') {
        await this.sendImmediateAlert(alert);
        await this.scheduleQualityReview(alert.partnerId);
      } else {
        await this.logWarning(alert);
        await this.updatePartnerQualityScore(alert.partnerId, -5);
      }
    }
  }
}
```

## Testing & Validation

### Badge Test Suite
```bash
# Run badge eligibility tests
npm run test:badge-eligibility

# Test badge generation
npm run test:badge-generation

# Validate performance thresholds
npm run test:performance-thresholds

# Test probation system
npm run test:probation-system
```

### Quality Metrics
```javascript
class QualityMetrics {
  async getQualityDashboard() {
    return {
      totalPartners: await this.getTotalPartners(),
      probationaryPartners: await this.getProbationaryPartners(),
      badgeDistribution: await this.getBadgeDistribution(),
      performanceTrends: await this.getPerformanceTrends(),
      qualityAlerts: await this.getActiveQualityAlerts()
    };
  }
}
```
