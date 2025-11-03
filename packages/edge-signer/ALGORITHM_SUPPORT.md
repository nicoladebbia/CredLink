# Phase 27: Algorithm Support Matrix

## C2PA Signing Recommendations
- **ES256 (P-256)**: Preferred for production parity across providers
- **EdDSA (Ed25519)**: Acceptable, experimental only
- **PS256**: RSA option, not preferred for performance

## Runtime Support Analysis

### Cloudflare Workers WebCrypto
- ✅ ECDSA (P-256) - Fully supported
- ✅ Ed25519 - Supported (non-standard but available in Workers)
- ✅ SubtleCrypto.sign() - Fast and available

### KMS/HSM Support
| Provider | ES256 | Ed25519 | Notes |
|----------|-------|---------|-------|
| AWS KMS | ✅ Rock-solid | ❌ Inconsistent | Use Sign API |
| Google Cloud KMS | ✅ ECDSA family | ✅ PureEdDSA (2024) | Labs only |
| Azure Key Vault | ✅ ES256/384/512 | ❌ Not supported | Broad support |

## Decision Matrix
- **Production Standard**: ES256 via provider KMS/HSM (cross-cloud simplicity)
- **Experimental**: Ed25519 with Workers WebCrypto + GCP KMS (lab only)
- **Security Baseline**: All signatures must be KMS/HSM-backed
