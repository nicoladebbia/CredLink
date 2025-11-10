# Phase 27: Edge Signer Scope Definition

## What Edge Signing CAN Do (Safe Scope)
- ✅ Pre-hash + canonicalization in WASM module (Rust→WASM) inside Workers/Compute isolate
- ✅ SubtleCrypto: ECDSA (P-256) and Ed25519 via Workers WebCrypto implementation
- ✅ Run Rust C2PA code in WASM for manifest construction (not full x.509 CMS assembly)
- ✅ Remote sign over HTTPS to central signer/KMS/HSM, returning signature bytes
- ✅ Edge composes final manifest and stores sidecar (.c2pa) remotely

## What Edge Signing CANNOT Do (Hard Line)
- ❌ NEVER place production signing keys at edge (no secrets/Keypairs in env or KV)
- ❌ NO long-lived key material generated/extracted in edge isolates
- ❌ NO Cloudflare "Secrets" for production keys (treat as app secrets only)
- ❌ NO multi-tenant isolate custody for production keys

## Security Boundaries
- Edge isolates defend against known side-channels but we assume residual risk
- Production keys must remain in KMS/HSM, not in multi-tenant isolate
- Identical to Keyless SSL threat model - private key operations off-edge
