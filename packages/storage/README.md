# @credlink/storage

Unified storage abstraction layer for CredLink C2PA proofs.

## Overview

Provides a consistent interface for storing and retrieving C2PA proofs across multiple storage backends:
- In-memory (development/testing)
- Local filesystem
- AWS S3
- Cloudflare R2

## Installation

```bash
pnpm add @credlink/storage
```

## Usage

```typescript
import { ProofStorage } from '@credlink/storage';

const storage = new ProofStorage({
  type: 's3',
  bucket: 'credlink-proofs',
  region: 'us-east-1'
});

// Store a proof
await storage.storeProof(proofId, proofData);

// Retrieve a proof
const proof = await storage.getProof(proofId);
```

## Configuration

```typescript
interface StorageConfig {
  type: 'memory' | 'filesystem' | 's3' | 'r2';
  bucket?: string;
  region?: string;
  basePath?: string;
}
```

## Features

- ✅ Multiple storage backends
- ✅ Automatic proof expiration
- ✅ Background cleanup jobs
- ✅ Storage statistics and monitoring
- ✅ Hash-based deduplication

## Development

```bash
# Build
pnpm build

# Test
pnpm test

# Watch mode
pnpm dev
```

## License

Proprietary - CredLink Platform
