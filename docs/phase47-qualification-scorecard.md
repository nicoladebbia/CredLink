# Phase 47: 15-Field Qualification Scorecard (MEDDIC-lite)

## Core Fields
1. **Use Case**: newsroom | ads (EU) | marketplace
2. **Stack CDN**: Cloudflare/Fastly/Akamai/Other
3. **Stack CMS**: WP/Shopify/Custom/Other
4. **Optimizer Present**: yes/no
5. **Preserve Toggle Available**: yes/no
6. **Decision Date**: (within 30 days?)
7. **Value Owner**: brand safety | compliance | editorial ops
8. **Volume**: assets/mo; avg variants per asset
9. **Compliance Pressure**: EU exposure (Y/N)
10. **Current Breakage Evidence**: failed CAI links? (drop URLs)
11. **Security Posture**: key custody questions addressed?
12. **Pilot Scope Confirmed**: 200 assets/14 days
13. **Pricing Tier Fit**: $199 / $699 / $2k+ (map via calculator)
14. **Champion Mapped**: Y/N
15. **Next Meeting Booked**: Y/N

## Red Flags
- Custom DAM rewriting metadata
- No header control on CDN/CMS
- No technical resources for implementation
- Compliance timeline > 6 months

## Exit Criteria
- Survival ≥99.9% remote
- CAI links in prod templates
- Decision within 30 days
- Technical champion identified

## Scoring
- **High Qualification**: 12+ fields green, no red flags
- **Medium Qualification**: 8-11 fields green, ≤1 red flag
- **Low Qualification**: <8 fields green or >1 red flag

**References**: The Cloudflare Blog, verify.contentauthenticity.org, Artificial Intelligence Act
