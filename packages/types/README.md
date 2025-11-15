# @credlink/types

Shared TypeScript type definitions for the CredLink platform.

## Overview

This package provides common types, interfaces, and utilities used across all CredLink packages and applications. It ensures type safety and consistency throughout the codebase.

## Installation

```bash
pnpm add @credlink/types
```

## Usage

```typescript
import { C2PAManifest, ProofRecord, VerificationResult } from '@credlink/types';

// Use shared types in your code
const manifest: C2PAManifest = {
  claim_generator: '...',
  assertions: []
};
```

## Exported Types

### Core Types
- `C2PAManifest` - C2PA manifest structure
- `ProofRecord` - Proof storage record
- `VerificationResult` - Image verification result
- `Certificate` - X.509 certificate structure

### API Types
- `SigningRequest` - Image signing request
- `VerificationRequest` - Image verification request
- `APIError` - Standardized error response

## Development

```bash
# Build
pnpm build

# Watch mode
pnpm dev
```

## License

Proprietary - CredLink Platform
