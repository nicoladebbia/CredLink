# CredLink API Gateway

Production-ready API Gateway with authentication, rate limiting, and monitoring.

## Features

- **Security**: Helmet.js, CORS, JWT authentication
- **Performance**: Compression, metrics collection
- **Reliability**: Error handling, health checks, graceful shutdown
- **Developer Experience**: Request validation, structured logging, TypeScript

## Installation

```bash
npm install
```

## Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Required environment variables:
- `PORT`: Server port (default: 3000)
- `JWT_SECRET`: Secret for JWT signing
- `ALLOWED_ORIGINS`: Comma-separated list of allowed origins

## Development

```bash
npm run dev
```

## Production

```bash
npm run build
npm start
```

## API Endpoints

### Health Check
- `GET /health` - Basic health check
- `GET /health/detailed` - Detailed health with metrics
- `GET /health/ready` - Readiness probe
- `GET /health/live` - Liveness probe

### Signing
- `POST /api/v1/sign` - Sign an image
- `POST /api/v1/sign/batch` - Batch sign images

### Verification
- `POST /api/v1/verify` - Verify an image
- `POST /api/v1/verify/batch` - Batch verify images

### Documentation
- `GET /api/docs` - API documentation

## Authentication

Include JWT token in request:

```bash
Authorization: Bearer <token>
```

Or use API key:

```bash
X-API-Key: <api-key>
```

## License

MIT
