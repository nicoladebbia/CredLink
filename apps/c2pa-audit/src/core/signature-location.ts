/**
 * Phase 31 - Signature Location Strategy
 * Handles embedded vs remote manifest placement and discovery
 */

export interface SignatureLocation {
  type: 'embedded' | 'remote';
  url?: string;
  segmentUrl?: string;
  detectionMethod: 'init_segment' | 'http_link' | 'range_index';
}

export class SignatureLocationManager {
  
  /**
   * Determine optimal signature location strategy
   */
  static determineLocation(params: {
    streamType: 'live' | 'vod';
    containerType: 'fMP4' | 'mpegts';
    hasSSAI: boolean;
    controlsInit: boolean;
    cdnSupportsEmbed: boolean;
  }): SignatureLocation {
    const { streamType, containerType, hasSSAI, controlsInit, cdnSupportsEmbed } = params;

    // Decision matrix for signature placement
    if (streamType === 'vod' && controlsInit && !hasSSAI) {
      // VOD without SSAI - embed in init segment
      return {
        type: 'embedded',
        detectionMethod: 'init_segment'
      };
    }

    if (streamType === 'live' && hasSSAI) {
      // Live with SSAI - remote only (init may be overwritten)
      return {
        type: 'remote',
        detectionMethod: 'range_index'
      };
    }

    if (containerType === 'fMP4' && !controlsInit) {
      // fMP4 without init control - remote with Link header fallback
      return {
        type: 'remote',
        detectionMethod: 'http_link'
      };
    }

    // Default to remote for maximum compatibility
    return {
      type: 'remote',
      detectionMethod: 'range_index'
    };
  }

  /**
   * Extract embedded manifest from init segment
   */
  static async extractFromInitSegment(initSegmentUrl: string): Promise<ArrayBuffer | null> {
    try {
      const response = await fetch(initSegmentUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch init segment: ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      
      // Parse fMP4 box structure to find C2PA manifest
      const manifest = this.parseC2PAFromfMP4(arrayBuffer);
      
      return manifest;
      
    } catch (error) {
      console.error('Failed to extract manifest from init segment:', error);
      return null;
    }
  }

  /**
   * Parse C2PA manifest from fMP4 box structure
   */
  private static parseC2PAFromfMP4(arrayBuffer: ArrayBuffer): ArrayBuffer | null {
    const data = new DataView(arrayBuffer);
    let offset = 0;

    while (offset < data.byteLength) {
      if (offset + 8 > data.byteLength) break;

      const size = data.getUint32(offset);
      const type = data.getUint32(offset + 4);
      
      // Convert type to string for comparison
      const typeStr = String.fromCharCode(
        (type >> 24) & 0xFF,
        (type >> 16) & 0xFF,
        (type >> 8) & 0xFF,
        type & 0xFF
      );

      if (typeStr === 'c2pa') {
        // Found C2PA box, extract payload
        const payloadOffset = offset + 8; // Skip size and type
        const payloadSize = size - 8;
        return arrayBuffer.slice(payloadOffset, payloadOffset + payloadSize);
      }

      if (size === 0) break; // Invalid size
      if (size === 1) {
        // 64-bit size
        if (offset + 16 > data.byteLength) break;
        offset += Number(data.getBigUint64(offset + 8));
      } else {
        offset += size;
      }
    }

    return null;
  }

  /**
   * Discover remote manifest via HTTP Link header
   */
  static async discoverViaLinkHeader(segmentUrl: string): Promise<string | null> {
    try {
      const response = await fetch(segmentUrl, { method: 'HEAD' });
      
      const linkHeader = response.headers.get('Link');
      if (!linkHeader) return null;

      // Parse Link header for c2pa-manifest relation
      const links = this.parseLinkHeader(linkHeader);
      const manifestLink = links.find(link => link.rel === 'c2pa-manifest');
      
      return manifestLink?.uri || null;
      
    } catch (error) {
      console.error('Failed to discover manifest via Link header:', error);
      return null;
    }
  }

  /**
   * Parse HTTP Link header into structured format
   */
  private static parseLinkHeader(linkHeader: string): Array<{ uri: string; rel: string }> {
    const links: Array<{ uri: string; rel: string }> = [];
    
    // Split on commas, but respect quotes
    const parts = linkHeader.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
    
    for (const part of parts) {
      const match = part.match(/<([^>]+)>;\s*rel="([^"]+)"/i);
      if (match) {
        links.push({
          uri: match[1],
          rel: match[2]
        });
      }
    }
    
    return links;
  }

  /**
   * Get manifest URL from range index
   */
  static async getFromRangeIndex(
    rangeIndex: any,
    timestamp?: string,
    daterangeId?: string
  ): Promise<string | null> {
    try {
      // Use dynamic import to avoid circular dependency
      const { RangeIndexGenerator } = await import('./range-index');
      const range = RangeIndexGenerator.lookupRange(rangeIndex, daterangeId, timestamp);
      return range?.manifest || null;
    } catch (error) {
      console.error('Failed to import range-index module:', error);
      return null;
    }
  }

  /**
   * Fallback discovery strategy chain
   */
  static async discoverManifest(
    segmentUrl: string,
    rangeIndex?: any,
    timestamp?: string,
    daterangeId?: string
  ): Promise<SignatureLocation> {
    
    // Strategy 1: Try HTTP Link header first (fastest)
    const linkUrl = await this.discoverViaLinkHeader(segmentUrl);
    if (linkUrl) {
      return {
        type: 'remote',
        url: linkUrl,
        segmentUrl,
        detectionMethod: 'http_link'
      };
    }

    // Strategy 2: Try range index
    if (rangeIndex) {
      const rangeUrl = await this.getFromRangeIndex(rangeIndex, timestamp, daterangeId);
      if (rangeUrl) {
        return {
          type: 'remote',
          url: rangeUrl,
          segmentUrl,
          detectionMethod: 'range_index'
        };
      }
    }

    // Strategy 3: Try embedded in init segment
    const embeddedManifest = await this.extractFromInitSegment(segmentUrl);
    if (embeddedManifest) {
      return {
        type: 'embedded',
        segmentUrl,
        detectionMethod: 'init_segment'
      };
    }

    // No manifest found
    throw new Error('Unable to discover C2PA manifest using any strategy');
  }

  /**
   * Validate manifest accessibility
   */
  static async validateManifestAccess(location: SignatureLocation): Promise<boolean> {
    try {
      if (location.type === 'remote' && location.url) {
        const response = await fetch(location.url, { method: 'HEAD' });
        return response.ok;
      }
      
      if (location.type === 'embedded' && location.segmentUrl) {
        const manifest = await this.extractFromInitSegment(location.segmentUrl);
        return manifest !== null;
      }
      
      return false;
      
    } catch (error) {
      console.error('Manifest validation failed:', error);
      return false;
    }
  }
}
