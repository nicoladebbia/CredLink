# Metrics Framework

**Comprehensive Measurement System for Pricing Experiments**

**Version**: 1.0.0  
**Implementation Date**: November 5, 2025  
**Measurement Window**: 90-day test period

---

## Framework Overview

### Primary Success Metrics

| Metric | Target | Measurement Method | Frequency | Data Source |
|--------|--------|-------------------|-----------|-------------|
| **Gross Margin** | ≥70% | (Revenue - COGS) / Revenue | Daily | Stripe + COGS tracking |
| **Trial-to-Paid** | ≥25% | Trials converting within 14 days | Daily | Amplitude + Stripe |
| **90-Day Retention** | ≥85% (Starter), ≥90% (Growth/Scale) | Active customers after 90 days | Weekly | Amplitude cohort analysis |
| **Net Dollar Retention (NDR)** | ≥110% | Expansion + retention - contraction | Monthly | Revenue tracking |

### Secondary Metrics

| Metric | Target | Measurement Method | Frequency | Data Source |
|--------|--------|-------------------|-----------|-------------|
| **Overage Complaints** | ≤2/100 customers | Support tickets categorized | Daily | Zendesk |
| **Customer Satisfaction** | ≥8.0/10 | NPS/CSAT surveys | Monthly | Survey tools |
| **Upgrade Rate** | ≥15% quarterly | Plan upgrades | Weekly | Stripe |
| **Churn Rate** | ≤5% monthly | Cancellations | Daily | Stripe |
| **Expansion Revenue** | +20% YoY | Upsell/cross-sell | Monthly | Revenue tracking |

---

## Gross Margin Measurement

### COGS Calculation Framework

```javascript
class GrossMarginCalculator {
    constructor() {
        this.cogsComponents = {
            compute: {
                verify: 0.012,  // $0.012 per verify
                sign: 0.043,    // $0.043 per sign
                storage: 0.20   // $0.20 per GB
            },
            tsa: {
                timestamp: 0.001 // $0.001 per timestamp
            },
            support: {
                starter: 15,    // $15/month
                growth: 35,     // $35/month
                scale: 150      // $150/month
            },
            infrastructure: {
                monitoring: 2000,  // $2,000/month allocated
                compliance: 3000,  // $3,000/month allocated
                development: 10000 // $10,000/month allocated
            }
        };
    }
    
    async calculateCustomerGrossMargin(customerId, billingPeriod) {
        // Get revenue data from Stripe
        const revenue = await this.getCustomerRevenue(customerId, billingPeriod);
        
        // Get usage data from meters
        const usage = await this.getCustomerUsage(customerId, billingPeriod);
        
        // Calculate COGS
        const cogs = this.calculateCOGS(usage, revenue.plan);
        
        // Calculate gross margin
        const grossMargin = (revenue.total - cogs.total) / revenue.total;
        
        return {
            customerId,
            billingPeriod,
            plan: revenue.plan,
            revenue: revenue.total,
            cogs: cogs.total,
            grossMargin: grossMargin,
            cogsBreakdown: cogs.breakdown,
            marginStatus: grossMargin >= 0.70 ? 'target_met' : 'below_target'
        };
    }
    
    calculateCOGS(usage, plan) {
        const computeCOGS = 
            (usage.verifies * this.cogsComponents.compute.verify) +
            (usage.signs * this.cogsComponents.compute.sign) +
            (usage.storage * this.cogsComponents.compute.storage);
        
        const tsaCOGS = (usage.verifies + usage.signs) * this.cogsComponents.tsa.timestamp;
        const supportCOGS = this.cogsComponents.support[plan] || 0;
        
        // Allocate infrastructure costs based on usage
        const totalUsage = usage.verifies + usage.signs;
        const infrastructureCOGS = this.allocateInfrastructureCosts(totalUsage);
        
        const totalCOGS = computeCOGS + tsaCOGS + supportCOGS + infrastructureCOGS;
        
        return {
            total: totalCOGS,
            breakdown: {
                compute: computeCOGS,
                tsa: tsaCOGS,
                support: supportCOGS,
                infrastructure: infrastructureCOGS
            }
        };
    }
    
    allocateInfrastructureCosts(usage) {
        const totalMonthlyInfrastructure = 
            this.cogsComponents.infrastructure.monitoring +
            this.cogsComponents.infrastructure.compliance +
            this.cogsComponents.infrastructure.development;
        
        // Simple allocation based on usage percentage
        const totalSystemUsage = 1000000; // System-wide monthly usage
        const usagePercentage = usage / totalSystemUsage;
        
        return totalMonthlyInfrastructure * usagePercentage;
    }
}
```

### Margin Monitoring Dashboard

```javascript
class MarginMonitoringDashboard {
    constructor() {
        this.marginCalculator = new GrossMarginCalculator();
        this.alertThresholds = {
            critical: 0.65,  // Alert if margin < 65%
            warning: 0.70   // Alert if margin < 70%
        };
    }
    
    async generateMarginReport(dateRange) {
        const customers = await this.getActiveCustomers(dateRange);
        const marginData = [];
        
        for (const customer of customers) {
            const margin = await this.marginCalculator.calculateCustomerGrossMargin(
                customer.id, 
                dateRange
            );
            marginData.push(margin);
        }
        
        const aggregateMetrics = this.calculateAggregateMetrics(marginData);
        
        return {
            period: dateRange,
            customerCount: customers.length,
            aggregateMetrics,
            customerMargins: marginData,
            recommendations: this.generateRecommendations(aggregateMetrics)
        };
    }
    
    calculateAggregateMetrics(marginData) {
        const totalRevenue = marginData.reduce((sum, m) => sum + m.revenue, 0);
        const totalCOGS = marginData.reduce((sum, m) => sum + m.cogs, 0);
        const totalGrossMargin = (totalRevenue - totalCOGS) / totalRevenue;
        
        const marginsByPlan = this.groupMarginsByPlan(marginData);
        
        return {
            totalRevenue,
            totalCOGS,
            totalGrossMargin,
            averageMargin: marginData.reduce((sum, m) => sum + m.grossMargin, 0) / marginData.length,
            marginsByPlan,
            belowTargetCustomers: marginData.filter(m => m.grossMargin < 0.70).length,
            criticalCustomers: marginData.filter(m => m.grossMargin < 0.65).length
        };
    }
    
    groupMarginsByPlan(marginData) {
        const grouped = {};
        
        marginData.forEach(m => {
            const plan = m.plan || 'unknown';
            if (!grouped[plan]) {
                grouped[plan] = [];
            }
            grouped[plan].push(m.grossMargin);
        });
        
        // Calculate averages for each plan
        const averages = {};
        for (const [plan, margins] of Object.entries(grouped)) {
            averages[plan] = {
                count: margins.length,
                average: margins.reduce((sum, m) => sum + m, 0) / margins.length,
                min: Math.min(...margins),
                max: Math.max(...margins)
            };
        }
        
        return averages;
    }
}
```

---

## Trial-to-Paid Conversion Measurement

### Conversion Tracking Framework

```javascript
class TrialConversionTracker {
    constructor() {
        this.conversionWindow = 14; // 14-day conversion window
        this.trackingEvents = [
            'trial_started',
            'trial_activated',
            'trial_engaged',
            'trial_converted',
            'trial_expired'
        ];
    }
    
    async trackTrialEvent(customerId, eventType, eventData) {
        const event = {
            customerId,
            eventType,
            timestamp: new Date().toISOString(),
            eventData,
            cohort: await this.assignCohort(customerId)
        };
        
        // Send to analytics platform
        await this.sendToAmplitude(event);
        
        // Store in data warehouse
        await this.storeInDataWarehouse(event);
        
        // Check for conversion milestones
        if (eventType === 'trial_converted') {
            await this.processConversion(customerId, eventData);
        }
    }
    
    async calculateConversionMetrics(startDate, endDate) {
        const trials = await this.getTrialsInPeriod(startDate, endDate);
        const conversions = await this.getConversionsInPeriod(startDate, endDate);
        
        const metrics = {
            totalTrials: trials.length,
            totalConversions: conversions.length,
            conversionRate: conversions.length / trials.length,
            averageTimeToConvert: this.calculateAverageTimeToConvert(trials, conversions),
            conversionByCohort: this.calculateConversionByCohort(trials, conversions),
            conversionFunnel: await this.buildConversionFunnel(trials),
            conversionByPlan: this.calculateConversionByPlan(trials, conversions)
        };
        
        return metrics;
    }
    
    calculateAverageTimeToConvert(trials, conversions) {
        const conversionTimes = [];
        
        conversions.forEach(conversion => {
            const trial = trials.find(t => t.customerId === conversion.customerId);
            if (trial) {
                const timeToConvert = new Date(conversion.timestamp) - new Date(trial.timestamp);
                conversionTimes.push(timeToConvert / (1000 * 60 * 60 * 24)); // Convert to days
            }
        });
        
        if (conversionTimes.length === 0) return 0;
        
        return conversionTimes.reduce((sum, time) => sum + time, 0) / conversionTimes.length;
    }
    
    async buildConversionFunnel(trials) {
        const funnelSteps = [
            'trial_started',
            'trial_activated', 
            'trial_engaged',
            'trial_converted'
        ];
        
        const funnel = {};
        
        for (const step of funnelSteps) {
            const count = trials.filter(trial => 
                trial.events.some(event => event.eventType === step)
            ).length;
            
            funnel[step] = {
                count,
                percentage: (count / trials.length) * 100
            };
        }
        
        return funnel;
    }
    
    async assignCohort(customerId) {
        // Determine which experiment cohort the customer belongs to
        const experimentData = await this.getCustomerExperimentData(customerId);
        return experimentData.cohort || 'control';
    }
}
```

### Conversion Optimization Analysis

```javascript
class ConversionOptimizationAnalyzer {
    constructor() {
        this.conversionTracker = new TrialConversionTracker();
        this.segmentationAttributes = [
            'company_size',
            'industry',
            'geographic_region',
            'acquisition_channel',
            'initial_usage_level'
        ];
    }
    
    async analyzeConversionPatterns(dateRange) {
        const metrics = await this.conversionTracker.calculateConversionMetrics(dateRange.start, dateRange.end);
        
        const analysis = {
            overall: metrics,
            segmentation: await this.analyzeSegmentation(metrics),
            cohortAnalysis: await this.analyzeCohortPerformance(metrics),
            timeSeriesAnalysis: await this.analyzeTimeSeries(dateRange),
            recommendations: this.generateConversionRecommendations(metrics)
        };
        
        return analysis;
    }
    
    async analyzeSegmentation(metrics) {
        const segmentation = {};
        
        for (const attribute of this.segmentationAttributes) {
            const segmentData = await this.getSegmentConversionData(attribute);
            segmentation[attribute] = {
                segments: segmentData,
                topPerforming: this.findTopPerformingSegments(segmentData),
                underperforming: this.findUnderperformingSegments(segmentData)
            };
        }
        
        return segmentation;
    }
    
    async analyzeCohortPerformance(metrics) {
        const cohortPerformance = {};
        
        for (const [cohort, data] of Object.entries(metrics.conversionByCohort)) {
            cohortPerformance[cohort] = {
                conversionRate: data.conversionRate,
                liftVsControl: this.calculateLiftVsControl(data, metrics.conversionByCohort.control),
                statisticalSignificance: this.calculateStatisticalSignificance(data, metrics.conversionByCohort.control),
                recommendation: this.generateCohortRecommendation(cohort, data)
            };
        }
        
        return cohortPerformance;
    }
    
    generateConversionRecommendations(metrics) {
        const recommendations = [];
        
        if (metrics.conversionRate < 0.25) {
            recommendations.push({
                type: 'conversion_rate',
                priority: 'high',
                description: 'Conversion rate below 25% target. Review onboarding flow and value proposition.',
                suggestedActions: [
                    'Simplify trial activation process',
                    'Add guided tours for key features',
                    'Implement proactive trial support'
                ]
            });
        }
        
        if (metrics.averageTimeToConvert > 10) {
            recommendations.push({
                type: 'time_to_convert',
                priority: 'medium',
                description: 'Average time to convert exceeds 10 days. Accelerate value realization.',
                suggestedActions: [
                    'Implement early success metrics',
                    'Add usage-based nudges',
                    'Provide template workflows'
                ]
            });
        }
        
        return recommendations;
    }
}
```

---

## Retention Measurement Framework

### Cohort Analysis System

```javascript
class CohortAnalysisSystem {
    constructor() {
        this.retentionPeriods = [30, 60, 90, 180, 365]; // Days
        this.cohortIntervals = 'weekly'; // Weekly cohorts
    }
    
    async generateCohortAnalysis(startDate, endDate) {
        const cohorts = await this.buildCohorts(startDate, endDate);
        const retentionMatrix = await this.calculateRetentionMatrix(cohorts);
        const survivalAnalysis = await this.performSurvivalAnalysis(cohorts);
        
        return {
            period: { startDate, endDate },
            cohortCount: cohorts.length,
            retentionMatrix,
            survivalAnalysis,
            keyMetrics: this.extractKeyMetrics(retentionMatrix),
            trends: this.analyzeRetentionTrends(retentionMatrix),
            recommendations: this.generateRetentionRecommendations(retentionMatrix)
        };
    }
    
    async buildCohorts(startDate, endDate) {
        const cohorts = [];
        const cohortStart = new Date(startDate);
        const cohortEnd = new Date(endDate);
        
        while (cohortStart <= cohortEnd) {
            const cohortEnd = new Date(cohortStart);
            cohortEnd.setDate(cohortEnd.getDate() + 7); // Weekly cohorts
            
            const customers = await this.getCustomersInCohort(cohortStart, cohortEnd);
            
            const cohort = {
                id: `cohort_${cohortStart.toISOString().split('T')[0]}`,
                startDate: cohortStart.toISOString(),
                endDate: cohortEnd.toISOString(),
                customers: customers,
                size: customers.length
            };
            
            cohorts.push(cohort);
            cohortStart.setDate(cohortStart.getDate() + 7);
        }
        
        return cohorts;
    }
    
    async calculateRetentionMatrix(cohorts) {
        const matrix = {};
        
        for (const cohort of cohorts) {
            matrix[cohort.id] = {};
            
            for (const period of this.retentionPeriods) {
                const retainedCustomers = await this.getRetainedCustomers(
                    cohort.customers,
                    cohort.startDate,
                    period
                );
                
                const retentionRate = retainedCustomers.length / cohort.size;
                
                matrix[cohort.id][period] = {
                    retained: retainedCustomers.length,
                    retentionRate: retentionRate,
                    targetMet: this.checkRetentionTarget(retentionRate, cohort.customers)
                };
            }
        }
        
        return matrix;
    }
    
    checkRetentionTarget(retentionRate, customers) {
        // Determine target based on customer plan mix
        const starterCustomers = customers.filter(c => c.plan === 'starter').length;
        const growthScaleCustomers = customers.filter(c => c.plan !== 'starter').length;
        
        if (growthScaleCustomers > starterCustomers) {
            return retentionRate >= 0.90; // 90% target for Growth/Scale
        } else {
            return retentionRate >= 0.85; // 85% target for Starter
        }
    }
    
    async performSurvivalAnalysis(cohorts) {
        const survivalData = {
            overall: await this.calculateSurvivalCurve(cohorts),
            byPlan: await this.calculateSurvivalByPlan(cohorts),
            byCohort: await this.calculateSurvivalByCohort(cohorts)
        };
        
        return survivalData;
    }
    
    async calculateSurvivalCurve(cohorts) {
        const allCustomers = cohorts.flatMap(c => c.customers);
        const survivalPoints = [];
        
        for (let day = 0; day <= 365; day += 7) { // Weekly points
            const survivingCustomers = await this.getSurvivingCustomers(
                allCustomers,
                day
            );
            
            const survivalRate = survivingCustomers.length / allCustomers.length;
            
            survivalPoints.push({
                day,
                survivalRate,
                survivingCustomers: survivingCustomers.length
            });
        }
        
        return survivalPoints;
    }
}
```

### Retention Prediction Model

```javascript
class RetentionPredictionModel {
    constructor() {
        this.riskFactors = [
            'usage_decline',
            'support_tickets',
            'payment_issues',
            'feature_adoption',
            'engagement_score'
        ];
        
        this.riskThresholds = {
            low: 0.2,
            medium: 0.5,
            high: 0.8
        };
    }
    
    async predictChurnRisk(customerId, lookaheadDays = 30) {
        const customerData = await this.getCustomerBehaviorData(customerId, 90);
        const riskScore = await this.calculateRiskScore(customerData);
        const riskLevel = this.categorizeRiskLevel(riskScore);
        
        const prediction = {
            customerId,
            riskScore,
            riskLevel,
            churnProbability: riskScore,
            lookaheadDays,
            keyFactors: await this.identifyKeyRiskFactors(customerData),
            recommendedActions: this.generateInterventionActions(riskLevel),
            confidence: this.calculatePredictionConfidence(customerData)
        };
        
        return prediction;
    }
    
    async calculateRiskScore(customerData) {
        let riskScore = 0;
        const factorWeights = {
            usage_decline: 0.3,
            support_tickets: 0.2,
            payment_issues: 0.2,
            feature_adoption: 0.15,
            engagement_score: 0.15
        };
        
        // Usage decline factor
        const usageTrend = this.calculateUsageTrend(customerData.usage);
        riskScore += Math.max(0, -usageTrend) * factorWeights.usage_decline;
        
        // Support tickets factor
        const supportScore = this.calculateSupportRiskScore(customerData.support);
        riskScore += supportScore * factorWeights.support_tickets;
        
        // Payment issues factor
        const paymentScore = this.calculatePaymentRiskScore(customerData.payments);
        riskScore += paymentScore * factorWeights.payment_issues;
        
        // Feature adoption factor
        const adoptionScore = this.calculateAdoptionRiskScore(customerData.features);
        riskScore += adoptionScore * factorWeights.feature_adoption;
        
        // Engagement score factor
        const engagementScore = this.calculateEngagementRiskScore(customerData.engagement);
        riskScore += engagementScore * factorWeights.engagement_score;
        
        return Math.min(1.0, riskScore);
    }
    
    generateInterventionActions(riskLevel) {
        const actions = {
            low: [
                'Monitor usage patterns',
                'Send periodic engagement emails',
                'Provide tips and best practices'
            ],
            medium: [
                'Proactive customer success outreach',
                'Personalized training session',
                'Usage optimization consultation',
                'Feature adoption campaign'
            ],
            high: [
                'Immediate customer success manager intervention',
                'Executive outreach for at-risk accounts',
                'Custom retention plan development',
                'Discount or service upgrade offer',
                'Weekly check-in calls'
            ]
        };
        
        return actions[riskLevel] || actions.low;
    }
}
```

---

## Net Dollar Retention (NDR) Measurement

### NDR Calculation Framework

```javascript
class NetDollarRetentionCalculator {
    constructor() {
        this.ndrComponents = {
            startingRevenue: 0,
            expansionRevenue: 0,
            contractionRevenue: 0,
            churnRevenue: 0,
            reactivationRevenue: 0
        };
    }
    
    async calculateNDR(customerIds, period) {
        const ndrData = {
            period,
            customerCount: customerIds.length,
            components: { ...this.ndrComponents },
            detailedBreakdown: []
        };
        
        for (const customerId of customerIds) {
            const customerNDR = await this.calculateCustomerNDR(customerId, period);
            ndrData.detailedBreakdown.push(customerNDR);
            
            // Aggregate components
            ndrData.components.startingRevenue += customerNDR.startingRevenue;
            ndrData.components.expansionRevenue += customerNDR.expansionRevenue;
            ndrData.components.contractionRevenue += customerNDR.contractionRevenue;
            ndrData.components.churnRevenue += customerNDR.churnRevenue;
            ndrData.components.reactivationRevenue += customerNDR.reactivationRevenue;
        }
        
        // Calculate NDR formula
        const endingRevenue = ndrData.components.startingRevenue + 
                            ndrData.components.expansionRevenue + 
                            ndrData.components.reactivationRevenue - 
                            ndrData.components.contractionRevenue - 
                            ndrData.components.churnRevenue;
        
        ndrData.ndr = ndrData.components.startingRevenue > 0 ? 
            endingRevenue / ndrData.components.startingRevenue : 0;
        
        ndrData.ndrPercentage = Math.round(ndrData.ndr * 100);
        ndrData.targetMet = ndrData.ndr >= 1.10; // 110% target
        
        return ndrData;
    }
    
    async calculateCustomerNDR(customerId, period) {
        const subscriptionHistory = await this.getSubscriptionHistory(customerId, period);
        
        const startingRevenue = this.getStartingRevenue(subscriptionHistory, period);
        const expansionRevenue = this.calculateExpansionRevenue(subscriptionHistory, period);
        const contractionRevenue = this.calculateContractionRevenue(subscriptionHistory, period);
        const churnRevenue = this.calculateChurnRevenue(subscriptionHistory, period);
        const reactivationRevenue = this.calculateReactivationRevenue(subscriptionHistory, period);
        
        const endingRevenue = startingRevenue + expansionRevenue + reactivationRevenue - 
                            contractionRevenue - churnRevenue;
        
        const customerNDR = startingRevenue > 0 ? endingRevenue / startingRevenue : 0;
        
        return {
            customerId,
            startingRevenue,
            expansionRevenue,
            contractionRevenue,
            churnRevenue,
            reactivationRevenue,
            endingRevenue,
            ndr: customerNDR,
            ndrPercentage: Math.round(customerNDR * 100),
            expansionEvents: this.getExpansionEvents(subscriptionHistory),
            contractionEvents: this.getContractionEvents(subscriptionHistory)
        };
    }
    
    calculateExpansionRevenue(subscriptionHistory, period) {
        let expansionRevenue = 0;
        
        subscriptionHistory.forEach(change => {
            if (change.type === 'upgrade' || change.type === 'add_on_purchase') {
                if (this.isInPeriod(change.timestamp, period)) {
                    expansionRevenue += change.revenueImpact;
                }
            }
        });
        
        return expansionRevenue;
    }
    
    calculateContractionRevenue(subscriptionHistory, period) {
        let contractionRevenue = 0;
        
        subscriptionHistory.forEach(change => {
            if (change.type === 'downgrade' || change.type === 'add_on_cancellation') {
                if (this.isInPeriod(change.timestamp, period)) {
                    contractionRevenue += Math.abs(change.revenueImpact);
                }
            }
        });
        
        return contractionRevenue;
    }
}
```

### NDR Analysis and Optimization

```javascript
class NDROptimizationAnalyzer {
    constructor() {
        this.ndrCalculator = new NetDollarRetentionCalculator();
        this.expansionDrivers = [
            'usage_growth',
            'plan_upgrades',
            'add_on_adoption',
            'seat_expansion',
            'international_expansion'
        ];
    }
    
    async analyzeNDROptimization(customerSegment, period) {
        const customers = await this.getCustomersBySegment(customerSegment);
        const ndrData = await this.ndrCalculator.calculateNDR(customers, period);
        
        const analysis = {
            overall: ndrData,
            expansionAnalysis: await this.analyzeExpansionDrivers(ndrData),
            contractionAnalysis: await this.analyzeContractionDrivers(ndrData),
            improvementOpportunities: await this.identifyImprovementOpportunities(ndrData),
            recommendations: this.generateNDROptimizationRecommendations(ndrData)
        };
        
        return analysis;
    }
    
    async analyzeExpansionDrivers(ndrData) {
        const expansionAnalysis = {
            totalExpansion: ndrData.components.expansionRevenue,
            expansionByDriver: {},
            topExpandingCustomers: [],
            expansionRate: ndrData.components.expansionRevenue / ndrData.components.startingRevenue
        };
        
        // Analyze expansion by driver
        ndrData.detailedBreakdown.forEach(customer => {
            customer.expansionEvents.forEach(event => {
                if (!expansionAnalysis.expansionByDriver[event.type]) {
                    expansionAnalysis.expansionByDriver[event.type] = {
                        revenue: 0,
                        customers: 0
                    };
                }
                expansionAnalysis.expansionByDriver[event.type].revenue += event.revenueImpact;
                expansionAnalysis.expansionByDriver[event.type].customers += 1;
            });
        });
        
        // Find top expanding customers
        expansionAnalysis.topExpandingCustomers = ndrData.detailedBreakdown
            .filter(c => c.expansionRevenue > 0)
            .sort((a, b) => b.expansionRevenue - a.expansionRevenue)
            .slice(0, 10);
        
        return expansionAnalysis;
    }
    
    generateNDROptimizationRecommendations(ndrData) {
        const recommendations = [];
        
        if (ndrData.ndr < 1.10) {
            recommendations.push({
                type: 'ndr_target',
                priority: 'high',
                description: `NDR of ${ndrData.ndrPercentage}% is below 110% target`,
                suggestedActions: [
                    'Focus on expansion revenue growth',
                    'Reduce downgrades through proactive support',
                    'Implement usage-based growth programs'
                ]
            });
        }
        
        const expansionRate = ndrData.components.expansionRevenue / ndrData.components.startingRevenue;
        if (expansionRate < 0.15) {
            recommendations.push({
                type: 'expansion_rate',
                priority: 'medium',
                description: `Expansion rate of ${Math.round(expansionRate * 100)}% is below 15% target`,
                suggestedActions: [
                    'Identify upsell opportunities through usage analysis',
                    'Create expansion-focused customer success programs',
                    'Develop targeted add-on promotions'
                ]
            });
        }
        
        return recommendations;
    }
}
```

---

## Real-Time Metrics Dashboard

### Dashboard Implementation

```javascript
class PricingMetricsDashboard {
    constructor(config) {
        this.config = config;
        this.refreshInterval = config.refreshInterval || 30000; // 30 seconds
        this.updateInterval = null;
        this.marginCalculator = new GrossMarginCalculator();
        this.conversionTracker = new TrialConversionTracker();
        this.cohortAnalyzer = new CohortAnalysisSystem();
        this.ndrCalculator = new NetDollarRetentionCalculator();
        
        this.alertThresholds = {
            grossMargin: { warning: 0.70, critical: 0.65 },
            conversionRate: { warning: 0.20, critical: 0.15 },
            retention90Day: { warning: 0.80, critical: 0.75 },
            ndr: { warning: 1.05, critical: 1.00 }
        };
    }
    
    async initializeDashboard() {
        await this.loadInitialData();
        this.startRealTimeUpdates();
        this.setupAlertMonitoring();
    }
    
    async loadInitialData() {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 3); // Last 3 months
        
        const [marginData, conversionData, retentionData, ndrData] = await Promise.all([
            this.marginCalculator.generateMarginReport({ startDate, endDate }),
            this.conversionTracker.calculateConversionMetrics(startDate, endDate),
            this.cohortAnalyzer.generateCohortAnalysis(startDate, endDate),
            this.ndrCalculator.calculateNDR(await this.getActiveCustomers(), { startDate, endDate })
        ]);
        
        this.updateDashboardUI({
            margin: marginData,
            conversion: conversionData,
            retention: retentionData,
            ndr: ndrData,
            lastUpdated: new Date().toISOString()
        });
    }
    
    startRealTimeUpdates() {
        // Clear any existing interval
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
        
        this.updateInterval = setInterval(async () => {
            await this.refreshMetrics();
        }, this.refreshInterval);
    }
    
    stopRealTimeUpdates() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }
    
    async refreshMetrics() {
        try {
            // Get latest data for key metrics
            const latestMetrics = await this.getLatestMetrics();
            
            // Update UI with new data
            this.updateRealTimeUI(latestMetrics);
            
            // Check for alerts
            await this.checkMetricAlerts(latestMetrics);
            
        } catch (error) {
            console.error('Error refreshing metrics:', error);
        }
    }
    
    async checkMetricAlerts(metrics) {
        const alerts = [];
        
        // Check gross margin
        if (metrics.margin.totalGrossMargin < this.alertThresholds.grossMargin.critical) {
            alerts.push({
                type: 'critical',
                metric: 'gross_margin',
                value: metrics.margin.totalGrossMargin,
                threshold: this.alertThresholds.grossMargin.critical,
                message: 'Gross margin below critical threshold'
            });
        } else if (metrics.margin.totalGrossMargin < this.alertThresholds.grossMargin.warning) {
            alerts.push({
                type: 'warning',
                metric: 'gross_margin',
                value: metrics.margin.totalGrossMargin,
                threshold: this.alertThresholds.grossMargin.warning,
                message: 'Gross margin below warning threshold'
            });
        }
        
        // Check other metrics similarly...
        
        if (alerts.length > 0) {
            await this.sendAlerts(alerts);
        }
    }
}
```

---

## Integration with Experiment Framework

### Experiment Metrics Integration

```javascript
class ExperimentMetricsIntegration {
    constructor() {
        this.experimentCohorts = ['control', 'caps_experiment', 'bundle_experiment', 'overage_experiment', 'annual_experiment'];
        this.primaryMetrics = ['gross_margin', 'conversion_rate', 'retention_90_day', 'ndr'];
    }
    
    async trackExperimentMetrics(experimentId, cohortId, customerId, eventData) {
        const experimentEvent = {
            experimentId,
            cohortId,
            customerId,
            timestamp: new Date().toISOString(),
            eventData,
            metricImpact: await this.calculateMetricImpact(eventData)
        };
        
        // Store for experiment analysis
        await this.storeExperimentEvent(experimentEvent);
        
        // Update real-time experiment dashboard
        await this.updateExperimentDashboard(experimentId, cohortId, experimentEvent);
    }
    
    async calculateExperimentResults(experimentId, endDate) {
        const results = {};
        
        for (const cohortId of this.experimentCohorts) {
            const cohortMetrics = await this.getCohortMetrics(experimentId, cohortId, endDate);
            results[cohortId] = {
                metrics: cohortMetrics,
                statisticalSignificance: await this.calculateStatisticalSignificance(cohortMetrics),
                liftVsControl: await this.calculateLiftVsControl(cohortMetrics, results.control?.metrics)
            };
        }
        
        return {
            experimentId,
            endDate,
            results,
            winner: this.determineExperimentWinner(results),
            recommendations: this.generateExperimentRecommendations(results)
        };
    }
}
```

---

*Last Updated: November 5, 2025*  
**Data Sources**: Stripe, Amplitude, Zendesk, Internal COGS tracking  
**Update Frequency**: Real-time for critical metrics, daily for comprehensive analysis  
**Alerting**: Automated alerts for metric threshold breaches
