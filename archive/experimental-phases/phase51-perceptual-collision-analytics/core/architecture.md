# Phase 51 — System Architecture v1.1

## Core Components

### 1. Perceptual Hash Engine
```typescript
interface PerceptualHashEngine {
  computePDQ(image: Buffer): Promise<PDQHash>;
  computeEnsembleHashes(image: Buffer): Promise<EnsembleHashes>;
  computeEmbedding(image: Buffer): Promise<DenseEmbedding>;
  comparePDQ(hash1: PDQHash, hash2: PDQHash): HammingDistance;
  compareEmbeddings(vec1: DenseEmbedding, vec2: DenseEmbedding): CosineSimilarity;
}
```

### 2. Indexing Layer
```typescript
interface CollisionIndex {
  upsertHash(record: HashRecord): Promise<void>;
  upsertEmbedding(record: EmbeddingRecord): Promise<void>;
  queryPDQ(hash: PDQHash, threshold: number, limit: number): Promise<Candidate[]>;
  queryEmbeddings(vec: DenseEmbedding, threshold: number, limit: number): Promise<Candidate[]>;
  deleteByAssetId(assetId: string): Promise<void>;
}
```

### 3. Lineage Analyzer
```typescript
interface LineageAnalyzer {
  extractLineage(manifest: C2PAManifest): ManifestLineage;
  hasConflictingClaims(lineage1: ManifestLineage, lineage2: ManifestLineage): boolean;
  getConflictType(lineage1: ManifestLineage, lineage2: ManifestLineage): ConflictType;
  filterSameLineage(candidates: Candidate[], queryLineage: ManifestLineage): Candidate[];
}
```

### 4. Collision Detector
```typescript
interface CollisionDetector {
  detectCollisions(asset: SignedAsset, config: DetectionConfig): Promise<Collision[]>;
  validateCollision(collision: Collision): Promise<boolean>;
  rankCollisions(collisions: Collision[]): Promise<RankedCollision[]>;
}
```

### 5. Storage Schema
```typescript
interface HashRecord {
  tenant_id: string;
  asset_id: string;
  manifest_lineage: ManifestLineage;
  pdq_hash: PDQHash; // 256-bit binary
  ensemble_hashes?: EnsembleHashes;
  embedding_id?: string; // Reference to embedding in ANN index
  created_at: Date;
  updated_at: Date;
}

interface CollisionRecord {
  id: string;
  tenant_id: string;
  primary_asset_id: string;
  conflicting_asset_id: string;
  similarity_scores: SimilarityScores;
  conflict_type: ConflictType;
  lineage_diff: LineageDiff;
  reviewer_label?: ReviewerLabel;
  created_at: Date;
  resolved_at?: Date;
}

interface SimilarityScores {
  pdq_hamming_distance: number;
  pdq_similarity: number; // 0-1
  ensemble_similarity?: number;
  embedding_similarity?: number;
  combined_score: number;
}
```

## Data Flow Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Asset Ingest   │───▶│  Hash Computation │───▶│   Index Update   │
│   (Async Queue)  │    │   (Multi-tier)    │    │  (PDQ + ANN)     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │                        │
                                ▼                        ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Lineage        │    │   Collision       │    │   Storage        │
│   Extraction     │    │   Detection       │    │   Layer          │
│   (C2PA Parse)   │    │   (Query + Filter)│    │   (WORM)         │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │                        │
                                ▼                        ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Reviewer UI    │◀───│   Collision       │◀───│   Signal         │
│   (Side-by-side) │    │   Records         │    │   Exchange       │
│   (Fast TTD)     │    │   (Append-only)   │    │   (Opt-in)       │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Performance Targets

### Latency Requirements
- PDQ computation: <50ms p95 for images ≤10MB
- Embedding computation: <200ms p95 (GPU enabled)
- PDQ query: <10ms p95 for 10M index
- Embedding query: <150ms p95 for 10M index
- End-to-end collision detection: <500ms p95

### Throughput Requirements
- Ingest pipeline: 10,000 assets/minute
- Query pipeline: 1,000 collision checks/minute
- Concurrent reviewers: 100 active investigators

### Storage Requirements
- PDQ hashes: 32 bytes/asset + metadata
- Embeddings: 512-1024 bytes/asset (compressed)
- Collision records: ~1KB/collision
- Index overhead: ~2x data size for FAISS

## Scaling Strategy

### Horizontal Scaling
- Shard indexes by tenant_id
- Separate hot (PDQ) and warm (ANN) tiers
- Auto-scaling compute for hash generation
- Read replicas for query load

### Vertical Scaling
- GPU acceleration for embedding computation
- Memory-mapped indexes for PDQ lookup
- SSD storage for ANN index files
- Optimized bit-packing for hash storage

### Multi-Region Deployment
- Local hash computation (data residency)
- Global collision index sync
- Regional query routing
- Cross-region disaster recovery

## Security Architecture

### Data Protection
- Hash-only signals (no PII)
- Encrypted storage at rest
- TLS 1.3 for all communications
- Audit logging for all accesses

### Access Control
- Tenant-scoped data isolation
- Role-based permissions
- API rate limiting
- Webhook signature verification

### Compliance
- WORM-eligible collision logs
- 24-month retention policy
- GDPR opt-in for cross-tenant sharing
- SOC 2 Type II controls

## Monitoring & Observability

### Key Metrics
- Hash computation latency/error rate
- Index query performance
- Collision detection accuracy
- Reviewer disposition time
- Storage utilization

### Alerting
- Index corruption detection
- Query latency degradation
- Hash computation failures
- Storage capacity thresholds
- Security anomaly detection

## Deployment Architecture

### Container Services
- hash-compute-service (GPU-enabled)
- index-service (PDQ + FAISS)
- query-service (collision detection)
- ui-service (investigator interface)
- api-gateway (rate limiting + auth)

### Infrastructure
- Kubernetes cluster with auto-scaling
- Redis for caching and queues
- PostgreSQL for metadata
- S3 for long-term storage
- CloudWatch for monitoring
