/**
 * Phase 11 — Trust Graph & Badge Reputation v1
 * TypeScript interfaces for trust graph, scoring, and revocations
 */

// Base node types
export type NodeType = 'key' | 'org' | 'device';
export type EdgeType = 'issued_by' | 'rotated_to' | 'attested_by' | 'used_by';
export type RevocationStatus = 'good' | 'revoked' | 'unknown' | 'hold';
export type TrustGrade = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

// Trust node interface
export interface TrustNode {
  node_id: string;                    // Stable identifier
  type: NodeType;
  attrs: NodeAttributes;
  created_at: string;                 // ISO timestamp
  updated_at: string;                 // ISO timestamp
}

// Node attributes by type
export interface NodeAttributes {
  // Key attributes
  alg?: string;                       // ES256, RS256, etc.
  created_at?: string;                // Key creation time
  expires_at?: string;                // Key expiration
  attested?: boolean;                 // Hardware attestation status
  last_seen?: string;                 // Last verification time
  conformance?: string[];             // C2PA/CAI conformance programs
  revoked?: boolean;                  // Revocation status
  revocation_ts?: string;             // Revocation timestamp
  issuer_ca_id?: string;              // Issuing CA identifier
  chain_valid?: boolean;              // Chain validation result
  trust_root_known?: boolean;         // Known trust root
  had_incidents?: boolean;            // Security incidents
  rotated_on_time?: boolean;          // Rotation compliance
  stale?: boolean;                    // Stale key flag
  
  // Organization attributes
  display_name?: string;              // Human-readable name
  domain?: string;                    // Organization domain
  tenant_id?: string;                 // Internal tenant ID
  
  // Device attributes
  kind?: string;                      // yubihsm2, vault, camera, other
  evidence_pack_url?: string;         // Link to evidence pack
  first_attested?: string;            // First attestation time
  last_attested?: string;             // Last attestation time
  serial?: string;                    // Device serial number
}

// Trust edge interface
export interface TrustEdge {
  edge_id: string;
  from_node: string;
  to_node: string;
  edge_type: EdgeType;
  timestamp: string;                  // ISO timestamp
  attrs: EdgeAttributes;
  created_at: string;
}

// Edge attributes
export interface EdgeAttributes {
  evidence_url?: string;              // Link to evidence
  csr_fingerprint?: string;           // Certificate signing request
  rotation_pack_url?: string;         // Rotation evidence pack
  manifest_url?: string;              // Manifest URL for used_by edges
  asset_url?: string;                 // Asset URL for used_by edges
}

// Revocation record
export interface Revocation {
  id: number;
  key_id: string;
  status: RevocationStatus;
  source: string;                     // ocsp, crl, internal
  reason?: string;
  evidence_url?: string;
  timestamp: string;
  created_at: string;
}

// Trust score with breakdown
export interface TrustScore {
  key_id: string;
  score: number;                      // 0-100
  grade: TrustGrade;
  components: ScoreComponent[];
  computed_at: string;
  expires_at?: string;                // Cache expiration
  created_at: string;
  updated_at: string;
}

// Score component for transparency
export interface ScoreComponent {
  name: string;                       // Component identifier
  delta: number;                      // Point contribution
  note?: string;                      // Additional context
  evidence_url?: string;              // Supporting evidence
}

// Trust path for a key
export interface TrustPath {
  org?: {
    id: string;
    name: string;
    domain?: string;
    conformance?: string[];
  };
  key: {
    id: string;
    alg: string;
    created_at: string;
    last_seen?: string;
    expires_at?: string;
  };
  device?: {
    id: string;
    attested: boolean;
    evidence?: string;
    kind?: string;
  };
  rotation?: {
    evidence_url?: string;
    timestamp?: string;
  };
}

// Trust snippet returned by API
export interface TrustSnippet {
  summary: string;                    // Plain language summary
  score: number;                      // 0-100 guidance score
  grade: TrustGrade;                  // A-F grade
  path: TrustPath;                    // Trust path details
  revocation: {
    status: RevocationStatus;
    checked_at: string;
  };
  components: ScoreComponent[];       // Score breakdown
  ttl_seconds: number;                // Cache TTL
  disclaimer: string;                 // Guidance disclaimer
}

// Verification context for scoring
export interface VerificationContext {
  mixed_content?: boolean;            // HTTP vs HTTPS
  asset_url?: string;                 // Asset being verified
  manifest_url?: string;              // Manifest URL
  tenant_id?: string;                 // Requesting tenant
  user_agent?: string;                // Client user agent
  timestamp: string;                  // Verification time
}

// Scoring result
export interface ScoringResult {
  score: number;
  grade: TrustGrade;
  components: ScoreComponent[];
  valid_chain: boolean;
  revocation_status: RevocationStatus;
}

// Revocation source configuration
export interface RevocationSource {
  name: string;
  url: string;
  type: 'ocsp' | 'crl' | 'json' | 'internal';
  last_modified?: string;
  poll_interval_seconds: number;
  enabled: boolean;
  failureCount?: number;
}

// Cache entry for trust snippets
export interface TrustCacheEntry {
  key_id: string;
  snippet: TrustSnippet;
  cached_at: string;
  expires_at: string;
  etag?: string;
}

// Database connection interface
export interface DatabaseConnection {
  query(sql: string, params?: any[]): Promise<DatabaseResult>;
}

export interface DatabaseResult {
  rows: any[];
  rowCount?: number;
}

// Revocation event data
export interface RevocationEvent {
  key_id: string;
  status: RevocationStatus;
  source: string;
  timestamp: string;
}

// Cache invalidation event
export interface CacheInvalidationEvent {
  keyId: string;
  timestamp: string;
}

// Detailed trust path response
export interface DetailedTrustPath {
  key: TrustNode;
  org?: TrustNode;
  device?: TrustNode;
  edges: TrustEdge[];
  depth: number;
}

// Admin interfaces
export interface AdminRevocationRequest {
  key_id: string;
  reason: string;
  evidence_url?: string;
  source?: string;
}

export interface TrustGraphStats {
  total_nodes: number;
  total_edges: number;
  nodes_by_type: Record<NodeType, number>;
  edges_by_type: Record<EdgeType, number>;
  keys_by_grade: Record<TrustGrade, number>;
  revoked_keys: number;
  stale_keys: number;
  last_updated: string;
}

// Score calculation weights (configurable)
export interface ScoringWeights {
  base_chain: number;                 // +40 if valid
  hardware_attestation_fresh: number; // +20 if <180 days
  hardware_attestation_stale: number; // +10 if >180 days
  fresh_key_120d: number;             // +10 if ≤120 days
  fresh_key_365d: number;             // +5 if 121-365 days
  on_time_rotation: number;           // +5 if rotated on time
  conformance_program: number;        // +5 if C2PA/CAI member
  rep_published: number;              // +5 if REP published
  clean_history: number;              // +5 if no incidents
  
  // Deductions
  revoked: number;                    // -100 (force to 0)
  expired: number;                    // -30
  unknown_ca: number;                 // -20
  mixed_content: number;              // -10
  stale_key: number;                  // -10
}

// Grade boundaries
export interface GradeBoundaries {
  A: { min: number; max: number };
  B: { min: number; max: number };
  C: { min: number; max: number };
  D: { min: number; max: number };
  E: { min: number; max: number };
  F: { min: number; max: number };
}

// Trust service configuration
export interface TrustServiceConfig {
  cache_ttl_seconds: number;
  revocation_poll_interval_seconds: number;
  scoring_weights: ScoringWeights;
  grade_boundaries: GradeBoundaries;
  trust_root_cas: string[];
  revocation_sources: RevocationSource[];
}

// Error types
export class TrustError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'TrustError';
  }
}

export class RevocationError extends TrustError {
  constructor(message: string, details?: any) {
    super(message, 'REVOCATION_ERROR', details);
    this.name = 'RevocationError';
  }
}

export class ScoringError extends TrustError {
  constructor(message: string, details?: any) {
    super(message, 'SCORING_ERROR', details);
    this.name = 'ScoringError';
  }
}

export class GraphError extends TrustError {
  constructor(message: string, details?: any) {
    super(message, 'GRAPH_ERROR', details);
    this.name = 'GraphError';
  }
}
