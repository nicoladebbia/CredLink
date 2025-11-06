# Instrumentation: Metrics & Analytics

## Core Performance Metrics

### Time-to-Install (TTI) Tracking
```javascript
class TTIMetricsCollector {
  async trackInstallationStart(partnerId, installationData) {
    const tracking = {
      id: this.generateTrackingId(),
      partnerId,
      clientId: installationData.clientId,
      stack: installationData.stack, // wordpress, shopify, cloudflare-workers, custom
      complexity: installationData.complexity, // simple, medium, complex
      startTime: new Date(),
      metadata: {
        environment: installationData.environment,
        version: installationData.version,
        features: installationData.features || []
      }
    };
    
    await this.saveTrackingStart(tracking);
    await this.sendAnalyticsEvent('installation_started', tracking);
    
    return tracking.id;
  }
  
  async trackInstallationComplete(trackingId, completionData) {
    const tracking = await this.getTracking(trackingId);
    
    const completion = {
      trackingId,
      completedAt: new Date(),
      duration: new Date() - tracking.startTime,
      success: completionData.success,
      error: completionData.error || null,
      metadata: {
        finalConfiguration: completionData.configuration,
        testResults: completionData.testResults,
        manifestUrl: completionData.manifestUrl
      }
    };
    
    // Calculate TTI metrics
    const ttiMetrics = this.calculateTTIMetrics(tracking, completion);
    
    await this.saveTrackingCompletion(completion);
    await this.updatePartnerTTIMetrics(tracking.partnerId, ttiMetrics);
    await this.sendAnalyticsEvent('installation_completed', {
      ...completion,
      ttiMetrics
    });
    
    return ttiMetrics;
  }
  
  calculateTTIMetrics(tracking, completion) {
    const duration = completion.duration;
    
    return {
      rawDuration: duration,
      durationMinutes: Math.round(duration / (1000 * 60)),
      stack: tracking.stack,
      complexity: tracking.complexity,
      success: completion.success,
      
      // Percentile calculations (will be updated with historical data)
      percentiles: {
        p50: this.calculatePercentile(duration, 50),
        p75: this.calculatePercentile(duration, 75),
        p90: this.calculatePercentile(duration, 90),
        p95: this.calculatePercentile(duration, 95)
      },
      
      // Performance classification
      performance: this.classifyPerformance(duration, tracking.stack),
      
      // Trend analysis
      trend: await this.calculateTTITrend(tracking.partnerId, tracking.stack)
    };
  }
  
  classifyPerformance(duration, stack) {
    const thresholds = {
      wordpress: { excellent: 600000, good: 900000, average: 1200000 }, // 10, 15, 20 minutes
      shopify: { excellent: 900000, good: 1200000, average: 1800000 }, // 15, 20, 30 minutes
      'cloudflare-workers': { excellent: 300000, good: 600000, average: 900000 }, // 5, 10, 15 minutes
      custom: { excellent: 1800000, good: 3600000, average: 7200000 } // 30, 60, 120 minutes
    };
    
    const threshold = thresholds[stack] || thresholds.custom;
    
    if (duration <= threshold.excellent) return 'excellent';
    if (duration <= threshold.good) return 'good';
    if (duration <= threshold.average) return 'average';
    return 'poor';
  }
}
```

### Survival Rate Monitoring
```javascript
class SurvivalRateMonitor {
  async trackSurvivalTest(installationId, testData) {
    const test = {
      id: this.generateTestId(),
      installationId,
      partnerId: testData.partnerId,
      timestamp: new Date(),
      
      // Test configuration
      testConfig: {
        platforms: testData.platforms, // social-media, cdn, mobile, print
        transformations: testData.transformations, // resize, compress, format-convert
        iterations: testData.iterations || 10
      },
      
      // Test execution
      results: [],
      
      // Survival calculation
      survivalRate: 0,
      
      // Evidence collection
      evidencePack: null
    };
    
    // Execute survival test
    for (const platform of testData.platforms) {
      for (const transformation of testData.transformations) {
        const result = await this.executeSurvivalTest(installationId, platform, transformation);
        test.results.push(result);
      }
    }
    
    // Calculate overall survival rate
    test.survivalRate = this.calculateSurvivalRate(test.results);
    
    // Generate evidence pack
    test.evidencePack = await this.generateEvidencePack(test);
    
    await this.saveSurvivalTest(test);
    await this.updatePartnerSurvivalMetrics(testData.partnerId, test);
    await this.sendAnalyticsEvent('survival_test_completed', test);
    
    return test;
  }
  
  async executeSurvivalTest(installationId, platform, transformation) {
    const originalManifest = await this.getOriginalManifest(installationId);
    
    // Simulate platform transformation
    const transformedContent = await this.simulateTransformation(
      installationId, 
      platform, 
      transformation
    );
    
    // Test manifest survival
    const survivalResult = await this.testManifestSurvival(
      originalManifest,
      transformedContent
    );
    
    return {
      platform,
      transformation,
      originalManifest: originalManifest.hash,
      transformedManifest: survivalResult.manifestHash,
      survived: survivalResult.survived,
      integrity: survivalResult.integrity,
      completeness: survivalResult.completeness,
      timestamp: new Date()
    };
  }
  
  calculateSurvivalRate(results) {
    if (results.length === 0) return 0;
    
    const survivedCount = results.filter(result => result.survived).length;
    const totalWeight = results.reduce((sum, result) => {
      // Weight critical platforms higher
      const weight = result.platform === 'social-media' ? 2 : 1;
      return sum + weight;
    }, 0);
    
    const survivedWeight = results.reduce((sum, result) => {
      if (result.survived) {
        const weight = result.platform === 'social-media' ? 2 : 1;
        return sum + weight;
      }
      return sum;
    }, 0);
    
    return survivedWeight / totalWeight;
  }
}
```

## NPS Collection & Analysis

### NPS Survey System
```javascript
class NPSSurveySystem {
  async scheduleNPSSurvey(partnerId, clientId, installationId) {
    // Schedule survey 30 days after installation
    const surveyDate = new Date(Date.now() + (30 * 24 * 60 * 60 * 1000));
    
    const survey = {
      id: this.generateSurveyId(),
      partnerId,
      clientId,
      installationId,
      scheduledFor: surveyDate,
      status: 'scheduled',
      
      surveyConfig: {
        questions: [
          {
            id: 'likelihood_to_recommend',
            type: 'scale_0_10',
            text: 'How likely are you to recommend [Partner Name] for C2PA implementation?'
          },
          {
            id: 'implementation_quality',
            type: 'scale_1_5',
            text: 'Rate the quality of the C2PA implementation'
          },
          {
            id: 'support_experience',
            type: 'scale_1_5',
            text: 'Rate your experience with [Partner Name] support'
          },
          {
            id: 'value_for_money',
            type: 'scale_1_5',
            text: 'Rate the value for money of the implementation'
          },
          {
            id: 'improvement_suggestions',
            type: 'text',
            text: 'What could [Partner Name] improve? (optional)'
          }
        ],
        branding: await this.getPartnerBranding(partnerId),
        language: 'en'
      }
    };
    
    await this.saveScheduledSurvey(survey);
    await this.scheduleSurveyDelivery(survey);
    
    return survey;
  }
  
  async submitNPSSurvey(surveyId, responses) {
    const survey = await this.getSurvey(surveyId);
    
    const submission = {
      surveyId,
      submittedAt: new Date(),
      responses,
      
      // Calculate NPS score
      npsScore: this.calculateNPSScore(responses.likelihood_to_recommend),
      
      // Categorize response
      category: this.categorizeResponse(responses.likelihood_to_recommend),
      
      // Additional metrics
      satisfactionScore: this.calculateSatisfactionScore(responses),
      
      // Metadata
      metadata: {
        userAgent: responses.userAgent,
        ipAddress: this.anonymizeIP(responses.ipAddress),
        completionTime: responses.completionTime
      }
    };
    
    await this.saveSurveySubmission(submission);
    await this.updatePartnerNPSMetrics(survey.partnerId, submission);
    await this.sendAnalyticsEvent('nps_survey_submitted', submission);
    
    return submission;
  }
  
  calculateNPSScore(likelihoodScore) {
    const score = parseInt(likelihoodScore);
    if (isNaN(score) || score < 0 || score > 10) return 0;
    return score;
  }
  
  categorizeResponse(score) {
    const numericScore = parseInt(score);
    if (numericScore >= 9) return 'promoter';
    if (numericScore >= 7) return 'passive';
    return 'detractor';
  }
  
  async calculatePartnerNPS(partnerId, timeframe = '90d') {
    const submissions = await this.getNPSSubmissions(partnerId, timeframe);
    
    if (submissions.length === 0) return 0;
    
    const promoters = submissions.filter(s => s.category === 'promoter').length;
    const detractors = submissions.filter(s => s.category === 'detractor').length;
    const total = submissions.length;
    
    const promoterPercentage = (promoters / total) * 100;
    const detractorPercentage = (detractors / total) * 100;
    
    return Math.round(promoterPercentage - detractorPercentage);
  }
}
```

## Attribution Funnel Analytics

### UTM Attribution Tracking
```javascript
class AttributionFunnel {
  async trackUTMAttribution(sessionData) {
    const { utm_source, utm_medium, utm_campaign, utm_content, utm_term } = sessionData;
    
    if (utm_source === 'partner' && utm_content) {
      const attribution = {
        sessionId: sessionData.sessionId,
        partnerId: utm_content,
        campaign: utm_campaign || 'marketplace',
        medium: utm_medium,
        term: utm_term,
        timestamp: new Date(),
        
        // Funnel stage
        stage: 'referral',
        
        // User data
        userAgent: sessionData.userAgent,
        ipAddress: this.anonymizeIP(sessionData.ipAddress),
        referrer: sessionData.referrer,
        
        // Conversion tracking
        conversions: {
          signup: null,
          pilot: null,
          paid: null
        }
      };
      
      await this.saveAttribution(attribution);
      await this.sendAnalyticsEvent('partner_referral', attribution);
      
      return attribution;
    }
    
    return null;
  }
  
  async trackFunnelConversion(sessionId, conversionType, conversionData) {
    const attribution = await this.getAttributionBySession(sessionId);
    
    if (!attribution) return null;
    
    const conversion = {
      attributionId: attribution.id,
      type: conversionType, // signup, pilot, paid
      timestamp: new Date(),
      data: conversionData,
      
      // Calculate conversion time
      timeToConvert: new Date() - attribution.timestamp,
      
      // Update funnel stage
      newStage: this.getNextStage(attribution.stage, conversionType)
    };
    
    await this.saveConversion(conversion);
    await this.updateAttributionStage(attribution.id, conversion.newStage);
    await this.sendAnalyticsEvent('funnel_conversion', {
      ...conversion,
      partnerId: attribution.partnerId
    });
    
    return conversion;
  }
  
  async getAttributionFunnel(partnerId, timeframe = '90d') {
    const attributions = await this.getPartnerAttributions(partnerId, timeframe);
    
    const funnel = {
      referrals: attributions.length,
      
      // Stage breakdown
      stages: {
        referral: attributions.filter(a => a.stage === 'referral').length,
        signup: attributions.filter(a => a.stage === 'signup').length,
        pilot: attributions.filter(a => a.stage === 'pilot').length,
        paid: attributions.filter(a => a.stage === 'paid').length
      },
      
      // Conversion rates
      conversionRates: {
        referralToSignup: this.calculateConversionRate(attributions, 'referral', 'signup'),
        signupToPilot: this.calculateConversionRate(attributions, 'signup', 'pilot'),
        pilotToPaid: this.calculateConversionRate(attributions, 'pilot', 'paid'),
        overall: this.calculateOverallConversionRate(attributions)
      },
      
      // Time metrics
      averageTimeToConvert: this.calculateAverageTimeToConvert(attributions),
      
      // Value metrics
      averageDealSize: await this.calculateAverageDealSize(partnerId, timeframe),
      totalPipelineValue: await this.calculatePipelineValue(partnerId, timeframe),
      
      // Comparison to baseline
      baselineComparison: await this.compareToBaseline(partnerId, timeframe)
    };
    
    return funnel;
  }
  
  calculateConversionRate(attributions, fromStage, toStage) {
    const fromCount = attributions.filter(a => a.stage === fromStage).length;
    const toCount = attributions.filter(a => a.stage === toStage).length;
    
    return fromCount > 0 ? (toCount / fromCount) * 100 : 0;
  }
}
```

## Performance Dashboard

### Real-Time Metrics Dashboard
```javascript
class PartnerMetricsDashboard {
  async getDashboardData(partnerId, timeframe = '30d') {
    const [
      ttiMetrics,
      survivalMetrics,
      npsMetrics,
      attributionMetrics,
      commissionMetrics,
      qualityMetrics
    ] = await Promise.all([
      this.getTTIMetrics(partnerId, timeframe),
      this.getSurvivalMetrics(partnerId, timeframe),
      this.getNPSMetrics(partnerId, timeframe),
      this.getAttributionMetrics(partnerId, timeframe),
      this.getCommissionMetrics(partnerId, timeframe),
      this.getQualityMetrics(partnerId, timeframe)
    ]);
    
    return {
      overview: {
        partnerId,
        tier: await this.getPartnerTier(partnerId),
        certificationStatus: await this.getCertificationStatus(partnerId),
        lastUpdated: new Date()
      },
      
      performance: {
        tti: ttiMetrics,
        survival: survivalMetrics,
        quality: qualityMetrics
      },
      
      customer: {
        nps: npsMetrics,
        satisfaction: await this.getSatisfactionMetrics(partnerId, timeframe)
      },
      
      business: {
        attribution: attributionMetrics,
        commissions: commissionMetrics,
        pipeline: await this.getPipelineMetrics(partnerId, timeframe)
      },
      
      trends: {
        ttiTrend: await this.getTTITrend(partnerId, timeframe),
        survivalTrend: await this.getSurvivalTrend(partnerId, timeframe),
        npsTrend: await this.getNPSTrend(partnerId, timeframe)
      }
    };
  }
  
  async getTTIMetrics(partnerId, timeframe) {
    const installations = await this.getPartnerInstallations(partnerId, timeframe);
    
    if (installations.length === 0) {
      return {
        average: 0,
        median: 0,
        p50: 0,
        p75: 0,
        p90: 0,
        p95: 0,
        total: 0,
        trend: 'stable'
      };
    }
    
    const durations = installations.map(i => i.duration);
    durations.sort((a, b) => a - b);
    
    return {
      average: Math.round(durations.reduce((sum, d) => sum + d, 0) / durations.length),
      median: durations[Math.floor(durations.length / 2)],
      p50: durations[Math.floor(durations.length * 0.5)],
      p75: durations[Math.floor(durations.length * 0.75)],
      p90: durations[Math.floor(durations.length * 0.9)],
      p95: durations[Math.floor(durations.length * 0.95)],
      total: installations.length,
      trend: await this.calculateTTITrend(partnerId, timeframe)
    };
  }
  
  async getSurvivalMetrics(partnerId, timeframe) {
    const tests = await this.getSurvivalTests(partnerId, timeframe);
    
    if (tests.length === 0) {
      return {
        average: 0,
        best: 0,
        worst: 0,
        total: 0,
        byPlatform: {},
        trend: 'stable'
      };
    }
    
    const survivalRates = tests.map(t => t.survivalRate);
    
    return {
      average: survivalRates.reduce((sum, rate) => sum + rate, 0) / survivalRates.length,
      best: Math.max(...survivalRates),
      worst: Math.min(...survivalRates),
      total: tests.length,
      byPlatform: this.groupSurvivalByPlatform(tests),
      trend: await this.calculateSurvivalTrend(partnerId, timeframe)
    };
  }
}
```

## GA4 Integration

### Enhanced Ecommerce Tracking
```javascript
class GA4EnhancedTracking {
  async trackPartnerEvent(eventName, parameters) {
    const measurementId = process.env.GA4_MEASUREMENT_ID;
    const apiSecret = process.env.GA4_API_SECRET;
    
    const enhancedParameters = {
      ...parameters,
      custom_dimension_1: parameters.partnerTier || 'unknown',
      custom_dimension_2: parameters.certificationTrack || 'unknown',
      custom_dimension_3: parameters.stack || 'unknown',
      
      // Enhanced ecommerce parameters
      transaction_id: parameters.dealId || null,
      value: parameters.dealValue || 0,
      currency: 'USD',
      
      // Partner-specific parameters
      partner_id: parameters.partnerId,
      campaign_name: parameters.campaign,
      attribution_source: 'partner_referral'
    };
    
    const payload = {
      client_id: parameters.sessionId,
      user_id: parameters.partnerId,
      events: [{
        name: eventName,
        parameters: enhancedParameters
      }]
    };
    
    const response = await fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${measurementId}&api_secret=${apiSecret}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    
    return response.ok;
  }
  
  async trackPartnerConversion(partnerId, conversionData) {
    const events = [
      {
        name: 'generate_lead',
        parameters: {
          partner_id: partnerId,
          lead_id: conversionData.leadId,
          value: conversionData.estimatedValue,
          currency: 'USD'
        }
      },
      {
        name: 'begin_checkout',
        parameters: {
          partner_id: partnerId,
          deal_id: conversionData.dealId,
          value: conversionData.dealValue,
          currency: 'USD'
        }
      },
      {
        name: 'purchase',
        parameters: {
          partner_id: partnerId,
          deal_id: conversionData.dealId,
          transaction_id: conversionData.dealId,
          value: conversionData.dealValue,
          currency: 'USD',
          commission_rate: conversionData.commissionRate
        }
      }
    ];
    
    for (const event of events) {
      await this.trackPartnerEvent(event.name, event.parameters);
    }
  }
}
```

## Testing & Validation

### Metrics Test Suite
```bash
# Test TTI tracking accuracy
npm run test:tti-tracking

# Test survival rate calculation
npm run test:survival-calculation

# Test NPS survey system
npm run test:nps-surveys

# Test attribution funnel
npm run test:attribution-funnel

# Test GA4 integration
npm run test:ga4-integration
```

### Data Quality Validation
```javascript
class MetricsQualityValidator {
  async validateMetricsData(partnerId, timeframe) {
    const validations = [
      this.validateTTIData(partnerId, timeframe),
      this.validateSurvivalData(partnerId, timeframe),
      this.validateNPSData(partnerId, timeframe),
      this.validateAttributionData(partnerId, timeframe)
    ];
    
    const results = await Promise.all(validations);
    
    return {
      overall: results.every(r => r.valid),
      validations: results,
      issues: results.flatMap(r => r.issues),
      qualityScore: this.calculateQualityScore(results)
    };
  }
  
  async validateTTIData(partnerId, timeframe) {
    const installations = await this.getPartnerInstallations(partnerId, timeframe);
    const issues = [];
    
    // Check for missing timestamps
    const missingTimestamps = installations.filter(i => !i.startTime || !i.endTime);
    if (missingTimestamps.length > 0) {
      issues.push(`${missingTimestamps.length} installations missing timestamps`);
    }
    
    // Check for negative durations
    const negativeDurations = installations.filter(i => i.duration < 0);
    if (negativeDurations.length > 0) {
      issues.push(`${negativeDurations.length} installations have negative durations`);
    }
    
    // Check for outlier durations
    const durations = installations.map(i => i.duration).filter(d => d > 0);
    const mean = durations.reduce((sum, d) => sum + d, 0) / durations.length;
    const stdDev = Math.sqrt(durations.reduce((sum, d) => sum + Math.pow(d - mean, 2), 0) / durations.length);
    const outliers = durations.filter(d => Math.abs(d - mean) > 3 * stdDev);
    
    if (outliers.length > durations.length * 0.05) {
      issues.push(`${outliers.length} installations are statistical outliers`);
    }
    
    return {
      valid: issues.length === 0,
      issues,
      score: Math.max(0, 100 - (issues.length * 10))
    };
  }
}
```
