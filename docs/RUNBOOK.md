# CredLink Operations Runbook

## 📋 Overview

This runbook provides step-by-step procedures for troubleshooting, incident response, and operational maintenance of the hardened CredLink API. It covers common issues, emergency procedures, and escalation paths.

**Target Audience:** Site Reliability Engineers, DevOps Engineers, On-call Engineers  
**Response Time:** Critical incidents within 15 minutes, High priority within 1 hour  

---

## 🚨 Incident Severity Levels

### SEV-0 - Critical (Immediate Response)
- Complete service outage
- Security breach or data exposure
- Production data corruption
- Revenue impact > $10,000/hour

### SEV-1 - High (Response within 15 minutes)
- Significant service degradation
- Partial outage affecting >50% users
- Security vulnerability in production
- Performance degradation >50%

### SEV-2 - Medium (Response within 1 hour)
- Minor service degradation
- Partial outage affecting <50% users
- Performance degradation 20-50%
- Non-critical security issues

### SEV-3 - Low (Response within 4 hours)
- Minor issues
- Documentation or monitoring gaps
- Performance improvements

---

## 🔍 Health Check Procedures

### 1. Basic Service Health

```bash
# Check service availability
curl -f https://credlink.com/health

# Detailed health status
curl -s https://credlink.com/health | jq .

# Check specific endpoints
curl -f https://credlink.com/api/v1/status
curl -f https://credlink.com/api/v1/health

# Verify database connectivity
curl -s https://credlink.com/health | jq '.checks.database'
```

### 2. Kubernetes Health

```bash
# Check pod status
kubectl get pods -n credlink-production -l app=credlink-api

# Check deployment status
kubectl rollout status deployment/credlink-api -n credlink-production

# Check resource usage
kubectl top pods -n credlink-production

# Check events
kubectl get events -n credlink-production --sort-by='.lastTimestamp' | tail -20
```

### 3. Database Health

```bash
# Test database connectivity from pod
kubectl exec -it deployment/credlink-api -n credlink-production -- \
  node -e "
const { Pool } = require('pg');
const pool = new Pool(process.env.DATABASE_URL);
pool.query('SELECT 1')
  .then(() => console.log('✅ Database OK'))
  .catch(err => console.error('❌ Database Error:', err.message));
"

# Check database connections
kubectl exec -it deployment/credlink-api -n credlink-production -- \
  node -e "
const { Pool } = require('pg');
const pool = new Pool(process.env.DATABASE_URL);
pool.query('SELECT count(*) as active_connections FROM pg_stat_activity WHERE state = \'active\'')
  .then(res => console.log('Active connections:', res.rows[0].active_connections))
  .catch(console.error);
"
```

---

## 🚨 Common Incidents & Solutions

### Incident: Service Unavailable (503/502 Errors)

**Symptoms:**
- HTTP 503 Service Unavailable
- HTTP 502 Bad Gateway
- Health check failures
- Load balancer reporting unhealthy instances

**Immediate Actions:**
1. **Check Pod Status**
   ```bash
   kubectl get pods -n credlink-production -l app=credlink-api
   ```

2. **Check Pod Logs**
   ```bash
   kubectl logs -f deployment/credlink-api -n credlink-production --tail=100
   ```

3. **Check Resource Usage**
   ```bash
   kubectl top pods -n credlink-production
   kubectl describe nodes | grep -A 10 "Allocated resources"
   ```

4. **Restart Deployment**
   ```bash
   kubectl rollout restart deployment/credlink-api -n credlink-production
   kubectl rollout status deployment/credlink-api -n credlink-production
   ```

**Root Causes:**
- Memory exhaustion (OOMKilled)
- Database connection issues
- Resource limits exceeded
- Configuration errors

**Prevention:**
- Monitor memory usage and set appropriate limits
- Implement database connection pooling
- Set up proper resource requests/limits
- Use blue-green deployments

---

### Incident: High Error Rate (5xx Responses)

**Symptoms:**
- HTTP 500 Internal Server Error
- HTTP 502 Bad Gateway
- Application exceptions
- Database connection errors

**Immediate Actions:**
1. **Check Error Metrics**
   ```bash
   # Check recent error logs
   kubectl logs -f deployment/credlink-api -n credlink-production | grep ERROR

   # Check error rate in monitoring
   curl -s "http://prometheus:9090/api/v1/query?query=rate(http_requests_total{status=~'5..'}[5m])"
   ```

2. **Check Database Connectivity**
   ```bash
   # Test database from pod
   kubectl exec -it deployment/credlink-api -n credlink-production -- \
     node -e "
   const { Pool } = require('pg');
   const pool = new Pool(process.env.DATABASE_URL);
   pool.query('SELECT version()')
     .then(res => console.log('Database version:', res.rows[0].version))
     .catch(err => console.error('Database error:', err.message));
   "
   ```

3. **Check Environment Variables**
   ```bash
   kubectl exec -it deployment/credlink-api -n credlink-production -- env | grep -E "(DATABASE|AWS|API)"
   ```

4. **Rollback if Recent Deployment**
   ```bash
   # Check rollout history
   kubectl rollout history deployment/credlink-api -n credlink-production

   # Rollback to previous version
   kubectl rollout undo deployment/credlink-api -n credlink-production
   ```

**Root Causes:**
- Database connectivity issues
- Configuration errors
- Recent deployment bugs
- External service failures

---

### Incident: High Memory Usage

**Symptoms:**
- OOMKilled pods
- Memory usage > 90%
- Slow response times
- Pod restarts

**Immediate Actions:**
1. **Check Memory Usage**
   ```bash
   # Current memory usage
   kubectl top pods -n credlink-production

   # Memory usage trends
   kubectl exec -it deployment/credlink-api -n credlink-production -- \
     node -e "console.log(JSON.stringify(process.memoryUsage(), null, 2))"
   ```

2. **Check for Memory Leaks**
   ```bash
   # Monitor memory over time
   kubectl exec -it deployment/credlink-api -n credlink-production -- \
     node -e "
   setInterval(() => {
     const mem = process.memoryUsage();
     console.log('Heap Used:', Math.round(mem.heapUsed / 1024 / 1024) + 'MB');
   }, 5000);
   "
   ```

3. **Scale Resources**
   ```bash
   # Increase memory limits
   kubectl patch deployment credlink-api -n credlink-production -p '
   {
     "spec": {
       "template": {
         "spec": {
           "containers": [{
             "name": "credlink-api",
             "resources": {
               "limits": {
                 "memory": "2Gi"
               },
               "requests": {
                 "memory": "1Gi"
               }
             }
           }]
         }
       }
     }
   }'
   ```

4. **Force Restart**
   ```bash
   kubectl rollout restart deployment/credlink-api -n credlink-production
   ```

**Root Causes:**
- Memory leaks in application code
- Insufficient memory limits
- Large file processing
- Cache buildup

---

### Incident: Database Connection Issues

**Symptoms:**
- Database timeout errors
- Connection pool exhaustion
- Slow database queries
- Authentication failures

**Immediate Actions:**
1. **Check Database Connectivity**
   ```bash
   # Test connection from pod
   kubectl exec -it deployment/credlink-api -n credlink-production -- \
     node -e "
   const { Pool } = require('pg');
   const pool = new Pool({
     ...process.env.DATABASE_URL,
     connectionTimeoutMillis: 5000,
     query_timeout: 5000
   });
   pool.query('SELECT 1')
     .then(() => console.log('✅ Database OK'))
     .catch(err => console.error('❌ Database Error:', err.message));
   "
   ```

2. **Check Connection Pool**
   ```bash
   # Check active connections
   kubectl exec -it deployment/credlink-api -n credlink-production -- \
     node -e "
   const { Pool } = require('pg');
   const pool = new Pool(process.env.DATABASE_URL);
   pool.query('SELECT count(*) as total FROM pg_stat_activity')
     .then(res => console.log('Total connections:', res.rows[0].total))
     .catch(console.error);
   "
   ```

3. **Check Database Performance**
   ```bash
   # Check slow queries
   kubectl exec -it deployment/credlink-api -n credlink-production -- \
     node -e "
   const { Pool } = require('pg');
   const pool = new Pool(process.env.DATABASE_URL);
   pool.query('SELECT query, mean_time, calls FROM pg_stat_statements ORDER BY mean_time DESC LIMIT 5')
     .then(res => console.log('Slow queries:', res.rows))
     .catch(console.error);
   "
   ```

4. **Restart Application**
   ```bash
   kubectl rollout restart deployment/credlink-api -n credlink-production
   ```

**Root Causes:**
- Database server overload
- Network connectivity issues
- Connection pool misconfiguration
- Long-running queries

---

## 🔐 Security Incidents

### Incident: API Key Authentication Failures

**Symptoms:**
- 401 Unauthorized responses
- API key validation errors
- Authentication rate limiting

**Immediate Actions:**
1. **Check API Key Configuration**
   ```bash
   kubectl get secret credlink-api-keys -n credlink-production -o yaml
   ```

2. **Verify API Key Format**
   ```bash
   # Test API key
   curl -H "X-API-Key: test-key" https://credlink.com/api/v1/status
   ```

3. **Check Authentication Logs**
   ```bash
   kubectl logs -f deployment/credlink-api -n credlink-production | grep -i "auth\|api.*key"
   ```

4. **Rotate API Keys if Compromised**
   ```bash
   # Generate new API keys
   kubectl create secret generic credlink-api-keys-new \
     --from-literal=keys="new-key-1,new-key-2" \
     -n credlink-production

   # Update deployment
   kubectl set env deployment/credlink-api \
     --from=secret/credlink-api-keys-new \
     -n credlink-production
   ```

---

### Incident: CORS Violations

**Symptoms:**
- CORS errors in browser console
- 403 Forbidden responses
- Cross-origin request blocked

**Immediate Actions:**
1. **Check CORS Configuration**
   ```bash
   kubectl exec -it deployment/credlink-api -n credlink-production -- \
     node -e "console.log('Allowed origins:', process.env.ALLOWED_ORIGINS)"
   ```

2. **Test CORS Headers**
   ```bash
   curl -H "Origin: https://test.com" -H "Access-Control-Request-Method: POST" \
     -X OPTIONS https://credlink.com/api/v1/sign -v
   ```

3. **Update CORS Configuration**
   ```bash
   kubectl set env deployment/credlink-api \
     ALLOWED_ORIGINS="https://credlink.com,https://app.credlink.com" \
     -n credlink-production
   ```

---

## 📊 Performance Issues

### Incident: Slow Response Times

**Symptoms:**
- Response times > 5 seconds
- Timeout errors
- User complaints about slowness

**Immediate Actions:**
1. **Check Response Times**
   ```bash
   # Test endpoint response time
   time curl -s https://credlink.com/health

   # Check detailed timing
   curl -w "@curl-format.txt" -s https://credlink.com/health
   ```

2. **Check Resource Usage**
   ```bash
   kubectl top pods -n credlink-production
   kubectl top nodes
   ```

3. **Check Database Query Performance**
   ```bash
   kubectl exec -it deployment/credlink-api -n credlink-production -- \
     node -e "
   const { Pool } = require('pg');
   const pool = new Pool(process.env.DATABASE_URL);
   const start = Date.now();
   pool.query('SELECT 1').then(() => {
     console.log('Query time:', Date.now() - start, 'ms');
   });
   "
   ```

4. **Scale Horizontal**
   ```bash
   kubectl scale deployment credlink-api --replicas=5 -n credlink-production
   ```

---

## 🔄 Maintenance Procedures

### 1. Rolling Restart

```bash
# Perform rolling restart
kubectl rollout restart deployment/credlink-api -n credlink-production

# Monitor progress
kubectl rollout status deployment/credlink-api -n credlink-production

# Check pod health
kubectl get pods -n credlink-production -l app=credlink-api
```

### 2. Blue-Green Deployment

```bash
# Deploy to green environment
kubectl apply -f deployment.yaml -n credlink-green

# Wait for green to be ready
kubectl wait --for=condition=available deployment/credlink-api \
  -n credlink-green --timeout=300s

# Switch traffic
kubectl patch service credlink-api-service -n credlink-production \
  -p '{"spec":{"selector":{"environment":"green"}}}'

# Validate
curl -f https://credlink.com/health
```

### 3. Emergency Scaling

```bash
# Scale up for high load
kubectl scale deployment credlink-api --replicas=10 -n credlink-production

# Scale down after load
kubectl scale deployment credlink-api --replicas=3 -n credlink-production

# Check autoscaler status
kubectl get hpa -n credlink-production
```

---

## 📈 Monitoring & Alerting

### 1. Key Metrics to Monitor

- **Error Rate**: `rate(http_requests_total{status=~"5.."}[5m])`
- **Response Time**: `histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))`
- **Memory Usage**: `container_memory_usage_bytes / container_spec_memory_limit_bytes`
- **CPU Usage**: `rate(container_cpu_usage_seconds_total[5m])`
- **Database Connections**: `pg_stat_database_numbackends`

### 2. Alert Thresholds

- **Error Rate**: > 1% (Warning), > 5% (Critical)
- **Response Time**: > 2s (Warning), > 5s (Critical)
- **Memory Usage**: > 80% (Warning), > 95% (Critical)
- **CPU Usage**: > 70% (Warning), > 90% (Critical)
- **Database Connections**: > 80% of max (Warning), > 95% (Critical)

### 3. Dashboard Checks

Check these dashboards during incidents:
1. **Application Overview**: Error rates, response times
2. **Infrastructure**: CPU, memory, network
3. **Database**: Connections, query performance
4. **Security**: Authentication failures, rate limits

---

## 🆘 Escalation Procedures

### 1. Incident Escalation

**Level 1 (On-call Engineer):**
- Initial triage and response
- Implement immediate fixes
- Document incident timeline

**Level 2 (Senior Engineer):**
- Complex troubleshooting
- Code-level debugging
- Architecture decisions

**Level 3 (Engineering Manager):**
- Major incident coordination
- Customer communication
- Post-incident review

### 2. Communication Protocol

**Internal Communication:**
- Slack: `#incidents` channel
- PagerDuty: On-call rotation
- Status Page: Internal status updates

**External Communication:**
- Status Page: customer-facing updates
- Email: Critical customer notifications
- Twitter: Major outage announcements

### 3. Post-Incident Review

**Timeline:**
- Within 24 hours for SEV-0/SEV-1
- Within 72 hours for SEV-2/SEV-3

**Review Items:**
- Root cause analysis
- Timeline of events
- Impact assessment
- Prevention measures
- Action items

---

## 📞 Emergency Contacts

### Primary Contacts
- **On-call Engineer**: PagerDuty (555-0101)
- **Engineering Manager**: engineering-manager@company.com
- **DevOps Lead**: devops-lead@company.com

### Secondary Contacts
- **Security Team**: security@company.com
- **Database Team**: database@company.com
- **Infrastructure Team**: infrastructure@company.com

### External Contacts
- **AWS Support**: 1-800-XXX-XXXX
- **Database Vendor**: vendor-support@company.com
- **CDN Provider**: cdn-support@company.com

---

## 🔧 Quick Reference Commands

### Health Checks
```bash
# Service health
curl -f https://credlink.com/health

# Pod status
kubectl get pods -n credlink-production -l app=credlink-api

# Deployment status
kubectl rollout status deployment/credlink-api -n credlink-production
```

### Troubleshooting
```bash
# Pod logs
kubectl logs -f deployment/credlink-api -n credlink-production

# Resource usage
kubectl top pods -n credlink-production

# Events
kubectl get events -n credlink-production --sort-by='.lastTimestamp'
```

### Emergency Actions
```bash
# Restart deployment
kubectl rollout restart deployment/credlink-api -n credlink-production

# Scale up
kubectl scale deployment credlink-api --replicas=5 -n credlink-production

# Rollback
kubectl rollout undo deployment/credlink-api -n credlink-production
```

---

## 📚 Additional Resources

- [Deployment Guide](./DEPLOYMENT_GUIDE.md)
- [Architecture Documentation](./ARCHITECTURE.md)
- [Security Policies](../SECURITY.md)
- [Monitoring Setup](../monitoring/README.md)

---

*Last Updated: November 2025*  
*Version: 1.0.0*  
*Maintained by: Site Reliability Engineering Team*
