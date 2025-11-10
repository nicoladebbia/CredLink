/**
 * Phase 11 — Trust Graph & Badge Reputation v1
 * Revocation ingestion service with <10 minute propagation
 */

import {
  Revocation,
  RevocationSource,
  RevocationStatus,
  RevocationError
} from './types';

import { TrustService } from './trust-service';

/**
 * Revocation ingestion service
 * Handles polling multiple sources and propagating changes
 */
export class RevocationIngestService {
  private trustService: TrustService;
  private sources: Map<string, RevocationSource> = new Map();
  private pollIntervals: Map<string, NodeJS.Timeout> = new Map();
  private isRunning = false;
  private eventEmitter: EventTarget;

  constructor(trustService: TrustService) {
    this.trustService = trustService;
    this.eventEmitter = new EventTarget();
  }

  /**
   * Add a revocation source
   */
  public addSource(source: RevocationSource): void {
    this.sources.set(source.name, source);
    
    if (this.isRunning) {
      this.startPolling(source);
    }
  }

  /**
   * Remove a revocation source
   */
  public removeSource(sourceName: string): void {
    this.stopPolling(sourceName);
    this.sources.delete(sourceName);
  }

  /**
   * Start all revocation polling
   */
  public start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    console.log('Starting revocation ingestion service');

    for (const source of this.sources.values()) {
      if (source.enabled) {
        this.startPolling(source);
      }
    }
  }

  /**
   * Stop all revocation polling
   */
  public stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    console.log('Stopping revocation ingestion service');

    for (const sourceName of this.sources.keys()) {
      this.stopPolling(sourceName);
    }
  }

  /**
   * Start polling for a specific source
   */
  private startPolling(source: RevocationSource): void {
    const interval = setInterval(async () => {
      try {
        await this.pollSource(source);
      } catch (error) {
        console.error(`Error polling revocation source ${source.name}:`, error);
        this.emitError(source.name, error);
      }
    }, source.poll_interval_seconds * 1000);

    this.pollIntervals.set(source.name, interval);

    // Initial poll
    this.pollSource(source).catch(error => {
      console.error(`Initial poll error for ${source.name}:`, error);
    });
  }

  /**
   * Stop polling for a specific source
   */
  private stopPolling(sourceName: string): void {
    const interval = this.pollIntervals.get(sourceName);
    if (interval) {
      clearInterval(interval);
      this.pollIntervals.delete(sourceName);
    }
  }

  /**
   * Poll a single revocation source
   */
  private async pollSource(source: RevocationSource): Promise<void> {
    console.log(`Polling revocation source: ${source.name}`);

    try {
      let updates: RevocationUpdate[] = [];

      switch (source.type) {
        case 'json':
          updates = await this.pollJsonSource(source);
          break;
        case 'ocsp':
          updates = await this.pollOcspSource(source);
          break;
        case 'crl':
          updates = await this.pollCrlSource(source);
          break;
        case 'internal':
          updates = await this.pollInternalSource(source);
          break;
        default:
          throw new RevocationError(`Unknown source type: ${source.type}`);
      }

      if (updates.length > 0) {
        await this.processUpdates(source.name, updates);
        console.log(`Processed ${updates.length} revocation updates from ${source.name}`);
      }

    } catch (error) {
      throw new RevocationError(`Failed to poll source ${source.name}: ${error.message}`, error);
    }
  }

  /**
   * Poll JSON feed source
   */
  private async pollJsonSource(source: RevocationSource): Promise<RevocationUpdate[]> {
    const headers: Record<string, string> = {};
    
    if (source.last_modified) {
      headers['If-Modified-Since'] = source.last_modified;
    }

    const response = await fetch(source.url, { headers });

    if (response.status === 304) {
      // No changes
      return [];
    }

    if (!response.ok) {
      throw new RevocationError(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    
    // Update last modified
    source.last_modified = response.headers.get('Last-Modified') || 
                         new Date().toUTCString();

    // Convert to internal format
    return (data.revoked_keys || []).map((item: any) => ({
      key_id: item.key_id || item.keyId,
      status: 'revoked' as RevocationStatus,
      reason: item.reason,
      evidence_url: item.evidence_url || item.evidenceUrl,
      timestamp: item.timestamp || item.revoked_at || new Date().toISOString()
    }));
  }

  /**
   * Poll OCSP source
   */
  private async pollOcspSource(source: RevocationSource): Promise<RevocationUpdate[]> {
    // OCSP polling would require crypto libraries
    // For now, return empty array - would be implemented with node-ocsp or similar
    console.log(`OCSP polling not yet implemented for ${source.name}`);
    return [];
  }

  /**
   * Poll CRL source
   */
  private async pollCrlSource(source: RevocationSource): Promise<RevocationUpdate[]> {
    // CRL parsing would require ASN.1 parsing libraries
    // For now, return empty array - would be implemented with node-forge or similar
    console.log(`CRL polling not yet implemented for ${source.name}`);
    return [];
  }

  /**
   * Poll internal source (e.g., Phase 9 keyctl)
   */
  private async pollInternalSource(source: RevocationSource): Promise<RevocationUpdate[]> {
    try {
      const response = await fetch(source.url);
      
      if (!response.ok) {
        throw new RevocationError(`Internal source error: ${response.statusText}`);
      }

      const data = await response.json();
      
      return (data.revocations || []).map((item: any) => ({
        key_id: item.key_id,
        status: item.status as RevocationStatus,
        reason: item.reason,
        evidence_url: item.evidence_url,
        timestamp: item.timestamp
      }));

    } catch (error) {
      throw new RevocationError(`Internal source polling failed: ${error.message}`, error);
    }
  }

  /**
   * Process revocation updates
   */
  private async processUpdates(sourceName: string, updates: RevocationUpdate[]): Promise<void> {
    const processedKeys: string[] = [];

    for (const update of updates) {
      try {
        // Invalidate cache for affected key
        this.trustService.invalidateCache(update.key_id);
        
        processedKeys.push(update.key_id);

        // Emit revocation change event
        this.emitRevocationChange({
          key_id: update.key_id,
          status: update.status,
          source: sourceName,
          reason: update.reason,
          evidence_url: update.evidence_url,
          timestamp: update.timestamp,
          processed_at: new Date().toISOString()
        });

      } catch (error) {
        console.error(`Error processing revocation update for ${update.key_id}:`, error);
      }
    }

    // Emit batch processing event
    this.emitBatchProcessed({
      source: sourceName,
      processed_count: processedKeys.length,
      keys: processedKeys,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Emit revocation change event
   */
  private emitRevocationChange(data: any): void {
    this.eventEmitter.dispatchEvent(new CustomEvent('revocation-changed', {
      detail: data
    }));
  }

  /**
   * Emit batch processed event
   */
  private emitBatchProcessed(data: any): void {
    this.eventEmitter.dispatchEvent(new CustomEvent('batch-processed', {
      detail: data
    }));
  }

  /**
   * Emit error event
   */
  private emitError(sourceName: string, error: any): void {
    this.eventEmitter.dispatchEvent(new CustomEvent('polling-error', {
      detail: {
        source: sourceName,
        error: error.message,
        timestamp: new Date().toISOString()
      }
    }));
  }

  /**
   * Get ingestion statistics
   */
  public getStats(): RevocationIngestStats {
    const enabledSources = Array.from(this.sources.values()).filter(s => s.enabled);
    
    return {
      total_sources: this.sources.size,
      enabled_sources: enabledSources.length,
      is_running: this.isRunning,
      sources: Array.from(this.sources.values()).map(s => ({
        name: s.name,
        type: s.type,
        enabled: s.enabled,
        poll_interval_seconds: s.poll_interval_seconds,
        last_modified: s.last_modified
      }))
    };
  }

  /**
   * Force immediate poll of all sources
   */
  public async forcePoll(): Promise<RevocationPollResult> {
    const results: RevocationPollResult = {
      total_sources: 0,
      successful_polls: 0,
      failed_polls: 0,
      total_updates: 0,
      errors: []
    };

    for (const source of this.sources.values()) {
      if (!source.enabled) continue;

      results.total_sources++;

      try {
        await this.pollSource(source);
        results.successful_polls++;
      } catch (error) {
        results.failed_polls++;
        results.errors.push({
          source: source.name,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Add internal revocation (for admin/testing)
   */
  public async addInternalRevocation(
    keyId: string,
    reason: string,
    evidenceUrl?: string
  ): Promise<void> {
    const update: RevocationUpdate = {
      key_id: keyId,
      status: 'revoked',
      reason,
      evidence_url: evidenceUrl,
      timestamp: new Date().toISOString()
    };

    await this.processUpdates('internal', [update]);
  }

  /**
   * Event listeners
   */
  public onRevocationChanged(callback: (event: any) => void): void {
    this.eventEmitter.addEventListener('revocation-changed', callback);
  }

  public onBatchProcessed(callback: (event: any) => void): void {
    this.eventEmitter.addEventListener('batch-processed', callback);
  }

  public onPollingError(callback: (event: any) => void): void {
    this.eventEmitter.addEventListener('polling-error', callback);
  }
}

/**
 * Internal interfaces
 */
interface RevocationUpdate {
  key_id: string;
  status: RevocationStatus;
  reason?: string;
  evidence_url?: string;
  timestamp: string;
}

export interface RevocationIngestStats {
  total_sources: number;
  enabled_sources: number;
  is_running: boolean;
  sources: Array<{
    name: string;
    type: string;
    enabled: boolean;
    poll_interval_seconds: number;
    last_modified?: string;
  }>;
}

export interface RevocationPollResult {
  total_sources: number;
  successful_polls: number;
  failed_polls: number;
  total_updates: number;
  errors: Array<{
    source: string;
    error: string;
  }>;
}

/**
 * Factory function to create revocation ingestion service
 */
export function createRevocationIngestService(trustService: TrustService): RevocationIngestService {
  const service = new RevocationIngestService(trustService);
  
  // Add default sources based on configuration
  const config = trustService.getConfig();
  
  for (const source of config.revocation_sources) {
    service.addSource(source);
  }
  
  return service;
}

/**
 * Example revocation sources for testing
 */
export const EXAMPLE_REVOCATION_SOURCES: RevocationSource[] = [
  {
    name: 'c2pa-demo-revocations',
    url: 'https://demo.c2pa.example.com/revocations.json',
    type: 'json',
    poll_interval_seconds: 180,
    enabled: true
  },
  {
    name: 'internal-keyctl',
    url: 'http://localhost:8080/api/v1/revocations',
    type: 'internal',
    poll_interval_seconds: 60,
    enabled: true
  },
  {
    name: 'ca-ocsp-responder',
    url: 'http://ocsp.example.com/',
    type: 'ocsp',
    poll_interval_seconds: 300,
    enabled: false
  }
];
