# PHASE 3: BACKEND IMPLEMENTATION (Steps 151-500)

**Timeline:** 4-8 weeks  
**Owner:** Backend Engineering Team  
**Score Impact:** 5.5/10 → 6.5/10  
**Goal:** Build the /sign and /verify endpoints that currently don't exist

---

## 🎯 THE CRITICAL REALITY

**Current state:** Frontend sends `POST /sign` → 404 error  
**After Phase 3:** Frontend sends `POST /sign` → Returns signed image

This is the difference between "looks like it works" and "actually works."

---

## STEPS 151-200: BUILD /SIGN ENDPOINT

### Project Structure (Steps 151-160)

```bash
# Create service directory
mkdir -p apps/sign-service/src/{routes,middleware,services,config,types,utils}
cd apps/sign-service

# Initialize
pnpm init
pnpm add express @types/express multer sharp uuid cors express-rate-limit
pnpm add morgan winston
pnpm add c2pa-node  # or chosen C2PA library
pnpm add -D typescript @types/node ts-node nodemon jest supertest

# tsconfig.json
cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  }
}
EOF
```

### Core Server (Steps 161-170)

```typescript
// src/index.ts
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import signRouter from './routes/sign';
import verifyRouter from './routes/verify';
import { errorHandler } from './middleware/error-handler';
import { logger } from './utils/logger';

const app = express();

// Middleware
app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') }));
app.use(express.json({ limit: '50mb' }));
app.use(rateLimit({ windowMs: 60000, max: 100 }));

// Health checks
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: Date.now() }));
app.get('/ready', (req, res) => res.json({ ready: true, version: '1.0.0' }));

// Routes
app.use('/sign', signRouter);
app.use('/verify', verifyRouter);

// Error handling
app.use(errorHandler);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => logger.info(`Sign service running on port ${PORT}`));
```

### C2PA Integration (Steps 171-190)

**Research C2PA thoroughly:**
- Read C2PA spec: https://c2pa.org/specifications/specifications/1.3/specs/C2PA_Specification.html
- Evaluate libraries: c2pa-node, c2pa-js
- Test with sample images

```typescript
// src/services/c2pa-service.ts
import { C2PA } from 'c2pa-node'; // or chosen library

export class C2PAService {
  private privateKey: Buffer;
  private certificate: Buffer;

  constructor() {
    // Load from environment or key management service
    this.privateKey = Buffer.from(process.env.C2PA_PRIVATE_KEY!, 'base64');
    this.certificate = Buffer.from(process.env.C2PA_CERTIFICATE!, 'base64');
  }

  async signImage(imageBuffer: Buffer, metadata: SignMetadata): Promise<SignedImage> {
    // 1. Generate C2PA manifest
    const manifest = await this.createManifest(imageBuffer, metadata);
    
    // 2. Sign manifest
    const signature = await this.signManifest(manifest);
    
    // 3. Embed in image
    const signedImage = await this.embedManifest(imageBuffer, manifest, signature);
    
    return {
      imageBuffer: signedImage,
      manifest,
      manifestHash: this.hashManifest(manifest)
    };
  }

  private async createManifest(image: Buffer, metadata: SignMetadata) {
    return {
      claim_generator: 'CredLink/1.0',
      assertions: [
        {
          label: 'c2pa.actions',
          data: {
            actions: [{
              action: 'c2pa.created',
              when: new Date().toISOString(),
              softwareAgent: 'CredLink Sign Service/1.0'
            }]
          }
        },
        {
          label: 'c2pa.hash.data',
          data: {
            alg: 'sha256',
            hash: this.hashImage(image),
            name: 'jumbf manifest'
          }
        }
      ],
      signature_info: {
        alg: 'ps256',
        issuer: metadata.issuer || 'CredLink'
      }
    };
  }

  private async signManifest(manifest: any): Promise<Buffer> {
    // Sign with private key
    // Implementation depends on chosen library
  }

  private async embedManifest(image: Buffer, manifest: any, signature: Buffer): Promise<Buffer> {
    // Embed in EXIF/XMP
    // Implementation depends on image format
  }
}
```

### Proof Storage (Steps 201-230)

```typescript
// src/services/proof-storage.ts
import { randomUUID } from 'crypto';
import { compress, decompress } from './compression';

export class ProofStorage {
  private backend: StorageBackend; // Cloudflare KV, DynamoDB, or PostgreSQL

  async storeProof(manifest: C2PAManifest, imageHash: string): Promise<string> {
    // Generate unique ID
    const proofId = randomUUID();
    const proofUri = `https://proofs.credlink.com/${proofId}`;
    
    // Compress manifest for storage efficiency
    const compressed = await compress(JSON.stringify(manifest));
    
    // Store with metadata
    await this.backend.set(proofId, {
      manifest: compressed,
      imageHash,
      created: Date.now(),
      ttl: 365 * 24 * 60 * 60, // 1 year
      accessCount: 0
    });
    
    // Also store by image hash for deduplication
    await this.backend.setIndex(`hash:${imageHash}`, proofId);
    
    return proofUri;
  }

  async retrieveProof(proofId: string): Promise<C2PAManifest | null> {
    const stored = await this.backend.get(proofId);
    if (!stored) return null;
    
    // Increment access counter
    await this.backend.increment(proofId, 'accessCount');
    
    // Decompress and return
    const manifestJson = await decompress(stored.manifest);
    return JSON.parse(manifestJson);
  }

  async findProofByHash(imageHash: string): Promise<string | null> {
    return await this.backend.getIndex(`hash:${imageHash}`);
  }
}
```

### Sign Route Implementation (Steps 181-200)

```typescript
// src/routes/sign.ts
import { Router } from 'express';
import multer from 'multer';
import { C2PAService } from '../services/c2pa-service';
import { ProofStorage } from '../services/proof-storage';
import { embedProofUri } from '../services/metadata-embedder';
import { logger } from '../utils/logger';

const router = Router();
const upload = multer({ limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB max

const c2paService = new C2PAService();
const proofStorage = new ProofStorage();

router.post('/', upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image provided' });
    }

    const startTime = Date.now();
    logger.info('Sign request received', { size: req.file.size, mimetype: req.file.mimetype });

    // 1. Sign image with C2PA
    const { imageBuffer, manifest, manifestHash } = await c2paService.signImage(
      req.file.buffer,
      {
        issuer: req.body.issuer || 'CredLink',
        softwareAgent: 'CredLink/1.0'
      }
    );

    // 2. Store proof remotely
    const proofUri = await proofStorage.storeProof(manifest, manifestHash);

    // 3. Embed proof URI in image metadata
    const finalImage = await embedProofUri(imageBuffer, proofUri);

    // 4. Return signed image
    const duration = Date.now() - startTime;
    logger.info('Sign completed', { duration, proofUri });

    res.set('Content-Type', req.file.mimetype);
    res.set('X-Proof-Uri', proofUri);
    res.set('X-Processing-Time', `${duration}ms`);
    res.send(finalImage);

  } catch (error) {
    logger.error('Sign failed', { error });
    next(error);
  }
});

export default router;
```

---

## STEPS 201-260: BUILD /VERIFY ENDPOINT

### Verify Route Implementation

```typescript
// src/routes/verify.ts
import { Router } from 'express';
import multer from 'multer';
import { C2PAService } from '../services/c2pa-service';
import { ProofStorage } from '../services/proof-storage';
import { extractManifest, extractProofUri } from '../services/metadata-extractor';
import { logger } from '../utils/logger';

const router = Router();
const upload = multer({ limits: { fileSize: 50 * 1024 * 1024 } });

const c2paService = new C2PAService();
const proofStorage = new ProofStorage();

router.post('/', upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image provided' });
    }

    const startTime = Date.now();
    logger.info('Verify request received');

    // 1. Extract embedded C2PA manifest
    const embeddedManifest = await extractManifest(req.file.buffer);
    
    // 2. Validate signature
    const signatureValid = await c2paService.validateSignature(embeddedManifest);
    
    // 3. Verify certificate chain
    const certValid = await c2paService.validateCertificate(embeddedManifest.certificate);
    
    // 4. Extract proof URI from metadata
    const proofUri = await extractProofUri(req.file.buffer);
    
    // 5. Fetch remote proof
    const remoteProof = proofUri ? await proofStorage.retrieveProof(
      proofUri.split('/').pop()!
    ) : null;
    
    // 6. Compare embedded vs remote
    const proofsMatch = remoteProof ? 
      JSON.stringify(embeddedManifest) === JSON.stringify(remoteProof) : 
      false;

    // 7. Calculate confidence score
    const confidence = calculateConfidence({
      signatureValid,
      certValid,
      hasProof: !!remoteProof,
      proofsMatch
    });

    // 8. Determine overall validity
    const valid = signatureValid && certValid && (proofsMatch || !remoteProof);

    const duration = Date.now() - startTime;
    logger.info('Verify completed', { duration, valid, confidence });

    res.json({
      valid,
      confidence,
      timestamp: Date.now(),
      processingTime: duration,
      details: {
        signature: signatureValid,
        certificate: certValid,
        proofUri: proofUri || null,
        proofFound: !!remoteProof,
        proofMatches: proofsMatch,
        manifestTimestamp: embeddedManifest.timestamp
      }
    });

  } catch (error) {
    logger.error('Verify failed', { error });
    next(error);
  }
});

function calculateConfidence(checks: any): number {
  let score = 0;
  if (checks.signatureValid) score += 40;
  if (checks.certValid) score += 30;
  if (checks.hasProof) score += 20;
  if (checks.proofsMatch) score += 10;
  return score;
}

export default router;
```

---

## STEPS 261-300: TESTING SUITE

### Test Structure

```bash
mkdir -p tests/{unit,integration,e2e,load}

# Unit tests
tests/unit/
  c2pa-service.test.ts
  proof-storage.test.ts
  metadata-embedder.test.ts

# Integration tests  
tests/integration/
  sign-flow.test.ts
  verify-flow.test.ts
  round-trip.test.ts

# E2E tests
tests/e2e/
  api.test.ts
  tamper-detection.test.ts

# Load tests
tests/load/
  sign-load.test.ts
  verify-load.test.ts
```

### Example Test

```typescript
// tests/integration/sign-flow.test.ts
describe('Sign Flow Integration', () => {
  it('should sign an image end-to-end', async () => {
    const testImage = readFileSync('fixtures/test-image.jpg');
    
    const response = await request(app)
      .post('/sign')
      .attach('image', testImage, 'test.jpg')
      .expect(200);
    
    expect(response.body).toBeDefined();
    expect(response.headers['x-proof-uri']).toMatch(/^https:\/\/proofs\.credlink\.com\//);
    
    // Verify signed image has manifest
    const manifest = await extractManifest(response.body);
    expect(manifest).toBeDefined();
    expect(manifest.claim_generator).toBe('CredLink/1.0');
  });

  it('should have signing latency < 500ms for 1MB image', async () => {
    const testImage = readFileSync('fixtures/1mb-image.jpg');
    
    const start = Date.now();
    await request(app).post('/sign').attach('image', testImage);
    const duration = Date.now() - start;
    
    expect(duration).toBeLessThan(500);
  });
});
```

---

## STEPS 301-350: SURVIVAL RATE TESTING

### THIS IS CRITICAL FOR HONEST CLAIMS

```typescript
// tests/survival/measure-survival-rates.test.ts
describe('Survival Rate Measurement', () => {
  const scenarios = [
    { name: 'ImageOptim', transform: imageOptimCompress },
    { name: 'TinyPNG', transform: tinyPngCompress },
    { name: 'Cloudflare', transform: cloudflareOptimize },
    { name: 'Twitter', transform: simulateTwitterCompression },
    { name: 'Instagram', transform: simulateInstagramFilter },
    { name: 'WhatsApp', transform: simulateWhatsAppCompress },
    { name: 'Format conversion', transform: jpegToPngToJpeg },
    { name: 'Downscale 50%', transform: downscale50 },
    { name: 'Crop center', transform: cropCenter },
    { name: 'Rotate 90°', transform: rotate90 }
  ];

  scenarios.forEach(scenario => {
    it(`should measure ${scenario.name} survival rate`, async () => {
      const iterations = 1000;
      let survived = 0;

      for (let i = 0; i < iterations; i++) {
        // Sign image
        const signed = await signImage(testImages[i % testImages.length]);
        
        // Apply transformation
        const transformed = await scenario.transform(signed);
        
        // Try to verify
        const result = await verifyImage(transformed);
        
        if (result.valid) survived++;
      }

      const survivalRate = (survived / iterations) * 100;
      
      console.log(`${scenario.name}: ${survivalRate.toFixed(2)}% survival (${survived}/${iterations})`);
      
      // Save to database for dashboard
      await saveSurvivalMetric(scenario.name, survivalRate, iterations);
      
      // Only fail if catastrophically low
      expect(survivalRate).toBeGreaterThan(50);
    });
  });

  it('should calculate overall survival rate', async () => {
    const allMetrics = await getAllSurvivalMetrics();
    const overall = allMetrics.reduce((sum, m) => sum + m.rate, 0) / allMetrics.length;
    
    console.log(`\n🎯 OVERALL SURVIVAL RATE: ${overall.toFixed(2)}%\n`);
    
    // NOW you can claim this percentage (probably 92-97%, not 99.9%)
    await updateDocumentation('survival-rate', overall);
  });
});
```

**Run 10,000+ operations before claiming any percentage.**

---

## STEPS 351-400: CONTAINERIZATION & LOCAL DEPLOYMENT

### Dockerfile

```dockerfile
# Dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build && pnpm test

FROM node:18-alpine
RUN adduser -S credlink && addgroup -S nodejs && adduser credlink nodejs
WORKDIR /app
COPY --from=builder --chown=credlink:nodejs /app/dist ./dist
COPY --from=builder --chown=credlink:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=credlink:nodejs /app/package.json ./
USER credlink
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"
CMD ["node", "dist/index.js"]
```

### docker-compose.yml

```yaml
version: '3.8'
services:
  sign-service:
    build: ./apps/sign-service
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=development
      - PORT=3001
      - DATABASE_URL=postgresql://user:pass@db:5432/credlink
      - REDIS_URL=redis://redis:6379
    depends_on:
      - db
      - redis
  
  db:
    image: postgres:15-alpine
    environment:
      - POSTGRES_DB=credlink
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
    volumes:
      - postgres-data:/var/lib/postgresql/data
  
  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data

volumes:
  postgres-data:
  redis-data:
```

### Test Locally

```bash
# Build
docker-compose build

# Start
docker-compose up -d

# Test
curl -X POST http://localhost:3001/sign \
  -F "image=@fixtures/test.jpg" \
  -o signed.jpg

# Verify
curl -X POST http://localhost:3001/verify \
  -F "image=@signed.jpg"

# Check logs
docker-compose logs -f sign-service
```

### Update Demo

```bash
# Update start-simple.sh (rename from start-demo-BROKEN.sh)
mv demo/start-demo-BROKEN.sh demo/start-simple.sh

# Remove warning banners from demo files
# Now that backend exists, demo should work!
```

---

## ✅ PHASE 3 COMPLETION CRITERIA

### Functional Requirements
- [ ] POST /sign endpoint working (returns signed image)
- [ ] POST /verify endpoint working (returns verification result)
- [ ] Proof storage operational (stores and retrieves)
- [ ] Demo frontend connects successfully
- [ ] Upload → Sign → Verify flow works end-to-end

### Quality Requirements
- [ ] 80%+ code coverage
- [ ] All unit tests passing
- [ ] All integration tests passing
- [ ] E2E tests passing
- [ ] Load tests: handles 100 concurrent requests
- [ ] Performance: Signing < 500ms, Verify < 200ms

### Measurement Requirements (CRITICAL)
- [ ] Survival rates measured across 1,000+ operations per scenario
- [ ] Actual signing time measured (average of 1,000 operations)
- [ ] Actual verification time measured
- [ ] Results documented: "94.7% survival (measured)" not "99.9% (made up)"

### Deployment Requirements
- [ ] Docker images build successfully
- [ ] docker-compose stack runs locally
- [ ] All services healthy
- [ ] Can sign and verify from browser

### Documentation Requirements
- [ ] API documented with OpenAPI spec
- [ ] README updated with actual working demo instructions
- [ ] Remove "BROKEN" warnings from all files
- [ ] Update START-HERE.md with working quick start
- [ ] Document measured metrics, not theoretical

### Scoring
**After Phase 3: 5.5/10 → 6.5/10**
- Functionality: 1/10 → 6/10 (+5)
- Completeness: 1/10 → 5/10 (+4)
- Overall: 5.5/10 → 6.5/10 (+1.0)

**You now have a working product (locally).** Next: Deploy to production.

---

**Proceed to: [Phase 4: Infrastructure Deployment](./PHASE-4-INFRASTRUCTURE.md)**
