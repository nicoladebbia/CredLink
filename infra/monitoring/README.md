# CredLink Monitoring & Alerting

Comprehensive monitoring and alerting infrastructure for CredLink production environment.

## Overview

This directory contains monitoring configurations for:

- **CloudWatch**: AWS native monitoring and dashboards
- **Prometheus**: Metrics collection and alerting
- **Grafana**: Visualization and dashboards
- **Alertmanager**: Alert routing and notification

## Components

### CloudWatch

**Dashboard**: `dashboards/cloudwatch-dashboard.json`

Monitors:
- ECS service metrics (CPU, memory)
- ALB metrics (requests, response time, errors)
- RDS metrics (CPU, connections, storage)
- Redis metrics (CPU, connections, memory)
- S3 storage metrics

**Setup:**
```bash
aws cloudwatch put-dashboard \
  --dashboard-name credlink-prod \
  --dashboard-body file://dashboards/cloudwatch-dashboard.json
```

### Prometheus

**Config**: `prometheus/prometheus-config.yaml`

Scrape targets:
- CredLink API (HTTPS)
- Redis exporter
- PostgreSQL exporter
- Node exporter
- CloudWatch exporter

**Alert Rules**: `alerts/alert_rules.yml`

Alert categories:
- API alerts (error rate, latency, downtime)
- Infrastructure alerts (CPU, memory, disk)
- Database alerts (connections, CPU, replication)
- Redis alerts (memory, evictions, downtime)
- Business alerts (traffic, 4XX rate)

**Recording Rules**: `alerts/recording_rules.yml`

Pre-computed metrics for faster queries.

### Grafana

**Dashboard**: `grafana/credlink-dashboard.json`

Panels:
- Request rate by status code
- Response time percentiles (p50, p95, p99)
- CPU, memory, disk usage
- Database and Redis metrics
- Key performance indicators

### Alertmanager

**Config**: `prometheus/alertmanager-config.yaml`

Notification channels:
- Slack (warnings, critical, business)
- PagerDuty (critical only)

## Quick Start

### Using Docker Compose

```bash
cd infra/monitoring

# Set environment variables
export GRAFANA_ADMIN_PASSWORD=your-secure-password
export REDIS_PASSWORD=your-redis-password
export DB_USER=postgres
export DB_PASSWORD=your-db-password
export DB_NAME=credlink
export AWS_ACCESS_KEY_ID=your-aws-key
export AWS_SECRET_ACCESS_KEY=your-aws-secret

# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Access UIs

- **Prometheus**: http://localhost:9090
- **Alertmanager**: http://localhost:9093
- **Grafana**: http://localhost:3001 (admin/admin)
- **Node Exporter**: http://localhost:9100/metrics

## Alert Severity Levels

### Critical
- Immediate action required
- Sent to PagerDuty and Slack
- Examples: API down, very high latency, critical disk space

### Warning
- Requires attention but not immediate
- Sent to Slack only
- Examples: High CPU, high memory, high latency

### Business
- Business metrics anomalies
- Sent to business Slack channel
- Examples: Low traffic, high 4XX rate

## Alert Runbooks

Each alert includes a `runbook_url` annotation linking to:
`https://docs.credlink.com/runbooks/{alert-name}`

Create runbooks for:
- Diagnosis steps
- Resolution procedures
- Escalation paths
- Common causes

## Metrics Endpoints

### API Metrics

The API exposes Prometheus metrics at `/metrics`:

```
# Request metrics
http_requests_total{method, path, status_code}
http_request_duration_seconds{method, path}

# System metrics
process_cpu_seconds_total
process_resident_memory_bytes
nodejs_heap_size_bytes
```

### Custom Metrics

Add custom metrics in your application:

```typescript
import { Counter, Histogram } from 'prom-client';

const signCounter = new Counter({
  name: 'c2pa_signs_total',
  help: 'Total number of C2PA signatures created'
});

const verifyDuration = new Histogram({
  name: 'c2pa_verify_duration_seconds',
  help: 'C2PA verification duration'
});
```

## Grafana Dashboards

### Import Dashboard

1. Login to Grafana
2. Go to Dashboards > Import
3. Upload `grafana/credlink-dashboard.json`
4. Select Prometheus data source

### Create Custom Dashboard

1. Add new panel
2. Select Prometheus data source
3. Write PromQL query
4. Configure visualization
5. Save dashboard

## Alert Configuration

### Slack Integration

1. Create Slack webhook: https://api.slack.com/messaging/webhooks
2. Update `alertmanager-config.yaml`:
```yaml
slack_api_url: 'https://hooks.slack.com/services/YOUR/WEBHOOK'
```

### PagerDuty Integration

1. Get PagerDuty service key
2. Update `alertmanager-config.yaml`:
```yaml
service_key: 'YOUR_PAGERDUTY_SERVICE_KEY'
```

## Troubleshooting

### Prometheus not scraping targets

Check targets status:
```bash
curl http://localhost:9090/api/v1/targets
```

Verify network connectivity:
```bash
docker exec prometheus wget -O- http://api.credlink.com/metrics
```

### Alerts not firing

Check alert rules:
```bash
curl http://localhost:9090/api/v1/rules
```

Verify Alertmanager connection:
```bash
curl http://localhost:9090/api/v1/alertmanagers
```

### Grafana not showing data

1. Check Prometheus data source configuration
2. Verify query syntax
3. Check time range
4. Verify metrics exist in Prometheus

## Maintenance

### Retention

- **Prometheus**: 30 days (configurable)
- **CloudWatch Logs**: 30 days
- **Grafana**: Unlimited

### Backup

Backup Prometheus data:
```bash
docker exec prometheus promtool tsdb snapshot /prometheus
```

Backup Grafana dashboards:
```bash
docker exec grafana grafana-cli admin export-dashboard
```

### Updates

Update monitoring stack:
```bash
docker-compose pull
docker-compose up -d
```

## Best Practices

1. **Alert Fatigue**: Tune thresholds to reduce noise
2. **Runbooks**: Maintain up-to-date runbooks for all alerts
3. **Dashboard Organization**: Group related metrics
4. **Metric Naming**: Follow Prometheus naming conventions
5. **Regular Review**: Review and update alerts quarterly

## Support

For monitoring issues:
- Check logs: `docker-compose logs [service]`
- Prometheus docs: https://prometheus.io/docs/
- Grafana docs: https://grafana.com/docs/
- Alertmanager docs: https://prometheus.io/docs/alerting/latest/alertmanager/
