/**
 * Phase 6 - Optimizer Auto-Fallback: Type Definitions
 * Core data models and interfaces
 */
export type RouteMode = "NORMAL" | "FALLBACK_REMOTE_ONLY" | "RECOVERY_GUARD";
export interface Signal {
    id: string;
    weight: number;
}
export interface ScoreBreakdown {
    [signalId: string]: number;
}
export interface Bucket {
    tsSec: number;
    reqs: number;
    embedSurvive: number;
    signals: ScoreBreakdown;
}
export interface HeaderSnapshot {
    sample: number;
    percentWebP: number;
    percentAVIF: number;
    seenProviders: string[];
    contentTypeDrift: number;
    linkDroppedPct: number;
}
export interface DecisionRecord {
    id: string;
    route: string;
    startedAt: string;
    stateFrom: RouteMode;
    stateTo: RouteMode;
    reason: string;
    firedRules: string[];
    snapshot: HeaderSnapshot;
    exitCondition: string;
    sig: string;
}
export interface RouteState {
    route: string;
    mode: RouteMode;
    buckets: Bucket[];
    lastDecision: DecisionRecord | null;
    openedIncidents: string[];
    scoreThreshold: number;
    scoreRestore: number;
    minSamples: number;
}
export interface IngestEvent {
    route: string;
    tsSec: number;
    signals: Signal[];
    isPreserve: boolean;
    embedProbe: boolean | null;
}
export interface PolicyResponse {
    route: string;
    mode: RouteMode;
    lastDecision: DecisionRecord | null;
    score: number;
    samples: number;
    embedSurvival: number;
}
export interface AdminViewResponse {
    route: string;
    mode: RouteMode;
    score: number;
    samples: number;
    embedSurvival: number;
    snapshot: HeaderSnapshot;
    lastDecision: DecisionRecord | null;
}
export interface BreakGlassConfig {
    mode: "NORMAL" | "FALLBACK_REMOTE_ONLY" | "FREEZE";
    reason: string;
    openedBy: string;
    ttlMinutes: number;
    sig: string;
}
export interface IncidentLog {
    ts: string;
    tenant_id: string;
    route: string;
    state_from: RouteMode;
    state_to: RouteMode;
    reason: string;
    fired_rules: string[];
    window: {
        secs: number;
        samples: number;
        score: number;
        embed_survival: number;
        link_dropped_pct: number;
        content_type_drift: number;
        providers: string[];
    };
    headers_snapshot: {
        "content-type"?: string;
        "cache-control"?: string;
        "vary"?: string;
    };
    exit_condition: string;
    sig: string;
    key_id: string;
}
export interface Env {
    C2_AUTOFALLBACK: DurableObjectNamespace;
    C2_BREAKGLASS: KVNamespace;
    C2_POLICY_CACHE: KVNamespace;
    REMOTE_ONLY_DEFAULT: string;
    WINDOW_SECS: string;
    RESTORE_HYSTERESIS_SECS: string;
    ROUTE_MIN_SAMPLES: string;
    SCORE_THRESHOLD: string;
    SCORE_RESTORE: string;
    BADGE_REQUIRED: string;
    MANIFEST_BASE: string;
    TENANT_ID: string;
    HMAC_SECRET: string;
    ADMIN_TOKEN: string;
}
export interface DurableObjectNamespace {
    get(id: DurableObjectId): DurableObject;
    idFromName(name: string): DurableObjectId;
}
export interface DurableObjectId {
    toString(): string;
}
export interface DurableObject {
    fetch(request: Request): Promise<Response>;
}
export interface DurableObjectState {
    id: DurableObjectId;
    storage: DurableObjectStorage;
}
export interface DurableObjectStorage {
    get<T>(key: string): Promise<T | undefined>;
    put(key: string, value: any): Promise<void>;
    delete(key: string): Promise<void>;
    list(): Promise<DurableObjectStorageList>;
}
export interface DurableObjectStorageList {
    keys: Array<{
        name: string;
    }>;
}
export interface KVNamespace {
    get(key: string): Promise<string | undefined>;
    put(key: string, value: string, options?: {
        expirationTtl?: number;
    }): Promise<void>;
    delete(key: string): Promise<void>;
}
export interface ExecutionContext {
    waitUntil(promise: Promise<any>): void;
}
//# sourceMappingURL=types.d.ts.map