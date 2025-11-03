# Phase 36 Billing System with Observability v2

A secure, enterprise-grade self-serve onboarding and billing system for C2PA services with comprehensive observability, SLO monitoring, and OpenTelemetry instrumentation.

## 🚀 Features

- **Secure Tenant Management**: Cryptographically secure API key generation and authentication
- **Stripe Integration**: Complete billing, subscription, and usage metering
- **Usage-Based Billing**: Real-time usage tracking and reporting
- **Security Hardened**: Zero-tolerance security with comprehensive vulnerability mitigation
- **Enterprise Ready**: Production-ready with monitoring, logging, and compliance
- **Observability v2**: Complete OpenTelemetry instrumentation with SLO monitoring
- **Burn Rate Alerting**: Multi-window burn-rate alerts following Google SRE practices
- **GameDay Testing**: Automated incident simulation and MTTR validation

## 📈 Observability Features

- **OpenTelemetry**: End-to-end tracing, metrics, and logs with OTLP exporters
- **SLO Monitoring**: Service Level Objectives with error budget tracking
- **Burn Rate Alerts**: Multi-window alerting (5m@1h, 30m@6h, 2h@24h, 1d@30d)
- **Dashboards**: Grafana dashboards for survival, latency, errors, and cost
- **Distributed Tracing**: Complete request tracing with span correlation
- **Structured Logging**: JSON logs with OTel schema and tenant correlation
- **Cost Tracking**: Per-tenant cost accrual and budget monitoring
- **GameDay Scenarios**: Automated failure injection and recovery testing

## 🔐 Security Features

- **API Key Security**: SHA-256 hashed storage with timing-safe comparison
- **Rate Limiting**: Redis-backed rate limiting with fail-open behavior
- **Input Validation**: Comprehensive sanitization against XSS, SQL, and injection attacks
- **CORS Protection**: Strict origin validation and security headers
- **Webhook Security**: Stripe signature verification with timeout protection
- **Environment Validation**: Strong entropy requirements for secrets

## 📋 Prerequisites

- Node.js 18.0.0 or higher
- npm 8.0.0 or higher
- Redis 6.0 or higher
- Stripe account with API keys

## 🛠️ Installation

1. **Clone and install dependencies**
```bash
git clone <repository-url>
cd phase36-billing
npm ci
```

2. **Configure environment variables**
```bash
cp .env.example .env
# Edit .env with your secure configuration
```

3. **Set up Redis**
```bash
# Using Docker
docker run -d --name redis -p 6379:6379 redis:7-alpine --requirepass your-secure-password

# Or install locally
# Follow Redis installation guide for your platform
```

4. **Build and start**
```bash
npm run build
npm start
```

## 🔧 Configuration

### Environment Variables

**Security Configuration (Required)**
- `JWT_SECRET`: 128+ character secret with maximum entropy
- `API_KEY_SECRET`: 64+ character secret with special characters
- `REDIS_PASSWORD`: Strong Redis password with special characters

**Stripe Configuration (Required)**
- `STRIPE_SECRET_KEY`: Your Stripe secret key
- `STRIPE_WEBHOOK_SECRET`: Your webhook signing secret
- `STRIPE_STARTER_PRICE_ID`: Starter plan price ID
- `STRIPE_PRO_PRICE_ID`: Pro plan price ID
- `STRIPE_ENTERPRISE_PRICE_ID`: Enterprise plan price ID

**Database Configuration**
- `REDIS_HOST`: Redis server host
- `REDIS_PORT`: Redis server port
- `REDIS_DB`: Redis database number
- `REDIS_TLS`: Enable TLS in production

### Security Requirements

- **JWT Secret**: Minimum 128 characters with uppercase, lowercase, numbers, and special characters
- **API Key Secret**: Minimum 64 characters with uppercase, lowercase, numbers, and special characters
- **Redis Password**: Strong password with special characters
- **CORS Origins**: Restrict to specific domains in production

## 📚 API Documentation

### Authentication

All API endpoints require authentication using API keys in the `Authorization` header:

```
Authorization: Bearer c2pa_<timestamp>_<random_hex>_<entropy>
```

### Key Endpoints

#### Tenant Management
- `POST /tenants` - Create new tenant
- `GET /tenants/:tenantId` - Get tenant details
- `PUT /tenants/:tenantId` - Update tenant
- `DELETE /tenants/:tenantId` - Cancel tenant

#### Billing
- `GET /billing/plans` - Get available plans
- `GET /billing/usage-tiers/:eventType` - Get usage pricing tiers
- `POST /billing/portal` - Create customer portal session

#### Usage
- `POST /usage/report` - Report usage events
- `GET /usage/:tenantId` - Get tenant usage

#### Webhooks
- `POST /webhooks/stripe` - Stripe webhook handler

## 🧪 Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run security tests
npm run test:security

# Run specific test file
npm test -- tenant.test.ts
```

## 🚀 Deployment

### Docker Deployment

1. **Build Docker image**
```bash
docker build -t c2pa-billing:latest .
```

2. **Run with Docker Compose**
```bash
# Configure environment
cp .env.example .env
# Edit .env with production values

# Start services
docker-compose up -d

# Check health
curl http://localhost:3002/health
```

### Production Deployment

1. **Security Checklist**
   - [ ] Generate 128+ character JWT secrets with maximum entropy
   - [ ] Generate 64+ character API key secrets with special characters
   - [ ] Configure Redis with TLS and strong passwords
   - [ ] Set up SSL/TLS for all external connections
   - [ ] Configure proper CORS origins
   - [ ] Enable all security headers
   - [ ] Set up monitoring and alerting
   - [ ] Configure database with SSL

2. **Environment Setup**
```bash
# Production environment
NODE_ENV=production
LOG_LEVEL=info
LOG_FORMAT=json

# Security
JWT_SECRET=your-128-char-secret-with-maximum-entropy
API_KEY_SECRET=your-64-char-secret-with-special-chars
REDIS_PASSWORD=your-strong-redis-password
REDIS_TLS=true

# CORS
ALLOWED_ORIGINS=https://app.c2pa.org,https://admin.c2pa.org
```

## 📊 Monitoring

### Health Check

```bash
curl http://localhost:3002/health
```

Response:
```json
{
  "status": "healthy",
  "checks": {
    "database": true,
    "redis": true,
    "stripe": true,
    "storage": true
  },
  "timestamp": "2023-12-07T10:30:00.000Z",
  "version": "1.1.0"
}
```

### Metrics

- **Rate Limiting**: Monitor `X-RateLimit-*` headers
- **Response Times**: Track API response performance
- **Error Rates**: Monitor 4xx/5xx response rates
- **Usage Metrics**: Track tenant usage and billing events

## 🔒 Security Auditing

### Automated Security Testing

```bash
# Run security audit
npm run security:audit

# Check for outdated dependencies
npm run security:check

# Run linting with security rules
npm run lint
```

### Security Headers

All responses include comprehensive security headers:
- `Content-Security-Policy`: Strict CSP directives
- `X-Frame-Options`: DENY
- `X-Content-Type-Options`: nosniff
- `Referrer-Policy`: strict-origin-when-cross-origin
- `Permissions-Policy`: Restricted API access

## 🛠️ Development

### Scripts

```bash
# Development
npm run dev          # Start development server
npm run build        # Build for production
npm start           # Start production server

# Code Quality
npm run lint        # Run ESLint
npm run lint:fix    # Fix ESLint issues
npm run format      # Format code with Prettier

# Testing
npm test            # Run tests
npm run test:coverage  # Run with coverage
npm run test:security   # Run security tests
```

### Project Structure

```
src/
├── config/         # Configuration and environment validation
├── controllers/    # HTTP request handlers
├── middleware/     # Authentication, validation, security
├── services/       # Business logic and external integrations
├── types/          # TypeScript type definitions
├── utils/          # Utility functions
└── index.ts        # Application entry point
```

## 📝 License

MIT License - see LICENSE file for details.

## 🆘 Support

- **Issues**: [GitHub Issues](https://github.com/c2pa/concierge/issues)
- **Security**: Report security issues to security@c2pa.org
- **Documentation**: [C2PA Documentation](https://docs.c2pa.org)

## 🔄 Version History

### v1.1.0 (Current)
- Complete security hardening
- Enhanced API key generation and validation
- Redis-backed rate limiting
- Comprehensive input sanitization
- Production-ready deployment configurations

### v1.0.0
- Initial release
- Basic tenant management
- Stripe integration
- Usage metering
