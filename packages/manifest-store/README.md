# @credlink/manifest-store

C2PA manifest storage and retrieval service for CredLink.

## Overview

Specialized storage layer for C2PA manifests with indexing and querying capabilities.

## Features

- ✅ Manifest versioning
- ✅ Query by hash, creator, timestamp
- ✅ Efficient indexing
- ✅ Batch operations

## Usage

```typescript
import { ManifestStore } from '@credlink/manifest-store';

const store = new ManifestStore(config);
await store.saveManifest(manifestId, manifest);
const manifest = await store.getManifest(manifestId);
```

## License

Proprietary - CredLink Platform
