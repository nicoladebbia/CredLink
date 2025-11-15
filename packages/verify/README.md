# @credlink/verify

Image verification service for C2PA-signed content.

## Overview

Cloudflare Workers-based verification service for validating C2PA signatures and proofs.

## Features

- ✅ Fast edge verification
- ✅ Durable Objects for state
- ✅ Global CDN distribution
- ✅ Batch verification support

## Deployment

```bash
# Deploy to Cloudflare Workers
pnpm deploy

# Test locally
pnpm dev
```

## API

```bash
POST /verify
Content-Type: multipart/form-data

{
  "image": <file>,
  "includeManifest": true
}
```

## License

Proprietary - CredLink Platform
