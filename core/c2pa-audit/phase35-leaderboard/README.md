# Phase 35 Public Survival Leaderboard

A neutral, reproducible ranking system for CDNs/CMS/themes on how well they preserve C2PA Content Credentials in realistic "out-of-the-box" settings.

## Overview

The Phase 35 Leaderboard turns evidence into demand by:
1. **Exposing who strips vs preserves** C2PA Content Credentials
2. Providing **15-minute "get-to-green" playbooks** per stack
3. Hosting **raw runs + verifiable proofs** for reproduction

## Features

- 🎯 **Neutral Testing**: Public methodology with verifiable results
- 📊 **Comprehensive Scoring**: 100-point scale across 5 dimensions
- 🚀 **Quick Fix Guides**: 15-minute playbooks to achieve green status
- 🔍 **Full Transparency**: Raw NDJSON results, command logs, and verifier outputs
- 🔄 **Vendor Corrections**: Right-to-reply path with public retesting
- 📈 **Trend Tracking**: Historical performance monitoring

## Architecture

```
phase35-leaderboard/
├── src/
│   ├── core/                 # Core testing and scoring engines
│   │   ├── testing-engine.ts # Vendor test execution
│   │   ├── scoring-engine.ts # Score calculation logic
│   │   └── playbook-generator.ts # Fix generation
│   ├── web/                  # HTTP API and static site
│   │   └── server.ts         # Fastify web server
│   ├── utils/                # Security and validation
│   │   └── security.ts       # Input validation and sanitization
│   ├── config/               # Configuration data
│   │   ├── vendors.ts        # Vendor definitions
│   │   ├── test-assets.ts    # Test image assets
│   │   └── scoring.ts        # Scoring rubric
│   └── types/                # TypeScript definitions
│       └── index.ts          # Core type definitions
├── public/                   # Static web assets
├── docs/                     # Documentation
├── tests/                    # Test suites
└── scripts/                  # Utility scripts
```

## Quick Start

### Prerequisites

- Node.js 18+
- Redis 6+
- c2patool (C2PA verification tool)
- Git

### Installation

```bash
# Clone the repository
git clone https://github.com/Nickiller04/CredLink.git
cd CredLink/apps/c2pa-audit/phase35-leaderboard

# Install dependencies
npm install

# Copy environment configuration
cp .env.example .env

# Edit .env with your settings
nano .env
```

### Development

```bash
# Start development server
npm run dev

# Run tests
npm run test

# Run security audit
npm run test:security

# Build for production
npm run build
```

### Production Deployment

```bash
# Build production package
./build.sh

# Deploy package to production
npm run start
```

## Configuration

### Environment Variables

Key environment variables:

```bash
# Server
HOST=0.0.0.0
PORT=3001
NODE_ENV=production

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0

# Testing
C2PATOOL_PATH=c2patool
VERIFY_TOOL_PATH=cai-verify
OUTPUT_DIR=./artifacts

# Security
ENABLE_SECURITY_HEADERS=true
RATE_LIMIT_WINDOW=3600000
MAX_REQUESTS=1000
```

### Vendor Configuration

Vendors are configured in `src/config/vendors.ts` with:

- **Endpoints**: API endpoints for testing
- **Transforms**: Image transformations to test
- **Preserve Toggles**: Vendor-specific C2PA preservation settings
- **Rate Limits**: API rate limiting configuration

### Test Assets

24 public demo images are configured in `src/config/test-assets.ts`:

- 6 JPEG, 6 PNG, 6 WebP, 6 AVIF files
- Mix of embedded and remote manifest configurations
- Deterministic C2PA signing with verification hashes

## Scoring System

### Dimensions (100 points total)

| Dimension | Points | Weight | Description |
|-----------|--------|--------|-------------|
| Embedded Manifest Survival | 35 | 35% | JUMBF survives 12 transformations |
| Remote Manifest Honored | 25 | 25% | Link header preservation |
| Discovery Reliability | 15 | 15% | 95th percentile latency |
| Documentation Alignment | 15 | 15% | Matches vendor docs |
| Reproducibility | 10 | 10% | Public tool verification |

### Grades

- 🟢 **Green**: ≥90 points
- 🟡 **Yellow**: 75-89 points  
- 🔴 **Red**: <75 points

### Tie-Breakers

1. Configuration complexity (smaller changes win)
2. Documentation clarity
3. Performance impact
4. Ecosystem adoption

## API Documentation

### Leaderboard Endpoints

```bash
# Get latest leaderboard
GET /api/leaderboard

# Get vendor details
GET /api/vendor/{vendorId}

# Get vendor scores breakdown
GET /api/vendor/{vendorId}/scores

# Get leaderboard history
GET /api/leaderboard/history

# Get specific run results
GET /api/leaderboard/run/{runId}
```

### Playbook Endpoints

```bash
# Get vendor playbook
GET /api/playbooks/{vendorId}?targetScore=90

# List all playbooks
GET /api/playbooks
```

### Data Endpoints

```bash
# Get available downloads
GET /api/data

# Download artifact
GET /data/{filename}
```

### Correction Endpoints

```bash
# Submit correction
POST /api/corrections

# Get correction status
GET /api/corrections/{correctionId}
```

## Testing

### Running Tests

```bash
# Run all tests
npm run test

# Run with coverage
npm run test:coverage

# Run security tests
npm run test:security

# Run performance tests
npm run test:performance

# Run integration tests
npm run test:integration
```

### Test Structure

- **Unit Tests**: Core logic and utilities
- **Integration Tests**: API endpoints and workflows
- **Security Tests**: Input validation and sanitization
- **Performance Tests**: Load and timing benchmarks
- **Acceptance Tests**: Full workflow validation

## Vendor Support

### Currently Tested

#### CDN/Optimizers
- Cloudflare Images
- Fastly Image Optimizer  
- Akamai Image and Video Manager
- Cloudinary
- Imgix

#### CMS Platforms
- WordPress Core
- Shopify Core

### Adding New Vendors

1. Add vendor definition to `src/config/vendors.ts`
2. Configure test endpoints and transforms
3. Add preserve toggle documentation
4. Update test matrix configuration
5. Run validation tests

## Security

### Input Validation

- URL validation with SSRF protection
- ID pattern validation
- Content sanitization
- Rate limiting per client
- Private IP blocking

### Security Headers

```http
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Content-Security-Policy: default-src 'self'...
```

### Security Audit

```bash
# Run security audit
npm audit

# Check dependencies
npm run test:security

# Validate environment
npm run validate:env
```

## Performance

### Optimization

- TypeScript compilation with strict settings
- Bundle minification and tree shaking
- Static asset compression
- Redis caching for results
- CDN delivery for public assets

### Monitoring

```bash
# Health check
GET /health

# System status
GET /api/status

# Performance metrics
GET /metrics
```

## Contributing

### Development Workflow

1. Fork the repository
2. Create feature branch
3. Make changes with tests
4. Run full test suite
5. Submit pull request

### Code Standards

- TypeScript strict mode
- ESLint + Prettier formatting
- 80%+ test coverage
- Security audit passed
- Documentation updated

### Adding Tests

```typescript
// Example test
describe('New Feature', () => {
  it('should work correctly', () => {
    // Test implementation
  });
});
```

## Deployment

### Production Build

```bash
# Full production build
./build.sh

# Custom build options
NODE_ENV=production MINIFY=true ./build.sh
```

### Docker Deployment

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY . .
RUN npm ci --production
RUN npm run build
EXPOSE 3001
CMD ["npm", "start"]
```

### Environment Setup

- Production Redis cluster
- Load balancer configuration
- SSL certificate setup
- Monitoring integration
- Backup configuration

## Monitoring

### Metrics

- Request latency and error rates
- Test execution performance
- Score calculation accuracy
- Vendor API availability
- System resource usage

### Logging

```bash
# Application logs
LOG_LEVEL=info

# Structured logging
{"level":"info","timestamp":"2025-01-01T00:00:00Z","message":"Test completed"}
```

### Alerts

- Test failure notifications
- Performance degradation
- Security violations
- System availability issues

## Troubleshooting

### Common Issues

**Build failures:**
```bash
# Clean and rebuild
rm -rf node_modules dist
npm install
npm run build
```

**Test failures:**
```bash
# Check test environment
npm run test:debug

# Validate configuration
npm run validate:config
```

**Redis connection issues:**
```bash
# Check Redis status
redis-cli ping

# Validate configuration
npm run validate:redis
```

### Debug Mode

```bash
# Enable debug logging
DEBUG=true npm run dev

# Verbose test output
npm run test -- --verbose

# Step-by-step execution
STEP_BY_STEP=true npm run test
```

## License

MIT License - see LICENSE file for details.

## Support

- **Documentation**: [docs/](./docs/)
- **Issues**: [GitHub Issues](https://github.com/Nickiller04/CredLink/issues)
- **Discussions**: [GitHub Discussions](https://github.com/Nickiller04/CredLink/discussions)
- **Security**: security@c2pa.org

## Acknowledgments

- Content Authenticity Initiative (CAI)
- C2PA (Coalition for Content Provenance and Authenticity)
- Open source contentauthenticity.org tools
- Vendor participants and contributors

---

**Version**: 1.1.0  
**Last Updated**: 2025-01-03  
**Status**: Production Ready
