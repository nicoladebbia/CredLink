/**
 * Phase 6 - Optimizer Auto-Fallback: Durable Object Implementation
 * Ring buffer state management and decision logic
 */

import {
  RouteState,
  RouteMode,
  IngestEvent,
  Bucket,
  ScoreBreakdown,
  DecisionRecord,
  HeaderSnapshot,
  PolicyResponse,
  AdminViewResponse,
  BreakGlassConfig,
  Env
} from './types';

export class C2AutoFallbackDO implements DurableObject {
  private state: DurableObjectState;
  private storage: DurableObjectStorage;
  private env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.storage = state.storage;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    try {
      switch (url.pathname) {
        case "/ingest":
          return this.ingest(await request.json());
        
        case "/policy":
          return this.getPolicy();
        
        case "/admin":
          return this.adminView(request);
        
        default:
          return new Response("Not found", { status: 404 });
      }
    } catch (error) {
      console.error("DO error:", error);
      return new Response("Internal error", { status: 500 });
    }
  }

  private async loadState(routeKey: string): Promise<RouteState> {
    let routeState = await this.storage.get<RouteState>(`route:${routeKey}`);
    
    if (!routeState) {
      routeState = {
        route: routeKey,
        mode: this.env.REMOTE_ONLY_DEFAULT === "1" ? "FALLBACK_REMOTE_ONLY" : "NORMAL",
        buckets: [],
        lastDecision: null,
        openedIncidents: [],
        scoreThreshold: parseInt(this.env.SCORE_THRESHOLD || "100"),
        scoreRestore: parseInt(this.env.SCORE_RESTORE || "30"),
        minSamples: parseInt(this.env.ROUTE_MIN_SAMPLES || "40")
      };
    }
    
    return routeState;
  }

  private addToBuckets(routeState: RouteState, event: IngestEvent): void {
    const windowSecs = parseInt(this.env.WINDOW_SECS || "60");
    const now = event.tsSec;
    
    // Find or create bucket for this timestamp
    let bucket = routeState.buckets.find(b => b.tsSec === now);
    if (!bucket) {
      bucket = {
        tsSec: now,
        reqs: 0,
        embedSurvive: 0,
        signals: {}
      };
      routeState.buckets.push(bucket);
    }
    
    // Update bucket
    bucket.reqs++;
    
    if (event.isPreserve && event.embedProbe === true) {
      bucket.embedSurvive++;
    }
    
    // Add signals
    event.signals.forEach(signal => {
      bucket.signals[signal.id] = (bucket.signals[signal.id] || 0) + signal.weight;
    });
    
    // Clean old buckets outside window
    const cutoff = now - windowSecs;
    routeState.buckets = routeState.buckets.filter(b => b.tsSec >= cutoff);
    
    // Keep only last N buckets to prevent memory growth
    const maxBuckets = windowSecs * 2; // Keep some extra for safety
    if (routeState.buckets.length > maxBuckets) {
      routeState.buckets = routeState.buckets.slice(-maxBuckets);
    }
  }

  private computeScore(routeState: RouteState): number {
    const windowSecs = parseInt(this.env.WINDOW_SECS || "60");
    const cutoff = Math.floor(Date.now() / 1000) - windowSecs;
    
    return routeState.buckets
      .filter(bucket => bucket.tsSec >= cutoff)
      .reduce((total, bucket) => {
        return total + Object.values(bucket.signals).reduce((sum, weight) => sum + weight, 0);
      }, 0);
  }

  private totalSamples(routeState: RouteState): number {
    const windowSecs = parseInt(this.env.WINDOW_SECS || "60");
    const cutoff = Math.floor(Date.now() / 1000) - windowSecs;
    
    return routeState.buckets
      .filter(bucket => bucket.tsSec >= cutoff)
      .reduce((total, bucket) => total + bucket.reqs, 0);
  }

  private embedSurvival(routeState: RouteState): number {
    const windowSecs = parseInt(this.env.WINDOW_SECS || "60");
    const cutoff = Math.floor(Date.now() / 1000) - windowSecs;
    
    const recentBuckets = routeState.buckets.filter(bucket => bucket.tsSec >= cutoff);
    const totalPreserveReqs = recentBuckets.reduce((sum, bucket) => sum + bucket.reqs, 0);
    const totalEmbedSurvive = recentBuckets.reduce((sum, bucket) => sum + bucket.embedSurvive, 0);
    
    return totalPreserveReqs > 0 ? totalEmbedSurvive / totalPreserveReqs : 1.0;
  }

  private hysteresisOk(routeState: RouteState, now: number): boolean {
    if (!routeState.lastDecision) return true;
    
    const hysteresisSecs = parseInt(this.env.RESTORE_HYSTERESIS_SECS || "600");
    const decisionTime = new Date(routeState.lastDecision.startedAt).getTime();
    
    return (now - decisionTime) >= (hysteresisSecs * 1000);
  }

  async ingest(event: IngestEvent): Promise<Response> {
    const routeState = await this.loadState(event.route);
    
    // Add to ring buffer
    this.addToBuckets(routeState, event);
    
    // Compute current metrics
    const score = this.computeScore(routeState);
    const samples = this.totalSamples(routeState);
    const embedRate = this.embedSurvival(routeState);
    
    // Check for break-glass override
    const breakGlass = await this.getBreakGlassConfig(event.route);
    if (breakGlass) {
      if (breakGlass.mode === "FREEZE") {
        return new Response("OK"); // No state changes
      }
      // Force specific mode if break-glass is active
      if (routeState.mode !== breakGlass.mode) {
        await this.flip(
          routeState, 
          breakGlass.mode as RouteMode, 
          `Break-glass override: ${breakGlass.reason}`,
          this.collectSnapshot(routeState)
        );
      }
      await this.persistState(routeState);
      return new Response("OK");
    }
    
    // State machine logic
    const now = Date.now();
    
    if (routeState.mode === "NORMAL" && 
        samples >= routeState.minSamples && 
        score >= routeState.scoreThreshold) {
      await this.flip(
        routeState, 
        "FALLBACK_REMOTE_ONLY", 
        "Score threshold exceeded",
        this.collectSnapshot(routeState)
      );
    } else if (routeState.mode === "FALLBACK_REMOTE_ONLY") {
      if (score < routeState.scoreRestore && 
          this.hysteresisOk(routeState, now) && 
          embedRate >= 0.95) {
        await this.flip(
          routeState, 
          "RECOVERY_GUARD", 
          "Score below restore & embed stable",
          this.collectSnapshot(routeState)
        );
      }
    } else if (routeState.mode === "RECOVERY_GUARD") {
      if (score < routeState.scoreRestore && this.hysteresisOk(routeState, now)) {
        await this.flip(
          routeState, 
          "NORMAL", 
          "Sustained recovery",
          this.collectSnapshot(routeState)
        );
      } else if (score >= routeState.scoreThreshold) {
        await this.flip(
          routeState, 
          "FALLBACK_REMOTE_ONLY", 
          "Relapse during guard",
          this.collectSnapshot(routeState)
        );
      }
    }
    
    await this.persistState(routeState);
    return new Response("OK");
  }

  async getPolicy(): Promise<Response> {
    const url = new URL(this.state.id.toString());
    const routeKey = url.searchParams.get("route") || "default";
    const routeState = await this.loadState(routeKey);
    
    const response: PolicyResponse = {
      route: routeState.route,
      mode: routeState.mode,
      lastDecision: routeState.lastDecision,
      score: this.computeScore(routeState),
      samples: this.totalSamples(routeState),
      embedSurvival: this.embedSurvival(routeState)
    };
    
    return new Response(JSON.stringify(response), {
      headers: { "Content-Type": "application/json" }
    });
  }

  private async persistState(routeState: RouteState): Promise<void> {
    await this.storage.put(`route:${routeState.route}`, routeState);
    
    // Cache policy in KV for fast Worker access
    const policyKey = `policy:${routeState.route}`;
    await this.env.C2_POLICY_CACHE.put(policyKey, JSON.stringify({
      mode: routeState.mode,
      lastDecision: routeState.lastDecision,
      cachedAt: Date.now()
    }), { expirationTtl: 2 }); // 2 second TTL
  }

  private collectSnapshot(routeState: RouteState): HeaderSnapshot {
    const windowSecs = parseInt(this.env.WINDOW_SECS || "60");
    const cutoff = Math.floor(Date.now() / 1000) - windowSecs;
    
    const recentBuckets = routeState.buckets.filter(bucket => bucket.tsSec >= cutoff);
    const totalReqs = recentBuckets.reduce((sum, bucket) => sum + bucket.reqs, 0);
    
    // Aggregate signal data
    const allSignals: ScoreBreakdown = {};
    recentBuckets.forEach(bucket => {
      Object.entries(bucket.signals).forEach(([id, weight]) => {
        allSignals[id] = (allSignals[id] || 0) + weight;
      });
    });
    
    // Extract providers from signal IDs
    const seenProviders = Object.keys(allSignals)
      .filter(id => id.startsWith('HDR_'))
      .map(id => id.replace('HDR_', '').toLowerCase());
    
    return {
      sample: totalReqs,
      percentWebP: this.estimateFormatPercent(allSignals, 'HDR_CF_POLISH'),
      percentAVIF: this.estimateFormatPercent(allSignals, 'HDR_IMGIX'),
      seenProviders,
      contentTypeDrift: allSignals['MIME_DRIFT'] ? (allSignals['MIME_DRIFT'] / totalReqs) * 100 : 0,
      linkDroppedPct: allSignals['LINK_DROPPED'] ? (allSignals['LINK_DROPPED'] / totalReqs) * 100 : 0
    };
  }

  private estimateFormatPercent(signals: ScoreBreakdown, providerSignal: string): number {
    // Simplified estimation - real implementation would track actual content types
    return signals[providerSignal] ? 15.5 : 0.0; // Placeholder
  }

  private topRules(routeState: RouteState): string[] {
    const windowSecs = parseInt(this.env.WINDOW_SECS || "60");
    const cutoff = Math.floor(Date.now() / 1000) - windowSecs;
    
    const allSignals: ScoreBreakdown = {};
    routeState.buckets
      .filter(bucket => bucket.tsSec >= cutoff)
      .forEach(bucket => {
        Object.entries(bucket.signals).forEach(([id, weight]) => {
          allSignals[id] = (allSignals[id] || 0) + weight;
        });
      });
    
    return Object.entries(allSignals)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([id]) => id);
  }

  private async flip(
    routeState: RouteState, 
    to: RouteMode, 
    reason: string, 
    snapshot: HeaderSnapshot
  ): Promise<void> {
    const id = crypto.randomUUID();
    const record: DecisionRecord = {
      id,
      route: routeState.route,
      startedAt: new Date().toISOString(),
      stateFrom: routeState.mode,
      stateTo: to,
      reason,
      firedRules: this.topRules(routeState),
      snapshot,
      exitCondition: `score<${routeState.scoreRestore} for ${this.env.RESTORE_HYSTERESIS_SECS}s & embed≥0.95`,
      sig: this.hmacSign(JSON.stringify({
        id,
        route: routeState.route,
        to,
        reason,
        snapshot
      }))
    };
    
    // Append to incident log (would be R2 in production)
    await this.appendIncident(record);
    
    // Update state
    routeState.lastDecision = record;
    routeState.mode = to;
    routeState.openedIncidents.push(id);
  }

  private async appendIncident(record: DecisionRecord): Promise<void> {
    // In production, this would write to R2 with WORM storage
    // For this implementation, we'll store in DO storage with a log
    const logKey = `incident:${record.route}:${record.startedAt}`;
    await this.storage.put(logKey, record);
    
    // Update incident index
    const indexKey = `incidents:${record.route}`;
    const existingIndex = await this.storage.get<string[]>(indexKey) || [];
    const updatedIndex = [record.id, ...existingIndex.slice(0, 99)]; // Keep last 100
    await this.storage.put(indexKey, updatedIndex);
  }

  private async getBreakGlassConfig(routeKey: string): Promise<BreakGlassConfig | null> {
    const key = `breakglass:${routeKey}`;
    return await this.env.C2_BREAKGLASS.get(key);
  }

  private hmacSign(data: string): string {
    // Simplified HMAC signing - production would use proper crypto
    const encoder = new TextEncoder();
    const keyData = encoder.encode(this.env.HMAC_SECRET);
    const messageData = encoder.encode(data);
    
    // In production, use crypto.subtle.sign with HMAC
    return btoa(data + "_signed_" + this.env.TENANT_ID);
  }

  private isAuthorized(request: Request): boolean {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return false;
    }
    
    const token = authHeader.slice(7);
    return token === this.env.ADMIN_TOKEN;
  }

  private async loadState(routeKey: string): Promise<RouteState> {
    let routeState = await this.storage.get<RouteState>(`route:${routeKey}`);
    
    if (!routeState) {
      routeState = {
        route: routeKey,
        mode: this.env.REMOTE_ONLY_DEFAULT === "1" ? "FALLBACK_REMOTE_ONLY" : "NORMAL",
        buckets: [],
        lastDecision: null,
        openedIncidents: [],
        scoreThreshold: parseInt(this.env.SCORE_THRESHOLD || "100"),
        scoreRestore: parseInt(this.env.SCORE_RESTORE || "30"),
        minSamples: parseInt(this.env.ROUTE_MIN_SAMPLES || "40")
      };
    }
    
    return routeState;
  }

  private async persistState(routeState: RouteState): Promise<void> {
    await this.storage.put(`route:${routeState.route}`, routeState);
    
    // Cache policy in KV for fast Worker access
    const policyKey = `policy:${routeState.route}`;
    await this.env.C2_POLICY_CACHE.put(policyKey, JSON.stringify({
      mode: routeState.mode,
      lastDecision: routeState.lastDecision,
      cachedAt: Date.now()
    }), { expirationTtl: 2 }); // 2 second TTL
  }

  private addToBuckets(routeState: RouteState, event: IngestEvent): void {
    const windowSecs = parseInt(this.env.WINDOW_SECS || "60");
    const now = event.tsSec;
    
    // Find or create bucket for this timestamp
    let bucket = routeState.buckets.find(b => b.tsSec === now);
    if (!bucket) {
      bucket = {
        tsSec: now,
        reqs: 0,
        embedSurvive: 0,
        signals: {}
      };
      routeState.buckets.push(bucket);
    }
    
    // Update bucket
    bucket.reqs++;
    
    if (event.isPreserve && event.embedProbe === true) {
      bucket.embedSurvive++;
    }
    
    // Add signals
    event.signals.forEach(signal => {
      bucket.signals[signal.id] = (bucket.signals[signal.id] || 0) + signal.weight;
    });
    
    // Clean old buckets outside window
    const cutoff = now - windowSecs;
    routeState.buckets = routeState.buckets.filter(b => b.tsSec >= cutoff);
    
    // Keep only last N buckets to prevent memory growth
    const maxBuckets = windowSecs * 2; // Keep some extra for safety
    if (routeState.buckets.length > maxBuckets) {
      routeState.buckets = routeState.buckets.slice(-maxBuckets);
    }
  }

  private computeScore(routeState: RouteState): number {
    const windowSecs = parseInt(this.env.WINDOW_SECS || "60");
    const cutoff = Math.floor(Date.now() / 1000) - windowSecs;
    
    return routeState.buckets
      .filter(bucket => bucket.tsSec >= cutoff)
      .reduce((total, bucket) => {
        return total + Object.values(bucket.signals).reduce((sum, weight) => sum + weight, 0);
      }, 0);
  }

  private totalSamples(routeState: RouteState): number {
    const windowSecs = parseInt(this.env.WINDOW_SECS || "60");
    const cutoff = Math.floor(Date.now() / 1000) - windowSecs;
    
    return routeState.buckets
      .filter(bucket => bucket.tsSec >= cutoff)
      .reduce((total, bucket) => total + bucket.reqs, 0);
  }

  private embedSurvival(routeState: RouteState): number {
    const windowSecs = parseInt(this.env.WINDOW_SECS || "60");
    const cutoff = Math.floor(Date.now() / 1000) - windowSecs;
    
    const recentBuckets = routeState.buckets.filter(bucket => bucket.tsSec >= cutoff);
    const totalPreserveReqs = recentBuckets.reduce((sum, bucket) => sum + bucket.reqs, 0);
    const totalEmbedSurvive = recentBuckets.reduce((sum, bucket) => sum + bucket.embedSurvive, 0);
    
    return totalPreserveReqs > 0 ? totalEmbedSurvive / totalPreserveReqs : 1.0;
  }

  async adminView(request: Request): Promise<Response> {
    // Authorization check
    if (!this.isAuthorized(request)) {
      return new Response("Forbidden", { status: 403 });
    }
    
    const url = new URL(this.state.id.toString());
    const routeKey = url.searchParams.get("route") || "default";
    const routeState = await this.loadState(routeKey);
    
    const response: AdminViewResponse = {
      route: routeState.route,
      mode: routeState.mode,
      score: this.computeScore(routeState),
      samples: this.totalSamples(routeState),
      embedSurvival: this.embedSurvival(routeState),
      snapshot: this.collectSnapshot(routeState),
      lastDecision: routeState.lastDecision
    };
    
    return new Response(JSON.stringify(response), {
      headers: { "Content-Type": "application/json" }
    });
  }
}
