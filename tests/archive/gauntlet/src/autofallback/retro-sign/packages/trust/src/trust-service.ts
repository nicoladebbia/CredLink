/**
 * Phase 11 — Trust Graph & Badge Reputation v1
 * Trust service with graph loader, path resolver, and caching
 */

import {
  TrustNode,
  TrustEdge,
  Revocation,
  TrustScore,
  TrustPath,
  TrustSnippet,
  VerificationContext,
  TrustCacheEntry,
  TrustGraphStats,
  TrustServiceConfig,
  GraphError,
  RevocationError,
  RevocationSource,
  DatabaseConnection,
  DatabaseResult,
  RevocationEvent,
  CacheInvalidationEvent,
  DetailedTrustPath
} from './types';

import {
  scoreTrustPath,
  generateTrustSummary,
  buildTrustPath,
  DEFAULT_WEIGHTS,
  DEFAULT_GRADE_BOUNDARIES,
  validateScoringConfig
} from './scoring';

import { TrustCache, MemoryTrustCache, CacheUtils } from './cache';

import { generateSecureEdgeId } from '../../apps/api/src/utils/crypto';

/**
 * Trust Service - main class for trust graph operations
 */
export class TrustService {
  private config: TrustServiceConfig;
  private cache: TrustCache;
  private db: DatabaseConnection; // Database connection (Postgres/SQLite)
  private eventEmitter: EventTarget; // Event bus for revocation notifications

  constructor(config: Partial<TrustServiceConfig> = {}, db?: DatabaseConnection, cache?: TrustCache) {
    this.config = {
      cache_ttl_seconds: 300,
      revocation_poll_interval_seconds: 180,
      scoring_weights: DEFAULT_WEIGHTS,
      grade_boundaries: DEFAULT_GRADE_BOUNDARIES,
      trust_root_cas: [],
      revocation_sources: [],
      ...config
    };

    this.db = db;
    this.cache = cache || new MemoryTrustCache(this.config.cache_ttl_seconds);
    this.eventEmitter = new EventTarget();

    // Validate configuration
    validateScoringConfig(this.config.scoring_weights);

    // Start revocation polling
    this.startRevocationPolling();
  }

  /**
   * Resolve trust snippet for a key ID
   */
  async resolveTrustSnippet(
    keyId: string,
    context: VerificationContext
  ): Promise<TrustSnippet> {
    
    // Check cache first
    const cacheKey = CacheUtils.generateTrustKey(keyId, context);
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      return cached.snippet;
    }

    try {
      // Load trust path from database
      const trustPath = await this.loadTrustPath(keyId);
      
      if (!trustPath.key) {
        throw new GraphError(`Key not found: ${keyId}`);
      }

      // Get current revocation status
      const revocationStatus = await this.getRevocationStatus(keyId);

      // Compute trust score
      const scoringResult = scoreTrustPath(
        trustPath.org!,
        trustPath.key,
        trustPath.device,
        context,
        this.config.scoring_weights,
        this.config.grade_boundaries
      );

      // Build trust snippet
      const snippet: TrustSnippet = {
        summary: generateTrustSummary(trustPath.org!, trustPath.key, scoringResult),
        score: scoringResult.score,
        grade: scoringResult.grade,
        path: trustPath,
        revocation: {
          status: revocationStatus.status,
          checked_at: new Date().toISOString()
        },
        components: scoringResult.components,
        ttl_seconds: this.config.cache_ttl_seconds,
        disclaimer: 'Guidance score reflects provenance & identity signals, not content truth.'
      };

      // Cache the result
      const cacheEntry = CacheUtils.createCacheEntry(keyId, snippet, this.config.cache_ttl_seconds);
      await this.cache.set(cacheKey, cacheEntry);

      // Update key usage statistics
      await this.updateKeyUsage(keyId, context);

      return snippet;

    } catch (error) {
      throw new GraphError(`Failed to resolve trust snippet for ${keyId}: ${error.message}`, error);
    }
  }

  /**
   * Load trust path for a key ID from database
   */
  private async loadTrustPath(keyId: string): Promise<TrustPath> {
    if (!this.db) {
      throw new GraphError('Database connection not available');
    }

    try {
      // Use the SQL function we created to get the trust path
      const query = `
        SELECT * FROM compute_trust_path($1)
      `;
      
      const result = await this.db.query(query, [keyId]);
      
      if (result.rows.length === 0) {
        throw new GraphError(`No trust path found for key: ${keyId}`);
      }

      const row = result.rows[0];

      // Build trust path from database result
      const trustPath: TrustPath = {
        key: {
          id: row.key_node_id,
          alg: row.key_attrs?.alg || 'unknown',
          created_at: row.key_attrs?.created_at || '',
          last_seen: row.key_attrs?.last_seen,
          expires_at: row.key_attrs?.expires_at
        }
      };

      // Add organization if present
      if (row.org_node_id) {
        trustPath.org = {
          id: row.org_node_id,
          name: row.org_attrs?.display_name || 'Unknown Organization',
          domain: row.org_attrs?.domain,
          conformance: row.org_attrs?.conformance
        };
      }

      // Add device if present
      if (row.device_node_id) {
        trustPath.device = {
          id: row.device_node_id,
          attested: row.device_attrs?.attested || false,
          evidence: row.device_attrs?.evidence_pack_url,
          kind: row.device_attrs?.kind
        };
      }

      // Add rotation info if present
      if (row.rotation_edge) {
        trustPath.rotation = {
          evidence_url: row.rotation_edge.evidence_url,
          timestamp: row.rotation_edge.timestamp
        };
      }

      return trustPath;

    } catch (error) {
      throw new GraphError(`Database error loading trust path: ${error.message}`, error);
    }
  }

  /**
   * Get current revocation status for a key
   */
  private async getRevocationStatus(keyId: string): Promise<Revocation> {
    if (!this.db) {
      // Fallback for testing without database
      return {
        id: 0,
        key_id: keyId,
        status: 'good',
        source: 'internal',
        timestamp: new Date().toISOString(),
        created_at: new Date().toISOString()
      };
    }

    try {
      const query = `
        SELECT * FROM get_key_revocation_status($1)
      `;
      
      const result = await this.db.query(query, [keyId]);
      
      if (result.rows.length === 0) {
        // No revocation record found - assume good
        return {
          id: 0,
          key_id: keyId,
          status: 'good',
          source: 'internal',
          timestamp: new Date().toISOString(),
          created_at: new Date().toISOString()
        };
      }

      const row = result.rows[0];
      return {
        id: 0, // We don't need the ID for this use case
        key_id: row.key_id,
        status: row.status,
        source: row.source,
        reason: row.reason,
        evidence_url: row.evidence_url,
        timestamp: row.timestamp,
        created_at: new Date().toISOString()
      };

    } catch (error) {
      throw new RevocationError(`Failed to get revocation status: ${error.message}`, error);
    }
  }

  /**
   * Update key usage statistics
   */
  private async updateKeyUsage(keyId: string, context: VerificationContext): Promise<void> {
    if (!this.db) return;

    try {
      // Update last_seen for the key
      const updateKeyQuery = `
        UPDATE trust_nodes 
        SET attrs = jsonb_set(attrs, '{last_seen}', $1::jsonb), updated_at = NOW()
        WHERE node_id = $2 AND type = 'key'
      `;
      
      await this.db.query(updateKeyQuery, [
        JSON.stringify(context.timestamp),
        keyId
      ]);

      // Add usage edge if this is from a manifest verification
      if (context.manifest_url) {
        const edgeId = await generateSecureEdgeId(keyId, 'manifest_verification');
        const insertEdgeQuery = `
          INSERT INTO trust_edges (edge_id, from_node, to_node, edge_type, timestamp, attrs)
          VALUES ($1, $2, $3, 'used_by', $4, $5)
          ON CONFLICT (from_node, to_node, edge_type) DO UPDATE SET
            timestamp = EXCLUDED.timestamp,
            attrs = EXCLUDED.attrs,
            created_at = NOW()
        `;
        
        await this.db.query(insertEdgeQuery, [
          edgeId,
          context.manifest_url,
          keyId,
          context.timestamp,
          JSON.stringify({
            manifest_url: context.manifest_url,
            asset_url: context.asset_url
          })
        ]);
      }

    } catch (error) {
      // Log error but don't fail the verification
      console.error('Failed to update key usage:', error);
    }
  }

  /**
   * Invalidate cache for a specific key
   */
  public async invalidateCache(keyId: string): Promise<void> {
    // Invalidate all cache entries for this key (different contexts)
    const keys = await this.cache.keys();
    const keysToDelete = keys.filter(key => key.includes(`trust:${keyId}:`));
    
    for (const key of keysToDelete) {
      await this.cache.delete(key);
    }
    
    // Emit event for cache invalidation
    this.eventEmitter.dispatchEvent(new CustomEvent('cache-invalidated', {
      detail: { keyId, timestamp: new Date().toISOString() }
    }));
  }

  /**
   * Get trust graph statistics
   */
  async getGraphStats(): Promise<TrustGraphStats> {
    if (!this.db) {
      throw new GraphError('Database connection not available');
    }

    try {
      const statsQuery = `
        SELECT 
          COUNT(*) as total_nodes,
          COUNT(DISTINCT type) as node_types
        FROM trust_nodes
        UNION ALL
        SELECT 
          COUNT(*) as total_edges,
          COUNT(DISTINCT edge_type) as edge_types  
        FROM trust_edges
      `;

      const result = await this.db.query(statsQuery);
      
      // This is simplified - in production you'd want more detailed queries
      return {
        total_nodes: 0,
        total_edges: 0,
        nodes_by_type: {
          key: 0,
          org: 0,
          device: 0
        },
        edges_by_type: {
          issued_by: 0,
          rotated_to: 0,
          attested_by: 0,
          used_by: 0
        },
        keys_by_grade: {
          A: 0,
          B: 0,
          C: 0,
          D: 0,
          E: 0,
          F: 0
        },
        revoked_keys: 0,
        stale_keys: 0,
        last_updated: new Date().toISOString()
      };

    } catch (error) {
      throw new GraphError(`Failed to get graph stats: ${error.message}`, error);
    }
  }

  /**
   * Get detailed trust path for debugging
   */
  async getDetailedTrustPath(keyId: string): Promise<DetailedTrustPath> {
    if (!this.db) {
      throw new GraphError('Database connection not available');
    }

    try {
      // Get all nodes and edges for this key's trust chain
      const query = `
        WITH RECURSIVE trust_chain AS (
          -- Start with the key
          SELECT node_id, type, attrs, created_at, updated_at, 0 as depth
          FROM trust_nodes 
          WHERE node_id = $1
          
          UNION ALL
          
          -- Get connected nodes (organizations, devices)
          SELECT 
            n.node_id, n.type, n.attrs, n.created_at, n.updated_at, tc.depth + 1
          FROM trust_nodes n
          JOIN trust_edges e ON (
            (e.from_node = tc.node_id OR e.to_node = tc.node_id) AND
            e.edge_type IN ('issued_by', 'attested_by', 'rotated_to')
          )
          JOIN trust_nodes n ON (
            n.node_id = e.from_node OR n.node_id = e.to_node
          )
          WHERE n.node_id != tc.node_id AND tc.depth < 3
        )
        SELECT * FROM trust_chain ORDER BY depth, type
      `;

      const result = await this.db.query(query, [keyId]);
      return result.rows;

    } catch (error) {
      throw new GraphError(`Failed to get detailed trust path: ${error.message}`, error);
    }
  }

  /**
   * Start revocation polling
   */
  private startRevocationPolling(): void {
    if (this.config.revocation_sources.length === 0) {
      return;
    }

    const pollInterval = this.config.revocation_poll_interval_seconds * 1000;

    setInterval(async () => {
      try {
        await this.pollRevocationSources();
      } catch (error) {
        console.error('Revocation polling error:', error);
      }
    }, pollInterval);
  }

  /**
   * Poll revocation sources for updates
   */
  private async pollRevocationSources(): Promise<void> {
    for (const source of this.config.revocation_sources) {
      if (!source.enabled) continue;

      try {
        await this.pollRevocationSource(source);
      } catch (error) {
        console.error(`Error polling revocation source ${source.name}:`, error);
        // Implement circuit breaker - disable source after repeated failures
        source.failureCount = (source.failureCount || 0) + 1;
        if (source.failureCount >= 3) {
          console.warn(`Disabling revocation source ${source.name} after 3 failures`);
          source.enabled = false;
        }
      }
    }
  }

  /**
   * Poll individual revocation source
   */
  private async pollRevocationSource(source: RevocationSource): Promise<void> {
    // This would implement OCSP/CRL polling or JSON feed polling
    // For now, it's a placeholder that would be implemented based on source type
    
    console.log(`Polling revocation source: ${source.name}`);
    
    // Example implementation for JSON feed:
    if (source.type === 'json') {
      const response = await fetch(source.url, {
        headers: source.last_modified ? {
          'If-Modified-Since': source.last_modified
        } : {}
      });

      if (response.status === 304) {
        // No changes
        return;
      }

      if (response.ok) {
        const data = await response.json();
        await this.processRevocationUpdates(source.name, data.revoked_keys || []);
        
        // Update last modified
        source.last_modified = response.headers.get('Last-Modified') || new Date().toUTCString();
      }
    }
  }

  /**
   * Process revocation updates from a source
   */
  private async processRevocationUpdates(sourceName: string, revokedKeys: string[]): Promise<void> {
    if (!this.db) return;

    for (const revokedKey of revokedKeys) {
      try {
        // Insert revocation record
        const insertQuery = `
          INSERT INTO revocations (key_id, status, source, reason, timestamp, evidence_url)
          VALUES ($1, 'revoked', $2, $3, $4, $5)
          ON CONFLICT (key_id, source, timestamp) DO NOTHING
        `;

        await this.db.query(insertQuery, [
          revokedKey.key_id,
          sourceName,
          revokedKey.reason,
          revokedKey.timestamp || new Date().toISOString(),
          revokedKey.evidence_url
        ]);

        // Invalidate cache for this key
        this.invalidateCache(revokedKey.key_id);

        // Emit revocation event
        this.eventEmitter.dispatchEvent(new CustomEvent('revocation-changed', {
          detail: {
            key_id: revokedKey.key_id,
            status: 'revoked',
            source: sourceName,
            timestamp: new Date().toISOString()
          }
        }));

      } catch (error) {
        console.error(`Error processing revocation for ${revokedKey.key_id}:`, error);
      }
    }
  }

  /**
   * Add revocation source
   */
  public addRevocationSource(source: RevocationSource): void {
    this.config.revocation_sources.push(source);
  }

  /**
   * Remove revocation source
   */
  public removeRevocationSource(sourceName: string): void {
    this.config.revocation_sources = this.config.revocation_sources.filter(
      s => s.name !== sourceName
    );
  }

  /**
   * Get current configuration
   */
  public getConfig(): TrustServiceConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  public updateConfig(newConfig: Partial<TrustServiceConfig>): void {
    this.config = { ...this.config, ...newConfig };
    validateScoringConfig(this.config.scoring_weights);
  }

  /**
   * Event listener for revocation changes
   */
  public onRevocationChange(callback: (event: RevocationEvent) => void): void {
    this.eventEmitter.addEventListener('revocation-changed', callback);
  }

  /**
   * Event listener for cache invalidation
   */
  public onCacheInvalidation(callback: (event: CacheInvalidationEvent) => void): void {
    this.eventEmitter.addEventListener('cache-invalidated', callback);
  }

  /**
   * Get cache statistics
   */
  public async getCacheStats(): Promise<{ size: number; entries: TrustCacheEntry[] }> {
    const size = await this.cache.size();
    const keys = await this.cache.keys();
    const entries: TrustCacheEntry[] = [];
    
    for (const key of keys.slice(0, 10)) { // Limit to first 10 for performance
      const entry = await this.cache.get(key);
      if (entry) {
        entries.push(entry);
      }
    }
    
    return { size, entries };
  }

  /**
   * Clear all cached entries
   */
  public async clearCache(): Promise<void> {
    await this.cache.clear();
  }
}
