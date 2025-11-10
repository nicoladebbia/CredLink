export interface Scenario {
  id: string;
  sandbox: 'strip-happy' | 'preserve-embed' | 'remote-only';
  transforms: Transform[];
  expected: ExpectedOutcome;
  notes?: string;
}

export interface Transform {
  tool: 'magick' | 'simulate-proxy' | 'copy';
  args: string[];
}

export interface ExpectedOutcome {
  remote_survives: boolean;
  embed_survives: boolean | 'maybe';
  notes?: string;
}

export interface HostilePathMatrix {
  version: number;
  defaults: {
    manifest_mode: 'remote';
    verify_host: string;
    manifest_host: string;
  };
  scenarios: Scenario[];
}

// Failure taxonomy with deterministic codes
export type FailureCode = 
  | 'SURVIVED'           // Everything works as expected
  | 'BROKEN_MANIFEST'    // Manifest fetch failed or hash mismatch
  | 'BROKEN_LINK'        // Link header missing or malformed
  | 'BROKEN_HEADERS'     // Required headers missing/invalid
  | 'DESTROYED_EMBED'    // Embedded claims completely stripped
  | 'DESTROYED_CONTENT'  // Content corrupted beyond recognition
  | 'INACCESSIBLE'       // Network/endpoint unreachable
  | 'INACCESSIBLE_404'   // Asset or manifest returns 404
  | 'INACCESSIBLE_TIMEOUT'; // Request timed out

export interface FailureTaxonomy {
  code: FailureCode;
  category: 'survived' | 'broken' | 'destroyed' | 'inaccessible';
  severity: 'info' | 'warning' | 'error' | 'critical';
  description: string;
  recovery_possible: boolean;
}

export const FAILURE_TAXONOMY: Record<FailureCode, FailureTaxonomy> = {
  SURVIVED: {
    code: 'SURVIVED',
    category: 'survived',
    severity: 'info',
    description: 'All provenance verification succeeded',
    recovery_possible: true
  },
  BROKEN_MANIFEST: {
    code: 'BROKEN_MANIFEST',
    category: 'broken',
    severity: 'error',
    description: 'Manifest fetch failed or hash alignment failed',
    recovery_possible: true
  },
  BROKEN_LINK: {
    code: 'BROKEN_LINK',
    category: 'broken',
    severity: 'error',
    description: 'Link header missing or malformed',
    recovery_possible: true
  },
  BROKEN_HEADERS: {
    code: 'BROKEN_HEADERS',
    category: 'broken',
    severity: 'warning',
    description: 'Required headers missing or invalid',
    recovery_possible: true
  },
  DESTROYED_EMBED: {
    code: 'DESTROYED_EMBED',
    category: 'destroyed',
    severity: 'warning',
    description: 'Embedded claims completely stripped by transform',
    recovery_possible: false
  },
  DESTROYED_CONTENT: {
    code: 'DESTROYED_CONTENT',
    category: 'destroyed',
    severity: 'critical',
    description: 'Content corrupted beyond recognition',
    recovery_possible: false
  },
  INACCESSIBLE: {
    code: 'INACCESSIBLE',
    category: 'inaccessible',
    severity: 'critical',
    description: 'Network endpoint unreachable',
    recovery_possible: true
  },
  INACCESSIBLE_404: {
    code: 'INACCESSIBLE_404',
    category: 'inaccessible',
    severity: 'error',
    description: 'Asset or manifest returns 404',
    recovery_possible: true
  },
  INACCESSIBLE_TIMEOUT: {
    code: 'INACCESSIBLE_TIMEOUT',
    category: 'inaccessible',
    severity: 'error',
    description: 'Request timed out',
    recovery_possible: true
  }
};

export interface ScenarioResult {
  scenario_id: string;
  sandbox: string;
  remote_survives: boolean;
  embed_survives: boolean;
  failure_code: FailureCode;
  failure_taxonomy: FailureTaxonomy;
  headers_snapshot: Record<string, string>;
  manifest_fetch: {
    status: number;
    hash_alignment: boolean;
    url: string;
  };
  timings_ms: {
    edge_worker: number;
    origin: number;
    manifest_fetch: number;
  };
  error?: string;
}

export interface SurvivalReport {
  run_id: string;
  timestamp: string;
  matrix_version: number;
  total_scenarios: number;
  remote_survival_rate: number;
  embed_survival_rate_preserve_only: number;
  scenarios_failed: number;
  failure_breakdown: Record<FailureCode, number>;
  results: ScenarioResult[];
}
