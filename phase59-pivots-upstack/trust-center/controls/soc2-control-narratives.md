# SOC 2 Control Narratives
## Phase 59 Content Credentials Platform

**Organization**: YourDomain Inc.
**System**: Content Credentials Custody & Analytics Platform
**Scope**: Security + Availability Trust Services Criteria
**Audit Period Type I**: Point-in-time as of 2025-11-01
**Audit Period Type II**: 2025-11-01 to 2026-04-30 (180 days)
**Auditor**: [Auditor Firm Name], AICPA SOC Suite Recognized

---

## System Description

### Overview

The Phase 59 platform provides enterprise-grade custody and analytics services for Content Credentials (C2PA manifests). The system enables customers to:

1. **Custody SKU**: Provision and manage signing keys in FIPS 140-2 validated HSMs, sign C2PA manifests, and maintain evidence packs with RFC 3161 timestamps
2. **Analytics SKU**: Ingest third-party verify results and generate survival analytics, compliance packs, and breakage analysis

### System Components

**Infrastructure**
- Cloud Provider: AWS (us-east-1 primary, us-west-2 DR)
- Compute: EC2 instances (auto-scaling groups)
- Database: RDS PostgreSQL (Multi-AZ)
- Storage: S3 (versioning enabled, encryption at rest)
- HSM: CloudHSM (FIPS 140-2 Level 3)
- CDN: CloudFront

**Software**
- API Server: Node.js/Express
- Authentication: JWT (HS256)
- Encryption: TLS 1.3, AES-256-GCM
- Monitoring: Data dog, CloudWatch
- Logging: Winston, centralized via CloudWatch Logs

**People**
- Engineering: 5 engineers
- Security: 1 security engineer, fractional CISO
- Operations: SRE team, on-call rotation
- Leadership: CTO, Engineering Manager

**Procedures**
- Change Management: GitOps, pull request reviews
- Incident Response: PagerDuty, runbooks, quarterly drills
- Access Control: MFA enforced, quarterly access reviews
- Security: Annual pen-tests, weekly vulnerability scans

**Data**
- Customer Data: C2PA manifests, signing keys, verify results
- Metadata: Tenant info, API usage, audit logs
- Retention: Per customer contract (1-10 years)
- Deletion: Secure deletion upon contract termination

---

## Common Criteria (CC) - Required for All SOC 2 Reports

### CC1: Control Environment

**CC1.1 - Integrity and Ethical Values**

**Control Objective**: The entity demonstrates a commitment to integrity and ethical values.

**Control Description**:
- Code of Conduct established and acknowledged by all employees
- Annual ethics training required for all employees
- Whistleblower hotline available for ethical concerns
- Background checks performed for all employees with system access
- Disciplinary procedures documented for policy violations

**Evidence**:
- Code of Conduct document (signed acknowledgments)
- Training completion records
- Background check confirmations
- HR policy documentation

**Control Owner**: Human Resources

---

**CC1.2 - Board Independence and Oversight**

**Control Objective**: The board of directors demonstrates independence and exercises oversight of system objectives and risks.

**Control Description**:
- Board meets quarterly to review security and compliance matters
- Independent board members with security/compliance expertise
- Audit committee oversees SOC 2 program and results
- Management reports security incidents and audit findings to board

**Evidence**:
- Board meeting minutes
- Audit committee charter
- Quarterly security reports to board

**Control Owner**: Executive Team

---

**CC1.3 - Organizational Structure**

**Control Objective**: Management establishes structures, reporting lines, and appropriate authorities and responsibilities.

**Control Description**:
- Organization chart defining reporting relationships
- Documented roles and responsibilities for security functions
- Security Officer reports to CTO
- Clear escalation paths for security incidents
- Segregation of duties enforced (dev, ops, security)

**Evidence**:
- Organization chart
- Role descriptions
- Segregation of duties matrix

**Control Owner**: Human Resources / Engineering Leadership

---

**CC1.4 - Competence**

**Control Objective**: The entity demonstrates commitment to recruit, develop, and retain competent individuals.

**Control Description**:
- Technical screening and interviews for all engineering hires
- Onboarding program includes security training within first week
- Annual security awareness training mandatory
- Quarterly phishing simulation exercises
- Performance reviews include security responsibilities

**Evidence**:
- Job descriptions with required qualifications
- Training completion records
- Phishing simulation results
- Performance review templates

**Control Owner**: Human Resources

---

**CC1.5 - Accountability**

**Control Objective**: The entity holds individuals accountable for their responsibilities related to the system.

**Control Description**:
- Performance goals include security objectives
- Security incidents reviewed in performance evaluations
- Disciplinary action for security policy violations
- Recognition program for security contributions
- Quarterly metrics tracked (training completion, phishing click rates, etc.)

**Evidence**:
- Performance review documentation
- Security metrics reports
- Incident response records

**Control Owner**: Engineering Management

---

### CC2: Communication and Information

**CC2.1 - Internal Communication**

**Control Objective**: The entity obtains or generates and uses relevant, quality information to support internal control.

**Control Description**:
- Security policies published on internal wiki
- Weekly engineering all-hands includes security updates
- Slack channels for security discussions and alerts
- Incident reports distributed to leadership within 24 hours
- Monthly security metrics dashboard

**Evidence**:
- Internal wiki security section
- Meeting agendas and notes
- Slack message archives
- Incident reports

**Control Owner**: Security Team

---

**CC2.2 - External Communication**

**Control Objective**: The entity communicates with external parties regarding matters affecting internal control.

**Control Description**:
- Trust Center publicly available with security information
- Status page for real-time service status
- Incident notifications sent to customers per SLA
- Security contact (security@yourdomain.com) monitored 24/7
- Annual transparency reports published

**Evidence**:
- Trust Center content
- Status page incidents
- Customer notification emails
- Security@ email logs

**Control Owner**: Customer Success / Security

---

### CC3: Risk Assessment

**CC3.1 - Service Commitments and System Requirements**

**Control Objective**: The entity specifies objectives with sufficient clarity to enable identification and assessment of risks.

**Control Description**:
- SLOs defined: 99.95% availability (Custody), 99.9% (Analytics)
- Security objectives documented (confidentiality, integrity, availability)
- Compliance requirements identified (GDPR, CCPA, SOC 2)
- Performance targets: API p95 < 200ms, error rate < 0.1%

**Evidence**:
- SLA/SLO documentation
- Security policy
- Compliance roadmap

**Control Owner**: Product Management

---

**CC3.2 - Risk Identification**

**Control Objective**: The entity identifies risks to the achievement of its objectives.

**Control Description**:
- Annual risk assessment conducted
- Threat modeling for new features
- Vulnerability scans weekly (Snyk, npm audit)
- Penetration tests annually
- Risk register maintained and reviewed quarterly

**Evidence**:
- Risk assessment report
- Threat models
- Vulnerability scan results
- Penetration test reports
- Risk register

**Control Owner**: Security Team

---

**CC3.3 - Risk Analysis**

**Control Objective**: The entity analyzes identified risks as a basis for determining how the risks should be managed.

**Control Description**:
- Risks scored using likelihood and impact matrix
- Risk treatment decisions documented (accept, mitigate, transfer, avoid)
- Residual risk calculated after controls
- Risk owners assigned for each identified risk
- Quarterly risk review meetings

**Evidence**:
- Risk analysis methodology
- Risk treatment plans
- Risk register with scores and owners

**Control Owner**: Security Team / Engineering Management

---

**CC3.4 - Fraud Risk**

**Control Objective**: The entity assesses fraud risks.

**Control Description**:
- Fraud risk scenarios identified (account takeover, API abuse, etc.)
- Rate limiting enforced (100 req/15min general, 10 custody/15min)
- Anomaly detection for unusual API patterns
- Multi-factor authentication required for admin access
- Segregation of duties prevents single-person fraud

**Evidence**:
- Fraud risk assessment
- Rate limiting configuration
- MFA enforcement policy
- Anomaly detection alerts

**Control Owner**: Security Team

---

### CC4: Monitoring Activities

**CC4.1 - Ongoing and Periodic Evaluations**

**Control Objective**: The entity monitors system components and evaluates results.

**Control Description**:
- 24/7 automated monitoring via Datadog and CloudWatch
- Weekly vulnerability scans
- Monthly access reviews
- Quarterly control self-assessments
- Annual penetration tests
- Annual SOC 2 audits

**Evidence**:
- Monitoring dashboards
- Vulnerability scan results
- Access review reports
- Control test results
- Audit reports

**Control Owner**: SRE Team / Security

---

**CC4.2 - Evaluation and Communication of Deficiencies**

**Control Objective**: The entity evaluates and communicates deficiencies in a timely manner.

**Control Description**:
- Critical findings escalated immediately to CTO
- High findings reviewed within 24 hours
- Remediation plans created with SLAs (critical: 7 days, high: 30 days)
- Quarterly control deficiency report to audit committee
- External audit findings tracked to completion

**Evidence**:
- Escalation procedures
- Remediation tracking system
- Audit committee reports
- Finding closure documentation

**Control Owner**: Security Team

---

### CC5: Control Activities

**CC5.1 - Selection and Development of Control Activities**

**Control Objective**: The entity selects and develops control activities that contribute to mitigation of risks.

**Control Description**:
- Controls aligned to NIST SP 800-53 Rev. 5 control families
- Defense-in-depth strategy (network, host, application)
- Preventive controls (input validation, access controls)
- Detective controls (logging, monitoring, alerting)
- Corrective controls (incident response, backups)

**Evidence**:
- NIST control mapping
- Security architecture diagram
- Control documentation

**Control Owner**: Security Team / Engineering

---

**CC5.2 - Technology Controls**

**Control Objective**: The entity develops control activities over technology.

**Control Description**:
- Infrastructure as Code (Terraform) with version control
- Immutable infrastructure (container-based)
- Automated security testing in CI/CD (lint, dependency scan, SAST)
- Configuration management (CIS benchmarks)
- Patch management (OS patches weekly, dependency updates within 48 hours)

**Evidence**:
- IaC repository
- CI/CD pipeline configuration
- CIS benchmark compliance scans
- Patch logs

**Control Owner**: SRE Team

---

**CC5.3 - Policies and Procedures**

**Control Objective**: The entity establishes policies and procedures to support control activities.

**Control Description**:
- Information Security Policy (reviewed annually)
- Acceptable Use Policy
- Incident Response Policy
- Change Management Policy
- Data Retention and Deletion Policy
- All policies approved by leadership and published internally

**Evidence**:
- Policy documents with approval signatures
- Policy review logs
- Policy acknowledgment records

**Control Owner**: Security Team / Legal

---

### CC6: Logical and Physical Access Controls

**CC6.1 - Logical Access**

**Control Objective**: The entity restricts logical access to system resources.

**Control Description**:
- JWT-based authentication with HS256 (32+ char secrets)
- MFA required for all administrative access
- Role-based access control (RBAC)
- Tenant isolation enforced in application and database
- API key rotation every 90 days
- Session timeouts (15 minutes for access tokens)

**Evidence**:
- Authentication logs
- MFA enforcement configuration
- RBAC matrix
- API key rotation logs

**Control Owner**: Engineering / Security

---

**CC6.2 - Account Management**

**Control Objective**: The entity implements controls for user account provisioning and de-provisioning.

**Control Description**:
- Onboarding: Accounts provisioned via ticket, least privilege
- Offboarding: Access revoked within 2 hours of termination
- Transfers: Access re-certified during role changes
- Quarterly access reviews (all access, privileged access)
- Automated deprovisioning integrated with HR system

**Evidence**:
- Access provisioning tickets
- Termination checklist
- Access review reports
- HR system integration logs

**Control Owner**: IT / HR

---

**CC6.3 - Access Credentials**

**Control Objective**: The entity protects access credentials.

**Control Description**:
- Passwords: Minimum 12 characters, complexity required
- Password storage: Bcrypt hashed, salted
- MFA: Required for privileged access (Google Authenticator, YubiKey)
- API keys: Stored encrypted, rotated automatically
- SSH keys: 4096-bit RSA minimum, managed in AWS Secrets Manager

**Evidence**:
- Password policy configuration
- MFA enrollment records
- Secrets Manager audit logs

**Control Owner**: Engineering / Security

---

**CC6.4 - Network Security**

**Control Objective**: The entity restricts network access.

**Control Description**:
- VPC with private subnets for application and database tiers
- Security groups: Least privilege, documented rules
- Web Application Firewall (WAF) with OWASP Top 10 rules
- DDoS protection via CloudFlare
- Network segmentation: Prod isolated from dev/staging
- VPN required for SSH access to instances

**Evidence**:
- VPC architecture diagram
- Security group rules
- WAF configuration
- VPN access logs

**Control Owner**: SRE / Security

---

**CC6.5 - Physical Access (Cloud)**

**Control Objective**: The entity restricts physical access to facilities.

**Control Description**:
- Cloud-based infrastructure (AWS)
- AWS SOC 2 Type II attestation covers physical security
- No customer-managed data centers
- Office access: Badge-required, visitor log
- Laptops: Full disk encryption, auto-lock after 5 minutes

**Evidence**:
- AWS SOC 2 report
- Office visitor log
- Laptop encryption policy

**Control Owner**: IT / Facilities

---

**CC6.6 - Data Classification and Encryption**

**Control Objective**: The entity protects data based on classification.

**Control Description**:
- Data classified: Highly Sensitive (keys, PII), Sensitive (credentials), Internal, Public
- Encryption at rest: AES-256-GCM for all sensitive data
- Encryption in transit: TLS 1.3 minimum
- Key management: AWS KMS with automatic rotation
- Signing keys: CloudHSM (FIPS 140-2 Level 3)
- Database: TDE enabled on PostgreSQL

**Evidence**:
- Data classification policy
- Encryption configuration
- KMS key rotation logs
- FIPS 140-2 certificates

**Control Owner**: Engineering / Security

---

### CC7: System Operations

**CC7.1 - Change Management**

**Control Objective**: The entity implements change management controls.

**Control Description**:
- GitOps: All changes via pull requests
- Peer review required for all code changes
- Change Advisory Board approves production changes
- Automated testing in CI/CD (unit, integration, security)
- Blue-green deployments for zero-downtime
- Rollback procedure documented and tested

**Evidence**:
- Git commit history
- Pull request approvals
- CAB meeting minutes
- CI/CD pipeline logs
- Deployment logs

**Control Owner**: Engineering Management

---

**CC7.2 - Capacity Management**

**Control Objective**: The entity maintains capacity to meet objectives.

**Control Description**:
- Auto-scaling groups: Min 3, max 50 instances
- Database: Read replicas added automatically at 80% CPU
- Monthly capacity planning reviews
- Load testing before major releases
- 30% capacity buffer maintained
- CloudWatch alarms for resource utilization

**Evidence**:
- Auto-scaling configuration
- Capacity planning reports
- Load test results
- CloudWatch dashboards

**Control Owner**: SRE Team

---

**CC7.3 - Data Backup and Recovery**

**Control Objective**: The entity maintains data backups and recovery capabilities.

**Control Description**:
- Database: Continuous backups + daily snapshots
- Retention: 35 days for point-in-time recovery
- Cross-region replication to us-west-2
- Quarterly backup restoration tests
- RTO: < 4 hours, RPO: < 15 minutes
- Disaster recovery plan documented and tested

**Evidence**:
- Backup configuration
- Backup restoration test reports
- DR plan document
- DR drill results

**Control Owner**: SRE Team

---

**CC7.4 - Malicious Software**

**Control Objective**: The entity protects against malicious software.

**Control Description**:
- Endpoint protection on all workstations (CrowdStrike)
- Container image scanning (Snyk)
- Dependency vulnerability scanning (npm audit, Snyk)
- Zero vulnerabilities policy in production
- Immutable infrastructure (container replacement, not patching)
- Security updates within 48 hours of disclosure

**Evidence**:
- Endpoint protection logs
- Container scan results
- Dependency scan results
- Patch logs

**Control Owner**: Security / SRE

---

### CC8: Change Management

**CC8.1 - Infrastructure and Software Changes**

**Control Objective**: The entity implements controls over infrastructure and software changes.

**Control Description**:
- Infrastructure as Code (Terraform) in version control
- Application code in Git with branch protection
- Staging environment mirrors production
- Automated testing gates deployment
- Production changes require approval
- Emergency change process documented

**Evidence**:
- IaC repository
- Git repository with branch protection
- CI/CD pipeline configuration
- Emergency change procedure

**Control Owner**: Engineering / SRE

---

### CC9: Risk Mitigation

**CC9.1 - Vendor Management**

**Control Objective**: The entity manages risks from use of vendors.

**Control Description**:
- Vendor security assessments before engagement
- DPAs executed with all data processors
- SOC 2 reports reviewed annually for critical vendors
- Sub-processor list maintained and updated quarterly
- 30-day notice for new sub-processors
- Vendor incident notification required within 24 hours

**Evidence**:
- Vendor security questionnaires
- DPA contracts
- Vendor SOC 2 reports
- Sub-processor list
- Vendor notification emails

**Control Owner**: Security / Procurement

---

## Availability (A) - Additional Criteria

### A1.1 - Environmental Protections

**Control Objective**: The entity maintains environmental protections.

**Control Description**:
- Cloud-based infrastructure (AWS handles physical environment)
- Multi-AZ deployment for redundancy
- Geographic diversity: us-east-1 and us-west-2
- AWS SOC 2 covers data center environmental controls

**Evidence**:
- AWS SOC 2 report
- Multi-AZ configuration
- Architecture diagram

**Control Owner**: SRE

---

### A1.2 - Availability Monitoring**

**Control Objective**: The entity monitors system availability.

**Control Description**:
- Synthetic monitoring every 60 seconds from 5 global locations
- Uptime tracking per component
- SLO dashboard: 99.95% target (Custody), 99.9% (Analytics)
- Real-time alerts for service degradation
- Public status page: status.yourdomain.com

**Evidence**:
- Monitoring configuration
- Uptime reports
- Alert history
- Status page

**Control Owner**: SRE

---

### A1.3 - Incident Response and Recovery**

**Control Objective**: The entity responds to and recovers from incidents affecting availability.

**Control Description**:
- 24/7 on-call rotation (PagerDuty)
- Incident classification (P1/P2/P3/P4)
- Response SLAs: P1 15 min, P2 30 min, P3 60 min
- Incident runbooks for common scenarios
- Post-mortems required for P1/P2 (within 5 days)
- Quarterly disaster recovery drills

**Evidence**:
- PagerDuty configuration
- Incident tickets
- Runbooks
- Post-mortem reports
- DR drill results

**Control Owner**: SRE / Engineering Management

---

## Control Testing and Evidence

### Type I Evidence (Design at Point-in-Time)

**Required for Type I Audit**:
- Policy documents (current versions as of audit date)
- Configuration screenshots (as of audit date)
- System architecture diagrams
- Organization charts and role descriptions
- Evidence that controls are designed properly

**Testing Approach**:
- Review of documented policies and procedures
- Inspection of configurations
- Inquiry with control owners
- Walkthrough of processes

### Type II Evidence (Operating Effectiveness Over Time)

**Required for Type II Audit** (180-day period):
- Logs: Authentication, access, changes, backups, monitoring
- Tickets: Incidents, changes, access requests
- Reports: Weekly vulnerability scans, monthly access reviews, quarterly audits
- Training: Completion records for all employees
- Tests: Backup restoration, DR drills, penetration tests

**Testing Approach**:
- Sampling of evidence across audit period (typically 25-40 samples per control)
- Observation of control execution
- Re-performance of control activities
- Analysis of exception reports

---

## Control Owners

| Control Area | Primary Owner | Backup Owner |
|--------------|---------------|--------------|
| CC1 - Control Environment | HR / Leadership | Legal |
| CC2 - Communication | Security / Marketing | Customer Success |
| CC3 - Risk Assessment | Security | Engineering Mgmt |
| CC4 - Monitoring | SRE | Security |
| CC5 - Control Activities | Engineering | Security |
| CC6 - Access Controls | Security | IT |
| CC7 - System Operations | SRE | Engineering |
| CC8 - Change Management | Engineering Mgmt | SRE |
| CC9 - Risk Mitigation | Security / Procurement | Legal |
| A1 - Availability | SRE | Engineering |

---

**Document Version**: 1.0
**Last Updated**: 2025-11-07
**Next Review**: Quarterly or upon material changes
**Approved By**: CTO, CISO (or equivalent)
**Auditor Access**: Available for audit examination
