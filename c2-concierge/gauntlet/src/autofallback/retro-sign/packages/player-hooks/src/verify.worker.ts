/**
 * C2PA Verification Worker for Video/Audio
 * Off-main-thread verification with temporal mapping
 */

// Web Worker types
declare const self: DedicatedWorkerGlobalScope;

interface VerifyMessage {
  type: 'init' | 'verify' | 'tracks-changed';
  manifest?: VideoManifest;
  manifestUrl?: string;
  currentTime?: number;
  tracks?: string[];
}

interface VerifyResponse {
  status: 'unknown' | 'valid' | 'warning' | 'invalid';
  assertions: string[];
  timestamp: number;
  reason?: string;
  activeRegions?: TemporalRegion[];
}

interface VideoManifest {
  version: string;
  asset: {
    kind: 'video' | 'audio';
    primary_url: string;
    poster?: string;
    tracks: Array<{
      type: string;
      id: string;
      codec: string;
      lang?: string;
    }>;
    hash: {
      alg: string;
      value: string;
    };
  };
  temporal: {
    timebase: string;
    tolerance: {
      pts: number;
    };
    maps: TemporalMap[];
  };
  signature: {
    alg: string;
    issuer: string;
    cert_chain: string[];
    created_at: string;
  };
  policy: {
    remote_only: boolean;
    badge_required: boolean;
    deny: string[];
  };
}

interface TemporalMap {
  label: string;
  applies_to: string[];
  regions: TemporalRegion[];
}

interface TemporalRegion {
  start: number;
  end: number;
  assertions: string[];
}

class VerifyWorker {
  private manifest: VideoManifest | null = null;
  private manifestUrl: string = '';
  private currentTracks: string[] = [];
  private tolerance: number = 0.5;
  private lastVerifyTime: number = 0;
  private verifyCache: Map<string, VerifyResponse> = new Map();

  constructor() {
    this.setupMessageHandler();
  }

  private setupMessageHandler() {
    self.onmessage = (e: MessageEvent<VerifyMessage>) => {
      this.handleMessage(e.data);
    };
  }

  private async handleMessage(message: VerifyMessage) {
    try {
      switch (message.type) {
        case 'init':
          await this.handleInit(message);
          break;
        case 'verify':
          await this.handleVerify(message);
          break;
        case 'tracks-changed':
          await this.handleTracksChanged(message);
          break;
      }
    } catch (error) {
      this.sendError(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  private async handleInit(message: VerifyMessage) {
    if (!message.manifest) {
      throw new Error('Manifest required for init');
    }

    this.manifest = message.manifest;
    this.manifestUrl = message.manifestUrl || '';
    this.tolerance = message.manifest.temporal?.tolerance?.pts || 0.5;

    // Validate manifest structure
    this.validateManifest();

    // Send initial state
    this.sendResponse({
      status: 'unknown',
      assertions: [],
      timestamp: Date.now(),
      reason: 'Initialized, awaiting playback'
    });
  }

  private async handleVerify(message: VerifyMessage) {
    if (!this.manifest) {
      throw new Error('Manifest not initialized');
    }

    if (message.currentTime === undefined || !message.tracks) {
      throw new Error('Current time and tracks required for verification');
    }

    const currentTime = message.currentTime;
    const tracks = message.tracks;
    this.currentTracks = tracks;

    // Cache key for performance
    const cacheKey = `${currentTime.toFixed(3)}_${tracks.join(',')}`;
    
    if (this.verifyCache.has(cacheKey)) {
      const cached = this.verifyCache.get(cacheKey)!;
      cached.timestamp = Date.now();
      this.sendResponse(cached);
      return;
    }

    // Perform verification
    const result = await this.verifyAtTime(currentTime, tracks);
    
    // Cache result
    this.verifyCache.set(cacheKey, result);
    
    // Clean old cache entries (keep last 100)
    if (this.verifyCache.size > 100) {
      const oldestKey = this.verifyCache.keys().next().value;
      this.verifyCache.delete(oldestKey);
    }

    this.sendResponse(result);
  }

  private async handleTracksChanged(message: VerifyMessage) {
    if (!message.tracks) {
      throw new Error('Tracks required for tracks-changed');
    }

    this.currentTracks = message.tracks;
    
    // Clear cache since tracks changed
    this.verifyCache.clear();
  }

  private validateManifest() {
    if (!this.manifest) return;

    const required = ['version', 'asset', 'temporal', 'signature', 'policy'];
    for (const field of required) {
      if (!(field in this.manifest)) {
        throw new Error(`Missing required manifest field: ${field}`);
      }
    }

    if (this.manifest.asset.kind !== 'video' && this.manifest.asset.kind !== 'audio') {
      throw new Error('Invalid asset kind');
    }

    if (!this.manifest.temporal.maps || this.manifest.temporal.maps.length === 0) {
      throw new Error('No temporal maps found');
    }
  }

  private async verifyAtTime(currentTime: number, tracks: string[]): Promise<VerifyResponse> {
    if (!this.manifest) {
      return {
        status: 'unknown',
        assertions: [],
        timestamp: Date.now(),
        reason: 'No manifest loaded'
      };
    }

    try {
      // Find active temporal regions
      const activeRegions = this.findActiveRegions(currentTime, tracks);
      
      if (activeRegions.length === 0) {
        return {
          status: 'unknown',
          assertions: [],
          timestamp: Date.now(),
          reason: 'No temporal regions match current time'
        };
      }

      // Collect all assertions from active regions
      const allAssertions = new Set<string>();
      const regionDetails: TemporalRegion[] = [];

      for (const region of activeRegions) {
        regionDetails.push(region);
        for (const assertion of region.assertions) {
          allAssertions.add(assertion);
        }
      }

      // Check for denied assertions
      const deniedAssertions = this.manifest.policy.deny || [];
      const foundDenied = Array.from(allAssertions).filter(a => deniedAssertions.includes(a));

      if (foundDenied.length > 0) {
        return {
          status: 'invalid',
          assertions: foundDenied,
          timestamp: Date.now(),
          reason: `Denied assertions found: ${foundDenied.join(', ')}`,
          activeRegions: regionDetails
        };
      }

      // Check signature validity (simplified for v1)
      const signatureValid = await this.verifySignature();
      
      if (!signatureValid) {
        return {
          status: 'invalid',
          assertions: Array.from(allAssertions),
          timestamp: Date.now(),
          reason: 'Invalid signature',
          activeRegions: regionDetails
        };
      }

      // Determine status based on assertions
      let status: 'valid' | 'warning' = 'valid';
      const assertions = Array.from(allAssertions);

      // Check for warning conditions
      if (assertions.some(a => a.includes('ad') || a.includes('overlay'))) {
        status = 'warning';
      }

      return {
        status,
        assertions,
        timestamp: Date.now(),
        activeRegions: regionDetails
      };

    } catch (error) {
      return {
        status: 'unknown',
        assertions: [],
        timestamp: Date.now(),
        reason: error instanceof Error ? error.message : 'Verification error'
      };
    }
  }

  private findActiveRegions(currentTime: number, tracks: string[]): TemporalRegion[] {
    if (!this.manifest) return [];

    const activeRegions: TemporalRegion[] = [];

    for (const map of this.manifest.temporal.maps) {
      // Check if this map applies to current tracks
      const appliesToTracks = map.applies_to.some(trackId => 
        tracks.includes(trackId) || trackId === 'video' || trackId === 'audio'
      );

      if (!appliesToTracks) continue;

      // Find regions that include current time with tolerance
      for (const region of map.regions) {
        const startTime = region.start - this.tolerance;
        const endTime = region.end + this.tolerance;

        if (currentTime >= startTime && currentTime <= endTime) {
          activeRegions.push(region);
        }
      }
    }

    return activeRegions;
  }

  private async verifySignature(): Promise<boolean> {
    if (!this.manifest) return false;

    // Simplified signature verification for v1
    // In production, this would use proper cryptographic verification
    try {
      // Check if signature fields exist
      const { signature } = this.manifest;
      return !!(signature.alg && signature.issuer && signature.cert_chain.length > 0);
    } catch {
      return false;
    }
  }

  private sendResponse(response: VerifyResponse) {
    self.postMessage(response);
  }

  private sendError(error: string) {
    self.postMessage({
      status: 'unknown',
      assertions: [],
      timestamp: Date.now(),
      reason: error
    });
  }
}

// Initialize worker
new VerifyWorker();
