/**
 * C2 Badge Video Overlay Component
 * Production-ready, zero layout shift, fully accessible
 * Phase 11: Enhanced with trust scoring and reputation
 */

// Phase 11: Trust interface
export interface TrustInfo {
  summary: string;
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
  path: {
    org?: { name: string; domain?: string };
    key: { alg: string; created_at: string };
    device?: { attested: boolean; evidence?: string };
  };
  revocation: { status: string; checked_at: string };
  components: Array<{ name: string; delta: number; note?: string }>;
  disclaimer: string;
}

export interface VerifyState {
  status: 'unknown' | 'valid' | 'warning' | 'invalid';
  assertions: string[];
  timestamp: number;
  manifestUrl?: string;
  reason?: string;
  activeRegions?: any[];
  // Phase 11: Trust information
  trust?: TrustInfo;
}

export interface BadgeConfig {
  position?: 'top-right' | 'bottom-right' | 'top-left' | 'bottom-left';
  size?: 'small' | 'medium' | 'large';
  showLabel?: boolean;
  theme?: 'light' | 'dark' | 'auto';
}

export class C2BadgeVideo extends HTMLElement {
  private shadow: ShadowRoot;
  private badgeElement: HTMLElement;
  private statusDot: HTMLElement;
  private labelElement: HTMLElement;
  // Phase 11: Trust score element
  private trustScoreElement: HTMLElement;
  private verifyWorker: Worker | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private playerElement: HTMLVideoElement | null = null;
  private config: BadgeConfig;
  private currentState: VerifyState = {
    status: 'unknown',
    assertions: [],
    timestamp: 0
  };
  private lastVerifyTime: number = 0;

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: 'open' });
    this.config = {
      position: 'top-right',
      size: 'medium',
      showLabel: true,
      theme: 'auto'
    };
    this.render();
    this.setupEventListeners();
  }

  static get observedAttributes() {
    return ['player-id', 'manifest-url', 'config'];
  }

  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    if (oldValue === newValue) return;

    switch (name) {
      case 'player-id':
        this.attachToPlayer(newValue);
        break;
      case 'manifest-url':
        this.loadManifest(newValue);
        break;
      case 'config':
        this.updateConfig(newValue);
        break;
    }
  }

  private render() {
    this.shadow.innerHTML = `
      <style>
        :host {
          position: absolute;
          z-index: 9999;
          pointer-events: auto;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-size: 12px;
          line-height: 1;
        }

        .c2-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 8px;
          background: rgba(0, 0, 0, 0.8);
          border-radius: 12px;
          color: white;
          cursor: pointer;
          transition: all 0.2s ease;
          user-select: none;
          -webkit-user-select: none;
          backdrop-filter: blur(4px);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .c2-badge:hover {
          background: rgba(0, 0, 0, 0.9);
          transform: scale(1.05);
        }

        .c2-badge:focus {
          outline: 2px solid #007AFF;
          outline-offset: 2px;
        }

        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
          transition: all 0.3s ease;
        }

        .status-dot.unknown {
          background: #8E8E93;
          box-shadow: 0 0 4px rgba(142, 142, 147, 0.5);
        }

        .status-dot.valid {
          background: #34C759;
          box-shadow: 0 0 6px rgba(52, 199, 89, 0.6);
          animation: pulse-green 2s infinite;
        }

        .status-dot.warning {
          background: #FF9500;
          box-shadow: 0 0 6px rgba(255, 149, 0, 0.6);
          animation: pulse-yellow 2s infinite;
        }

        .status-dot.invalid {
          background: #FF3B30;
          box-shadow: 0 0 6px rgba(255, 59, 48, 0.6);
          animation: pulse-red 1.5s infinite;
        }

        .badge-label {
          font-weight: 500;
          white-space: nowrap;
          opacity: 0.9;
        }

        .badge-label.hidden {
          display: none;
        }

        /* Position variants */
        .position-top-right {
          top: 12px;
          right: 12px;
        }

        .position-bottom-right {
          bottom: 60px;
          right: 12px;
        }

        .position-top-left {
          top: 12px;
          left: 12px;
        }

        .position-bottom-left {
          bottom: 60px;
          left: 12px;
        }

        /* Size variants */
        .size-small {
          font-size: 10px;
          padding: 3px 6px;
        }

        .size-small .status-dot {
          width: 6px;
          height: 6px;
        }

        .size-large {
          font-size: 14px;
          padding: 6px 12px;
        }

        .size-large .status-dot {
          width: 10px;
          height: 10px;
        }

        /* High contrast mode support */
        @media (prefers-contrast: high) {
          .c2-badge {
            background: black;
            border: 2px solid white;
          }
        }

        /* Reduced motion support */
        @media (prefers-reduced-motion: reduce) {
          .c2-badge,
          .status-dot {
            transition: none;
            animation: none;
          }
        }

        /* Dark theme support */
        @media (prefers-color-scheme: dark) {
          .c2-badge[data-theme="auto"] {
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
          }
        }

        /* Light theme support */
        @media (prefers-color-scheme: light) {
          .c2-badge[data-theme="auto"] {
            background: rgba(255, 255, 255, 0.9);
            color: black;
            border: 1px solid rgba(0, 0, 0, 0.1);
          }
        }

        @keyframes pulse-green {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }

        @keyframes pulse-yellow {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }

        @keyframes pulse-red {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.1); }
        }

        /* Phase 11: Trust score styles */
        .trust-score {
          font-size: 10px;
          font-weight: 600;
          margin-left: 2px;
          padding: 1px 4px;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.2);
        }

        .trust-grade-A { background: rgba(52, 199, 89, 0.3); }
        .trust-grade-B { background: rgba(52, 199, 89, 0.2); }
        .trust-grade-C { background: rgba(255, 149, 0, 0.2); }
        .trust-grade-D { background: rgba(255, 149, 0, 0.3); }
        .trust-grade-E { background: rgba(255, 59, 48, 0.2); }
        .trust-grade-F { background: rgba(255, 59, 48, 0.3); }

        .trust-summary {
          max-width: 200px;
          font-size: 11px;
          line-height: 1.2;
          margin-top: 2px;
        }

        /* Screen reader only text */
        .sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border: 0;
        }
      </style>

      <div class="c2-badge position-${this.config.position} size-${this.config.size}" 
           role="button" 
           tabindex="0"
           aria-expanded="false"
           aria-controls="c2-verify-modal"
           data-theme="${this.config.theme}">
        <div class="status-dot unknown"></div>
        <span class="badge-label ${!this.config.showLabel ? 'hidden' : ''}">C2PA</span>
        <!-- Phase 11: Trust score indicator -->
        <span class="trust-score hidden" id="trust-score"></span>
        <span class="sr-only">Content authenticity verification status</span>
      </div>
    `;

    this.badgeElement = this.shadow.querySelector('.c2-badge') as HTMLElement;
    this.statusDot = this.shadow.querySelector('.status-dot') as HTMLElement;
    this.labelElement = this.shadow.querySelector('.badge-label') as HTMLElement;
    // Phase 11: Trust score element reference
    this.trustScoreElement = this.shadow.querySelector('#trust-score') as HTMLElement;
  }

  private setupEventListeners() {
    // Keyboard accessibility
    this.badgeElement.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.showVerifyModal();
      }
    });

    // Click to show verification details
    this.badgeElement.addEventListener('click', () => {
      this.showVerifyModal();
    });

    // Handle resize for positioning
    this.resizeObserver = new ResizeObserver(() => {
      this.updatePosition();
    });
  }

  private attachToPlayer(playerId: string) {
    const player = document.getElementById(playerId) as HTMLVideoElement;
    if (!player) {
      console.warn(`C2Badge: Player element with ID "${playerId}" not found`);
      return;
    }

    this.playerElement = player;
    
    // Position badge relative to player container
    const container = player.parentElement || player;
    container.style.position = container.style.position || 'relative';
    container.appendChild(this);

    // Start verification monitoring
    this.startVerificationMonitoring();
    
    // Monitor player resize
    this.resizeObserver.observe(container);
  }

  private async loadManifest(manifestUrl: string) {
    if (!manifestUrl) return;

    try {
      const response = await fetch(manifestUrl, {
        headers: { 'Accept': 'application/c2pa+json' }
      });

      if (!response.ok) {
        throw new Error(`Manifest fetch failed: ${response.status}`);
      }

      const manifest = await response.json();
      this.initializeVerification(manifest, manifestUrl);
    } catch (error) {
      console.error('C2Badge: Failed to load manifest', error);
      this.updateState({
        status: 'unknown',
        assertions: [],
        timestamp: Date.now(),
        reason: 'Manifest load failed'
      });
    }
  }

  private initializeVerification(manifest: any, manifestUrl: string) {
    // Initialize verification worker
    if (!this.verifyWorker) {
      this.verifyWorker = new Worker('/packages/player-hooks/src/verify.worker.js');
      
      this.verifyWorker.onmessage = (e) => {
        // Phase 11: Handle trust information from verification response
        const verificationData = e.data;
        const trustData = verificationData.trust;
        
        this.updateState({
          status: verificationData.status || 'unknown',
          assertions: verificationData.active_assertions || [],
          timestamp: Date.now(),
          manifestUrl,
          reason: verificationData.reason,
          trust: trustData ? {
            summary: trustData.summary,
            score: trustData.score,
            grade: trustData.grade,
            path: trustData.path,
            revocation: trustData.revocation,
            components: trustData.components,
            disclaimer: trustData.disclaimer
          } : undefined
        });
      };
    }

    // Send manifest to worker
    this.verifyWorker.postMessage({
      type: 'init',
      manifest,
      manifestUrl
    });
  }

  private startVerificationMonitoring() {
    if (!this.playerElement) return;

    // Monitor time updates for continuous verification
    this.playerElement.addEventListener('timeupdate', () => {
      if (this.verifyWorker && this.playerElement) {
        // Throttle time updates to avoid overwhelming the worker
        const currentTime = Math.floor(this.playerElement.currentTime * 10) / 10; // 100ms precision
        
        if (currentTime !== this.lastVerifyTime) {
          this.lastVerifyTime = currentTime;
          
          this.verifyWorker.postMessage({
            type: 'verify',
            currentTime,
            tracks: this.getCurrentTracks()
          });
        }
      }
    });

    // Monitor track changes
    this.playerElement.addEventListener('loadedmetadata', () => {
      if (this.verifyWorker) {
        this.verifyWorker.postMessage({
          type: 'tracks-changed',
          tracks: this.getCurrentTracks()
        });
      }
    });
  }

  private getCurrentTracks(): string[] {
    if (!this.playerElement) return [];

    const tracks: string[] = [];
    
    // Video track
    if (this.playerElement.videoWidth > 0) {
      tracks.push('video');
    }

    // Audio tracks
    const audioTracks = this.playerElement.audioTracks;
    if (audioTracks && audioTracks.length > 0) {
      for (let i = 0; i < audioTracks.length; i++) {
        if (audioTracks[i].enabled) {
          tracks.push(`audio-${i}`);
        }
      }
    }

    return tracks.length > 0 ? tracks : ['main'];
  }

  private updateState(state: Partial<VerifyState>) {
    this.currentState = { ...this.currentState, ...state };
    this.renderState();
  }

  private renderState() {
    const { status, assertions, trust } = this.currentState;

    // Update status dot
    this.statusDot.className = `status-dot ${status}`;
    
    // Phase 11: Update trust score display
    if (trust && this.config.showLabel) {
      this.trustScoreElement.textContent = `${trust.score}/100`;
      this.trustScoreElement.className = `trust-score trust-grade-${trust.grade.toUpperCase()}`;
      this.trustScoreElement.classList.remove('hidden');
      
      // Update main label to show trust summary
      this.labelElement.textContent = trust.summary.length > 30 
        ? trust.summary.substring(0, 30) + '...' 
        : trust.summary;
    } else {
      this.trustScoreElement.classList.add('hidden');
      
      // Update label based on status (fallback)
      if (this.config.showLabel) {
        switch (status) {
          case 'valid':
            this.labelElement.textContent = 'Verified';
            break;
          case 'warning':
            this.labelElement.textContent = 'Warning';
            break;
          case 'invalid':
            this.labelElement.textContent = 'Invalid';
            break;
          default:
            this.labelElement.textContent = 'C2PA';
        }
      }
    }

    // Update ARIA label with trust information
    let ariaLabel = `Content authenticity: ${status}.`;
    if (trust) {
      ariaLabel += ` Trust score: ${trust.score} out of 100, grade ${trust.grade}.`;
      ariaLabel += ` ${trust.summary}`;
    }
    const assertionText = assertions.length > 0 ? assertions.join(', ') : 'No assertions';
    ariaLabel += ` Assertions: ${assertionText}`;
    
    this.badgeElement.setAttribute('aria-label', ariaLabel);
  }

  private showVerifyModal() {
    // Dispatch custom event for parent to handle modal display
    this.dispatchEvent(new CustomEvent('c2-show-verify-modal', {
      detail: this.currentState,
      bubbles: true
    }));
  }

  private updatePosition() {
    // Position is handled by CSS classes, but we can add custom logic here
    // if needed for complex player layouts
  }

  private updateConfig(configString: string) {
    try {
      const newConfig = JSON.parse(configString);
      this.config = { ...this.config, ...newConfig };
      this.render(); // Re-render with new config
    } catch (error) {
      console.error('C2Badge: Invalid config JSON', error);
    }
  }

  // Public API methods
  public getState(): VerifyState {
    return { ...this.currentState };
  }

  public setConfig(config: Partial<BadgeConfig>) {
    this.config = { ...this.config, ...config };
    this.render();
  }

  public destroy() {
    if (this.verifyWorker) {
      this.verifyWorker.terminate();
      this.verifyWorker = null;
    }
    
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    this.remove();
  }
}

// Register the custom element
customElements.define('c2-badge-video', C2BadgeVideo);

// Export for TypeScript users
export default C2BadgeVideo;
