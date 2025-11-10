# merkle-core

Canonical manifest digest + Merkle tree builder used by the Ledger Anchors phase.

## Capabilities

- Canonicalizes manifest JSON (`c2c-1` rules: UTF-8, sorted keys, no insignificant whitespace).
- Computes SHA-256 digests and domain-separated leaf hashes (`"c2c.manifest.v1|" + digest_hex`).
- Builds CT-style Merkle trees (duplicate-last semantics) with deterministic ordering.
- Generates inclusion proofs suitable for receipts (`audit_path` siblings, leaf indices).

## Structure

- `canonical.rs` — canonical JSON + digest helpers.
- `merkle.rs` — tree builder, summary metadata, proof generation.
- `proof.rs` — proof structures and hex helpers.

## Development

```bash
cargo test
```

> NOTE: The workspace currently lacks Rust toolchain bootstrap in CI. Install `rustup` locally and ensure `cargo test` passes before merging.

## Next Steps

- Expose napi-rs bindings for Node consumers.
- Benchmark large tenant batches.
- Integrate with anchoring scheduler + receipt writers.
