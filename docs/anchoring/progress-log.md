# Ledger Anchors Phase — Progress Log

## Current Snapshot (2025-11-02)

- ✅ `packages/merkle-core` scaffolded (Rust)  
  - Canonical JSON (`c2c-1`) + SHA-256 digest helpers  
  - Domain-separated leaf hashing (`c2c.manifest.v1|`)  
  - Deterministic Merkle tree builder (CT duplication semantics)  
  - Inclusion proof structures + golden test vectors
- ✅ Architecture baseline captured in `docs/anchoring/architecture.md`

## Testing

- Rust unit tests defined (`cargo test`) but **not executed** in this workspace due to missing Rust toolchain (`rustc` not installed).  
  - Action: install `rustup` + run `cargo test` before merging.

## Open Work (per Phase 17 checklist)

1. `packages/ots-client` — OTS stamp/upgrade flow + telemetry.
2. `packages/tsa-client` — RFC 3161 bindings + OpenSSL verification harness.
3. Artifact writers (`roots/`, `proofs/`, `receipts/` JSON & PDF) + schemas.
4. `apps/anchor` Fastify API + ES256 receipt signing.
5. Scheduler/backfill workers + cost governor, consent log, kill-switch plumbing.
6. Docs/runbooks: outage response, verification guide, privacy notes.
7. CI integration for Rust build/test (napi-rs bindings TBD).

## Next Steps

1. Add napi-rs bindings to expose `merkle-core` into the Node ecosystem.
2. Implement artifact persistence contract with Cloudflare R2 (versioned).
3. Draft JSON schema definitions for receipts/proofs ahead of API wiring.
