# CredLink Signing Service

A dedicated microservice for C2PA manifest signing and certificate management, built as part of the CredLink platform.

## Overview

The Signing Service provides:
- **Image Signing**: C2PA manifest embedding for digital content authentication
- **Batch Processing**: Concurrent signing of multiple images
- **Certificate Management**: Dynamic certificate loading and validation
- **Health Monitoring**: Comprehensive health checks and metrics
- **Rate Limiting**: Protection against abuse and resource exhaustion

## Features

### 🎯 Core Functionality
- **Single Image Signing**: POST `/api/v1/sign`
- **Batch Image Signing**: POST `/api/v1/sign/batch`
- **Service Status**: GET `/api/v1/sign/status`
- **Certificate Listing**: GET `/api/v1/sign/certificates`

### 🔧 Technical Features
- **TypeScript**: Full type safety and IntelliSense support
- **Express.js**: RESTful API with comprehensive middleware
- **Multer**: Efficient file upload handling
- **Zod**: Runtime request validation
- **Rate Limiting**: Configurable request throttling
- **Health Checks**: Kubernetes-ready liveness/readiness probes
- **Metrics Collection**: Request and performance tracking
- **Structured Logging**: JSON-formatted logs with metadata

### 🛡️ Security & Performance
- **Helmet**: Security headers and CSP configuration
- **CORS**: Cross-origin request handling
- **Compression**: Response payload optimization
- **File Validation**: Type and size restrictions
- **Input Sanitization**: Request data validation
- **Error Handling**: Comprehensive error responses

## Quick Start

### Prerequisites
- Node.js 18+
- pnpm package manager
- Valid CredLink API credentials

### Installation

```bash
# Install dependencies
pnpm install

# Copy environment configuration
cp .env.example .env

# Edit .env with your configuration
nano .env
```

### Development

```bash
# Start development server
pnpm dev

# Run tests
pnpm test

# Build for production
pnpm build

# Start production server
pnpm start
```

## API Documentation

### POST /api/v1/sign

Sign a single image with C2PA manifest.

**Request:**
```
Content-Type: multipart/form-data

image: File (required) - Image to sign (max 50MB)
custom_assertions: JSON (optional) - Custom C2PA assertions
claim_generator: String (optional) - Claim generator identifier
title: String (optional) - Manifest title
format: String (optional) - Output format (jpeg/png/tiff/webp)
```

**Response:**
```
Content-Type: image/original-mimetype
X-CredLink-Signature: image-hash
X-CredLink-Proof-URI: proof-uri
X-CredLink-Processing-Time: milliseconds

Binary image data with embedded C2PA manifest
```

### POST /api/v1/sign/batch

Sign multiple images concurrently.

**Request:**
```
Content-Type: multipart/form-data

images: Files (required) - Images to sign (max 10 files)
batch_options: JSON (optional) - Batch processing options
```

**Response:**
```json
{
  "batch_id": "batch_uuid",
  "total_files": 5,
  "successful": 4,
  "failed": 1,
  "processing_time": 15000,
  "results": [
    {
      "file_index": 0,
      "original_name": "image1.jpg",
      "success": true,
      "image_hash": "sha256_hash",
      "proof_uri": "https://proof.credlink.com/uuid",
      "error": null,
      "processing_time": 3000
    }
  ]
}
```

### GET /api/v1/sign/status

Get service status and component health.

**Response:**
```json
{
  "service": "CredLink Signing Service",
  "status": "operational",
  "timestamp": "2024-01-01T00:00:00Z",
  "components": {
    "c2pa_service": { "status": "operational" },
    "certificate_manager": { "status": "operational" },
    "batch_service": { "status": "ready" }
  },
  "limits": {
    "max_file_size": "50MB",
    "max_batch_size": 10,
    "rate_limit": {
      "single": "100 requests per 15 minutes",
      "batch": "10 requests per 15 minutes"
    }
  }
}
```

## Configuration

### Environment Variables

```bash
# Service Configuration
NODE_ENV=production
PORT=3001
LOG_LEVEL=INFO

# CredLink SDK
CREDLINK_API_KEY=your-api-key
CREDLINK_API_URL=https://api.credlink.com

# Certificates
SIGNING_CERTIFICATE=./certs/signing-cert.pem
SIGNING_KEY_PATH=./certs/signing-key.pem

# Security
CORS_ALLOWED_ORIGINS=https://yourapp.com
MAX_REQUEST_SIZE=50mb
```

### Rate Limiting

- **Single Signing**: 100 requests per 15 minutes per IP
- **Batch Signing**: 10 requests per 15 minutes per IP
- **File Size**: Maximum 50MB per file
- **Batch Size**: Maximum 10 files per batch

## Deployment

### Vercel

The service is optimized for Vercel deployment:

1. **Root Directory**: `apps/sign-service`
2. **Build Command**: `pnpm build`
3. **Output Directory**: `dist`
4. **Install Command**: `pnpm install`
5. **Framework Preset**: Express

### Docker

```bash
# Build image
docker build -t credlink/sign-service .

# Run container
docker run -p 3001:3001 --env-file .env credlink/sign-service
```

### Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: sign-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: sign-service
  template:
    metadata:
      labels:
        app: sign-service
    spec:
      containers:
      - name: sign-service
        image: credlink/sign-service:latest
        ports:
        - containerPort: 3001
        env:
        - name: NODE_ENV
          value: "production"
        livenessProbe:
          httpGet:
            path: /health/live
            port: 3001
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 3001
```

## Monitoring

### Health Endpoints

- **Basic Health**: `GET /health`
- **Readiness Probe**: `GET /health/ready`
- **Liveness Probe**: `GET /health/live`
- **Detailed Metrics**: `GET /health/metrics`

### Metrics

The service tracks:
- Request counts and success rates
- Processing times and throughput
- File sizes and formats
- Error rates and types
- Resource utilization

### Logging

Structured JSON logging with:
- Request/response correlation IDs
- Performance metrics
- Error details and stack traces
- Component health status

## Development

### Project Structure

```
src/
├── index.ts              # Application entry point
├── routes/               # API route handlers
│   ├── sign.ts          # Signing endpoints
│   └── health.ts        # Health check endpoints
├── services/             # Business logic
│   ├── c2pa-service.ts  # C2PA signing logic
│   ├── certificate-manager.ts  # Certificate management
│   └── batch-signing-service.ts  # Batch processing
├── middleware/           # Express middleware
│   ├── error-handler.ts # Error handling
│   ├── validation.ts    # Request validation
│   ├── request-logger.ts # Request logging
│   └── metrics.ts       # Metrics collection
└── utils/               # Utility functions
    └── logger.ts        # Logging configuration
```

### Testing

```bash
# Run unit tests
pnpm test

# Run with coverage
pnpm test:coverage

# Run integration tests
pnpm test:integration

# Watch mode
pnpm test:watch
```

## Security

### Input Validation
- File type and size restrictions
- Request payload validation with Zod
- SQL injection prevention
- XSS protection

### Rate Limiting
- IP-based request throttling
- Configurable windows and limits
- Batch operation protection

### Certificate Security
- Secure certificate storage
- Certificate chain validation
- Key rotation support

## Performance

### Optimization Features
- Concurrent batch processing
- Memory-efficient file handling
- Response compression
- Connection pooling

### Benchmarks
- **Single Image**: ~3 seconds average
- **Batch Processing**: ~5 seconds for 5 images
- **Memory Usage**: < 256MB under normal load
- **Throughput**: 100+ concurrent requests

## Support

For issues and questions:
- Create an issue in the repository
- Check the health endpoints for service status
- Review logs for detailed error information

## License

© 2024 CredLink. All rights reserved.
