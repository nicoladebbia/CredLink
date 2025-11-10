# Phase 27: Edge-Assisted Signing Architecture

## Runtime Stack
- **Primary**: Cloudflare Workers
- **Portable**: Fastly Compute, Vercel Edge (with adaptations)

## Flow Per Asset
1. **Edge Worker** receives `/edge-sign` request with:
   - Asset digest + manifest template
   - OR tiny asset read directly from R2

2. **WASM Module (Rust)**:
   - Canonicalizes C2PA claimset (JUMBF boxes)
   - Computes digests
   - Prepares TBS (To-Be-Signed) bytes
   - Uses c2pa crate in WASM mode for structure

3. **Central Signer API**:
   - Colocated with KMS/HSM (AWS/GCP/Azure region)
   - Calls cloud KMS Sign (ES256)
   - Returns signature + cert chain + TSA token

4. **Edge Assembly**:
   - Assembles final C2PA manifest (WASM)
   - Writes sidecar to R2/S3
   - Injects `Link: rel="c2pa-manifest"` header
   - Returns manifest_url to upstream

5. **Smart Placement**:
   - Pins Worker near signer region for repeated operations
   - Minimizes KMS RTT

## Security Model
- **Identical to Keyless SSL**: Private key operations off-edge
- **Edge Role**: Data preparation and orchestration only
- **Key Custody**: Never leaves KMS/HSM boundary

## Performance Benefits
- **RTT Savings**: Edge ships hundreds of bytes, not whole asset
- **Local Processing**: Digest/canonicalization at edge
- **Remote Signing**: Only signature operation centrally
