/**
 * HLS.js Plugin for C2PA Verification
 * Integrates with HLS.js events for real-time verification
 */

import Hls from 'hls.js';

// HLS.js event data types
interface FragChangedData {
  frag: {
    start: number;
    end: number;
    url: string;
    level: number;
  };
}

interface LevelSwitchedData {
  level: number;
}

interface AudioTrackSwitchedData {
  id: number;
}

export interface HlsC2PAConfig {
  manifestUrl?: string;
  badgeElement?: HTMLElement;
  verifyEndpoint?: string;
  tolerance?: number;
}

export class HlsC2PAPlugin {
  private hls: Hls;
  private config: HlsC2PAConfig;
  private verifyWorker: Worker | null = null;
  private manifest: any = null;
  private currentLevel: number = -1;
  private currentTracks: string[] = [];
  private eventListeners: Map<string, Function> = new Map();

  constructor(hls: Hls, config: HlsC2PAConfig = {}) {
    this.hls = hls;
    this.config = {
      verifyEndpoint: '/verify/video',
      tolerance: 0.5,
      ...config
    };

    this.initialize();
  }

  private async initialize() {
    // Initialize verification worker
    this.verifyWorker = new Worker('/packages/player-hooks/src/verify.worker.js');
    
    this.setupWorkerEvents();
    this.setupHlsEvents();
    
    // Load manifest if provided
    if (this.config.manifestUrl) {
      await this.loadManifest(this.config.manifestUrl);
    }
  }

  private setupWorkerEvents() {
    if (!this.verifyWorker) return;

    this.verifyWorker.onmessage = (e) => {
      this.handleWorkerMessage(e.data);
    };
  }

  private setupHlsEvents() {
    // Fragment loading events
    this.addEventListener(Hls.Events.FRAG_CHANGED, this.onFragmentChanged.bind(this));
    this.addEventListener(Hls.Events.LEVEL_SWITCHED, this.onLevelSwitched.bind(this));
    this.addEventListener(Hls.Events.AUDIO_TRACK_SWITCHED, this.onAudioTrackSwitched.bind(this));
    
    // Playback events
    this.addEventListener(Hls.Events.ERROR, this.onError.bind(this));
    
    // Time update for continuous verification
    const video = this.hls.media;
    if (video) {
      video.addEventListener('timeupdate', this.onTimeUpdate.bind(this));
      video.addEventListener('loadedmetadata', this.onLoadedMetadata.bind(this));
    }
  }

  private addEventListener(event: string, handler: Function) {
    this.hls.on(event, handler as any);
    this.eventListeners.set(event, handler);
  }

  private removeEventListener(event: string) {
    const handler = this.eventListeners.get(event);
    if (handler) {
      this.hls.off(event, handler as any);
      this.eventListeners.delete(event);
    }
  }

  private async loadManifest(manifestUrl: string) {
    try {
      const response = await fetch(manifestUrl, {
        headers: { 'Accept': 'application/c2pa+json' }
      });

      if (!response.ok) {
        throw new Error(`Manifest fetch failed: ${response.status}`);
      }

      this.manifest = await response.json();
      
      // Initialize worker with manifest
      if (this.verifyWorker) {
        this.verifyWorker.postMessage({
          type: 'init',
          manifest: this.manifest,
          manifestUrl
        });
      }

    } catch (error) {
      console.error('C2PA HLS Plugin: Failed to load manifest', error);
      this.notifyError('Manifest load failed');
    }
  }

  private onFragmentChanged(event: string, data: FragChangedData) {
    // Fragment changed - update verification context
    if (this.verifyWorker && data.frag) {
      const currentTime = data.frag.start;
      
      this.verifyWorker.postMessage({
        type: 'verify',
        currentTime,
        tracks: this.currentTracks
      });
    }
  }

  private onLevelSwitched(event: string, data: LevelSwitchedData) {
    // Quality/level changed
    this.currentLevel = data.level;
    
    // Update track information
    this.updateTrackInfo();
    
    if (this.verifyWorker) {
      this.verifyWorker.postMessage({
        type: 'tracks-changed',
        tracks: this.currentTracks
      });
    }
  }

  private onAudioTrackSwitched(event: string, data: AudioTrackSwitchedData) {
    // Audio track changed
    this.updateTrackInfo();
    
    if (this.verifyWorker) {
      this.verifyWorker.postMessage({
        type: 'tracks-changed',
        tracks: this.currentTracks
      });
    }
  }

  private onTimeUpdate() {
    const video = this.hls.media;
    if (!video || !this.verifyWorker) return;

    // Throttle time updates to avoid overwhelming the worker
    const currentTime = Math.floor(video.currentTime * 10) / 10; // 100ms precision
    
    if (currentTime !== this.lastVerifyTime) {
      this.lastVerifyTime = currentTime;
      
      this.verifyWorker.postMessage({
        type: 'verify',
        currentTime,
        tracks: this.currentTracks
      });
    }
  }

  private onLoadedMetadata() {
    // Metadata loaded - update track information
    this.updateTrackInfo();
    
    if (this.verifyWorker) {
      this.verifyWorker.postMessage({
        type: 'tracks-changed',
        tracks: this.currentTracks
      });
    }
  }

  private onError(event: any, data: any) {
    if (data.fatal) {
      console.error('C2PA HLS Plugin: Fatal HLS error', data);
      this.notifyError('Playback error occurred');
    }
  }

  private updateTrackInfo() {
    const tracks: string[] = [];
    
    // Add video track info
    if (this.currentLevel >= 0) {
      const level = this.hls.levels[this.currentLevel];
      if (level) {
        tracks.push(`video-${level.height}p`);
      }
    }

    // Add audio track info
    const audioTrack = this.hls.audioTrack;
    if (audioTrack >= 0) {
      const track = this.hls.audioTracks[audioTrack];
      if (track) {
        tracks.push(`audio-${track.lang || 'unknown'}`);
      }
    }

    // Fallback to generic tracks
    if (tracks.length === 0) {
      tracks.push('main');
    }

    this.currentTracks = tracks;
  }

  private handleWorkerMessage(data: any) {
    // Forward verification results to badge element
    if (this.config.badgeElement) {
      this.config.badgeElement.dispatchEvent(new CustomEvent('c2-verify-update', {
        detail: data
      }));
    }

    // Log verification status
    console.debug('C2PA HLS Plugin: Verification update', data);
  }

  private notifyError(message: string) {
    if (this.config.badgeElement) {
      this.config.badgeElement.dispatchEvent(new CustomEvent('c2-verify-error', {
        detail: { message }
      }));
    }
  }

  // Public API methods
  public updateManifest(manifestUrl: string) {
    this.loadManifest(manifestUrl);
  }

  public setBadgeElement(badgeElement: HTMLElement) {
    this.config.badgeElement = badgeElement;
  }

  public getCurrentTracks(): string[] {
    return [...this.currentTracks];
  }

  public getManifest(): any {
    return this.manifest;
  }

  public destroy() {
    // Remove all event listeners
    for (const [event, handler] of this.eventListeners) {
      this.removeEventListener(event);
    }

    // Clean up worker
    if (this.verifyWorker) {
      this.verifyWorker.terminate();
      this.verifyWorker = null;
    }

    // Remove video element listeners
    const video = this.hls.media;
    if (video) {
      video.removeEventListener('timeupdate', this.onTimeUpdate.bind(this));
      video.removeEventListener('loadedmetadata', this.onLoadedMetadata.bind(this));
    }
  }
}

// Plugin registration function
export function installC2PAPlugin(hls: Hls, config?: HlsC2PAConfig): HlsC2PAPlugin {
  const plugin = new HlsC2PAPlugin(hls, config);
  
  // Store plugin instance for later access
  (hls as any).c2paPlugin = plugin;
  
  return plugin;
}

// TypeScript augmentation for Hls.js
declare module 'hls.js' {
  interface Hls {
    c2paPlugin?: HlsC2PAPlugin;
  }
}

export default HlsC2PAPlugin;
