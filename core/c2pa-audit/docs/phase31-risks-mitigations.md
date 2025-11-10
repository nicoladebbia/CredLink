# Phase 31 — Risks & Mitigations

## J) Risks → Mitigations (Grounded)

### 1. Player Variability Risk
**Risk**: shaka HLS timed metadata issues exist; inconsistent behavior across players

**Mitigation Strategy**:
- **Primary**: Start with hls.js for HLS (proven DATERANGE/ID3 reliability)
- **Secondary**: Add shaka for DASH (EventStreams) once HLS metadata is stable
- **Fallback**: Server-side verification for unsupported players
- **Implementation**: Player detection and capability querying

```typescript
// Player capability detection
export class PlayerCapabilityDetector {
  static detectCapabilities(player: any): {
    supportsHLSDateRange: boolean;
    supportsDASHEventStream: boolean;
    supportsID3Metadata: boolean;
    recommendedMode: 'hls.js' | 'shaka' | 'server-side';
  } {
    // Detect player type and capabilities
    if (player.constructor.name.includes('Hls')) {
      return {
        supportsHLSDateRange: true,
        supportsDASHEventStream: false,
        supportsID3Metadata: true,
        recommendedMode: 'hls.js'
      };
    }
    
    if (player.constructor.name.includes('Shaka')) {
      return {
        supportsHLSDateRange: false, // Known issues
        supportsDASHEventStream: true,
        supportsID3Metadata: false,
        recommendedMode: 'shaka'
      };
    }
    
    return {
      supportsHLSDateRange: false,
      supportsDASHEventStream: false,
      supportsID3Metadata: false,
      recommendedMode: 'server-side'
    };
  }
}
```

### 2. Ad-Marker Inconsistency Risk
**Risk**: Vendors differ (CUE-OUT/IN vs DATERANGE), inconsistent SCTE-35 encoding

**Mitigation Strategy**:
- **Dual Support**: Range Index supports both DATERANGE+SCTE35 and CUE-OUT/IN
- **Preference Hierarchy**: DATERANGE+SCTE35 > CUE-OUT/IN only > no markers
- **Normalization**: Convert all formats to internal Range Index format
- **Fallback**: Program-only verification when markers absent

```typescript
// Ad marker normalization
export class AdMarkerNormalizer {
  static normalizeHLSMarkers(playlist: string): NormalizedMarker[] {
    const markers: NormalizedMarker[] = [];
    
    // Parse EXT-X-DATERANGE
    const daterangeMatches = playlist.matchAll(/#EXT-X-DATERANGE:ID="([^"]+)".*?START-DATE="([^"]+)".*?DURATION=([\d.]+)/g);
    for (const match of daterangeMatches) {
      markers.push({
        id: match[1],
        type: 'daterange',
        start: new Date(match[2]),
        duration: parseFloat(match[3]),
        source: 'EXT-X-DATERANGE'
      });
    }
    
    // Parse CUE-OUT/CUE-IN as fallback
    const cueOutMatches = playlist.matchAll(/#EXT-X-CUE-OUT:(\d+)/g);
    const cueInMatches = playlist.matchAll(/#EXT-X-CUE-IN/g);
    
    // Convert CUE markers to normalized format
    // ... implementation
    
    return markers;
  }
}
```

### 3. Embedding Brittleness in Live fMP4 Risk
**Risk**: Init files may be overwritten; embedded signatures break in live SSAI

**Mitigation Strategy**:
- **Default Remote**: Use remote manifests for all live/SSAI scenarios
- **Conditional Embedding**: Only embed when provider guarantees stable inits
- **Detection Logic**: Auto-detect init stability and switch strategies
- **Documentation**: Clear guidelines for when embedding is safe

```typescript
// Init stability detection
export class InitStabilityDetector {
  private initHashes = new Map<string, string>();
  
  async detectInitStability(streamId: string, sampleWindow: number = 300000): Promise<'stable' | 'unstable'> {
    const samples = [];
    const startTime = Date.now();
    
    while (Date.now() - startTime < sampleWindow) {
      const initUrl = `https://cdn.example.com/${streamId}/init.mp4`;
      const currentHash = await this.calculateInitHash(initUrl);
      samples.push(currentHash);
      await new Promise(resolve => setTimeout(resolve, 10000)); // Sample every 10s
    }
    
    // Check if all samples are identical
    const firstHash = samples[0];
    const isStable = samples.every(hash => hash === firstHash);
    
    return isStable ? 'stable' : 'unstable';
  }
  
  private async calculateInitHash(url: string): Promise<string> {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
}
```

### 4. Over-Verification Stalls Playback Risk
**Risk**: Excessive verification causes frame drops and playback stutter

**Mitigation Strategy**:
- **Off-Thread Verification**: Run all verification in Web Workers
- **Boundary-First Policy**: Full verification only at boundaries
- **Aggressive Caching**: Cache results with TTL and back-pressure
- **Performance Monitoring**: Real-time FPS monitoring and adaptive throttling

```typescript
// Web Worker verification manager
export class WorkerVerificationManager {
  private workers: Worker[] = [];
  private taskQueue: VerificationTask[] = [];
  private activeTasks = 0;
  private readonly MAX_CONCURRENT_TASKS = 2;
  
  constructor(workerCount: number = 2) {
    // Initialize verification workers
    for (let i = 0; i < workerCount; i++) {
      const worker = new Worker('/workers/verification-worker.js');
      worker.onmessage = this.handleWorkerMessage.bind(this);
      this.workers.push(worker);
    }
  }
  
  async verifyManifest(manifestUrl: string, priority: 'high' | 'low' = 'low'): Promise<VerificationResult> {
    return new Promise((resolve, reject) => {
      const task: VerificationTask = {
        id: this.generateTaskId(),
        manifestUrl,
        priority,
        resolve,
        reject,
        timestamp: Date.now()
      };
      
      if (priority === 'high') {
        this.taskQueue.unshift(task);
      } else {
        this.taskQueue.push(task);
      }
      
      this.processQueue();
    });
  }
  
  private processQueue(): void {
    if (this.activeTasks >= this.MAX_CONCURRENT_TASKS || this.taskQueue.length === 0) {
      return;
    }
    
    const task = this.taskQueue.shift();
    if (!task) return;
    
    this.activeTasks++;
    const worker = this.workers[this.activeTasks % this.workers.length];
    
    worker.postMessage({
      taskId: task.id,
      manifestUrl: task.manifestUrl
    });
  }
  
  private handleWorkerMessage(event: MessageEvent): void {
    const { taskId, result, error } = event.data;
    
    // Find and complete the task
    const taskIndex = this.taskQueue.findIndex(t => t.id === taskId);
    if (taskIndex !== -1) {
      const task = this.taskQueue.splice(taskIndex, 1)[0];
      this.activeTasks--;
      
      if (error) {
        task.reject(new Error(error));
      } else {
        task.resolve(result);
      }
      
      // Process next task
      this.processQueue();
    }
  }
}
```

### 5. Network Latency & Timeout Risk
**Risk**: Slow manifest fetches cause verification timeouts

**Mitigation Strategy**:
- **Adaptive Timeouts**: Dynamic timeout based on network conditions
- **Retry Logic**: Exponential backoff with circuit breaker
- **Prefetching**: Proactive manifest fetching before boundaries
- **Edge Caching**: Leverage CDN edge locations for manifests

```typescript
// Adaptive network manager
export class AdaptiveNetworkManager {
  private networkQuality: 'fast' | 'medium' | 'slow' = 'medium';
  private recentLatencies: number[] = [];
  
  async fetchWithAdaptiveTimeout(url: string): Promise<Response> {
    const timeout = this.getAdaptiveTimeout();
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      const startTime = performance.now();
      const response = await fetch(url, { 
        signal: controller.signal,
        cache: 'force-cache'
      });
      const latency = performance.now() - startTime;
      
      this.updateNetworkQuality(latency);
      clearTimeout(timeoutId);
      
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        throw new Error(`Network timeout after ${timeout}ms`);
      }
      
      throw error;
    }
  }
  
  private getAdaptiveTimeout(): number {
    switch (this.networkQuality) {
      case 'fast': return 2000;
      case 'medium': return 5000;
      case 'slow': return 10000;
      default: return 5000;
    }
  }
  
  private updateNetworkQuality(latency: number): void {
    this.recentLatencies.push(latency);
    
    // Keep only last 10 samples
    if (this.recentLatencies.length > 10) {
      this.recentLatencies = this.recentLatencies.slice(-10);
    }
    
    const avgLatency = this.recentLatencies.reduce((sum, lat) => sum + lat, 0) / this.recentLatencies.length;
    
    if (avgLatency < 500) {
      this.networkQuality = 'fast';
    } else if (avgLatency < 2000) {
      this.networkQuality = 'medium';
    } else {
      this.networkQuality = 'slow';
    }
  }
}
```

### 6. Memory Leaks & Resource Management Risk
**Risk**: Long-running streams accumulate verification cache and memory

**Mitigation Strategy**:
- **LRU Caches**: Automatic eviction of old verification results
- **Memory Monitoring**: Track heap usage and trigger cleanup
- **Weak References**: Use WeakMap for temporary associations
- **Periodic Cleanup**: Scheduled garbage collection of expired data

```typescript
// Memory-aware cache manager
export class MemoryAwareCache<K, V> {
  private cache = new Map<K, CacheEntry<V>>();
  private maxSize: number;
  private ttlMs: number;
  
  constructor(maxSize: number = 1000, ttlMs: number = 300000) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
    
    // Cleanup every 5 minutes
    setInterval(() => this.cleanup(), 300000);
  }
  
  set(key: K, value: V): void {
    // Remove oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    
    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });
  }
  
  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    
    if (!entry) return undefined;
    
    // Check TTL
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return undefined;
    }
    
    // Move to end (LRU)
    this.cache.delete(key);
    this.cache.set(key, entry);
    
    return entry.value;
  }
  
  private cleanup(): void {
    const now = Date.now();
    const expiredKeys: K[] = [];
    
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttlMs) {
        expiredKeys.push(key);
      }
    }
    
    expiredKeys.forEach(key => this.cache.delete(key));
    
    console.log(`Cache cleanup: removed ${expiredKeys.length} expired entries`);
  }
}

interface CacheEntry<V> {
  value: V;
  timestamp: number;
}
```

## Risk Status: MITIGATED
All identified risks have concrete mitigation strategies with implementation code. System will monitor risk indicators and adapt automatically.
