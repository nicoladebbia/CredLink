# Phase 36: Self-Serve Onboarding & Billing (v1.1)

A comprehensive self-serve onboarding and billing system for C2PA audit services, featuring tenant provisioning, Stripe Billing integration, usage metering, install health monitoring, and compliance features.

## 🚀 Features

### Core Functionality
- **Tenant Provisioning**: Automated tenant creation with per-tenant API keys
- **Stripe Billing Integration**: Full billing lifecycle with trials, usage-based pricing, and smart retries
- **Onboarding Wizard**: Prescriptive 10-step onboarding with auto-validation and blocking tasks
- **Usage Metering**: Real-time usage tracking with Stripe integration
- **Install Health Monitoring**: Survival SLO monitoring with automated health checks
- **Data Export & Cancellation**: Clean tenant cancellation with comprehensive data export

### Advanced Features
- **CAI Verify Integration**: Demo asset verification and smoke testing
- **RFC-3161 Timestamping**: Compliant timestamp service integration
- **Security & Compliance**: Enterprise-grade security with audit trails
- **Real-time Monitoring**: WebSocket support for live updates
- **Comprehensive Testing**: Full acceptance test suite

## 📋 System Requirements

- Node.js 18+ 
- Redis 6+
- PostgreSQL 13+ (optional, for persistent storage)
- Stripe account with billing products configured
- CAI Verify service endpoint
- RFC-3161 Time Stamp Authority (TSA) endpoint

## 🛠️ Installation

### 1. Clone and Install Dependencies

```bash
cd apps/c2pa-audit/phase36-billing
npm install
```

### 2. Environment Configuration

Copy the example environment file and configure:

```bash
cp .env.example .env
```

### 3. Required Environment Variables

#### Core Configuration
```bash
# Server
NODE_ENV=production
PORT=3002
HOST=0.0.0.0
LOG_LEVEL=info
LOG_FORMAT=json

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0
REDIS_PASSWORD=your_redis_password
REDIS_MAX_RETRIES=3
```

#### Stripe Configuration
```bash
# Stripe Billing
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_API_VERSION=2023-10-16

# Price IDs
STRIPE_STARTER_PRICE_ID=price_...
STRIPE_PRO_PRICE_ID=price_...
STRIPE_ENTERPRISE_PRICE_ID=price_...

# Usage Meters
STRIPE_SIGN_EVENTS_METER_ID=meter_...
STRIPE_VERIFY_EVENTS_METER_ID=meter_...
STRIPE_RFC3161_TIMESTAMPS_METER_ID=meter_...

# Features
ENABLE_STRIPE_RADAR=true
ENABLE_SMART_RETRIES=true
```

#### Trial Configuration
```bash
# Trial Settings
TRIAL_DURATION_DAYS=14
TRIAL_ASSET_CAP=200
REQUIRE_CARD_UPFRONT=true
```

#### External Services
```bash
# CAI Verify
CAI_VERIFY_ENDPOINT=https://cai-verify.example.com/api

# RFC-3161 TSA
RFC3161_TSA_ENDPOINT=https://tsa.example.com/api

# Storage
EXPORT_STORAGE_PATH=/var/lib/phase36/exports
MANIFEST_HOST_BASE_URL=https://manifests.example.com
```

#### Security
```bash
# API Keys
API_KEY_SECRET=your_strong_secret_key_here

# CORS
ALLOWED_ORIGINS=https://app.example.com,https://admin.example.com
CORS_CREDENTIALS=true

# Rate Limiting
MAX_REQUESTS_PER_WINDOW=1000
RATE_LIMIT_WINDOW=60000
MAX_ASSET_SIZE=104857600
```

#### Compliance
```bash
# Data Retention
MANIFEST_RETENTION_DAYS=3650
DATA_RETENTION_DAYS=2555
USAGE_RETENTION_DAYS=365

# Email (for notifications)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=noreply@example.com
SMTP_PASS=your_smtp_password
```

### 4. Database Setup (Optional)

If using PostgreSQL for persistent storage:

```bash
# Create database
createdb phase36_billing

# Run migrations
npm run migrate
```

### 5. Start the Application

```bash
# Development
npm run dev

# Production
npm start
```

## 📊 API Documentation

### Authentication

All API requests (except public endpoints) require authentication using Bearer tokens:

```bash
Authorization: Bearer your_tenant_api_key
```

### Core Endpoints

#### Tenant Management
```bash
# Create tenant
POST /tenants
{
  "email": "user@example.com",
  "company_name": "Example Corp",
  "plan": "starter",
  "payment_method_id": "pm_stripe_payment_method",
  "domains": ["https://example.com"],
  "cms": "wordpress",
  "manifest_host": "https://manifests.example.com"
}

# Get tenant
GET /tenants/{tenantId}

# Update tenant
PUT /tenants/{tenantId}
```

#### Onboarding Wizard
```bash
# Get wizard status
GET /tenants/{tenantId}/wizard

# Execute wizard step
POST /tenants/{tenantId}/wizard/{step}
{
  // Step-specific data
}
```

#### Billing
```bash
# Get available plans
GET /billing/plans

# Create customer portal session
POST /billing/portal
{
  "return_url": "https://app.example.com/billing"
}

# Get billing summary
GET /billing/summary
```

#### Usage
```bash
# Record usage events
POST /usage
{
  "events": [
    {
      "event_type": "sign_events",
      "value": 5,
      "timestamp": "2023-12-01T10:00:00Z",
      "metadata": {
        "asset_type": "image",
        "format": "jpeg"
      }
    }
  ]
}

# Get usage statistics
GET /billing/usage?start_date=2023-12-01&end_date=2023-12-31
```

#### Install Health
```bash
# Perform health check
POST /install/check
{
  "tenant_id": "tenant_123",
  "demo_asset_url": "https://example.com/demo.jpg",
  "test_page_url": "https://example.com/test"
}
```

#### CAI Verify Integration
```bash
# Verify asset
POST /verify
{
  "url": "https://example.com/asset.jpg",
  "format": "json",
  "include_thumbnail": false,
  "include_manifest": true
}

# Perform smoke test
POST /smoke-test
{
  "asset_url": "https://example.com/asset.jpg",
  "transformations": ["resize", "compress", "crop"]
}
```

#### RFC-3161 Timestamping
```bash
# Create timestamp
POST /timestamps
{
  "tenant_id": "tenant_123",
  "asset_hash": "a1b2c3d4...",
  "content_url": "https://example.com/asset.jpg"
}

# Verify timestamp
GET /timestamps/{timestampId}/verify
```

## 🧪 Testing

### Running Tests

```bash
# Unit tests
npm test

# Integration tests
npm run test:integration

# Acceptance tests
npm run test:acceptance

# Coverage
npm run test:coverage
```

### Test Configuration

Create a test environment file:

```bash
cp .env.example .env.test
```

Configure test-specific values:
- Use Stripe test keys
- Use test Redis instance
- Mock external services

## 🔧 Configuration

### Stripe Product Setup

1. **Create Products** in Stripe Dashboard:
   - Starter Plan: $199/month
   - Pro Plan: $699/month  
   - Enterprise Plan: $2,000/month

2. **Configure Usage Meters**:
   - Sign Events: Tiered pricing
   - Verify Events: Tiered pricing
   - RFC-3161 Timestamps: $0.50 per timestamp

3. **Set Up Webhooks**:
   - Configure webhook endpoint: `{baseUrl}/webhooks/stripe`
   - Enable events: `invoice.payment_succeeded`, `customer.subscription.updated`, etc.

### Redis Configuration

```bash
# Redis configuration for production
redis-server --maxmemory 2gb --maxmemory-policy allkeys-lru
```

### Security Configuration

- Enable HTTPS in production
- Configure proper CORS origins
- Set up rate limiting
- Enable Stripe Radar for fraud detection
- Use environment variables for secrets

## 📈 Monitoring & Observability

### Health Checks

```bash
# System health
GET /health

# Redis health
GET /health/redis

# Stripe health
GET /health/stripe
```

### Metrics

The system exposes metrics for:
- Request rates and response times
- Usage events by type
- Billing events and revenue
- Error rates and types
- Health check results

### Logging

Structured JSON logging with correlation IDs:
- Request/response logging
- Error tracking with stack traces
- Business event logging
- Security event logging

## 🚀 Deployment

### Docker Deployment

```dockerfile
# Build image
docker build -t phase36-billing .

# Run container
docker run -d \
  --name phase36-billing \
  -p 3002:3002 \
  --env-file .env \
  phase36-billing
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: phase36-billing
spec:
  replicas: 3
  selector:
    matchLabels:
      app: phase36-billing
  template:
    metadata:
      labels:
        app: phase36-billing
    spec:
      containers:
      - name: phase36-billing
        image: phase36-billing:latest
        ports:
        - containerPort: 3002
        envFrom:
        - secretRef:
            name: phase36-secrets
```

## 🔒 Security Considerations

- **API Key Management**: Secure generation and storage of tenant API keys
- **Data Encryption**: Encrypt sensitive data at rest and in transit
- **Input Validation**: Comprehensive validation of all inputs
- **Rate Limiting**: Prevent abuse with configurable rate limits
- **Audit Logging**: Complete audit trail of all actions
- **PCI Compliance**: Follow PCI DSS for payment processing

## 📝 Compliance

### Data Retention
- Manifests: 10 years
- Usage data: 1 year
- Export data: 7 years
- Audit logs: 7 years

### Privacy
- GDPR-compliant data handling
- Right to export and delete
- Data minimization principles
- Secure data export functionality

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Check the documentation
- Review the test cases for usage examples

## 🔄 Version History

### v1.1.0 (Current)
- Complete self-serve onboarding flow
- Stripe Billing integration
- Usage metering and billing
- Install health monitoring
- CAI Verify integration
- RFC-3161 timestamping
- Comprehensive test suite

### Future Releases
- Multi-currency support
- Advanced analytics dashboard
- Mobile app integration
- Enhanced compliance features
