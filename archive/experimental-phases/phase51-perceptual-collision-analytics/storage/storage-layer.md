# Storage Layer Implementation

## Overview
Comprehensive storage system combining hash tables, ANN indexes, and append-only collision logs with WORM compliance. Designed for 24-month retention, high-throughput access, and regulatory compliance.

## Dependencies
```json
{
  "dependencies": {
    "pg": "^8.11.3",
    "redis": "^4.6.10",
    "rocksdb": "^5.2.0",
    "aws-sdk": "^2.1490.0",
    "level": "^8.0.0",
    "ioredis": "^5.3.2"
  }
}
```

## Core Implementation

### Storage Configuration
```typescript
export interface StorageConfig {
  // PostgreSQL Configuration (Metadata & Collision Logs)
  postgres: {
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
    pool: {
      min: number;
      max: number;
      idleTimeoutMillis: number;
      acquireTimeoutMillis: number;
    };
    ssl: boolean;
    connectionTimeoutMillis: number;
    statementTimeout: number;
    queryTimeout: number;
  };
  
  // Redis Configuration (Cache & Session Data)
  redis: {
    host: string;
    port: number;
    db: number;
    password?: string;
    keyPrefix: string;
    ttl: {
      cache: number;
      session: number;
      temporary: number;
    };
    maxRetriesPerRequest: number;
    retryDelayOnFailover: number;
    lazyConnect: boolean;
  };
  
  // RocksDB Configuration (Local Index Storage)
  rocksdb: {
    path: string;
    createIfMissing: boolean;
    compression: 'none' | 'snappy' | 'zlib' | 'bzip2';
    cacheSize: number;
    writeBufferSize: number;
    maxWriteBufferNumber: number;
    blockSize: number;
    blockSizeDeviation: number;
    blockRestartInterval: number;
  };
  
  // S3 Configuration (Asset Storage & Backups)
  s3: {
    region: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    encryption: 'AES256' | 'aws:kms';
    lifecycle: {
      transitionToIA: number; // days
      transitionToGlacier: number; // days
      expiration: number; // days
    };
    multipart: {
      threshold: number; // bytes
      minPartSize: number; // bytes
    };
  };
  
  // WORM Compliance Configuration
  worm: {
    enabled: boolean;
    retentionPeriod: number; // days
    immutableTables: string[];
    auditLogRetention: number; // days
    complianceMode: 'strict' | 'lenient';
  };
  
  // Performance Configuration
  performance: {
    connectionPooling: boolean;
    preparedStatements: boolean;
    queryCaching: boolean;
    bulkOperations: boolean;
    compressionThreshold: number; // bytes
    maxConcurrentOperations: number;
  };
  
  // Security Configuration
  security: {
    encryptionAtRest: boolean;
    encryptionInTransit: boolean;
    accessLogging: boolean;
    dataMasking: boolean;
    backupEncryption: boolean;
  };
}

export interface StorageMetrics {
  postgres: {
    activeConnections: number;
    idleConnections: number;
    totalQueries: number;
    avgQueryTime: number;
    errorRate: number;
  };
  redis: {
    connectedClients: number;
    usedMemory: number;
    hitRate: number;
    operationsPerSecond: number;
  };
  rocksdb: {
    totalKeys: number;
    diskUsage: number;
    readAmplification: number;
    writeAmplification: number;
  };
  s3: {
    totalObjects: number;
    totalSize: number;
    uploadCount: number;
    downloadCount: number;
  };
}

export class SecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecurityError';
  }
}
```

### Storage Manager Implementation
```typescript
import { Pool, PoolClient } from 'pg';
import Redis from 'ioredis';
import * as RocksDB from 'rocksdb';
import * as AWS from 'aws-sdk';
import * as fs from 'fs';
import * as crypto from 'crypto';

export class StorageManager {
  private config: StorageConfig;
  private postgresPool: Pool;
  private redis: Redis;
  private rocksdb: RocksDB;
  private s3: AWS.S3;
  private metrics: StorageMetrics;
  private isInitialized = false;

  constructor(config: StorageConfig) {
    this.config = this.validateConfig(config);
    this.initializeMetrics();
  }

  private validateConfig(config: StorageConfig): StorageConfig {
    // Validate required fields
    if (!config.postgres || !config.redis || !config.rocksdb) {
      throw new Error('Missing required storage configuration');
    }

    // Set secure defaults
    return {
      postgres: {
        pool: {
          min: 2,
          max: 10,
          idleTimeoutMillis: 30000,
          acquireTimeoutMillis: 60000,
          ...config.postgres.pool
        },
        statementTimeout: 30000,
        queryTimeout: 60000,
        ...config.postgres
      },
      redis: {
        ttl: {
          cache: 3600,
          session: 1800,
          temporary: 300,
          ...config.redis.ttl
        },
        maxRetriesPerRequest: 3,
        retryDelayOnFailover: 100,
        lazyConnect: true,
        ...config.redis
      },
      rocksdb: {
        createIfMissing: true,
        compression: 'snappy',
        cacheSize: 134217728, // 128MB
        writeBufferSize: 67108864, // 64MB
        maxWriteBufferNumber: 3,
        blockSize: 4096,
        blockSizeDeviation: 10,
        blockRestartInterval: 16,
        ...config.rocksdb
      },
      performance: {
        connectionPooling: true,
        preparedStatements: true,
        queryCaching: true,
        bulkOperations: true,
        compressionThreshold: 1024,
        maxConcurrentOperations: 100,
        ...config.performance
      },
      security: {
        encryptionAtRest: true,
        encryptionInTransit: true,
        accessLogging: true,
        dataMasking: false,
        backupEncryption: true,
        ...config.security
      },
      ...config
    };
  }

  private initializeMetrics(): void {
    this.metrics = {
      postgres: {
        activeConnections: 0,
        idleConnections: 0,
        totalQueries: 0,
        avgQueryTime: 0,
        errorRate: 0
      },
      redis: {
        connectedClients: 0,
        usedMemory: 0,
        hitRate: 0,
        operationsPerSecond: 0
      },
      rocksdb: {
        totalKeys: 0,
        diskUsage: 0,
        readAmplification: 0,
        writeAmplification: 0
      },
      s3: {
        totalObjects: 0,
        totalSize: 0,
        uploadCount: 0,
        downloadCount: 0
      }
    };
  }
      temp: number;
    };
    cluster?: {
      enabled: boolean;
      nodes: Array<{ host: string; port: number }>;
    };
  };
  
  // RocksDB Configuration (Hash Tables & Local Indexes)
  rocksdb: {
    path: string;
    createIfMissing: boolean;
    compression: 'none' | 'snappy' | 'zlib' | 'bz2';
    cacheSize: number;
    writeBufferSize: number;
    maxWriteBufferNumber: number;
    blockSize: number;
  };
  
  // S3 Configuration (Long-term Storage & Backups)
  s3: {
    bucket: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    prefix: string;
    encryption: 'AES' | 'AES256';
    lifecycle: {
      transitionToIA: number; // days
      transitionToGlacier: number; // days
      deleteAfter: number; // days (730 for 24 months)
    };
  };
  
  // WORM Configuration
  worm: {
    enabled: boolean;
    retentionPeriod: number; // days
    immutableTables: string[];
    appendOnlyLogs: string[];
  };
  
  // Performance Configuration
  performance: {
    batchSize: number;
    compressionLevel: number;
    parallelism: number;
    cacheSize: number;
    prefetchEnabled: boolean;
  };
}

export interface StorageMetrics {
  postgres: {
    connections: number;
    queryLatency: number;
    storageUsed: number;
    indexSize: number;
  };
  redis: {
    memoryUsed: number;
    hitRate: number;
    operationsPerSecond: number;
    keyCount: number;
  };
  rocksdb: {
    storageUsed: number;
    readLatency: number;
    writeLatency: number;
    compactionProgress: number;
  };
  s3: {
    objectsStored: number;
    storageUsed: number;
    transferIn: number;
    transferOut: number;
  };
}
```

### PostgreSQL Storage Manager
```typescript
import { Pool, Client } from 'postgres';
import pino from 'pino';

export class PostgreSQLStorageManager {
  private config: StorageConfig['postgres'];
  private pool: Pool;
  private logger: pino.Logger;
  private metrics: StorageMetrics['postgres'];

  constructor(config: StorageConfig['postgres']) {
    this.config = config;
    this.logger = pino({ level: 'info' });
    this.metrics = {
      connections: 0,
      queryLatency: 0,
      storageUsed: 0,
      indexSize: 0
    };
    
    this.initializePool();
  }

  /**
   * Initialize connection pool
   */
  private initializePool(): void {
    this.pool = new Pool({
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
      user: this.config.username,
      password: this.config.password,
      ssl: this.config.ssl,
      min: this.config.pool.min,
      max: this.config.pool.max,
      idleTimeoutMillis: this.config.pool.idleTimeoutMillis,
      connectionTimeoutMillis: this.config.connectionTimeoutMillis
    });

    this.pool.on('connect', () => {
      this.metrics.connections++;
    });

    this.pool.on('remove', () => {
      this.metrics.connections = Math.max(0, this.metrics.connections - 1);
    });
  }

  /**
   * Initialize database schema
   */
  async initializeSchema(): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Create asset metadata table
      await this.createAssetMetadataTable(client);
      
      // Create hash records table
      await this.createHashRecordsTable(client);
      
      // Create collision records table (WORM)
      await this.createCollisionLogTable(client);
      
      // Create indexes
      await this.createIndexes(client);
      
      // Create triggers for WORM compliance
      await this.createWORMTriggers(client);
      
      await client.query('COMMIT');
      this.logger.info('Database schema initialized successfully');
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(`Schema initialization failed: ${error.message}`);
    } finally {
      client.release();
    }
  }

  /**
   * Create asset metadata table
   */
  private async createAssetMetadataTable(client: Client): Promise<void> {
    const query = `
      CREATE TABLE IF NOT EXISTS asset_metadata (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id VARCHAR(255) NOT NULL,
        asset_id VARCHAR(255) NOT NOT NULL,
        manifest_url TEXT NOT NULL,
        image_url TEXT NOT NULL,
        content_type VARCHAR(100) NOT NULL,
        file_size BIGINT NOT NULL,
        uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL,
        processed_at TIMESTAMP WITH TIME ZONE,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        metadata JSONB,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        UNIQUE(tenant_id, asset_id)
      );
      
      CREATE INDEX IF NOT EXISTS idx_asset_metadata_tenant_asset 
        ON asset_metadata(tenant_id, asset_id);
      CREATE INDEX IF NOT EXISTS idx_asset_metadata_uploaded_at 
        ON asset_metadata(uploaded_at);
      CREATE INDEX IF NOT EXISTS idx_asset_metadata_status 
        ON asset_metadata(status);
    `;
    
    await client.query(query);
  }

  /**
   * Create hash records table
   */
  private async createHashrecordTable(client: Client): Promise<void> {
    const query = `
      CREATE TABLE IF NOT EXISTS hash_records (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id VARCHAR(255) NOT NOT NULL,
        asset_id VARCHAR(255) NOT NOT NULL,
        pdq_hash BYTEA NOT NULL,
        pdq_quality INTEGER NOT NULL,
        pdq_hex VARCHAR(64) NOT NOT NULL,
        ensemble_hashes JSONB,
        embedding_id VARCHAR(255),
        embedding_confidence Decimal(5,4),
        manifest_lineage JSONB NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        FOREIGN KEY (tenant_id, asset_id) REFERENCES asset_metadata(tenant_id, asset_id),
        UNIQUE(tenant_id, asset_id)
      );
      
      CREATE INDEX IF NOT EXISTS idx_hash_tenant_asset 
        ON hash_record(tenant_id, asset_id);
      CREATE INDEX IF NOT EXISTS idx_hash_pdq_hex 
        ON hash_record(pdq_hex);
      CREATE INDEX IF NOT EXISTS idx_hash_embedding_id 
        ON hash_record(embedding_id);
      CREATE INDEX IF NOT EXISTS idx_hash_created_at 
        ON hash_record(created_at);
    `;
    
    await client.query(query);
  }

  /**
   * Create collision log table (WORM compliant)
   */
  private async createCollisionLogTable(client: Client): Promise<void> {
    const query = `
      CREATE TABLE IF NOT EXISTS collision_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id VARCHAR(255) NOT NOT NULL,
        primary_asset_id VARCHAR(255) NOT NOT NULL,
        conflicting_asset_id VARCHAR(255) NOT NOT NULL,
        similarity_scores JSONB NOT NULL,
        conflict_type JSONB NOT NULL,
        lineage_diff JSONB NOT NULL,
        reviewer_label VARCHAR(50),
        reviewer_notes TEXT,
        reviewed_by VARCHAR(255),
        reviewed_at TIMESTAMP WITH TIME ZONE,
        resolved_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_reviewer_label 
          CHECK (reviewer_label IN ('benign_variant', 'suspicious', 'not_similar', 'false_positive'))
      );
      
      -- WORM: Prevent updates to core fields
      CREATE OR REPLACE FUNCTION prevent_collision_update()
      RETURNS TRIGGER AS $$
      BEGIN
        IF OLD.primary_asset_id IS DISTINCT FROM NEW.primary_asset_id OR
           OLD.conflicting_asset_id IS DISTINCT FROM NEW.conflicting_asset_id OR
           OLD.similarity_scores IS DISTINCT FROM NEW.similarity_scores OR
           OLD.conflict_type IS DISTINCT FROM NEW.conflict_type OR
           OLD.lineage_diff IS DISTINCT FROM NEW.lineage_diff THEN
          RAISE EXCEPTION 'Cannot modify immutable collision fields';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      
      CREATE TRIGGER trigger_prevent_collision_update
        BEFORE UPDATE ON collision_log
        FOR EACH ROW
        EXECUTE FUNCTION prevent_collision_update();
      
      CREATE INDEX IF NOT EXISTS idx_collision_tenant_primary 
        ON collision_log(tenant_id, primary_asset_id);
      CREATE INDEX IF NOT EXISTS idx_collision_conflicting 
        ON collision_log(conflicting_asset_id);
      CREATE INDEX IF NOT EXISTS idx_collision_created_at 
        ON collision_log(created_at);
      CREATE INDEX IF NOT EXISTS idx_collision_reviewer_label 
        ON collision_log(reviewer_label);
    `;
    
    await client.query(query);
  }

  /**
   * Create additional indexes
   */
  private async createIndexes(client: Client): Promise<void> {
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_hash_lineage_issuer ON hash_record USING GIN ((manifest_lineage->\'issuerKeyId\'));',
      'CREATE INDEX IF NOT EXISTS idx_hash_lineage_parent ON hash_record USING GIN ((manifest_lineage->\'parentHash\'));',
      'CREATE INDEX IF NOT EXISTS idx_collision_metadata ON collision_log USING GIN (similarity_scores);'
    ];

    for (const indexQuery of indexes) {
      await client.query(indexQuery);
    }
  }

  /**
   * Insert asset metadata
   */
  async insertAssetMetadata(metadata: {
    tenantId: string;
    assetId: string;
    manifestUrl: string;
    imageUrl: string;
    contentType: string;
    fileSize: number;
    uploadedAt: Date;
    metadata?: any;
  }): Promise<string> {
    const startTime = performance.now();
    
    try {
      const query = `
        INSERT INTO asset_metadata 
          (tenant_id, asset_id, manifest_url, image_url, content_type, file_size, uploaded_at, metadata)
        VALUES 
          ($1, $2, $3, $5, $6, $7, $7, $8)
        RETURNING id;
      `;
      
      const values = [
        metadata.tenantId,
        metadata.assetId,
        metadata.manifestUrl,
        metadata.imageUrl,
        metadata.contentType,
        metadata.fileSize,
        metadata.uploadedAt,
        JSON.stringify(metadata.metadata || {})
      ];
      
      const result = await this.pool.query(query, values);
      
      this.metrics.queryLatency = performance.now() - startTime;
      return result.rows[0].id;
      
    } catch (error) {
      throw new Error(`Failed to insert asset metadata: ${error.message}`);
    }
  }

  /**
   * Insert hash record
   */
  async insertHashRecord(record: {
    tenantId: string;
    assetId: string;
    pdqHash: Buffer;
    pdqQuality: number;
    pdqHex: string;
    ensembleHashes?: any;
    embeddingId?: string;
    embeddingConfidence?: number;
    manifestLineage: any;
  }): Promise<string> {
    const startTime = performance.now();
    
    try {
      const query = `
        INSERT INTO hash_record 
          (tenant_id, asset_id, pdq_hash, pdq_quality, pdq_hex, ensemble_hashes, embedding_id, embedding_confidence, manifest_lineage)
        VALUES 
          ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id;
      `;
      
      const values = [
        record.tenantId,
        record.assetId,
        record.pdqHash,
        record.pdqQuality,
        record.pdqHex,
        JSON.stringify(record.ensembleHashes || {}),
        record.embeddingId,
        record.embeddingConfidence,
        JSON.stringify(record.manifestLineage)
      ];
      
      const result = await this.pool.query(query, values);
      
      this.metrics.queryLatency = performance.now() - startTime;
      return result.rows[0].id;
      
    } catch (error) {
      throw new Error(`Failed to insert hash record: ${error.message}`);
    }
  }

  /**
   * Insert collision record (WORM)
   */
  async insertCollisionRecord(collision: {
    tenantId: string;
    primaryAssetId: string;
    conflictingAssetId: string;
    similarityScores: any;
    conflictType: any;
    lineageDiff: any;
  }): Promise<string> {
    const startTime = performance.now();
    
    try {
      const query = `
        INSERT INTO collision_log 
          (tenant_id, primary_asset_id, conflicting_asset_id, similarity_scores, conflict_type, lineage_diff)
        VALUES 
          ($1, $2, $3, $4, $5, $6)
        RETURNING id;
      `;
      
      const values = [
        collision.tenantId,
        collision.primaryAssetId,
        collision.conflictingAssetId,
        JSON.stringify(collision.similarityScores),
        JSON.stringify(collision.conflictType),
        JSON.stringify(collision.lineageDiff)
      ];
      
      const result = await this.pool.query(query, values);
      
      this.metrics.queryLatency = performance.now() - startTime;
      return result.rows[0].id;
      
    } catch (error) {
      throw new Error(`Failed to insert collision record: ${error.message}`);
    }
  }

  /**
   * Query hash records by tenant
   */
  async getHashRecordsByTenant(
    tenantId: string,
    options?: {
      limit?: number;
      offset?: number;
      orderBy?: 'created_at' | 'updated_at';
      orderDirection?: 'ASC' | 'DESC';
    }
  ): Promise<Array<any>> {
    const startTime = performance.now();
    
    try {
      const limit = options?.limit || 100;
      const offset = options?.offset || 0;
      const orderBy = options?.orderBy || 'created_at';
      const orderDirection = options?.orderDirection || 'DESC';
      
      const query = `
        SELECT 
          id, tenant_id, asset_id, pdq_hash, pdq_quality, pdq_hex,
          ensemble_hashes, embedding_id, embedding_confidence,
          manifest_lineage, created_at, updated_at
        FROM hash_record 
        WHERE tenant_id = $1
        ORDER BY ${orderBy} ${orderDirection}
        LIMIT $2 OFFSET $3;
      `;
      
      const result = await this.pool.query(query, [tenantId, limit, offset]);
      
      this.metrics.queryLatency = performance.now() - startTime;
      return result.rows;
      
    } catch (error) {
      throw new Error(`Failed to query hash records: ${error.message}`);
    }
  }

  /**
   * Query collision records
   */
  async getCollisionRecords(
    tenantId: string,
    filters?: {
      primaryAssetId?: string;
      conflictingAssetId?: string;
      reviewerLabel?: string;
      dateRange?: { start: Date; end: Date };
    },
    options?: {
      limit?: number;
      offset?: number;
    }
  ): Promise<Array<any>> {
    const startTime = performance.now();
    
    try {
      const conditions: string[] = ['tenant_id = $1'];
      const values: any[] = [tenantId];
      let paramIndex = 2;
      
      if (filters?.primaryAssetId) {
        conditions.push(`primary_asset_id = $${paramIndex++}`);
        values.push(filters.primaryAssetId);
      }
      
      if (filters?.conflictingAssetId) {
        conditions.push(`conflicting_asset_id = $${paramIndex++}`);
        values.push(filters.conflictingAssetId);
      }
      
      if (filters?.reviewerLabel) {
        conditions.push(`reviewer_label = $${paramIndex++}`);
        values.push(filters.reviewerLabel);
      }
      
      if (filters?.dateRange) {
        conditions.push(`created_at BETWEEN $${paramIndex++} AND $${paramIndex++}`);
        values.push(filters.dateRange.start, filters.dateRange.end);
      }
      
      const limit = options?.limit || 100;
      const offset = options?.offset || 0;
      
      const query = `
        SELECT 
          id, tenant_id, primary_asset_id, conflicting_asset_id,
          similarity_scores, conflict_type, lineage_diff,
          reviewer_label, reviewer_notes, reviewed_by,
          reviewed_at, resolved_at, created_at
        FROM collision_log 
        WHERE ${conditions.join(' AND ')}
        ORDER BY created_at DESC
        LIMIT $${paramIndex++} OFFSET $${paramIndex++};
      `;
      
      values.push(limit, offset);
      
      const result = await this.pool.query(query, values);
      
      this.metrics.queryLatency = performance.now() - startTime;
      return result.rows;
      
    } catch (error) {
      throw new Error(`Failed to query collision records: ${error.message}`);
    }
  }

  /**
   * Update collision review status
   */
  async updateCollisionReview(
    collisionId: string,
    review: {
      label: string;
      notes?: string;
      reviewedBy: string;
    }
  ): Promise<void> {
    const startTime = performance.now();
    
    try {
      // SECURITY: Validate inputs to prevent SQL injection
      if (!collisionId || typeof collisionId !== 'string') {
        throw new SecurityError('Invalid collision ID');
      }
      
      if (!review.label || typeof review.label !== 'string') {
        throw new SecurityError('Invalid review label');
      }
      
      if (!review.reviewedBy || typeof review.reviewedBy !== 'string') {
        throw new SecurityError('Invalid reviewer ID');
      }
      
      // SECURITY: Sanitize inputs
      const sanitizedCollisionId = collisionId.replace(/[^a-zA-Z0-9_-]/g, '');
      const sanitizedLabel = review.label.replace(/[^a-zA-Z0-9_-]/g, '');
      const sanitizedNotes = review.notes ? review.notes.substring(0, 1000) : null;
      const sanitizedReviewer = review.reviewedBy.replace(/[^a-zA-Z0-9_-]/g, '');

      const query = `
        UPDATE collision_log 
        SET 
          reviewer_label = $2,
          reviewer_notes = $3,
          reviewed_by = $4,
          reviewed_at = NOW()
        WHERE id = $1;
      `;
      
      const values = [
        sanitizedCollisionId,
        sanitizedLabel,
        sanitizedNotes,
        sanitizedReviewer
      ];
      
      await this.pool.query(query, values);
      
      this.metrics.queryLatency = performance.now() - startTime;
      
    } catch (error) {
      throw new Error(`Failed to update collision review: ${error.message}`);
    }
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<StorageMetrics['postgres']> {
    try {
      const queries = [
        'SELECT COUNT(*) FROM asset_metadata',
        'SELECT COUNT(*) FROM hash_record',
        'SELECT COUNT(*) FROM collision_log',
        'SELECT pg_size_pretty(pg_total_relation_size(\'asset_metadata\')) as metadata_size',
        'SELECT pg_size_pretty(pg_total_relation_size(\'hash_record\')) as hash_size',
        'SELECT pg_size_pretty(pg_total_relation_size(\'collision_log\')) as collision_size'
      ];
      
      const results = await Promise.all(
        queries.map(query => this.pool.query(query))
      );
      
      return {
        connections: this.metrics.connections,
        queryLatency: this.metrics.queryLatency,
        storageUsed: parseInt(results[3].rows[0].metadata_size.replace(/[^0-9]/g, '')),
        indexSize: parseInt(results[4].rows[0].hash_size.replace(/[^0-9]/g, ''))
      };
      
    } catch (error) {
      throw new Error(`Failed to get storage stats: ${error.message}`);
    }
  }

  /**
   * Cleanup old data (respecting WORM retention)
   */
  async cleanupOldData(): Promise<{
    deletedMetadata: number;
    deletedHashes: number;
  }> {
    const retentionDate = new Date();
    retentionDate.setDate(retentionDate.getDate() - 730); // 24 months
    
    try {
      const client = await this.pool.connect();
      await client.query('BEGIN');
      
      // Delete old metadata (not collision logs due to WORM)
      const metadataResult = await client.query(
        'DELETE FROM asset_metadata WHERE created_at < $1 RETURNING id',
        [retentionDate]
      );
      
      const hashResult = await client.query(
        'DELETE FROM hash_record WHERE created_at < $1 RETURNING id',
        [retentionDate]
      );
      
      await client.query('COMMIT');
      client.release();
      
      return {
        deletedMetadata: metadataResult.rowCount,
        deletedHashes: hashResult.rowCount
      };
      
    } catch (error) {
      throw new Error(`Cleanup failed: ${error.message}`);
    }
  }

  /**
   * Close connection pool
   */
  async close(): Promise<void> {
    await this.pool.end();
    this.logger.info('PostgreSQL connection pool closed');
  }
}
```

### Redis Cache Manager
```typescript
import Redis from 'ioredis';

export class RedisCacheManager {
  private config: StorageConfig['redis'];
  private redis: Redis;
  private metrics: StorageMetrics['redis'];

  constructor(config: StorageConfig['redis']) {
    this.config = config;
    this.metrics = {
      memoryUsed: 0,
      hitRate: 0,
      operationsPerSecond: 0,
      keyCount: 0
    };
    
    this.initializeRedis();
  }

  /**
   * Initialize Redis connection
   */
  private initializeRedis(): void {
    if (this.config.cluster?.enabled) {
      this.redis = new Redis.Cluster(this.config.cluster.nodes, {
        redisOptions: {
          password: this.config.password,
          db: this.config.db
        }
      });
    } else {
      this.redis = new Redis({
        host: this.config.host,
        port: this.config.port,
        password: this.config.password,
        db: this.config.db,
        keyPrefix: this.config.keyPrefix,
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3
      });
    }

    this.redis.on('connect', () => {
      console.log('Redis connected');
    });

    this.redis.on('error', (error) => {
      console.error('Redis error:', error);
    });
  }

  /**
   * Cache hash computation result
   */
  async cacheHashResult(
    assetId: string,
    hashResult: {
      pdqHash: string;
      ensembleHashes?: any;
      embedding?: any;
    }
  ): Promise<void> {
    const key = `hash:${assetId}`;
    const ttl = this.config.ttl.cache;
    
    await this.redis.setex(key, ttl, JSON.stringify(hashResult));
  }

  /**
   * Get cached hash result
   */
  async getCachedHashResult(assetId: string): Promise<any | null> {
    const key = `hash:${assetId}`;
    const result = await this.redis.get(key);
    
    if (result) {
      return JSON.parse(result);
    }
    
    return null;
  }

  /**
   * Cache collision query result
   */
  async cacheCollisionResult(
    queryHash: string,
    collisionResult: any
  ): Promise<void> {
    const key = `collision:${queryHash}`;
    const ttl = this.config.ttl.cache;
    
    await this.redis.setex(key, ttl, JSON.stringify(collisionResult));
  }

  /**
   * Get cached collision result
   */
  async getCachedCollisionResult(queryHash: string): Promise<any | null> {
    const key = `collision:${queryHash}`;
    const result = await this.redis.get(key);
    
    if (result) {
      return JSON.parse(result);
    }
    
    return null;
  }

  /**
   * Store temporary processing data
   */
  async setTempData(key: string, data: any): Promise<void> {
    const fullKey = `temp:${key}`;
    const ttl = this.config.ttl.temp;
    
    await this.redis.setex(fullKey, ttl, JSON.stringify(data));
  }

  /**
   * Get temporary processing data
   */
  async getTempData(key: string): Promise<any | null> {
    const fullKey = `temp:${key}`;
    const result = await this.redis.get(fullKey);
    
    if (result) {
      return JSON.parse(result);
    }
    
    return null;
  }

  /**
   * Delete cache entries
   */
  async deleteCache(pattern: string): Promise<number> {
    const keys = await this.redis.keys(`${this.config.keyPrefix}${pattern}`);
    if (keys.length === 0) {
      return 0;
    }
    
    return await this.redis.del(...keys);
  }

  /**
   * Get Redis statistics
   */
  async getStats(): Promise<StorageMetrics['redis']> {
    try {
      const info = await this.redis.info('memory');
      const stats = await this.redis.info('stats');
      
      const memoryMatch = info.match(/used_memory:(\d+)/);
      const keyspaceMatch = stats.match(/keyspace_hits:(\d+),keyspace_misses:(\d+)/);
      
      const memoryUsed = memoryMatch ? parseInt(memoryMatch[1]) : 0;
      const hits = keyspaceMatch ? parseInt(keyspaceMatch[1]) : 0;
      const misses = keyspaceMatch ? parseInt(keyspaceMatch[2]) : 0;
      const hitRate = (hits + misses) > 0 ? hits / (hits + misses) : 0;
      
      const keyCount = await this.redis.dbsize();
      
      return {
        memoryUsed,
        hitRate,
        operationsPerSecond: 0, // Would need to calculate over time
        keyCount
      };
      
    } catch (error) {
      throw new Error(`Failed to get Redis stats: ${error.message}`);
    }
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    await this.redis.quit();
  }
}
```

### RocksDB Hash Storage
```typescript
import * as rocksdb from 'rocksdb';

export class RocksDBHashStorage {
  private config: StorageConfig['rocksdb'];
  private db: rocksdb.Database;
  private metrics: StorageMetrics['rocksdb'];

  constructor(config: StorageConfig['rocksdb']) {
    this.config = config;
    this.metrics = {
      storageUsed: 0,
      readLatency: 0,
      writeLatency: 0,
      compactionProgress: 0
    };
    
    this.initializeDB();
  }

  /**
   * Initialize RocksDB database
   */
  private initializeDB(): void {
    const options = {
      createIfMissing: this.config.createIfMissing,
      compression: this.config.compression,
      writeBufferSize: this.config.writeBufferSize,
      maxWriteBufferNumber: this.config.maxWriteBufferNumber,
      blockSize: this.config.blockSize
    };
    
    this.db = rocksdb.open(this.config.path, options);
  }

  /**
   * Store PDQ hash with metadata
   */
  async storePDQHash(
    key: string,
    hash: Buffer,
    metadata: any
  ): Promise<void> {
    const startTime = performance.now();
    
    try {
      const value = JSON.stringify({
        hash: hash.toString('hex'),
        metadata,
        timestamp: new Date().toISOString()
      });
      
      await this.db.put(key, value);
      
      this.metrics.writeLatency = performance.now() - startTime;
      
    } catch (error) {
      throw new Error(`Failed to store PDQ hash: ${error.message}`);
    }
  }

  /**
   * Get PDQ hash with metadata
   */
  async getPDQHash(key: string): Promise<{
    hash: Buffer;
    metadata: any;
    timestamp: string;
  } | null> {
    const startTime = performance.now();
    
    try {
      const value = await this.db.get(key);
      
      if (!value) {
        return null;
      }
      
      const parsed = JSON.parse(value.toString());
      
      this.metrics.readLatency = performance.now() - startTime;
      
      return {
        hash: Buffer.from(parsed.hash, 'hex'),
        metadata: parsed.metadata,
        timestamp: parsed.timestamp
      };
      
    } catch (error) {
      if (error.message.includes('NotFound')) {
        return null;
      }
      throw new Error(`Failed to get PDQ hash: ${error.message}`);
    }
  }

  /**
   * Batch store hashes
   */
  async batchStoreHashes(
    entries: Array<{ key: string; hash: Buffer; metadata: any }>
  ): Promise<void> {
    const startTime = performance.now();
    
    try {
      const batch = this.db.batch();
      
      for (const entry of entries) {
        const value = JSON.stringify({
          hash: entry.hash.toString('hex'),
          metadata: entry.metadata,
          timestamp: new Date().toISOString()
        });
        
        batch.put(entry.key, value);
      }
      
      await batch.write();
      
      this.metrics.writeLatency = performance.now() - startTime;
      
    } catch (error) {
      throw new Error(`Failed to batch store hashes: ${error.message}`);
    }
  }

  /**
   * Delete hash
   */
  async deleteHash(key: string): Promise<void> {
    try {
      await this.db.del(key);
    } catch (error) {
      throw new Error(`Failed to delete hash: ${error.message}`);
    }
  }

  /**
   * Get storage statistics
   */
  async getStats(): Promise<StorageMetrics['rocksdb']> {
    try {
      // Get approximate file size
      const stats = await fs.stat(this.config.path);
      const storageUsed = stats.size;
      
      return {
        storageUsed,
        readLatency: this.metrics.readLatency,
        writeLatency: this.metrics.writeLatency,
        compactionProgress: 0 // Would need to implement compaction monitoring
      };
      
    } catch (error) {
      throw new Error(`Failed to get RocksDB stats: ${error.message}`);
    }
  }

  /**
   * Compact database
   */
  async compact(): Promise<void> {
    try {
      await this.db.compactRange();
      this.metrics.compactionProgress = 100;
    } catch (error) {
      throw new Error(`Failed to compact database: ${error.message}`);
    }
  }

  /**
   * Close database
   */
  async close(): Promise<void> {
    this.db.close();
  }
}
```

### Unified Storage Manager
```typescript
export class UnifiedStorageManager {
  private config: StorageConfig;
  private postgres: PostgreSQLStorageManager;
  private redis: RedisCacheManager;
  private rocksdb: RocksDBHashStorage;
  private metrics: StorageMetrics;

  constructor(config: StorageConfig) {
    this.config = config;
    
    this.postgres = new PostgreSQLStorageManager(config.postgres);
    this.redis = new RedisCacheManager(config.redis);
    this.rocksdb = new RocksDBHashStorage(config.rocksdb);
    
    this.metrics = {
      postgres: {} as any,
      redis: {} as any,
      rocksdb: {} as any,
      s3: {} as any
    };
  }

  /**
   * Initialize all storage components
   */
  async initialize(): Promise<void> {
    await Promise.all([
      this.postgres.initializeSchema(),
      // Redis and RocksDB initialize in constructors
    ]);
  }

  /**
   * Store complete asset record
   */
  async storeAssetRecord(record: {
    metadata: any;
    hashes: any;
    collision?: any;
  }): Promise<{
    metadataId: string;
    hashId: string;
    collisionId?: string;
  }> {
    // Store metadata
    const metadataId = await this.postgres.insertAssetMetadata(record.metadata);
    
    // Store hashes
    const hashId = await this.postgres.insertHashRecord({
      ...record.hashes,
      tenantId: record.metadata.tenantId,
      assetId: record.metadata.assetId
    });
    
    // Cache hash result
    await this.redis.cacheHashResult(record.metadata.assetId, record.hashes);
    
    // Store in RocksDB for fast access
    await this.rocksdb.storePDQHash(
      `${record.metadata.tenantId}:${record.metadata.assetId}`,
      Buffer.from(record.hashes.pdqHash, 'hex'),
      record.hashes
    );
    
    let collisionId;
    if (record.collision) {
      collisionId = await this.postgres.insertCollisionRecord({
        ...record.collision,
        tenantId: record.metadata.tenantId
      });
    }
    
    return { metadataId, hashId, collisionId };
  }

  /**
   * Get complete asset record
   */
  async getAssetRecord(
    tenantId: string,
    assetId: string
  ): Promise<{
    metadata: any;
    hashes: any;
  } | null> {
    // Try cache first
    const cachedHashes = await this.redis.getCachedHashResult(assetId);
    
    if (cachedHashes) {
      // Get metadata from database
      const metadata = await this.postgres.getAssetMetadata(tenantId, assetId);
      
      if (metadata) {
        return { metadata, hashes: cachedHashes };
      }
    }
    
    // Get from database
    const hashRecords = await this.postgres.getHashRecordsByTenant(tenantId, {
      limit: 1,
      offset: 0
    });
    
    const hashRecord = hashRecords.find(r => r.asset_id === assetId);
    
    if (!hashRecord) {
      return null;
    }
    
    const metadata = await this.postgres.getAssetMetadata(tenantId, assetId);
    
    if (!metadata) {
      return null;
    }
    
    const hashes = {
      pdqHash: hashRecord.pdq_hex,
      pdqQuality: hashRecord.pdq_quality,
      ensembleHashes: hashRecord.ensemble_hashes,
      embeddingId: hashRecord.embedding_id,
      embeddingConfidence: hashRecord.embedding_confidence,
      manifestLineage: hashRecord.manifest_lineage
    };
    
    // Cache the result
    await this.redis.cacheHashResult(assetId, hashes);
    
    return { metadata, hashes };
  }

  /**
   * Get comprehensive storage metrics
   */
  async getMetrics(): Promise<StorageMetrics> {
    const [postgresStats, redisStats, rocksdbStats] = await Promise.all([
      this.postgres.getStorageStats(),
      this.redis.getStats(),
      this.rocksdb.getStats()
    ]);
    
    return {
      postgres: postgresStats,
      redis: redisStats,
      rocksdb: rocksdbStats,
      s3: {
        objectsStored: 0,
        storageUsed: 0,
        transferIn: 0,
        transferOut: 0
      }
    };
  }

  /**
   * Perform maintenance tasks
   */
  async performMaintenance(): Promise<{
    cleanupResults: any;
    compactionResults: any;
    cacheCleanup: number;
  }> {
    const [cleanupResults, compactionResults, cacheCleanup] = await Promise.all([
      this.postgres.cleanupOldData(),
      this.rocksdb.compact(),
      this.redis.deleteCache('temp:*')
    ]);
    
    return {
      cleanupResults,
      compactionResults,
      cacheCleanup
    };
  }

  /**
   * Close all storage connections
   */
  async close(): Promise<void> {
    await Promise.all([
      this.postgres.close(),
      this.redis.close(),
      this.rocksdb.close()
    ]);
  }
}
```
