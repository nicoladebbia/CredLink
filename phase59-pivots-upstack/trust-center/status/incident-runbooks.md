# Incident Response Runbooks

## Overview

Operational runbooks for responding to common incident types. Follow these procedures to ensure consistent, effective incident response aligned with best practices.

---

## Runbook 1: Complete API Outage (P1)

### Detection
- All health check endpoints return 5xx errors
- Synthetic monitors fail across all regions
- Customer error reports spike
- Alert: "API Endpoints Unreachable"

### Immediate Actions (0-5 minutes)

1. **Declare P1 Incident**
   ```bash
   # Create incident in PagerDuty
   pd incident create --title "Complete API Outage" --urgency high
   
   # Update status page
   status-page incident create --severity critical \
     --components "custody-api,analytics-api,auth-service" \
     --title "Service Outage - Investigating"
   ```

2. **Page Incident Commander**
   - Auto-escalates to on-call IC within 5 minutes
   - IC assembles response team

3. **Customer Notification**
   - Status page auto-posts initial update
   - Email notification queued (sent within 15 minutes)

### Investigation (5-15 minutes)

4. **Check Infrastructure Health**
   ```bash
   # Check load balancers
   aws elbv2 describe-target-health --target-group-arn <arn>
   
   # Check EC2 instances
   aws ec2 describe-instance-status --region us-east-1
   
   # Check RDS database
   aws rds describe-db-instances --db-instance-identifier prod-db
   ```

5. **Review Recent Changes**
   ```bash
   # Check recent deployments
   git log --since="2 hours ago" --oneline
   
   # Check AWS CloudTrail for recent API calls
   aws cloudtrail lookup-events --lookup-attributes \
     AttributeKey=EventName,AttributeValue=RunInstances \
     --start-time $(date -u -d '2 hours ago' +%s)
   ```

6. **Check Logs**
   ```bash
   # Application logs
   aws logs tail /aws/lambda/api-server --follow --since 15m
   
   # Database logs
   aws rds describe-db-log-files --db-instance-identifier prod-db
   ```

### Common Root Causes & Fixes

**Database Connection Pool Exhaustion**
```bash
# Check current connections
SELECT count(*) FROM pg_stat_activity;

# Kill idle connections if needed
SELECT pg_terminate_backend(pid) 
FROM pg_stat_activity 
WHERE state = 'idle' AND state_change < now() - interval '10 minutes';

# Restart application with increased pool size
kubectl set env deployment/api-server DB_POOL_MAX=20
kubectl rollout restart deployment/api-server
```

**Load Balancer Health Check Failures**
```bash
# Check target health
aws elbv2 describe-target-health --target-group-arn <arn>

# If all targets unhealthy, check security groups
aws ec2 describe-security-groups --group-ids <sg-id>

# Verify health check endpoint
curl -v http://<instance-ip>:4000/health
```

**Certificate Expiration**
```bash
# Check certificate expiration
echo | openssl s_client -servername yourdomain.com -connect yourdomain.com:443 2>/dev/null | openssl x509 -noout -dates

# Emergency certificate renewal
certbot renew --force-renewal --deploy-hook "systemctl reload nginx"
```

### Resolution & Recovery

7. **Verify Fix**
   ```bash
   # Test health endpoints
   curl https://api.yourdomain.com/health
   curl https://api.yourdomain.com/analytics/health
   
   # Check synthetic monitors
   datadog monitor check --monitor-id <id>
   ```

8. **Customer Notification**
   - Update status page to "Resolved"
   - Send resolution email using template
   - Confirm all systems operational

9. **Post-Incident**
   - Schedule post-mortem within 48 hours
   - Document timeline and actions taken
   - Identify prevention measures

### Rollback Procedure
```bash
# Rollback to previous deployment
kubectl rollout undo deployment/api-server

# Verify rollback successful
kubectl rollout status deployment/api-server

# Check health
curl https://api.yourdomain.com/health
```

---

## Runbook 2: Database Performance Degradation (P2)

### Detection
- API response times elevated (p95 > 500ms)
- Database CPU > 80%
- Query execution times increasing
- Alert: "Database Performance Degraded"

### Immediate Actions

1. **Declare P2 Incident**
   ```bash
   pd incident create --title "Database Performance Degradation" --urgency high
   status-page incident create --severity major \
     --components "database" \
     --title "Performance Degradation - Investigating"
   ```

2. **Identify Slow Queries**
   ```sql
   -- Connect to database
   psql -h prod-db.amazonaws.com -U admin -d custody_db
   
   -- Find slow queries
   SELECT pid, now() - pg_stat_activity.query_start AS duration, query 
   FROM pg_stat_activity 
   WHERE state = 'active' AND query NOT LIKE '%pg_stat_activity%'
   ORDER BY duration DESC;
   
   -- Check blocked queries
   SELECT blocked_locks.pid AS blocked_pid,
          blocking_locks.pid AS blocking_pid,
          blocked_activity.query AS blocked_statement,
          blocking_activity.query AS blocking_statement
   FROM pg_catalog.pg_locks blocked_locks
   JOIN pg_catalog.pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
   JOIN pg_catalog.pg_locks blocking_locks 
       ON blocking_locks.locktype = blocked_locks.locktype
       AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
       AND blocking_locks.page IS NOT DISTINCT FROM blocked_locks.page
       AND blocking_locks.tuple IS NOT DISTINCT FROM blocked_locks.tuple
       AND blocking_locks.virtualxid IS NOT DISTINCT FROM blocked_locks.virtualxid
       AND blocking_locks.transactionid IS NOT DISTINCT FROM blocked_locks.transactionid
       AND blocking_locks.classid IS NOT DISTINCT FROM blocked_locks.classid
       AND blocking_locks.objid IS NOT DISTINCT FROM blocked_locks.objid
       AND blocking_locks.objsubid IS NOT DISTINCT FROM blocked_locks.objsubid
       AND blocking_locks.pid != blocked_locks.pid
   JOIN pg_catalog.pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid
   WHERE NOT blocked_locks.granted;
   ```

3. **Check Index Usage**
   ```sql
   -- Find missing indexes
   SELECT schemaname, tablename, attname, n_distinct, correlation
   FROM pg_stats
   WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
   ORDER BY n_distinct DESC;
   
   -- Check index scan vs sequential scan
   SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch
   FROM pg_stat_user_indexes
   ORDER BY idx_scan ASC;
   ```

### Mitigation Options

**Kill Long-Running Query (if blocking)**
```sql
-- Terminate specific query
SELECT pg_terminate_backend(12345);  -- Replace with actual PID
```

**Add Missing Index (if identified)**
```sql
-- Create index (use CONCURRENTLY to avoid table lock)
CREATE INDEX CONCURRENTLY idx_custody_keys_tenant_active 
ON custody_keys(tenant_id, active) 
WHERE active = true;
```

**Scale Database Vertically**
```bash
# Modify RDS instance class
aws rds modify-db-instance \
  --db-instance-identifier prod-db \
  --db-instance-class db.r5.2xlarge \
  --apply-immediately
```

**Add Read Replica (if read-heavy)**
```bash
# Create read replica
aws rds create-db-instance-read-replica \
  --db-instance-identifier prod-db-read-1 \
  --source-db-instance-identifier prod-db \
  --db-instance-class db.r5.xlarge
```

### Recovery

4. **Monitor Performance**
   ```bash
   # Watch CloudWatch metrics
   aws cloudwatch get-metric-statistics \
     --namespace AWS/RDS \
     --metric-name CPUUtilization \
     --dimensions Name=DBInstanceIdentifier,Value=prod-db \
     --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
     --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
     --period 300 \
     --statistics Average
   ```

5. **Verify API Performance**
   ```bash
   # Check p95 latency
   datadog metric query --metric api.response_time.p95 --from 15m
   ```

---

## Runbook 3: Authentication Service Failure (P1)

### Detection
- Login failures spiking
- JWT verification errors
- Alert: "Auth Service Unreachable"

### Immediate Actions

1. **Verify JWT_SECRET Configuration**
   ```bash
   # Check if JWT_SECRET is set
   kubectl get secret api-secrets -o jsonpath='{.data.JWT_SECRET}' | base64 -d
   
   # Verify length (must be 32+ characters)
   kubectl get secret api-secrets -o jsonpath='{.data.JWT_SECRET}' | base64 -d | wc -c
   ```

2. **Check Auth Service Logs**
   ```bash
   kubectl logs -l app=api-server --tail=100 | grep -i "auth\|jwt"
   ```

3. **Test Authentication**
   ```bash
   # Test with valid token
   TOKEN="your-test-token"
   curl -H "Authorization: Bearer $TOKEN" https://api.yourdomain.com/health
   ```

### Common Issues

**JWT_SECRET Missing or Too Short**
```bash
# Generate new secure secret
NEW_SECRET=$(openssl rand -base64 48)

# Update secret
kubectl create secret generic api-secrets \
  --from-literal=JWT_SECRET="$NEW_SECRET" \
  --dry-run=client -o yaml | kubectl apply -f -

# Restart pods
kubectl rollout restart deployment/api-server
```

**Certificate Issues**
```bash
# Check SSL certificate
openssl s_client -connect api.yourdomain.com:443 -servername api.yourdomain.com

# Renew if needed
certbot renew
```

---

## Runbook 4: High Error Rate (P2/P3)

### Detection
- Error rate > 1%
- Specific endpoint returning 5xx errors
- Alert: "High Error Rate Detected"

### Investigation

1. **Identify Error Pattern**
   ```bash
   # Check error logs
   kubectl logs -l app=api-server --tail=1000 | grep -i error
   
   # Group by error type
   kubectl logs -l app=api-server --tail=1000 | grep -i error | sort | uniq -c | sort -nr
   ```

2. **Check Affected Endpoints**
   ```bash
   # Review access logs
   kubectl logs -l app=api-server | grep "HTTP/1.1 5" | awk '{print $7}' | sort | uniq -c | sort -nr
   ```

3. **Database Connection Issues**
   ```sql
   -- Check connection count
   SELECT count(*) FROM pg_stat_activity WHERE state = 'active';
   
   -- Check for connection errors
   SELECT * FROM pg_stat_database WHERE datname = 'custody_db';
   ```

### Resolution

**Increase Connection Pool**
```bash
kubectl set env deployment/api-server DB_POOL_MAX=15
```

**Fix Application Error**
```bash
# Deploy hotfix
git checkout -b hotfix/error-handling
# Make fix
git commit -am "fix: handle edge case in custody operations"
git push origin hotfix/error-handling

# Deploy
kubectl set image deployment/api-server api-server=yourdomain/api-server:hotfix-abc123
```

---

## Runbook 5: Security Incident Response

### Detection
- Unusual access patterns
- Failed authentication spike
- Security scanner alert
- Customer report

### Immediate Actions (DO NOT DELAY)

1. **Contain Threat**
   ```bash
   # Block suspicious IP immediately
   aws ec2 authorize-security-group-ingress \
     --group-id <sg-id> \
     --protocol tcp \
     --port 443 \
     --source <malicious-ip>/32 \
     --description "BLOCKED: Security incident"
   
   # Or use WAF
   aws wafv2 create-ip-set \
     --name blocked-ips \
     --addresses <malicious-ip>/32
   ```

2. **Notify Security Team**
   ```bash
   # Page security team
   pd incident create --title "Security Incident" \
     --urgency high \
     --escalation-policy "Security Team"
   
   # Email security@yourdomain.com
   ```

3. **Preserve Evidence**
   ```bash
   # Snapshot affected instances
   aws ec2 create-snapshot \
     --volume-id <vol-id> \
     --description "Security incident evidence $(date)"
   
   # Export logs
   aws logs export-logs \
     --log-group-name /aws/lambda/api-server \
     --from $(date -d '24 hours ago' +%s)000 \
     --to $(date +%s)000 \
     --destination s3-bucket-name \
     --destination-prefix security-incident-$(date +%Y%m%d)
   ```

4. **DO NOT**
   - Delete logs or evidence
   - Reboot systems without preserving state
   - Notify customers until incident confirmed and contained

### Investigation

5. **Analyze Logs**
   ```bash
   # Search for suspicious patterns
   grep -E "(unauthorized|failed|denied|attack|injection)" /var/log/app.log
   
   # Check for unusual API calls
   aws cloudtrail lookup-events --lookup-attributes \
     AttributeKey=EventName,AttributeValue=AssumeRole \
     --start-time $(date -u -d '48 hours ago' +%s)
   ```

6. **Coordinate with Legal/DPO**
   - Determine if personal data affected
   - Assess notification requirements (GDPR 72 hours)
   - Document timeline meticulously

---

## Runbook 6: Scheduled Maintenance

### Pre-Maintenance (7 days before)

1. **Send Advance Notice**
   ```bash
   # Post to status page
   status-page maintenance create \
     --scheduled-for "2025-12-15 02:00:00 UTC" \
     --duration 240 \
     --impact "zero-downtime" \
     --components "all"
   ```

2. **Prepare Runbook**
   - Document exact steps
   - Identify rollback points
   - Test in staging

3. **Change Advisory Board Approval**
   - Submit change request
   - Present risk assessment
   - Obtain approvals

### During Maintenance

4. **Execute Changes**
   ```bash
   # Blue-green deployment
   kubectl apply -f deployment-green.yaml
   
   # Wait for green to be healthy
   kubectl wait --for=condition=available --timeout=300s deployment/api-server-green
   
   # Switch traffic
   kubectl patch service api-server -p '{"spec":{"selector":{"version":"green"}}}'
   
   # Monitor for 15 minutes
   sleep 900
   
   # If stable, remove blue
   kubectl delete deployment api-server-blue
   ```

5. **Update Status Page**
   ```bash
   status-page maintenance update \
     --status "in-progress" \
     --message "Maintenance proceeding as planned"
   ```

### Post-Maintenance

6. **Verify Systems**
   ```bash
   # Run health checks
   ./scripts/health-check-all.sh
   
   # Verify metrics
   datadog monitor check-all
   ```

7. **Complete Maintenance**
   ```bash
   status-page maintenance complete \
     --message "Maintenance completed successfully"
   ```

---

## Emergency Contact List

**Incident Commander**
- Primary: On-call IC rotation
- Backup: Engineering Manager

**Database Admin**
- Primary: DBA on-call
- Backup: Senior Backend Engineer

**Security Team**
- Primary: security@yourdomain.com
- Escalation: CISO

**Legal/DPO**
- Privacy Incidents: dpo@yourdomain.com
- Legal Matters: legal@yourdomain.com

**External**
- AWS Support: Premium support case
- Security Vendor: [Contact info]

---

## Drill Schedule

**Quarterly Drills**
- Q1: Database failover
- Q2: Complete outage response
- Q3: Security incident response
- Q4: Privacy breach response

**Documentation**
- Record all drills in `/docs/drills/`
- Review and update runbooks after each drill
- Track improvement metrics (MTTD, MTTR)

---

**Last Updated**: 2025-11-07
**Next Review**: 2026-02-07 (Quarterly)
**Owner**: Site Reliability Engineering
