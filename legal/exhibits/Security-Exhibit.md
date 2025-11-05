# Security Exhibit

**Key Custody, WORM Storage, and Penetration Testing**

**Version**: 1.0.0  
**Effective Date**: [Date]  
**Exhibit to**: Master Services Agreement

---

## 1. Key Custody and Management

### 1.1 Per-Tenant Key Management
- **KMS Provider**: AWS Key Management Service (KMS)
- **Key Isolation**: Dedicated customer master keys (CMKs) per tenant
- **Encryption Standard**: AES-256-GCM for data at rest
- **Key Rotation**: Automatic quarterly rotation with secure key disposal
- **Access Control**: Hardware security module (HSM) backed key storage

### 1.2 Key Lifecycle
- **Generation**: Cryptographically secure random key generation
- **Storage**: HSM-backed storage with FIPS 140-2 Level 3 compliance
- **Rotation**: Automated 90-day rotation cycle
- **Archival**: Secure archival of retired keys for data recovery
- **Destruction**: Secure key destruction per NIST SP 800-88 guidelines

---

## 2. Evidence Lock (WORM Storage)

### 2.1 Immutable Storage
Provider shall store compliance evidence in an immutable (WORM) repository with:
- **Technology**: AWS S3 Object Lock in Compliance Mode
- **Retention Period**: Minimum 24 months from creation date
- **Legal Hold**: Support for indefinite legal hold when required
- **Deletion Protection**: Deletion before expiry is prohibited by system controls

### 2.2 Evidence Types
WORM storage applies to:
- C2PA manifest signatures and timestamps
- TSA receipts (RFC-3161 compliant)
- Verification audit logs
- Compliance reports and evidence bundles
- Security incident records

### 2.3 Compliance Mapping
- **SEC 17a-4**: Electronic records retention requirements
- **Cohasset Assessment**: WORM storage meets regulatory standards
- **FINRA 4511**: Books and records retention
- **GDPR Art. 5(1)(e)**: Storage limitation principle

---

## 3. Penetration Testing

### 3.1 Testing Cadence
- **Annual External Testing**: Independent third-party penetration tests
- **Quarterly Vulnerability Scans**: Automated vulnerability assessments
- **Targeted Re-tests**: Within 30 days of critical findings
- **Methodology**: NIST SP 800-115 Technical Guide to Information Security Testing

### 3.2 Testing Scope
- **Network Infrastructure**: External and internal network security
- **Application Layer**: Web applications, APIs, and services
- **Authentication**: Identity and access management systems
- **Data Protection**: Encryption and data handling procedures
- **Cloud Configuration**: AWS security posture and configurations

### 3.3 Remediation
- **Critical Findings**: Remediation within 7 days
- **High Findings**: Remediation within 30 days
- **Medium Findings**: Remediation within 90 days
- **Verification**: Re-testing to confirm remediation effectiveness

---

## 4. Incident Response

### 4.1 Security Incident Notice
Provider shall notify Customer of security incidents within:
- **Critical Incidents**: 4 hours of detection
- **High Severity**: 24 hours of detection
- **Medium Severity**: 72 hours of detection

### 4.2 Incident Classification
- **P1 (Critical)**: Data breach, service compromise, ransomware
- **P2 (High)**: Unauthorized access attempts, DDoS attacks
- **P3 (Medium)**: Policy violations, suspicious activity
- **P4 (Low)**: Informational security events

---

## 5. Cryptographic Standards

### 5.1 Encryption Protocols
- **At Rest**: AES-256-GCM with per-tenant keys
- **In Transit**: TLS 1.3 with perfect forward secrecy
- **Signatures**: ECDSA P-256 or RSA-2048 minimum
- **Hashing**: SHA-256 or stronger

### 5.2 RFC-3161 Timestamping
- **TSA Providers**: Multiple trusted timestamp authorities
- **Timestamp Verification**: Cryptographic verification of all timestamps
- **Audit Trail**: Immutable record of all timestamping operations
- **Retention**: TSA receipts stored in WORM for 24+ months

---

**Provider**: C2 Concierge Inc.  
**Last Updated**: November 5, 2025
