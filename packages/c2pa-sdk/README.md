# @credlink/c2pa-sdk

C2PA (Coalition for Content Provenance and Authenticity) SDK wrapper for CredLink.

## Overview

Provides a high-level interface for C2PA operations including:
- Image signing with C2PA manifests
- Signature verification
- Manifest extraction and parsing
- Certificate validation

## Installation

```bash
pnpm add @credlink/c2pa-sdk
```

## Usage

```typescript
import { C2PAService } from '@credlink/c2pa-sdk';

const service = new C2PAService();

// Sign an image
const result = await service.signImage(imageBuffer, {
  creator: 'CredLink',
  assertions: customAssertions
});

// Verify an image
const verification = await service.verifyImage(signedImageBuffer);
```

## Features

- ✅ C2PA manifest generation
- ✅ Cryptographic signing (RSA-SHA256)
- ✅ Multi-format support (JPEG, PNG, WebP)
- ✅ JUMBF container handling
- ✅ Certificate chain validation

## License

Proprietary - CredLink Platform
