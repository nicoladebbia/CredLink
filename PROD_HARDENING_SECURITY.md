# Production Hardening: Security Configuration
## Runtime Protection, Secrets Management, and Containerization

**Goal:** Production-grade security with typed env validation, secure Docker, and secrets management  
**Risk Level:** LOW (adds protection layers, no breaking changes)

---

## 🎯 Security Improvements Overview

| Component | Current State | Target State |
|-----------|--------------|--------------|
| **.env validation** | None (crashes at runtime) | Zod schema, validated at startup |
| **Dockerfile** | 4 duplicates, unoptimized | 1 production-grade, multi-stage, distroless |
| **Secrets** | Hardcoded in .env files | GitHub OIDC, AWS Secrets Manager |
| **Headers** | Basic helmet() | Full security headers + CSP |
| **Rate limiting** | Single global limit | Per-route, IP-based, Redis-backed |
| **CORS** | Permissive | Strict origin whitelist |

---

## 1. Typed Environment Schema with Zod

### Problem
Current `.env.example` has 50+ variables with no validation. Missing vars crash at runtime.

### Solution
**File:** `apps/api/src/config/env-schema.ts` (NEW)

```typescript
import { z } from 'zod';

// Server configuration
const serverSchema = z.object({
  PORT: z.coerce.number().min(1024).max(65535).default(3000),
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  APP_NAME: z.string().default('credlink-api'),
});

// Authentication & security
const authSchema = z.object({
  API_KEYS: z.string().transform(s => s.split(',')).optional(),
  ENABLE_API_KEY_AUTH: z.coerce.boolean().default(false),
  JWT_SECRET: z.string().min(32).optional(),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000),
  RATE_LIMIT_MAX: z.coerce.number().default(100),
});

// AWS configuration
const awsSchema = z.object({
  AWS_REGION: z.string().default('us-east-1'),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_PREFIX: z.string().default('proofs/'),
  KMS_KEY_ID: z.string().optional(),
});

// Database configuration
const databaseSchema = z.object({
  DATABASE_URL: z.string().url().optional(),
  DB_POOL_MAX: z.coerce.number().min(1).max(100).default(20),
  DB_POOL_MIN: z.coerce.number().min(1).default(2),
  DB_POOL_IDLE_TIMEOUT: z.coerce.number().default(30000),
  DB_CONNECTION_TIMEOUT: z.coerce.number().default(10000),
  DB_CA_CERT_PATH: z.string().optional(),
});

// Certificate management
const certificateSchema = z.object({
  SIGNING_CERTIFICATE: z.string(),
  SIGNING_PRIVATE_KEY: z.string(),
  ENCRYPTED_PRIVATE_KEY: z.string().optional(),
});

// Storage configuration
const storageSchema = z.object({
  STORAGE_BACKEND: z.enum(['memory', 'local', 's3']).default('memory'),
  USE_LOCAL_PROOF_STORAGE: z.coerce.boolean().default(false),
  PROOF_STORAGE_PATH: z.string().default('./proofs'),
  PROOF_URI_DOMAIN: z.string().url().default('https://proofs.credlink.com'),
  MAX_FILE_SIZE_MB: z.coerce.number().min(1).max(100).default(50),
});

// Logging & monitoring
const monitoringSchema = z.object({
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug', 'verbose']).default('info'),
  AWS_CLOUDWATCH_LOG_GROUP: z.string().optional(),
  ENABLE_DEFAULT_METRICS: z.coerce.boolean().default(true),
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_ENVIRONMENT: z.string().default('development'),
});

// C2PA configuration
const c2paSchema = z.object({
  USE_REAL_C2PA: z.coerce.boolean().default(true),
  MAX_EMBED_SIZE_MB: z.coerce.number().default(10),
  REQUIRE_MANIFEST_HASH: z.coerce.boolean().default(true),
});

// Combined schema
export const envSchema = z.object({
  ...serverSchema.shape,
  ...authSchema.shape,
  ...awsSchema.shape,
  ...databaseSchema.shape,
  ...certificateSchema.shape,
  ...storageSchema.shape,
  ...monitoringSchema.shape,
  ...c2paSchema.shape,
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validate and parse environment variables at startup
 * @throws ZodError if validation fails
 */
export function validateAndParseEnv(): Env {
  try {
    const parsed = envSchema.parse(process.env);
    
    // Production-specific validations
    if (parsed.NODE_ENV === 'production') {
      if (!parsed.SENTRY_DSN) {
        console.warn('⚠️  SENTRY_DSN not configured in production');
      }
      if (parsed.STORAGE_BACKEND === 'memory') {
        throw new Error('❌ STORAGE_BACKEND=memory not allowed in production');
      }
      if (!parsed.DATABASE_URL) {
        throw new Error('❌ DATABASE_URL required in production');
      }
    }
    
    return parsed;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Environment validation failed:');
      error.errors.forEach(err => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`);
      });
    }
    throw error;
  }
}
```

### Integration
**Update:** `apps/api/src/index.ts` (line 46)

```diff
--- a/apps/api/src/index.ts
+++ b/apps/api/src/index.ts
@@ -43,10 +43,13 @@ import dotenv from 'dotenv';
 dotenv.config();
 
-// Validate environment configuration on startup
+// Validate environment configuration with Zod schema
+import { validateAndParseEnv } from './config/env-schema';
 try {
-  validateEnvironment();
-  console.log('Environment validation passed');
+  const env = validateAndParseEnv();
+  console.log('✅ Environment validation passed');
+  console.log(`   NODE_ENV: ${env.NODE_ENV}`);
+  console.log(`   STORAGE_BACKEND: ${env.STORAGE_BACKEND}`);
 } catch (error: any) {
   console.error('Environment validation failed:', error.message);
   process.exit(1);
```

---

## 2. Production-Grade Dockerfile

### Current Issues
- 4 duplicate Dockerfiles (confusion)
- No multi-stage build (large image size)
- Running as root (security risk)
- Not using distroless base (attack surface)

### Solution
**File:** `Dockerfile` (replaces all 4)

```dockerfile
# ============================================
# Stage 1: Dependencies
# ============================================
FROM node:20-alpine AS deps
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# Copy dependency manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/*/package.json ./packages/*/

# Install dependencies
RUN pnpm install --frozen-lockfile --prod=false

# ============================================
# Stage 2: Builder
# ============================================
FROM node:20-alpine AS builder
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps ./apps
COPY --from=deps /app/packages ./packages

# Copy source code
COPY . .

# Build all packages
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
RUN pnpm run build

# Remove dev dependencies
RUN pnpm prune --prod

# ============================================
# Stage 3: Runtime (distroless)
# ============================================
FROM gcr.io/distroless/nodejs20-debian12:nonroot AS runtime

WORKDIR /app

# Copy built artifacts and production dependencies
COPY --from=builder --chown=nonroot:nonroot /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=nonroot:nonroot /app/packages ./packages
COPY --from=builder --chown=nonroot:nonroot /app/node_modules ./node_modules
COPY --from=builder --chown=nonroot:nonroot /app/package.json ./

# Copy fixtures (certificates, etc.)
COPY --from=builder --chown=nonroot:nonroot /app/fixtures ./fixtures

# Set environment
ENV NODE_ENV=production \
    PORT=3000 \
    LOG_LEVEL=info

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD ["node", "-e", "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"]

# Expose port
EXPOSE 3000

# User is already 'nonroot' in distroless base
USER nonroot

# Start application
CMD ["apps/api/dist/index.js"]
```

### Docker Compose for Local Development
**File:** `docker-compose.yml` (NEW)

```yaml
version: '3.9'

services:
  api:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
      - DATABASE_URL=postgresql://credlink:credlink@postgres:5432/credlink
      - STORAGE_BACKEND=local
      - LOG_LEVEL=debug
    volumes:
      - ./proofs:/app/proofs
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 10s
      timeout: 5s
      retries: 3
      start_period: 30s

  postgres:
    image: postgres:16-alpine
    ports:
      - "5432:5432"
    environment:
      - POSTGRES_DB=credlink
      - POSTGRES_USER=credlink
      - POSTGRES_PASSWORD=credlink
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U credlink"]
      interval: 5s
      timeout: 3s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

volumes:
  postgres_data:
  redis_data:
```

---

## 3. Enhanced Security Headers

**Update:** `apps/api/src/index.ts` (helmet configuration)

```typescript
// Current: Basic helmet()
app.use(helmet());

// Replace with:
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // For Swagger UI
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: { policy: "same-origin" },
  crossOriginResourcePolicy: { policy: "same-origin" },
  dnsPrefetchControl: { allow: false },
  frameguard: { action: "deny" },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  ieNoOpen: true,
  noSniff: true,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  xssFilter: true,
}));
```

---

## 4. Enhanced Rate Limiting

**File:** `apps/api/src/middleware/rate-limit.ts` (NEW)

```typescript
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { createClient } from 'redis';

const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
});
redisClient.connect();

// Global rate limit (fallback)
export const globalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  store: process.env.REDIS_URL ? new RedisStore({
    client: redisClient,
    prefix: 'rate-limit:global:',
  }) : undefined,
});

// Strict rate limit for sensitive operations
export const strictRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // Only 10 requests per 15 minutes
  message: 'Too many attempts, please try again later.',
  skipSuccessfulRequests: true, // Don't count successful requests
  store: process.env.REDIS_URL ? new RedisStore({
    client: redisClient,
    prefix: 'rate-limit:strict:',
  }) : undefined,
});

// API key creation rate limit
export const apiKeyCreationLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: 'Too many API keys created, please try again later.',
  store: process.env.REDIS_URL ? new RedisStore({
    client: redisClient,
    prefix: 'rate-limit:api-key:',
  }) : undefined,
});
```

**Apply to routes:**
```typescript
// Strict limits on sensitive operations
app.post('/api/v1/sign', strictRateLimit, signRouter);
app.post('/api/v1/api-keys', apiKeyCreationLimit, apiKeyRouter);

// Global limit on all other routes
app.use('/api', globalRateLimit);
```

---

## 5. Strict CORS Configuration

**Update:** `apps/api/src/index.ts`

```typescript
// Current: Permissive CORS
app.use(cors());

// Replace with:
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
  'https://credlink.com',
  'https://www.credlink.com',
  'https://app.credlink.com',
];

if (process.env.NODE_ENV === 'development') {
  allowedOrigins.push('http://localhost:3000', 'http://localhost:3001');
}

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  maxAge: 86400, // 24 hours
  optionsSuccessStatus: 200,
}));
```

---

## 6. Secrets Management (GitHub OIDC)

### AWS IAM Role for GitHub Actions

**File:** `infra/terraform/github-oidc.tf` (NEW)

```hcl
# OIDC provider for GitHub Actions
resource "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"

  client_id_list = [
    "sts.amazonaws.com",
  ]

  thumbprint_list = [
    "6938fd4d98bab03faadb97b34396831e3780aea1",
  ]
}

# IAM role for staging deployments
resource "aws_iam_role" "github_actions_staging" {
  name = "credlink-github-actions-staging"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = aws_iam_openid_connect_provider.github.arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          }
          StringLike = {
            "token.actions.githubusercontent.com:sub" = "repo:Nickiller04/c2-concierge:environment:staging"
          }
        }
      }
    ]
  })
}

# Attach policies for staging deployments
resource "aws_iam_role_policy_attachment" "github_actions_staging_ecr" {
  role       = aws_iam_role.github_actions_staging.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryPowerUser"
}

resource "aws_iam_role_policy_attachment" "github_actions_staging_ecs" {
  role       = aws_iam_role.github_actions_staging.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonECS_FullAccess"
}

# IAM role for production deployments (separate, restricted)
resource "aws_iam_role" "github_actions_production" {
  name = "credlink-github-actions-production"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = aws_iam_openid_connect_provider.github.arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          }
          StringLike = {
            "token.actions.githubusercontent.com:sub" = "repo:Nickiller04/c2-concierge:environment:production"
          }
        }
      }
    ]
  })
}

output "github_actions_staging_role_arn" {
  value = aws_iam_role.github_actions_staging.arn
}

output "github_actions_production_role_arn" {
  value = aws_iam_role.github_actions_production.arn
}
```

---

## ✅ Security Verification Checklist

```bash
# 1. Verify env schema catches errors
node -e "process.env.PORT='invalid'; require('./apps/api/dist/config/env-schema').validateAndParseEnv()"
# Should fail with validation error

# 2. Test Docker build
docker build -t credlink-api:test .
# Should complete without errors

# 3. Scan Docker image for vulnerabilities
docker scan credlink-api:test
# Should show zero high/critical vulns

# 4. Verify non-root user
docker run --rm credlink-api:test id
# Should show uid=65532(nonroot)

# 5. Test rate limiting
for i in {1..20}; do curl http://localhost:3000/health; done
# Should eventually return 429 Too Many Requests

# 6. Verify CORS blocking
curl -H "Origin: https://evil.com" http://localhost:3000/health
# Should fail with CORS error

# 7. Check security headers
curl -I https://staging.credlink.com
# Should show: Strict-Transport-Security, X-Content-Type-Options, etc.
```

---

**Next:** [PROD_HARDENING_OPERATIONS.md](./PROD_HARDENING_OPERATIONS.md)
