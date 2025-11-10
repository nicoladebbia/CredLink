# Security One-Pager

**C2 Concierge Platform Security Overview**

## Encryption & Key Management
- **At Rest**: AES-256-GCM with per-tenant AWS KMS keys
- **In Transit**: TLS 1.3 with perfect forward secrecy
- **Key Rotation**: Automatic quarterly rotation
- **HSM-Backed**: FIPS 140-2 Level 3 compliant storage

## Penetration Testing
- **Annual External Tests**: Independent third-party per NIST SP 800-115
- **Quarterly Scans**: Automated vulnerability assessments
- **Remediation SLA**: Critical (7 days), High (30 days), Medium (90 days)
- **Re-testing**: Targeted re-tests within 30 days of critical findings

## Evidence Custody
- **WORM Storage**: AWS S3 Object Lock (Compliance Mode)
- **Retention**: 24+ months with legal hold support
- **Compliance**: SEC 17a-4, Cohasset-assessed
- **Immutability**: Deletion before expiry technically prohibited

## Incident Response
- **Detection**: 24/7 automated monitoring and alerting
- **Notification**: Critical (4h), High (24h), Medium (72h)
- **Classification**: P1-P4 severity levels
- **Coordination**: Dedicated incident response team

## Certifications & Standards
- ISO 27001 (Information Security Management)
- SOC 2 Type II (Security, Availability, Confidentiality)
- GDPR Art. 28 (Data Processing)
- NIST Cybersecurity Framework alignment

## Access Controls
- Multi-factor authentication (MFA) required
- Role-based access control (RBAC)
- Principle of least privilege
- Regular access reviews and audits

## Monitoring & Logging
- Comprehensive audit logging (24-month retention)
- Real-time security monitoring
- Cryptographic log integrity protection
- SIEM integration available

---

**Questions?** security@credlink.com  
**Last Updated**: November 5, 2025
