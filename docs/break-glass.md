# Break-Glass Protocol

**Purpose**: Emergency override mechanism for critical production incidents where normal policy enforcement must be temporarily bypassed.

## Overview

The break-glass protocol allows temporary bypass of CredLink's remote-first policy for specific hostnames during emergency situations. This is a signed, audited, and time-limited mechanism designed for production incidents only.

## Protocol Flow

### 1. Activation Request
- **Who**: Production engineers, security team, or incident commander
- **When**: Critical production incidents where policy enforcement causes service degradation
- **How**: Signed request with justification and time limit

### 2. Authorization
- Must be approved by at least 2 senior engineers or 1 director-level
- Requires documented incident ticket (e.g., PagerDuty, Jira)
- Maximum duration: 2 hours per activation

### 3. Implementation
- Entry stored in KV with hostname as key
- Includes signature, justification, and expiration
- All uses logged to deterministic audit trail

### 4. Monitoring & Alerting
- Break-glass usage triggers immediate alert to security team
- Dashboard shows active break-glass entries
- Auto-expiration prevents indefinite bypass

## Data Structure

```typescript
interface BreakGlassEntry {
  hostname: string;
  reason: string;
  opened_by: string;
  opened_at: string;  // ISO timestamp
  ttl_minutes: number;  // Max 120
  signature: string;  // HMAC of all above fields
}
```

## Implementation Details

### KV Storage
- **Namespace**: `BREAK_GLASS_KV`
- **Key**: hostname (e.g., `api.example.com`)
- **Value**: JSON-encoded BreakGlassEntry
- **TTL**: Automatic expiration based on `ttl_minutes`

### Signature Verification
```typescript
function verifyBreakGlassSignature(entry: BreakGlassEntry, secret: string): boolean {
  const canonical = JSON.stringify({
    hostname: entry.hostname,
    reason: entry.reason,
    opened_by: entry.opened_by,
    opened_at: entry.opened_at,
    ttl_minutes: entry.ttl_minutes
  }, Object.keys(entry).sort());
  
  const expectedSig = createHmac('sha256', secret)
    .update(canonical)
    .digest('hex');
    
  return entry.signature === expectedSig;
}
```

### Edge Worker Integration
The edge worker checks break-glass status before applying policy:

```typescript
if (await isBreakGlassActive(env, hostname)) {
  console.log(`Break-glass active for ${hostname}, bypassing worker`);
  return fetch(req);  // Transparent proxy
}
```

## Usage Examples

### Emergency CDN Migration
```bash
# Situation: CDN provider change causing manifest resolution failures
# Impact: All image assets failing verification
# Solution: Temporary break-glass for 1 hour during migration window

curl -X POST https://api.credlink.com/break-glass \
  -H "Authorization: Bearer $BREAK_GLASS_TOKEN" \
  -d '{
    "hostname": "images.example.com",
    "reason": "Emergency CDN migration - manifest resolution failures",
    "ttl_minutes": 60
  }'
```

### Security Incident Response
```bash
# Situation: False positive detection blocking legitimate content
# Impact: Customer-facing content not loading
# Solution: 30-minute bypass while investigating

curl -X POST https://api.credlink.com/break-glass \
  -H "Authorization: Bearer $BREAK_GLASS_TOKEN" \
  -d '{
    "hostname": "cdn.example.com",
    "reason": "Security incident - false positive detection",
    "ttl_minutes": 30
  }'
```

## Monitoring & Alerting

### Metrics to Track
- Active break-glass entries count
- Break-glass usage frequency
- Average duration of activations
- Hostnames with repeated usage

### Alert Thresholds
- **Critical**: Any break-glass activation
- **Warning**: Same hostname activated >3 times in 7 days
- **Info**: Break-glass usage trending upward

### Dashboard Information
- Active entries with remaining time
- Historical usage by hostname
- Approval chain for each activation
- Associated incident tickets

## Security Considerations

### Access Control
- Break-glass token stored in secure vault (e.g., 1Password, AWS Secrets Manager)
- Token rotation every 90 days
- Audit log of all token access

### Abuse Prevention
- Rate limiting: Max 5 activations per hour per account
- Geographic restrictions: Only from corporate IP ranges
- MFA required for all activations

### Post-Incident Review
- Mandatory review within 24 hours of any break-glass usage
- Root cause analysis required for repeated usage
- Process improvements based on incident patterns

## Compliance & Legal

### Audit Requirements
- All break-glass usage logged with full context
- Logs retained for 24 months
- Immediate availability for security audits

### Regulatory Impact
- May affect compliance certifications if overused
- Must be documented in security assessments
- Requires disclosure to customers if extended usage

## Emergency Contacts

### Primary
- **Security Team**: security@company.com (PagerDuty escalation)
- **Production Engineering**: prod-eng@company.com (Slack #production)

### Secondary
- **Incident Commander**: oncall-incident@company.com
- **Legal/Compliance**: compliance@company.com

## Testing & Validation

### Monthly Drills
- Simulated break-glass activation in staging
- Verify signature verification works
- Test monitoring and alerting
- Validate cleanup procedures

### Quarterly Reviews
- Review all break-glass usage patterns
- Update authorization procedures
- Refresh security tokens
- Update monitoring thresholds

---

**Version**: 1.0  
**Effective**: 2025-10-30  
**Review**: Monthly or after any usage
