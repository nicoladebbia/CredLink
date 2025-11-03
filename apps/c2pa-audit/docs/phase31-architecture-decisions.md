# Phase 31 — Stream Manifests v2 (Ads/SCTE) - Architecture Decisions

## Purpose
Make ad-stitched HLS/DASH streams provable end-to-end: program and ad segments each verify to the right issuer & manifest, with ABR and seeks never breaking the badge.

## A) Hard Decisions (LOCKED)

### 1. Reference Player Priority
- **PRIMARY**: HLS + hls.js on web
- **SECONDARY**: DASH/shaka to be added later
- **RATIONALE**: hls.js exposes ID3/DATERANGE reliably; shaka's HLS metadata is inconsistent

### 2. Signal Source of Truth
- **HLS**: SCTE-35 → #EXT-X-DATERANGE mapping
- **LEGACY**: Honor CUE-OUT/CUE-IN where present
- **DASH**: EventStream/SCTE-214 profile

### 3. Manifest Model
- **Program**: Standard C2PA manifest (embedded in init or remote Link: rel="c2pa-manifest")
- **Ads**: Separate C2PA manifest per ad (own issuer path)
- **Binding**: Player binds segments via remote "range index" keyed by HLS/DASH ad markers

### 4. Verification Cadence
- **Boundaries**: Verify boundaries & first segment in a range
- **Sampling**: Every Nth segment (default N=3)
- **Events**: On ABR switch
- **Caching**: Cache per-range verdicts

### 5. Remote-First Strategy
- **Default**: Remote manifests for encoders/CDNs that strip embed
- **Edge Relay**: Use Phase 14 Edge Relay for CORS/CSP safety
- **Fallback**: Embed when truly control fMP4 init

## Status: LOCKED - No further changes permitted
