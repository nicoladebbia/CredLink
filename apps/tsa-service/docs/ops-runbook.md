# TSA Service Operations Runbook

## Overview
This runbook provides operational procedures for the TSA Redundancy & SLAs service, covering incident response, maintenance, and monitoring.

## Service Architecture
- **Providers**: DigiCert, GlobalSign, Sectigo (ETSI EN 319 421/422 compliant)
- **Health Monitoring**: 10-second probes with automatic failover
- **Queue System**: Cloudflare Durable Objects for strong consistency
- **SLA Targets**: 99.9% availability, P95 < 900ms, error budget ≤ 1.0%

---

## 🚨 Incident Response

### Provider Outage

#### Detection
- Health check failures (3 consecutive probes)
- P95 latency > 2000ms for 30s window
- Error rate spike > 5%

#### Response Steps
1. **Confirm Provider Status**
   ```bash
   curl https://tsa-service.example.com/tsa/status | jq '.providers'
   ```

2. **Check Health Probe Logs**
   ```bash
   kubectl logs -l app=tsa-service --tail=100 | grep "health_check"
   ```

3. **Verify Automatic Failover**
   - Primary should be marked red
   - Secondary/tertiary providers handling traffic
   - Check routing decisions in status endpoint

4. **Monitor Queue Depth**
   ```bash
   curl https://tsa-service.example.com/tsa/status | jq '.queue.size'
   ```

5. **Provider Recovery**
   - Wait for 3 consecutive green probes
   - Automatic failback will occur
   - Monitor for flap dampening (3 greens required)

#### Escalation Criteria
- Queue depth > 100 requests
- All providers unhealthy simultaneously
- Error rate > 2% for more than 5 minutes

### Queue Backlog

#### Detection
- Queue size > 50 requests
- Drain ETA > 10 minutes
- Processing rate < expected RPS

#### Response Steps
1. **Check Queue Status**
   ```bash
   curl https://tsa-service.example.com/tsa/status | jq '.queue'
   ```

2. **Manual Drain Trigger**
   ```bash
   curl -X POST https://tsa-service.example.com/tsa/queue/drain
   ```

3. **Increase Processing Parallelism**
   - Scale service horizontally if needed
   - Check Durable Object limits

4. **Monitor Drain Progress**
   ```bash
   watch -n 5 'curl -s https://tsa-service.example.com/tsa/status | jq ".queue"'
   ```

### SLA Breach

#### Detection
- P95 latency > 900ms sustained
- Availability < 99.9% (monthly)
- Error budget exhaustion

#### Response Steps
1. **Verify Metrics**
   ```bash
   curl https://tsa-service.example.com/metrics | grep tsa_
   ```

2. **Identify Root Cause**
   - Check provider health
   - Review queue depth
   - Analyze error patterns

3. **Implement Mitigations**
   - Adjust routing priorities
   - Increase hedging aggressiveness
   - Scale service capacity

---

## 🔧 Maintenance Procedures

### Provider Configuration Updates

#### Adding New Provider
1. Update `config/production-config.yaml`
2. Add trust anchors and policy OIDs
3. Test with staging environment
4. Deploy with rolling update

#### Updating Trust Anchors
1. **Prepare New Bundle**
   ```bash
   # Create new trust anchor bundle
   cat new-anchor.pem >> config/trust-bundle.pem
   ```

2. **Validate Configuration**
   ```bash
   npm run test:config
   ```

3. **Deploy Update**
   ```bash
   kubectl apply -f k8s/tsa-service-configmap.yaml
   kubectl rollout restart deployment/tsa-service
   ```

4. **Verify Operation**
   ```bash
   curl https://tsa-service.example.com/health
   ```

### Policy Updates

#### Tenant Policy Changes
1. **Update YAML Configuration**
   ```yaml
   # config/tenant-policies.yaml
   new-tenant:
     tenant_id: "new-tenant"
     accepted_trust_anchors: [...]
     accepted_policy_oids: [...]
     routing_priority: ["digicert", "globalsign", "sectigo"]
     sla:
       p95_latency_ms: 900
       monthly_error_budget_pct: 1.0
   ```

2. **Validate Policy**
   ```bash
   npm run validate:policies
   ```

3. **Reload Configuration**
   ```bash
   curl -X POST https://tsa-service.example.com/admin/reload-policies
   ```

### Certificate Rotation

#### TSA Provider Certificates
1. Monitor provider certificate expiration
2. Update trust anchors before expiration
3. Test with new certificates
4. Deploy configuration update

#### Service Certificates
1. Check certificate expiration
   ```bash
   kubectl get secrets -l app=tsa-service -o yaml | grep -i expire
   ```
2. Renew certificates (automated via cert-manager)
3. Verify service operation

---

## 📊 Monitoring & Alerting

### Key Metrics

#### Provider Health
```bash
# Provider availability
tsa_provider_health{provider="digicert"}

# Provider latency
tsa_provider_latency{provider="digicert"}

# Success rate
tsa_provider_success_rate{provider="digicert"}
```

#### Queue Metrics
```bash
# Queue depth
tsa_queue_size

# Processing rate
tsa_queue_processing

# Error rate
tsa_queue_error_rate
```

#### Service Metrics
```bash
# Overall availability
tsa_service_uptime

# Request latency
tsa_request_duration_seconds

# Error budget
tsa_error_budget_remaining
```

### Alert Thresholds

#### Critical Alerts
- All providers unhealthy
- Queue depth > 500
- Error rate > 5%
- Availability < 99.5%

#### Warning Alerts
- Single provider unhealthy
- P95 latency > 1200ms
- Queue depth > 100
- Error rate > 2%

### Dashboard Access

#### Grafana Dashboards
- TSA Service Overview
- Provider Health Details
- Queue Performance
- SLA Compliance

#### Status Endpoints
- Health: `/health`
- Status: `/tsa/status`
- Metrics: `/metrics`

---

## 🧪 Testing & Validation

### Health Check Testing
```bash
# Test individual provider health
curl -X POST https://tsa-service.example.com/admin/health-check/digicert

# Test failover scenario
curl -X POST https://tsa-service.example.com/admin/simulate-failover
```

### Load Testing
```bash
# Run load test
npm run test:load

# Validate SLA compliance
npm run test:sla
```

### OpenSSL Parity Testing
```bash
# Run parity tests
npm run test:openssl-parity

# Verify conformance
npm run test:rfc3161-conformance
```

---

## 🔄 Disaster Recovery

### Service Recovery
1. **Check Infrastructure Status**
   ```bash
   kubectl get pods -l app=tsa-service
   kubectl get services
   ```

2. **Restore from Backup**
   ```bash
   # Restore configuration
   kubectl apply -f backup/tsa-service-config.yaml
   
   # Restore queue state (if needed)
   kubectl apply -f backup/durable-objects.yaml
   ```

3. **Verify Service Operation**
   ```bash
   curl https://tsa-service.example.com/health
   npm run test:smoke
   ```

### Data Recovery
- Queue state is stored in Cloudflare Durable Objects
- Automatic recovery on service restart
- No manual data restoration required

---

## 📋 Procedures Checklist

### Daily Operations
- [ ] Check service health dashboard
- [ ] Review error rates and latency
- [ ] Monitor queue depth
- [ ] Verify provider health status

### Weekly Operations
- [ ] Review SLA compliance reports
- [ ] Check certificate expirations
- [ ] Analyze provider performance trends
- [ ] Update monitoring thresholds if needed

### Monthly Operations
- [ ] Review error budget utilization
- [ ] Audit tenant policy configurations
- [ ] Update trust anchors if required
- [ ] Perform OpenSSL parity validation

### Quarterly Operations
- [ ] Complete disaster recovery test
- [ ] Review and update runbook
- [ ] Audit provider compliance status
- [ ] Performance tuning and optimization

---

## 📞 Escalation Contacts

### Primary Contacts
- **TSA Service Lead**: [Contact Info]
- **Infrastructure Team**: [Contact Info]
- **Security Team**: [Contact Info]

### Provider Contacts
- **DigiCert Support**: [Contact Info]
- **GlobalSign Support**: [Contact Info]
- **Sectigo Support**: [Contact Info]

### Emergency Escalation
- **On-Call Engineer**: [Contact Info]
- **Engineering Manager**: [Contact Info]
- **VP Engineering**: [Contact Info]

---

## 🔍 Troubleshooting Guide

### Common Issues

#### High Latency
1. Check provider health status
2. Review network connectivity
3. Analyze queue depth
4. Verify service resource utilization

#### Queue Backlog
1. Check provider availability
2. Increase service capacity
3. Manual drain trigger
4. Review error patterns

#### Provider Failures
1. Verify provider endpoint connectivity
2. Check certificate validity
3. Review provider status pages
4. Enable alternative providers

#### Authentication Issues
1. Verify tenant policy configuration
2. Check trust anchor validity
3. Review policy OID mappings
4. Validate certificate chains

### Debug Commands
```bash
# Service logs
kubectl logs -l app=tsa-service --tail=100 -f

# Provider connectivity test
curl -v https://timestamp.digicert.com

# Queue inspection
curl https://tsa-service.example.com/tsa/status | jq '.queue'

# Health check details
curl https://tsa-service.example.com/health | jq '.providers'
```

---

## 📈 Performance Tuning

### Optimization Areas
- **Hedging Delay**: Adjust based on latency requirements
- **Health Check Interval**: Balance between responsiveness and overhead
- **Queue Parallelism**: Scale based on load patterns
- **Provider Routing**: Optimize for cost vs. performance

### Configuration Adjustments
```yaml
# Fine-tune hedging
routing:
  hedge_delay_ms: 250  # Reduce for faster failover

# Adjust health check frequency
health:
  probe_interval_s: 5   # Increase for faster detection

# Scale queue processing
queue:
  drain_batch_size: 100  # Increase for faster drain
```

---

*Last Updated: 2025-11-03*
*Version: 1.0*
*Next Review: 2025-12-03*
