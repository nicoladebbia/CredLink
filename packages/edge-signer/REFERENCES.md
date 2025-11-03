# Phase 27: Load-Bearing References

## Cloudflare Workers Documentation

### Web Crypto & Ed25519 Support
- **Primary Source**: [Cloudflare Workers WebCrypto API](https://developers.cloudflare.com/workers/runtime-apis/webcrypto/)
- **Ed25519 Documentation**: [WebCrypto Algorithm Support](https://developers.cloudflare.com/workers/runtime-apis/webcrypto/#algorithm-support)
- **Implementation Notes**: Workers supports Ed25519 via WebCrypto, though non-standard in some runtimes

### WASM in Workers
- **WASM Module Guide**: [WebAssembly in Workers](https://developers.cloudflare.com/workers/runtime-apis/webassembly/)
- **Module Imports**: [ES Module Imports](https://developers.cloudflare.com/workers/learning/how-workers-works/#es-modules)
- **Memory Management**: [WASM Memory Limits](https://developers.cloudflare.com/workers/learning/how-workers-works/#memory-limits)

### Workers Limits & CPU
- **CPU Time Limits**: [Workers CPU Limits](https://developers.cloudflare.com/workers/platform/limits/#cpu-time)
- **Memory Limits**: [Workers Memory Limits](https://developers.cloudflare.com/workers/platform/limits/#memory)
- **Request Limits**: [Workers Request Limits](https://developers.cloudflare.com/workers/platform/limits/#requests)

### Smart Placement
- **Smart Placement Docs**: [Compute Smart Placement](https://developers.cloudflare.com/workers/learning/how-workers-works/#smart-placement)
- **Placement Algorithm**: [How Smart Placement Works](https://blog.cloudflare.com/smart-placement/)
- **Configuration**: [Placement Configuration](https://developers.cloudflare.com/workers/configuration/smart-placement/)

## Security & Architecture

### Keyless Custody Pattern
- **Cloudflare Keyless SSL**: [Keyless SSL Architecture](https://www.cloudflare.com/ssl/keyless-ssl/)
- **Security Model**: [Keyless Security Benefits](https://blog.cloudflare.com/keyless-ssl-the-solution-to-a-saas-security-problem/)
- **Implementation Guide**: [Keyless SSL Technical Details](https://www.cloudflare.com/ssl/ssl-tls/#keyless-ssl)

### Workers Security Model
- **Isolation Boundaries**: [Workers Security Model](https://developers.cloudflare.com/workers/platform/security/)
- **Side-Channel Protections**: [Workers Side-Channel Defenses](https://blog.cloudflare.com/explaining-cloudflare-workers-security-model/)
- **Memory Safety**: [Workers Memory Isolation](https://developers.cloudflare.com/workers/learning/how-workers-works/#memory-isolation)

## C2PA Specification & Guidance

### C2PA Technical Specifications
- **Official Specification**: [C2PA Specification v2.0](https://c2pa.org/specification/)
- **Signing Guidelines**: [C2PA Signing Recommendations](https://c2pa.org/guidance/signing/)
- **Algorithm Support**: [C2PA Algorithm Guidance](https://c2pa.org/guidance/algorithms/)

### Algorithm Standards
- **ES256 (P-256)**: [NIST Recommended Curves](https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.186-4.pdf)
- **Ed25519**: [RFC 8032 - EdDSA](https://tools.ietf.org/html/rfc8032)
- **ES256 vs Ed25519**: [C2PA Algorithm Comparison](https://c2pa.org/guidance/algorithms/#comparison)

## Rust & WASM Implementation

### c2pa-rs WASM Support
- **c2pa-rs Repository**: [GitHub - contentauth/c2pa-rs](https://github.com/contentauth/c2pa-rs)
- **WASM Compilation**: [WASM Build Instructions](https://github.com/contentauth/c2pa-rs/blob/main/README.md#wasm-support)
- **WASM Limitations**: [Known WASM Limitations](https://github.com/contentauth/c2pa-rs/blob/main/WASM_LIMITATIONS.md)

### @contentauth/c2pa-web
- **Web Package**: [c2pa-web on npm](https://www.npmjs.com/package/@contentauth/c2pa-web)
- **Browser Support**: [c2pa-web Documentation](https://github.com/contentauth/c2pa-rs/tree/main/packages/c2pa-web)
- **API Reference**: [c2pa-web API Docs](https://contentauth.github.io/c2pa-rs/packages/c2pa-web/)

## Cloud Provider KMS Documentation

### AWS KMS
- **Sign API Documentation**: [AWS KMS Sign](https://docs.aws.amazon.com/kms/latest/APIReference/API_Sign.html)
- **ES256 Support**: [AWS KMS Elliptic Curve Keys](https://docs.aws.amazon.com/kms/latest/developerguide/symmetric-asymmetric.html)
- **Quotas and Limits**: [AWS KMS Limits](https://docs.aws.amazon.com/kms/latest/developerguide/limits.html)
- **Regional Endpoints**: [AWS KMS Endpoints](https://docs.aws.amazon.com/general/latest/gr/kms.html)

### Google Cloud KMS
- **Cloud KMS Documentation**: [Cloud KMS Overview](https://cloud.google.com/kms/docs)
- **Ed25519 Support**: [Asymmetric Signatures](https://cloud.google.com/kms/docs/algorithms#asymmetric_signatures)
- **Quotas and Pricing**: [KMS Quotas](https://cloud.google.com/kms/quotas)
- **Regional Considerations**: [KMS Locations](https://cloud.google.com/kms/docs/locations)

### Azure Key Vault
- **Key Vault Documentation**: [Azure Key Vault Overview](https://docs.microsoft.com/en-us/azure/key-vault/)
- **ES256 Support**: [Key Vault Algorithms](https://docs.microsoft.com/en-us/azure/key-vault/keys/about-keys#algorithm-support)
- **Limits and Quotas**: [Key Vault Limits](https://docs.microsoft.com/en-us/azure/azure-resource-manager/management/azure-subscription-service-limits#key-vault-limits)
- **Regional Availability**: [Key Vault Regions](https://docs.microsoft.com/en-us/azure/key-vault/general/overview#region-availability)

## Performance & Optimization

### Cloudflare Performance
- **Workers Performance**: [Workers Performance Guide](https://developers.cloudflare.com/workers/learning/how-workers-works/#performance)
- **CPU Time Optimization**: [Optimizing CPU Usage](https://blog.cloudflare.com/workers-optimizing-cpu-usage/)
- **Network Performance**: [Workers Network Performance](https://developers.cloudflare.com/workers/learning/how-workers-works/#networking)

### Smart Placement Deep Dive
- **Smart Placement Blog**: [Introducing Smart Placement](https://blog.cloudflare.com/smart-placement/)
- **Placement Algorithm**: [How Smart Placement Works](https://blog.cloudflare.com/how-smart-placement-works/)
- **Performance Impact**: [Smart Placement Performance](https://blog.cloudflare.com/smart-placement-performance/)

## Alternative Edge Providers

### Fastly Compute
- **Compute@Edge Documentation**: [Fastly Compute@Edge](https://docs.fastly.com/products/compute-at-edge)
- **WASM Runtime**: [Fastly WASM Support](https://docs.fastly.com/products/compute-at-edge/wasm)
- **JavaScript SDK**: [Fastly JS SDK](https://github.com/fastly/js-compute-runtime)
- **Performance Limits**: [Compute Limits](https://docs.fastly.com/products/compute-at-edge/limits)

### Vercel Edge Functions
- **Edge Functions Docs**: [Vercel Edge Functions](https://vercel.com/docs/concepts/functions/edge-functions)
- **WebCrypto Support**: [Edge Runtime WebCrypto](https://github.com/vercel/vercel/tree/main/packages/edge-runtime)
- **Secure Curves Tracking**: [Ed25519 Support Issue](https://github.com/vercel/vercel/issues/8592)
- **Region Configuration**: [Edge Functions Regions](https://vercel.com/docs/concepts/functions/edge-functions#regions)

## Security & Compliance

### RFC3161 Timestamp Authority
- **RFC3161 Specification**: [Time-Stamp Protocol](https://tools.ietf.org/html/rfc3161)
- **TSA Implementation**: [DigiCert TSA](https://www.digicert.com/time-stamp-protocol/)
- **Cloudflare TSA**: [Cloudflare TSA Service](https://www.cloudflare.com/time-stamp-protocol/)

### Supply Chain Security
- **Sigstore Documentation**: [Sigstore.org](https://www.sigstore.dev/)
- **SRI (Subresource Integrity)**: [MDN SRI Guide](https://developer.mozilla.org/en-US/docs/Web/Security/Subresource_Integrity)
- **WASM Security**: [WASM Security Model](https://webassembly.org/docs/security/)

## Monitoring & Observability

### Cloudflare Analytics
- **Workers Analytics**: [Workers Analytics Engine](https://developers.cloudflare.com/workers/analytics/)
- **Real-time Metrics**: [Real-time Analytics](https://developers.cloudflare.com/analytics/)
- **Cost Tracking**: [Workers Cost Analytics](https://developers.cloudflare.com/workers/platform/pricing/)

### Performance Monitoring
- **Latency Measurement**: [Workers Performance Monitoring](https://developers.cloudflare.com/workers/learning/how-workers-works/#monitoring)
- **Error Tracking**: [Workers Error Handling](https://developers.cloudflare.com/workers/learning/how-workers-works/#error-handling)
- **Circuit Breaker Pattern**: [Circuit Breaker Implementation](https://martinfowler.com/bliki/CircuitBreaker.html)

## Standards & Protocols

### HTTP Standards
- **HTTP/1.1 RFC**: [RFC 2616](https://tools.ietf.org/html/rfc2616)
- **HTTP/2 RFC**: [RFC 7540](https://tools.ietf.org/html/rfc7540)
- **Link Header RFC**: [RFC 5988](https://tools.ietf.org/html/rfc5988)

### Cryptographic Standards
- **FIPS 186-4**: [Digital Signature Standard](https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.186-4.pdf)
- **RFC 7515**: [JWS (JSON Web Signature)](https://tools.ietf.org/html/rfc7515)
- **RFC 7518**: [JWA (JSON Web Algorithms)](https://tools.ietf.org/html/rfc7518)

## Implementation Examples

### Cloudflare Workers Examples
- **WASM Module Example**: [Workers WASM Example](https://github.com/cloudflare/workers-sdk/blob/main/examples/wasm/)
- **WebCrypto Example**: [Workers WebCrypto Example](https://github.com/cloudflare/workers-sdk/blob/main/examples/webcrypto/)
- **Smart Placement Example**: [Smart Placement Config](https://github.com/cloudflare/workers-sdk/blob/main/examples/smart-placement/)

### Edge Computing Patterns
- **Edge-Assisted Processing**: [Edge Processing Patterns](https://patterns.edgecompute.org/)
- **Durable Objects**: [Durable Objects Documentation](https://developers.cloudflare.com/workers/learning/using-durable-objects/)
- **Rate Limiting**: [Workers Rate Limiting](https://developers.cloudflare.com/workers/examples/rate-limiting/)

## Executive & Business References

### Cloudflare Company Resources
- **Keyless SSL Whitepaper**: [Cloudflare Keyless SSL](https://www.cloudflare.com/whitepapers/keyless-ssl/)
- **Workers Security Blog**: [Workers Security Model](https://blog.cloudflare.com/explaining-cloudflare-workers-security-model/)
- **Edge Computing Strategy**: [Cloudflare Edge Vision](https://www.cloudflare.com/edge-computing/)

### Industry Analysis
- **Edge Computing Market**: [Gartner Edge Computing Analysis](https://www.gartner.com/en/information-technology/insights/edge-computing)
- **WASM Adoption**: [WASM in Production](https://wasm-by-example.dev/)
- **C2PA Industry Adoption**: [C2PA Adoption Stories](https://c2pa.org/adoption/)

## Tooling & Development

### Rust Toolchain
- **Rust WASM Guide**: [Rust and WebAssembly Book](https://rustwasm.github.io/docs/book/)
- **wasm-pack**: [wasm-pack Documentation](https://rustwasm.github.io/wasm-pack/)
- **wasm-bindgen**: [wasm-bindgen Guide](https://rustwasm.github.io/wasm-bindgen/)

### Testing & Validation
- **Workers Testing**: [Workers Testing Guide](https://developers.cloudflare.com/workers/learning/testing-workers/)
- **Performance Testing**: [Load Testing Edge Functions](https://developers.cloudflare.com/workers/learning/how-workers-works/#testing)
- **Security Testing**: [Workers Security Testing](https://developers.cloudflare.com/workers/platform/security/)

## Quick Reference Links

### Essential Documentation
- [Cloudflare Workers WebCrypto](https://developers.cloudflare.com/workers/runtime-apis/webcrypto/)
- [c2pa-rs WASM Support](https://github.com/contentauth/c2pa-rs#readme)
- [AWS KMS Sign API](https://docs.aws.amazon.com/kms/latest/APIReference/API_Sign.html)
- [Smart Placement](https://developers.cloudflare.com/workers/configuration/smart-placement/)
- [Keyless SSL Security](https://www.cloudflare.com/ssl/keyless-ssl/)
- [C2PA Specification](https://c2pa.org/specification/)

### Performance References
- [Workers CPU Limits](https://developers.cloudflare.com/workers/platform/limits/#cpu-time)
- [Smart Placement Performance](https://blog.cloudflare.com/smart-placement-performance/)
- [KMS Quotas and Limits](https://docs.aws.amazon.com/kms/latest/developerguide/limits.html)

### Security References
- [Workers Security Model](https://developers.cloudflare.com/workers/platform/security/)
- [WASM Security](https://webassembly.org/docs/security/)
- [Sigstore Documentation](https://www.sigstore.dev/)

These references provide the technical foundation for the Edge Signer probe and ensure all implementation decisions are based on authoritative documentation and industry best practices.
