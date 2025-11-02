# Data Processing Agreement - C2PA Pilot Program

## Parties
- **Data Controller**: [Client Company Name] ("Controller")
- **Data Processor**: CredLink Inc. ("Processor")

## Purpose
Processing of Content Credentials manifests and technical logs for the purpose of content provenance verification and compliance reporting.

## Data Types (What We Process)

### In Scope:
- **Content Credentials manifests**: JSON-LD metadata files containing provenance information
- **Technical logs**: Asset verification requests, survival metrics, performance data
- **System identifiers**: Asset hashes, route paths, timestamps

### Explicitly Out of Scope:
- **Personally Identifiable Information (PII)**: Names, emails, IP addresses, user data
- **Content assets**: Images, videos, audio files (only metadata processed)
- **User behavior data**: Clicks, views, interactions
- **Business data**: Sales figures, customer information

## Processing Activities

### What Processor Does:
1. **Manifest Generation**: Creates Content Credentials manifests for client assets
2. **Verification Services**: Validates manifest integrity and survival
3. **Performance Monitoring**: Tracks technical metrics (latency, survival rates)
4. **Compliance Reporting**: Generates technical compliance reports
5. **Incident Logging**: Records technical failures and recovery actions

### Data Storage:
- **Location**: AWS R2 (US-East-1) and Cloudflare Workers (global edge)
- **Encryption**: AES-256 at rest, TLS 1.3 in transit
- **Retention**: 24 months for logs, 36 months for manifests
- **Backup**: Daily encrypted backups with 30-day retention

## Security Measures

### Technical Controls:
- **Access Control**: Role-based access, MFA required
- **Encryption**: End-to-end encryption for all data
- **Audit Logging**: Complete audit trail of all data access
- **Vulnerability Management**: Regular security scans and patches

### Compliance Standards:
- **GDPR**: Article 28 compliance with EU SCC addendum
- **SOC 2**: Type II certified controls
- **ISO 27001**: Information security management
- **OWASP**: Security best practices implementation

## Data Subject Rights

### Controller Responsibilities:
- Handle data subject requests (access, deletion, correction)
- Provide privacy notices to end users
- Maintain lawful basis for processing

### Processor Obligations:
- Assist Controller with data subject requests within 5 business days
- Provide data extracts in machine-readable format
- Delete data upon Controller request or contract termination

## International Data Transfers

### EU-US Data Transfers:
- **Mechanism**: Standard Contractual Clauses (SCC)
- **Supplemental Measures**: Enhanced encryption and access controls
- **Documentation**: Transfer impact assessment completed

### Other Jurisdictions:
- **Adequacy Decisions**: Follow EU Commission adequacy findings
- **SCCs**: Standard Contractual Clauses for non-adequate countries
- **Local Laws**: Comply with local data protection requirements

## Sub-Processing

### Approved Sub-processors:
- **Cloudflare**: Edge computing and CDN services
- **AWS**: Cloud storage and computing infrastructure
- **Vercel**: Static hosting and deployment

### Sub-processor Management:
- Written agreements with equivalent data protection obligations
- Right to object to new sub-processors
- Regular audit and assessment of sub-processors

## Data Breach Notification

### Notification Timeline:
- **To Controller**: Within 24 hours of discovery
- **To Authorities**: Within 72 hours where required
- **To Data Subjects**: As required by applicable law

### Notification Content:
- Nature and circumstances of breach
- Types of data affected
- Likely consequences
- Measures taken or proposed

## Audit and Compliance

### Audit Rights:
- **Controller**: Right to audit Processor's compliance
- **Frequency**: Annual audit with ad-hoc requests
- **Scope**: Data processing activities and security measures

### Compliance Certifications:
- **SOC 2 Type II**: Annual independent audit
- **ISO 27001**: Certified information security management
- **GDPR**: Data protection impact assessments
- ** penetration Testing**: Quarterly security testing

## Term and Termination

### Contract Term:
- **Initial Term**: 30 days (pilot period)
- **Renewal**: Month-to-month after pilot
- **Termination**: 30 days written notice

### Data Handling Post-Termination:
- **Return**: All data returned to Controller within 30 days
- **Deletion**: Secure deletion of Controller data
- **Verification**: Certificate of data destruction provided

## Liability and Indemnification

### Processor Liability:
- **Data Breach**: Up to $500,000 per incident
- **Compliance Violations**: Up to $250,000 per violation
- **Data Loss**: Cost of data reconstruction up to $100,000

### Indemnification:
- Processor indemnifies Controller against third-party claims
- Limitations apply as per master services agreement
- Insurance coverage maintained at $2M aggregate

## Contact Information

### Data Protection Officer:
- **Email**: dpo@credlink.io
- **Phone**: +1-555-DPO-HELP
- **Address**: 123 Tech Street, San Francisco, CA 94105

### Emergency Contact:
- **Data Breach**: breach@credlink.io (24/7)
- **Technical Support**: support@credlink.io
- **Legal**: legal@credlink.io

---

**Effective Date**: [Start Date]
**Last Updated**: October 31, 2024
**Version**: 1.0

**Signatures:**

_________________________
[Controller Representative]
Date: _______________

_________________________
[Processor Representative]
Date: _______________
