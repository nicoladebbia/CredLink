/**
 * Phase 11 — Trust Graph & Badge Reputation v1
 * Deterministic trust scoring function with transparent components
 */

import {
  TrustNode,
  TrustPath,
  ScoringResult,
  ScoreComponent,
  VerificationContext,
  ScoringWeights,
  GradeBoundaries,
  RevocationStatus,
  TrustGrade,
  ScoringError
} from './types';

// Default scoring weights (configurable)
export const DEFAULT_WEIGHTS: ScoringWeights = {
  base_chain: 40,
  hardware_attestation_fresh: 20,
  hardware_attestation_stale: 10,
  fresh_key_120d: 10,
  fresh_key_365d: 5,
  on_time_rotation: 5,
  conformance_program: 5,
  rep_published: 5,
  clean_history: 5,
  
  // Deductions
  revoked: -100,
  expired: -30,
  unknown_ca: -20,
  mixed_content: -10,
  stale_key: -10
};

// Default grade boundaries
export const DEFAULT_GRADE_BOUNDARIES: GradeBoundaries = {
  A: { min: 85, max: 100 },
  B: { min: 70, max: 84 },
  C: { min: 55, max: 69 },
  D: { min: 40, max: 54 },
  E: { min: 25, max: 39 },
  F: { min: 0, max: 24 }
};

/**
 * Calculate days since a given timestamp
 */
function daysSince(timestamp: string): number {
  const then = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - then.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Determine trust grade from score
 */
function gradeFromScore(score: number, boundaries: GradeBoundaries): TrustGrade {
  if (score >= boundaries.A.min && score <= boundaries.A.max) return 'A';
  if (score >= boundaries.B.min && score <= boundaries.B.max) return 'B';
  if (score >= boundaries.C.min && score <= boundaries.C.max) return 'C';
  if (score >= boundaries.D.min && score <= boundaries.D.max) return 'D';
  if (score >= boundaries.E.min && score <= boundaries.E.max) return 'E';
  return 'F';
}

/**
 * Create a score component
 */
function createComponent(
  name: string,
  delta: number,
  note?: string,
  evidence_url?: string
): ScoreComponent {
  return { name, delta, note, evidence_url };
}

/**
 * Extract key ID from certificate chain
 */
function extractKeyId(certChain: any[]): string {
  if (!certChain || certChain.length === 0) {
    throw new ScoringError('No certificate chain provided');
  }
  
  const leafCert = certChain[0];
  const fingerprint = leafCert.fingerprint || leafCert.sha256_fingerprint;
  const issuerCaId = leafCert.issuer_ca_id || 'unknown';
  
  return `key:${issuerCaId}:${fingerprint}`;
}

/**
 * Main scoring function - deterministic and transparent
 */
export function scoreTrustPath(
  orgNode: TrustNode,
  keyNode: TrustNode,
  deviceNode?: TrustNode,
  context: VerificationContext = { timestamp: new Date().toISOString() },
  weights: ScoringWeights = DEFAULT_WEIGHTS,
  boundaries: GradeBoundaries = DEFAULT_GRADE_BOUNDARIES
): ScoringResult {
  
  const components: ScoreComponent[] = [];
  let score = 0;
  let validChain = true;
  let revocationStatus: RevocationStatus = 'good';

  // Extract attributes
  const keyAttrs = keyNode.attrs;
  const orgAttrs = orgNode.attrs;
  const deviceAttrs = deviceNode?.attrs;

  try {
    // 1. Base chain validation (must be valid to continue)
    if (!keyAttrs.chain_valid) {
      components.push(createComponent(
        'base_chain',
        0,
        'Invalid certificate chain'
      ));
      return {
        score: 0,
        grade: 'F',
        components,
        valid_chain: false,
        revocation_status: revocationStatus
      };
    }
    
    components.push(createComponent('base_chain', weights.base_chain));
    score += weights.base_chain;

    // 2. Check for revocation (critical failure)
    if (keyAttrs.revoked) {
      components.push(createComponent(
        'revoked',
        weights.revoked,
        `Key revoked on ${keyAttrs.revocation_ts}`,
        keyAttrs.revocation_ts ? `revocation:${keyAttrs.revocation_ts}` : undefined
      ));
      score += weights.revoked; // Will force to 0
      revocationStatus = 'revoked';
    }

    // 3. Check for expired certificate
    if (keyAttrs.expires_at) {
      const daysUntilExpiry = daysSince(keyAttrs.expires_at) * -1; // Negative for future
      if (daysUntilExpiry < 0) {
        components.push(createComponent(
          'expired',
          weights.expired,
          `Certificate expired ${Math.abs(daysUntilExpiry)} days ago`
        ));
        score += weights.expired;
      }
    }

    // 4. Hardware attestation scoring
    if (deviceAttrs?.attested && deviceAttrs.last_attested) {
      const daysSinceAttestation = daysSince(deviceAttrs.last_attested);
      
      if (daysSinceAttestation <= 180) {
        components.push(createComponent(
          'hardware_attestation',
          weights.hardware_attestation_fresh,
          `Attested ${daysSinceAttestation} days ago`,
          deviceAttrs.evidence_pack_url
        ));
        score += weights.hardware_attestation_fresh;
      } else {
        components.push(createComponent(
          'hardware_attestation',
          weights.hardware_attestation_stale,
          `Attested ${daysSinceAttestation} days ago (stale)`,
          deviceAttrs.evidence_pack_url
        ));
        score += weights.hardware_attestation_stale;
      }
    } else {
      components.push(createComponent(
        'hardware_attestation',
        0,
        'No hardware attestation'
      ));
    }

    // 5. Key freshness scoring
    if (keyAttrs.created_at) {
      const keyAge = daysSince(keyAttrs.created_at);
      
      if (keyAge <= 120) {
        components.push(createComponent(
          'fresh_key',
          weights.fresh_key_120d,
          `Key created ${keyAge} days ago`
        ));
        score += weights.fresh_key_120d;
      } else if (keyAge <= 365) {
        components.push(createComponent(
          'fresh_key',
          weights.fresh_key_365d,
          `Key created ${keyAge} days ago`
        ));
        score += weights.fresh_key_365d;
      } else {
        components.push(createComponent(
          'fresh_key',
          0,
          `Key created ${keyAge} days ago (old)`
        ));
      }
    }

    // 6. On-time rotation bonus
    if (keyAttrs.rotated_on_time) {
      components.push(createComponent(
        'on_time_rotation',
        weights.on_time_rotation,
        'Key rotated on schedule'
      ));
      score += weights.on_time_rotation;
    }

    // 7. Conformance program participation
    const conformance = orgAttrs.conformance || [];
    if (conformance.includes('c2pa') || conformance.includes('cai')) {
      components.push(createComponent(
        'conformance',
        weights.conformance_program,
        `Member of: ${conformance.join(', ')}`
      ));
      score += weights.conformance_program;
    }

    // 8. Rotation Evidence Pack (REP) published
    if (deviceAttrs?.evidence_pack_url) {
      const repAge = deviceAttrs.last_attested ? 
        daysSince(deviceAttrs.last_attested) : 999;
      
      if (repAge <= 90) {
        components.push(createComponent(
          'rep_published',
          weights.rep_published,
          'Recent Rotation Evidence Pack',
          deviceAttrs.evidence_pack_url
        ));
        score += weights.rep_published;
      }
    }

    // 9. Clean history bonus
    if (!keyAttrs.had_incidents) {
      components.push(createComponent(
        'clean_history',
        weights.clean_history,
        'No security incidents'
      ));
      score += weights.clean_history;
    }

    // 10. Deductions
    
    // Unknown CA
    if (!keyAttrs.trust_root_known) {
      components.push(createComponent(
        'unknown_ca',
        weights.unknown_ca,
        'Chain to unrecognized CA'
      ));
      score += weights.unknown_ca;
    }

    // Mixed content
    if (context.mixed_content) {
      components.push(createComponent(
        'mixed_content',
        weights.mixed_content,
        'Manifest delivered over HTTP'
      ));
      score += weights.mixed_content;
    }

    // Stale key
    if (keyAttrs.last_seen) {
      const daysSinceLastSeen = daysSince(keyAttrs.last_seen);
      if (daysSinceLastSeen > 365) {
        components.push(createComponent(
          'stale_key',
          weights.stale_key,
          `Key last seen ${daysSinceLastSeen} days ago`
        ));
        score += weights.stale_key;
      }
    }

  } catch (error) {
    throw new ScoringError(`Error computing trust score: ${error.message}`, error);
  }

  // Clamp score to valid range
  score = Math.max(0, Math.min(100, score));
  
  // Determine grade
  const grade = gradeFromScore(score, boundaries);

  return {
    score,
    grade,
    components,
    valid_chain: validChain,
    revocation_status: revocationStatus
  };
}

/**
 * Generate plain language summary for trust path
 */
export function generateTrustSummary(
  orgNode: TrustNode,
  keyNode: TrustNode,
  score: ScoringResult
): string {
  
  const orgName = orgNode.attrs.display_name || 'Unknown Organization';
  const keyId = keyNode.node_id.split(':').pop()?.substring(0, 16) || 'unknown';
  const keyAlg = keyNode.attrs.alg || 'unknown';
  
  let summary = `Issued by ${orgName} (key ${keyId}, ${keyAlg})`;
  
  // Add hardware backing if present
  if (score.components.find(c => c.name === 'hardware_attestation' && c.delta > 0)) {
    summary += ', hardware-backed';
  }
  
  // Add rotation info
  if (score.components.find(c => c.name === 'on_time_rotation' && c.delta > 0)) {
    const createdAt = keyNode.attrs.created_at;
    if (createdAt) {
      const quarter = new Date(createdAt).toLocaleDateString('en-US', { 
        year: 'numeric', 
        quarter: 'numeric' 
      });
      summary += `, rotated ${quarter}`;
    }
  }
  
  // Add revocation status
  if (score.revocation_status === 'good') {
    summary += ', no revocations';
  } else if (score.revocation_status === 'revoked') {
    summary += ', REVOKED';
  } else {
    summary += ', revocation status unknown';
  }
  
  return summary;
}

/**
 * Build trust path object for API response
 */
export function buildTrustPath(
  orgNode: TrustNode,
  keyNode: TrustNode,
  deviceNode?: TrustNode
): TrustPath {
  
  const path: TrustPath = {
    key: {
      id: keyNode.node_id,
      alg: keyNode.attrs.alg || 'unknown',
      created_at: keyNode.attrs.created_at || '',
      last_seen: keyNode.attrs.last_seen,
      expires_at: keyNode.attrs.expires_at
    }
  };

  // Add organization info
  if (orgNode) {
    path.org = {
      id: orgNode.node_id,
      name: orgNode.attrs.display_name || 'Unknown',
      domain: orgNode.attrs.domain,
      conformance: orgNode.attrs.conformance
    };
  }

  // Add device info
  if (deviceNode) {
    path.device = {
      id: deviceNode.node_id,
      attested: deviceNode.attrs.attested || false,
      evidence: deviceNode.attrs.evidence_pack_url,
      kind: deviceNode.attrs.kind
    };
  }

  return path;
}

/**
 * Validate scoring configuration
 */
export function validateScoringConfig(weights: ScoringWeights): void {
  const requiredFields: (keyof ScoringWeights)[] = [
    'base_chain', 'hardware_attestation_fresh', 'hardware_attestation_stale',
    'fresh_key_120d', 'fresh_key_365d', 'on_time_rotation',
    'conformance_program', 'rep_published', 'clean_history',
    'revoked', 'expired', 'unknown_ca', 'mixed_content', 'stale_key'
  ];

  for (const field of requiredFields) {
    if (typeof weights[field] !== 'number') {
      throw new ScoringError(`Invalid scoring weight: ${field} must be a number`);
    }
  }

  // Validate that base_chain is positive
  if (weights.base_chain <= 0) {
    throw new ScoringError('base_chain weight must be positive');
  }

  // Validate that revoked deduction is negative enough
  if (weights.revoked > -100) {
    throw new ScoringError('revoked weight must be -100 or lower');
  }
}

/**
 * Export test fixtures for unit testing
 */
export const TEST_FIXTURES = {
  freshHardwareKey: {
    org: {
      node_id: 'org:test',
      type: 'org' as const,
      attrs: {
        display_name: 'Test Org',
        domain: 'test.example',
        conformance: ['c2pa', 'cai']
      },
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-10-31T00:00:00Z'
    },
    key: {
      node_id: 'key:test:abc123',
      type: 'key' as const,
      attrs: {
        alg: 'ES256',
        created_at: '2025-07-01T00:00:00Z',
        expires_at: '2026-07-01T00:00:00Z',
        attested: true,
        last_seen: '2025-10-31T00:00:00Z',
        chain_valid: true,
        trust_root_known: true,
        had_incidents: false,
        rotated_on_time: true
      },
      created_at: '2025-07-01T00:00:00Z',
      updated_at: '2025-10-31T00:00:00Z'
    },
    device: {
      node_id: 'dev:yubihsm2:SN123',
      type: 'device' as const,
      attrs: {
        kind: 'yubihsm2',
        attested: true,
        last_attested: '2025-09-30T00:00:00Z',
        evidence_pack_url: 'https://example.com/evidence/123'
      },
      created_at: '2025-07-01T00:00:00Z',
      updated_at: '2025-10-31T00:00:00Z'
    }
  },
  
  revokedKey: {
    org: {
      node_id: 'org:revoked',
      type: 'org' as const,
      attrs: { display_name: 'Revoked Org' },
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-10-31T00:00:00Z'
    },
    key: {
      node_id: 'key:test:revoked456',
      type: 'key' as const,
      attrs: {
        alg: 'ES256',
        created_at: '2025-01-01T00:00:00Z',
        chain_valid: true,
        revoked: true,
        revocation_ts: '2025-10-15T12:00:00Z'
      },
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-10-31T00:00:00Z'
    }
  }
};
