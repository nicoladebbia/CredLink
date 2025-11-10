# LETTER OF INTENT - C2PA Pilot Program

**Date**: [Fill in execution date]  
**Parties**: 
- **Client**: [Fill in client company name] ("Client")
- **Provider**: CredLink Inc. ("CredLink")

## 1. Purpose & Scope

Client intends to conduct a 14-day pilot of CredLink's Content Credentials survival technology to evaluate provenance verification capabilities across Client's digital infrastructure.

**Pilot Scope:**
- **Domains**: [List specific domains]
- **Asset Count**: Up to 200 images
- **Duration**: 14 calendar days
- **Environments**: Production environment only
- **CDN/CMS**: [Specify specific CDN and CMS platforms]

## 2. Success Criteria (Acceptance Tests)

**Technical Gates (Must Pass):**
- Remote manifest survival ≥99.9% on tenant routes
- Embed survival ≥95% on preserve paths
- p95 verify latency <600ms (remote), <800ms (embed)
- ≥200 assets processed across ≥3 routes

**Business Gates (Must Pass):**
- Anonymized public report authorization
- Decision on paid conversion by Day 14

## 3. Pilot-to-Paid Conversion Clause

**Automatic Conversion**: If Day 14 success criteria (Section 2) are met, Client will automatically convert to paid plan on Day 15 unless written cancellation received by end of Day 14.

**Paid Plan Terms**: Growth plan at $699/month includes:
- 50,000 verifications/month
- 10,000 signatures/month
- 3 domains
- SLOs + weekly reports
- Email support

**Cancellation Rights**: Client may cancel conversion by providing written notice to sales@credlink.io before end of Day 14.

## 4. Data Processing & Privacy

**Data Types**: Content Credentials manifests and technical logs only
**No PII**: No personally identifiable information collected or processed
**Retention**: 24 months for logs, 36 months for manifests
**Security**: AES-256 encryption, GDPR compliant
**DPA**: Full Data Processing Agreement attached (Exhibit A)

## 5. Commercial Terms

**Pilot Cost**: Free for 14 days
**Retro-signing**: $0.35 per asset (if applicable)
**Post-Pilot Pricing**: As per Schedule A (attached)

**Payment Terms**: 
- Pilot: No charge
- Paid plan: Monthly in advance via credit card or invoice
- Retro-signing: Billed at pilot completion

## 6. Responsibilities

### CredLink Responsibilities:
- Install and configure injectors/Workers
- Sign up to 200 assets
- Provide daily monitoring dashboard
- Deliver Day 7 and Day 14 reports
- Fix technical issues within 24 hours
- Provide technical support during pilot

### Client Responsibilities:
- Provide access to CMS/CDN configuration
- Designate technical contact for all calls
- Attend scheduled check-ins (Days 3, 7, 10, 14)
- Approve asset selection
- Make decision on paid conversion

## 7. Timeline & Milestones

| Day | Activity | Time | Deliverables |
|-----|----------|------|--------------|
| 0 | Kickoff & Installation | 30 min | 10 assets signed, dashboard live |
| 3 | Check-in #1 | 20 min | Initial survival report |
| 7 | Demo #1 + Report v1 | 25 min | Breakpoint analysis, fix plan |
| 10 | Fix Review | 15 min | Progress update |
| 14 | Final Decision | 25 min | Report v2, conversion decision |

## 8. Exit & Termination

**Early Termination**: Either party may terminate with 24 hours notice
**Data Return**: All data returned within 48 hours of termination
**Final Report**: Exit report provided regardless of outcome
**No Penalty**: No charges for early termination

## 9. Publicity & References

**Anonymized Report**: Client authorizes use of anonymized pilot results in public marketing materials
**Reference**: Client agrees to act as reference if pilot converts to paid
**Approval**: CredLink will obtain approval for any specific mentions

## 10. Limitations & Disclaimers

**Pilot Scope**: Limited to specifications in Section 1
**No Warranty**: Service provided "as is" for evaluation purposes
**No Liability**: Limited to direct damages, maximum $1,000
**Professional Services**: Does not include custom development

## 11. Governing Law & Jurisdiction

**Governing Law**: State of California
**Jurisdiction**: San Francisco County
**Dispute Resolution**: Binding arbitration, AAA rules
**Attorney Fees**: Prevailing party entitled to fees

## 12. Signatures

**By signing below, both parties agree to the terms outlined in this Letter of Intent.**

---

**CLIENT:**

[Fill in client company name]

_________________________
Name: [Fill in client representative name]
Title: [Fill in client title]
Date: _______________

---

**CREDLINK:**

CredLink Inc.

_________________________
Name: [Fill in CredLink representative name]  
Title: [Fill in CredLink title]  
Date: _______________

---

## Schedule A - Pricing Tiers

| Plan | Monthly | Verifications | Signatures | Domains | Support |
|------|---------|---------------|------------|---------|---------|
| Starter | $199 | 5,000 | 2,000 | 1 | Email |
| Growth | $699 | 50,000 | 10,000 | 3 | Email + SLOs |
| Enterprise | $2,000+ | 250,000 | 50,000 | Multi | SSO + SLA |

## Exhibit A - Data Processing Agreement

[Full DPA attached as separate document]

---

**Contact Information:**
- **Technical Questions**: pilot@credlink.io
- **Commercial Questions**: sales@credlink.io
- **Urgent Issues**: +1-555-PILOT-HELP

**Document Version**: 1.0  
**Last Updated**: October 31, 2024
