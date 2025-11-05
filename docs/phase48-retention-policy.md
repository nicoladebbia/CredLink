# Phase 48 - Compliance v2 Retention & Purge Policy

## Overview

This document outlines the strictest-wins data retention policy implemented for Phase 48 Compliance v2, supporting EU AI Act, DSA, UK Online Safety Act, US FTC guidelines, and Brazil LGPD requirements.

## Strictest-Wins Principle

When a tenant operates in multiple jurisdictions, we apply the **strictest retention requirement** among all selected regions. This ensures compliance across all applicable regulations while minimizing complexity.

### Retention Matrix

| Region | Regulation | Base Retention | Legal Hold Required | WORM Recommended | Special Rules |
|--------|------------|----------------|-------------------|------------------|---------------|
| EU | AI Act + DSA | 365 days | ✅ Yes | ✅ Yes | AI content: 12 months minimum |
| UK | Online Safety Act | 180 days | ✅ Yes | ❌ No | Transparency data only |
| US | FTC + State Laws | 365 days | ✅ Yes | ❌ No | Varies by state |
| BR | LGPD | 730 days | ✅ Yes | ✅ Yes | Personal data processing |

### Strictest-Wins Examples

**EU + UK Selection:**
- Applied Retention: 365 days (EU requirement is stricter)
- Legal Hold: Required (both require)
- WORM Storage: Required (EU requires)

**EU + UK + US + BR Selection:**
- Applied Retention: 730 days (Brazil LGPD is strictest)
- Legal Hold: Required (all require)
- WORM Storage: Required (EU + BR require)

## Data Classification & Retention

### Core Evidence Data (Longest Retention)
- **Signed Manifests**: Strictest-wins retention period
- **TSA Receipts**: Strictest-wins retention period
- **Compliance Logs**: Strictest-wins retention period
- **Legal Hold Records**: Indefinite while hold active

### Operational Data (Standard Retention)
- **Badge Display Logs**: 365 days maximum (regardless of strictest)
- **User Interaction Logs**: 180 days maximum
- **Performance Metrics**: 90 days maximum

### Personal Data (Region-Specific)
- **EU Personal Data**: 365 days (GDPR alignment)
- **Brazil Personal Data**: 730 days (LGPD maximum)
- **US User Data**: 365 days (FTC + state alignment)

## Purge Process

### Automated Purge Schedule

```javascript
// Daily purge job runs at 02:00 UTC
const purgeJob = {
  schedule: "0 2 * * *", // Cron expression
  action: "retention.purge.expired",
  dry_run: false,
  notification_on_failure: true
};
```

### Purge Logic Flow

1. **Check Legal Hold Status**
   - If legal hold active → SKIP purge
   - Log legal hold preservation

2. **Calculate Data Age**
   - Compare data timestamp vs. retention policy
   - Include grace period (7 days)

3. **Apply Purge Rules**
   - Delete expired data from primary storage
   - Archive to cold storage if WORM enabled
   - Generate purge audit log

4. **Verification**
   - Verify data deletion completion
   - Update retention metrics
   - Send compliance notification

### Purge Exemptions

**Always Exempt:**
- Active legal hold data
- Ongoing investigation data
- Regulatory request data
- Unresolved DSR requests

**Conditional Exemptions:**
- VLOP ad repository data (365 days minimum for DSA)
- Evidence in litigation (preserve until resolution)

## DSR (Data Subject Rights) Implementation

### LGPD Compliance (Brazil)

**Rights Supported:**
- **Access**: Provide copy of personal data within 15 days
- **Correction**: Update inaccurate data within 30 days
- **Deletion**: Remove data unless required for legal compliance
- **Portability**: Export data in machine-readable format
- **Information**: Detailed processing activity report

**Redaction Rules:**
```javascript
const lgpdRedactions = {
  user_identifiers: "partial_mask", // Show last 4 characters
  contact_information: "full_mask",  // Complete redaction
  behavioral_data: "full_mask",      // Complete redaction
  location_data: "partial_mask"      // City-level only
};
```

### US State Law Compliance

**Ad Repository Redactions (DSA Art. 39):**
- No PII in public repositories
- Aggregate targeting parameters only
- Remove user behavior data
- Preserve sponsor and targeting category

### Cross-Border Transfer Rules

**EU to US Transfers:**
- Standard Contractual Clauses (SCCs) required
- Transfer impact assessment documented
- Data minimization applied

**Brazil to EU/US Transfers:**
- LGPD-compliant safeguards required
- DPO approval documented
- Transfer logs maintained

## WORM Storage Implementation

### When WORM is Required

**Mandatory WORM:**
- EU + BR region combination
- Legal hold active
- Regulatory investigation in progress

**Recommended WORM:**
- EU-only operations
- High compliance risk tenants
- Evidence preservation requirements

### WORM Configuration

```javascript
const wormConfig = {
  storage_class: "GLACIER",
  retention_period: "7_years",
  object_lock: "GOVERNANCE",
  bypass_governance: false,
  legal_hold: true
};
```

### WORM Storage Providers

**AWS S3 Object Lock:**
- Governance mode: 7 years default
- Legal hold: Per-object enablement
- Storage class: Glacier Deep Archive

**Azure Immutable Blob:**
- Time-based retention: 7 years
- Legal hold: Policy-based
- Versioning: Enabled

## Legal Hold Management

### Legal Hold Triggers

**Automatic Triggers:**
- Litigation notice received
- Regulatory investigation opened
- DSR appeal filed
- Data breach investigation

**Manual Triggers:**
- Legal counsel request
- Compliance team decision
- Tenant legal hold request

### Legal Hold Process

1. **Hold Initiation**
   - Identify relevant data scope
   - Apply hold flags to all affected data
   - Notify stakeholders
   - Document hold justification

2. **Hold Maintenance**
   - Monthly hold review
   - Scope adjustments as needed
   - Hold verification reports
   - Stakeholder updates

3. **Hold Release**
   - Legal clearance received
   - Hold scope verification
   - Gradual release process
   - Final documentation

## Monitoring & Reporting

### Retention Metrics Dashboard

**Key Metrics:**
- Total data volume under retention
- Days until next purge cycle
- Legal hold data volume
- DSR request processing time
- Storage cost trends

**Alerts:**
- Retention policy violations
- Purge job failures
- Legal hold expirations
- Storage limit thresholds

### Compliance Reporting

**Monthly Reports:**
- Retention policy compliance status
- Purge execution summary
- Legal hold inventory
- DSR request statistics
- Storage cost analysis

**Quarterly Reports:**
- Retention matrix updates
- Regulatory changes impact
- WORM storage utilization
- Cross-border transfer logs

## Implementation Checklist

### Setup Phase
- [ ] Configure retention matrix for all regions
- [ ] Implement strictest-wins calculation logic
- [ ] Set up automated purge scheduling
- [ ] Configure WORM storage buckets
- [ ] Establish legal hold workflows
- [ ] Implement DSR redaction rules

### Testing Phase
- [ ] Test multi-region retention calculation
- [ ] Verify purge job execution
- [ ] Test legal hold preservation
- [ ] Validate DSR redaction accuracy
- [ ] Confirm WORM storage functionality

### Operational Phase
- [ ] Monitor daily purge execution
- [ ] Review retention compliance weekly
- [ ] Update policies for regulatory changes
- [ ] Train staff on legal hold procedures
- [ ] Maintain DSR processing SLAs

## Risk Mitigations

**Data Loss Risk:**
- WORM storage for critical evidence
- Multiple backup locations
- Immutable audit trails

**Compliance Risk:**
- Strictest-wins default approach
- Regular policy reviews
- Legal counsel validation

**Cost Risk:**
- Automated purge optimization
- Storage tier management
- Cost monitoring alerts

**Operational Risk:**
- Redundant purge systems
- Fail-safe mechanisms
- Comprehensive logging

## Version Control

**Current Version:** 1.0.0
**Last Updated:** 2025-11-05
**Next Review:** 2025-12-05
**Approved By:** Compliance Team

**Change History:**
- v1.0.0: Initial implementation with EU/UK/US/BR support
- v0.9.0: Beta testing with EU-only support
- v0.8.0: Development phase with basic retention logic
