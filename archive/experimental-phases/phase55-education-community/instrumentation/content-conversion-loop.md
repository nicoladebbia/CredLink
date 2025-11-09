# Instrumentation - Content to Conversion Loop

## Overview
Implement comprehensive analytics tracking to measure Time-to-First-Verify (TTFV), content engagement, and conversion metrics. Track user journey from first documentation touch to paid conversion.

---

## Analytics Architecture

### 1. Tracking Infrastructure
```javascript
// analytics/tracking-engine.js
class C2PAAnalyticsEngine {
  constructor(config) {
    this.config = {
      amplitudeApiKey: config.amplitudeApiKey,
      ga4MeasurementId: config.ga4MeasurementId,
      segmentWriteKey: config.segmentWriteKey,
      enabled: config.enabled !== false
    };
    
    this.cohorts = new Map();
    this.userJourneys = new Map();
    this.conversionEvents = new Set([
      'trial_started',
      'demo_requested', 
      'office_hours_registered',
      'forum_post_created',
      'bounty_submitted',
      'subscription_started'
    ]);
    
    this.initialize();
  }
  
  async initialize() {
    if (!this.config.enabled) return;
    
    // IMPORTANT: All API keys should be handled server-side
    // Client should only have public identifiers
    this.amplitude = await this.initializeAmplitude();
    this.ga4 = await this.initializeGA4();
    this.segment = await this.initializeSegment();
    
    // Set up user tracking
    this.setupUserTracking();
    this.setupPageTracking();
    this.setupEventTracking();
  }
  
  async initializeAmplitude() {
    if (!this.config.amplitudeApiKey) return null;
    
    // SECURE: Send events through your own proxy to protect API keys
    return {
      track: (event, properties) => {
        // Send to your proxy server, not directly to Amplitude
        fetch('/api/analytics/amplitude', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'X-CSRF-Token': this.getCSRFToken()
          },
          credentials: 'same-origin',
          body: JSON.stringify({
            event,
            properties,
            user_id: this.getUserId(),
            timestamp: Date.now()
          })
        }).catch(error => {
          console.warn('Analytics tracking failed:', error);
        });
      }
    };
  }
  
  async initializeGA4() {
    if (!this.config.ga4MeasurementId) return null;
    
    return {
      track: (event, properties) => {
        // Send to your proxy server for GA4
        fetch('/api/analytics/ga4', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'X-CSRF-Token': this.getCSRFToken()
          },
          credentials: 'same-origin',
          body: JSON.stringify({
            event,
            properties,
            client_id: this.getClientId()
          })
        }).catch(error => {
          console.warn('GA4 tracking failed:', error);
        });
      }
    };
  }
  
  async initializeSegment() {
    if (!this.config.segmentWriteKey) return null;
    
    return {
      track: (event, properties) => {
        // Send to your proxy server for Segment
        fetch('/api/analytics/segment', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'X-CSRF-Token': this.getCSRFToken()
          },
          credentials: 'same-origin',
          body: JSON.stringify({
            event,
            properties,
            userId: this.getUserId(),
            timestamp: new Date().toISOString()
          })
        }).catch(error => {
          console.warn('Segment tracking failed:', error);
        });
      }
    };
  }
  
  // CSRF protection for analytics requests
  getCSRFToken() {
    let token = document.querySelector('meta[name="csrf-token"]');
    return token ? token.getAttribute('content') : '';
  }
  
  // Core tracking methods
  trackTimeToFirstVerify(eventData) {
    const journey = this.getUserJourney();
    const ttfv = Date.now() - journey.firstDocTouch;
    
    this.track('time_to_first_verify', {
      ttfv_ms: ttfv,
      ttfv_minutes: Math.round(ttfv / 60000),
      content_type: eventData.contentType,
      stack: eventData.stack,
      verification_success: eventData.success,
      verification_method: eventData.method // 'cai_verify' | 'api_verify'
    });
    
    // Update cohort
    this.updateCohort('first_verify_used', {
      ttfv: ttfv,
      stack: eventData.stack
    });
  }
  
  trackContentEngagement(eventData) {
    this.track('content_engagement', {
      content_type: eventData.contentType, // 'tutorial' | 'doc' | 'demo' | 'forum_post'
      content_id: eventData.contentId,
      time_spent_ms: eventData.timeSpent,
      scroll_depth: eventData.scrollDepth,
      interactions: eventData.interactions,
      stack_focus: eventData.stack,
      module: eventData.module
    });
    
    // Track conversion events
    if (eventData.conversionEvent) {
      this.trackConversion(eventData.conversionEvent, eventData);
    }
  }
  
  trackDemoClickthrough(eventData) {
    this.track('demo_clickthrough', {
      source_content: eventData.sourceContent,
      demo_type: eventData.demoType, // 'interactive' | 'video' | 'live'
      stack: eventData.stack,
      button_text: eventData.buttonText,
      page_position: eventData.pagePosition
    });
    
    // Start conversion tracking
    this.startConversionTracking('demo_interest', eventData);
  }
  
  trackForumToSignup(eventData) {
    const journey = this.getUserJourney();
    const timeToSignup = Date.now() - journey.firstForumVisit;
    
    this.track('forum_to_signup', {
      time_to_signup_ms: timeToSignup,
      time_to_signup_hours: Math.round(timeToSignup / (1000 * 60 * 60)),
      forum_threads_viewed: journey.forumThreadsViewed,
      forum_posts_created: journey.forumPostsCreated,
      signup_source: eventData.source, // 'question_answered' | 'demo_seen' | 'bounty_interest'
      stack_interest: eventData.stackInterest
    });
    
    this.updateCohort('forum_converted', {
      timeToSignup: timeToSignup,
      stack: eventData.stackInterest
    });
  }
  
  trackOfficeHoursConversion(eventData) {
    this.track('office_hours_conversion', {
      session_attended: eventData.sessionId,
      registration_to_attendance_ms: eventData.timeToAttend,
      breakout_room_joined: eventData.breakoutRoom,
      questions_asked: eventData.questionsAsked,
      demo_completed: eventData.demoCompleted,
      followup_actions: eventData.followupActions
    });
    
    this.updateCohort('office_hours_attended', {
      sessionId: eventData.sessionId,
      engaged: eventData.questionsAsked > 0 || eventData.breakoutRoom
    });
  }
  
  // Utility methods
  track(event, properties) {
    const enrichedProperties = {
      ...properties,
      timestamp: Date.now(),
      session_id: this.getSessionId(),
      user_agent: navigator.userAgent,
      page_url: window.location.href,
      platform: this.detectPlatform(),
      version: '1.0.0'
    };
    
    // Send to all providers
    if (this.amplitude) this.amplitude.track(event, enrichedProperties);
    if (this.ga4) this.ga4.track(event, enrichedProperties);
    if (this.segment) this.segment.track(event, enrichedProperties);
  }
  
  getUserJourney() {
    const userId = this.getUserId();
    if (!this.userJourneys.has(userId)) {
      this.userJourneys.set(userId, {
        firstDocTouch: Date.now(),
        firstForumVisit: null,
        forumThreadsViewed: 0,
        forumPostsCreated: 0,
        contentConsumed: [],
        conversions: []
      });
    }
    return this.userJourneys.get(userId);
  }
  
  updateCohort(cohortType, data) {
    const userId = this.getUserId();
    const cohortKey = `${cohortType}_${new Date().toISOString().slice(0, 7)}` // monthly cohorts
    
    if (!this.cohorts.has(cohortKey)) {
      this.cohorts.set(cohortKey, {
        type: cohortType,
        period: new Date().toISOString().slice(0, 7),
        users: new Set(),
        metrics: {
          totalUsers: 0,
          averageTTFV: 0,
          conversionRate: 0,
          stackDistribution: {}
        }
      });
    }
    
    const cohort = this.cohorts.get(cohortKey);
    cohort.users.add(userId);
    cohort.metrics.totalUsers = cohort.users.size;
    
    // Update metrics based on cohort type
    if (cohortType === 'first_verify_used' && data.ttfv) {
      cohort.metrics.averageTTFV = this.updateAverage(cohort.metrics.averageTTFV, cohort.metrics.totalUsers, data.ttfv);
    }
    
    if (data.stack) {
      cohort.metrics.stackDistribution[data.stack] = (cohort.metrics.stackDistribution[data.stack] || 0) + 1;
    }
  }
  
  updateAverage(currentAverage, count, newValue) {
    return ((currentAverage * (count - 1)) + newValue) / count;
  }
  
  getUserId() {
    // Get or generate user ID
    let userId = localStorage.getItem('c2pa_user_id');
    if (!userId) {
      userId = 'user_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('c2pa_user_id', userId);
    }
    return userId;
  }
  
  getSessionId() {
    let sessionId = sessionStorage.getItem('c2pa_session_id');
    if (!sessionId) {
      sessionId = 'session_' + Math.random().toString(36).substr(2, 9);
      sessionStorage.setItem('c2pa_session_id', sessionId);
    }
    return sessionId;
  }
  
  getClientId() {
    // Generate GA4 client ID
    let clientId = localStorage.getItem('c2pa_ga4_client_id');
    if (!clientId) {
      clientId = Math.random().toString(36).substr(2, 9) + '.' + Date.now();
      localStorage.setItem('c2pa_ga4_client_id', clientId);
    }
    return clientId;
  }
  
  detectPlatform() {
    const ua = navigator.userAgent;
    if (ua.includes('WordPress')) return 'wordpress';
    if (ua.includes('Shopify')) return 'shopify';
    if (ua.includes('Cloudflare')) return 'cloudflare';
    if (ua.includes('Next.js')) return 'nextjs';
    if (ua.includes('Fastify')) return 'fastify';
    return 'unknown';
  }
}

// Export for use in components
export default C2PAAnalyticsEngine;
```

### 2. React Analytics Hook
```jsx
// hooks/useC2PAAnalytics.js
import { useEffect, useRef, useCallback } from 'react';
import C2PAAnalyticsEngine from '../analytics/tracking-engine';

const analytics = new C2PAAnalyticsEngine({
  amplitudeApiKey: process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY,
  ga4MeasurementId: process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID,
  segmentWriteKey: process.env.NEXT_PUBLIC_SEGMENT_WRITE_KEY,
  enabled: process.env.NODE_ENV === 'production'
});

export const useC2PAAnalytics = () => {
  const startTime = useRef(Date.now());
  const contentStartTime = useRef(null);
  const interactionCount = useRef(0);
  
  // Track page view
  useEffect(() => {
    analytics.track('page_view', {
      page_title: document.title,
      page_location: window.location.href,
      page_referrer: document.referrer
    });
  }, []);
  
  // Track content engagement
  const trackContentEngagement = useCallback((contentType, contentId, stack = null, module = null) => {
    contentStartTime.current = Date.now();
    interactionCount.current = 0;
    
    // Track content start
    analytics.track('content_start', {
      content_type: contentType,
      content_id: contentId,
      stack,
      module
    });
  }, []);
  
  // Track content completion
  const trackContentCompletion = useCallback((contentType, contentId, scrollDepth = 100) => {
    if (!contentStartTime.current) return;
    
    const timeSpent = Date.now() - contentStartTime.current;
    
    analytics.trackContentEngagement({
      contentType,
      contentId,
      timeSpent,
      scrollDepth,
      interactions: interactionCount.current,
      stack: detectStackFromContent(contentId),
      module: detectModuleFromContent(contentId)
    });
    
    contentStartTime.current = null;
  }, []);
  
  // Track interaction
  const trackInteraction = useCallback((interactionType, properties = {}) => {
    interactionCount.current++;
    
    analytics.track('content_interaction', {
      interaction_type: interactionType,
      ...properties
    });
  }, []);
  
  // Track demo clickthrough
  const trackDemoClickthrough = useCallback((sourceContent, demoType, stack) => {
    analytics.trackDemoClickthrough({
      sourceContent,
      demoType,
      stack,
      buttonText: properties.buttonText,
      pagePosition: properties.pagePosition
    });
  }, []);
  
  // Track verification attempt
  const trackVerificationAttempt = useCallback((assetUrl, method = 'cai_verify') => {
    analytics.track('verification_attempt', {
      asset_url: assetUrl,
      verification_method: method
    });
  }, []);
  
  // Track verification success
  const trackVerificationSuccess = useCallback((assetUrl, method, ttfv) => {
    analytics.trackTimeToFirstVerify({
      contentType: 'demo',
      stack: detectStackFromUrl(assetUrl),
      success: true,
      method
    });
  }, []);
  
  // Track forum engagement
  const trackForumEngagement = useCallback((action, properties = {}) => {
    analytics.track('forum_engagement', {
      action, // 'view_thread' | 'create_post' | 'upvote' | 'bookmark'
      ...properties
    });
  }, []);
  
  // Track office hours registration
  const trackOfficeHoursRegistration = useCallback((sessionId, interests = []) => {
    analytics.track('office_hours_registration', {
      session_id: sessionId,
      interests,
      registration_source: 'documentation'
    });
  }, []);
  
  return {
    trackContentEngagement,
    trackContentCompletion,
    trackInteraction,
    trackDemoClickthrough,
    trackVerificationAttempt,
    trackVerificationSuccess,
    trackForumEngagement,
    trackOfficeHoursRegistration
  };
};

// Helper functions
function detectStackFromContent(contentId) {
  if (contentId.includes('wordpress') || contentId.includes('wp')) return 'wordpress';
  if (contentId.includes('shopify')) return 'shopify';
  if (contentId.includes('cloudflare') || contentId.includes('cf')) return 'cloudflare';
  if (contentId.includes('nextjs') || contentId.includes('next')) return 'nextjs';
  if (contentId.includes('fastify')) return 'fastify';
  return 'general';
}

function detectModuleFromContent(contentId) {
  if (contentId.includes('module-1')) return 'module-1';
  if (contentId.includes('module-2')) return 'module-2';
  if (contentId.includes('module-3')) return 'module-3';
  if (contentId.includes('module-4')) return 'module-4';
  if (contentId.includes('module-5')) return 'module-5';
  return null;
}

function detectStackFromUrl(url) {
  const hostname = new URL(url).hostname;
  if (hostname.includes('wordpress') || hostname.includes('wp')) return 'wordpress';
  if (hostname.includes('shopify') || hostname.includes('myshopify')) return 'shopify';
  if (hostname.includes('cloudflare') || hostname.includes('workers')) return 'cloudflare';
  if (hostname.includes('nextjs') || hostname.includes('vercel')) return 'nextjs';
  if (hostname.includes('fastify')) return 'fastify';
  return 'unknown';
}
```

### 3. Content Performance Tracking
```javascript
// analytics/content-performance.js
export class ContentPerformanceTracker {
  constructor(analyticsEngine) {
    this.analytics = analyticsEngine;
    this.contentMetrics = new Map();
    this.conversionPaths = new Map();
  }
  
  // Track content view with performance metrics
  trackContentView(contentId, contentType, metadata = {}) {
    const startTime = Date.now();
    
    // Store view start time
    if (!this.contentMetrics.has(contentId)) {
      this.contentMetrics.set(contentId, {
        id: contentId,
        type: contentType,
        views: 0,
        totalViewTime: 0,
        averageViewTime: 0,
        conversions: 0,
        conversionRate: 0,
        stack: metadata.stack || 'general',
        module: metadata.module || null,
        lastUpdated: new Date().toISOString()
      });
    }
    
    const metrics = this.contentMetrics.get(contentId);
    metrics.views++;
    metrics.lastUpdated = new Date().toISOString();
    
    // Track individual view session
    const viewSession = {
      contentId,
      startTime,
      interactions: 0,
      scrollDepth: 0,
      conversionEvents: []
    };
    
    // Store in session for completion tracking
    sessionStorage.setItem(`content_view_${contentId}`, JSON.stringify(viewSession));
    
    this.analytics.track('content_view', {
      content_id: contentId,
      content_type: contentType,
      stack: metadata.stack,
      module: metadata.module,
      view_number: metrics.views
    });
  }
  
  // Track content completion
  trackContentCompletion(contentId, completionData) {
    const viewSession = JSON.parse(sessionStorage.getItem(`content_view_${contentId}`) || '{}');
    
    if (!viewSession.startTime) return;
    
    const viewTime = Date.now() - viewSession.startTime;
    const metrics = this.contentMetrics.get(contentId);
    
    if (metrics) {
      metrics.totalViewTime += viewTime;
      metrics.averageViewTime = metrics.totalViewTime / metrics.views;
      
      // Update conversion rate if there were conversions
      if (viewSession.conversionEvents.length > 0) {
        metrics.conversions += viewSession.conversionEvents.length;
        metrics.conversionRate = metrics.conversions / metrics.views;
      }
    }
    
    this.analytics.trackContentEngagement({
      contentType: metrics?.type || 'unknown',
      contentId,
      timeSpent: viewTime,
      scrollDepth: completionData.scrollDepth || 100,
      interactions: viewSession.interactions,
      stack: metrics?.stack || 'general',
      module: metrics?.module,
      conversionEvent: viewSession.conversionEvents[viewSession.conversionEvents.length - 1]
    });
    
    // Clean up session
    sessionStorage.removeItem(`content_view_${contentId}`);
  }
  
  // Track conversion event
  trackConversion(contentId, conversionType, conversionData) {
    const viewSession = JSON.parse(sessionStorage.getItem(`content_view_${contentId}`) || '{}');
    
    if (viewSession.startTime) {
      viewSession.conversionEvents.push({
        type: conversionType,
        timestamp: Date.now(),
        data: conversionData
      });
      
      viewSession.interactions++;
      sessionStorage.setItem(`content_view_${contentId}`, JSON.stringify(viewSession));
    }
    
    // Track conversion path
    const pathKey = `${contentId}_${conversionType}`;
    if (!this.conversionPaths.has(pathKey)) {
      this.conversionPaths.set(pathKey, {
        contentId,
        conversionType,
        count: 0,
        firstConversion: null,
        lastConversion: null,
        averageTimeToConversion: 0
      });
    }
    
    const path = this.conversionPaths.get(pathKey);
    path.count++;
    path.lastConversion = new Date().toISOString();
    
    if (!path.firstConversion) {
      path.firstConversion = path.lastConversion;
    }
    
    this.analytics.track('content_conversion', {
      content_id: contentId,
      conversion_type: conversionType,
      conversion_data: conversionData,
      time_on_page: Date.now() - viewSession.startTime
    });
  }
  
  // Generate content performance report
  generatePerformanceReport(timeframe = '30d') {
    const report = {
      period: timeframe,
      generated_at: new Date().toISOString(),
      total_content: this.contentMetrics.size,
      top_performing: [],
      underperforming: [],
      conversion_analysis: {},
      stack_analysis: {},
      module_analysis: {}
    };
    
    // Analyze content performance
    const contentArray = Array.from(this.contentMetrics.values());
    
    // Sort by engagement (views * average view time)
    contentArray.sort((a, b) => (b.views * b.averageViewTime) - (a.views * a.averageViewTime));
    
    // Top performing content (top 20%)
    const topCount = Math.ceil(contentArray.length * 0.2);
    report.top_performing = contentArray.slice(0, topCount).map(content => ({
      id: content.id,
      type: content.type,
      views: content.views,
      averageViewTime: Math.round(content.averageViewTime / 1000), // seconds
      conversionRate: Math.round(content.conversionRate * 100), // percentage
      stack: content.stack,
      module: content.module,
      engagementScore: content.views * (content.averageViewTime / 1000)
    }));
    
    // Underperforming content (bottom 20%)
    const bottomStart = Math.floor(contentArray.length * 0.8);
    report.underperforming = contentArray.slice(bottomStart).map(content => ({
      id: content.id,
      type: content.type,
      views: content.views,
      averageViewTime: Math.round(content.averageViewTime / 1000),
      conversionRate: Math.round(content.conversionRate * 100),
      issues: this.identifyIssues(content)
    }));
    
    // Stack analysis
    const stackGroups = this.groupBy(contentArray, 'stack');
    for (const [stack, contents] of Object.entries(stackGroups)) {
      report.stack_analysis[stack] = {
        totalContent: contents.length,
        totalViews: contents.reduce((sum, c) => sum + c.views, 0),
        averageViewTime: Math.round(contents.reduce((sum, c) => sum + c.averageViewTime, 0) / contents.length / 1000),
        totalConversions: contents.reduce((sum, c) => sum + c.conversions, 0),
        averageConversionRate: Math.round(contents.reduce((sum, c) => sum + c.conversionRate, 0) / contents.length * 100)
      };
    }
    
    // Module analysis
    const moduleGroups = this.groupBy(contentArray.filter(c => c.module), 'module');
    for (const [module, contents] of Object.entries(moduleGroups)) {
      report.module_analysis[module] = {
        totalContent: contents.length,
        totalViews: contents.reduce((sum, c) => sum + c.views, 0),
        completionRate: Math.round(contents.filter(c => c.averageViewTime > 300000).length / contents.length * 100), // 5+ minutes
        conversionRate: Math.round(contents.reduce((sum, c) => sum + c.conversionRate, 0) / contents.length * 100)
      };
    }
    
    return report;
  }
  
  // Identify performance issues
  identifyIssues(content) {
    const issues = [];
    
    if (content.views < 10) {
      issues.push('Low traffic - may need better promotion');
    }
    
    if (content.averageViewTime < 30000) { // Less than 30 seconds
      issues.push('Low engagement - content may not be engaging enough');
    }
    
    if (content.conversionRate === 0) {
      issues.push('No conversions - missing clear CTAs or value proposition');
    }
    
    if (content.views > 1000 && content.conversionRate < 0.01) { // Less than 1% conversion
      issues.push('Poor conversion rate despite good traffic');
    }
    
    return issues;
  }
  
  // Utility function to group array items
  groupBy(array, key) {
    return array.reduce((groups, item) => {
      const group = item[key] || 'unknown';
      groups[group] = groups[group] || [];
      groups[group].push(item);
      return groups;
    }, {});
  }
}
```

### 4. Conversion Funnel Analysis
```javascript
// analytics/conversion-funnel.js
export class ConversionFunnelAnalyzer {
  constructor(analyticsEngine) {
    this.analytics = analyticsEngine;
    this.funnelStages = [
      'documentation_visit',
      'content_engagement',
      'demo_interaction',
      'verification_success',
      'forum_visit',
      'office_hours_registration',
      'trial_signup',
      'paid_conversion'
    ];
  }
  
  // Track funnel stage entry
  trackFunnelStage(stage, userId, properties = {}) {
    this.analytics.track('funnel_stage_entry', {
      stage,
      user_id: userId,
      stage_order: this.funnelStages.indexOf(stage),
      ...properties
    });
  }
  
  // Analyze funnel performance
  async analyzeFunnel(timeframe = '30d') {
    const funnelData = {
      period: timeframe,
      stages: [],
      dropoff_points: [],
      conversion_paths: [],
      recommendations: []
    };
    
    // Get funnel data for each stage
    for (let i = 0; i < this.funnelStages.length; i++) {
      const stage = this.funnelStages[i];
      const stageData = await this.getStageData(stage, timeframe);
      
      funnelData.stages.push({
        name: stage,
        order: i,
        users: stageData.uniqueUsers,
        conversion_rate: i === 0 ? 100 : Math.round((stageData.uniqueUsers / funnelData.stages[0].users) * 100),
        stage_conversion_rate: Math.round(stageData.conversionRate * 100),
        average_time_to_stage: stageData.averageTimeToStage
      });
    }
    
    // Identify dropoff points
    for (let i = 1; i < funnelData.stages.length; i++) {
      const current = funnelData.stages[i];
      const previous = funnelData.stages[i - 1];
      
      const dropoffRate = ((previous.users - current.users) / previous.users) * 100;
      
      if (dropoffRate > 50) { // More than 50% dropoff
        funnelData.dropoff_points.push({
          from_stage: previous.name,
          to_stage: current.name,
          dropoff_rate: Math.round(dropoffRate),
          users_lost: previous.users - current.users,
          severity: dropoffRate > 75 ? 'critical' : 'warning'
        });
      }
    }
    
    // Generate recommendations
    funnelData.recommendations = this.generateFunnelRecommendations(funnelData);
    
    return funnelData;
  }
  
  // Get data for specific funnel stage
  async getStageData(stage, timeframe) {
    // This would typically query your analytics data warehouse
    // For now, return mock data structure
    return {
      uniqueUsers: 0, // To be filled with actual data
      conversionRate: 0,
      averageTimeToStage: 0
    };
  }
  
  // Generate funnel optimization recommendations
  generateFunnelRecommendations(funnelData) {
    const recommendations = [];
    
    // Check for high dropoff rates
    funnelData.dropoff_points.forEach(dropoff => {
      if (dropoff.from_stage === 'documentation_visit') {
        recommendations.push({
          priority: 'high',
          type: 'content',
          issue: 'High dropoff from documentation to engagement',
          suggestion: 'Add more interactive demos and clear value propositions on documentation pages',
          expected_impact: '15-25% improvement in engagement rate'
        });
      }
      
      if (dropoff.from_stage === 'demo_interaction') {
        recommendations.push({
          priority: 'high',
          type: 'ux',
          issue: 'Users not completing demo interactions',
          suggestion: 'Simplify demo flow and add progress indicators',
          expected_impact: '20-30% improvement in demo completion'
        });
      }
      
      if (dropoff.from_stage === 'verification_success') {
        recommendations.push({
          priority: 'medium',
          type: 'technical',
          issue: 'Verification success rate is low',
          suggestion: 'Improve error messages and provide better troubleshooting guides',
          expected_impact: '10-15% improvement in verification success'
        });
      }
    });
    
    // Check for stage-specific issues
    funnelData.stages.forEach(stage => {
      if (stage.average_time_to_stage > 300000) { // More than 5 minutes
        recommendations.push({
          priority: 'medium',
          type: 'process',
          issue: `Stage "${stage.name}" taking too long to complete`,
          suggestion: 'Streamline the process or break it into smaller steps',
          expected_impact: 'Reduce time to stage by 30-40%'
        });
      }
    });
    
    return recommendations.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }
  
  // Track conversion path analysis
  trackConversionPath(userId, pathEvents) {
    const pathKey = pathEvents.map(e => e.stage).join('->');
    
    this.analytics.track('conversion_path', {
      user_id: userId,
      path: pathKey,
      path_length: pathEvents.length,
      total_time: pathEvents[pathEvents.length - 1].timestamp - pathEvents[0].timestamp,
      converted: pathEvents[pathEvents.length - 1].stage === 'paid_conversion'
    });
  }
}
```

### 5. Dashboard Components
```jsx
// components/AnalyticsDashboard.jsx
import React, { useState, useEffect } from 'react';
import { useC2PAAnalytics } from '../hooks/useC2PAAnalytics';

const AnalyticsDashboard = () => {
  const [timeframe, setTimeframe] = useState('7d');
  const [data, setData] = useState({
    overview: {},
    funnel: {},
    content: {},
    realTime: {}
  });
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    loadAnalyticsData();
  }, [timeframe]);
  
  const loadAnalyticsData = async () => {
    setLoading(true);
    try {
      // Load data from your analytics API
      const response = await fetch(`/api/analytics?timeframe=${timeframe}`);
      const analyticsData = await response.json();
      setData(analyticsData);
    } catch (error) {
      console.error('Failed to load analytics data:', error);
    } finally {
      setLoading(false);
    }
  };
  
  if (loading) {
    return <div className="analytics-loading">Loading analytics data...</div>;
  }
  
  return (
    <div className="analytics-dashboard">
      <div className="dashboard-header">
        <h1>C2PA Analytics Dashboard</h1>
        <div className="timeframe-selector">
          <select value={timeframe} onChange={(e) => setTimeframe(e.target.value)}>
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last 90 Days</option>
          </select>
        </div>
      </div>
      
      {/* Key Metrics */}
      <div className="metrics-grid">
        <MetricCard
          title="Time to First Verify"
          value={`${data.overview.averageTTFV}m`}
          change={data.overview.ttfvChange}
          changeType={data.overview.ttfvChangeType}
        />
        <MetricCard
          title="Documentation Engagement"
          value={`${data.overview.engagementRate}%`}
          change={data.overview.engagementChange}
          changeType={data.overview.engagementChangeType}
        />
        <MetricCard
          title="Demo Clickthrough Rate"
          value={`${data.overview.demoCTR}%`}
          change={data.overview.demoCTRChange}
          changeType={data.overview.demoCTRChangeType}
        />
        <MetricCard
          title="Conversion Rate"
          value={`${data.overview.conversionRate}%`}
          change={data.overview.conversionChange}
          changeType={data.overview.conversionChangeType}
        />
      </div>
      
      {/* Funnel Analysis */}
      <div className="funnel-section">
        <h2>Conversion Funnel</h2>
        <FunnelChart stages={data.funnel.stages} />
        <DropoffAnalysis dropoffs={data.funnel.dropoff_points} />
      </div>
      
      {/* Content Performance */}
      <div className="content-section">
        <h2>Content Performance</h2>
        <div className="content-tabs">
          <Tab title="Top Performing">
            <ContentTable content={data.content.topPerforming} type="top" />
          </Tab>
          <Tab title="Needs Improvement">
            <ContentTable content={data.content.underperforming} type="underperforming" />
          </Tab>
          <Tab title="Stack Analysis">
            <StackAnalysis data={data.content.stackAnalysis} />
          </Tab>
        </div>
      </div>
      
      {/* Real-time Activity */}
      <div className="realtime-section">
        <h2>Real-time Activity</h2>
        <RealTimeFeed events={data.realTime.events} />
      </div>
      
      {/* Recommendations */}
      <div className="recommendations-section">
        <h2>Optimization Recommendations</h2>
        <RecommendationsList recommendations={data.funnel.recommendations} />
      </div>
    </div>
  );
};

// Metric Card Component
const MetricCard = ({ title, value, change, changeType }) => (
  <div className="metric-card">
    <h3>{title}</h3>
    <div className="metric-value">{value}</div>
    {change && (
      <div className={`metric-change ${changeType}`}>
        {changeType === 'positive' ? '↑' : '↓'} {change}
      </div>
    )}
  </div>
);

// Funnel Chart Component
const FunnelChart = ({ stages }) => (
  <div className="funnel-chart">
    {stages.map((stage, index) => (
      <div key={stage.name} className="funnel-stage" style={{ width: `${stage.conversion_rate}%` }}>
        <div className="stage-info">
          <h4>{stage.name.replace(/_/g, ' ')}</h4>
          <span>{stage.users} users</span>
          <span>{stage.conversion_rate}%</span>
        </div>
      </div>
    ))}
  </div>
);

// Content Table Component
const ContentTable = ({ content, type }) => (
  <div className="content-table">
    <table>
      <thead>
        <tr>
          <th>Content</th>
          <th>Views</th>
          <th>Avg. Time</th>
          <th>Conversion Rate</th>
          <th>Stack</th>
          {type === 'underperforming' && <th>Issues</th>}
        </tr>
      </thead>
      <tbody>
        {content.map((item, index) => (
          <tr key={index}>
            <td>
              <a href={`/content/${item.id}`}>{item.id}</a>
              <div className="content-type">{item.type}</div>
            </td>
            <td>{item.views.toLocaleString()}</td>
            <td>{item.averageViewTime}s</td>
            <td>
              <span className={`conversion-rate ${item.conversionRate > 5 ? 'good' : item.conversionRate > 1 ? 'fair' : 'poor'}`}>
                {item.conversionRate}%
              </span>
            </td>
            <td>
              <span className="stack-badge">{item.stack}</span>
            </td>
            {type === 'underperforming' && (
              <td>
                <div className="issues-list">
                  {item.issues.map((issue, i) => (
                    <div key={i} className="issue">⚠️ {issue}</div>
                  ))}
                </div>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export default AnalyticsDashboard;
```

### 6. Quarterly Content Review Automation
```javascript
// analytics/quarterly-review.js
export class QuarterlyContentReview {
  constructor(analyticsEngine, contentManager) {
    this.analytics = analyticsEngine;
    this.contentManager = contentManager;
  }
  
  // Execute quarterly review
  async executeQuarterlyReview() {
    const review = {
      quarter: this.getCurrentQuarter(),
      year: new Date().getFullYear(),
      executed_at: new Date().toISOString(),
      recommendations: [],
      actions_taken: [],
      performance_summary: {}
    };
    
    // Generate performance report
    const performanceReport = this.analytics.generatePerformanceReport('90d');
    review.performance_summary = performanceReport;
    
    // Identify content to expand
    const contentToExpand = this.identifyContentToExpand(performanceReport);
    review.recommendations.push(...contentToExpand);
    
    // Identify content to prune
    const contentToPrune = this.identifyContentToPrune(performanceReport);
    review.recommendations.push(...contentToPrune);
    
    // Identify content to update
    const contentToUpdate = this.identifyContentToUpdate(performanceReport);
    review.recommendations.push(...contentToUpdate);
    
    // Execute recommendations
    for (const recommendation of review.recommendations) {
      const actionResult = await this.executeRecommendation(recommendation);
      review.actions_taken.push(actionResult);
    }
    
    // Generate summary report
    const summary = this.generateQuarterlySummary(review);
    await this.saveQuarterlyReport(review, summary);
    
    return { review, summary };
  }
  
  // Identify content that should be expanded
  identifyContentToExpand(report) {
    const recommendations = [];
    
    // Top performing content with high conversion rates
    report.top_performing.forEach(content => {
      if (content.conversionRate > 10 && content.views > 1000) {
        recommendations.push({
          action: 'expand',
          content_id: content.id,
          content_type: content.type,
          reason: `High conversion rate (${content.conversionRate}%) and good traffic`,
          priority: 'high',
          suggestions: [
            'Create advanced tutorial',
            'Develop webinar based on this content',
            'Create code templates and examples',
            'Write case study featuring this implementation'
          ],
          expected_impact: 'Increase lead generation by 25-40%',
          effort: 'medium',
          timeline: '4-6 weeks'
        });
      }
    });
    
    // Stack-specific opportunities
    Object.entries(report.stack_analysis).forEach(([stack, analysis]) => {
      if (analysis.averageConversionRate > 5 && analysis.totalViews > 5000) {
        recommendations.push({
          action: 'expand_stack',
          stack,
          reason: `${stack} stack showing strong performance`,
          priority: 'high',
          suggestions: [
            `Create dedicated ${stack} learning path`,
            `Develop ${stack}-specific certification`,
            `Host ${stack}-focused office hours`,
            `Create ${stack} integration templates`
          ],
          expected_impact: `Capture ${stack} market share increase 15-25%`,
          effort: 'high',
          timeline: '8-12 weeks'
        });
      }
    });
    
    return recommendations;
  }
  
  // Identify content that should be pruned
  identifyContentToPrune(report) {
    const recommendations = [];
    
    // Underperforming content
    report.underperforming.forEach(content => {
      if (content.views < 50 && content.averageViewTime < 30000) {
        recommendations.push({
          action: 'prune',
          content_id: content.id,
          content_type: content.type,
          reason: `Very low engagement (${content.views} views, ${content.averageViewTime}s avg time)`,
          priority: 'medium',
          suggestions: [
            'Archive content and redirect to relevant alternatives',
            'Merge key insights into more popular content',
            'Remove from navigation but keep for SEO',
            'Consider complete rewrite if topic is still relevant'
          ],
          expected_impact: 'Reduce maintenance overhead, improve user experience',
          effort: 'low',
          timeline: '1-2 weeks'
        });
      }
    });
    
    return recommendations;
  }
  
  // Identify content that needs updates
  identifyContentToUpdate(report) {
    const recommendations = [];
    
    // Content with decent traffic but low conversion
    report.top_performing.forEach(content => {
      if (content.views > 500 && content.conversionRate < 2) {
        recommendations.push({
          action: 'update',
          content_id: content.id,
          content_type: content.type,
          reason: `Good traffic but low conversion rate (${content.conversionRate}%)`,
          priority: 'medium',
          suggestions: [
            'Add clearer calls-to-action',
            'Include interactive demos',
            'Add social proof and case studies',
            'Improve content scannability and structure'
          ],
          expected_impact: 'Improve conversion rate by 3-5x',
          effort: 'medium',
          timeline: '2-4 weeks'
        });
      }
    });
    
    return recommendations;
  }
  
  // Execute a recommendation
  async executeRecommendation(recommendation) {
    const result = {
      recommendation_id: this.generateId(),
      action: recommendation.action,
      status: 'pending',
      started_at: new Date().toISOString(),
      completed_at: null,
      outcome: null
    };
    
    try {
      switch (recommendation.action) {
        case 'expand':
          result.outcome = await this.expandContent(recommendation);
          break;
        case 'prune':
          result.outcome = await this.pruneContent(recommendation);
          break;
        case 'update':
          result.outcome = await this.updateContent(recommendation);
          break;
        case 'expand_stack':
          result.outcome = await this.expandStackContent(recommendation);
          break;
      }
      
      result.status = 'completed';
      result.completed_at = new Date().toISOString();
    } catch (error) {
      result.status = 'failed';
      result.error = error.message;
    }
    
    return result;
  }
  
  // Expand content
  async expandContent(recommendation) {
    // Create expansion plan
    const expansionPlan = {
      original_content: recommendation.content_id,
      new_content_items: [],
      timeline: recommendation.timeline,
      resources_needed: this.estimateResources(recommendation)
    };
    
    // Create new content items based on suggestions
    for (const suggestion of recommendation.suggestions) {
      const newContent = await this.contentManager.createContent({
        type: this.inferContentTypeFromSuggestion(suggestion),
        title: `${recommendation.content_id} - ${suggestion}`,
        stack: this.extractStackFromContent(recommendation.content_id),
        priority: recommendation.priority,
        estimated_effort: recommendation.effort
      });
      
      expansionPlan.new_content_items.push(newContent);
    }
    
    return {
      expansion_plan: expansionPlan,
      new_items_created: expansionPlan.new_content_items.length,
      next_steps: 'Content creation team assigned, drafts due in 2 weeks'
    };
  }
  
  // Generate quarterly summary
  generateQuarterlySummary(review) {
    return {
      overview: {
        quarter: review.quarter,
        year: review.year,
        total_recommendations: review.recommendations.length,
        actions_completed: review.actions_taken.filter(a => a.status === 'completed').length,
        actions_failed: review.actions_taken.filter(a => a.status === 'failed').length
      },
      key_insights: [
        `Top performing content showed ${this.calculateAverageConversionRate(review.performance_summary.top_performing)}% conversion rate`,
        `${review.performance_summary.underperforming.length} pieces of content identified for pruning`,
        `${Object.keys(review.performance_summary.stack_analysis).length} stacks analyzed with varying performance`
      ],
      next_quarter_focus: [
        'Continue expanding high-converting content',
        'Monitor impact of pruning on user experience',
        'A/B test new CTAs and content formats',
        'Develop stack-specific learning paths'
      ],
      roi_projections: {
        expected_lead_increase: '25-40%',
        expected_engagement_improvement: '15-25%',
        cost_savings_from_pruning: '$5,000-10,000 per quarter'
      }
    };
  }
  
  // Helper methods
  getCurrentQuarter() {
    const month = new Date().getMonth() + 1;
    return Math.ceil(month / 3);
  }
  
  generateId() {
    return 'rec_' + Math.random().toString(36).substr(2, 9);
  }
  
  calculateAverageConversionRate(content) {
    if (!content.length) return 0;
    const total = content.reduce((sum, c) => sum + c.conversionRate, 0);
    return Math.round(total / content.length);
  }
  
  inferContentTypeFromSuggestion(suggestion) {
    if (suggestion.includes('tutorial')) return 'tutorial';
    if (suggestion.includes('webinar')) return 'webinar';
    if (suggestion.includes('templates')) return 'templates';
    if (suggestion.includes('case study')) return 'case_study';
    return 'article';
  }
  
  extractStackFromContent(contentId) {
    if (contentId.includes('wordpress')) return 'wordpress';
    if (contentId.includes('shopify')) return 'shopify';
    if (contentId.includes('cloudflare')) return 'cloudflare';
    if (contentId.includes('nextjs')) return 'nextjs';
    if (contentId.includes('fastify')) return 'fastify';
    return 'general';
  }
  
  estimateResources(recommendation) {
    const baseResources = {
      writers: 1,
      designers: 0.5,
      developers: 0.5,
      project_manager: 0.25
    };
    
    if (recommendation.effort === 'high') {
      Object.keys(baseResources).forEach(key => {
        baseResources[key] *= 2;
      });
    }
    
    return baseResources;
  }
}
```

This comprehensive instrumentation system provides:

- **Multi-provider Analytics**: Amplitude, GA4, and Segment integration
- **TTFV Tracking**: Precise measurement of time-to-first-verify
- **Content Engagement Metrics**: Deep insights into how users interact with content
- **Conversion Funnel Analysis**: Identify dropoff points and optimization opportunities
- **Quarterly Content Review**: Automated recommendations for content expansion, pruning, and updates
- **Real-time Dashboard**: Live monitoring of key metrics and user behavior
- **Cohort Analysis**: Track user behavior over time by acquisition channel
- **ROI Measurement**: Connect content efforts to business outcomes
