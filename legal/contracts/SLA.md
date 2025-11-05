# Service Level Agreement

**Survival-Aligned Metrics with Service Credits**

**Version**: 1.0.0  
**Effective Date**: [Date]  
**Parties**: 
- **Provider**: C2 Concierge Inc.
- **Customer**: [Customer Name]

This Service Level Agreement ("SLA") is incorporated into the Master Services Agreement and defines the service levels, measurements, and remedies for the C2PA-as-a-Service.

---

## 1. Service Level Objectives

### 1.1 Core Service Metrics

| Service Level Indicator (SLI) | Service Level Objective (SLO) | Measurement Period | Service Credit |
|-------------------------------|------------------------------|-------------------|----------------|
| Remote Manifest Survival | ≥99.9% | Monthly | 10% of monthly fee |
| Verify API Uptime | ≥99.9% | Monthly | 10% of monthly fee |
| Sign p95 Latency (Remote) | <400ms | Monthly | Advisory only |
| Verify p95 Latency | <600ms | Monthly | Advisory only |
| Evidence Retention | 24 months WORM | Continuous | N/A |

### 1.2 Error Budget Allocation

- **Monthly Error Budget**: 43.2 minutes (0.1% of monthly time)
- **Survival SLO**: Maximum 43.2 minutes of downtime per month
- **API Uptime SLO**: Maximum 43.2 minutes of API unavailability per month

---

## 2. Service Credits

### 2.1 Credit Calculation

**If Monthly Remote Survival < 99.9% OR Verify API Uptime < 99.9%**, Customer receives a service credit equal to:

| Service Level | Credit Percentage |
|---------------|-------------------|
| 99.0% to <99.9% | 10% |
| 95.0% to <99.0% | 25% |
| 90.0% to <95.0% | 50% |
| <90.0% | 100% |

### 2.2 Credit Application

- Credits are calculated monthly and applied to the following month's invoice
- Credits are the sole and exclusive remedy for SLA breaches
- Credits do not apply to advisory metrics (latency targets)
- Maximum credit per month is 100% of the monthly service fee

### 2.3 Credit Request Process

1. **Automatic Calculation**: Provider automatically calculates credits based on monitoring data
2. **Credit Application**: Credits are automatically applied to Customer's account
3. **Credit Notification**: Provider notifies Customer of credit application within 5 business days
4. **Dispute Resolution**: Customer may dispute credit calculations within 10 business days

---

## 3. Service Definitions and Measurements

### 3.1 Remote Manifest Survival

**Definition**: Percentage of signed C2PA manifests that remain accessible, verifiable, and cryptographically valid through Provider's remote infrastructure.

**Measurement**:
- **Monitoring**: Continuous health checks on manifest endpoints
- **Calculation**: (Total successful manifest verifications / Total manifest verification attempts) × 100
- **Exclusions**: Scheduled maintenance (maximum 4 hours per month)
- **Downtime Definition**: Manifest inaccessible or verification fails due to Provider infrastructure

**Auto-Fallback**: Upon breach of Survival SLO, Provider will force remote-only mode for affected routes until passing two consecutive hourly checks.

### 3.2 Verify API Uptime

**Definition**: Percentage of time the Verify API is available and successfully processes requests.

**Measurement**:
- **Monitoring**: External monitoring from multiple geographic locations
- **Calculation**: (Successful API responses / Total API requests) × 100
- **Exclusions**: Scheduled maintenance (maximum 4 hours per month)
- **Success Criteria**: HTTP 2xx responses within 30 seconds

### 3.3 Sign p95 Latency (Remote)

**Definition**: 95th percentile response time for remote manifest signing operations.

**Measurement**:
- **Monitoring**: Real-time latency tracking from edge locations
- **Target**: <400ms for 95% of requests
- **Advisory Only**: No service credits for latency breaches
- **Benchmark**: Industry standard for cryptographic signing operations

### 3.4 Verify p95 Latency

**Definition**: 95th percentile response time for manifest verification operations.

**Measurement**:
- **Monitoring**: Real-time latency tracking from edge locations
- **Target**: <600ms for 95% of requests
- **Advisory Only**: No service credits for latency breaches
- **Benchmark**: Optimized for batch verification workflows

---

## 4. Monitoring and Reporting

### 4.1 Monitoring Infrastructure

- **External Monitoring**: Third-party monitoring services from multiple regions
- **Internal Monitoring**: Real-time infrastructure health monitoring
- **Alert Thresholds**: Automated alerts for service degradation
- **Data Retention**: 24-month retention of monitoring data in WORM storage

### 4.2 Service Credits Dashboard

- **Real-time Visibility**: Customer dashboard showing current service levels
- **Monthly Reports**: Detailed SLA performance reports
- **Credit Tracking**: Automatic calculation and application of service credits
- **Historical Data**: 12-month history of service performance

### 4.3 Performance Reporting

Provider shall provide Customer with:
- **Monthly SLA Report**: Detailed performance metrics and credit calculations
- **Quarterly Business Review**: Service performance trends and improvement plans
- **Annual Summary**: Year-over-year service performance analysis
- **Incident Reports**: Detailed analysis of any service breaches

---

## 5. Maintenance and Scheduled Downtime

### 5.1 Scheduled Maintenance

- **Advance Notice**: Minimum 7 days notice for scheduled maintenance
- **Maintenance Windows**: Typically scheduled during low-usage periods
- **Maximum Downtime**: 4 hours per month excluded from SLA calculations
- **Emergency Maintenance**: Immediate notice for critical security updates

### 5.2 Maintenance Communication

- **Maintenance Calendar**: Published maintenance schedule
- **Status Updates**: Real-time status updates during maintenance
- **Rollback Plans**: documented rollback procedures for failed maintenance
- **Post-Maintenance**: Summary of maintenance activities and impacts

---

## 6. Incident Management

### 6.1 Incident Classification

| Severity | Response Time | Resolution Target | Credit Impact |
|----------|---------------|-------------------|---------------|
| Critical (P1) | 15 minutes | 4 hours | Potential SLA breach |
| High (P2) | 1 hour | 8 hours | Potential SLA breach |
| Medium (P3) | 4 hours | 24 hours | No SLA impact |
| Low (P4) | 1 business day | 5 business days | No SLA impact |

### 6.2 Incident Response

- **Immediate Response**: Automated incident detection and alerting
- **Communication**: Proactive customer notifications for P1/P2 incidents
- **Root Cause Analysis**: Detailed investigation of all SLA breaches
- **Preventive Measures**: Implementation of corrective actions

### 6.3 Service Credit Triggers

Service credits are automatically triggered when:
- Monthly Remote Survival falls below 99.9%
- Monthly Verify API Uptime falls below 99.9%
- Multiple incidents cause cumulative downtime exceeding error budget

---

## 7. Exclusions and Limitations

### 7.1 SLA Exclusions

Service credits do not apply to unavailability caused by:
- Customer actions or configurations
- Third-party services outside Provider's control
- Force majeure events or natural disasters
- Customer network connectivity issues
- Malicious attacks on Customer's infrastructure

### 7.2 Advisory Metrics

The following metrics are advisory only and do not generate service credits:
- Sign p95 latency <400ms
- Verify p95 latency <600ms
- Support response times
- Documentation availability

### 7.3 Credit Limitations

- **Maximum Monthly Credit**: 100% of monthly service fee
- **Credit Carryover**: Credits do not carry over to future months
- **Non-Refundable**: Credits are applied as invoice credits, not cash refunds
- **Exclusive Remedy**: Credits are the sole remedy for SLA breaches

---

## 8. Service Level Calculations

### 8.1 Monthly Service Level Calculation

```
Monthly Service Level % = (Total Available Minutes - Downtime Minutes) / Total Available Minutes × 100

Where:
- Total Available Minutes = 43,200 (30 days × 24 hours × 60 minutes)
- Downtime Minutes = Unavailable minutes excluding scheduled maintenance
- Error Budget = 43.2 minutes (0.1% of total available minutes)
```

### 8.2 Credit Calculation Example

```
Scenario: 120 minutes of unscheduled downtime in a month

Calculation:
- Available Minutes = 43,200 - 120 = 43,080
- Service Level % = (43,080 / 43,200) × 100 = 99.72%
- Credit Percentage = 10% (since 99.0% ≤ 99.72% < 99.9%)
- Monthly Fee = $10,000
- Service Credit = $10,000 × 10% = $1,000
```

---

## 9. Continuous Improvement

### 9.1 Performance Targets

Provider shall continuously work toward:
- **Survival Target**: 99.95% (error budget 21.6 minutes)
- **Uptime Target**: 99.95% (error budget 21.6 minutes)
- **Latency Optimization**: Ongoing performance improvements
- **Zero Downtime**: Goal of zero unscheduled downtime

### 9.2 Improvement Initiatives

- **Infrastructure Investment**: Regular upgrades to improve reliability
- **Performance Monitoring**: Advanced monitoring and predictive analytics
- **Process Optimization**: Continuous improvement of operational procedures
- **Customer Feedback**: Incorporation of customer feedback into service improvements

---

## 10. Verification and Audit

### 10.1 Performance Verification

Customer may verify service performance through:
- **Real-time Dashboard**: Live monitoring of service metrics
- **API Access**: Programmatic access to performance data
- **Third-party Monitoring**: Independent verification of service levels
- **Audit Rights**: Right to audit Provider's performance calculations

### 10.2 Dispute Resolution

If Customer disputes service credit calculations:
- **Initial Review**: Provider reviews disputed calculations within 5 business days
- **Third-party Audit**: Option for independent third-party audit (Customer expense)
- **Final Determination**: Provider's final determination based on audit results
- **Credit Adjustment**: Adjustment of credits based on final determination

---

## 11. Term and Modifications

### 11.1 Term

This SLA remains in effect for the duration of the Master Services Agreement and may be modified by mutual written agreement.

### 11.2 SLA Modifications

Provider may modify SLA metrics or calculations with:
- **30 Days Notice**: Advance notice of any SLA changes
- **Customer Consent**: Written consent for material changes
- **Grandfathering**: Existing customers maintain current SLA for 6 months

### 11.3 Performance Improvements

Provider may improve service levels at any time without notice, and such improvements shall become part of this SLA.

---

## 12. Definitions

**"Downtime"** means periods when the service is unavailable due to Provider infrastructure issues, excluding scheduled maintenance and exclusions.

**"Error Budget"** means the allowable amount of downtime before service credits are triggered (0.1% monthly for core services).

**"Monthly Service Level"** means the calculated percentage of service availability for a calendar month.

**"Service Credit"** means a credit applied to Customer's future invoice amounts as compensation for SLA breaches.

**"p95 Latency"** means the 95th percentile response time, representing the performance experienced by 95% of requests.

---

**IN WITNESS WHEREOF**, the Parties have executed this Service Level Agreement as of the Effective Date.

**C2 CONCIERGE INC.**
By: _________________________
Name: [Name]
Title: [Title]
Date: [Date]

**CUSTOMER**
By: _________________________
Name: [Name]
Title: [Title]
Date: [Date]

---

*Template Version: 1.0.0*  
*Last Updated: November 5, 2025*  
*Next Review: February 5, 2026*
