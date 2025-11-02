# Phase 17: Ledger Anchors (Opt-In) - Architecture v1.1

## 1. Objectives & Scope

- **Merkle Rollups**: Weekly (Pro) / daily (Enterprise) per-tenant trees built from canonical SHA-256 manifest digests with deterministic ordering and CT-style duplication semantics. Persist roots and per-leaf audit paths.
- **Dual Anchoring Back-Ends**: Primary Bitcoin commitments via OpenTimestamps (OTS) calendars; secondary RFC 3161/5816 Time-Stamp Authority (TSA) tokens for conservative tenants or failure fallback.
- **Receipts & Proofs**: Immutable JSON (+ optional PDF) artifacts describing roots, parameters, attestations, and inclusion proofs. No manifest content leaves the boundary.
- **Privacy & Cost Guardrails**: Opt-in at plan level, rate-limited by tenant, anchored costs capped, kill-switch support.
- **Exit Readiness**: Scheduled anchors publish receipts, independent verification succeeds, opt-in/off flows audited, backfill scales with predictable cost ceilings.

## 2. Component Topology

### Applications (`apps/`)
- **`anchor/` (Fastify API)**  
  - `/anchor/plan`: surfaces next anchor window, cost estimates, counts.  
  - `/anchor/receipt/:tenant/:period`: immutable receipt retrieval (JSON/PDF).  
  - `/anchor/proof/:tenant/:period/:digest`: leaf proof retrieval.  
  - `/anchor/backfill` (admin): initiates backfill with manifest/hour + cost ceilings.  
  - Auth via tenant tokens; receipts/proofs publicly readable only if tenant opted-in.

- **`scheduler/`**  
  - Drives weekly/daily anchor jobs, backfill workers, and cost governors.  
  - Publishes anchoring outcomes to `anchor_ledger` with ES256-signed summaries.  
  - Manages kill-switch (e.g., OTS outage → TSA-only mode).

### Packages (`packages/`)
- **`merkle-core/` (Rust)**  
  - `canonical_json(manifest)` → canonical UTF-8 JSON with sorted keys.  
  - `sha256_digest(bytes)` with version tagging.  
  - `build_tree(leaves)` → root + node map with duplication flag.  
  - `generate_proof(digest)` → CT-style audit path, leaf index.  
  - Expose FFI bindings for Node consumers (napi-rs).

- **`ots-client/` (Node wrapper)**  
  - Stamp/upgrade flows via `ots` CLI calendars (`a.pool`, `b.pool`).  
  - Persists `.ots` proofs, tracks Bitcoin txid/block height, retries upgrades.  
  - Emits structured telemetry: latency, calendar status, commitment details.

- **`tsa-client/`**  
  - RFC 3161 requests over HTTPS with tenant-specific policy OIDs.  
  - Stores `.tsr` tokens, verifies via OpenSSL bindings (preflight).  
  - Handles CA bundle rotation and policy enforcement.

### Infrastructure (`infra/`)
- **R2 Buckets (`infra/r2/`)**:  
  - `roots/{tenant}/{period}.json`  
  - `proofs/{tenant}/{period}/{digest}.json`  
  - `receipts/{tenant}/{period}.{json|pdf}`  
  - Binary artifacts: `root.bin`, `root.ots`, `root.tsr` (versioning enabled).

- **KV Namespace**  
  - Last anchor pointers, idempotency keys, rate limiter counters per tenant.

- **`db/anchor_ledger`**  
  - Run metadata, ES256 signatures, consent_log (opt-in/off with signer).

### Documentation (`docs/anchoring/`)
- Threat model, privacy notes, verification guide (OTS/OpenSSL), runbooks (OTS outage, Bitcoin fee spikes, TSA rotation).

## 3. Data Flow (Weekly Example)

1. **Catalog Retrieval**  
   - Scheduler requests manifest digests for tenant + period from manifest store / analytics catalog.
2. **Canonicalization & Leaf Prep**  
   - `merkle-core` canonicalizes JSON, hashes to `sha256`, domain separates (`"c2c.manifest.v1|" + digest_hex`), sorts lexicographically, deduplicates w/ CT rules.
3. **Merkle Tree Construction**  
   - Persist root metadata:  
     ```json
     {
       "root": "c2c.merkle.v1:sha256:0x…",
       "tree_size": N,
       "parameters": {
         "hash_alg": "SHA-256",
         "leaf_prefix": "c2c.manifest.v1|",
         "pairing": "left-right",
         "dup_last": true
       },
       "canon_version": "c2c-1"
     }
     ```
   - Emit per-leaf proof files: leaf index, audit path.
4. **Anchoring**  
   - **OTS**:  
     - `stamp(root.bin)` → `.ots` placeholder (calendar commitments).  
     - Scheduler polls `upgrade()` until Bitcoin txid + block height available.  
     - Failover: queue upgrades, degrade to TSA-only if calendars unavailable.
   - **TSA**:  
     - `tsa-client` issues RFC 3161 query, stores `.tsr`, verifies signature using pinned CA bundle.  
     - Enforce tenant policy (Starter = TSA-only monthly; Pro = weekly dual; Enterprise = daily OTS + weekly TSA).
5. **Receipt Publication**  
   - Combine root metadata + attestations into immutable JSON receipt.  
   - Optional PDF rendering via templates.  
   - Store in R2 with versioning, set appropriate ACL (public or tenant-only).
6. **Ledger Logging**  
   - Sign run summary (ES256) including counts, coverage, costs, errors, toggles.  
   - Append to `anchor_ledger`, update `last_anchor` pointer in KV.

## 4. Governance & Safety

- **Opt-In Mechanics**:  
  - Plan-level defaults (Starter TSA monthly, Pro weekly dual, Enterprise daily+weekly).  
  - `consent_log` records activation/deactivation with signer, timestamp, reason; disabling halts new anchors but preserves history.

- **Rate & Cost Guards**:  
  - Per-tenant `max_roots_per_period`.  
  - Backfill throttle: manifests/hour limit, stop-gap if estimated cost exceeds ceiling.  
  - `cost governor` calculates estimated USD impact (OTS calendar usage + TSA per-token).  
  - Kill-switch toggles `plan=tsa-only` or `plan=paused`.

- **Privacy Posture**:  
  - Hash-only artifacts; manifests never leave storage.  
  - Tenants choose receipt visibility.  
  - Red-team review verifying zero PII in receipts/proofs/ledger.

## 5. Verification Pathways

- **OpenTimestamps / Bitcoin**  
  - Pull `root.ots`, `receipt.json`.  
  - Recompute Merkle root locally using `merkle-core` helper.  
  - Run `ots verify root.ots` against Bitcoin headers; confirm txid + block height match receipt.

- **RFC 3161**  
  - Fetch `root.tsr`.  
  - Execute `openssl ts -verify -data root.bin -in root.tsr -CAfile tsa_ca.pem -untrusted tsa_chain.pem`.  
  - success → timestamp attestation valid.

- **Random Sample Inclusion**  
  - Scheduler selects 25 digests per run, recomputes audit paths, checks equality with stored root.  
  - Failures escalate to incident channel + kill-switch evaluation.

## 6. Implementation Roadmap (Day 1–9 Alignment)

1. **Day 1 – Canon & Merkle**  
   - `merkle-core` crate scaffold, canonical JSON + hashing, tree builder, vectors.
2. **Day 2 – Proof Formats & Storage**  
   - JSON schemas, artifact writers, R2 integration contract tests.
3. **Day 3 – OTS Client**  
   - Calendar configuration, stamp/upgrade workflow, telemetry.
4. **Day 4 – TSA Client**  
   - RFC 3161 binding, OpenSSL verification tests, policy management.
5. **Day 5 – Receipts & API**  
   - Fastify routes, ES256 signing, PDF renderer.
6. **Day 6–9 – Backfill & Governance**  
   - Scheduler workers, consent toggles, kill-switch, cost governor, verification jobs.

## 7. Open Questions / Assumptions

- Need runtime decision on shipping Rust via napi-rs vs. wasm-bindgen; initial assumption: use `napi-rs` for parity with Node environment.
- Manifest catalog source interface pending (`packages/manifest-store` vs. analytics pipeline). Stub with provider interface for now.
- R2 + KV binding names to be allocated in infrastructure config; placeholders documented in `infra/r2/README.md` follow-up.

## 8. Deliverables Checklist Reference

- `packages/merkle-core` with vectors + domain separation.
- `packages/ots-client` with calendar config + upgrade flow.
- `packages/tsa-client` with RFC 5816 adherence + verification tests.
- Receipts/proofs artifacts + JSON schemas + PDF export pipeline.
- `/anchor/*` APIs, scheduler, cost governor, consent log, kill-switch.
- Backfill worker (rate/cost caps) + signed run summaries.
- Runbooks (OTS outage, Bitcoin fee spikes, TSA rotation).
- Customer docs (independent verification + positioning).

