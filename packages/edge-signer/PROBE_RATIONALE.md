# Phase 27: Why This is a Probe, Not a Product

## Core Distinction: Latency vs Custody

### What Edge Routines Excel At
- **Latency Optimization**: Geographic proximity to users
- **Compute Efficiency**: Parallel processing capabilities
- **Bandwidth Savings**: Local data processing
- **Scalability**: Elastic scaling with demand

### What Edge Routines Cannot Replace
- **Key Custody**: Production signing keys require HSM-level security
- **Trust Boundaries**: Certificate chains and PKI infrastructure
- **Compliance Requirements**: Regulatory constraints on key storage
- **Long-term Security**: Key rotation and lifecycle management

## C2PA Spec Compliance Reality

### Signature & Chain Requirements
- **Algorithm Support**: ES256/EdDSA signatures with proper curves
- **Certificate Chains**: X.509 chain validation and trust anchors
- **Timestamp Authority**: RFC3161 TSA integration
- **Manifest Structure**: JUMBF box hierarchy and validation

### Custody Model Limitations
- **Spec Guidance**: C2PA recommends algorithms but leaves custody to implementer
- **Provider Constraints**: Edge providers cannot offer HSM-equivalent security
- **Multi-tenant Risk**: Shared infrastructure increases attack surface
- **Regulatory Compliance**: Many jurisdictions require physical key security

## Tooling Maturity Assessment

### c2pa-rs WASM Capabilities
```rust
// What works in WASM
✅ Canonicalization (JUMBF box structure)
✅ Digest computation (SHA-256, SHA-512)
✅ TBS (To-Be-Signed) byte preparation
✅ Manifest assembly (post-signature)

// What requires host capabilities
❌ Private key operations (signing)
❌ Certificate chain building
❌ TSA token generation
❌ Hardware security module integration
```

### @contentauth/c2pa-web Limitations
- **Browser Focus**: Designed for client-side verification
- **Key Management**: No production key custody
- **Provider Dependencies**: Relies on external signing services
- **Feature Gaps**: Some signing workflows unsupported

## Security Model Constraints

### Edge Isolate Security Properties
- **Memory Isolation**: WASM sandbox provides process isolation
- **Network Restrictions**: Controlled outbound connectivity
- **Execution Limits**: CPU and memory constraints
- **Tenant Separation**: Multi-tenant architecture

### Residual Risks for Production Keys
- **Side-Channel Attacks**: Timing, cache, and speculative execution
- **Memory Scraping**: Potential for memory disclosure
- **Provider Access**: Cloud provider administrative access
- **Compliance Gaps**: Lack of FIPS/HSM certification

## Cost-Benefit Analysis

### Performance Benefits
- **RTT Reduction**: 60-80% bandwidth savings for tiny assets
- **Latency Improvement**: 25-40% p95 reduction for ≤16 KiB payloads
- **Geographic Optimization**: Smart placement reduces KMS RTT
- **Scalability**: Edge scaling handles burst traffic

### Security Costs
- **Key Exposure Risk**: Unacceptable for production keys
- **Compliance Burden**: Additional audit and validation requirements
- **Operational Complexity**: Multi-environment key management
- **Insurance Implications**: Higher premiums for edge custody

## Production Readiness Gap

### Current State (Probe)
- **Prototype Implementation**: WASM + remote signing pattern
- **Limited Scope**: Tiny assets only (≤16 KiB)
- **Experimental Features**: Ed25519, Smart Placement
- **Feature Flagged**: Disabled by default

### Production Requirements
- **Enterprise Security**: HSM-level key custody
- **Full Asset Support**: Unlimited size and complexity
- **Compliance Certification**: SOC2, ISO27001, FedRAMP
- **SLA Guarantees**: 99.9% availability and performance

## Decision Framework

### Go-to-Production Criteria
1. **Security**: Zero production keys at edge (non-negotiable)
2. **Performance**: ≥25% improvement for target workloads
3. **Cost**: ≤10% increase vs central path
4. **Stability**: <0.1% error rate with functional fallback
5. **Compliance**: All regulatory requirements met

### Probe Success Definition
- **Technical Feasibility**: Edge-assisted signing works reliably
- **Performance Validation**: Measurable latency improvements
- **Security Validation**: No key custody violations
- **Operational Learning**: Deployment and monitoring experience

## Archive vs Product Decision

### Archive Triggers
- Performance improvement <20%
- Cost increase >15%
- Security concerns identified
- Operational complexity too high

### Product Path Requirements
- New security model for edge custody
- Provider partnership for HSM-equivalent security
- Regulatory approval for edge key storage
- Customer demand for edge-optimized signing

## Strategic Positioning

### Probe Value
- **Learning**: Edge computing capabilities and limitations
- **Innovation**: New patterns for distributed signing
- **Optimization**: Performance improvements for specific use cases
- **Future-Proofing**: Preparation for edge security evolution

### Product Reality
- **Market Fit**: Niche requirement for ultra-low latency signing
- **Competitive Advantage**: Edge computing differentiation
- **Investment Priority**: Higher ROI for central signing improvements
- **Risk Profile**: Conservative approach to key custody preferred

## Conclusion

This probe is intentionally bounded to answer specific questions:
1. **Can edge computing improve signing latency?** (Technical feasibility)
2. **What are the security boundaries for edge-assisted signing?** (Risk assessment)
3. **Is there a viable product within these constraints?** (Business validation)

The probe is NOT a product because:
- Production key custody at edge remains unacceptable
- Tooling support for edge-only signing is incomplete
- Compliance requirements favor central signing
- Market demand does not justify security trade-offs

Success in this probe provides valuable insights for future edge computing initiatives while maintaining our security-first approach to key management.
