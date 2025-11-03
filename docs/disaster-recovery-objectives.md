# Phase 21 — Multi-Region & DR: Non-Negotiable Objectives

**Effective Date**: 2025-11-02  
**Version**: 1.0  
**Status**: Active

## 21.0 Non-Negotiable Objectives (Binary Compliance)

### Recovery Point Objective (RPO)
- **Maximum evidence at risk**: ≤ 5 minutes
- **Definition**: The maximum acceptable amount of provenance evidence that can be lost during a disaster scenario
- **Measurement**: Count of unique manifest hashes not replicated to standby region
- **Hard Gate**: Any incident exceeding 5 minutes RPO is considered a CRITICAL failure requiring immediate incident response

### Recovery Time Objective (RTO)
- **Maximum time to recover**: ≤ 15 minutes  
- **Definition**: The maximum acceptable time to restore /sign, /verify, and manifest fetch services to operational status
- **Measurement**: Time from disaster detection to all SLOs returning to green status
- **Hard Gate**: Any incident exceeding 15 minutes RTO triggers automatic escalation to executive leadership

### Service Availability Requirements
- **Sign API**: Must maintain write capability during regional failover
- **Verify API**: Must serve verification requests with ≤ 1% degradation during DR events
- **Manifest Fetch**: Must provide read access to all stored manifests within 30 seconds of request
- **Background Jobs**: Anchors and rotations must either pause safely or resume idempotently within 10 minutes of cutover

### Data Integrity Requirements
- **Zero Integrity Regression**: No tenant may experience provenance evidence corruption or inconsistency
- **Strong Consistency**: All regions must return identical verification results for the same manifest hash
- **Audit Trail Continuity**: Every action during DR must be logged with tamper-evident signatures

### Control Plane Requirements
- **Active/Standby Architecture**: Primary region handles all traffic; standby region is hot and ready
- **Automatic Failover**: DNS/LB must automatically route traffic when primary region is unhealthy
- **Manual Break-Glass**: Documented manual override procedures for emergency scenarios
- **Split-Brain Prevention**: Exactly one leader may exist for background jobs at any time

### Compliance Requirements
- **Public Communication**: All DR events must be communicated via public status page within 10 minutes
- **Incident Documentation**: Every DR event requires postmortem with root cause and corrective actions
- **Regulatory Reporting**: Any RPO breach must be documented for compliance audits
- **Tenant Notifications**: High-compliance tenants must be notified of any DR events affecting their data

## Success Criteria (Binary Pass/Fail)

### Game Day Validation
- [ ] RPO < 5 minutes demonstrated during region loss simulation
- [ ] RTO < 15 minutes demonstrated during complete control plane failover
- [ ] Post-failover consistency checks pass with 100% manifest integrity
- [ ] Anchor/rotation jobs resume without duplicate processing
- [ ] Public status page updates automatically during DR events

### Operational Validation
- [ ] Health checks detect regional failures within 60 seconds
- [ ] DNS failover completes within 120 seconds of detection
- [ ] All services return to green SLOs within 15 minutes
- [ ] No split-brain conditions detected during any scenario
- [ ] Incident communication templates work as designed

### Technical Validation
- [ ] Dual-region replication maintains consistency
- [ ] Leader election prevents duplicate background jobs
- [ ] Edge relay serves manifests from standby region during primary outage
- [ ] TSA outage handling prevents data loss
- [ ] Consistency sweeps detect and repair any drift

## Failure Definitions

### Critical Failure (Immediate Escalation)
- RPO exceeds 5 minutes
- RTO exceeds 15 minutes
- Any data corruption detected
- Split-brain condition occurs
- Public status page fails to update

### Warning Threshold (Monitor Closely)
- Replication lag exceeds 3 minutes
- Health check flapping (>3 changes in 10 minutes)
- Consistency sweep detects >0.01% drift
- Background job failure rate >5%

### Informational (Log and Monitor)
- Replication lag exceeds 1 minute
- Manual cutover performed
- TSA outage occurs (but handled gracefully)
- Consistency sweep detects <0.01% drift

## Measurement Methodology

### RPO Measurement
```bash
# Calculate missing manifests in standby region
python scripts/calculate-rpo.py \
  --primary-region enam \
  --standby-region weur \
  --time-window 300  # 5 minutes in seconds
```

### RTO Measurement  
```bash
# Measure time from detection to SLO recovery
python scripts/calculate-rto.py \
  --incident-start "2025-11-02T14:30:00Z" \
  --slo-recovery "2025-11-02T14:42:00Z"
  # Should report 12 minutes (PASS)
```

### Consistency Verification
```bash
# Verify manifest consistency across regions
python scripts/verify-consistency.py \
  --sample-size 1000 \
  --tolerance 0.001  # 0.1%
```

## Reporting Requirements

### Real-time Dashboards
- Current RPO/RTO status
- Regional health indicators
- Replication lag metrics
- Background job status

### Daily Reports
- RPO/RTO compliance summary
- Consistency sweep results
- Replication performance metrics
- DR system health indicators

### Incident Reports
- Detailed timeline of DR events
- Root cause analysis
- Impact assessment
- Corrective action plan

## Accountability

### Primary Owners
- **Disaster Recovery Lead**: Overall DR program ownership
- **Site Reliability Engineering**: RTO/RTO measurement and reporting
- **Security Team**: Data integrity and audit trail verification
- **Product Engineering**: Service functionality during DR events

### Escalation Matrix
1. **P3**: DR system degradation (monitor, document)
2. **P2**: RPO/RTO warning thresholds (investigate, prepare response)
3. **P1**: RPO/RTO critical failure (immediate response, executive notification)
4. **P0**: Data corruption or integrity loss (all-hands emergency)

## Compliance Mapping

### SOC2 Type II
- **Security Principle**: Access controls, encryption, audit trails
- **Availability Principle**: RTO/RTO measurements, failover testing
- **Processing Integrity**: Data consistency, verification accuracy

### ISO 27001
- **A.12.1.1**: Business continuity procedures
- **A.12.3.1**: Information security during disruption
- **A.14.2.7**: Outsourced information system monitoring

### GDPR Article 32
- **Technical and Organizational Measures**: DR capabilities demonstrated
- **Appropriate Technical Level**: RPO/RTO aligned with data protection requirements
- **Testing of Measures**: Quarterly Game Day exercises

---

**Approval**: This document must be reviewed and approved by the CTO and VP Engineering before implementation. Any changes to RPO/RTO targets require executive approval and regulatory impact assessment.
