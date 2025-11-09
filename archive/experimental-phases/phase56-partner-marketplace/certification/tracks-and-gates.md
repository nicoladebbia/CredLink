# Certification Tracks & Gates

## Overview
Multi-tier certification system with strict validation requirements, following AWS/Stripe partner program patterns.

## Certification Tracks

### Installer (SMB Stacks)
**Requirements:**
- 3 verified installs (WordPress/Shopify/Cloudflare Workers)
- Remote-manifest survival ≥99.9% in smoke tests
- Pass playbook certification quiz (85% minimum score)
- Accept 2-day incident response SLA
- Sign "No Deceptive Claims" agreement

**Badge:** Certified Installer  
**Directory Rank:** Verified tier unlocked  
**SLA:** 48-hour incident response

### Auditor (Survival Checks + Reports)
**Requirements:**
- 2 public Survival Reports using C2PA SDK/CLI
- Demonstrate Evidence Pack export functionality
- Basic SOC-2 control literacy assessment
- Compliance framework understanding
- Audit trail documentation capabilities

**Badge:** Certified Auditor  
**Directory Rank:** Professional tier unlocked  
**SLA:** 72-hour report delivery

### Enterprise Integrator (Custom CMS/DAM)
**Requirements:**
- 2 enterprise customer references
- Canary/rollback runbook validation
- 4-hour emergency response SLA
- Quarterly penetration test results
- Custom integration architecture review
- Enterprise security assessment

**Badge:** Enterprise Certified  
**Directory Rank:** Premier tier unlocked  
**SLA:** 4-hour critical incident response

## Tier Progression System

### Verified → Advanced → Premier

**Verified Tier:**
- Basic certification completed
- Directory listing with standard visibility
- Access to partner portal
- Standard commission rates (20%)

**Advanced Tier:**
- 6+ successful installations
- NPS ≥ 50 maintained for 3 months
- Co-sell eligibility
- Enhanced commission rates (25%)
- MDF eligibility ($5,000 quarterly)

**Premier Tier:**
- 15+ successful installations
- NPS ≥ 60 maintained for 6 months
- Top directory placement
- Maximum commission rates (30%)
- Premium MDF eligibility ($15,000 quarterly)
- Dedicated partner manager

## Badge Usage Guidelines

### Certified Installer Badge
```html
<!-- Official Badge Usage -->
<img src="/badges/certified-installer.svg" 
     alt="C2PA Certified Installer" 
     class="partner-badge" 
     width="120" height="40">
```

**Usage Rules:**
- Must link to partner directory listing
- Cannot be modified or altered
- Must display current tier status
- Requires active certification status

### Performance Badges
- **Fast Installer**: p50 TTI ≤ 20 minutes on SMB stacks
- **Compliance Pro**: 3+ validated Evidence Pack exports
- **Five-Star NPS**: NPS score ≥ 60 for 2 consecutive quarters

## Certification Process

### 1. Application Submission
```javascript
const certificationApplication = {
  partnerId: "partner-uuid",
  track: "installer|auditor|enterprise",
  tier: "verified|advanced|premier",
  evidence: {
    installations: [...],
    reports: [...],
    references: [...],
    assessments: [...]
  },
  slaAgreement: signed,
  complianceChecklist: completed
};
```

### 2. Automated Validation
- Install verification testing
- Survival rate analysis
- Documentation review
- Security assessment

### 3. Manual Review
- Technical architecture validation
- Customer reference verification
- SLA capability assessment
- Brand compliance check

### 4. Certification Issuance
- Badge generation with expiration
- Directory listing activation
- Partner portal access
- Commission setup

## Recertification Requirements

### Annual Recertification
- Updated evidence submission
- Performance metric validation
- Security assessment renewal
- Compliance checklist review

### Performance-Based Downgrade
- TTI > 30 minutes for 2 consecutive months
- NPS < 40 for 1 quarter
- SLA breach > 3 times in 6 months
- Customer complaint escalation

## Code of Conduct

### Mandatory Requirements
- No deceptive claims about capabilities
- Accurate representation of certification status
- Proper badge usage and attribution
- Customer data protection compliance
- Transparent pricing and SLA communication

### Prohibited Activities
- False certification claims
- Misleading marketing materials
- Customer data misuse
- SLA misrepresentation
- Competitive disparagement

## Implementation Code

### Certification Engine
```javascript
class CertificationEngine {
  constructor() {
    this.tracks = ['installer', 'auditor', 'enterprise'];
    this.tiers = ['verified', 'advanced', 'premier'];
    this.badgeRegistry = new BadgeRegistry();
  }
  
  async validateApplication(application) {
    const validator = this.getValidator(application.track);
    const results = await validator.validate(application.evidence);
    
    return {
      passed: results.passed,
      score: results.score,
      recommendations: results.recommendations,
      nextSteps: results.nextSteps
    };
  }
  
  async issueCertification(partnerId, track, tier) {
    const certification = {
      id: this.generateCertId(),
      partnerId,
      track,
      tier,
      issuedAt: new Date(),
      expiresAt: this.calculateExpiry(),
      badge: await this.badgeRegistry.generateBadge(track, tier)
    };
    
    await this.saveCertification(certification);
    await this.updateDirectoryListing(partnerId, certification);
    
    return certification;
  }
  
  async checkCompliance(partnerId) {
    const certification = await this.getActiveCertification(partnerId);
    const metrics = await this.getPerformanceMetrics(partnerId);
    
    return this.evaluateCompliance(certification, metrics);
  }
}
```

### Badge Generation System
```javascript
class BadgeRegistry {
  generateBadge(track, tier) {
    const badgeConfig = {
      installer: {
        verified: 'certified-installer.svg',
        advanced: 'advanced-installer.svg',
        premier: 'premier-installer.svg'
      },
      auditor: {
        verified: 'certified-auditor.svg',
        advanced: 'advanced-auditor.svg',
        premier: 'premier-auditor.svg'
      },
      enterprise: {
        verified: 'enterprise-certified.svg',
        advanced: 'enterprise-advanced.svg',
        premier: 'enterprise-premier.svg'
      }
    };
    
    return {
      svgUrl: `/badges/${badgeConfig[track][tier]}`,
      alt: `${tier.charAt(0).toUpperCase() + tier.slice(1)} ${track.charAt(0).toUpperCase() + track.slice(1)}`,
      width: 120,
      height: 40,
      expires: this.calculateBadgeExpiry()
    };
  }
}
```

## Testing & Validation

### Certification Test Suite
```bash
# Run installer certification tests
npm run test:certification-installer

# Run auditor certification tests  
npm run test:certification-auditor

# Run enterprise certification tests
npm run test:certification-enterprise

# Validate badge generation
npm run test:badge-generation
```

### Performance Benchmarks
- Installer validation: < 5 minutes
- Auditor assessment: < 24 hours
- Enterprise review: < 72 hours
- Badge generation: < 30 seconds
