# S-15: Incident Response Plan

## 1. Incident Classification

### Severity Levels
- **P0 (Critical)**: Data breach, production down, active attack
- **P1 (High)**: Security vulnerability actively exploited
- **P2 (Medium)**: Security vulnerability discovered but not exploited
- **P3 (Low)**: Minor security issue, no immediate risk

## 2. Response Team

### Primary Contacts
- **Incident Commander**: [Name] - [Phone] - [Email]
- **Technical Lead**: [Name] - [Phone] - [Email]
- **Security Lead**: [Name] - [Phone] - [Email]
- **Communications Lead**: [Name] - [Phone] - [Email]

### External Contacts
- Cloud Provider Support: [Number]
- Legal Counsel: [Contact]
- Law Enforcement (if needed): [Contact]

## 3. Response Procedures

### Step 1: Detection & Triage (0-15 minutes)
1. Alert received via monitoring/reports
2. Verify incident is real (not false positive)
3. Classify severity (P0-P3)
4. Page incident commander
5. Document initial findings

### Step 2: Containment (15-60 minutes)
1. **Isolate affected systems**
   ```bash
   # Kill switch - disable API
   kubectl scale deployment credlink-api --replicas=0
   ```

2. **Rotate compromised credentials**
   ```bash
   # Rotate JWT secret
   aws secretsmanager update-secret --secret-id credlink/jwt-secret --secret-string "$(openssl rand -base64 32)"
   
   # Invalidate all sessions
   redis-cli FLUSHDB
   ```

3. **Block attacker**
   ```bash
   # Cloudflare: Block IP
   curl -X POST "https://api.cloudflare.com/client/v4/zones/{zone_id}/firewall/access_rules/rules" \
     -H "X-Auth-Email: {email}" \
     -H "X-Auth-Key: {key}" \
     -d '{"mode":"block","configuration":{"target":"ip","value":"{attacker_ip}"}}'
   ```

### Step 3: Investigation (1-4 hours)
1. Collect logs
2. Analyze attack vector
3. Identify scope of breach
4. Document timeline

### Step 4: Eradication (2-8 hours)
1. Remove malware/backdoors
2. Patch vulnerabilities
3. Update security rules
4. Verify systems clean

### Step 5: Recovery (4-24 hours)
1. Restore from clean backups
2. Gradually bring systems online
3. Monitor for re-infection
4. Verify data integrity

### Step 6: Post-Incident (1-2 weeks)
1. Write incident report
2. Conduct retrospective
3. Update runbooks
4. Implement preventive measures
5. Notify affected parties (GDPR compliance)

## 4. Key Rotation Procedures

### JWT Secret Rotation
```bash
# Generate new secret
NEW_SECRET=$(openssl rand -base64 32)

# Update in Secrets Manager
aws secretsmanager update-secret \
  --secret-id credlink/jwt-secret \
  --secret-string "$NEW_SECRET"

# Rolling restart
kubectl rollout restart deployment/credlink-api
```

### Database Password Rotation
```bash
# 1. Create new password
NEW_PASSWORD=$(openssl rand -base64 24)

# 2. Update database
psql -c "ALTER USER credlink_app PASSWORD '$NEW_PASSWORD';"

# 3. Update secret
aws secretsmanager update-secret \
  --secret-id credlink/db-password \
  --secret-string "$NEW_PASSWORD"

# 4. Rolling restart applications
kubectl rollout restart deployment/credlink-api
```

## 5. Breach Notification

### GDPR Requirements (72-hour deadline)
1. **Assess if personal data affected**
2. **Notify supervisory authority within 72 hours**
3. **Notify affected individuals if high risk**

### Template Notification Email
```
Subject: Security Incident Notification - CredLink

Dear [User],

We are writing to inform you of a security incident that may have affected your data.

WHAT HAPPENED:
[Brief description]

WHAT INFORMATION WAS INVOLVED:
[Specific data types]

WHAT WE ARE DOING:
[Response actions]

WHAT YOU CAN DO:
[User actions if any]

CONTACT:
security@credlink.com

Sincerely,
CredLink Security Team
```

## 6. Backup & Restore

### Restore from Backup
```bash
# Database restore
pg_restore -d credlink_prod backup_$(date +%Y%m%d).dump

# Certificate restore
aws s3 cp s3://credlink-backups/certs/ ./certs/ --recursive
```

### Verify Integrity
```bash
# Check data integrity
psql -d credlink_prod -f integrity_checks.sql

# Verify checksums
sha256sum -c checksums.txt
```

## 7. Communication Templates

### Internal Slack Alert
```
@here SECURITY INCIDENT - P0

Status: Active attack detected
Impact: [description]
Actions: [what we're doing]
Updates: Every 30 minutes in #incident-response
```

### Status Page Update
```
We are investigating reports of [issue]. 
Updates will be posted as we learn more.
Last updated: [timestamp]
```

## 8. Legal & Compliance

- Document all actions with timestamps
- Preserve evidence (don't delete logs)
- Contact legal before public statements
- Follow breach notification laws (GDPR, CCPA, etc.)

## 9. Tools & Access

- Incident Dashboard: https://ops.credlink.com/incidents
- Log Search: https://logs.credlink.com
- AWS Console: https://console.aws.amazon.com
- Cloudflare: https://dash.cloudflare.com

## 10. Post-Incident Checklist

- [ ] Incident report written
- [ ] Root cause identified
- [ ] Preventive measures implemented
- [ ] Runbooks updated
- [ ] Team debriefed
- [ ] Customers notified (if required)
- [ ] Regulatory notifications submitted (if required)
- [ ] Insurance claim filed (if applicable)

---

**Last Updated**: 2024-11-12  
**Next Review**: 2025-02-12 (Quarterly)
