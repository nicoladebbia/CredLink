# CredLink Production Runbooks
# Incident Response Procedures for Health Monitoring

## Table of Contents
1. [Overview](#overview)
2. [Alert Severity Levels](#alert-severity-levels)
3. [On-Call Procedures](#on-call-procedures)
4. [Runbooks](#runbooks)
   - [Service Down](#service-down)
   - [Database Health Failure](#database-health-failure)
   - [Redis Health Failure](#redis-health-failure)
   - [Slow Health Checks](#slow-health-checks)
   - [Certificate Expiration](#certificate-expiration)
   - [High Failure Rate](#high-failure-rate)
   - [Service Degraded](#service-degraded)
5. [Escalation Procedures](#escalation-procedures)
6. [Communication Templates](#communication-templates)

---

## Overview

This document provides comprehensive runbooks for responding to CredLink health monitoring alerts in production. Each runbook includes:
- Alert description and impact
- Immediate actions to take
- Investigation steps
- Resolution procedures
- Prevention measures

### Contact Information
- **On-Call Engineer**: +1-555-CREDLINK
- **Engineering Lead**: engineering-lead@credlink.com
- **DevOps Team**: devops@credlink.com
- **Product Manager**: product@credlink.com

---

## Alert Severity Levels

### Critical (🚨)
- **Response Time**: Within 5 minutes
- **Impact**: Service completely down or critical component failure
- **Escalation**: Page on-call, Slack #incidents
- **Examples**: Service down, database failure, certificate expiration

### Warning (⚠️)
- **Response Time**: Within 30 minutes
- **Impact**: Service degraded or performance issues
- **Escalation**: Slack #alerts, email on-call
- **Examples**: Slow response times, degraded components

### Info (ℹ️)
- **Response Time**: Within 2 hours
- **Impact**: Informational events
- **Escalation**: Slack #info, no immediate action required
- **Examples**: Service restarts, configuration changes

---

## On-Call Procedures

### Initial Response (First 5 Minutes)
1. **Acknowledge Alert**: Mark as acknowledged in AlertManager
2. **Join Incident Channel**: Create/join Slack channel #incident-{timestamp}
3. **Assess Impact**: Check user-facing impact and affected systems
4. **Communicate**: Post initial status in incident channel
5. **Start Investigation**: Begin relevant runbook procedures

### Communication Protocol
- **Incident Channel**: #incident-{timestamp}
- **Status Updates**: Every 15 minutes during active incident
- **Stakeholder Updates**: Every 30 minutes for critical incidents
- **Post-Mortem**: Within 24 hours of resolution

---

## Runbooks

### Service Down

**Alert**: `CredlinkServiceDown`
**Severity**: Critical
**Response Time**: 5 minutes

#### Impact
- CredLink API is completely unavailable
- All user requests are failing
- Business impact: HIGH

#### Immediate Actions
1. **Check Service Status**
   ```bash
   kubectl get pods -n credlink
   kubectl get services -n credlink
   ```

2. **Check Recent Deployments**
   ```bash
   kubectl rollout history deployment/credlink-api -n credlink
   ```

3. **Review Logs**
   ```bash
   kubectl logs -n credlink -l app=credlink-api --tail=100
   ```

#### Investigation Steps
1. **Pod Issues**
   - Are pods running? (`kubectl get pods`)
   - Are pods in CrashLoopBackOff? (`kubectl describe pod`)
   - Resource constraints? (`kubectl top pods`)

2. **Service Issues**
   - Is service endpoint accessible? (`kubectl port-forward`)
   - Load balancer health checks passing?
   - DNS resolution working?

3. **Recent Changes**
   - Recent deployments? Check rollout history
   - Configuration changes? Check ConfigMaps
   - Infrastructure changes? Check AWS console

#### Resolution Procedures

**Scenario 1: Pod CrashLoopBackOff**
```bash
# Check pod logs for errors
kubectl logs -n credlink <pod-name> --previous

# Restart deployment
kubectl rollout restart deployment/credlink-api -n credlink

# Monitor rollout
kubectl rollout status deployment/credlink-api -n credlink
```

**Scenario 2: Resource Exhaustion**
```bash
# Check resource usage
kubectl top pods -n credlink
kubectl top nodes

# Scale up resources if needed
kubectl patch deployment credlink-api -n credlink -p '{"spec":{"template":{"spec":{"containers":[{"name":"credlink-api","resources":{"limits":{"memory":"2Gi","cpu":"1000m"}}}]}}}}'
```

**Scenario 3: Recent Deployment Issue**
```bash
# Rollback to previous version
kubectl rollout undo deployment/credlink-api -n credlink

# Verify rollback
kubectl rollout status deployment/credlink-api -n credlink
```

#### Prevention Measures
- Implement canary deployments
- Add pre-deployment health checks
- Monitor resource usage trends
- Implement automated rollback on health check failures

---

### Database Health Failure

**Alert**: `DatabaseHealthCheckFailed`
**Severity**: Critical
**Response Time**: 5 minutes

#### Impact
- Database connectivity issues
- Data operations failing
- Potential data corruption risk

#### Immediate Actions
1. **Check Database Status**
   ```bash
   # Connect to database
   psql $DATABASE_URL -c "SELECT 1;"
   
   # Check connection pool
   kubectl logs -n credlink -l app=credlink-api | grep "database"
   ```

2. **Verify Database Service**
   ```bash
   # Check PostgreSQL service
   kubectl get pods -n database | grep postgres
   kubectl get services -n database
   ```

#### Investigation Steps
1. **Connection Issues**
   - Network connectivity between API and database
   - SSL certificate validity
   - Connection pool exhaustion

2. **Database Performance**
   - Slow queries running
   - High CPU/memory usage
   - Disk space issues

3. **Recent Changes**
   - Database migrations
   - Schema changes
   - Configuration updates

#### Resolution Procedures

**Scenario 1: Connection Pool Exhaustion**
```bash
# Check active connections
psql $DATABASE_URL -c "SELECT count(*) FROM pg_stat_activity;"

# Increase pool size in deployment
kubectl set env deployment/credlink-api DB_POOL_MAX=30 -n credlink

# Restart deployment
kubectl rollout restart deployment/credlink-api -n credlink
```

**Scenario 2: Database Performance Issues**
```bash
# Check slow queries
psql $DATABASE_URL -c "SELECT query, mean_time, calls FROM pg_stat_statements ORDER BY mean_time DESC LIMIT 10;"

# Kill long-running queries if necessary
psql $DATABASE_URL -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'active' AND query_start < now() - interval '5 minutes';"
```

**Scenario 3: Database Service Issues**
```bash
# Restart database pods
kubectl rollout restart deployment/postgres -n database

# Check storage
kubectl get pvc -n database
```

#### Prevention Measures
- Implement connection pool monitoring
- Set up database performance alerts
- Regular maintenance and vacuuming
- Implement read replicas for load distribution

---

### Redis Health Failure

**Alert**: `RedisHealthCheckFailed`
**Severity**: Critical
**Response Time**: 5 minutes

#### Impact
- Caching service unavailable
- Session management issues
- Performance degradation

#### Immediate Actions
1. **Check Redis Status**
   ```bash
   # Test Redis connection
   redis-cli -u $REDIS_URL ping
   
   # Check Redis service
   kubectl get pods -n cache | grep redis
   ```

2. **Verify Redis Metrics**
   ```bash
   # Check memory usage
   redis-cli -u $REDIS_URL info memory
   
   # Check connection count
   redis-cli -u $REDIS_URL info clients
   ```

#### Investigation Steps
1. **Service Issues**
   - Redis pod status
   - Resource constraints
   - Network connectivity

2. **Performance Issues**
   - Memory exhaustion
   - High connection count
   - Slow operations

3. **Configuration Issues**
   - Incorrect connection string
   - Authentication failures
   - Network policies blocking

#### Resolution Procedures

**Scenario 1: Redis Memory Exhaustion**
```bash
# Check memory usage
redis-cli -u $REDIS_URL info memory | grep used_memory_human

# Clear expired keys
redis-cli -u $REDIS_URL --scan --pattern "*:expired:*" | xargs redis-cli -u $REDIS_URL del

# Restart Redis if needed
kubectl rollout restart deployment/redis -n cache
```

**Scenario 2: Connection Issues**
```bash
# Check Redis configuration
kubectl get configmap redis-config -n cache -o yaml

# Update connection string
kubectl set env deployment/credlink-api REDIS_URL=redis://:password@redis:6379 -n credlink

# Restart API
kubectl rollout restart deployment/credlink-api -n credlink
```

#### Prevention Measures
- Monitor Redis memory usage
- Implement connection pooling
- Set up Redis clustering
- Regular key expiration policies

---

### Slow Health Checks

**Alert**: `HealthCheckSlowResponse`
**Severity**: Warning
**Response Time**: 30 minutes

#### Impact
- Performance degradation
- Potential timeout issues
- User experience impact

#### Immediate Actions
1. **Check Response Times**
   ```bash
   # Test health endpoint response time
   time curl -s http://credlink-api/health
   
   # Check Prometheus metrics
   curl -s http://prometheus:9090/api/v1/query?query=credlink_health_check_response_time_ms
   ```

2. **Identify Slow Components**
   ```bash
   # Check detailed health
   curl -s http://credlink-api/health/detailed | jq '.checks[] | select(.responseTime > 5000)'
   ```

#### Investigation Steps
1. **Network Issues**
   - Latency between services
   - Network congestion
   - DNS resolution delays

2. **Resource Issues**
   - High CPU usage
   - Memory pressure
   - I/O bottlenecks

3. **Application Issues**
   - Database query performance
   - External service calls
   - Inefficient code paths

#### Resolution Procedures

**Scenario 1: Database Query Slowness**
```bash
# Check slow queries
psql $DATABASE_URL -c "SELECT query, mean_time FROM pg_stat_statements ORDER BY mean_time DESC LIMIT 5;"

# Optimize queries or add indexes
# Consider database scaling
```

**Scenario 2: External Service Delays**
```bash
# Test external service connectivity
curl -w "@curl-format.txt" -o /dev/null -s https://manifest-store.credlink.com/health

# Check service configuration
kubectl get configmap external-services -n credlink
```

**Scenario 3: Resource Constraints**
```bash
# Check resource usage
kubectl top pods -n credlink

# Scale up if needed
kubectl patch deployment credlink-api -n credlink -p '{"spec":{"replicas":5}}'
```

#### Prevention Measures
- Implement performance monitoring
- Set up automated scaling
- Regular performance testing
- Optimize database queries

---

### Certificate Expiration

**Alert**: `CertificateExpiringSoon`
**Severity**: Critical
**Response Time**: 5 minutes

#### Impact
- SSL/TLS certificate expiration
- Service accessibility issues
- Security compliance violations

#### Immediate Actions
1. **Check Certificate Status**
   ```bash
   # Check certificate expiration
   openssl x509 -in /etc/ssl/certs/credlink.crt -noout -enddate
   
   # Check all certificates
   kubectl get secrets -n credlink | grep cert
   ```

2. **Verify Certificate Usage**
   ```bash
   # Check which services use certificates
   kubectl get ingress -n credlink
   kubectl get services -n credlink
   ```

#### Investigation Steps
1. **Certificate Inventory**
   - List all certificates
   - Check expiration dates
   - Identify affected services

2. **Renewal Process**
   - Certificate authority access
   - Renewal automation status
   - Validation requirements

3. **Impact Assessment**
   - Services using expiring certificates
   - External dependencies
   - User-facing impact

#### Resolution Procedures

**Scenario 1: Manual Certificate Renewal**
```bash
# Generate new certificate
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout credlink.key -out credlink.crt \
  -subj "/C=US/ST=State/L=City/O=CredLink/CN=credlink.com"

# Update Kubernetes secret
kubectl create secret generic credlink-ssl-certs \
  --from-file=tls.crt=credlink.crt \
  --from-file=tls.key=credlink.key \
  --namespace=credlink --dry-run=client -o yaml | kubectl apply -f -

# Restart affected services
kubectl rollout restart deployment/credlink-api -n credlink
```

**Scenario 2: Automated Renewal**
```bash
# Check cert-manager status
kubectl get certificates -n credlink
kubectl get clusterissuers

# Trigger renewal if needed
kubectl delete certificate credlink-cert -n credlink
```

#### Prevention Measures
- Implement automated certificate renewal
- Set up expiration alerts (30 days, 7 days, 1 day)
- Regular certificate audits
- Document renewal procedures

---

### High Failure Rate

**Alert**: `HealthCheckHighFailureRate`
**Severity**: Warning
**Response Time**: 30 minutes

#### Impact
- Component instability
- Potential cascading failures
- User experience degradation

#### Immediate Actions
1. **Check Failure Metrics**
   ```bash
   # Check failure rate in Prometheus
   curl -s "http://prometheus:9090/api/v1/query?query=rate(credlink_health_check_failures_total[5m])"
   
   # Identify failing components
   curl -s http://credlink-api/health/detailed | jq '.checks[] | select(.status == "unhealthy")'
   ```

2. **Review Recent Changes**
   ```bash
   # Check recent deployments
   kubectl rollout history deployment/credlink-api -n credlink
   
   # Check recent configuration changes
   kubectl get configmaps -n credlink --sort-by=.metadata.creationTimestamp
   ```

#### Investigation Steps
1. **Pattern Analysis**
   - Time-based patterns
   - Component correlation
   - External dependencies

2. **Load Analysis**
   - Request volume spikes
   - Resource utilization
   - Rate limiting impact

3. **Dependency Analysis**
   - External service status
   - Network connectivity
   - Third-party API issues

#### Resolution Procedures

**Scenario 1: Temporary Load Spike**
```bash
# Scale up temporarily
kubectl patch deployment credlink-api -n credlink -p '{"spec":{"replicas":10}}'

# Monitor metrics
kubectl top pods -n credlink
```

**Scenario 2: External Service Issues**
```bash
# Test external service connectivity
curl -s https://manifest-store.credlink.com/health
curl -s https://c2pa.credlink.com/health

# Implement circuit breakers if needed
# Update service configuration
```

**Scenario 3: Application Bugs**
```bash
# Rollback recent deployment
kubectl rollout undo deployment/credlink-api -n credlink

# Investigate logs for errors
kubectl logs -n credlink -l app=credlink-api --tail=200 | grep ERROR
```

#### Prevention Measures
- Implement circuit breakers
- Set up load testing
- Monitor dependency health
- Implement gradual rollouts

---

### Service Degraded

**Alert**: `CredlinkServiceDegraded`
**Severity**: Warning
**Response Time**: 30 minutes

#### Impact
- Partial functionality loss
- Performance degradation
- User experience impact

#### Immediate Actions
1. **Assess Degradation Level**
   ```bash
   # Check overall service status
   curl -s http://credlink-api/health/detailed | jq '.overallStatus'
   
   # Identify degraded components
   curl -s http://credlink-api/health/detailed | jq '.checks[] | select(.status == "degraded")'
   ```

2. **Check User Impact**
   ```bash
   # Monitor error rates
   curl -s "http://prometheus:9090/api/v1/query?query=rate(http_requests_total{status=~\"5..\"}[5m])"
   
   # Check response times
   curl -s "http://prometheus:9090/api/v1/query?query=histogram_quantile(0.95,rate(http_request_duration_seconds_bucket[5m]))"
   ```

#### Investigation Steps
1. **Component Analysis**
   - Which components are degraded?
   - Inter-component dependencies
   - Performance bottlenecks

2. **Resource Analysis**
   - CPU/memory utilization
   - Network bandwidth
   - Storage I/O

3. **External Dependencies**
   - Third-party service status
   - Network latency
   - API rate limits

#### Resolution Procedures

**Scenario 1: Performance Degradation**
```bash
# Scale up resources
kubectl patch deployment credlink-api -n credlink -p '{"spec":{"template":{"spec":{"containers":[{"name":"credlink-api","resources":{"limits":{"memory":"2Gi","cpu":"1000m"}}}]}}}}'

# Enable caching
kubectl set env deployment/credlink-api ENABLE_CACHING=true -n credlink
```

**Scenario 2: Partial Component Failure**
```bash
# Restart specific components
kubectl rollout restart deployment/credlink-api -n credlink

# Check component logs
kubectl logs -n credlink -l app=credlink-api --tail=100 | grep -i error
```

#### Prevention Measures
- Implement comprehensive monitoring
- Set up performance baselines
- Regular load testing
- Implement redundancy for critical components

---

## Escalation Procedures

### Escalation Matrix

| Time Since Alert | Primary Action | Escalation If No Response |
|------------------|----------------|---------------------------|
| 0-5 minutes | Page on-call engineer | Page engineering lead |
| 5-15 minutes | On-call engineer investigating | Page DevOps team |
| 15-30 minutes | Incident response team | Page CTO |
| 30+ minutes | Executive response | Emergency procedures |

### Escalation Triggers
- **Critical alert not acknowledged in 5 minutes**
- **Service still down after 15 minutes**
- **User impact increasing**
- **Multiple critical alerts simultaneously**

### Escalation Contacts
- **Engineering Lead**: +1-555-ENG-LEAD
- **DevOps Team**: +1-555-DEVOPS
- **CTO**: +1-555-CTO
- **Emergency**: +1-555-EMERGENCY

---

## Communication Templates

### Initial Incident Notification
```
🚨 INCIDENT DECLARED 🚨

Service: CredLink API
Severity: CRITICAL
Start Time: {timestamp}
Incident Commander: {name}
Slack Channel: #incident-{timestamp}

Initial Assessment:
- Issue: {brief description}
- Impact: {user impact}
- Current Status: {status}

Next Steps:
- Investigating root cause
- Updates every 15 minutes
- Target resolution: {ETA}

Stakeholder Actions:
- Monitor #incident-{timestamp} for updates
- Prepare customer communications if needed
```

### Status Update Template
```
📊 INCIDENT UPDATE 📊

Incident: #incident-{timestamp}
Time: {timestamp}
Status: {IN PROGRESS|RESOLVED|MONITORING}

Progress:
- {what we've done}
- {current findings}
- {next steps}

Impact:
- {current user impact}
- {services affected}

ETA:
- {estimated resolution time}

Next Update: {time}
```

### Resolution Notification
```
✅ INCIDENT RESOLVED ✅

Incident: #incident-{timestamp}
Resolution Time: {timestamp}
Duration: {total duration}

Root Cause:
- {primary cause}
- {contributing factors}

Resolution:
- {actions taken}
- {services restored}

Prevention:
- {measures to prevent recurrence}
- {follow-up items}

Post-Mortem:
- Scheduled for {date/time}
- All stakeholders invited

Thank you for your patience and support.
```

---

## Appendix

### Useful Commands
```bash
# Port forwarding for local testing
kubectl port-forward -n credlink svc/credlink-api 8080:80
kubectl port-forward -n monitoring svc/prometheus 9090:9090
kubectl port-forward -n monitoring svc/grafana 3000:3000

# Log streaming
kubectl logs -n credlink -l app=credlink-api -f
kubectl logs -n monitoring -l app=prometheus -f

# Resource monitoring
kubectl top pods -n credlink
kubectl top nodes

# Service status
kubectl get pods,services,deployments -n credlink
kubectl get events -n credlink --sort-by='.lastTimestamp'
```

### Monitoring URLs
- **Prometheus**: https://prometheus.credlink.com
- **Grafana**: https://grafana.credlink.com
- **AlertManager**: https://alertmanager.credlink.com

### Documentation Links
- [Architecture Documentation](https://docs.credlink.com/architecture)
- [Deployment Procedures](https://docs.credlink.com/deployment)
- [Security Procedures](https://docs.credlink.com/security)
