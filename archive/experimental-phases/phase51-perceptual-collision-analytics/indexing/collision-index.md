# Collision Indexing System Implementation

## Overview
High-performance indexing system combining bitset/Hamming buckets for PDQ hashes with FAISS/HNSW for dense embeddings. Optimized for sub-10ms PDQ queries and <150ms embedding queries at 10M+ scale.

## Dependencies
```json
{
  "dependencies": {
    "faiss-node": "^0.5.1",
    "redis": "^4.6.10",
    "rocksdb": "^5.2.0",
    "bitset": "^5.1.0",
    "xxhash-wasm": "^1.0.2"
  }
}
```

## Core Implementation

### Index Configuration
```typescript
export interface IndexConfig {
  // PDQ Index Configuration
  pdq: {
    segmentSize: number;      // Bits per segment (default: 64)
    bucketCount: number;      // Number of Hamming buckets
    maxHammingDistance: number; // Maximum distance for candidate retrieval
    enableBitsetCompression: boolean;
    hashCacheSize: number;    // Hash cache size in memory
  };
  
  // Embedding Index Configuration
  embedding: {
    dimensions: number;       // Vector dimensions
    indexType: 'IVF' | 'HNSW' | 'IVFPQ';
    nlist: number;           // IVF centroids
    M: number;               // HNSW connections
    efConstruction: number;  // HNSW build accuracy
    efSearch: number;        // HNSW search accuracy
    useGPU: boolean;
    nprobe: number;          // IVF search probes
  };
  
  // Performance Configuration
  performance: {
    cacheSize: number;       // Memory cache size (MB)
    queryTimeout: number;    // Query timeout (ms)
    batchSize: number;       // Batch query size
    compressionLevel: number; // 0-9 compression
    maxConcurrentQueries: number;
    memoryThreshold: number; // Memory usage threshold for cleanup
  };
  
  // Security Configuration
  security: {
    maxQueryResults: number; // Maximum results per query
    rateLimitPerIP: number;  // Rate limit per IP
    enableQueryLogging: boolean;
    sanitizeInputs: boolean;
  };
}

export interface IndexMetrics {
  pdq: {
    totalHashes: number;
    queryCount: number;
    avgQueryTime: number;
    cacheHitRate: number;
  };
  embedding: {
    totalVectors: number;
    queryCount: number;
    avgQueryTime: number;
    indexSize: number;
  };
  performance: {
    memoryUsage: number;
    cacheSize: number;
    queryRate: number;
  };
}

export class SecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecurityError';
  }
}
```

### PDQ Bitset Index Implementation
```typescript
import Redis from 'redis';
import { BitSet } from 'bitset';
import * as crypto from 'crypto';

export class PDQBitsetIndex {
  private config: IndexConfig['pdq'];
  private redis: Redis;
  private bitsets: Map<string, BitSet> = new Map();
  private segmentMasks: Buffer[] = [];
  private metrics: IndexMetrics['pdq'];
  private queryCount = 0;
  private lastCleanup = Date.now();

  constructor(config: IndexConfig['pdq'], redisClient: Redis) {
    this.config = {
      segmentSize: 64,
      bucketCount: 1000000,
      maxHammingDistance: 16,
      enableBitsetCompression: true,
      hashCacheSize: 10000,
      ...config
    };

    this.redis = redisClient;
    this.initializeMetrics();
    this.generateSegmentMasks();
  }

  private initializeMetrics(): void {
    this.metrics = {
      totalHashes: 0,
      queryCount: 0,
      avgQueryTime: 0,
      cacheHitRate: 0
    };
  }

  /**
   * Generate bit masks for PDQ segmentation
   */
  private generateSegmentMasks(): void {
    const bitsPerSegment = this.config.segmentSize;
    const totalBits = 256; // PDQ is 256 bits
    
    for (let i = 0; i < totalBits; i += bitsPerSegment) {
      const mask = Buffer.alloc(32); // 256 bits = 32 bytes
      
      for (let j = 0; j < bitsPerSegment && (i + j) < totalBits; j++) {
        const byteIndex = Math.floor((i + j) / 8);
        const bitIndex = 7 - ((i + j) % 8);
        mask[byteIndex] |= (1 << bitIndex);
      }
      
      this.segmentMasks.push(mask);
    }
  }

  /**
   * Extract hash segments for bucket assignment
   */
  private extractSegments(pdqHash: Buffer): number[] {
    const segments: number[] = [];
    
    for (const mask of this.segmentMasks) {
      let segment = 0;
      for let bitIndex = 0; bitIndex < this.config.segmentSize; bitIndex++) {
        const byteIndex = Math.floor(bitIndex / 8);
        const localBitIndex = 7 - (bitIndex % 8);
        
        if (mask[byteIndex] & (1 << localBitIndex)) {
          const hashByteIndex = Math.floor(bitIndex / 8);
          const hashBitIndex = 7 - (bitIndex % 8);
          
          if (pdqHash[hashByteIndex] & (1 << hashBitIndex)) {
            segment |= (1 << bitIndex);
          }
        }
      }
      
      segments.push(segment % this.config.bucketCount);
    }
    
    return segments;
  }

  /**
   * Get bitset key for hash prefix
   */
  private getBitsetKey(pdqHash: Buffer): string {
    const prefix = pdqHash.toString('hex').substring(0, 8);
    return `pdq:bitset:${prefix}`;
  }

  /**
   * Insert PDQ hash into index
   */
  async insert(assetId: string, pdqHash: Buffer): Promise<void> {
    try {
      // SECURITY: Validate inputs
      if (!assetId || typeof assetId !== 'string') {
        throw new SecurityError('Invalid asset ID provided');
      }
      
      if (!pdqHash || !(pdqHash instanceof Buffer) || pdqHash.length !== 32) {
        throw new SecurityError('Invalid PDQ hash provided');
      }
      
      // SECURITY: Sanitize asset ID to prevent Redis key injection
      const sanitizedAssetId = this.sanitizeRedisKey(assetId);
      if (!this.isValidAssetId(sanitizedAssetId)) {
        throw new SecurityError('Asset ID contains invalid characters');
      }

      // Extract hash segments for bucket assignment
      const segments = this.extractSegments(pdqHash);
      
      // Insert into each segment bucket
      for (let i = 0; i < segments.length; i++) {
        const bucketKey = `pdq:segment:${i}:${segments[i]}`;
        await this.redis.sadd(bucketKey, sanitizedAssetId);
      }

      // Store full hash for exact comparison
      const hashKey = `pdq:hash:${sanitizedAssetId}`;
      await this.redis.set(hashKey, pdqHash.toString('hex'));

      // Update bitset for fast existence checks
      const bitsetKey = this.getBitsetKey(pdqHash);
      if (!this.bitsets.has(bitsetKey)) {
        this.bitsets.set(bitsetKey, new BitSet());
      }
      this.bitsets.get(bitsetKey)!.set(parseInt(sanitizedAssetId, 16) % this.config.bucketCount);

    } catch (error) {
      throw new Error(`Failed to insert PDQ hash: ${error.message}`);
    }
  }

  /**
   * Query for similar PDQ hashes
   */
  async query(
    queryHash: Buffer,
    maxDistance: number,
    limit: number = 100
  ): Promise<Array<{
    assetId: string;
    distance: number;
    similarity: number;
  }>> {
    try {
      // SECURITY: Validate inputs
      if (!queryHash || !(queryHash instanceof Buffer) || queryHash.length !== 32) {
        throw new SecurityError('Invalid query hash provided');
      }
      
      if (typeof maxDistance !== 'number' || maxDistance < 0 || maxDistance > 256) {
        throw new SecurityError('Invalid max distance provided');
      }
      
      if (typeof limit !== 'number' || limit < 1 || limit > 10000) {
        throw new SecurityError('Invalid limit provided');
      }

      const candidates = new Set<string>();
      
      // Extract query segments
      const querySegments = this.extractSegments(queryHash);
      
      // Find candidates from each segment bucket
      for (let i = 0; i < querySegments.length; i++) {
        const bucketKey = `pdq:segment:${i}:${querySegments[i]}`;
        const bucketMembers = await this.redis.smembers(bucketKey);
        bucketMembers.forEach(member => candidates.add(member));
      }

      // Calculate exact Hamming distances
      const results = [];
      for (const assetId of candidates) {
        // SECURITY: Validate asset ID from Redis
        if (!this.isValidAssetId(assetId)) {
          continue; // Skip suspicious entries
        }
        
        const candidateHashHex = await this.redis.get(`pdq:hash:${assetId}`);
        if (candidateHashHex && this.isValidHexString(candidateHashHex)) {
          const candidateHash = Buffer.from(candidateHashHex, 'hex');
          const distance = this.calculateHammingDistance(queryHash, candidateHash);
          
          if (distance <= maxDistance) {
            const similarity = 1 - (distance / 256);
            results.push({
              assetId,
              distance,
              similarity
            });
          }
        }
      }

      // Sort by distance (lowest first) and limit results
      return results
        .sort((a, b) => a.distance - b.distance)
        .slice(0, limit);

    } catch (error) {
      throw new Error(`PDQ query failed: ${error.message}`);
    }
  }

  /**
   * Sanitize Redis key to prevent injection
   */
  private sanitizeRedisKey(key: string): string {
    // Remove potentially dangerous characters
    return key.replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 256);
  }

  /**
   * Validate asset ID format
   */
  private isValidAssetId(assetId: string): boolean {
    // Asset IDs should be alphanumeric with limited length
    return /^[a-zA-Z0-9_-]{1,256}$/.test(assetId);
  }

  /**
   * Validate hex string format
   */
  private isValidHexString(hexString: string): boolean {
    // Should be valid hex with reasonable length (64 chars for 32 bytes)
    return /^[0-9a-fA-F]{64}$/.test(hexString);
  }

  /**
   * Batch insert multiple PDQ hashes
   */
  async batchInsert(records: Array<{ assetId: string; pdqHash: Buffer }>): Promise<void> {
    const pipeline = this.redis.pipeline();
    
    for (const record of records) {
      const segments = this.extractSegments(record.pdqHash);
      
      // Add to segment buckets
      for (let i = 0; i < segments.length; i++) {
        const bucketKey = `pdq:segment:${i}:${segments[i]}`;
        pipeline.sadd(bucketKey, record.assetId);
      }
      
      // Store full hash
      const hashKey = `pdq:hash:${record.assetId}`;
      pipeline.set(hashKey, record.pdqHash.toString('hex'));
    }
    
    await pipeline.exec();
  }

  /**
   * Extract segments from PDQ hash for bucket assignment
   */
  private extractSegments(pdqHash: Buffer): string[] {
    const segments = [];
    const segmentSize = this.config.segmentSize / 8; // Convert bits to bytes
    
    for (let i = 0; i < pdqHash.length; i += segmentSize) {
      const segment = pdqHash.slice(i, i + segmentSize);
      segments.push(segment.toString('hex'));
    }
    
    return segments;
  }

  /**
   * Calculate Hamming distance between two PDQ hashes
   */
  private calculateHammingDistance(hash1: Buffer, hash2: Buffer): number {
    if (hash1.length !== hash2.length || hash1.length !== 32) {
      throw new Error('Invalid PDQ hash length');
    }

    let distance = 0;
    for (let i = 0; i < hash1.length; i++) {
      const byte1 = hash1[i];
      const byte2 = hash2[i];
      const xor = byte1 ^ byte2;
      distance += this.countSetBits(xor);
    }

    return distance;
  }

  /**
   * Count set bits in a byte (Brian Kernighan's algorithm)
   */
  private countSetBits(byte: number): number {
    let count = 0;
    while (byte) {
      byte &= byte - 1;
      count++;
    }
    return count;
  }

  /**
   * Get bitset key for hash
   */
  private getBitsetKey(hash: Buffer): string {
    // Use first 8 bytes as bitset key
    return hash.slice(0, 8).toString('hex');
  }

  /**
   * Get index statistics
   */
  async getStats(): Promise<{
    totalHashes: number;
    bucketDistribution: Record<string, number>;
    avgBucketSize: number;
  }> {
    const stats = {
      totalHashes: 0,
      bucketDistribution: {} as Record<string, number>,
      avgBucketSize: 0
    };

    // Count total hashes
    const hashKeys = await this.redis.keys('pdq:hash:*');
    stats.totalHashes = hashKeys.length;

    // Analyze bucket distribution
    for (let i = 0; i < 4; i++) {
      const bucketKeys = await this.redis.keys(`pdq:segment:${i}:*`);
      let totalMembers = 0;
      
      for (const bucketKey of bucketKeys) {
        const memberCount = await this.redis.scard(bucketKey);
        totalMembers += memberCount;
      }
      
      stats.bucketDistribution[`segment_${i}`] = totalMembers;
    }

    stats.avgBucketSize = stats.totalHashes / (4 * 256); // 4 segments * 256 possible values

    return stats;
  }

  /**
   * Delete asset from index
   */
  async delete(assetId: string): Promise<void> {
    try {
      // Get stored hash
      const hashHex = await this.redis.get(`pdq:hash:${assetId}`);
      if (!hashHex) return;

      const hash = Buffer.from(hashHex, 'hex');
      const segments = this.extractSegments(hash);

      // Remove from segment buckets
      const pipeline = this.redis.pipeline();
      for (let i = 0; i < segments.length; i++) {
        const bucketKey = `pdq:segment:${i}:${segments[i]}`;
        pipeline.srem(bucketKey, assetId);
      }
      
      // Remove hash storage
      pipeline.del(`pdq:hash:${assetId}`);
      
      await pipeline.exec();
    } catch (error) {
      throw new Error(`Failed to delete from PDQ index: ${error.message}`);
    }
  }
}
```

### FAISS Embedding Index
```typescript
import { FaissIndex } from 'faiss-node';
import * as fs from 'fs/promises';
import * as path from 'path';

export class FAISSEmbeddingIndex {
  private config: IndexConfig['embedding'];
  private index: FaissIndex | null = null;
  private idMap: Map<string, number> = new Map();
  private reverseIdMap: Map<number, string> = new Map();
  private nextId = 0;
  private indexPath: string;

  constructor(config: IndexConfig['embedding'], indexPath: string) {
    this.config = config;
    this.indexPath = indexPath;
  }

  /**
   * Initialize FAISS index
   */
  async initialize(): Promise<void> {
    try {
      // Check if index exists on disk
      try {
        const indexData = await fs.readFile(this.indexPath);
        this.index = new FaissIndex.IndexFlatIP(this.config.dimensions);
        this.index = FaissIndex.read_index(indexData);
        console.log(`Loaded existing FAISS index from ${this.indexPath}`);
      } catch {
        // Create new index
        this.createIndex();
        console.log(`Created new FAISS index`);
      }

      // Load ID mappings
      await this.loadIdMappings();
    } catch (error) {
      throw new Error(`Failed to initialize FAISS index: ${error.message}`);
    }
  }

  /**
   * Create new FAISS index based on configuration
   */
  private createIndex(): void {
    switch (this.config.indexType) {
      case 'IVF':
        const quantizer = new FaissIndex.IndexFlatIP(this.config.dimensions);
        this.index = new FaissIndex.IndexIVFFlat(
          quantizer,
          this.config.dimensions,
          this.config.nlist
        );
        break;
        
      case 'HNSW':
        this.index = new FaissIndex.IndexHNSWFlat(this.config.dimensions, this.config.M);
        // Set HNSW parameters
        (this.index as any).hnsw.efConstruction = this.config.efConstruction;
        (this.index as any).hnsw.efSearch = this.config.efSearch;
        break;
        
      case 'IVFPQ':
        const ivfQuantizer = new FaissIndex.IndexFlatIP(this.config.dimensions);
        this.index = new FaissIndex.IndexIVFPQ(
          ivfQuantizer,
          this.config.dimensions,
          this.config.nlist,
          8, // Number of subquantizers
          8  // Bits per subquantizer
        );
        break;
        
      default:
        this.index = new FaissIndex.IndexFlatIP(this.config.dimensions);
    }
  }

  /**
   * Add embedding to index
   */
  async insert(assetId: string, embedding: Float32Array): Promise<void> {
    if (!this.index) {
      throw new Error('Index not initialized');
    }

    try {
      const id = this.nextId++;
      
      // Add to FAISS index
      this.index.add(embedding);
      
      // Update ID mappings
      this.idMap.set(assetId, id);
      this.reverseIdMap.set(id, assetId);
      
      // Save to disk periodically
      if (this.nextId % 1000 === 0) {
        await this.saveToDisk();
      }
    } catch (error) {
      throw new Error(`Failed to insert embedding: ${error.message}`);
    }
  }

  /**
   * Query for similar embeddings
   */
  async query(
    queryEmbedding: Float32Array,
    limit: number = 10,
    threshold: number = 0.8
  ): Promise<Array<{
    assetId: string;
    similarity: number;
    distance: number;
  }>> {
    if (!this.index) {
      throw new Error('Index not initialized');
    }

    try {
      // Set search parameters for HNSW
      if (this.config.indexType === 'HNSW') {
        (this.index as any).hnsw.efSearch = this.config.efSearch;
      }

      // Search FAISS index
      const { labels, distances } = this.index.search(queryEmbedding, limit * 2); // Get more results for filtering

      const results = [];
      for (let i = 0; i < labels.length; i++) {
        const id = labels[i];
        const distance = distances[i];
        const similarity = 1 - distance; // Convert distance to similarity
        
        if (similarity >= threshold) {
          const assetId = this.reverseIdMap.get(id);
          if (assetId) {
            results.push({
              assetId,
              similarity,
              distance
            });
          }
        }
      }

      return results.slice(0, limit);
    } catch (error) {
      throw new Error(`FAISS query failed: ${error.message}`);
    }
  }

  /**
   * Batch insert embeddings
   */
  async batchInsert(records: Array<{ assetId: string; embedding: Float32Array }>): Promise<void> {
    if (!this.index) {
      throw new Error('Index not initialized');
    }

    try {
      const embeddings = new Float32Array(records.length * this.config.dimensions);
      const ids: number[] = [];

      // Prepare batch data
      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        const id = this.nextId++;
        
        // Update ID mappings
        this.idMap.set(record.assetId, id);
        this.reverseIdMap.set(id, record.assetId);
        ids.push(id);
        
        // Copy embedding to batch array
        embeddings.set(record.embedding, i * this.config.dimensions);
      }

      // Add batch to index
      this.index.add(embeddings);
      
      // Save to disk
      await this.saveToDisk();
    } catch (error) {
      throw new Error(`Failed to batch insert embeddings: ${error.message}`);
    }
  }

  /**
   * Train index with embeddings (required for IVF indexes)
   */
  async train(embeddings: Float32Array): Promise<void> {
    if (!this.index) {
      throw new Error('Index not initialized');
    }

    try {
      if (this.config.indexType === 'IVF' || this.config.indexType === 'IVFPQ') {
        this.index.train(embeddings);
        console.log(`Trained FAISS index with ${embeddings.length / this.config.dimensions} embeddings`);
      }
    } catch (error) {
      throw new Error(`Failed to train FAISS index: ${error.message}`);
    }
  }

  /**
   * Save index and mappings to disk
   */
  async saveToDisk(): Promise<void> {
    try {
      if (this.index) {
        const indexData = FaissIndex.write_index(this.index);
        await fs.writeFile(this.indexPath, indexData);
      }

      // Save ID mappings
      const mappingsPath = this.indexPath.replace('.index', '.mappings.json');
      const mappings = {
        idMap: Object.fromEntries(this.idMap),
        reverseIdMap: Object.fromEntries(this.reverseIdMap),
        nextId: this.nextId
      };
      await fs.writeFile(mappingsPath, JSON.stringify(mappings, null, 2));
    } catch (error) {
      throw new Error(`Failed to save index to disk: ${error.message}`);
    }
  }

  /**
   * Load ID mappings from disk
   */
  private async loadIdMappings(): Promise<void> {
    try {
      const mappingsPath = this.indexPath.replace('.index', '.mappings.json');
      const mappingsData = await fs.readFile(mappingsPath, 'utf-8');
      const mappings = JSON.parse(mappingsData);
      
      this.idMap = new Map(Object.entries(mappings.idMap));
      this.reverseIdMap = new Map(Object.entries(mappings.reverseIdMap));
      this.nextId = mappings.nextId;
    } catch (error) {
      // Mappings file doesn't exist, start fresh
      this.nextId = 0;
    }
  }

  /**
   * Delete asset from index
   */
  async delete(assetId: string): Promise<void> {
    // FAISS doesn't support deletion, so we mark as deleted in mappings
    this.idMap.delete(assetId);
    // Note: In production, would use IndexIDMap or rebuild index periodically
  }

  /**
   * Get index statistics
   */
  getStats(): {
    totalEmbeddings: number;
    indexType: string;
    dimensions: number;
    memoryUsage: number;
  } {
    return {
      totalEmbeddings: this.index ? this.index.ntotal() : 0,
      indexType: this.config.indexType,
      dimensions: this.config.dimensions,
      memoryUsage: this.index ? this.index.ntotal() * this.config.dimensions * 4 : 0 // 4 bytes per float
    };
  }

  /**
   * Optimize index for better performance
   */
  async optimize(): Promise<void> {
    if (!this.index) return;

    try {
      if (this.config.indexType === 'IVF' || this.config.indexType === 'IVFPQ') {
        // Reconstruct index for better clustering
        console.log('Optimizing FAISS index...');
        // Implementation would extract all vectors and retrain
      }
    } catch (error) {
      console.warn(`Index optimization failed: ${error.message}`);
    }
  }
}
```

### Unified Collision Index
```typescript
export class CollisionIndex {
  private config: IndexConfig;
  private pdqIndex: PDQBitsetIndex;
  private embeddingIndex: FAISSEmbeddingIndex;
  private redis: Redis;
  private metrics: IndexMetrics;

  constructor(config: IndexConfig, redis: Redis) {
    this.config = config;
    this.redis = redis;
    
    this.pdqIndex = new PDQBitsetIndex(config.pdq, redis);
    this.embeddingIndex = new FAISSEmbeddingIndex(
      config.embedding,
      './data/embeddings.index'
    );
    
    this.metrics = {
      totalRecords: 0,
      pdqIndexSize: 0,
      embeddingIndexSize: 0,
      avgQueryLatency: 0,
      cacheHitRate: 0,
      indexBuildProgress: 0
    };
  }

  /**
   * Initialize all indexes
   */
  async initialize(): Promise<void> {
    await Promise.all([
      this.pdqIndex, // PDQ index doesn't need initialization
      this.embeddingIndex.initialize()
    ]);
  }

  /**
   * Insert asset with both PDQ and embedding
   */
  async upsert(record: {
    assetId: string;
    pdqHash: Buffer;
    embedding?: Float32Array;
  }): Promise<void> {
    const startTime = performance.now();

    try {
      // Insert PDQ hash
      await this.pdqIndex.insert(record.assetId, record.pdqHash);
      
      // Insert embedding if provided
      if (record.embedding) {
        await this.embeddingIndex.insert(record.assetId, record.embedding);
      }

      // Update metrics
      this.metrics.totalRecords++;
      this.updateLatencyMetrics(performance.now() - startTime);

    } catch (error) {
      throw new Error(`Failed to upsert record: ${error.message}`);
    }
  }

  /**
   * Query for collisions using multi-stage approach
   */
  async queryCollisions(
    query: {
      pdqHash: Buffer;
      embedding?: Float32Array;
    },
    options: {
      pdqThreshold?: number;
      embeddingThreshold?: number;
      limit?: number;
      useTwoStage?: boolean;
    } = {}
  ): Promise<Array<{
    assetId: string;
    pdqSimilarity: number;
    embeddingSimilarity?: number;
    combinedScore: number;
  }>> {
    const startTime = performance.now();
    const {
      pdqThreshold = 0.85,
      embeddingThreshold = 0.8,
      limit = 50,
      useTwoStage = true
    } = options;

    try {
      // Stage 1: PDQ query for candidates
      const maxPDQDistance = Math.floor((1 - pdqThreshold) * 256);
      const pdqCandidates = await this.pdqIndex.query(
        query.pdqHash,
        maxPDQDistance,
        limit * 2 // Get more candidates for filtering
      );

      if (!useTwoStage || !query.embedding || pdqCandidates.length === 0) {
        // Return PDQ-only results
        return pdqCandidates.slice(0, limit).map(candidate => ({
          assetId: candidate.assetId,
          pdqSimilarity: candidate.similarity,
          combinedScore: candidate.similarity
        }));
      }

      // Stage 2: Embedding verification
      const embeddingCandidates = await this.embeddingIndex.query(
        query.embedding,
        limit * 2,
        embeddingThreshold
      );

      // Combine results
      const combinedResults = this.combineQueryResults(
        pdqCandidates,
        embeddingCandidates
      );

      this.updateLatencyMetrics(performance.now() - startTime);
      
      return combinedResults.slice(0, limit);

    } catch (error) {
      throw new Error(`Collision query failed: ${error.message}`);
    }
  }

  /**
   * Combine PDQ and embedding query results
   */
  private combineQueryResults(
    pdqResults: Array<{ assetId: string; similarity: number }>,
    embeddingResults: Array<{ assetId: string; similarity: number }>
  ): Array<{
    assetId: string;
    pdqSimilarity: number;
    embeddingSimilarity: number;
    combinedScore: number;
  }> {
    const embeddingMap = new Map(
      embeddingResults.map(r => [r.assetId, r.similarity])
    );

    const combined = pdqResults.map(pdqResult => {
      const embeddingSimilarity = embeddingMap.get(pdqResult.assetId) || 0;
      
      // Weighted combination (PDQ: 0.4, Embedding: 0.6)
      const combinedScore = pdqResult.similarity * 0.4 + embeddingSimilarity * 0.6;

      return {
        assetId: pdqResult.assetId,
        pdqSimilarity: pdqResult.similarity,
        embeddingSimilarity,
        combinedScore
      };
    });

    // Filter out results without embedding similarity (if embedding was provided)
    return combined
      .filter(r => r.embeddingSimilarity > 0)
      .sort((a, b) => b.combinedScore - a.combinedScore);
  }

  /**
   * Batch upsert multiple records
   */
  async batchUpsert(records: Array<{
    assetId: string;
    pdqHash: Buffer;
    embedding?: Float32Array;
  }>): Promise<void> {
    const startTime = performance.now();

    try {
      // Separate records with and without embeddings
      const pdqRecords = records.map(r => ({ assetId: r.assetId, pdqHash: r.pdqHash }));
      const embeddingRecords = records.filter(r => r.embedding !== undefined);

      // Batch insert PDQ hashes
      await this.pdqIndex.batchInsert(pdqRecords);

      // Batch insert embeddings
      if (embeddingRecords.length > 0) {
        const embeddingData = embeddingRecords.map(r => ({
          assetId: r.assetId,
          embedding: r.embedding!
        }));
        await this.embeddingIndex.batchInsert(embeddingData);
      }

      // Update metrics
      this.metrics.totalRecords += records.length;
      this.updateLatencyMetrics(performance.now() - startTime);

    } catch (error) {
      throw new Error(`Failed to batch upsert records: ${error.message}`);
    }
  }

  /**
   * Delete asset from all indexes
   */
  async delete(assetId: string): Promise<void> {
    await Promise.all([
      this.pdqIndex.delete(assetId),
      this.embeddingIndex.delete(assetId)
    ]);
    
    this.metrics.totalRecords = Math.max(0, this.metrics.totalRecords - 1);
  }

  /**
   * Get comprehensive index statistics
   */
  async getStats(): Promise<IndexMetrics & {
    pdqStats: any;
    embeddingStats: any;
  }> {
    const [pdqStats, embeddingStats] = await Promise.all([
      this.pdqIndex.getStats(),
      Promise.resolve(this.embeddingIndex.getStats())
    ]);

    return {
      ...this.metrics,
      pdqStats,
      embeddingStats
    };
  }

  /**
   * Update latency metrics
   */
  private updateLatencyMetrics(latency: number): void {
    // Exponential moving average
    const alpha = 0.1;
    this.metrics.avgQueryLatency = 
      alpha * latency + (1 - alpha) * this.metrics.avgQueryLatency;
  }

  /**
   * Optimize all indexes
   */
  async optimize(): Promise<void> {
    await Promise.all([
      Promise.resolve(), // PDQ index doesn't need optimization
      this.embeddingIndex.optimize()
    ]);
  }

  /**
   * Save all indexes to disk
   */
  async saveToDisk(): Promise<void> {
    await this.embeddingIndex.saveToDisk();
  }

  /**
   * Dispose resources
   */
  async dispose(): Promise<void> {
    await this.redis.quit();
  }
}
```

## Sharding Implementation

### Sharded Index Manager
```typescript
export class ShardedCollisionIndex {
  private shards: Map<string, CollisionIndex> = new Map();
  private config: IndexConfig;
  private shardCount: number;

  constructor(config: IndexConfig) {
    this.config = { ...config, sharding: { ...config.sharding, enabled: true } };
    this.shardCount = config.sharding.shardCount;
  }

  /**
   * Initialize all shards
   */
  async initialize(): Promise<void> {
    const initPromises = [];
    
    for (let i = 0; i < this.shardCount; i++) {
      const shardId = `shard_${i}`;
      const redis = new Redis({ db: i }); // Separate Redis DB per shard
      
      const shardIndex = new CollisionIndex(this.config, redis);
      this.shards.set(shardId, shardIndex);
      
      initPromises.push(shardIndex.initialize());
    }
    
    await Promise.all(initPromises);
  }

  /**
   * Get shard for asset ID
   */
  private getShard(assetId: string): CollisionIndex {
    const hash = this.hashAssetId(assetId);
    const shardIndex = hash % this.shardCount;
    return this.shards.get(`shard_${shardIndex}`)!;
  }

  /**
   * Hash asset ID for shard assignment
   */
  private hashAssetId(assetId: string): number {
    let hash = 0;
    for (let i = 0; i < assetId.length; i++) {
      const char = assetId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Query across all shards
   */
  async queryAllShards(
    query: { pdqHash: Buffer; embedding?: Float32Array },
    options: any = {}
  ): Promise<Array<any>> {
    const queryPromises = Array.from(this.shards.values()).map(shard =>
      shard.queryCollisions(query, options)
    );

    const results = await Promise.all(queryPromises);
    
    // Merge and sort results from all shards
    const allResults = results.flat();
    return allResults
      .sort((a, b) => b.combinedScore - a.combinedScore)
      .slice(0, options.limit || 50);
  }

  /**
   * Get aggregated statistics across all shards
   */
  async getAggregatedStats(): Promise<IndexMetrics> {
    const statsPromises = Array.from(this.shards.values()).map(shard =>
      shard.getStats()
    );

    const allStats = await Promise.all(statsPromises);
    
    // Aggregate statistics
    const aggregated: IndexMetrics = {
      totalRecords: allStats.reduce((sum, stats) => sum + stats.totalRecords, 0),
      pdqIndexSize: allStats.reduce((sum, stats) => sum + stats.pdqIndexSize, 0),
      embeddingIndexSize: allStats.reduce((sum, stats) => sum + stats.embeddingIndexSize, 0),
      avgQueryLatency: allStats.reduce((sum, stats) => sum + stats.avgQueryLatency, 0) / allStats.length,
      cacheHitRate: allStats.reduce((sum, stats) => sum + stats.cacheHitRate, 0) / allStats.length,
      indexBuildProgress: allStats.reduce((sum, stats) => sum + stats.indexBuildProgress, 0) / allStats.length
    };

    return aggregated;
  }
}
```
