# Reproducible Builds for CredLink

This document explains how CredLink achieves reproducible builds and how to verify them.

## Overview

Reproducible builds ensure that the binaries we ship are exactly the ones we built from pinned sources, with verifiable provenance and deterministic outputs.

## Implementation

### 1. Deterministic Timestamps

We use `SOURCE_DATE_EPOCH` to ensure consistent timestamps across builds:

```bash
export SOURCE_DATE_EPOCH=$(git log -1 --format=%ct)
```

### 2. BuildKit Configuration

Our `buildkit.toml` ensures:
- Deterministic layer ordering
- Consistent file permissions
- Stable metadata

### 3. Environment Controls

Fixed environment variables:
- `LC_ALL=C.UTF-8`
- `LANG=C.UTF-8`
- `TZ=UTC`
- `NODE_ENV=production`

### 4. Dependency Management

- Locked dependencies with `pnpm-lock.yaml`
- `--frozen-lockfile` flag
- Deterministic install order

## Verification

### Reproducing a Build

To reproduce a specific build:

```bash
# Clone the repository
git clone https://github.com/Nickiller04/CredLink.git
cd CredLink

# Checkout the specific commit
git checkout <commit-sha>

# Set the source date epoch
export SOURCE_DATE_EPOCH=$(git log -1 --format=%ct)

# Build with reproducible Dockerfile
docker buildx build \
  --build-arg SOURCE_DATE_EPOCH=$SOURCE_DATE_EPOCH \
  -f Dockerfile.reproducible \
  --tag CredLink:reproducible \
  .

# Compare digests
docker images --digests CredLink
```

### Verifying Digests

Compare the produced image digest with the published one:

```bash
# Get published digest
docker buildx imagetools inspect ghcr.io/nickiller04/CredLink:<tag>

# Compare with local build
docker buildx imagetools inspect CredLink:reproducible
```

## Variance Controls

### Controlled Inputs

- **Source Code**: Git commit SHA pinned
- **Dependencies**: Locked with pnpm
- **Base Images**: Specific digests pinned
- **Build Tools**: Version-controlled via BuildKit

### Stabilized Metadata

- **File Permissions**: Explicitly set to 755/644
- **Timestamps**: All set to SOURCE_DATE_EPOCH
- **Ordering**: Deterministic file processing
- **Locale**: Fixed to UTF-8

### Build Environment

- **Timezone**: UTC
- **Locale**: C.UTF-8
- **Node Environment**: production
- **User**: Non-root (c2concierge:1001)

## Continuous Integration

Our GitHub Actions workflow ensures:
- Consistent build environment
- Deterministic timestamps
- Provenance attestation
- Digest verification

## Troubleshooting

### Common Issues

1. **Non-deterministic file ordering**
   - Ensure sorted file lists in COPY operations
   - Use deterministic tar options

2. **Timestamp variations**
   - Verify SOURCE_DATE_EPOCH is set correctly
   - Check all layers use the epoch

3. **Permission differences**
   - Explicitly set file permissions
   - Use consistent user/group IDs

### Debug Commands

```bash
# Compare layer digests
docker history ghcr.io/nickiller04/CredLink:<tag>
docker history CredLink:reproducible

# Inspect image config
docker inspect ghcr.io/nickiller04/CredLink:<tag>
docker inspect CredLink:reproducible

# Check file differences
docker run --rm -it ghcr.io/nickiller04/CredLink:<tag> find /app -type f -exec sha256sum {} \; | sort
docker run --rm -it CredLink:reproducible find /app -type f -exec sha256sum {} \; | sort
```

## Metrics

We track the following reproducibility metrics:
- **Digest Match Rate**: Percentage of builds that reproduce exactly
- **Layer Consistency**: Number of identical layers across builds
- **Timestamp Variance**: Deviation from SOURCE_DATE_EPOCH
- **Permission Drift**: Files with incorrect permissions

## References

- [Reproducible Builds](https://reproducible-builds.org/)
- [Docker BuildKit](https://docs.docker.com/build/buildkit/)
- [SLSA Provenance](https://slsa.dev/)
- [SOURCE_DATE_EPOCH](https://reproducible-builds.org/docs/source-date-epoch/)
