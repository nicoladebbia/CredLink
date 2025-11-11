#!/bin/bash

# CredLink ECS Deployment Script
# Usage: ./deploy-ecs.sh [environment]

set -e

ENVIRONMENT=${1:-production}
AWS_REGION=${AWS_REGION:-us-east-1}
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_REPOSITORY="credlink-api"
IMAGE_TAG=${IMAGE_TAG:-latest}

echo "🚀 Deploying CredLink API to ECS"
echo "Environment: $ENVIRONMENT"
echo "Region: $AWS_REGION"
echo "Account: $AWS_ACCOUNT_ID"

# Build Docker image
echo "📦 Building Docker image..."
cd ../../apps/api-gw
docker build -t $ECR_REPOSITORY:$IMAGE_TAG .

# Login to ECR
echo "🔐 Logging in to ECR..."
aws ecr get-login-password --region $AWS_REGION | \
  docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

# Tag image
echo "🏷️  Tagging image..."
docker tag $ECR_REPOSITORY:$IMAGE_TAG \
  $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPOSITORY:$IMAGE_TAG

# Push to ECR
echo "⬆️  Pushing image to ECR..."
docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPOSITORY:$IMAGE_TAG

# Register task definition
echo "📝 Registering task definition..."
cd ../../infra/ecs
TASK_DEFINITION=$(cat credlink-api-task-definition.json | \
  sed "s/ACCOUNT_ID/$AWS_ACCOUNT_ID/g" | \
  sed "s/REGION/$AWS_REGION/g")

TASK_DEF_ARN=$(aws ecs register-task-definition \
  --cli-input-json "$TASK_DEFINITION" \
  --region $AWS_REGION \
  --query 'taskDefinition.taskDefinitionArn' \
  --output text)

echo "Task Definition ARN: $TASK_DEF_ARN"

# Update ECS service
echo "🔄 Updating ECS service..."
aws ecs update-service \
  --cluster credlink-prod \
  --service credlink-api \
  --task-definition $TASK_DEF_ARN \
  --force-new-deployment \
  --region $AWS_REGION

# Wait for deployment to complete
echo "⏳ Waiting for deployment to complete..."
aws ecs wait services-stable \
  --cluster credlink-prod \
  --services credlink-api \
  --region $AWS_REGION

echo "✅ Deployment complete!"

# Get service status
echo "📊 Service status:"
aws ecs describe-services \
  --cluster credlink-prod \
  --services credlink-api \
  --region $AWS_REGION \
  --query 'services[0].{Status:status,Running:runningCount,Desired:desiredCount}' \
  --output table
