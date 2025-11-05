# Phase 47: 30-Second Demo Script

## Opening Statement
"Here are the same images through three paths—strip, preserve-embed, remote. Watch what survives."

## Click 1 — Strip Path (Optimizer ON)
**Action**: Show asset failing verification (no manifest)
**Narration**: "Optimizers strip metadata by default."
**Proof**: Link to CAI Verify with failing verdict
**Reference**: Content Authenticity Initiative

## Click 2 — Preserve-Embed Path  
**Action**: Enable vendor's "Preserve Content Credentials" (when supported)
**Narration**: "Even when some preserve, it's brittle."
**Proof**: Show intermittent pass across transforms
**Reference**: The Cloudflare Blog

## Click 3 — Remote Path
**Action**: Reload same asset with Link: rel="c2pa-manifest" header set
**Narration**: "Remote manifests are in the C2PA spec; we add the Link header and your proof survives across CDNs, themes, and resizes."
**Proof**: Verify passes regardless of transforms. Display the C2PA clause that defines remote discovery via HTTP Link.
**Close**: "CAI's Verify confirms it live."
**Reference**: C2PA Specification

## Complete Narration (20 seconds)
"Optimizers strip metadata by default. Even when some preserve, it's brittle. Remote manifests are in the C2PA spec; we add the Link header and your proof survives across CDNs, themes, and resizes. CAI's Verify confirms it live."

## Why It Lands
- Cloudflare publicly supports "Preserve Content Credentials"
- CAI Verify is a neutral destination your buyer trusts
- References: The Cloudflare Blog, C2PA Specification, Content Authenticity Initiative
