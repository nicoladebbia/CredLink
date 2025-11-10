# CredLink Sign Service

Backend service for signing and verifying images with C2PA manifests.

## Status: Development (Mock C2PA Implementation)

⚠️ **Current implementation uses mock C2PA signing for structure demonstration.**
- Sign endpoint: ✅ Working (mock signing)
- Verify endpoint: ✅ Working (mock verification)
- Proof storage: ✅ Working (in-memory)
- Tests: ✅ 28/28 passing, 82% coverage

## Quick Start

### Local Development

```bash
# Install dependencies
pnpm install

# Run development server
pnpm dev

# Run tests
pnpm test

# Build
pnpm build

# Start production server
pnpm start
```

Server runs on `http://localhost:3001`

### Docker

```bash
# Build image
docker build -t credlink-sign-service .

# Run container
docker run -p 3001:3001 credlink-sign-service

# Or use docker-compose
docker-compose up -d
```

## API Endpoints

### POST /sign

Sign an image with C2PA manifest.

```bash
curl -X POST http://localhost:3001/sign \
  -F "image=@path/to/image.jpg" \
  -F "issuer=YourName" \
  -o signed-image.jpg
```

**Response Headers:**
- `X-Proof-Uri`: Remote proof location
- `X-Manifest-Hash`: SHA256 hash of manifest
- `X-Processing-Time`: Processing duration in ms

### POST /verify

Verify an image's C2PA signature.

```bash
curl -X POST http://localhost:3001/verify \
  -F "image=@signed-image.jpg"
```

**Response:**
```json
{
  "valid": false,
  "confidence": 0,
  "timestamp": 1234567890,
  "processingTime": 1,
  "details": {
    "signature": false,
    "certificate": false,
    "proofUri": null,
    "proofFound": false,
    "proofMatches": false
  }
}
```

### GET /health

Health check endpoint.

```bash
curl http://localhost:3001/health
```

### GET /ready

Readiness check endpoint.

```bash
curl http://localhost:3001/ready
```

### GET /sign/stats

Get proof storage statistics.

```bash
curl http://localhost:3001/sign/stats
```

## Configuration

Environment variables (see `.env.example`):

- `NODE_ENV`: Environment (development/production)
- `PORT`: Server port (default: 3001)
- `LOG_LEVEL`: Logging level (default: info)
- `ALLOWED_ORIGINS`: CORS origins (comma-separated)
- `MAX_FILE_SIZE_MB`: Maximum upload size (default: 50)
- `RATE_LIMIT_WINDOW_MS`: Rate limit window (default: 60000)
- `RATE_LIMIT_MAX`: Max requests per window (default: 100)

## Architecture

```
src/
├── index.ts              # Express server entry point
├── routes/
│   ├── sign.ts          # Sign endpoint
│   └── verify.ts        # Verify endpoint
├── services/
│   ├── c2pa-service.ts      # C2PA signing/verification (mock)
│   ├── proof-storage.ts     # Proof storage (in-memory)
│   ├── metadata-embedder.ts # Metadata embedding (mock)
│   └── metadata-extractor.ts # Metadata extraction (mock)
├── middleware/
│   └── error-handler.ts     # Error handling
├── utils/
│   └── logger.ts            # Winston logger
├── types/
│   └── index.ts             # TypeScript types
└── tests/
    ├── unit/                # Unit tests
    └── integration/         # Integration tests
```

## Development

### Run Tests

```bash
# All tests
pnpm test

# With coverage
pnpm test -- --coverage

# Watch mode
pnpm test:watch
```

### Build

```bash
pnpm build
```

Output: `dist/`

### Code Quality

- **TypeScript**: Strict mode enabled
- **Linting**: ESLint (inherited from workspace)
- **Testing**: Jest + Supertest
- **Coverage**: 82.62% (target: 60%+)

## Next Steps for Production

### Replace Mock Implementations:

1. **C2PA Signing**
   - Install: `pnpm add c2pa-node`
   - Replace `c2pa-service.ts` with real implementation
   - Add signing certificates and key management

2. **Metadata Embedding**
   - Use Sharp library for EXIF/XMP embedding
   - Update `metadata-embedder.ts`

3. **Metadata Extraction**
   - Parse actual EXIF/XMP data
   - Update `metadata-extractor.ts`

4. **Proof Storage**
   - Replace in-memory with Cloudflare KV, DynamoDB, or PostgreSQL
   - Update `proof-storage.ts`

5. **Survival Rate Testing**
   - Measure real survival rates (1,000+ operations)
   - Test against actual image optimizers
   - Document measured metrics

## License

MIT
