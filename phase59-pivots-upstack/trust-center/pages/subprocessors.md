# Sub-processors

## Overview

We engage select third-party service providers (sub-processors) to assist in delivering our Content Credentials platform. All sub-processors are carefully vetted for security and compliance, and we maintain contractual safeguards including Data Processing Agreements (DPAs) and Standard Contractual Clauses (SCCs) where applicable.

## Notification of Changes

**30-Day Notice Policy**
- We provide 30 days advance notice before adding new sub-processors
- Notice sent via email to registered customer contacts
- Customers may object to new sub-processors for legitimate reasons
- Alternative arrangements or service termination available if objection sustained

**Subscription**
- Subscribe to sub-processor notifications at: subprocessors@yourdomain.com
- Automatic notification for SOC 2 customers
- RSS feed available: trust.yourdomain.com/subprocessors.rss

## Current Sub-processors

### Infrastructure and Hosting

**Amazon Web Services (AWS)**
- **Purpose**: Cloud infrastructure hosting, compute, storage, database
- **Data Processing Location**: US East (Virginia), US West (Oregon)
- **EU Data**: EU (Frankfurt), EU (Ireland) for EU customers
- **Services Used**: EC2, RDS PostgreSQL, S3, KMS, CloudHSM, CloudFront
- **Security Certifications**: SOC 2 Type II, ISO 27001, PCI DSS Level 1
- **DPA**: AWS Customer Agreement includes GDPR DPA
- **SCCs**: Available via AWS Data Privacy Framework
- **Website**: aws.amazon.com/compliance

**Cloudflare**
- **Purpose**: CDN, DDoS protection, DNS, WAF
- **Data Processing Location**: Global network with EU data residency
- **Services Used**: CDN, DNS, WAF, Rate Limiting
- **Security Certifications**: SOC 2 Type II, ISO 27001
- **DPA**: Available at cloudflare.com/gdpr
- **SCCs**: Included in DPA
- **Website**: cloudflare.com/trust

### Security and Monitoring

**Datadog**
- **Purpose**: Infrastructure monitoring, APM, log aggregation
- **Data Processing Location**: US (with EU instance available)
- **Data Collected**: System metrics, logs, traces (no PII)
- **Security Certifications**: SOC 2 Type II, ISO 27001
- **DPA**: Available at datadog.com/legal/privacy
- **SCCs**: Included in DPA
- **Data Retention**: 15 months
- **Website**: datadog.com/security

**PagerDuty**
- **Purpose**: Incident management, on-call scheduling, alerting
- **Data Processing Location**: US
- **Data Collected**: Incident metadata, on-call schedules (minimal PII)
- **Security Certifications**: SOC 2 Type II
- **DPA**: Available at pagerduty.com/privacy
- **SCCs**: Included in DPA
- **Website**: pagerduty.com/security

**Snyk**
- **Purpose**: Dependency vulnerability scanning, container scanning
- **Data Processing Location**: US, EU options available
- **Data Collected**: Code metadata, dependency lists (no source code stored)
- **Security Certifications**: SOC 2 Type II, ISO 27001
- **DPA**: Available at snyk.io/policies/privacy
- **SCCs**: Included in DPA
- **Website**: snyk.io/trust

### Communications and Support

**SendGrid (Twilio)**
- **Purpose**: Transactional email delivery (account notifications, alerts)
- **Data Processing Location**: US
- **Data Collected**: Email addresses, delivery status
- **Security Certifications**: SOC 2 Type II, ISO 27001
- **DPA**: Available at twilio.com/legal/data-protection-addendum
- **SCCs**: Included in DPA
- **Retention**: 30 days
- **Website**: sendgrid.com/resource/general-data-protection-regulation-2

**Zendesk**
- **Purpose**: Customer support ticketing system
- **Data Processing Location**: US (with EU data center option)
- **Data Collected**: Support ticket content, customer contact info
- **Security Certifications**: SOC 2 Type II, ISO 27001, ISO 27018
- **DPA**: Available at zendesk.com/company/agreements-and-terms/dpa
- **SCCs**: Included in DPA
- **Website**: zendesk.com/product/zendesk-security

### Analytics and Business Intelligence

**Google Analytics**
- **Purpose**: Website analytics (marketing site only, not platform)
- **Data Processing Location**: US
- **Data Collected**: Website usage, demographics (anonymized)
- **Security Certifications**: ISO 27001
- **DPA**: Google Ads Data Processing Terms
- **SCCs**: Included in Google DPA
- **IP Anonymization**: Enabled
- **Website**: privacy.google.com/businesses/compliance

**Stripe**
- **Purpose**: Payment processing, billing
- **Data Processing Location**: US, EU
- **Data Collected**: Billing information, payment methods
- **Security Certifications**: SOC 2 Type II, PCI DSS Level 1
- **DPA**: Available at stripe.com/privacy-center/legal#data-processing-agreement
- **SCCs**: Included in DPA
- **Note**: We do not store or process cardholder data
- **Website**: stripe.com/docs/security/stripe

### Development and Operations

**GitHub**
- **Purpose**: Source code repository, CI/CD pipelines
- **Data Processing Location**: US
- **Data Collected**: Source code, commit metadata, issue tracking
- **Security Certifications**: SOC 2 Type II, ISO 27001
- **DPA**: Available at github.com/customer-terms
- **SCCs**: Included in DPA
- **Access**: Limited to authorized employees only
- **Website**: github.com/security

**Docker Hub**
- **Purpose**: Container image registry
- **Data Processing Location**: US
- **Data Collected**: Container images, metadata
- **Security Certifications**: SOC 2 Type II
- **DPA**: Available at docker.com/legal/data-processing-agreement
- **SCCs**: Available upon request
- **Access**: Private registries with RBAC
- **Website**: docker.com/trust

### Timestamping and PKI

**DigiCert**
- **Purpose**: TSA timestamping (RFC 3161), SSL/TLS certificates
- **Data Processing Location**: US, global timestamp servers
- **Data Collected**: Hash values for timestamps, certificate metadata
- **Security Certifications**: WebTrust for CAs, SOC 2 Type II
- **DPA**: Available at digicert.com/legal
- **Timestamp Retention**: 10+ years
- **Website**: digicert.com/security

**Timestamp Authority (FreeTSA.org - Backup)**
- **Purpose**: Backup RFC 3161 timestamping service
- **Data Processing Location**: EU
- **Data Collected**: Hash values only (no document content)
- **Compliance**: EU-based, GDPR-compliant
- **DPA**: Standard terms available
- **Usage**: Failover only if primary TSA unavailable
- **Website**: freetsa.org

## Data Processing Locations

### Primary Regions

**United States**
- AWS us-east-1 (Virginia) - Primary
- AWS us-west-2 (Oregon) - DR/Failover
- Used for US-based customers and global default

**European Union**
- AWS eu-central-1 (Frankfurt) - EU Primary
- AWS eu-west-1 (Ireland) - EU Secondary
- Used for EU customers with data residency requirements

### Data Residency Options

**US Customers**: Data stored in US regions by default
**EU Customers**: Can elect EU-only data residency
**APAC Customers**: US or EU regions (APAC expansion planned 2026)
**Data Sovereignty**: Regional isolation available upon request

## Sub-processor Security Requirements

All sub-processors must meet the following minimum requirements:

### Security Standards
- ✅ SOC 2 Type II certification (or equivalent)
- ✅ ISO 27001 certification (preferred)
- ✅ Regular third-party security audits
- ✅ Vulnerability management program
- ✅ Incident response procedures

### Data Protection
- ✅ Data Processing Agreement executed
- ✅ Standard Contractual Clauses (for non-EU processors)
- ✅ GDPR compliance (for EU data processing)
- ✅ Data encryption at rest and in transit
- ✅ Data retention and deletion policies

### Access Controls
- ✅ Multi-factor authentication required
- ✅ Role-based access control
- ✅ Regular access reviews
- ✅ Audit logging of data access
- ✅ Background checks for personnel

### Availability and Reliability
- ✅ 99.9% or higher uptime SLA
- ✅ Disaster recovery and business continuity plans
- ✅ Regular backup and restore testing
- ✅ Geographic redundancy

### Compliance and Audit
- ✅ Right to audit (or accept third-party audits)
- ✅ Cooperation with customer audits
- ✅ Breach notification within 24 hours
- ✅ Annual security attestation

## Sub-processor Assessment Process

### Pre-Engagement

1. **Security Questionnaire**: Comprehensive security assessment
2. **Compliance Review**: Verify certifications and compliance posture
3. **DPA Negotiation**: Execute data processing terms
4. **Risk Assessment**: Internal risk scoring and approval
5. **Contract Execution**: Legal and security terms finalized

### Ongoing Monitoring

- **Quarterly Reviews**: SOC 2 report review, incident tracking
- **Annual Reassessment**: Full security questionnaire refresh
- **Continuous Monitoring**: Security news, vulnerability disclosures
- **Incident Response**: Coordinated response to any security events
- **Performance Metrics**: SLA compliance, availability tracking

### Off-boarding

- **Data Deletion**: Verify complete data deletion within 30 days
- **Access Revocation**: Immediate credential and access termination
- **Audit Trail**: Document all data deletion and access revocation
- **Alternative Arrangement**: Migrate to replacement sub-processor if needed

## Customer Rights

### Audit Rights

Customers have the right to:
- Request current sub-processor list
- Object to new sub-processors (30-day notice period)
- Request DPAs and SCCs from sub-processors
- Conduct audits (or accept our SOC 2 as substitute)
- Request evidence of sub-processor compliance

### Objection Process

If you object to a new sub-processor:

1. **Notify**: Email objection to subprocessors@yourdomain.com within 30-day notice period
2. **Reason**: Provide legitimate data protection concerns
3. **Discussion**: We will discuss alternative arrangements
4. **Resolution**: Options include:
   - Alternative sub-processor
   - Service limitation to exclude objected sub-processor
   - Migration to different service tier
   - Service termination without penalty

### Data Subject Requests

When a data subject exercises their rights (access, deletion, etc.):
- We coordinate with relevant sub-processors
- Data deletion requests flow to all sub-processors
- Response time: Within 30 days (GDPR) or 45 days (CCPA)
- Verification: Sub-processors provide deletion confirmation

## Transparency Commitment

We are committed to transparency regarding our use of sub-processors:

**Updates**
- This page updated within 5 business days of any changes
- Email notification sent to subscribed customers
- Version history maintained with change log
- RSS feed for automated monitoring

**Accuracy**
- Quarterly review to ensure accuracy
- Removal of deprecated sub-processors
- Addition of new sub-processors with 30-day advance notice
- Material changes highlighted

**Communication**
- Questions: subprocessors@yourdomain.com
- Objections: subprocessors@yourdomain.com
- Incident Reports: Forward from sub-processors within 24 hours
- Annual Summary: Included in compliance reports

## Frequently Asked Questions

**Q: Can I get a machine-readable list of sub-processors?**
A: Yes, available at: trust.yourdomain.com/api/subprocessors.json

**Q: Do all sub-processors have access to customer data?**
A: No. Some sub-processors (e.g., GitHub, monitoring tools) access only operational metadata, not customer Content Credentials data.

**Q: Can I require EU-only sub-processors?**
A: Yes, contact sales for EU data residency configuration. Note: Some services (e.g., payment processing) may require US-based sub-processors.

**Q: How often are sub-processors audited?**
A: We review SOC 2 reports annually and conduct ongoing monitoring. Customers can request latest audit reports.

**Q: What happens if a sub-processor has a data breach?**
A: We will notify you within 24 hours of learning about any breach affecting your data, per our DPA obligations.

## Contact

**Sub-processor Questions**: subprocessors@yourdomain.com
**Subscribe to Updates**: subprocessors@yourdomain.com
**Object to New Sub-processor**: subprocessors@yourdomain.com
**Request Audit Reports**: compliance@yourdomain.com

---

**Last Updated**: 2025-11-07
**Next Review**: 2026-02-07 (Quarterly)
**Version**: 1.0
**Changelog**: trust.yourdomain.com/subprocessors/changelog
