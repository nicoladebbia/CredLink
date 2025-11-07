# Incident Communication Templates

## Overview

Pre-approved incident communication templates for consistent, transparent, and timely customer notifications. All templates follow best practices: acknowledge early, update on cadence, use plain language, and provide clear next steps.

---

## P1 - Critical Incident

### Initial Notification (Within 15 minutes of detection)

**Subject**: [CRITICAL] Service Outage - Investigating

**Body**:
```
We are currently experiencing a critical service outage affecting [Component Name]. 

IMPACT:
- Affected Services: [List affected services]
- Customer Impact: [Describe what customers cannot do]
- Estimated Affected Customers: [Number or percentage]

STATUS:
- Issue Detected: [Time in UTC]
- Current Status: Investigating
- Next Update: Within 30 minutes

WHAT WE'RE DOING:
Our engineering team has been paged and is actively investigating the root cause. We will provide updates every 30 minutes until the issue is resolved.

WHAT YOU CAN DO:
[Provide workarounds if available, or "No action required at this time"]

We apologize for the disruption and are working urgently to restore service.

Status Page: https://status.yourdomain.com
Incident ID: INC-[YYYYMMDD]-[###]
```

### Investigation Update (Every 30 minutes during P1)

**Subject**: [CRITICAL] Service Outage - Investigation Update

**Body**:
```
UPDATE: [Current timestamp UTC]

PROGRESS:
[Describe what has been discovered and actions taken]

CURRENT STATUS:
- Root Cause: [Identified / Still investigating]
- Estimated Resolution: [Time estimate or "Working to determine"]
- Services Affected: [Still impacted / Partially restored]

NEXT STEPS:
[Describe immediate next actions being taken]

WHAT YOU CAN DO:
[Update workarounds or recommendations]

Next update in 30 minutes or sooner if status changes.

Status Page: https://status.yourdomain.com
Incident ID: INC-[YYYYMMDD]-[###]
```

### Resolution Notification

**Subject**: [RESOLVED] Service Restored

**Body**:
```
RESOLVED: [Timestamp UTC]

The service outage affecting [Component Name] has been fully resolved. All systems are now operational.

SUMMARY:
- Duration: [X hours Y minutes]
- Root Cause: [Brief, non-technical explanation]
- Services Affected: [List]
- Customers Affected: [Number or percentage]

RESOLUTION:
[Describe what was done to fix the issue]

PREVENTION:
[Describe steps being taken to prevent recurrence]

POST-MORTEM:
A detailed post-mortem will be published within 5 business days at:
https://status.yourdomain.com/incidents/INC-[YYYYMMDD]-[###]

We sincerely apologize for this disruption. If you have questions or concerns, please contact support@yourdomain.com.

Thank you for your patience.

Status Page: https://status.yourdomain.com
Incident ID: INC-[YYYYMMDD]-[###]
```

---

## P2 - Major Incident

### Initial Notification (Within 30 minutes of detection)

**Subject**: [MAJOR] Service Degradation - Investigating

**Body**:
```
We are experiencing degraded performance affecting [Component Name].

IMPACT:
- Affected Services: [List]
- Customer Impact: [Slower response times / Intermittent errors / etc.]
- Severity: Service is functional but degraded

STATUS:
- Issue Detected: [Time in UTC]
- Current Status: Investigating
- Next Update: Within 60 minutes

WHAT WE'RE DOING:
Our team is actively investigating the performance degradation and working to restore normal service levels.

WHAT YOU CAN DO:
[Provide guidance or workarounds if available]

Status Page: https://status.yourdomain.com
Incident ID: INC-[YYYYMMDD]-[###]
```

### Investigation Update (Every 60 minutes during P2)

**Subject**: [MAJOR] Service Degradation - Update

**Body**:
```
UPDATE: [Current timestamp UTC]

PROGRESS:
[Describe investigation progress and actions taken]

METRICS:
- Current Performance: [e.g., "API response times 3x normal"]
- Error Rate: [e.g., "2% vs normal 0.02%"]
- Trend: [Improving / Stable / Worsening]

NEXT STEPS:
[Describe actions being taken]

Next update in 60 minutes or when status changes.

Status Page: https://status.yourdomain.com
Incident ID: INC-[YYYYMMDD]-[###]
```

### Resolution Notification

**Subject**: [RESOLVED] Service Performance Restored

**Body**:
```
RESOLVED: [Timestamp UTC]

Service performance has been restored to normal levels.

SUMMARY:
- Duration: [X hours Y minutes]
- Root Cause: [Brief explanation]
- Impact: [Degraded performance description]

RESOLUTION:
[What was done to resolve]

METRICS:
- API Response Time: Back to normal (p95 < [target]ms)
- Error Rate: Back to normal (< 0.1%)

POST-MORTEM:
Details will be published within 5 business days.

Thank you for your patience.

Status Page: https://status.yourdomain.com
Incident ID: INC-[YYYYMMDD]-[###]
```

---

## P3 - Minor Incident

### Initial Notification (Within 60 minutes of detection)

**Subject**: [MINOR] Limited Service Impact - Investigating

**Body**:
```
We are investigating a minor issue affecting [specific functionality].

IMPACT:
- Affected: [Specific feature or limited scope]
- Workaround Available: [Yes/No, describe if yes]
- Core Services: Unaffected

STATUS:
- Issue Detected: [Time UTC]
- Investigating: [Brief description]

WHAT YOU CAN DO:
[Workaround instructions if available]

We will provide an update when the issue is resolved.

Status Page: https://status.yourdomain.com
Incident ID: INC-[YYYYMMDD]-[###]
```

### Resolution Notification

**Subject**: [RESOLVED] Service Issue Resolved

**Body**:
```
The minor service issue affecting [functionality] has been resolved.

SUMMARY:
- Duration: [X hours Y minutes]
- Impact: [Limited scope description]
- Resolution: [What was fixed]

No further action required.

Status Page: https://status.yourdomain.com
Incident ID: INC-[YYYYMMDD]-[###]
```

---

## Scheduled Maintenance

### Advance Notice (7 days prior)

**Subject**: [SCHEDULED MAINTENANCE] [Date] - [Duration]

**Body**:
```
SCHEDULED MAINTENANCE NOTICE

We will be performing scheduled system maintenance on:

DATE: [Date]
TIME: [Start time] - [End time] UTC
DURATION: [Expected duration]
WINDOW: [Day of week], [Time in major timezones]

IMPACT:
- Expected Impact: [Zero-downtime / Brief interruptions / Service unavailable]
- Affected Services: [List]
- Recommended Actions: [Any customer actions needed]

WHAT WE'RE DOING:
[Brief description of maintenance activities]

BENEFITS:
[Why this maintenance is being performed - security updates, performance improvements, etc.]

REMINDERS:
- 3 days before: [Date]
- 1 day before: [Date]
- 1 hour before: [Time]

Questions? Contact support@yourdomain.com

Status Page: https://status.yourdomain.com
Maintenance ID: MAINT-[YYYYMMDD]-[###]
```

### Reminder Notification (1 day prior)

**Subject**: [REMINDER] Scheduled Maintenance Tomorrow - [Date]

**Body**:
```
MAINTENANCE REMINDER

This is a reminder that scheduled maintenance will begin in approximately 24 hours.

STARTS: [Date and time UTC]
DURATION: [Expected duration]
IMPACT: [Brief impact description]

Details: https://status.yourdomain.com/maintenance/MAINT-[YYYYMMDD]-[###]

We will send a final reminder 1 hour before maintenance begins.
```

### Starting Notification

**Subject**: [IN PROGRESS] Scheduled Maintenance Started

**Body**:
```
MAINTENANCE IN PROGRESS

Scheduled maintenance has started as planned.

START TIME: [Current time UTC]
EXPECTED END: [End time UTC]
CURRENT STATUS: [Brief status]

We will provide an update when maintenance is complete.

Status Page: https://status.yourdomain.com
Maintenance ID: MAINT-[YYYYMMDD]-[###]
```

### Completion Notification

**Subject**: [COMPLETED] Scheduled Maintenance Finished

**Body**:
```
MAINTENANCE COMPLETED

Scheduled maintenance has been completed successfully.

STARTED: [Start time UTC]
COMPLETED: [End time UTC]
DURATION: [Actual duration]

STATUS:
- All services restored to normal operation
- [Any notable improvements or changes]

Thank you for your patience.

Status Page: https://status.yourdomain.com
Maintenance ID: MAINT-[YYYYMMDD]-[###]
```

---

## Security Incident

### Initial Notification (Within 24 hours of confirmation)

**Subject**: [SECURITY] Important Security Update

**Body**:
```
We are writing to inform you of a security incident that may affect your account.

WHAT HAPPENED:
[Clear, non-technical description of the incident]

WHEN:
- Incident Occurred: [Date range]
- Incident Detected: [Date]
- Incident Contained: [Date]

IMPACT:
- Data Affected: [Specific types of data]
- Accounts Affected: [Scope - all customers / specific segment]
- No Evidence Of: [What did NOT happen, if applicable]

WHAT WE'RE DOING:
1. [Actions taken to contain and remediate]
2. [Investigation and forensics]
3. [Additional security measures implemented]

WHAT YOU SHOULD DO:
[Specific, actionable recommendations]

REGULATORY NOTIFICATION:
[If applicable, note that relevant authorities have been notified]

CONTACT:
For questions or concerns:
- Security Team: security@yourdomain.com
- Support: support@yourdomain.com

We take this incident very seriously and apologize for any concern this may cause. We are committed to maintaining the security and privacy of your data.

More details: https://trust.yourdomain.com/incidents/SEC-[YYYYMMDD]-[###]

Incident ID: SEC-[YYYYMMDD]-[###]
```

---

## Privacy Incident

### Data Subject Notification (Within 72 hours - GDPR requirement)

**Subject**: [PRIVACY] Important Privacy Notice

**Body**:
```
We are writing to inform you of an incident involving your personal data.

WHAT HAPPENED:
[Clear description of the incident]

WHEN:
- Incident Date: [Date]
- Discovery Date: [Date]
- Notification Date: [Today's date]

YOUR DATA:
- Types of Data Affected: [Specific categories]
- Number of Individuals Affected: [If known]

RISK:
- Likely Impact: [Description of potential consequences]
- Risk Level: [Low / Medium / High]

WHAT WE'VE DONE:
1. [Containment actions]
2. [Notification to supervisory authority - if GDPR]
3. [Additional security measures]

WHAT YOU CAN DO:
[Specific recommendations for data subjects]

YOUR RIGHTS:
Under [GDPR / CCPA / applicable law], you have the right to:
- Access your data
- Request deletion
- File a complaint with supervisory authority

SUPERVISORY AUTHORITY:
[Name and contact of relevant data protection authority]

CONTACT:
Privacy Team: privacy@yourdomain.com
Data Protection Officer: dpo@yourdomain.com

We sincerely apologize for this incident and are taking every step to prevent future occurrences.

Incident ID: PRI-[YYYYMMDD]-[###]
```

---

## Communication Best Practices

### Timing Guidelines

**P1 Critical**
- Initial: Within 15 minutes
- Updates: Every 30 minutes
- Resolution: Immediate

**P2 Major**
- Initial: Within 30 minutes
- Updates: Every 60 minutes
- Resolution: When resolved

**P3 Minor**
- Initial: Within 60 minutes
- Updates: As needed (minimum every 2 hours)
- Resolution: When resolved

**Scheduled Maintenance**
- Advance: 7 days
- Reminders: 3 days, 1 day, 1 hour
- Start: At maintenance start
- End: At completion

**Security Incidents**
- Initial: Within 24 hours of confirmation
- Updates: As investigation progresses
- Post-mortem: Within 30 days

**Privacy Incidents**
- Data Subjects: Within 72 hours (GDPR)
- Supervisory Authority: Within 72 hours (GDPR)
- Updates: As required by regulation

### Language Guidelines

**DO:**
- Use plain, non-technical language
- Be specific about impact
- Provide clear timelines
- Offer workarounds when available
- Apologize for disruption
- Thank customers for patience

**DON'T:**
- Use jargon or technical terms
- Minimize or downplay impact
- Make promises you can't keep
- Blame customers or third parties
- Provide excessive technical detail
- Leave customers without next steps

### Approval Requirements

**P1/P2 Incidents**
- Incident Commander approval
- On-call Manager review
- Legal review (if customer data affected)

**P3 Incidents**
- On-call Engineer approval

**Security/Privacy**
- Legal counsel approval (required)
- DPO review (privacy incidents)
- Executive approval (material incidents)

**Scheduled Maintenance**
- Engineering Manager approval
- Change Advisory Board approval

### Distribution Channels

1. **Status Page**: All incidents posted immediately
2. **Email**: Sent to affected customers
3. **Slack/Webhook**: For integrated customers
4. **RSS**: Auto-updated
5. **Twitter**: Optional, for major incidents only

---

## Template Usage Checklist

Before sending incident communication:

- [ ] Correct template selected based on severity
- [ ] All placeholder fields filled in
- [ ] Impact clearly described
- [ ] Timeline provided (when, next update)
- [ ] Actions described (what we're doing)
- [ ] Customer guidance provided (what they can do)
- [ ] Incident ID assigned
- [ ] Required approvals obtained
- [ ] Status page updated
- [ ] Distribution list verified

---

**Last Updated**: 2025-11-07
**Templates Approved By**: Legal, Engineering Leadership, Customer Success
**Next Review**: 2026-02-07 (Quarterly)
