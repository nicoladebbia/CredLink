# Collision Detection Query System Implementation

## Overview
Advanced query system for detecting visual collisions with sophisticated lineage filtering, conflict analysis, and tunable sensitivity controls. Supports real-time detection, batch analysis, and cross-tenant correlation.

## Dependencies
```json
{
  "dependencies": {
    "redis": "^4.6.8",
    "postgres": "^3.4.3",
    "bull": "^4.11.3",
    "zod": "^3.22.2",
    "date-fns": "^2.30.0"
  }
}
```

## Core Implementation

### Query Configuration and Types
```typescript
export interface QueryConfig {
  // Sensitivity Configuration
  sensitivity: {
    pdqThreshold: number;        // Hamming distance threshold (0-256)
    embeddingThreshold: number; // Cosine similarity threshold (0-1)
    ensembleThreshold: number;  // Ensemble voting threshold (0-1)
    consensusThreshold: number; // Minimum algorithm agreement (0-1)
  };
  
  // Filtering Configuration
  filtering: {
    enableLineageFilter: boolean;
    enableTemporalFilter: boolean;
    enableTenantFilter: boolean;
    enableQualityFilter: boolean;
    minQualityScore: number;
    maxTimeDiff: number;         // Maximum time difference in days
  };
  
  // Performance Configuration
  performance: {
    maxCandidates: number;       // Maximum candidates to evaluate
    enableEarlyExit: boolean;    // Stop after finding N high-confidence matches
    earlyExitCount: number;
    cacheEnabled: boolean;
    cacheTTL: number;
  };
  
  // Cross-tenant Configuration
  crossTenant: {
    enabled: boolean;
    requireOptIn: boolean;
    sharedFields: string[];      // Fields shared across tenants
    aggregationMethod: 'union' | 'intersection' | 'weighted';
  };
}

export interface CollisionQuery {
  assetId: string;
  tenantId: string;
  queryType: 'single' | 'batch' | 'periodic' | 'cross-tenant';
  filters: {
    timeRange?: {
      start: Date;
      end: Date;
    };
    tenantIds?: string[];
    excludeSameIssuer?: boolean;
    excludeSameParent?: boolean;
    qualityRange?: {
      min: number;
      max: number;
    };
    conflictTypes?: ConflictType[];
  };
  options: {
    limit?: number;
    offset?: number;
    sortBy?: 'similarity' | 'confidence' | 'date';
    sortOrder?: 'asc' | 'desc';
    includeMetadata?: boolean;
    includeLineageDiff?: boolean;
  };
}

export interface CollisionResult {
  id: string;
  primaryAsset: {
    assetId: string;
    tenantId: string;
    hashes: {
      pdq?: PDQHash;
      ensemble?: EnsembleHashes;
      embedding?: DenseEmbedding;
    };
    lineage: ManifestLineage;
  };
  conflictingAssets: Array<{
    assetId: string;
    tenantId: string;
    similarity: {
      pdq: number;
      ensemble?: number;
      embedding?: number;
      combined: number;
    };
    confidence: number;
    conflictType: ConflictType;
    lineage: ManifestLineage;
    lineageDiff: LineageDiff;
    metadata?: AssetMetadata;
  }>;
  queryMetrics: {
    totalCandidates: number;
    filteredCandidates: number;
    processingTime: number;
    cacheHit: boolean;
  };
  timestamp: Date;
}

export interface ConflictType {
  type: 'issuer_mismatch' | 'parent_mismatch' | 'temporal_anomaly' | 'assertion_conflict';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
}

export interface LineageDiff {
  issuerKeyId: {
    primary: string;
    conflicting: string;
    differs: boolean;
  };
  parentHash: {
    primary: string;
    conflicting: string;
    differs: boolean;
  };
  timestamp: {
    primary: string;
    conflicting: string;
    difference: number; // in seconds
    differs: boolean;
  };
  assertions: {
    added: string[];
    removed: string[];
    modified: Array<{ field: string; primary: any; conflicting: any }>;
  };
}
```

### Lineage Analyzer
```typescript
export class LineageAnalyzer {
  private config: QueryConfig['filtering'];

  constructor(config: QueryConfig['filtering']) {
    this.config = config;
  }

  /**
   * Extract lineage from C2PA manifest
   */
  extractLineage(manifest: any): ManifestLineage {
    return {
      issuerKeyId: this.extractIssuerKeyId(manifest),
      parentHash: this.extractParentHash(manifest),
      assetId: this.extractAssetId(manifest),
      timestamp: this.extractTimestamp(manifest),
      assertions: this.extractAssertions(manifest)
    };
  }

  /**
   * Check if two lineages have conflicting claims
   */
  hasConflictingClaims(
    lineage1: ManifestLineage,
    lineage2: ManifestLineage,
    filters?: CollisionQuery['filters']
  ): { hasConflict: boolean; conflictType: ConflictType } {
    const conflicts: ConflictType[] = [];

    // Check issuer key mismatch
    if (this.shouldCheckIssuerMismatch(filters)) {
      if (lineage1.issuerKeyId && lineage2.issuerKeyId && 
          lineage1.issuerKeyId !== lineage2.issuerKeyId) {
        conflicts.push({
          type: 'issuer_mismatch',
          severity: 'high',
          description: 'Different issuer keys detected'
        });
      }
    }

    // Check parent hash mismatch
    if (this.shouldCheckParentMismatch(filters)) {
      if (lineage1.parentHash && lineage2.parentHash && 
          lineage1.parentHash !== lineage2.parentHash) {
        conflicts.push({
          type: 'parent_mismatch',
          severity: 'medium',
          description: 'Different parent hashes detected'
        });
      }
    }

    // Check temporal anomalies
    if (this.config.enableTemporalFilter) {
      const timeDiff = this.calculateTimeDifference(lineage1.timestamp, lineage2.timestamp);
      if (Math.abs(timeDiff) > this.config.maxTimeDiff * 24 * 60 * 60) {
        conflicts.push({
          type: 'temporal_anomaly',
          severity: 'low',
          description: 'Significant timestamp difference detected'
        });
      }
    }

    // Check assertion conflicts
    const assertionConflicts = this.findAssertionConflicts(lineage1, lineage2);
    conflicts.push(...assertionConflicts);

    // Return highest severity conflict
    if (conflicts.length === 0) {
      return { hasConflict: false, conflictType: null as any };
    }

    const highestSeverity = this.getHighestSeverity(conflicts);
    const primaryConflict = conflicts.find(c => c.severity === highestSeverity)!;

    return { hasConflict: true, conflictType: primaryConflict };
  }

  /**
   * Generate detailed lineage difference
   */
  generateLineageDiff(
    primary: ManifestLineage,
    conflicting: ManifestLineage
  ): LineageDiff {
    return {
      issuerKeyId: {
        primary: primary.issuerKeyId || '',
        conflicting: conflicting.issuerKeyId || '',
        differs: primary.issuerKeyId !== conflicting.issuerKeyId
      },
      parentHash: {
        primary: primary.parentHash || '',
        conflicting: conflicting.parentHash || '',
        differs: primary.parentHash !== conflicting.parentHash
      },
      timestamp: {
        primary: primary.timestamp || '',
        conflicting: conflicting.timestamp || '',
        difference: this.calculateTimeDifference(primary.timestamp, conflicting.timestamp),
        differs: primary.timestamp !== conflicting.timestamp
      },
      assertions: this.compareAssertions(primary.assertions, conflicting.assertions)
    };
  }

  /**
   * Filter candidates based on lineage rules
   */
  filterCandidatesByLineage(
    candidates: Array<{ assetId: string; lineage: ManifestLineage }>,
    queryLineage: ManifestLineage,
    filters?: CollisionQuery['filters']
  ): Array<{ assetId: string; lineage: ManifestLineage }> {
    return candidates.filter(candidate => {
      // Filter out same lineage (no conflict)
      const { hasConflict } = this.hasConflictingClaims(
        queryLineage,
        candidate.lineage,
        filters
      );
      
      if (!hasConflict) {
        return false;
      }

      // Apply temporal filter
      if (this.config.enableTemporalFilter && filters?.timeRange) {
        const candidateTime = new Date(candidate.lineage.timestamp);
        if (candidateTime < filters.timeRange.start || candidateTime > filters.timeRange.end) {
          return false;
        }
      }

      // Apply tenant filter
      if (this.config.enableTenantFilter && filters?.tenantIds) {
        // This would be handled at a higher level with tenant information
      }

      return true;
    });
  }

  /**
   * Extract issuer key ID from manifest
   */
  private extractIssuerKeyId(manifest: any): string {
    return manifest.claim_generator?.split('/')[0] || '';
  }

  /**
   * Extract parent hash from manifest
   */
  private extractParentHash(manifest: any): string {
    const parentAssertion = manifest.assertions?.find((a: any) => a.label === 'c2pa.parent');
    return parentAssertion?.data?.hash || '';
  }

  /**
   * Extract asset ID from manifest
   */
  private extractAssetId(manifest: any): string {
    return manifest.claim_generator?.split('/').pop() || '';
  }

  /**
   * Extract timestamp from manifest
   */
  private extractTimestamp(manifest: any): string {
    const actionAssertion = manifest.assertions?.find((a: any) => a.label === 'c2pa.actions');
    return actionAssertion?.timestamp || new Date().toISOString();
  }

  /**
   * Extract assertions from manifest
   */
  private extractAssertions(manifest: any): Record<string, any> {
    const assertions: Record<string, any> = {};
    
    manifest.assertions?.forEach((assertion: any) => {
      assertions[assertion.label] = assertion.data;
    });
    
    return assertions;
  }

  /**
   * Check if issuer mismatch should be evaluated
   */
  private shouldCheckIssuerMismatch(filters?: CollisionQuery['filters']): boolean {
    return !filters?.excludeSameIssuer !== false; // Default to true
  }

  /**
   * Check if parent mismatch should be evaluated
   */
  private shouldCheckParentMismatch(filters?: CollisionQuery['filters']): boolean {
    return !filters?.excludeSameParent !== false; // Default to true
  }

  /**
   * Calculate time difference in seconds
   */
  private calculateTimeDifference(timestamp1: string, timestamp2: string): number {
    const time1 = new Date(timestamp1).getTime();
    const time2 = new Date(timestamp2).getTime();
    return Math.abs(time1 - time2) / 1000;
  }

  /**
   * Find assertion conflicts
   */
  private findAssertionConflicts(
    lineage1: ManifestLineage,
    lineage2: ManifestLineage
  ): ConflictType[] {
    const conflicts: ConflictType[] = [];
    
    const keys1 = Object.keys(lineage1.assertions);
    const keys2 = Object.keys(lineage2.assertions);
    const allKeys = new Set([...keys1, ...keys2]);
    
    for (const key of allKeys) {
      const value1 = lineage1.assertions[key];
      const value2 = lineage2.assertions[key];
      
      if (JSON.stringify(value1) !== JSON.stringify(value2)) {
        conflicts.push({
          type: 'assertion_conflict',
          severity: 'medium',
          description: `Conflicting assertion in ${key}`
        });
      }
    }
    
    return conflicts;
  }

  /**
   * Compare assertions between two lineages
   */
  private compareAssertions(
    assertions1: Record<string, any>,
    assertions2: Record<string, any>
  ): LineageDiff['assertions'] {
    const keys1 = Object.keys(assertions1);
    const keys2 = Object.keys(assertions2);
    
    const added = keys2.filter(key => !keys1.includes(key));
    const removed = keys1.filter(key => !keys2.includes(key));
    const modified: Array<{ field: string; primary: any; conflicting: any }> = [];
    
    const commonKeys = keys1.filter(key => keys2.includes(key));
    for (const key of commonKeys) {
      if (JSON.stringify(assertions1[key]) !== JSON.stringify(assertions2[key])) {
        modified.push({
          field: key,
          primary: assertions1[key],
          conflicting: assertions2[key]
        });
      }
    }
    
    return { added, removed, modified };
  }

  /**
   * Get highest severity from conflicts
   */
  private getHighestSeverity(conflicts: ConflictType[]): ConflictType['severity'] {
    const severityOrder = ['low', 'medium', 'high', 'critical'];
    
    for (const severity of severityOrder.reverse()) {
      if (conflicts.some(c => c.severity === severity)) {
        return severity as ConflictType['severity'];
      }
    }
    
    return 'low';
  }
}
```

### Collision Detection Engine
```typescript
export class CollisionDetectionEngine {
  private config: QueryConfig;
  private collisionIndex: CollisionIndex;
  private lineageAnalyzer: LineageAnalyzer;
  private cache: Map<string, CollisionResult> = new Map();
  private metrics: QueryMetrics;

  constructor(
    config: QueryConfig,
    collisionIndex: CollisionIndex,
    lineageAnalyzer: LineageAnalyzer
  ) {
    this.config = config;
    this.collisionIndex = collisionIndex;
    this.lineageAnalyzer = lineageAnalyzer;
    this.metrics = new QueryMetrics();
  }

  /**
   * Detect collisions for a single asset
   */
  async detectCollisions(query: CollisionQuery): Promise<CollisionResult> {
    const startTime = performance.now();
    
    try {
      // Check cache first
      if (this.config.performance.cacheEnabled) {
        const cached = this.getFromCache(query);
        if (cached) {
          this.metrics.recordCacheHit();
          return cached;
        }
      }

      // Get asset hashes and lineage
      const assetData = await this.getAssetData(query.assetId, query.tenantId);
      
      // Query for similar candidates
      const candidates = await this.querySimilarCandidates(
        assetData.hashes,
        query.options.limit || this.config.performance.maxCandidates
      );

      // Filter by lineage
      const filteredCandidates = this.lineageAnalyzer.filterCandidatesByLineage(
        candidates,
        assetData.lineage,
        query.filters
      );

      // Analyze conflicts and rank results
      const conflictingAssets = await this.analyzeConflicts(
        filteredCandidates,
        assetData,
        query
      );

      // Sort and limit results
      const sortedResults = this.sortAndLimitResults(conflictingAssets, query.options);

      const result: CollisionResult = {
        id: this.generateResultId(query),
        primaryAsset: assetData,
        conflictingAssets: sortedResults,
        queryMetrics: {
          totalCandidates: candidates.length,
          filteredCandidates: filteredCandidates.length,
          processingTime: performance.now() - startTime,
          cacheHit: false
        },
        timestamp: new Date()
      };

      // Cache result
      if (this.config.performance.cacheEnabled) {
        this.cacheResult(query, result);
      }

      this.metrics.recordQuery(result.queryMetrics);
      return result;

    } catch (error) {
      this.metrics.recordError(error);
      throw new Error(`Collision detection failed: ${error.message}`);
    }
  }

  /**
   * Batch collision detection for multiple assets
   */
  async detectBatchCollisions(queries: CollisionQuery[]): Promise<CollisionResult[]> {
    const results: CollisionResult[] = [];
    
    // Process in parallel batches to avoid overwhelming the system
    const batchSize = 10;
    for (let i = 0; i < queries.length; i += batchSize) {
      const batch = queries.slice(i, i + batchSize);
      const batchPromises = batch.map(query => this.detectCollisions(query));
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }
    
    return results;
  }

  /**
   * Periodic collision detection for monitoring
   */
  async detectPeriodicCollisions(
    tenantId: string,
    timeRange: { start: Date; end: Date },
    options?: { interval?: number; batchSize?: number }
  ): Promise<{
    totalAssets: number;
    collisionsFound: number;
    highRiskCollisions: number;
    results: CollisionResult[];
  }> {
    const interval = options?.interval || 3600000; // 1 hour default
    const batchSize = options?.batchSize || 100;
    
    // Get assets in time range
    const assets = await this.getAssetsInTimeRange(tenantId, timeRange);
    
    const results: CollisionResult[] = [];
    let highRiskCount = 0;
    
    // Process in batches
    for (let i = 0; i < assets.length; i += batchSize) {
      const batch = assets.slice(i, i + batchSize);
      const queries: CollisionQuery[] = batch.map(asset => ({
        assetId: asset.id,
        tenantId,
        queryType: 'periodic',
        filters: {
          timeRange,
          conflictTypes: ['issuer_mismatch', 'parent_mismatch']
        },
        options: { limit: 10, sortBy: 'similarity', sortOrder: 'desc' }
      }));
      
      const batchResults = await this.detectBatchCollisions(queries);
      results.push(...batchResults);
      
      // Count high-risk collisions
      highRiskCount += batchResults.filter(result => 
        result.conflictingAssets.some(asset => 
          asset.conflictType.severity === 'high' || asset.conflictType.severity === 'critical'
        )
      ).length;
      
      // Wait between batches to avoid rate limiting
      if (i + batchSize < assets.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    return {
      totalAssets: assets.length,
      collisionsFound: results.length,
      highRiskCollisions: highRiskCount,
      results
    };
  }

  /**
   * Cross-tenant collision detection
   */
  async detectCrossTenantCollisions(
    query: CollisionQuery,
    participantTenants: string[]
  ): Promise<CollisionResult> {
    if (!this.config.crossTenant.enabled) {
      throw new Error('Cross-tenant detection is disabled');
    }

    // Get opt-in tenants
    const optInTenants = await this.getOptInTenants(participantTenants);
    
    // Query across all participating tenants
    const crossTenantQuery: CollisionQuery = {
      ...query,
      queryType: 'cross-tenant',
      filters: {
        ...query.filters,
        tenantIds: optInTenants
      }
    };

    return this.detectCollisions(crossTenantQuery);
  }

  /**
   * Get asset data including hashes and lineage
   */
  private async getAssetData(
    assetId: string,
    tenantId: string
  ): Promise<{
    hashes: { pdq?: PDQHash; ensemble?: EnsembleHashes; embedding?: DenseEmbedding };
    lineage: ManifestLineage;
  }> {
    // This would fetch from storage or database
    // For now, return mock data
    return {
      hashes: {
        pdq: { binary: Buffer.alloc(32), hex: '0'.repeat(64), quality: 100 } as PDQHash
      },
      lineage: {
        issuerKeyId: 'test-issuer',
        parentHash: 'test-parent',
        assetId,
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Query for similar candidates from index
   */
  private async querySimilarCandidates(
    hashes: { pdq?: PDQHash; ensemble?: EnsembleHashes; embedding?: DenseEmbedding },
    limit: number
  ): Promise<Array<{ assetId: string; lineage: ManifestLineage }>> {
    const candidates = [];
    
    if (hashes.pdq) {
      const pdqCandidates = await this.collisionIndex.queryCollisions(
        { pdqHash: hashes.pdq.binary, embedding: hashes.embedding?.vector },
        {
          pdqThreshold: this.config.sensitivity.pdqThreshold,
          embeddingThreshold: this.config.sensitivity.embeddingThreshold,
          limit,
          useTwoStage: !!hashes.embedding
        }
      );
      
      candidates.push(...pdqCandidates.map(candidate => ({
        assetId: candidate.assetId,
        lineage: {} as ManifestLineage // Would be fetched from storage
      })));
    }
    
    return candidates.slice(0, limit);
  }

  /**
   * Analyze conflicts for candidates
   */
  private async analyzeConflicts(
    candidates: Array<{ assetId: string; lineage: ManifestLineage }>,
    primaryAsset: any,
    query: CollisionQuery
  ): Promise<CollisionResult['conflictingAssets']> {
    const conflictingAssets = [];
    
    for (const candidate of candidates) {
      const { hasConflict, conflictType } = this.lineageAnalyzer.hasConflictingClaims(
        primaryAsset.lineage,
        candidate.lineage,
        query.filters
      );
      
      if (hasConflict) {
        const similarity = await this.calculateSimilarity(primaryAsset, candidate);
        const lineageDiff = this.lineageAnalyzer.generateLineageDiff(
          primaryAsset.lineage,
          candidate.lineage
        );
        
        conflictingAssets.push({
          assetId: candidate.assetId,
          tenantId: candidate.lineage.assetId.split(':')[0] || 'unknown',
          similarity,
          confidence: this.calculateConfidence(similarity, conflictType),
          conflictType,
          lineage: candidate.lineage,
          lineageDiff
        });
      }
    }
    
    return conflictingAssets;
  }

  /**
   * Calculate similarity between assets
   */
  private async calculateSimilarity(
    asset1: any,
    asset2: any
  ): Promise<{ pdq: number; ensemble?: number; embedding?: number; combined: number }> {
    // This would use the actual hash comparison engines
    return {
      pdq: 0.9,
      combined: 0.9
    };
  }

  /**
   * Calculate confidence score
   */
  private calculateConfidence(
    similarity: any,
    conflictType: ConflictType
  ): number {
    const baseConfidence = similarity.combined;
    const severityMultiplier = {
      'low': 0.8,
      'medium': 0.9,
      'high': 1.0,
      'critical': 1.1
    };
    
    return Math.min(1.0, baseConfidence * severityMultiplier[conflictType.severity]);
  }

  /**
   * Sort and limit results
   */
  private sortAndLimitResults(
    results: CollisionResult['conflictingAssets'],
    options?: CollisionQuery['options']
  ): CollisionResult['conflictingAssets'] {
    const sortBy = options?.sortBy || 'similarity';
    const sortOrder = options?.sortOrder || 'desc';
    const limit = options?.limit || 50;
    
    return results
      .sort((a, b) => {
        const aValue = a[sortBy as keyof typeof a] as number;
        const bValue = b[sortBy as keyof typeof b] as number;
        return sortOrder === 'desc' ? bValue - aValue : aValue - bValue;
      })
      .slice(0, limit);
  }

  /**
   * Get assets in time range
   */
  private async getAssetsInTimeRange(
    tenantId: string,
    timeRange: { start: Date; end: Date }
  ): Promise<Array<{ id: string }>> {
    // This would query the database for assets in the time range
    return [];
  }

  /**
   * Get opt-in tenants for cross-tenant detection
   */
  private async getOptInTenants(tenantIds: string[]): Promise<string[]> {
    // This would check which tenants have opted in to cross-tenant sharing
    return tenantIds;
  }

  /**
   * Generate result ID for caching
   */
  private generateResultId(query: CollisionQuery): string {
    const hash = createHash('md5');
    hash.update(`${query.assetId}:${query.tenantId}:${JSON.stringify(query.filters)}`);
    return hash.digest('hex');
  }

  /**
   * Get result from cache
   */
  private getFromCache(query: CollisionQuery): CollisionResult | null {
    const id = this.generateResultId(query);
    const cached = this.cache.get(id);
    
    if (cached) {
      const age = Date.now() - cached.timestamp.getTime();
      if (age < this.config.performance.cacheTTL) {
        return cached;
      } else {
        this.cache.delete(id);
      }
    }
    
    return null;
  }

  /**
   * Cache result
   */
  private cacheResult(query: CollisionQuery, result: CollisionResult): void {
    const id = this.generateResultId(query);
    this.cache.set(id, result);
    
    // Cleanup old cache entries
    if (this.cache.size > 1000) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
  }

  /**
   * Get query metrics
   */
  getMetrics(): QueryMetrics {
    return this.metrics;
  }
}
```

### Query Metrics and Monitoring
```typescript
export class QueryMetrics {
  private metrics: {
    totalQueries: number;
    successfulQueries: number;
    failedQueries: number;
    cacheHits: number;
    avgProcessingTime: number;
    totalProcessingTime: number;
    errorCounts: Map<string, number>;
  };

  constructor() {
    this.metrics = {
      totalQueries: 0,
      successfulQueries: 0,
      failedQueries: 0,
      cacheHits: 0,
      avgProcessingTime: 0,
      totalProcessingTime: 0,
      errorCounts: new Map()
    };
  }

  recordQuery(queryMetrics: CollisionResult['queryMetrics']): void {
    this.metrics.totalQueries++;
    this.metrics.successfulQueries++;
    this.metrics.totalProcessingTime += queryMetrics.processingTime;
    this.metrics.avgProcessingTime = this.metrics.totalProcessingTime / this.metrics.totalQueries;
  }

  recordCacheHit(): void {
    this.metrics.cacheHits++;
  }

  recordError(error: Error): void {
    this.metrics.failedQueries++;
    const count = this.metrics.errorCounts.get(error.name) || 0;
    this.metrics.errorCounts.set(error.name, count + 1);
  }

  getSnapshot(): {
    totalQueries: number;
    successRate: number;
    errorRate: number;
    cacheHitRate: number;
    avgProcessingTime: number;
    errorBreakdown: Record<string, number>;
  } {
    return {
      totalQueries: this.metrics.totalQueries,
      successRate: this.metrics.totalQueries > 0 
        ? this.metrics.successfulQueries / this.metrics.totalQueries 
        : 0,
      errorRate: this.metrics.totalQueries > 0 
        ? this.metrics.failedQueries / this.metrics.totalQueries 
        : 0,
      cacheHitRate: this.metrics.totalQueries > 0 
        ? this.metrics.cacheHits / this.metrics.totalQueries 
        : 0,
      avgProcessingTime: this.metrics.avgProcessingTime,
      errorBreakdown: Object.fromEntries(this.metrics.errorCounts)
    };
  }

  reset(): void {
    this.metrics = {
      totalQueries: 0,
      successfulQueries: 0,
      failedQueries: 0,
      cacheHits: 0,
      avgProcessingTime: 0,
      totalProcessingTime: 0,
      errorCounts: new Map()
    };
  }
}
```
