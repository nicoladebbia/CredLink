# C2PA Analytics SKU v1 - Phase 13

**Production-ready SLO monitoring, dashboards, and survival reports for C2PA Trust Graph**

## 🎯 Overview

Phase 13 Analytics provides business-critical visibility into C2PA performance with:

- **SLO Monitoring**: Real-time survival rate tracking with burn-rate alerting
- **SSR Dashboards**: Server-rendered cards/tables, no SPA complexity
- **Public Reports**: Shareable survival reports matching dashboard data exactly
- **Automatic Enforcement**: Burn-rate triggers automatic fallback via Phase 6
- **Cost Projections**: Billing-tied usage analytics and forecasting

## 🏗️ Architecture

```
Events (NDJSON/R2) → Ingest (1-min batch) → ClickHouse (columnar)
                                      └─→ R2 Snapshots (CSV) for public packs
                                       
API (Fastify SSR) → /t/:tenant/analytics (cards/tables)
                 └─→ /public/:tenant/survival/:period (read-only)
                 
Alerts (cron) → Burn-rate queries → Email/Slack/webhook → Phase 6 fallback API
```

### Core Components

- **ClickHouse**: Columnar analytics database with materialized views
- **Fastify SSR**: Server-rendered dashboards with Handlebars templates
- **Alert Service**: Burn-rate monitoring with automatic enforcement
- **Report Generator**: Automated HTML/CSV report generation
- **Ingest Pipeline**: Batch processing from R2 event streams

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- ClickHouse 23.8+
- Docker & Docker Compose (for local development)

### Local Development

1. **Clone and Setup**
   ```bash
   cd apps/analytics
   cp .env.example .env
   # Edit .env with your configuration
   ```

2. **Start Services**
   ```bash
   docker-compose up -d
   ```
   
3. **Initialize Database**
   ```bash
   npm run build
   npm run schema:create
   ```

4. **Start Development Server**
   ```bash
   npm run dev
   ```

5. **Access Dashboards**
   - Analytics: http://localhost:3002/t/demo-tenant/analytics
   - Health Check: http://localhost:3002/health
   - MailHog (email testing): http://localhost:8025
   - Grafana (optional): http://localhost:3003

### Production Deployment

1. **Build Docker Image**
   ```bash
   docker build -t c2pa-analytics:latest .
   ```

2. **Configure Environment**
   ```bash
   export NODE_ENV=production
   export ALERTS_ENABLED=true
   export CLICKHOUSE_HOST=your-clickhouse-host
   # ... other production variables
   ```

3. **Deploy**
   ```bash
   docker run -d \
     --name c2pa-analytics \
     -p 3002:3002 \
     --env-file .env \
     c2pa-analytics:latest
   ```

## 📊 Metrics & SLOs

### SLO Targets

| Metric | Target | Window | Type |
|--------|--------|--------|------|
| Remote Survival | ≥ 99.9% | 30-day rolling | Hard |
| Embed Survival | ≥ 95% | 30-day rolling | Advisory |
| Verify p95 | < 600ms | 24-hour | Performance |
| Sign p95 | < 800ms (embed) / 400ms (remote) | 24-hour | Performance |
| API Uptime | ≥ 99.9% | 30-day rolling | Availability |

### Burn Rate Alerting

- **Fast Burn**: 5-minute window ≥ 10x budget → Page + Auto-fallback
- **Slow Burn**: 1-hour window ≥ 4x budget → Ticket + Notify
- **Critical Provider**: 2-minute window ≥ 50x → Emergency + Auto-fallback

## 🎛️ Dashboard Features

### SLO Status Cards
- 30-day survival metrics with target comparison
- Error budget remaining calculations
- Real-time burn-rate indicators (5m/1h)
- Current policy status with break-glass controls

### Incidents Table
- Recent incidents with automatic/manual classification
- Root cause analysis with rule triggers
- Incident linking and resolution tracking

### Latency Metrics
- Verify p50/p95/p99 percentiles
- Performance trend analysis
- Sample size validation

### Cost Projections
- Month-to-date usage by category
- End-of-month forecasting
- SKU-tier pricing integration

## 🚨 Alert System

### Alert Rules

Configuration in `src/config/alerts.yaml`:

```yaml
rules:
  - name: remote-fast-burn
    enabled: true
    thresholds:
      - window_minutes: 5
        target_survival: 0.999
        burn_rate_threshold: 10.0
    actions:
      - type: notify
        config:
          email: ["sre@tenant.com"]
          slack: ["#alerts"]
      - type: enforce_fallback
      - type: open_incident
```

### Notification Channels

- **Email**: SMTP with HTML templates
- **Slack**: Rich message attachments with actions
- **Webhooks**: Custom integrations
- **PagerDuty**: Escalation policies (optional)

### Automatic Enforcement

Alerts automatically trigger Phase 6 fallback API:
```bash
POST /api/v1/routes/{route}/force_fallback
Authorization: Bearer {service_token}
X-Incident-ID: {incident_id}
X-Reason: Burn-rate alert: {rule_name}
```

## 📈 Public Reports

### Survival Reports

Generate shareable reports matching dashboard data exactly:

```bash
# Generate report for tenant
GET /public/{tenant}/survival/2023-11?token={read-only-token}
```

### Report Features

- **Executive Summary**: Key metrics and status overview
- **Daily Matrix**: Route-by-route survival performance
- **Methodology**: Measurement approach and compliance standards
- **Verification**: Cryptographic hashes for authenticity

### Automation

Reports are automatically generated and stored to R2:
- HTML reports for web viewing
- CSV exports for data analysis
- SHA-256 hashes for tamper evidence

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CLICKHOUSE_HOST` | ClickHouse server host | localhost |
| `CLICKHOUSE_PORT` | ClickHouse HTTP port | 8123 |
| `ALERTS_ENABLED` | Enable alert monitoring | false |
| `ALERTS_CHECK_INTERVAL` | Alert check frequency (seconds) | 60 |
| `LOG_LEVEL` | Logging verbosity | info |
| `SMTP_HOST` | Email server host | localhost |
| `SLACK_BOT_TOKEN` | Slack bot token | - |

### Database Schema

Core tables with materialized views for performance:

- `deliveries`: Asset delivery decisions
- `verify_events`: API verification metrics  
- `sign_events`: TSA signing operations
- `incidents`: State changes and fallbacks
- `cost_ledger`: Billing and usage tracking

## 🧪 Testing

### Unit Tests
```bash
npm test
```

### Integration Tests
```bash
npm run test:integration
```

### Acceptance Tests
```bash
npm run test:acceptance
```

### Test Coverage
- SLO calculation accuracy
- Burn-rate alerting logic
- Dashboard rendering
- Report generation
- API endpoints

## 📝 API Reference

### Dashboard Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/t/{tenant}/analytics` | Main dashboard (SSR) |
| GET | `/t/{tenant}/analytics/export` | CSV/JSON export |
| GET | `/public/{tenant}/survival/{period}` | Public report |

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/{tenant}/slo-status` | SLO metrics (JSON) |
| GET | `/api/v1/{tenant}/burn-rate` | Burn-rate data |
| GET | `/api/v1/{tenant}/incidents` | Active incidents |
| POST | `/api/v1/{tenant}/routes/{route}/force-fallback` | Manual fallback |

### Health Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Service health check |
| GET | `/ready` | Readiness probe |

## 🚀 Performance

### SLO Targets

- **Dashboard SSR**: p95 < 300ms (cached)
- **Query Performance**: p95 < 800ms (7-day window)
- **Alert Latency**: < 60 seconds from threshold breach
- **Report Generation**: < 30 seconds for monthly reports

### Optimization Features

- **Materialized Views**: Pre-aggregated rollups
- **Query Caching**: 1-minute cache for dashboard data
- **Columnar Storage**: ClickHouse compression
- **Batch Processing**: 1-minute ingest windows

## 🔒 Security

### Authentication

- **Tenant Dashboards**: JWT-based authentication
- **Public Reports**: Read-only token validation
- **Service APIs**: Service-to-service tokens
- **Break-glass Actions**: Role-based access control

### Data Protection

- **PII Filtering**: No user-identifiable data in reports
- **Tenant Isolation**: Row-level security in queries
- **Audit Logging**: All actions logged with incident IDs
- **Rate Limiting**: API endpoint protection

## 🛠️ Operations

### Monitoring

- **Health Checks**: `/health` and `/ready` endpoints
- **Metrics**: Prometheus integration (port 9090)
- **Logging**: Structured JSON logs with correlation IDs
- **Alerting**: Built-in burn-rate monitoring

### Scaling

- **Horizontal**: Multiple analytics instances behind load balancer
- **Database**: ClickHouse clustering for high availability
- **Storage**: R2 for report archival and CDN distribution
- **Caching**: Redis for session and query caching

### Backup & Recovery

- **Database**: Daily ClickHouse snapshots to R2
- **Configuration**: Git-tracked alert rules and templates
- **Reports**: Immutable storage with versioning
- **Disaster Recovery**: Multi-region deployment options

## 📚 Documentation

### Architecture Decisions

- **ClickHouse**: Chosen for columnar analytics and time-series performance
- **SSR over SPA**: Faster load times, better SEO, simpler deployment
- **Batch Ingest**: Balances freshness with performance and cost
- **Materialized Views**: Pre-aggregates for sub-second dashboard loads

### Migration Guides

- **From Phase 12**: Security improvements maintained, analytics added
- **To Phase 14**: Edge relay integration prepared
- **Tenant Onboarding**: Automated provisioning and configuration

## 🤝 Contributing

### Development Setup

1. Fork repository
2. Create feature branch
3. Setup local environment with `docker-compose`
4. Make changes with tests
5. Submit PR with documentation

### Code Standards

- TypeScript strict mode enabled
- Prettier formatting required
- Unit test coverage > 80%
- Security review for all changes

## 📄 License

C2PA Analytics SKU v1 - Enterprise License
See LICENSE.md for full terms.

## 🆘 Support

- **Documentation**: This README and inline code comments
- **Issues**: GitHub issue tracker
- **Escalation**: enterprise support contacts
- **Community**: developer forums and discussions

---

**Phase 13 Analytics transforms raw survival events into business intelligence that drives operational excellence and customer trust.**
