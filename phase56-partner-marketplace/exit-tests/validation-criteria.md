# Exit Tests - Binary Validation Criteria

## Overview
Strict binary validation criteria to determine Phase 56 completion success. All tests must pass with clear, measurable evidence.

## Test 1: Partner Deal Closure Validation

### Criteria
≥3 partners must close paid work via marketplace listings with proper CRM attribution from UTM/partner ID tracking.

### Validation Script
```javascript
class PartnerDealClosureValidator {
  async validatePartnerDealClosures(testPeriod = '90d') {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - (90 * 24 * 60 * 60 * 1000));
    
    // Get all closed-won deals from CRM
    const closedDeals = await this.crmService.getClosedWonDeals(startDate, endDate);
    
    // Filter for partner-attributed deals
    const partnerDeals = closedDeals.filter(deal => 
      deal.leadSource === 'Partner Referral' && 
      deal.partnerId && 
      deal.partnerAttributionVerified
    );
    
    // Validate attribution chain
    const validatedDeals = [];
    for (const deal of partnerDeals) {
      const attribution = await this.validateAttributionChain(deal);
      if (attribution.valid) {
        validatedDeals.push({
          ...deal,
          attributionDetails: attribution
        });
      }
    }
    
    // Group by unique partners
    const uniquePartners = new Set(validatedDeals.map(deal => deal.partnerId));
    
    const result = {
      passed: uniquePartners.size >= 3,
      requiredPartners: 3,
      actualPartners: uniquePartners.size,
      validatedDeals: validatedDeals.length,
      totalClosedDeals: closedDeals.length,
      partnerDetails: await this.getPartnerDetails(Array.from(uniquePartners)),
      evidence: validatedDeals.map(deal => ({
        dealId: deal.id,
        partnerId: deal.partnerId,
        partnerName: deal.partnerName,
        dealValue: deal.value,
        closeDate: deal.closeDate,
        attributionChain: deal.attributionDetails.chain,
        utmParameters: deal.attributionDetails.utmParams,
        crmEvidence: deal.attributionDetails.crmEvidence
      })),
      timestamp: new Date()
    };
    
    await this.saveTestResult('partner-deal-closure', result);
    return result;
  }
  
  async validateAttributionChain(deal) {
    const chain = {
      utmClick: await this.getUTMClick(deal.sessionId),
      leadCreation: await this.getLeadCreation(deal.leadId),
      opportunityCreation: await this.getOpportunityCreation(deal.opportunityId),
      dealClosure: deal
    };
    
    // Verify partner ID consistency
    const partnerIds = Object.values(chain).map(step => step.partnerId).filter(Boolean);
    const consistentPartnerId = partnerIds.every(id => id === deal.partnerId);
    
    // Verify timestamp sequence
    const timestamps = Object.values(chain).map(step => step.timestamp).filter(Boolean);
    const validSequence = this.validateTimestampSequence(timestamps);
    
    // Verify UTM parameters
    const utmParams = await this.extractUTMParameters(deal.sessionId);
    const validUTM = utmParams && 
                    utmParams.utm_source === 'partner' && 
                    utmParams.utm_content === deal.partnerId;
    
    return {
      valid: consistentPartnerId && validSequence && validUTM,
      chain,
      utmParams,
      issues: this.getAttributionIssues(consistentPartnerId, validSequence, validUTM)
    };
  }
  
  async generateEvidenceReport(validationResult) {
    if (!validationResult.passed) {
      return {
        status: 'FAILED',
        reason: `Only ${validationResult.actualPartners} partners closed deals, required ${validationResult.requiredPartners}`,
        recommendation: 'Increase partner enablement and lead generation'
      };
    }
    
    return {
      status: 'PASSED',
      summary: `${validationResult.actualPartners} partners successfully closed ${validationResult.validatedDeals} deals`,
      partnerBreakdown: validationResult.partnerDetails.map(partner => ({
        name: partner.name,
        tier: partner.tier,
        dealsClosed: validationResult.evidence.filter(d => d.partnerId === partner.id).length,
        totalValue: validationResult.evidence
          .filter(d => d.partnerId === partner.id)
          .reduce((sum, d) => sum + d.dealValue, 0)
      })),
      evidenceLinks: validationResult.evidence.map(deal => ({
        type: 'crm-record',
        url: `${process.env.CRM_URL}/deals/${deal.dealId}`,
        description: `CRM Deal Record - ${deal.partnerName}`
      }))
    };
  }
}
```

## Test 2: TTI Improvement Validation

### Criteria
Time-to-install must show measurable improvement for new tenants vs self-serve control group. Publish p50 and p95 deltas with statistical significance.

### Validation Script
```javascript
class TTIImprovementValidator {
  async validateTTIImprovement(testPeriod = '60d') {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - (60 * 24 * 60 * 60 * 1000));
    
    // Get partner-installed tenants
    const partnerInstallations = await this.getPartnerInstallations(startDate, endDate);
    
    // Get self-serve control group
    const selfServeInstallations = await this.getSelfServeInstallations(startDate, endDate);
    
    // Calculate metrics for both groups
    const partnerMetrics = this.calculateTTIMetrics(partnerInstallations);
    const selfServeMetrics = this.calculateTTIMetrics(selfServeInstallations);
    
    // Calculate deltas
    const deltas = {
      p50Delta: ((selfServeMetrics.p50 - partnerMetrics.p50) / selfServeMetrics.p50) * 100,
      p95Delta: ((selfServeMetrics.p95 - partnerMetrics.p95) / selfServeMetrics.p95) * 100,
      meanDelta: ((selfServeMetrics.mean - partnerMetrics.mean) / selfServeMetrics.mean) * 100
    };
    
    // Statistical significance test
    const significance = await this.performStatisticalTest(
      partnerInstallations.map(i => i.duration),
      selfServeInstallations.map(i => i.duration)
    );
    
    const result = {
      passed: deltas.p50Delta > 10 && significance.pValue < 0.05, // 10% improvement, 95% confidence
      requiredImprovement: 10, // percent
      actualImprovement: deltas.p50Delta,
      
      partnerMetrics: {
        count: partnerInstallations.length,
        mean: partnerMetrics.mean,
        median: partnerMetrics.median,
        p50: partnerMetrics.p50,
        p75: partnerMetrics.p75,
        p90: partnerMetrics.p90,
        p95: partnerMetrics.p95
      },
      
      selfServeMetrics: {
        count: selfServeInstallations.length,
        mean: selfServeMetrics.mean,
        median: selfServeMetrics.median,
        p50: selfServeMetrics.p50,
        p75: selfServeMetrics.p75,
        p90: selfServeMetrics.p90,
        p95: selfServeMetrics.p95
      },
      
      deltas,
      significance,
      
      evidence: {
        partnerData: partnerInstallations.slice(0, 10).map(i => ({
          installationId: i.id,
          partnerId: i.partnerId,
          duration: i.duration,
          stack: i.stack,
          complexity: i.complexity,
          timestamp: i.timestamp
        })),
        selfServeData: selfServeInstallations.slice(0, 10).map(i => ({
          installationId: i.id,
          duration: i.duration,
          stack: i.stack,
          complexity: i.complexity,
          timestamp: i.timestamp
        }))
      },
      
      timestamp: new Date()
    };
    
    await this.saveTestResult('tti-improvement', result);
    return result;
  }
  
  calculateTTIMetrics(installations) {
    if (installations.length === 0) {
      return { mean: 0, median: 0, p50: 0, p75: 0, p90: 0, p95: 0 };
    }
    
    const durations = installations.map(i => i.duration).sort((a, b) => a - b);
    
    return {
      mean: Math.round(durations.reduce((sum, d) => sum + d, 0) / durations.length),
      median: durations[Math.floor(durations.length / 2)],
      p50: durations[Math.floor(durations.length * 0.5)],
      p75: durations[Math.floor(durations.length * 0.75)],
      p90: durations[Math.floor(durations.length * 0.9)],
      p95: durations[Math.floor(durations.length * 0.95)]
    };
  }
  
  async performStatisticalTest(sample1, sample2) {
    // Perform two-sample t-test
    const mean1 = sample1.reduce((sum, x) => sum + x, 0) / sample1.length;
    const mean2 = sample2.reduce((sum, x) => sum + x, 0) / sample2.length;
    
    const variance1 = sample1.reduce((sum, x) => sum + Math.pow(x - mean1, 2), 0) / (sample1.length - 1);
    const variance2 = sample2.reduce((sum, x) => sum + Math.pow(x - mean2, 2), 0) / (sample2.length - 1);
    
    const pooledVariance = ((sample1.length - 1) * variance1 + (sample2.length - 1) * variance2) / 
                          (sample1.length + sample2.length - 2);
    
    const standardError = Math.sqrt(pooledVariance * (1/sample1.length + 1/sample2.length));
    const tStatistic = (mean1 - mean2) / standardError;
    
    // Calculate p-value (simplified)
    const degreesOfFreedom = sample1.length + sample2.length - 2;
    const pValue = this.calculatePValue(tStatistic, degreesOfFreedom);
    
    return {
      tStatistic,
      degreesOfFreedom,
      pValue,
      significant: pValue < 0.05
    };
  }
  
  async generateTTIReport(validationResult) {
    if (!validationResult.passed) {
      return {
        status: 'FAILED',
        reason: `TTI improvement only ${validationResult.actualImprovement.toFixed(1)}%, required ${validationResult.requiredImprovement}%`,
        recommendation: 'Provide additional partner training and optimization guidance'
      };
    }
    
    return {
      status: 'PASSED',
      summary: `Partner TTI improved by ${validationResult.actualImprovement.toFixed(1)}% with statistical significance (p=${validationResult.significance.pValue})`,
      metrics: {
        partnerTTI: `${Math.round(validationResult.partnerMetrics.p50 / 60000)} minutes`,
        selfServeTTI: `${Math.round(validationResult.selfServeMetrics.p50 / 60000)} minutes`,
        improvement: `${validationResult.actualImprovement.toFixed(1)}%`
      },
      publishedData: {
        chartUrl: await this.generateTTIChart(validationResult),
        rawDataUrl: await this.exportTTIData(validationResult),
        statisticalReport: await this.generateStatisticalReport(validationResult.significance)
      }
    };
  }
}
```

## Test 3: Partner NPS Collection & Publication

### Criteria
Partner NPS must be collected and published with clear methodology. At least one partner webinar must generate qualified leads.

### Validation Script
```javascript
class PartnerNPSValidator {
  async validatePartnerNPS(testPeriod = '90d') {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - (90 * 24 * 60 * 60 * 1000));
    
    // Get NPS survey submissions
    const npsSubmissions = await this.getNPSSubmissions(startDate, endDate);
    
    // Calculate NPS score
    const npsCalculation = this.calculateNPS(npsSubmissions);
    
    // Validate methodology
    const methodologyValidation = this.validateNPSMethodology(npsSubmissions);
    
    // Check for publication
    const publicationValidation = await this.validateNPSPublication();
    
    // Check webinar lead generation
    const webinarValidation = await this.validateWebinarLeads(testPeriod);
    
    const result = {
      passed: npsSubmissions.length >= 10 && 
              methodologyValidation.valid && 
              publicationValidation.published &&
              webinarValidation.qualifiedLeadsGenerated,
      
      npsScore: npsCalculation.score,
      responseCount: npsSubmissions.length,
      methodology: methodologyValidation,
      publication: publicationValidation,
      webinar: webinarValidation,
      
      detailedBreakdown: {
        promoters: npsCalculation.promoters,
        detractors: npsCalculation.detractors,
        passives: npsCalculation.passives,
        responseRate: methodologyValidation.responseRate,
        distribution: npsCalculation.distribution
      },
      
      evidence: {
        surveyData: npsSubmissions.slice(0, 5).map(s => ({
          responseId: s.id,
          partnerId: s.partnerId,
          score: s.score,
          category: s.category,
          submittedAt: s.submittedAt
        })),
        publicationUrl: publicationValidation.url,
        webinarLeads: webinarValidation.leads.slice(0, 5)
      },
      
      timestamp: new Date()
    };
    
    await this.saveTestResult('partner-nps', result);
    return result;
  }
  
  calculateNPS(submissions) {
    if (submissions.length === 0) {
      return { score: 0, promoters: 0, detractors: 0, passives: 0, distribution: {} };
    }
    
    const promoters = submissions.filter(s => s.score >= 9).length;
    const detractors = submissions.filter(s => s.score <= 6).length;
    const passives = submissions.filter(s => s.score >= 7 && s.score <= 8).length;
    const total = submissions.length;
    
    const promoterPercentage = (promoters / total) * 100;
    const detractorPercentage = (detractors / total) * 100;
    const score = Math.round(promoterPercentage - detractorPercentage);
    
    // Score distribution
    const distribution = {};
    for (let i = 0; i <= 10; i++) {
      distribution[i] = submissions.filter(s => s.score === i).length;
    }
    
    return {
      score,
      promoters,
      detractors,
      passives,
      distribution
    };
  }
  
  validateNPSMethodology(submissions) {
    const issues = [];
    
    // Check minimum sample size
    if (submissions.length < 10) {
      issues.push('Insufficient sample size (minimum 10 required)');
    }
    
    // Check response period coverage
    const dateRange = this.getDateRange(submissions);
    const daysCovered = (dateRange.end - dateRange.start) / (1000 * 60 * 60 * 24);
    if (daysCovered < 30) {
      issues.push('Survey period too short (minimum 30 days required)');
    }
    
    // Check for score distribution
    const uniqueScores = new Set(submissions.map(s => s.score));
    if (uniqueScores.size < 5) {
      issues.push('Poor score distribution diversity');
    }
    
    // Calculate response rate (assuming surveys sent to all active clients)
    const estimatedSurveysSent = Math.floor(submissions.length * 3); // Assume 33% response rate
    const responseRate = (submissions.length / estimatedSurveysSent) * 100;
    
    return {
      valid: issues.length === 0,
      issues,
      responseRate: Math.round(responseRate),
      sampleSize: submissions.length,
      dateRange
    };
  }
  
  async validateNPSPublication() {
    const publication = await this.getLatestNPSPublication();
    
    if (!publication) {
      return {
        published: false,
        issues: ['No NPS publication found']
      };
    }
    
    const validation = {
      published: true,
      url: publication.url,
      publishedAt: publication.publishedAt,
      
      // Validate publication content
      includesScore: publication.npsScore !== undefined,
      includesMethodology: publication.methodology !== undefined,
      includesSampleSize: publication.sampleSize !== undefined,
      includesDateRange: publication.dateRange !== undefined,
      
      // Validate recency
      recentEnough: this.isPublicationRecent(publication.publishedAt)
    };
    
    validation.valid = validation.includesScore && 
                     validation.includesMethodology && 
                     validation.includesSampleSize && 
                     validation.includesDateRange && 
                     validation.recentEnough;
    
    return validation;
  }
  
  async validateWebinarLeads(testPeriod) {
    const webinars = await this.getPartnerWebinars(testPeriod);
    
    let qualifiedLeadsGenerated = false;
    const leads = [];
    
    for (const webinar of webinars) {
      const webinarLeads = await this.getWebinarLeads(webinar.id);
      const qualifiedLeads = webinarLeads.filter(lead => 
        lead.qualified && 
        lead.source === 'partner-webinar' &&
        lead.partnerId === webinar.partnerId
      );
      
      if (qualifiedLeads.length > 0) {
        qualifiedLeadsGenerated = true;
        leads.push(...qualifiedLeads);
      }
    }
    
    return {
      qualifiedLeadsGenerated,
      totalWebinars: webinars.length,
      totalLeads: leads.length,
      leads: leads.slice(0, 5)
    };
  }
  
  async generateNPSReport(validationResult) {
    if (!validationResult.passed) {
      const failures = [];
      if (validationResult.responseCount < 10) {
        failures.push('Insufficient NPS responses');
      }
      if (!validationResult.methodology.valid) {
        failures.push('NPS methodology issues');
      }
      if (!validationResult.publication.published) {
        failures.push('NPS not published');
      }
      if (!validationResult.webinar.qualifiedLeadsGenerated) {
        failures.push('No qualified webinar leads');
      }
      
      return {
        status: 'FAILED',
        reason: failures.join(', '),
        recommendation: 'Increase NPS survey participation and ensure webinar promotion'
      };
    }
    
    return {
      status: 'PASSED',
      summary: `NPS of ${validationResult.npsScore} collected from ${validationResult.responseCount} responses and published with methodology`,
      details: {
        npsScore: validationResult.npsScore,
        responseCount: validationResult.responseCount,
        publicationUrl: validationResult.publication.url,
        qualifiedWebinarLeads: validationResult.webinar.totalLeads
      },
      evidence: {
        npsReport: validationResult.publication.url,
        surveyMethodology: '/docs/nps-methodology',
        webinarResults: validationResult.webinar.leads.map(l => l.leadUrl)
      }
    };
  }
}
```

## Exit Test Execution Engine

### Master Test Runner
```javascript
class ExitTestRunner {
  async runAllExitTests(testPeriod = '90d') {
    const tests = [
      { name: 'partner-deal-closure', validator: PartnerDealClosureValidator },
      { name: 'tti-improvement', validator: TTIImprovementValidator },
      { name: 'partner-nps', validator: PartnerNPSValidator }
    ];
    
    const results = {};
    let allPassed = true;
    
    for (const test of tests) {
      try {
        console.log(`Running exit test: ${test.name}`);
        const validator = new test.validator();
        const result = await validator.validate(testPeriod);
        results[test.name] = result;
        
        if (!result.passed) {
          allPassed = false;
        }
        
        // Generate individual test report
        const report = await validator.generateEvidenceReport(result);
        results[test.name].report = report;
        
      } catch (error) {
        console.error(`Test ${test.name} failed with error:`, error);
        results[test.name] = {
          passed: false,
          error: error.message,
          timestamp: new Date()
        };
        allPassed = false;
      }
    }
    
    const masterResult = {
      phase: 56,
      timestamp: new Date(),
      overallPassed: allPassed,
      testResults: results,
      summary: this.generateTestSummary(results),
      evidencePackage: await this.generateEvidencePackage(results)
    };
    
    await this.saveMasterResult(masterResult);
    
    return masterResult;
  }
  
  generateTestSummary(results) {
    const passedTests = Object.values(results).filter(r => r.passed).length;
    const totalTests = Object.keys(results).length;
    
    return {
      passed: passedTests,
      total: totalTests,
      passRate: (passedTests / totalTests) * 100,
      status: passedTests === totalTests ? 'PHASE_COMPLETE' : 'PHASE_INCOMPLETE',
      
      keyMetrics: {
        partnersWithDeals: results['partner-deal-closure']?.actualPartners || 0,
        ttiImprovement: results['tti-improvement']?.actualImprovement || 0,
        npsScore: results['partner-nps']?.npsScore || 0,
        npsResponses: results['partner-nps']?.responseCount || 0
      }
    };
  }
  
  async generateEvidencePackage(results) {
    const packageId = this.generatePackageId();
    
    const evidence = {
      packageId,
      generatedAt: new Date(),
      testResults: results,
      
      // Raw data exports
      dataExports: {
        partnerDeals: await this.exportPartnerDeals(results['partner-deal-closure']),
        ttiData: await this.exportTTIData(results['tti-improvement']),
        npsData: await this.exportNPSData(results['partner-nps'])
      },
      
      // Analytical reports
      reports: {
        partnerPerformanceReport: await this.generatePartnerPerformanceReport(results),
        financialImpactReport: await this.generateFinancialImpactReport(results),
        qualityMetricsReport: await this.generateQualityMetricsReport(results)
      },
      
      // Verification artifacts
      verification: {
        databaseExports: await this.generateDatabaseExports(),
        auditLogs: await this.generateAuditLogs(),
        signOff: await this.generateExecutiveSignOff(results)
      }
    };
    
    // Cryptographically sign evidence package
    evidence.signature = await this.signEvidencePackage(evidence);
    
    await this.saveEvidencePackage(packageId, evidence);
    
    return {
      packageId,
      downloadUrl: `/api/exit-tests/evidence/${packageId}`,
      signature: evidence.signature,
      size: JSON.stringify(evidence).length
    };
  }
}
```

## Test Execution & Reporting

### Automated Test Execution
```bash
#!/bin/bash
# run-exit-tests.sh

echo "Starting Phase 56 Exit Test Execution..."

# Set environment
export NODE_ENV=production
export TEST_PERIOD=${1:-90}

# Run master test suite
node -e "
const ExitTestRunner = require('./exit-test-runner');
const runner = new ExitTestRunner();

runner.runAllExitTests('${TEST_PERIOD}d')
  .then(result => {
    console.log('Exit test results:', JSON.stringify(result, null, 2));
    
    if (result.overallPassed) {
      console.log('🎉 Phase 56 EXIT TESTS PASSED');
      process.exit(0);
    } else {
      console.log('❌ Phase 56 EXIT TESTS FAILED');
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('Exit test execution failed:', error);
    process.exit(1);
  });
"
```

### Test Results API
```javascript
// GET /api/exit-tests/results
app.get('/api/exit-tests/results', async (req, res) => {
  try {
    const { testId, period } = req.query;
    
    if (testId) {
      const result = await exitTestService.getTestResult(testId);
      return res.json(result);
    }
    
    const latestResults = await exitTestService.getLatestResults(period);
    return res.json(latestResults);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch exit test results' });
  }
});

// GET /api/exit-tests/evidence/:packageId
app.get('/api/exit-tests/evidence/:packageId', async (req, res) => {
  try {
    const { packageId } = req.params;
    const evidencePackage = await exitTestService.getEvidencePackage(packageId);
    
    if (!evidencePackage) {
      return res.status(404).json({ error: 'Evidence package not found' });
    }
    
    // Set download headers
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="phase56-evidence-${packageId}.json"`);
    
    res.json(evidencePackage);
  } catch (error) {
    res.status(500).json({ error: 'Failed to download evidence package' });
  }
});
```

## Testing & Validation

### Exit Test Test Suite
```bash
# Test individual validators
npm run test:partner-deal-validator
npm run test:tti-improvement-validator
npm run test:partner-nps-validator

# Test master runner
npm run test:exit-test-runner

# Test evidence package generation
npm run test:evidence-package

# Integration tests
npm run test:exit-tests-integration
```

### Validation Accuracy
```javascript
class ExitTestValidator {
  async validateTestAccuracy(testName, expectedResult) {
    // Run test with known data
    const validator = this.getValidator(testName);
    const actualResult = await validator.validateWithTestData();
    
    // Compare results
    const accuracy = this.compareResults(expectedResult, actualResult);
    
    return {
      testName,
      expected: expectedResult,
      actual: actualResult,
      accuracy: accuracy.score,
      discrepancies: accuracy.differences
    };
  }
}
```
