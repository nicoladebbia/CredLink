/**
 * Range Index Generator for Phase 31
 * Maps timeline ranges to manifest URLs for ad-stitched streams
 */

export interface StreamRange {
  id: string;
  type: 'ad' | 'program' | 'program_end_ad';
  start: string; // ISO 8601 timestamp
  end: string;   // ISO 8601 timestamp
  scte35?: string; // Optional hex-encoded SCTE-35
  manifest: string; // C2PA manifest URL (HTTPS only)
}

export interface RangeIndex {
  stream_id: string;
  unit: 'program_time';
  program: {
    manifest: string; // C2PA manifest URL (HTTPS only)
  };
  ranges: StreamRange[];
  version: number;
  generated_at: string;
  expires_at: string;
}

export class RangeIndexGenerator {
  private static readonly CACHE_MAX_AGE = 15; // seconds
  private static readonly STALE_WHILE_REVALIDATE = 60; // seconds
  private static readonly MAX_RANGES_PER_INDEX = 1000;
  private static readonly MAX_STREAM_ID_LENGTH = 64;
  private static readonly MAX_MANIFEST_URL_LENGTH = 2048;

  /**
   * Validate HTTPS URL
   */
  private static validateHTTPSUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'https:' && 
             parsed.hostname.length > 0 &&
             url.length <= this.MAX_MANIFEST_URL_LENGTH;
    } catch {
      return false;
    }
  }

  /**
   * Validate ISO 8601 timestamp
   */
  private static validateTimestamp(timestamp: string): boolean {
    if (!timestamp || typeof timestamp !== 'string') return false;
    
    const date = new Date(timestamp);
    const now = new Date();
    const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    const oneYearFromNow = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
    
    return !isNaN(date.getTime()) && 
           date >= oneYearAgo && 
           date <= oneYearFromNow &&
           timestamp.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/);
  }

  /**
   * Validate stream ID format
   */
  private static validateStreamId(streamId: string): boolean {
    return typeof streamId === 'string' &&
           streamId.length > 0 &&
           streamId.length <= this.MAX_STREAM_ID_LENGTH &&
           /^[a-zA-Z0-9_-]+$/.test(streamId);
  }

  /**
   * Validate SCTE-35 hex format
   */
  private static validateSCTE35(scte35?: string): boolean {
    if (!scte35) return true; // Optional field
    return /^[0-9a-fA-F]+$/.test(scte35) && 
           scte35.length >= 16 && 
           scte35.length <= 512;
  }

  /**
   * Generate range index from SSAI logs/packager events
   */
  static generateFromSSAILogs(params: {
    stream_id: string;
    program_manifest: string;
    ad_events: Array<{
      id: string;
      start_time: string;
      end_time: string;
      scte35?: string;
      ad_manifest: string;
    }>;
  }): RangeIndex {
    const { stream_id, program_manifest, ad_events } = params;

    // Validate inputs
    if (!this.validateStreamId(stream_id)) {
      throw new Error('Invalid stream_id format');
    }

    if (!this.validateHTTPSUrl(program_manifest)) {
      throw new Error('Invalid program manifest URL - must be HTTPS');
    }

    if (!Array.isArray(ad_events) || ad_events.length > this.MAX_RANGES_PER_INDEX) {
      throw new Error('Invalid ad_events array or exceeds maximum ranges');
    }

    const ranges: StreamRange[] = ad_events.map((event, index) => {
      // Validate each event
      if (!event.id || typeof event.id !== 'string') {
        throw new Error(`Invalid event ID at index ${index}`);
      }

      if (!this.validateTimestamp(event.start_time)) {
        throw new Error(`Invalid start_time at index ${index}`);
      }

      if (!this.validateTimestamp(event.end_time)) {
        throw new Error(`Invalid end_time at index ${index}`);
      }

      if (new Date(event.start_time) >= new Date(event.end_time)) {
        throw new Error(`start_time must be before end_time at index ${index}`);
      }

      if (!this.validateSCTE35(event.scte35)) {
        throw new Error(`Invalid SCTE-35 format at index ${index}`);
      }

      if (!this.validateHTTPSUrl(event.ad_manifest)) {
        throw new Error(`Invalid ad manifest URL at index ${index} - must be HTTPS`);
      }

      return {
        id: event.id,
        type: 'ad',
        start: event.start_time,
        end: event.end_time,
        scte35: event.scte35,
        manifest: event.ad_manifest
      };
    });

    // Sort ranges by start time
    ranges.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

    // Check for overlapping ranges
    for (let i = 1; i < ranges.length; i++) {
      const prevEnd = new Date(ranges[i - 1].end).getTime();
      const currentStart = new Date(ranges[i].start).getTime();
      if (currentStart < prevEnd) {
        throw new Error(`Overlapping ranges detected: ${ranges[i - 1].id} and ${ranges[i].id}`);
      }
    }

    const now = new Date();
    const expires = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes

    return {
      stream_id,
      unit: 'program_time',
      program: {
        manifest: program_manifest
      },
      ranges,
      version: 1,
      generated_at: now.toISOString(),
      expires_at: expires.toISOString()
    };
  }

  /**
   * Lookup range by DATERANGE ID or timestamp
   */
  static lookupRange(
    rangeIndex: RangeIndex,
    daterangeId?: string,
    timestamp?: string
  ): StreamRange | null {
    // Validate range index first
    if (!this.validate(rangeIndex)) {
      throw new Error('Invalid range index structure');
    }

    // Check if index is expired
    if (new Date() > new Date(rangeIndex.expires_at)) {
      throw new Error('Range index has expired');
    }

    // First try to match by DATERANGE ID
    if (daterangeId) {
      if (typeof daterangeId !== 'string' || daterangeId.length === 0) {
        throw new Error('Invalid daterangeId format');
      }
      
      const match = rangeIndex.ranges.find(range => range.id === daterangeId);
      if (match) return match;
    }

    // Fall back to timestamp lookup
    if (timestamp) {
      if (!this.validateTimestamp(timestamp)) {
        throw new Error('Invalid timestamp format');
      }
      
      const time = new Date(timestamp).getTime();
      const match = rangeIndex.ranges.find(range => {
        const start = new Date(range.start).getTime();
        const end = new Date(range.end).getTime();
        return time >= start && time <= end;
      });
      if (match) return match;
    }

    return null;
  }

  /**
   * Get cache headers for range index response
   */
  static getCacheHeaders(): Record<string, string> {
    return {
      'Cache-Control': `max-age=${this.CACHE_MAX_AGE}, stale-while-revalidate=${this.STALE_WHILE_REVALIDATE}`,
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*', // Consider restricting in production
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY'
    };
  }

  /**
   * Validate range index structure and content
   */
  static validate(rangeIndex: any): rangeIndex is RangeIndex {
    // Basic structure validation
    if (typeof rangeIndex !== 'object' || rangeIndex === null) {
      return false;
    }

    // Required fields validation
    if (!this.validateStreamId(rangeIndex.stream_id)) {
      return false;
    }

    if (rangeIndex.unit !== 'program_time') {
      return false;
    }

    if (typeof rangeIndex.program !== 'object' || 
        !this.validateHTTPSUrl(rangeIndex.program.manifest)) {
      return false;
    }

    if (!Array.isArray(rangeIndex.ranges) || 
        rangeIndex.ranges.length > this.MAX_RANGES_PER_INDEX) {
      return false;
    }

    if (typeof rangeIndex.version !== 'number' || rangeIndex.version <= 0) {
      return false;
    }

    if (!this.validateTimestamp(rangeIndex.generated_at) ||
        !this.validateTimestamp(rangeIndex.expires_at)) {
      return false;
    }

    // Validate each range
    for (const range of rangeIndex.ranges) {
      if (typeof range.id !== 'string' || range.id.length === 0) {
        return false;
      }

      if (!['ad', 'program', 'program_end_ad'].includes(range.type)) {
        return false;
      }

      if (!this.validateTimestamp(range.start) || !this.validateTimestamp(range.end)) {
        return false;
      }

      if (new Date(range.start) >= new Date(range.end)) {
        return false;
      }

      if (!this.validateSCTE35(range.scte35)) {
        return false;
      }

      if (!this.validateHTTPSUrl(range.manifest)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if range index is expired
   */
  static isExpired(rangeIndex: RangeIndex): boolean {
    return new Date() > new Date(rangeIndex.expires_at);
  }

  /**
   * Get time until expiration in seconds
   */
  static getTimeToExpiration(rangeIndex: RangeIndex): number {
    const now = new Date();
    const expires = new Date(rangeIndex.expires_at);
    return Math.max(0, Math.floor((expires.getTime() - now.getTime()) / 1000));
  }
}

// Example usage and test data
export const EXAMPLE_RANGE_INDEX: RangeIndex = {
  stream_id: "live-ny-2025-11-03T15:00Z",
  unit: "program_time",
  program: {
    manifest: "https://manifests.example.com/program/sha256/abc123/active.c2pa"
  },
  ranges: [
    {
      id: "splice-6FFFFFF0",
      type: "ad",
      start: "2025-11-03T15:12:00Z",
      end: "2025-11-03T15:13:00Z",
      scte35: "0xFC3025000000000000FFF0140500000000E0006F000000000000A0000000",
      manifest: "https://manifests.example.com/ads/acme/sha256/def456/active.c2pa"
    },
    {
      id: "splice-6FFFFFF1",
      type: "ad",
      start: "2025-11-03T15:24:30Z",
      end: "2025-11-03T15:25:00Z",
      scte35: "0xFC3025000000000000FFF0140500000000E0006F000000000000B0000000",
      manifest: "https://manifests.example.com/ads/acme/sha256/ghi789/active.c2pa"
    }
  ],
  version: 1,
  generated_at: "2025-11-03T15:00:00Z",
  expires_at: "2025-11-03T15:05:00Z"
};
