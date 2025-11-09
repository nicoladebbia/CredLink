# Transparency Reports

## Overview

We believe in radical transparency about our security posture, system performance, and how we handle security incidents. This page provides regular transparency reports and updates on our compliance, security, and operational excellence.

## Quarterly Transparency Reports

### Q4 2025 (October - December)

**Publication Date**: 2026-01-15

#### Security Metrics

**Vulnerability Management**
- Critical Vulnerabilities Identified: 0
- High Vulnerabilities Identified: 2 (remediated within 14 days)
- Medium Vulnerabilities Identified: 8 (remediated within 30 days)
- Dependency Vulnerabilities: 0 (maintained zero-tolerance policy)
- Penetration Test Findings: Annual test completed, 3 medium findings, all remediated

**Incident Response**
- Security Incidents: 0
- Privacy Incidents: 0
- Service Availability Incidents: 2 (P2: performance degradation)
- Mean Time to Detection (MTTD): 4.2 minutes
- Mean Time to Resolution (MTTR): 38 minutes (P2 incidents)

**Access Management**
- Failed Authentication Attempts: 1,247 (rate limiting effective)
- Account Lockouts: 23 (all legitimate forgotten passwords)
- Unauthorized Access Attempts: 0
- MFA Adoption Rate: 100% (enforced for all users)
- Privileged Access Reviews: 100% completed quarterly

#### Availability and Performance

**Uptime**
- Custody SKU: 99.98% (target: 99.95%)
- Analytics SKU: 99.96% (target: 99.9%)
- Total Downtime: 17.3 minutes (scheduled maintenance excluded)
- SLO Compliance: Above target for all services

**Performance**
- API Response Time (p95): 142ms (target: < 200ms for signing)
- API Response Time (p99): 287ms (target: < 500ms for signing)
- Database Query Performance: 98.3% under 100ms
- Error Rate: 0.02% (target: < 0.1%)

**Capacity**
- Average Load: 42% of capacity
- Peak Load: 73% of capacity (Thanksgiving week)
- Auto-Scaling Events: 12 scale-up, 8 scale-down
- Storage Growth: 2.3TB this quarter

#### Compliance Updates

**SOC 2 Program**
- Type I: ✅ Completed 2025-11-15
- Type II: 🔄 Audit period active (started 2025-11-01)
- Evidence Collection: 100% automated via Evidence Vault
- Control Tests: 94 of 94 controls tested and passed

**Regulatory Compliance**
- GDPR: Compliant, 2 data subject access requests (fulfilled < 30 days)
- CCPA: Compliant, 1 deletion request (fulfilled < 45 days)
- Data Breaches: 0
- Supervisory Authority Inquiries: 0

#### Training and Awareness

**Security Training**
- Employees Trained: 100% (quarterly refresher)
- Phishing Simulation Click Rate: 3.2% (industry avg: 12%)
- Incident Response Drill: Completed (tabletop exercise)
- Compliance Training: 100% completion

### Q3 2025 (July - September)

**Publication Date**: 2025-10-15

#### Security Metrics

**Vulnerability Management**
- Critical Vulnerabilities: 1 (zero-day in dependency, patched within 4 hours)
- High Vulnerabilities: 4 (all remediated within 21 days)
- Medium Vulnerabilities: 11 (all remediated within 30 days)
- Bug Bounty Submissions: 3 (2 duplicates, 1 informational)

**Incident Response**
- Security Incidents: 1 (P3: attempted brute force, automatically mitigated)
- Privacy Incidents: 0
- Service Incidents: 3 (1 P1, 2 P2)
- MTTD: 3.8 minutes
- MTTR: 142 minutes (includes P1 incident)

**Notable Security Event**
- **2025-09-23**: CloudHSM connectivity issue (P2)
  - Duration: 32 minutes
  - Impact: Key provisioning delays
  - Root Cause: AWS service disruption
  - Resolution: Automatic failover to backup region
  - Customer Impact: 3 customers experienced delays
  - Lessons Learned: Improved multi-region HSM deployment

#### Availability and Performance

**Uptime**
- Custody SKU: 99.97% (including P1 incident)
- Analytics SKU: 99.94%
- Total Downtime: 23.8 minutes (1 P1 incident: 18 min)

**Performance**
- API Response Time (p95): 156ms
- API Response Time (p99): 312ms
- Error Rate: 0.05%

#### Compliance Updates

**SOC 2 Program**
- Type I Audit: Fieldwork in progress
- Gap Assessment: Completed, 2 minor findings remediated
- Policy Updates: 5 policies updated for audit readiness

---

## Security Incident Disclosures

We disclose all security incidents that meet our materiality threshold: any incident affecting customer data, service availability (P1/P2), or security posture.

### Historical Security Incidents

**2025 Incidents**

**None to disclose**
- No security incidents affecting customer data in 2025
- All service availability incidents were operational (not security-related)
- No unauthorized access, data breaches, or privacy violations

**2024 Incidents**

**2024-12-03: Attempted Credential Stuffing Attack (P3)**
- **Detection**: Automated rate limiting and anomaly detection
- **Impact**: None - attack fully mitigated by rate limiting
- **Duration**: 2.5 hours (attack duration)
- **Scope**: Login endpoints targeted
- **Response**: IP blocklist updated, additional rate limiting rules deployed
- **Customer Impact**: None
- **Root Cause**: Known credential list from third-party breach attempt
- **Prevention**: Enhanced rate limiting, CAPTCHA for repeated failures

---

## Service Availability Reports

### Incident Post-Mortems

We publish detailed post-mortems for all P1 and P2 incidents within 5 business days.

**2025-10-15: Partial API Outage (P1)**

**Timeline**
- 14:23 UTC: Database connection pool exhausted
- 14:25 UTC: Automated alerts triggered
- 14:27 UTC: On-call engineer paged
- 14:30 UTC: Incident declared, status page updated
- 14:35 UTC: Root cause identified (connection leak)
- 14:38 UTC: Emergency configuration change deployed
- 14:41 UTC: Service restored, monitoring continued
- 15:00 UTC: Incident closed

**Impact**
- Duration: 18 minutes of complete API unavailability
- Affected Services: All API endpoints (custody + analytics)
- Customers Affected: All customers attempting API calls during outage
- Failed Requests: ~1,200 requests (during outage window)

**Root Cause**
- Database connection pool configuration error in new deployment
- Connections not properly released after queries
- Pool exhaustion led to API timeouts
- Configuration error introduced in previous day's deployment

**Resolution**
- Immediate: Rolled back to previous configuration
- Short-term: Increased connection pool size as temporary measure
- Long-term: Implemented connection pool monitoring and automatic leak detection

**Prevention Measures**
1. Added connection pool metrics to primary dashboard
2. Implemented automated alerts for connection pool utilization > 80%
3. Enhanced code review checklist for database connection handling
4. Added integration tests for connection pool behavior under load
5. Implemented connection timeout to force cleanup

**Lessons Learned**
- Need better pre-production testing for connection pool configurations
- Connection pool monitoring should be alertable metric
- Automated rollback should trigger on connection pool exhaustion

---

## Product Security Updates

### Security Advisories

**2025-11-01: Enhanced Rate Limiting**

**Change**: Reduced rate limits for custody operations
- General API: 1000 → 100 requests per 15 minutes
- Custody Operations: 10 requests per 15 minutes
- No customer impact expected (limits exceed normal usage patterns)
- Contact support if limits impact your use case

**Reason**: Defense-in-depth strategy to prevent DoS attacks

---

**2025-10-15: Dependency Security Updates**

**Change**: Updated Express, Helmet, and Axios to latest secure versions
- express: 4.18.2 → 4.21.2
- helmet: 7.1.0 → 8.1.0
- axios: 1.6.2 → 1.13.2

**Security Impact**: Addressed known CVEs in previous versions
**Customer Impact**: None - backward compatible updates
**Deployment**: Rolled out gradually over 48 hours

---

**2025-09-20: Hostname Validation Hardening**

**Change**: Implemented RFC-compliant hostname validation for database connections
**Security Impact**: Prevents SSRF attacks via database hostname manipulation
**Customer Impact**: None - customer-facing APIs unchanged
**Recommendation**: Customers using self-hosted databases should verify hostname format compliance

---

### Feature Security Enhancements

**2025-11-07: JWT Authentication Implementation**

**Enhancement**: Replaced placeholder authentication with production JWT verification
- **Algorithm**: HS256 with 32+ character secrets
- **Token Expiration**: 15-minute access tokens
- **Validation**: Constant-time to prevent timing attacks
- **Authorization**: Tenant-based isolation with admin overrides

**Migration**
- All customers must update to JWT-based authentication
- Migration deadline: 2025-12-31
- Support: Contact support@yourdomain.com for assistance

---

**2025-10-01: Input Validation Hardening**

**Enhancement**: Comprehensive input validation across all endpoints
- Tenant ID: 3-64 characters, strict format
- Manifest data: 1MB size limit
- Analytics data: 5MB size limit
- All inputs: Type checking and length validation

**Benefit**: Protection against DoS attacks and injection vulnerabilities

---

## Compliance Audit Results

### SOC 2 Type I (November 2025)

**Audit Period**: Point-in-time as of 2025-11-01
**Auditor**: [Auditor Firm Name], AICPA SOC Suite Recognized
**Scope**: Security + Availability Trust Services Criteria

**Summary Results**
- **Opinion**: Unqualified - controls suitably designed
- **Control Exceptions**: 0
- **Control Deficiencies**: 0
- **Management Comments**: 2 observations for enhancement (non-deficiencies)

**Key Findings**
- ✅ Controls suitably designed to meet TSC
- ✅ Control environment demonstrates commitment to security
- ✅ Risk assessment process identifies and mitigates risks
- ✅ Information and communication controls adequate
- ✅ Monitoring controls provide adequate oversight

**Observations** (Enhancement opportunities, not deficiencies)
1. Consider expanding automated testing coverage for access reviews
2. Document disaster recovery drill results in central repository

**Actions Taken**
1. Implemented automated access review testing (completed 2025-11-20)
2. Created centralized DR drill documentation repository (completed 2025-11-25)

**Full Report**: Available under NDA (request: compliance@yourdomain.com)

---

### Annual Penetration Test (September 2025)

**Test Period**: 2025-09-15 to 2025-09-30
**Testing Firm**: [Security Testing Firm Name]
**Scope**: Full platform including APIs, web applications, infrastructure

**Summary Results**
- **Critical Findings**: 0
- **High Findings**: 0
- **Medium Findings**: 3 (all remediated)
- **Low/Informational**: 7

**Medium Findings** (All Remediated)
1. **TLS Configuration**: Missing HSTS header on one subdomain
   - Remediated: 2025-10-02 (HSTS header added)
2. **Cookie Flags**: Missing SameSite attribute on analytics cookie
   - Remediated: 2025-10-03 (SameSite=Strict added)
3. **Error Messages**: Stack traces exposed in development environment
   - Remediated: 2025-10-04 (Error handling improved)

**Retest**: Completed 2025-10-10, all findings verified as remediated

**Executive Summary**: Available under NDA (request: security@yourdomain.com)

---

## Change Log and Roadmap

### Recent Changes (Last 30 Days)

**2025-11-07**
- ✅ Implemented production JWT authentication
- ✅ Enhanced input validation across all endpoints
- ✅ Updated all dependencies to latest secure versions
- ✅ Published NIST SP 800-53 Rev. 5 control mappings

**2025-11-01**
- ✅ Completed SOC 2 Type I audit
- ✅ Started SOC 2 Type II evidence collection period
- ✅ Launched Trust Center public site

**2025-10-15**
- ✅ Enhanced rate limiting for DoS protection
- ✅ Implemented cryptographically secure request ID generation
- ✅ Added tenant-based authorization controls

### Upcoming Changes (Next 90 Days)

**December 2025**
- 📅 Expand SOC 2 scope to include Confidentiality TSC
- 📅 Implement automated evidence collection enhancements
- 📅 Quarterly disaster recovery drill

**January 2026**
- 📅 Begin ISO 27001 readiness assessment
- 📅 Publish Q4 2025 transparency report
- 📅 Annual security training refresh

**February 2026**
- 📅 Penetration test (Q1 2026)
- 📅 GDPR compliance review and update
- 📅 Sub-processor list quarterly review

---

## Transparency Metrics

### Reporting Cadence

**Quarterly**
- Transparency reports (15 days after quarter end)
- Security metrics and incident summaries
- Availability and performance statistics
- Compliance updates

**Annual**
- Penetration test results
- SOC 2 audit reports
- Security program review
- Privacy impact assessment

**Real-time**
- Security incident notifications (within 24 hours)
- Service availability updates (status.yourdomain.com)
- Critical vulnerability disclosures (same-day)
- Major product security changes (advance notice)

### Data Sources

All metrics and reports on this page are sourced from:
- Automated monitoring (Datadog, CloudWatch)
- Security tools (Snyk, vulnerability scanners)
- Incident management (PagerDuty, ticketing systems)
- Audit reports (SOC 2, penetration tests)
- Manual reviews (quarterly assessments)

**Data Accuracy**: All metrics verified before publication
**Data Retention**: Historical reports maintained indefinitely
**Corrections**: Any corrections published within 48 hours

---

## FAQ

**Q: Why publish security incidents publicly?**
A: Transparency builds trust. We believe customers deserve to know about our security posture, including incidents and how we respond.

**Q: Do you report all incidents?**
A: We report all incidents meeting our materiality threshold (customer data impact, service availability P1/P2, security impact).

**Q: Can I get notifications of new transparency reports?**
A: Yes, subscribe at transparency@yourdomain.com or via RSS at trust.yourdomain.com/transparency.rss

**Q: What about incidents that don't meet the threshold?**
A: Lower-severity incidents (P3/P4) are summarized in quarterly reports but may not receive individual disclosure.

**Q: How quickly do you disclose incidents?**
A: Security incidents: Within 24 hours. Service incidents: Real-time via status page. Quarterly summaries: Within 15 days of quarter end.

---

## Contact

**Transparency Questions**: transparency@yourdomain.com
**Incident Notifications**: Subscribe at status.yourdomain.com
**Security Disclosures**: security@yourdomain.com
**Compliance Reports**: compliance@yourdomain.com

---

**Last Updated**: 2025-11-07
**Next Quarterly Report**: 2026-01-15 (Q4 2025)
**Next Annual Report**: 2026-03-31 (2025 Annual Security Review)
