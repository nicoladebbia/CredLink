# Phase 51 — Perceptual Collision Analytics (R&D Moat)

## Purpose (tight)
Detect look-alike assets with conflicting provenance—without claiming "truth." We compute perceptual hashes on signed assets, index them for approximate nearest-neighbor lookup, and flag collisions when two visually similar assets assert incompatible lineage (different parents/issuers). Reviewers get a side-by-side, tunable sensitivity, and explicit false-positive controls.

## What counts as a "collision"
A collision occurs when:
1. Similarity ≥ threshold by perceptual metric (e.g., Hamming distance on PDQ ≤ T₁, or L2 distance in an embedding index ≤ T₂)
2. Provenance incompatibility: different issuer key IDs or parent hashes in manifests; or mutually exclusive assertion sets

We never label content "fake." We only emit signals: "high-similarity visual match with incompatible provenance claims."

## Algorithm mix (robust, explainable, fast)

### Tier 1 — PDQ (binary, Hamming-distance)
- Use Meta's open PDQ (256-bit) for fast, explainable similarity
- Industry-standard for collaborative signal exchange
- Compare via Hamming distance with tunable threshold

### Tier 2 — aHash/dHash/pHash (optional ensemble)
- Classic perceptual hashes add diversity against edge cases
- Ensemble voting reduces single-algorithm brittleness

### Tier 3 — Dense vectors (optional)
- For hard cases (heavy crops/filters), compute compact image embeddings
- Search with ANN index (FAISS/HNSW)
- Captures semantics beyond strict pixel transforms

## Indexing & recall/latency targets
- PDQ → bitset/Hamming buckets
- Embeddings → FAISS IVF-PQ/HNSW; tune for recall≥0.95 @ p95 query <150 ms on 10⁶–10⁷ items
- GPU-FAISS when needed for billion-scale similarity search

## System architecture v1.1

### Ingest (async)
When a signed asset lands or updates:
1. Extract manifest lineage (issuer key, parent hash, asset_id)
2. Compute PDQ (and optional a/d/pHash)
3. Optionally compute embedding for Tier-3 matches
4. Upsert: {tenant_id, asset_id, manifest_lineage, pdq, hashes…, vec?, created_at} → ANN/Hash indexes

### Query (on verify / nightly jobs)
For each asset:
1. Retrieve K nearest candidates by PDQ (and vec if enabled)
2. Filter out same-lineage matches
3. Flag if any candidate conflicts lineage rules
4. Emit Collision record with similarity scores, provenance diffs, and links to side-by-side viewer

### Storage
- Hash tables (bitpacked), ANN index (FAISS/HNSW), collision log (append-only, WORM-eligible)

## Cross-tenant opt-in
If allowed, share PDQ only + minimal lineage fingerprints (issuer key ID, coarse timestamp bucket) via a signal-exchange table modeled after open PDQ ecosystems.

## Investigator UX (fast disposition)
- Side-by-side viewer (hover-diff, blink, split), similarity bars, and lineage diff
- Controls: Threshold slider (PDQ Hamming 0–256 with presets), World vs Tenant scope
- Labels: "Benign variant", "Suspicious", "Not similar" → feeds reviewer truth set

## Tunable sensitivity & false-positive control
- Start with validated thresholds from literature/corpora
- Maintain ROC curves per tenant domain (news vs e-commerce)
- Two knobs: PDQ distance cutoff and minimum manifest-field conflict set
- Optional two-stage confirm: PDQ shortlist → re-score with ANN → require both to exceed similarity thresholds

## Privacy & safety guardrails
- Hash-only signals by default; no PII stored or exchanged
- Cross-tenant sharing is opt-in and limited to PDQ + minimal lineage fields
- Loud UI disclaimers: signals, not judgments

## Quality bar & evaluation harness
- Datasets: curated set with pairs of (a) benign variants, (b) malicious look-alikes, (c) hard negatives
- Metrics: Precision@threshold, R-precision, ROC AUC, Reviewer time-to-disposition
- Target: 95th-percentile precision at a tolerable recall; reviewers clear collisions in <60 s p50

## Ops, scale, and cost
- Hot path: PDQ only; ANN invoked on demand (flagged assets, periodic sweeps)
- Indexes: shard by tenant, then global opt-in shard; HNSW or IVF-PQ per data volume
- Retention: keep hashes & collision logs ≥24 months (aligns with Compliance v2/WORM)
- Rebuilds: background FAISS re-training on distribution drift; PDQ tables are append-only

## APIs & events (minimal, sharp)
- POST /analytics/collisions/scan { asset_id | manifest_hash } → returns top-N potential collisions
- GET /analytics/collisions/:id → full record with reviewer labels
- Webhooks: collision.created, collision.resolved
- Egress: export hash-only feeds (PDQ, asset_id, issuer_key_id, ts_bucket) for customers' defense graphs

## Acceptance tests (exit)
- On a curated benchmark, achieve ≥95th-percentile precision at a tenant-agreed recall
- Reviewer TTD (time-to-disposition) p50 < 60 s with the side-by-side UI
- At least one cross-tenant opt-in cohort agrees to share PDQ hashes

## Risks → mitigations
- Privacy & chilling → Opt-in only, hash-only exchange, no end-user data, publish FAQ
- False positives → dual-threshold (PDQ+ANN) and "benign variant" reviewer label
- Scale/latency → FAISS/HNSW with GPU where needed; maintain separate hot (PDQ) and warm (ANN) tiers

## R&D backlog (moat hardening)
- PHASER-style evaluations to compare hash families on internal corpora (quarterly)
- Ensemble learning over PDQ+a/d/pHash to auto-tune thresholds per tenant vertical
- LSH-APG hybrids for faster incremental updates where graphs are costly to rebuild

## Why this works (one line)
Perceptual hashing + ANN lets us flag visual look-alikes at scale, PDQ gives explainable distances and hash-only sharing, and the UI makes reviewers fast—delivering fraud-investigation value without turning us into arbiters of truth.
