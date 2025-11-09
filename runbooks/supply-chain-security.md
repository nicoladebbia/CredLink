# Supply Chain Security Runbook

This runbook provides operational procedures for managing CredLink's supply chain security.

## Table of Contents

1. [Daily Operations](#daily-operations)
2. [Incident Response](#incident-response)
3. [Key Rotation](#key-rotation)
4. [Scanner Maintenance](#scanner-maintenance)
5. [Policy Management](#policy-management)
6. [Troubleshooting](#troubleshooting)

## Daily Operations

### 1. Monitor Build Pipeline

```bash
# Check recent build status
gh run list --repo Nickiller04/CredLink --limit 10

# Verify latest build artifacts
gh run view --repo Nickiller04/CredLink --log

# Check attestations for latest release
cosign attestations list ghcr.io/nickiller04/CredLink:latest
```

### 2. Verify Security Scans

```bash
# Check latest CVE scan results
trivy image --severity CRITICAL,HIGH ghcr.io/nickiller04/CredLink:latest

# Verify SBOM generation
./scripts/generate-sbom.sh ghcr.io/nickiller04/CredLink:latest ./sboms
./scripts/verify-sbom.sh ./sboms ghcr.io/nickiller04/CredLink:latest
```

### 3. Monitor Admission Control

```bash
# Check policy controller status
kubectl get pods -n cosign-system

# Check recent admission denials
kubectl logs -n cosign-system deployment/policy-controller --tail=100

# Verify active policies
kubectl get clusterimagepolicies
```

## Incident Response

### 1. Suspected Compromise

#### Detection
```bash
# Verify image signatures
cosign verify ghcr.io/nickiller04/CredLink:latest

# Check provenance attestation
cosign verify-attestation --type slsaprovenance ghcr.io/nickiller04/CredLink:latest

# Scan for unexpected vulnerabilities
trivy image --severity CRITICAL,HIGH,MEDIUM ghcr.io/nickiller04/CredLink:latest
```

#### Containment
```bash
# Block suspicious image
kubectl create imagepolicy block-suspicious --image "ghcr.io/nickiller04/CredLink:*" --block

# Scale down affected deployments
kubectl scale deployment CredLink --replicas=0

# Enable audit logging
kubectl patch clusterimagepolicy require-signed-and-provenance -p '{"spec":{"mode":"enforce"}}'
```

#### Investigation
```bash
# Check build provenance
cosign verify-attestation --type slsaprovenance ghcr.io/nickiller04/CredLink:suspicious-tag

# Compare with known good build
docker buildx imagetools inspect ghcr.io/nickiller04/CredLink:latest
docker buildx imagetools inspect ghcr.io/nickiller04/CredLink:suspicious-tag

# Check Rekor transparency log
cosign verify ghcr.io/nickiller04/CredLink:suspicious-tag --output-json | jq '.[0].logIndex'
```

#### Recovery
```bash
# Rebuild from clean source
git checkout <known-good-commit>
export SOURCE_DATE_EPOCH=$(git log -1 --format=%ct)
docker buildx build --build-arg SOURCE_DATE_EPOCH=$SOURCE_DATE_EPOCH -f Dockerfile.reproducible .

# Sign new image
cosign sign ghcr.io/nickiller04/CredLink:recovery

# Generate new attestations
./scripts/generate-sbom.sh ghcr.io/nickiller04/CredLink:recovery ./sboms
cosign attest --predicate-type sbom --predicate ./sboms/sbom.spdx.json ghcr.io/nickiller04/CredLink:recovery

# Update deployment
kubectl set image deployment/CredLink CredLink=ghcr.io/nickiller04/CredLink:recovery
```

### 2. CVE Outbreak

#### Assessment
```bash
# Scan all images in registry
trivy image --severity CRITICAL,HIGH --format json --output cve-scan.json ghcr.io/nickiller04/CredLink:*

# Analyze impact
jq '.Results[].Vulnerabilities[] | select(.Severity == "CRITICAL" or .Severity == "HIGH")' cve-scan.json
```

#### Response
```bash
# Check if vulnerable components are in runtime
kubectl exec -it deployment/CredLink -- dpkg -l | grep <vulnerable-package>

# Update dependencies
pnpm update
pnpm audit --fix

# Rebuild and redeploy
git commit -am "Security update: address CVE-XXXX-XXXX"
git push origin main
```

## Key Rotation

### 1. OIDC Identity Rotation

Since we use keyless signing, no static keys need rotation. However, OIDC identities can be updated:

```bash
# Update repository permissions
gh repo edit Nickiller04/CredLink --enable-oidc

# Update workflow permissions
gh api repos/Nickiller04/CredLink/actions/permissions/workflow -X PATCH -f '{"default_permissions":"write"}'
```

### 2. Policy Controller Rotation

```bash
# Update policy controller
kubectl set image deployment/policy-controller policy-controller=ghcr.io/sigstore/policy-controller:v0.8.2 -n cosign-system

# Restart to apply new configuration
kubectl rollout restart deployment/policy-controller -n cosign-system
```

### 3. Certificate Rotation

```bash
# Rotate webhook certificates
kubectl delete secret policy-controller-webhook-certs -n cosign-system
kubectl rollout restart deployment/policy-controller -n cosign-system
```

## Scanner Maintenance

### 1. Update Scanner Databases

```bash
# Update Trivy database
trivy image --download-db-only

# Update Grype database
grype db update

# Schedule automatic updates (cron job)
echo "0 2 * * * /usr/local/bin/trivy image --download-db-only" | crontab -
```

### 2. Validate Scanner Results

```bash
# Cross-validate scanners
trivy image ghcr.io/nickiller04/CredLink:latest --format json --output trivy-results.json
grype ghcr.io/nickiller04/CredLink:latest --output-json > grype-results.json

# Compare results
jq -r '.Results[].Vulnerabilities[].VulnerabilityID' trivy-results.json | sort > trivy-cves.txt
jq -r '.matches[].vulnerability.id' grype-results.json | sort > grype-cves.txt
diff trivy-cves.txt grype-cves.txt
```

### 3. Handle False Positives

```bash
# Add to .trivyignore
echo "CVE-2021-1234 # False positive, not used in runtime" >> .trivyignore

# Document justification
echo "CVE-2021-1234: This vulnerability exists in dev dependency only" >> docs/cve-exceptions.md
```

## Policy Management

### 1. Update Admission Policies

```bash
# Edit policy
kubectl edit clusterimagepolicy require-signed-and-provenance

# Validate policy syntax
kubectl get clusterimagepolicy require-signed-and-provenance -o yaml

# Test policy with dry run
kubectl run test-pod --image=ghcr.io/nickiller04/CredLink:latest --dry-run=client -o yaml
```

### 2. Break-Glass Procedures

```bash
# Temporarily disable policies for emergency
kubectl label namespace default policy.sigstore.dev/ignore=false

# Deploy emergency fix
kubectl apply -f emergency-fix.yaml

# Re-enable policies
kubectl label namespace default policy.sigstore.dev/ignore-
```

### 3. Policy Testing

```bash
# Test unsigned image rejection
kubectl run test-unsigned --image=nginx:latest --dry-run=client

# Should return admission denied error
```

## Troubleshooting

### 1. Signature Verification Failures

#### Issue: `cosign verify` fails
```bash
# Check if image exists
docker buildx imagetools inspect ghcr.io/nickiller04/CredLink:latest

# Check attestations
cosign attestations list ghcr.io/nickiller04/CredLink:latest

# Re-sign if necessary
cosign sign ghcr.io/nickiller04/CredLink:latest
```

#### Issue: Invalid certificate
```bash
# Check certificate details
cosign verify ghcr.io/nickiller04/CredLink:latest --insecure-skip-verify

# Verify issuer
cosign verify ghcr.io/nickiller04/CredLink:latest --certificate-oidc-issuer "https://token.actions.githubusercontent.com"
```

### 2. Attestation Failures

#### Issue: Missing SLSA provenance
```bash
# Check workflow status
gh run view --repo Nickiller04/CredLink

# Re-run attestations
gh workflow run build-sign-attest.yml --repo Nickiller04/CredLink
```

#### Issue: Invalid SBOM format
```bash
# Regenerate SBOM
./scripts/generate-sbom.sh ghcr.io/nickiller04/CredLink:latest ./sboms

# Validate format
jq empty ./sboms/sbom.spdx.json
jq empty ./sboms/sbom.cdx.json
```

### 3. Admission Control Issues

#### Issue: Policy controller not working
```bash
# Check controller logs
kubectl logs -n cosign-system deployment/policy-controller

# Check webhook configuration
kubectl get validatingwebhookconfigurations
kubectl get mutatingwebhookconfigurations

# Restart controller
kubectl rollout restart deployment/policy-controller -n cosign-system
```

#### Issue: Pods rejected unexpectedly
```bash
# Check policy details
kubectl describe clusterimagepolicy require-signed-and-provenance

# Check admission events
kubectl get events --field-selector type=Warning

# Test with specific image
cosign verify ghcr.io/nickiller04/CredLink:being-rejected
```

### 4. Build Failures

#### Issue: Reproducible build fails
```bash
# Check build environment
echo $SOURCE_DATE_EPOCH
docker buildx version

# Clean build cache
docker builder prune -f

# Rebuild with debug
docker buildx build --build-arg SOURCE_DATE_EPOCH=$SOURCE_DATE_EPOCH -f Dockerfile.reproducible --progress=plain .
```

#### Issue: CVE scan failures
```bash
# Update scanner database
trivy image --download-db-only

# Scan with detailed output
trivy image --severity CRITICAL,HIGH ghcr.io/nickiller04/CredLink:latest

# Check for false positives
echo "CVE-ID" >> .trivyignore
```

## Monitoring and Alerting

### 1. Key Metrics

- Build success rate
- Signature verification failures
- Admission denial rate
- CVE scan duration
- SBOM generation time

### 2. Alert Thresholds

```bash
# Build failures > 1/hour
# Signature verification failures > 5/hour
# Admission denials > 10/hour
# Critical CVEs found > 0
```

### 3. Dashboard Queries

```bash
# Recent build status
gh run list --repo Nickiller04/CredLink --limit 24 --json status,conclusion,createdAt

# Admission denials
kubectl get events --field-selector type=Warning --sort-by='.lastTimestamp' | tail -20

# Vulnerability trends
trivy image --format json ghcr.io/nickiller04/CredLink:latest | jq '.Results[].Vulnerabilities | length'
```

## Escalation Procedures

### 1. Security Incident

1. **Immediate**: Block affected images, scale down deployments
2. **Within 1 hour**: Complete investigation, identify root cause
3. **Within 4 hours**: Deploy patched version, update documentation
4. **Within 24 hours**: Post-incident review, update procedures

### 2. System Outage

1. **Immediate**: Check policy controller status, verify build pipeline
2. **Within 30 minutes**: Restore service, implement temporary fixes
3. **Within 2 hours**: Permanent fix deployed, monitoring enhanced

### 3. Contacts

- **Security Lead**: security@CredLink.com
- **On-call Engineer**: +1-555-SECURITY
- **GitHub Support**: https://support.github.com
- **Sigstore Community**: https://sigstore.dev/community

## Documentation Updates

After any incident or procedure change:

1. Update this runbook
2. Update `docs/trust-of-the-build.md`
3. Update `docs/reproducible-builds.md`
4. Create incident report in `docs/incidents/`
5. Update test cases if needed

---

**Last Updated**: 2025-11-02
**Version**: 1.0
**Review Frequency**: Monthly
**Next Review**: 2025-12-02
