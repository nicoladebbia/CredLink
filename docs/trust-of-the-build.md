# Trust of the Build - C2 Concierge Supply Chain Security

This document explains how to verify the integrity, provenance, and security of C2 Concierge releases.

## Overview

Every C2 Concierge release includes:
- **Cryptographic signatures** using Sigstore keyless signing
- **SLSA provenance attestations** from GitHub Actions
- **SBOMs** in SPDX 2.3 and CycloneDX formats
- **CVE scans** with zero tolerance for Critical/High vulnerabilities
- **Reproducible builds** with deterministic outputs

## Quick Verification

### 1. Verify Image Signature

```bash
# Verify the image signature
cosign verify ghcr.io/nickiller04/c2-concierge:latest

# Expected output: Verification successful
```

### 2. Check Provenance Attestation

```bash
# List attestations
cosign attestations list ghcr.io/nickiller04/c2-concierge:latest

# Verify SLSA provenance
cosign verify-attestation --type slsaprovenance ghcr.io/nickiller04/c2-concierge:latest
```

### 3. Download and Verify SBOM

```bash
# Download SBOM attestation
cosign verify-attestation --type sbom ghcr.io/nickiller04/c2-concierge:latest > sbom.json

# Extract and validate SBOM
jq '.predicate' sbom.json > sbom.spdx.json
```

## Detailed Verification Steps

### Prerequisites

Install the required tools:

```bash
# Install Cosign
curl -sSfL https://raw.githubusercontent.com/sigstore/cosign/main/install.sh | sh -s -- -b /usr/local/bin

# Install Syft for SBOM analysis
curl -sSfL https://raw.githubusercontent.com/anchore/syft/main/install.sh | sh -s -- -b /usr/local/bin

# Install Trivy for vulnerability scanning
curl -sSfL https://raw.githubusercontent.com/aquasecurity/trivy/main/install.sh | sh -s -- -b /usr/local/bin
```

### 1. Signature Verification

```bash
# Set the image tag
IMAGE="ghcr.io/nickiller04/c2-concierge:latest"

# Verify the signature
cosign verify "$IMAGE"

# Verify with specific issuer
cosign verify "$IMAGE" \
  --certificate-identity-regexp "repo:Nickiller04/c2-concierge:.*" \
  --certificate-oidc-issuer "https://token.actions.githubusercontent.com"
```

**Expected Result**: Signature verification succeeds with GitHub Actions identity.

### 2. Provenance Verification

```bash
# Verify SLSA provenance attestation
cosign verify-attestation \
  --type slsaprovenance \
  --certificate-identity-regexp "repo:Nickiller04/c2-concierge:.*" \
  --certificate-oidc-issuer "https://token.actions.githubusercontent.com" \
  "$IMAGE"

# Extract provenance details
cosign verify-attestation --type slsaprovenance "$IMAGE" | jq '.predicate' > provenance.json

# Check build details
cat provenance.json | jq '.builder.id'
cat provenance.json | jq '.buildType'
cat provenance.json | jq '.materials[0].uri'
```

**Expected Result**: Provenance shows GitHub Actions as builder and correct commit SHA.

### 3. SBOM Verification

```bash
# Generate local SBOM for comparison
syft "$IMAGE" -o spdx-json > local-sbom.spdx.json

# Download attested SBOM
cosign verify-attestation --type sbom "$IMAGE" | jq '.predicate' > attested-sbom.spdx.json

# Compare SBOMs
diff local-sbom.spdx.json attested-sbom.spdx.json

# Validate SBOM format
jq empty attested-sbom.spdx.json
echo "SPDX Version: $(jq -r '.spdxVersion' attested-sbom.spdx.json)"
```

**Expected Result**: SBOMs match and are valid SPDX 2.3 format.

### 4. Vulnerability Verification

```bash
# Scan for vulnerabilities
trivy image --severity CRITICAL,HIGH "$IMAGE"

# Should return: No vulnerabilities found

# Scan SBOM for vulnerabilities
trivy sbom attested-sbom.spdx.json --severity CRITICAL,HIGH

# Should return: No vulnerabilities found
```

**Expected Result**: No Critical or High vulnerabilities found.

### 5. Reproducible Build Verification

```bash
# Clone the repository
git clone https://github.com/Nickiller04/c2-concierge.git
cd c2-concierge

# Get the provenance commit
COMMIT=$(cat provenance.json | jq -r '.materials[0].digest.sha1')
git checkout "$COMMIT"

# Set source date epoch from provenance
SOURCE_DATE_EPOCH=$(cat provenance.json | jq -r '.invocation.parameters.sourceDateEpoch')
export SOURCE_DATE_EPOCH

# Build reproducibly
docker buildx build \
  --build-arg SOURCE_DATE_EPOCH=$SOURCE_DATE_EPOCH \
  -f Dockerfile.reproducible \
  --tag local-test \
  .

# Compare digests
docker buildx imagetools inspect "$IMAGE"
docker buildx imagetools inspect local-test
```

**Expected Result**: Image digests match exactly.

## Attestation Store Links

### GitHub Artifact Attestations

- **Repository**: https://github.com/Nickiller04/c2-concierge
- **Attestations**: https://github.com/Nickiller04/c2-concierge/attestations

### Rekor Transparency Log

- **Log Entry**: https://rekor.sigstore.dev/api/v1/log/entries?logIndex=<index-from-cosign>

### Container Registry

- **Image**: https://github.com/Nickiller04/c2-concierge/pkgs/container/c2-concierge
- **SBOMs**: Attached as attestations

## Security Policy Enforcement

### Kubernetes Admission

Our cluster enforces the following policies:

1. **Signature Verification**: All images must be signed with valid GitHub Actions identity
2. **Provenance Attestation**: SLSA provenance is required for deployment
3. **SBOM Attestation**: Valid SPDX 2.3 SBOM must be attached
4. **CVE Gate**: Images with Critical/High vulnerabilities are blocked

### Policy Examples

```yaml
# Sigstore Policy Controller
apiVersion: policy.sigstore.dev/v1alpha1
kind: ClusterImagePolicy
metadata:
  name: c2-concierge-policy
spec:
  images:
    - glob: "ghcr.io/nickiller04/c2-concierge/*"
  authorities:
    - keyless:
        identities:
          - issuer: "https://token.actions.githubusercontent.com"
            subjectRegExp: "^repo:Nickiller04/c2-concierge:.*$"
  attestations:
    - name: slsa-provenance
      predicateType: "https://slsa.dev/provenance/v1"
```

## Incident Response

### Compromise Detection

If a compromise is suspected:

1. **Verify signatures** of running images
2. **Check attestations** for valid provenance
3. **Scan for vulnerabilities** in deployed artifacts
4. **Verify reproducibility** of builds

### Recovery Steps

1. **Identify affected commits** via provenance
2. **Revoke attestations** if necessary
3. **Rebuild with clean environment**
4. **Verify new signatures** and attestations
5. **Update deployment policies**

## Compliance Mapping

### SLSA Compliance

- **SLSA Level 3**: ✅ Achieved with provenance and reproducible builds
- **SLSA Level 4**: 🔄 In progress with more strict controls

### NIST SSDF Controls

- **PV-1**: Identify security requirements ✅
- **PV-2**: Perform vulnerability analysis ✅
- **PV-3**: Resolve vulnerabilities ✅
- **RV-1**: Perform verification ✅
- **RV-2**: Conduct code analysis ✅
- **PE-1**: Define secure coding standards ✅

## Tools and Commands Reference

### Cosign Commands

```bash
# Verify signature
cosign verify IMAGE

# List attestations
cosign attestations list IMAGE

# Verify specific attestation type
cosign verify-attestation --type slsaprovenance IMAGE
cosign verify-attestation --type sbom IMAGE

# Download attestation
cosign attestations download --type sbom IMAGE
```

### Trivy Commands

```bash
# Scan image
trivy image IMAGE

# Scan SBOM
trivy sbom sbom.json

# Generate SBOM
trivy image --format spdx-json --output sbom.json IMAGE
```

### Syft Commands

```bash
# Generate SBOM
syft IMAGE -o spdx-json=sbom.json
syft IMAGE -o cyclonedx-json=sbom.cdx.json

# Compare SBOMs
syft diff IMAGE1 IMAGE2
```

## Support

For questions about supply chain security:

- **Issues**: https://github.com/Nickiller04/c2-concierge/issues
- **Security**: security@c2-concierge.com
- **Documentation**: https://docs.c2-concierge.com/security

---

**Last Updated**: 2025-11-02
**Version**: 1.0
**Status**: Production Ready
