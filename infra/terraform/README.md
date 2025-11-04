# Terraform Infrastructure Blueprints
# Phase 45 - Terraform & Infra Blueprints (v1.2)

## Overview

This repository contains Terraform infrastructure blueprints for the C2 Concierge platform, providing reproducible, one-command environments with sane defaults and guardrails.

## Architecture

### Environment Structure
```
envs/
├── demo/          # Demo environment (short-lived, public)
├── staging/       # Staging environment (integration testing)
└── prod/          # Production environment (high security, compliance)

modules/
├── storage/       # R2 or S3 with versioning, Object Lock
├── worker_relay/  # Cloudflare Worker + routes + assets
├── queues/        # Cloudflare Queues for async jobs
├── monitors/      # Uptime checks, alerts
├── iam/           # Roles, scoped tokens
├── otel/          # OpenTelemetry Collector (Helm module)
└── cost/          # Cost allocation tags and monitoring
```

## Features

### 🔒 Security Hardening
- **Path Traversal Protection**: All storage buckets enforce no public writes
- **Object Lock**: S3 buckets support governance/compliance mode for delete protection
- **IAM Scoping**: Least-privilege tokens for each component
- **Policy as Code**: Sentinel/OPA policies block unsafe configurations

### 🌐 Multi-Cloud Support
- **Cloudflare R2**: Primary storage (no egress fees, S3-compatible)
- **AWS S3**: Alternative with Object Lock and KMS encryption
- **Cloudflare Workers**: Global edge compute with static assets
- **Cloudflare Queues**: Asynchronous job processing

### 📊 Observability
- **Health Checks**: HTTP/TCP monitoring with alerting
- **OpenTelemetry**: Centralized telemetry collection
- **Cost Tracking**: Environment-specific cost allocation
- **Dashboards**: Real-time monitoring and cost visualization

### 🚀 CI/CD Integration
- **Automated Workflows**: GitHub Actions for validation, planning, and deployment
- **Drift Detection**: Nightly scans catch out-of-band changes
- **Security Scanning**: Trivy and TFSec integration
- **Smoke Tests**: Post-deployment validation

## Quick Start

### Prerequisites
- Terraform >= 1.9
- Cloudflare API token
- AWS credentials (for S3 alternative)
- kubectl (for OpenTelemetry Collector)

### Environment Setup

1. **Clone and Initialize**
   ```bash
   git clone <repository>
   cd infra/terraform
   make init ENV=demo
   ```

2. **Configure Variables**
   ```bash
   cp envs/demo/terraform.tfvars.example envs/demo/terraform.tfvars
   # Edit with your credentials
   ```

3. **Deploy Environment**
   ```bash
   make demo
   ```

4. **Run Smoke Tests**
   ```bash
   make test ENV=demo
   ```

## Environment Management

### Demo Environment
- **Purpose**: Development and testing
- **Features**: Basic R2 storage, single Worker, minimal monitoring
- **Deployment**: `make demo`

### Staging Environment
- **Purpose**: Integration testing and UAT
- **Features**: Full stack with OpenTelemetry, comprehensive monitoring
- **Deployment**: `make staging`

### Production Environment
- **Purpose**: Production workloads
- **Features**: High availability, compliance mode Object Lock, full observability
- **Deployment**: `make prod`

## Module Documentation

### Storage Module
Supports both Cloudflare R2 and AWS S3 with:
- Versioning enabled
- Object Lock (delete protection)
- KMS encryption (S3)
- CORS configuration
- Lifecycle policies

```hcl
module "storage" {
  source = "../../modules/storage"
  
  use_r2 = true
  r2 = {
    bucket_name = "my-manifests"
    account_id  = var.cloudflare_account_id
  }
  
  tags = local.tags
  destroy_protect = true
}
```

### Worker Relay Module
Cloudflare Workers with:
- Script deployment and versioning
- Route configuration
- Static asset upload (v5.11+)
- Storage integration
- Health endpoints

```hcl
module "worker_relay" {
  source = "../../modules/worker_relay"
  
  zone_id     = var.cloudflare_zone_id
  script_name = "my-relay"
  routes      = ["example.com/api/*"]
  
  storage_bucket_name = module.storage.bucket_name
  tags = local.tags
}
```

### Queues Module
Cloudflare Queues for async processing:
- Message retention configuration
- Dead letter queues
- Worker bindings
- Access policies

```hcl
module "queues" {
  source = "../../modules/queues"
  
  queues = {
    "verify-queue" = {
      message_retention_seconds = 345600
      dead_letter_queue_enabled = true
    }
  }
  
  worker_script_name = module.worker_relay.script_name
  tags = local.tags
}
```

### Monitors Module
Health checks and alerting:
- HTTP endpoint monitoring
- TCP connectivity checks
- Synthetic transactions
- Multi-channel notifications

```hcl
module "monitors" {
  source = "../../modules/monitors"
  
  health_checks = ["https://example.com/health"]
  alert_channels = {
    "email" = {
      type = "email"
      target = "alerts@example.com"
    }
  }
  
  tags = local.tags
}
```

## CI/CD Pipeline

### Workflow Triggers
- **Push to main/develop**: Full deployment pipeline
- **Pull Requests**: Plan and validation only
- **Schedule**: Nightly drift detection
- **Manual**: On-demand deployments

### Pipeline Stages
1. **Validation**: Format, lint, and security scanning
2. **Planning**: Generate execution plans with cost estimation
3. **Deployment**: Apply changes with manual approval for prod
4. **Testing**: Run smoke tests and generate outputs
5. **Cleanup**: Remove old artifacts and temporary files

### Drift Detection
```bash
# Manual drift detection
make drift-detect ENV=staging

# Automated (runs nightly)
# Creates GitHub issues if drift detected
```

## Security Policies

### Sentinel Policies
- Deny public S3/R2 buckets
- Require KMS encryption for S3
- Enforce Object Lock for production
- Block force_destroy on protected resources

### OPA Policies
- Validate tagging compliance
- Ensure least-privilege IAM
- Enforce cost allocation tags
- Require monitoring configuration

## Cost Management

### Cost Allocation
All resources tagged with:
- `env`: Environment name
- `owner`: Resource owner
- `cost_center`: Cost center code
- `system`: Project identifier

### Budget Monitoring
- AWS Budgets for S3 costs
- Cloudflare cost tracking
- Real-time alerts for thresholds
- Monthly cost reports

### Usage Reports
```bash
# Generate cost report
make cost-estimate ENV=staging

# View cost dashboard
# URL: https://dash.cloudflare.com/{account}/analytics/dashboards/{id}
```

## Monitoring and Observability

### Health Checks
- Worker health endpoints
- Storage connectivity
- Queue processing
- API response times

### OpenTelemetry
- Metrics collection
- Distributed tracing
- Log aggregation
- Custom dashboards

### Alerting
- Email notifications
- Slack webhooks
- PagerDuty integration
- Custom webhook endpoints

## Disaster Recovery

### Backup Strategy
- Terraform state versioning
- Configuration backups
- Automated snapshot policies
- Cross-region replication

### Recovery Procedures
```bash
# Restore from backup
make restore ENV=prod

# Force unlock state (emergency)
make force-unlock ENV=prod
```

## Troubleshooting

### Common Issues
1. **Provider Authentication**
   ```bash
   # Check Cloudflare token
   cloudflare api token list
   
   # Verify AWS credentials
   aws sts get-caller-identity
   ```

2. **State Lock Issues**
   ```bash
   # Force unlock (emergency only)
   make force-unlock ENV=staging
   ```

3. **Drift Resolution**
   ```bash
   # Detect drift
   make drift-detect ENV=staging
   
   # Apply drift fixes
   make apply ENV=staging
   ```

### Debug Mode
```bash
# Enable verbose logging
export TF_LOG=DEBUG
export TF_LOG_PATH=terraform.log

# Run with debug output
make plan ENV=staging
```

## Contributing

### Development Workflow
1. Create feature branch
2. Make changes to modules/environments
3. Run `make validate` and `make test`
4. Submit pull request
5. CI runs validation and planning
6. Merge triggers deployment

### Module Standards
- All modules must have `main.tf`, `variables.tf`, `outputs.tf`
- Include comprehensive examples
- Add security and cost controls
- Document all inputs and outputs

### Testing
```bash
# Run all tests
make test ENV=demo

# Security scan
make security-scan

# Cost estimation
make cost-estimate ENV=demo
```

## Support

### Documentation
- [Terraform Registry](https://registry.terraform.io/)
- [Cloudflare Provider Docs](https://registry.terraform.io/providers/cloudflare/cloudflare/latest/docs)
- [AWS Provider Docs](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)

### Community
- GitHub Issues for bug reports
- Discussions for questions
- Wiki for detailed guides

### Escalation
- Critical: PagerDuty alerts
- High: Slack #infrastructure
- Normal: GitHub Issues

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Version History

### v1.2 (Current)
- Added OpenTelemetry Collector module
- Enhanced security policies
- Improved cost tracking
- Added comprehensive CI/CD

### v1.1
- Added drift detection
- Enhanced monitoring
- Improved error handling

### v1.0
- Initial release
- Core modules implemented
- Basic CI/CD pipeline
