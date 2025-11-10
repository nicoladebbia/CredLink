# C2-Concierge: Enterprise Key Custody System

## Overview

C2-Concierge is a comprehensive enterprise-grade key custody and management system designed for the retro-sign architecture. It provides secure key lifecycle management, automated rotation, incident response, and compliance reporting across multiple backend providers (HSM, KMS, Software).

## Features

### 🔐 Multi-Backend Key Management
- **HSM Integration**: YubiHSM2, Cloud HSM, and custom HSM backends
- **Cloud KMS Support**: AWS KMS, Google Cloud KMS, Azure Key Vault
- **Software Keys**: Secure software-based key generation and management
- **Backend Failover**: Automatic failover between key providers

### 🔄 Automated Key Rotation
- **Scheduled Rotations**: Calendar-based rotation scheduling
- **Zero-Downtime Rotation**: Seamless key transitions with canary testing
- **Rotation Evidence Packs**: Complete audit trails for compliance
- **Rollback Capabilities**: Automatic rollback on rotation failures

### 🚨 Incident Response Automation
- **Real-time Detection**: Automated incident detection and classification
- **Emergency Procedures**: One-click emergency key rotation
- **Mass Re-signing**: Automated bulk re-signing workflows
- **Compliance Reporting**: Automated incident compliance reports

### 🛡️ Enterprise Security
- **Zero-Trust Architecture**: Comprehensive security controls
- **Advanced Threat Detection**: ML-powered behavioral analysis
- **Encryption at Rest/Transit**: AES-256 encryption with perfect forward secrecy
- **Audit Logging**: Complete audit trails with tamper-evident logging

### 📊 Monitoring & Observability
- **Real-time Metrics**: Prometheus-based monitoring
- **Performance Analytics**: Advanced performance profiling and optimization
- **Health Checks**: Comprehensive system health monitoring
- **Alert Management**: Multi-channel alert escalation

## Architecture

### System Components

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Keyctl API    │    │  Rotation Engine│    │ Incident Engine │
│                 │    │                 │    │                 │
│ • Policy Mgmt   │    │ • Scheduling    │    │ • Detection     │
│ • Auth/Authz    │    │ • Execution     │    │ • Response      │
│ • Validation    │    │ • Rollback      │    │ • Reporting     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   HSM Backend   │    │   KMS Backend   │    │ Software Backend│
│                 │    │                 │    │                 │
│ • YubiHSM2      │    │ • AWS KMS       │    │ • Key Generation│
│ • Cloud HSM     │    │ • GCP KMS       │    │ • Local Storage │
│ • Custom HSM    │    │ • Azure Key Vault│    │ • Encryption    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Data Flow

1. **Policy Creation**: Administrators define signing policies and key configurations
2. **Key Provisioning**: Keys are generated/provisioned according to backend selection
3. **Rotation Scheduling**: Automated rotation based on calendar or risk-based triggers
4. **Incident Detection**: Continuous monitoring for security events and anomalies
5. **Response Execution**: Automated incident response with human oversight

## Quick Start

### Prerequisites

- Rust 1.70+
- Docker & Docker Compose
- PostgreSQL 14+
- Redis 6+
- Kubernetes (for production deployment)

### Installation

1. **Clone the Repository**
   ```bash
   git clone https://github.com/your-org/CredLink.git
   cd CredLink
   ```

2. **Build the Application**
   ```bash
   cargo build --release
   ```

3. **Setup Environment**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Initialize Database**
   ```bash
   cargo run --bin keyctl -- migrate
   ```

5. **Start Services**
   ```bash
   docker-compose up -d
   cargo run --bin keyctl -- start
   ```

### Basic Usage

#### Create a Signing Policy
```bash
keyctl policy create \
  --tenant-id "example-tenant" \
  --algorithm "ES256" \
  --key-type "hsm" \
  --provider "yubihsm2" \
  --rotation-days 30
```

#### Schedule Key Rotation
```bash
keyctl rotation schedule \
  --tenant-id "example-tenant" \
  --scheduled-time "2024-01-15T00:00:00Z" \
  --owner "admin@example.com"
```

#### Monitor System Health
```bash
keyctl monitor status
keyctl monitor health
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | - |
| `REDIS_URL` | Redis connection string | - |
| `VAULT_ADDR` | Vault server address | - |
| `VAULT_TOKEN` | Vault authentication token | - |
| `LOG_LEVEL` | Logging level | `info` |
| `METRICS_ENABLED` | Enable metrics collection | `true` |
| `THREAT_DETECTION_ENABLED` | Enable threat detection | `true` |

### Policy Configuration

```toml
[database]
url = "postgresql://user:pass@localhost/keyctl"
max_connections = 20
connection_timeout = 30

[security]
require_https = true
session_timeout = 3600
max_login_attempts = 5

[rotation]
default_interval_days = 30
advance_warning_days = 7
canary_count = 100

[monitoring]
metrics_enabled = true
health_check_interval = 30
alert_webhook = "https://hooks.slack.com/..."
```

## Security

### Authentication & Authorization

- **Multi-Factor Authentication**: Required for administrative operations
- **Role-Based Access Control**: Granular permissions by tenant and role
- **API Key Management**: Secure API key generation and rotation
- **Session Management**: Secure session handling with timeout controls

### Encryption

- **Data at Rest**: AES-256-GCM encryption for all sensitive data
- **Data in Transit**: TLS 1.3 with perfect forward secrecy
- **Key Encryption**: Master key encryption using HSM or KMS
- **Certificate Management**: Automated certificate provisioning and rotation

### Threat Detection

- **Behavioral Analysis**: ML-powered user behavior monitoring
- **Anomaly Detection**: Statistical analysis for unusual patterns
- **Threat Intelligence**: Integration with threat intelligence feeds
- **Automated Response**: Automatic containment and remediation

## Monitoring

### Metrics

The system exposes comprehensive metrics via Prometheus:

- **Application Metrics**: Request rates, error rates, response times
- **Business Metrics**: Key rotations, incidents, compliance scores
- **Infrastructure Metrics**: CPU, memory, disk, network usage
- **Security Metrics**: Authentication attempts, threat detections

### Dashboards

Pre-built Grafana dashboards include:

- **System Overview**: High-level system health and performance
- **Security Operations**: Security events and incident response
- **Compliance Dashboard**: Regulatory compliance status
- **Performance Analytics**: Detailed performance analysis

### Alerting

Configurable alerts for:

- **System Health**: Service availability and performance
- **Security Events**: Failed authentication, threat detections
- **Compliance Issues**: Policy violations, audit failures
- **Business Metrics**: Key rotation failures, SLA breaches

## Deployment

### Development

```bash
# Local development setup
cargo run --bin keyctl -- dev

# Run tests
cargo test --all

# Run benchmarks
cargo bench
```

### Production (Docker Compose)

```bash
# Deploy with Docker Compose
docker-compose -f docker-compose.prod.yml up -d

# Scale services
docker-compose -f docker-compose.prod.yml up -d --scale keyctl=3
```

### Production (Kubernetes)

```bash
# Deploy to Kubernetes
kubectl apply -f deploy/k8s/

# Monitor deployment
kubectl get pods -n CredLink
kubectl logs -f deployment/keyctl -n CredLink
```

## API Reference

### REST API

#### Authentication
```http
POST /api/v1/auth/login
POST /api/v1/auth/logout
POST /api/v1/auth/refresh
```

#### Policy Management
```http
GET /api/v1/policies
POST /api/v1/policies
GET /api/v1/policies/{tenant_id}
PUT /api/v1/policies/{tenant_id}
DELETE /api/v1/policies/{tenant_id}
```

#### Rotation Management
```http
GET /api/v1/rotations
POST /api/v1/rotations/schedule
POST /api/v1/rotations/{rotation_id}/execute
GET /api/v1/rotations/{rotation_id}/status
```

#### Incident Management
```http
GET /api/v1/incidents
POST /api/v1/incidents
POST /api/v1/incidents/{incident_id}/resolve
GET /api/v1/incidents/{incident_id}/timeline
```

### CLI Reference

#### Policy Commands
```bash
keyctl policy create [options]
keyctl policy list [options]
keyctl policy get <tenant-id>
keyctl policy update <tenant-id> [options]
keyctl policy delete <tenant-id>
```

#### Rotation Commands
```bash
keyctl rotation schedule [options]
keyctl rotation list [options]
keyctl rotation execute <rotation-id>
keyctl rotation status <rotation-id>
keyctl rotation rollback <rotation-id>
```

#### Incident Commands
```bash
keyctl incident create [options]
keyctl incident list [options]
keyctl incident resolve <incident-id>
keyctl incident monitor start
keyctl incident metrics
```

## Compliance

### Supported Standards

- **SOC 2 Type II**: Security and availability controls
- **ISO 27001**: Information security management
- **PCI DSS**: Payment card industry security standards
- **GDPR**: Data protection and privacy compliance
- **HIPAA**: Healthcare information protection

### Compliance Features

- **Audit Logging**: Complete, tamper-evident audit trails
- **Data Retention**: Configurable data retention policies
- **Access Controls**: Granular access control with audit trails
- **Encryption**: End-to-end encryption for all data
- **Incident Response**: Documented incident response procedures

### Reporting

- **Compliance Reports**: Automated compliance status reports
- **Audit Reports**: Detailed audit trail reports
- **Security Reports**: Security posture and vulnerability reports
- **Performance Reports**: SLA and performance metrics

## Troubleshooting

### Common Issues

#### Database Connection Errors
```bash
# Check database connectivity
psql $DATABASE_URL -c "SELECT 1"

# Check connection pool status
keyctl monitor db-pool
```

#### HSM Connection Issues
```bash
# Test HSM connectivity
keyctl hsm test --provider yubihsm2

# Check HSM status
keyctl hsm status --provider yubihsm2
```

#### Performance Issues
```bash
# Check system metrics
keyctl monitor metrics

# Profile performance
cargo run --bin keyctl -- profile
```

### Debug Mode

Enable debug logging for troubleshooting:

```bash
RUST_LOG=debug keyctl start
```

### Health Checks

```bash
# Check overall health
keyctl health check

# Check specific components
keyctl health check --component database
keyctl health check --component hsm
keyctl health check --component redis
```

## Contributing

### Development Setup

1. **Fork the Repository**
2. **Create Feature Branch**
   ```bash
   git checkout -b feature/new-feature
   ```
3. **Make Changes**
4. **Run Tests**
   ```bash
   cargo test --all
   cargo fmt --check
   cargo clippy -- -D warnings
   ```
5. **Submit Pull Request**

### Code Standards

- **Rust Standards**: Follow official Rust guidelines
- **Testing**: Minimum 80% code coverage required
- **Documentation**: All public APIs must be documented
- **Security**: Security review required for all changes

### Security Reporting

For security issues, please email: security@yourorg.com

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

- **Documentation**: [docs.CredLink.com](https://docs.CredLink.com)
- **Community**: [GitHub Discussions](https://github.com/your-org/CredLink/discussions)
- **Issues**: [GitHub Issues](https://github.com/your-org/CredLink/issues)
- **Email**: support@yourorg.com

## Changelog

### Version 1.0.0 (2024-01-15)

#### Features
- Multi-backend key management (HSM, KMS, Software)
- Automated key rotation with rollback
- Incident response automation
- Enterprise security controls
- Comprehensive monitoring and alerting

#### Security
- Zero-trust architecture
- Advanced threat detection
- End-to-end encryption
- Complete audit trails

#### Performance
- Sub-100ms response times
- Horizontal scaling support
- Optimized database queries
- Efficient caching strategies

---

*C2-Concierge: Enterprise Key Custody for the Modern Enterprise*
