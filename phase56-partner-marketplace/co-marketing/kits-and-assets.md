# Co-Marketing Kits & Brand Assets

## One-Pager Templates

### Survival Doctrine One-Pager
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>C2PA Survival Doctrine - Partner One-Pager</title>
    <style>
        .one-pager {
            max-width: 800px;
            margin: 0 auto;
            padding: 40px 20px;
            font-family: 'Inter', sans-serif;
            line-height: 1.6;
        }
        .header {
            text-align: center;
            margin-bottom: 40px;
        }
        .partner-logo {
            max-width: 200px;
            margin-bottom: 20px;
        }
        .doctrine-section {
            margin-bottom: 30px;
            padding: 20px;
            border-left: 4px solid #0066cc;
            background: #f8f9fa;
        }
        .proof-section {
            background: #e8f4fd;
            padding: 30px;
            border-radius: 8px;
            margin: 30px 0;
        }
        .cta-button {
            background: #0066cc;
            color: white;
            padding: 12px 24px;
            border-radius: 6px;
            text-decoration: none;
            display: inline-block;
            margin: 10px 0;
        }
        .metrics {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin: 20px 0;
        }
        .metric-card {
            background: white;
            padding: 20px;
            border-radius: 8px;
            text-align: center;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
    </style>
</head>
<body>
    <div class="one-pager">
        <div class="header">
            <img src="{{PARTNER_LOGO}}" alt="{{PARTNER_NAME}}" class="partner-logo">
            <h1>C2PA Survival Doctrine</h1>
            <p>Protecting Digital Content Integrity in the AI Era</p>
        </div>

        <div class="doctrine-section">
            <h2>Why Survival Matters</h2>
            <p>As AI-generated content floods the internet, provenance has become critical for:</p>
            <ul>
                <li><strong>Trust & Authenticity</strong> - Verify content origins and modifications</li>
                <li><strong>Compliance</strong> - Meet emerging AI Act and DSA requirements</li>
                <li><strong>Brand Protection</strong> - Prevent unauthorized AI manipulation of your content</li>
                <li><strong>Legal Defense</strong> - Maintain evidence trails for copyright and IP disputes</li>
            </ul>
        </div>

        <div class="doctrine-section">
            <h2>Remote-Manifest Specification</h2>
            <blockquote>
                "Remote manifests provide the highest survival rate for provenance data, ensuring content authenticity survives platform transformations, CDN optimizations, and social media sharing."
            </blockquote>
            <p><strong>Key Benefits:</strong></p>
            <ul>
                <li>99.9% survival rate across content transformations</li>
                <li>Centralized provenance management</li>
                <li>Real-time manifest updates</li>
                <li>Platform-agnostic compatibility</li>
            </ul>
        </div>

        <div class="proof-section">
            <h2>Live Proof & Verification</h2>
            <p>See C2PA survival in action with these verified implementations:</p>
            
            {{PROOF_LINKS}}
            
            <div class="metrics">
                <div class="metric-card">
                    <h3>{{SURVIVAL_RATE}}%</h3>
                    <p>Survival Rate</p>
                </div>
                <div class="metric-card">
                    <h3>{{VERIFIED_ASSETS}}</h3>
                    <p>Verified Assets</p>
                </div>
                <div class="metric-card">
                    <h3>{{IMPLEMENTATION_TIME}}</h3>
                    <p>Avg. Implementation Time</p>
                </div>
            </div>
        </div>

        <div class="doctrine-section">
            <h2>Why Badge > Watermark</h2>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                <div>
                    <h4>❌ Traditional Watermarks</h4>
                    <ul>
                        <li>Easily removed or altered</li>
                        <li>Degrade image quality</li>
                        <li>No cryptographic proof</li>
                        <li>Survival rate: ~60%</li>
                    </ul>
                </div>
                <div>
                    <h4>✅ C2PA Badges</h4>
                    <ul>
                        <li>Cryptographically secured</li>
                        <li>Preserve content quality</li>
                        <li>Tamper-evident seals</li>
                        <li>Survival rate: 99.9%</li>
                    </ul>
                </div>
            </div>
        </div>

        <div class="doctrine-section">
            <h2>15-Minute "Green" Checklist</h2>
            <div style="background: #d4edda; padding: 20px; border-radius: 6px;">
                <h3>✅ Quick Implementation Checklist</h3>
                <ol>
                    <li><input type="checkbox"> Install C2PA SDK on your platform</li>
                    <li><input type="checkbox"> Configure remote manifest endpoint</li>
                    <li><input type="checkbox"> Set up automatic badge generation</li>
                    <li><input type="checkbox"> Test with CAI Verify tool</li>
                    <li><input type="checkbox"> Deploy to production environment</li>
                </ol>
                <p><strong>Time to complete:</strong> 15 minutes for basic setup</p>
            </div>
        </div>

        <div class="proof-section">
            <h2>Get Started Today</h2>
            <p>Partner with {{PARTNER_NAME}} for expert C2PA implementation:</p>
            <div style="text-align: center;">
                <a href="{{CONTACT_URL}}" class="cta-button">Schedule Consultation</a>
                <a href="{{DEMO_URL}}" class="cta-button">Request Live Demo</a>
            </div>
            <p style="text-align: center; margin-top: 20px;">
                <strong>Contact:</strong> {{PARTNER_EMAIL}} | <strong>Phone:</strong> {{PARTNER_PHONE}}
            </p>
        </div>
    </div>
</body>
</html>
```

### Template Variables
```javascript
const ONE_PAGER_VARIABLES = {
  PARTNER_NAME: 'Company name',
  PARTNER_LOGO: 'URL to partner logo',
  PARTNER_EMAIL: 'Contact email',
  PARTNER_PHONE: 'Contact phone',
  CONTACT_URL: 'Contact form URL',
  DEMO_URL: 'Demo scheduling URL',
  SURVIVAL_RATE: 'Percentage',
  VERIFIED_ASSETS: 'Number count',
  IMPLEMENTATION_TIME: 'Duration',
  PROOF_LINKS: 'Array of CAI Verify links'
};
```

## Webinar-in-a-Box

### Presentation Structure
```markdown
# C2PA Implementation Webinar Deck

## Slide 1: Title Slide
- Partner logo + C2PA logo
- "Implementing Content Provenance: A Practical Guide"
- Date and presenter information

## Slide 2: The AI Content Crisis
- Statistics on AI-generated content growth
- Trust and authenticity challenges
- Regulatory pressures (AI Act, DSA)

## Slide 3: C2PA Survival Doctrine
- Remote vs embedded manifests
- Survival rate comparison
- Real-world transformation examples

## Slide 4: Live Demo - Strip vs Preserve vs Remote
- Demo 1: Content stripped of provenance
- Demo 2: Embedded manifest (breaks on transformation)
- Demo 3: Remote manifest (survives everything)

## Slide 5: Implementation Roadmap
- 5-minute WordPress setup
- 10-minute Shopify integration
- 15-minute Cloudflare Worker deployment

## Slide 6: "Run Your Own Survival Report" Segment
- Step-by-step survival testing
- Evidence pack generation
- Compliance validation

## Slide 7: Partner Success Stories
- Customer testimonials
- Implementation metrics
- ROI calculations

## Slide 8: Q&A and Next Steps
- Common questions answered
- Implementation resources
- Special partner offers
```

### Demo Script Template
```javascript
const WEBINAR_DEMO_SCRIPT = {
  introduction: {
    duration: '2 minutes',
    script: `Welcome to today's webinar on implementing C2PA content provenance. 
             I'm [NAME] from [PARTNER], and we'll show you how to protect your 
             digital content with cryptographic provenance that survives any transformation.`
  },
  
  stripDemo: {
    duration: '3 minutes',
    script: `Let's see what happens when content is shared without provenance protection.
             [DEMONSTRATE] As you can see, when this image is uploaded to social media,
             resized, and compressed, all provenance information is lost. This is the 
             vulnerability that bad actors exploit.`
  },
  
  preserveDemo: {
    duration: '3 minutes', 
    script: `Now let's try with embedded manifests. [DEMONSTRATE] The embedded 
             provenance survives some transformations, but notice how it breaks when 
             the content is heavily optimized or converted between formats. This 
             gives us about 60% survival rate.`
  },
  
  remoteDemo: {
    duration: '4 minutes',
    script: `Finally, let's see the power of remote manifests. [DEMONSTRATE] 
             No matter how we transform this content - resize, compress, convert formats,
             share across platforms - the provenance remains intact through the HTTP 
             Link header. This gives us 99.9% survival rate.`
  },
  
  survivalReport: {
    duration: '5 minutes',
    script: `Now I'll show you how to run your own Survival Report using our tools.
             [DEMONSTRATE] We'll test content across different platforms, generate 
             an evidence pack, and create a compliance report that you can share 
             with your stakeholders.`
  }
};
```

### MDF Eligibility by Tier
```javascript
const MDF_ELIGIBILITY = {
  verified: {
    eligible: false,
    reason: 'MDF requires Advanced tier or higher',
    alternative: 'Access to standard marketing materials'
  },
  
  advanced: {
    eligible: true,
    quarterlyBudget: 5000,
    approvedUses: [
      'Targeted digital advertising',
      'Industry conference sponsorships', 
      'Customer case study development',
      'Webinar production and promotion'
    ],
    requirements: [
      'Submit marketing plan for approval',
      'Include C2PA co-branding',
      'Provide ROI report within 30 days'
    ]
  },
  
  premier: {
    eligible: true,
    quarterlyBudget: 15000,
    approvedUses: [
      'All Advanced tier uses',
      'Custom event sponsorships',
      'White paper and research development',
      'Joint press releases and media outreach',
      'Executive roundtable events'
    ],
    requirements: [
      'Quarterly marketing strategy review',
      'Dedicated co-marketing manager',
      'Monthly performance reporting',
      'Annual strategic planning session'
    ]
  }
};
```

## Brand & Badge Usage Guidelines

### Downloadable Badge Assets
```javascript
const BADGE_ASSETS = {
  certification: {
    installer: {
      verified: {
        svg: '/badges/certified-installer.svg',
        png: '/badges/certified-installer.png',
        eps: '/badges/certified-installer.eps'
      },
      advanced: {
        svg: '/badges/advanced-installer.svg',
        png: '/badges/advanced-installer.png', 
        eps: '/badges/advanced-installer.eps'
      },
      premier: {
        svg: '/badges/premier-installer.svg',
        png: '/badges/premier-installer.png',
        eps: '/badges/premier-installer.eps'
      }
    },
    
    auditor: {
      verified: {
        svg: '/badges/certified-auditor.svg',
        png: '/badges/certified-auditor.png',
        eps: '/badges/certified-auditor.eps'
      },
      advanced: {
        svg: '/badges/advanced-auditor.svg',
        png: '/badges/advanced-auditor.png',
        eps: '/badges/advanced-auditor.eps'
      },
      premier: {
        svg: '/badges/premier-auditor.svg',
        png: '/badges/premier-auditor.png',
        eps: '/badges/premier-auditor.eps'
      }
    }
  },
  
  performance: {
    fastInstaller: {
      svg: '/badges/fast-installer.svg',
      png: '/badges/fast-installer.png'
    },
    compliancePro: {
      svg: '/badges/compliance-pro.svg',
      png: '/badges/compliance-pro.png'
    },
    fiveStarNPS: {
      svg: '/badges/five-star-nps.svg',
      png: '/badges/five-star-nps.png'
    }
  }
};
```

### Brand Usage Rules
```markdown
# C2PA Partner Brand Guidelines

## Logo Usage
- Maintain minimum clear space equal to the height of the logo
- Do not stretch, distort, or alter logo proportions
- Use approved color versions only
- Minimum size: 120px width for digital, 0.5 inches for print

## Badge Usage
- Must link to partner directory listing
- Cannot be combined with non-certification badges
- Must display current, active certification status
- Required alt text: "[Tier] [Track] - C2PA Certified Partner"

## Co-Branding Rules
- Partner logo may appear alongside C2PA logo
- C2PA logo must be at least 50% size of partner logo
- Use approved color palette and typography
- Include "Certified Partner" designation

## Prohibited Uses
- Implying C2PA endorsement of non-certified products
- Using badges on competitive materials
- Modifying badge designs or colors
- Claiming exclusive partnership status

## Compliance Monitoring
- Quarterly brand compliance reviews
- Automated web scraping for badge misuse
- Partner compliance scorecard
- Remediation process for violations
```

## Asset Generation System

### Dynamic Asset Generator
```javascript
class CoMarketingAssetGenerator {
  async generateOnePager(partnerId, template = 'default') {
    const partner = await this.getPartnerData(partnerId);
    const metrics = await this.getPartnerMetrics(partnerId);
    const proofs = await this.getPartnerProofLinks(partnerId);
    
    const templateData = {
      PARTNER_NAME: partner.companyName,
      PARTNER_LOGO: partner.logoUrl,
      PARTNER_EMAIL: partner.contact.email,
      PARTNER_PHONE: partner.contact.phone,
      CONTACT_URL: partner.contact.contactForm,
      DEMO_URL: this.generateDemoURL(partnerId),
      SURVIVAL_RATE: metrics.survivalRate,
      VERIFIED_ASSETS: metrics.totalInstalls,
      IMPLEMENTATION_TIME: metrics.avgTimeToInstall,
      PROOF_LINKS: this.formatProofLinks(proofs)
    };
    
    const html = await this.renderTemplate('one-pager', templateData, template);
    const pdf = await this.convertToPDF(html);
    
    return {
      html,
      pdf,
      templateData,
      generatedAt: new Date()
    };
  }
  
  async generateWebinarDeck(partnerId, customization = {}) {
    const partner = await this.getPartnerData(partnerId);
    const deckTemplate = await this.loadWebinarTemplate();
    
    const customizedDeck = this.customizeDeck(deckTemplate, {
      partnerLogo: partner.logoUrl,
      partnerName: partner.companyName,
      presenterInfo: customization.presenter || {},
      customSlides: customization.additionalSlides || [],
      brandColors: customization.colors || this.getDefaultBrandColors()
    });
    
    return {
      pptx: await this.generatePowerPoint(customizedDeck),
      pdf: await this.convertToPDF(customizedDeck.html),
      speakerNotes: customizedDeck.speakerNotes
    };
  }
  
  async generateBadgePackage(partnerId) {
    const certification = await this.getCurrentCertification(partnerId);
    const performance = await this.getPerformanceBadges(partnerId);
    
    return {
      certification: await this.generateBadgeAssets(certification),
      performance: await this.generateBadgeAssets(performance),
      usageGuidelines: await this.generateUsageGuidelines(partnerId),
      brandKit: await this.generateBrandKit(partnerId)
    };
  }
}
```

### Asset Distribution API
```javascript
// GET /api/partners/:partnerId/marketing-assets
app.get('/api/partners/:partnerId/marketing-assets', async (req, res) => {
  try {
    const { partnerId } = req.params;
    const { type, format } = req.query;
    
    // Validate partner authorization
    const partner = await partnerService.getPartnerById(partnerId);
    if (!partner || partner.status !== 'active') {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    // Check MDF eligibility for premium assets
    if (type === 'webinar-deck' && partner.tier === 'verified') {
      return res.status(403).json({ error: 'Webinar decks require Advanced tier or higher' });
    }
    
    const assetGenerator = new CoMarketingAssetGenerator();
    
    switch (type) {
      case 'one-pager':
        const onePager = await assetGenerator.generateOnePager(partnerId);
        return res.json(onePager);
        
      case 'webinar-deck':
        const webinarDeck = await assetGenerator.generateWebinarDeck(partnerId);
        return res.json(webinarDeck);
        
      case 'badge-package':
        const badgePackage = await assetGenerator.generateBadgePackage(partnerId);
        return res.json(badgePackage);
        
      default:
        return res.status(400).json({ error: 'Invalid asset type' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate assets' });
  }
});
```

## Testing & Validation

### Asset Test Suite
```bash
# Test one-pager generation
npm run test:one-pager-generation

# Test webinar deck creation
npm run test:webinar-deck-generation

# Validate badge assets
npm run test:badge-assets

# Test brand compliance
npm run test:brand-compliance
```

### Quality Assurance
```javascript
class AssetQualityAssurance {
  async validateAsset(asset, type) {
    const validations = {
      'one-pager': this.validateOnePager,
      'webinar-deck': this.validateWebinarDeck,
      'badge': this.validateBadge
    };
    
    const validator = validations[type];
    if (!validator) {
      throw new Error(`Unknown asset type: ${type}`);
    }
    
    return await validator.call(this, asset);
  }
  
  async validateOnePager(onePager) {
    const issues = [];
    
    // Check required variables are populated
    const requiredVars = ['PARTNER_NAME', 'PARTNER_LOGO', 'SURVIVAL_RATE'];
    for (const variable of requiredVars) {
      if (!onePager.templateData[variable]) {
        issues.push(`Missing required variable: ${variable}`);
      }
    }
    
    // Validate proof links
    for (const proof of onePager.templateData.PROOF_LINKS) {
      if (!await this.isValidProofLink(proof.url)) {
        issues.push(`Invalid proof link: ${proof.url}`);
      }
    }
    
    // Check brand compliance
    if (!await this.checkBrandCompliance(onePager.html)) {
      issues.push('Brand compliance issues detected');
    }
    
    return {
      valid: issues.length === 0,
      issues,
      score: Math.max(0, 100 - (issues.length * 10))
    };
  }
}
```
