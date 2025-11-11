# CredLink Infrastructure

Infrastructure as Code for CredLink production deployment.

## Overview

This directory contains all infrastructure configuration for deploying CredLink to AWS:

- **ECS**: Container orchestration with Fargate
- **ALB**: Application Load Balancer for traffic distribution
- **Terraform**: Infrastructure as Code
- **CloudWatch**: Monitoring and logging

## Directory Structure

```
infra/
├── ecs/                    # ECS task definitions
├── alb/                    # Application Load Balancer CloudFormation
├── terraform/              # Terraform configurations
│   ├── ecs-service.tf     # ECS cluster and service
│   ├── iam.tf             # IAM roles and policies
│   ├── ecs-variables.tf   # Variables
│   └── ecs-outputs.tf     # Outputs
├── scripts/                # Deployment scripts
│   └── deploy-ecs.sh      # ECS deployment script
└── README.md              # This file
```

## Prerequisites

- AWS CLI configured
- Docker installed
- Terraform installed (for IaC)
- Appropriate AWS permissions

## Deployment

### Using Deployment Script

```bash
cd infra/scripts
./deploy-ecs.sh production
```

### Using Terraform

```bash
cd infra/terraform
terraform init
terraform plan
terraform apply
```

### Manual Deployment

1. **Build and push Docker image:**
```bash
cd apps/api-gw
docker build -t credlink-api .
docker tag credlink-api:latest ACCOUNT.dkr.ecr.REGION.amazonaws.com/credlink-api:latest
docker push ACCOUNT.dkr.ecr.REGION.amazonaws.com/credlink-api:latest
```

2. **Deploy CloudFormation stack:**
```bash
aws cloudformation deploy \
  --template-file infra/alb/credlink-alb.yaml \
  --stack-name credlink-alb-prod \
  --parameter-overrides \
    VpcId=vpc-xxx \
    PublicSubnet1=subnet-xxx \
    PublicSubnet2=subnet-xxx \
    PublicSubnet3=subnet-xxx \
    CertificateArn=arn:aws:acm:xxx
```

3. **Register task definition:**
```bash
aws ecs register-task-definition \
  --cli-input-json file://infra/ecs/credlink-api-task-definition.json
```

4. **Create/Update ECS service:**
```bash
aws ecs update-service \
  --cluster credlink-prod \
  --service credlink-api \
  --task-definition credlink-api \
  --force-new-deployment
```

## Configuration

### Environment Variables

Set in ECS task definition or Secrets Manager:

- `NODE_ENV`: Environment (production)
- `JWT_SECRET`: JWT signing secret
- `DB_PASSWORD`: Database password
- `REDIS_PASSWORD`: Redis password
- `AWS_REGION`: AWS region

### Secrets Manager

Store sensitive values in AWS Secrets Manager:

```bash
aws secretsmanager create-secret \
  --name credlink/jwt-secret \
  --secret-string "your-secret-here"
```

## Monitoring

### CloudWatch Logs

Logs are sent to CloudWatch Logs:
- Log Group: `/ecs/credlink-api`
- Retention: 30 days

### Metrics

Key metrics to monitor:
- CPU utilization
- Memory utilization
- Request count
- Error rate
- Response time

## Auto Scaling

The ECS service auto-scales based on:
- CPU utilization (target: 70%)
- Memory utilization (target: 80%)
- Min tasks: 3
- Max tasks: 10

## Health Checks

- **ALB Health Check**: `/health` endpoint
- **Container Health Check**: Curl to localhost:3000/health
- Interval: 30 seconds
- Timeout: 5 seconds
- Healthy threshold: 2
- Unhealthy threshold: 3

## Rollback

To rollback to previous version:

```bash
aws ecs update-service \
  --cluster credlink-prod \
  --service credlink-api \
  --task-definition credlink-api:PREVIOUS_REVISION
```

## Troubleshooting

### View logs
```bash
aws logs tail /ecs/credlink-api --follow
```

### Check service status
```bash
aws ecs describe-services \
  --cluster credlink-prod \
  --services credlink-api
```

### Execute command in container
```bash
aws ecs execute-command \
  --cluster credlink-prod \
  --task TASK_ID \
  --container credlink-api \
  --interactive \
  --command "/bin/sh"
```

## Security

- All traffic encrypted with TLS 1.2+
- Secrets stored in AWS Secrets Manager
- IAM roles follow least privilege principle
- Security groups restrict traffic
- Container runs as non-root user

## Cost Optimization

- Fargate Spot for non-critical workloads
- Auto-scaling to match demand
- CloudWatch Logs retention policy
- Reserved capacity for baseline load

## Support

For issues or questions, contact the DevOps team.
