# Partner Directory & Listing Schema

## Public Directory Structure

### Listing Schema (Public View)
```json
{
  "partnerId": "string",
  "companyName": "string",
  "logoUrl": "string",
  "website": "string",
  "regions": ["string"],
  "stacks": ["wordpress", "shopify", "cloudflare-workers", "custom"],
  "certificationTrack": "installer|auditor|enterprise",
  "tier": "verified|advanced|premier",
  "languages": ["string"],
  "metrics": {
    "avgTimeToInstall": "number",
    "npsScore": "number",
    "totalInstalls": "number",
    "survivalRate": "number"
  },
  "proofLinks": [
    {
      "type": "cai-verify|survival-report|evidence-pack",
      "url": "string",
      "title": "string",
      "date": "ISO8601"
    }
  ],
  "contact": {
    "email": "string",
    "phone": "string",
    "contactForm": "string"
  },
  "sla": {
    "responseTime": "string",
    "supportHours": "string",
    "emergencyContact": "string"
  },
  "badges": [
    {
      "type": "certification|performance",
      "name": "string",
      "earnedAt": "ISO8601"
    }
  ],
  "listingStatus": "active|provisional|suspended",
  "lastUpdated": "ISO8601"
}
```

## Ranking Algorithm

### Primary Ranking Factors
1. **Compliance Score** (40% weight)
   - Install SLO compliance rate
   - SLA adherence percentage
   - Certification status currency

2. **Performance Metrics** (30% weight)
   - Number of verified installs
   - Average Time-to-Install (TTI)
   - Survival rate percentage

3. **Customer Satisfaction** (20% weight)
   - Net Promoter Score (NPS)
   - Customer retention rate
   - Support ticket resolution time

4. **Recency & Activity** (10% weight)
   - Latest proof link freshness
   - Recent installation activity
   - Directory profile completeness

### NPS Calculation & Publication
```javascript
class NPSCalculator {
  calculateNPS(responses) {
    const promoters = responses.filter(r => r.score >= 9).length;
    const detractors = responses.filter(r => r.score <= 6).length;
    const passives = responses.filter(r => r.score >= 7 && r.score <= 8).length;
    const total = responses.length;
    
    const promoterPercentage = (promoters / total) * 100;
    const detractorPercentage = (detractors / total) * 100;
    
    return Math.round(promoterPercentage - detractorPercentage);
  }
  
  getNPSCategory(score) {
    if (score >= 60) return 'Five-Star';
    if (score >= 50) return 'Excellent';
    if (score >= 30) return 'Good';
    if (score >= 0) return 'Average';
    return 'Needs Improvement';
  }
}
```

### Ranking Implementation
```javascript
class DirectoryRanking {
  calculateRankScore(partner) {
    const weights = {
      compliance: 0.4,
      performance: 0.3,
      satisfaction: 0.2,
      recency: 0.1
    };
    
    const complianceScore = this.calculateComplianceScore(partner);
    const performanceScore = this.calculatePerformanceScore(partner);
    const satisfactionScore = this.calculateSatisfactionScore(partner);
    const recencyScore = this.calculateRecencyScore(partner);
    
    return {
      total: Math.round(
        complianceScore * weights.compliance +
        performanceScore * weights.performance +
        satisfactionScore * weights.satisfaction +
        recencyScore * weights.recency
      ),
      breakdown: {
        compliance: complianceScore,
        performance: performanceScore,
        satisfaction: satisfactionScore,
        recency: recencyScore
      }
    };
  }
  
  calculateComplianceScore(partner) {
    let score = 0;
    
    // Install SLO compliance (max 40 points)
    score += Math.min(40, partner.metrics.sloComplianceRate * 40);
    
    // SLA adherence (max 30 points)
    score += Math.min(30, partner.sla.adherenceRate * 30);
    
    // Certification currency (max 30 points)
    const daysSinceCert = this.getDaysSinceCertification(partner);
    if (daysSinceCert <= 90) score += 30;
    else if (daysSinceCert <= 180) score += 20;
    else if (daysSinceCert <= 365) score += 10;
    
    return Math.round(score);
  }
  
  calculatePerformanceScore(partner) {
    let score = 0;
    
    // Verified installs (max 40 points)
    score += Math.min(40, partner.metrics.totalInstalls * 2);
    
    // TTI performance (max 30 points)
    const ttiScore = this.calculateTTIScore(partner.metrics.avgTimeToInstall);
    score += ttiScore;
    
    // Survival rate (max 30 points)
    score += Math.min(30, partner.metrics.survivalRate * 30);
    
    return Math.round(score);
  }
  
  calculateTTIScore(avgTTI) {
    if (avgTTI <= 10) return 30; // Excellent
    if (avgTTI <= 20) return 25;  // Very Good
    if (avgTTI <= 30) return 20;  // Good
    if (avgTTI <= 45) return 15;  // Average
    if (avgTTI <= 60) return 10;  // Below Average
    return 5; // Poor
  }
}
```

## Directory API Implementation

### Public Directory Endpoint
```javascript
// GET /api/partners/directory
app.get('/api/partners/directory', async (req, res) => {
  try {
    const {
      region,
      stack,
      track,
      tier,
      minNPS,
      page = 1,
      limit = 20,
      sortBy = 'rank'
    } = req.query;
    
    const filters = this.buildFilters({
      region,
      stack,
      track,
      tier,
      minNPS: minNPS ? parseInt(minNPS) : undefined
    });
    
    const partners = await partnerService.getFilteredPartners(filters);
    const rankedPartners = await rankingService.rankPartners(partners);
    
    const paginatedResults = this.paginate(rankedPartners, page, limit);
    
    res.json({
      partners: paginatedResults.data,
      pagination: paginatedResults.meta,
      filters: {
        availableRegions: await this.getAvailableRegions(),
        availableStacks: await this.getAvailableStacks(),
        availableTracks: await this.getAvailableTracks()
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch directory' });
  }
});
```

### Partner Detail Endpoint
```javascript
// GET /api/partners/:partnerId
app.get('/api/partners/:partnerId', async (req, res) => {
  try {
    const { partnerId } = req.params;
    
    const partner = await partnerService.getPartnerById(partnerId);
    if (!partner) {
      return res.status(404).json({ error: 'Partner not found' });
    }
    
    // Validate proof links
    const validatedProofs = await validationService.validateProofLinks(
      partner.proofLinks
    );
    
    // Calculate real-time metrics
    const realTimeMetrics = await metricsService.getPartnerMetrics(partnerId);
    
    const enrichedPartner = {
      ...partner,
      proofLinks: validatedProofs,
      metrics: realTimeMetrics,
      rankScore: await rankingService.calculateRankScore(partner)
    };
    
    res.json(enrichedPartner);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch partner details' });
  }
});
```

## Search & Filtering

### Advanced Search Implementation
```javascript
class PartnerSearch {
  async searchPartners(query, filters) {
    const searchIndex = await this.buildSearchIndex();
    
    // Text search on company name, description
    const textResults = this.textSearch(searchIndex, query);
    
    // Filter by certification, stack, region
    const filteredResults = this.applyFilters(textResults, filters);
    
    // Sort by relevance + ranking
    const sortedResults = this.sortByRelevance(filteredResults, query);
    
    return sortedResults;
  }
  
  buildSearchIndex() {
    return {
      companies: this.indexCompanyNames(),
      stacks: this.indexStacks(),
      regions: this.indexRegions(),
      certifications: this.indexCertifications()
    };
  }
}
```

## Performance Monitoring

### Directory Analytics
```javascript
class DirectoryAnalytics {
  trackDirectoryView(partnerId, source) {
    analytics.track('partner_directory_view', {
      partnerId,
      source, // 'search', 'browse', 'direct'
      timestamp: new Date(),
      userAgent: req.headers['user-agent'],
      ip: this.getClientIP(req)
    });
  }
  
  trackContactClick(partnerId, contactType) {
    analytics.track('partner_contact_click', {
      partnerId,
      contactType, // 'email', 'phone', 'website'
      timestamp: new Date()
    });
  }
  
  async getDirectoryMetrics(timeframe = '30d') {
    return {
      totalViews: await this.getTotalViews(timeframe),
      uniquePartners: await this.getUniquePartnerViews(timeframe),
      conversionRate: await this.getContactConversionRate(timeframe),
      topViewedPartners: await this.getTopViewedPartners(timeframe, 10),
      searchTrends: await this.getSearchTrends(timeframe)
    };
  }
}
```

## Quality Assurance

### Proof Link Validation
```javascript
class ProofLinkValidator {
  async validateProofLink(proofLink) {
    const { type, url } = proofLink;
    
    switch (type) {
      case 'cai-verify':
        return await this.validateCAIVerifyLink(url);
      case 'survival-report':
        return await this.validateSurvivalReport(url);
      case 'evidence-pack':
        return await this.validateEvidencePack(url);
      default:
        return { valid: false, error: 'Unknown proof type' };
    }
  }
  
  async validateCAIVerifyLink(url) {
    try {
      const response = await fetch(url, { 
        method: 'HEAD',
        timeout: 5000 
      });
      
      if (!response.ok) {
        return { valid: false, error: 'Link not accessible' };
      }
      
      // Verify it's a valid CAI Verify URL
      if (!url.includes('contentauthenticity.org/verify')) {
        return { valid: false, error: 'Invalid CAI Verify URL' };
      }
      
      return { valid: true };
    } catch (error) {
      return { valid: false, error: 'Network error' };
    }
  }
}
```

## Testing & Deployment

### Directory Test Suite
```bash
# Run directory API tests
npm run test:directory-api

# Test ranking algorithm
npm run test:ranking-algorithm

# Validate proof links
npm run test:proof-validation

# Performance tests
npm run test:directory-performance
```

### Deployment Configuration
```yaml
# directory-deployment.yml
version: '3.8'
services:
  directory-api:
    image: c2concierge/partner-directory:latest
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
      - ANALYTICS_API_KEY=${ANALYTICS_API_KEY}
    ports:
      - "3000:3000"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```
