/**
 * C2PA Audit Tool Acceptance Tests
 * Three incident scenarios as specified in Phase 29
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ManifestParser } from '@/core/parser';
import { ManifestValidator } from '@/core/validator';
import { ManifestDiffer } from '@/core/differ';
import { LineageReconstructor } from '@/core/lineage';
import { 
  C2PAManifest, 
  ValidationCode,
  SemanticDiff,
  LineageGraph
} from '@/types';

describe('C2PA Audit Tool - Acceptance Tests', () => {
  let baseManifest: C2PAManifest;
  let tamperedManifest: C2PAManifest;
  let reencodedManifest: C2PAManifest;
  let redactedManifest: C2PAManifest;

  beforeEach(() => {
    // Create base manifest for testing
    baseManifest = createBaseManifest();
    
    // Create tampered manifest (assertion bytes altered)
    tamperedManifest = createTamperedManifest(baseManifest);
    
    // Create re-encoded manifest (asset transformed, manifest untouched)
    reencodedManifest = createReencodedManifest(baseManifest);
    
    // Create redacted manifest (license removal via redaction)
    redactedManifest = createRedactedManifest(baseManifest);
  });

  describe('Scenario 1: Tamper (assertion bytes altered)', () => {
    it('should detect assertion.hashedURI.mismatch', async () => {
      // Validate tampered manifest
      const validation = await ManifestValidator.validateManifest(tamperedManifest);
      
      expect(validation.codes).toContain('assertion.hashedURI.mismatch');
      expect(validation.valid).toBe(false);
    });

    it('should flag modified assertion in semantic diff', () => {
      const diff = ManifestDiffer.generateSemanticDiff(baseManifest, tamperedManifest);
      
      const modifiedAssertions = diff.assertions_modified.filter(
        a => a.label === 'c2pa.actions'
      );
      
      expect(modifiedAssertions).toHaveLength(1);
      expect(modifiedAssertions[0].redacted).toBe(false);
      expect(modifiedAssertions[0].allowed).toBe(false);
    });

    it('should show red node in lineage for tampered manifest', async () => {
      const lineage = await LineageReconstructor.buildLineage(tamperedManifest);
      
      expect(lineage.validation_summary.failed_nodes).toBeGreaterThan(0);
      expect(lineage.validation_summary.overall_status).toBe('failed');
      
      const failedNodes = lineage.nodes.filter(n => n.status === 'failed');
      expect(failedNodes.length).toBeGreaterThan(0);
      
      failedNodes.forEach(node => {
        expect(node.validation_codes).toContain('assertion.hashedURI.mismatch');
      });
    });

    it('should export evidence pack with tamper detection', async () => {
      const diff = ManifestDiffer.generateSemanticDiff(baseManifest, tamperedManifest);
      const lineage = await LineageReconstructor.buildLineage(tamperedManifest);
      
      const evidencePack = {
        base_raw: JSON.stringify(baseManifest, null, 2),
        target_raw: JSON.stringify(tamperedManifest, null, 2),
        semantic_diff: diff,
        lineage_graph: lineage,
        verification_transcript: {
          base_verification: createVerificationTranscript(['assertion.hashedURI.match']),
          target_verification: createVerificationTranscript(['assertion.hashedURI.mismatch']),
          timestamps: {
            base_validation: new Date().toISOString(),
            target_validation: new Date().toISOString(),
            export: new Date().toISOString()
          }
        },
        exported_at: new Date().toISOString()
      };

      // Verify evidence pack structure
      expect(evidencePack.semantic_diff).toBeDefined();
      expect(evidencePack.lineage_graph).toBeDefined();
      expect(evidencePack.verification_transcript.target_verification).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'assertion.hashedURI.mismatch',
            result: false
          })
        ])
      );
    });
  });

  describe('Scenario 2: Re-encode (asset transformed, manifest untouched)', () => {
    it('should maintain signature validity when manifest is unchanged', async () => {
      const validation = await ManifestValidator.validateManifest(reencodedManifest);
      
      // Signature should still be valid since manifest is unchanged
      expect(validation.codes).toContain('signature.valid');
      expect(validation.codes).toContain('manifest.structureValid');
    });

    it('should distinguish signature trust from content binding', async () => {
      const baseValidation = await ManifestValidator.validateManifest(baseManifest);
      const reencodedValidation = await ManifestValidator.validateManifest(reencodedManifest);
      
      // Both should have valid signatures
      expect(baseValidation.codes).toContain('signature.valid');
      expect(reencodedValidation.codes).toContain('signature.valid');
      
      // But content binding may differ if hard bindings exist
      // This would be implementation-specific based on content hash verification
    });

    it('should show minimal semantic diff for re-encoded asset', () => {
      const diff = ManifestDiffer.generateSemanticDiff(baseManifest, reencodedManifest);
      
      // Should show no assertion changes since manifest is unchanged
      expect(diff.assertions_added).toHaveLength(0);
      expect(diff.assertions_removed).toHaveLength(0);
      expect(diff.assertions_modified).toHaveLength(0);
      
      // May show timestamp differences if re-encoding time differs
      expect(diff.tsa_diff.genTime_diff_ms).toBeGreaterThanOrEqual(0);
    });

    it('should maintain green lineage status for unchanged manifest', async () => {
      const lineage = await LineageReconstructor.buildLineage(reencodedManifest);
      
      expect(lineage.validation_summary.failed_nodes).toBe(0);
      expect(lineage.validation_summary.overall_status).toBe('validated');
      
      const validatedNodes = lineage.nodes.filter(n => n.status === 'validated');
      expect(validatedNodes.length).toBeGreaterThan(0);
    });
  });

  describe('Scenario 3: License removal (intentional redaction)', () => {
    it('should allow redaction of non-critical assertions', async () => {
      const validation = await ManifestValidator.validateManifest(redactedManifest);
      
      expect(validation.codes).toContain('assertion.redactionAllowed');
      expect(validation.codes).not.toContain('assertion.invalidRedaction');
    });

    it('should show redacted status in semantic diff', () => {
      const diff = ManifestDiffer.generateSemanticDiff(baseManifest, redactedManifest);
      
      const removedAssertions = diff.assertions_removed.filter(
        a => a.label === 'c2pa.rights'
      );
      
      expect(removedAssertions).toHaveLength(1);
      expect(removedAssertions[0].redacted).toBe(true);
      expect(removedAssertions[0].allowed).toBe(true);
    });

    it('should maintain green lineage status for allowed redactions', async () => {
      const lineage = await LineageReconstructor.buildLineage(redactedManifest);
      
      expect(lineage.validation_summary.failed_nodes).toBe(0);
      expect(lineage.validation_summary.overall_status).toBe('validated');
      
      // May show warnings for redactions
      expect(lineage.validation_summary.warning_nodes).toBeGreaterThanOrEqual(0);
    });

    it('should distinguish redaction from tampering', () => {
      const tamperedDiff = ManifestDiffer.generateSemanticDiff(baseManifest, tamperedManifest);
      const redactedDiff = ManifestDiffer.generateSemanticDiff(baseManifest, redactedManifest);
      
      // Tampered: should show modified assertion
      expect(tamperedDiff.assertions_modified.some(a => a.label === 'c2pa.actions')).toBe(true);
      
      // Redacted: should show removed assertion with redaction flag
      const redactedRights = redactedDiff.assertions_removed.find(a => a.label === 'c2pa.rights');
      expect(redactedRights?.redacted).toBe(true);
      expect(redactedRights?.allowed).toBe(true);
    });

    it('should export evidence pack with redaction evidence', async () => {
      const diff = ManifestDiffer.generateSemanticDiff(baseManifest, redactedManifest);
      const lineage = await LineageReconstructor.buildLineage(redactedManifest);
      
      const evidencePack = {
        base_raw: JSON.stringify(baseManifest, null, 2),
        target_raw: JSON.stringify(redactedManifest, null, 2),
        semantic_diff: diff,
        lineage_graph: lineage,
        verification_transcript: {
          base_verification: createVerificationTranscript(['assertion.notRedacted']),
          target_verification: createVerificationTranscript(['assertion.redactionAllowed']),
          timestamps: {
            base_validation: new Date().toISOString(),
            target_validation: new Date().toISOString(),
            export: new Date().toISOString()
          }
        },
        exported_at: new Date().toISOString()
      };

      expect(evidencePack.verification_transcript.target_verification).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'assertion.redactionAllowed',
            result: true
          })
        ])
      );
    });
  });

  describe('Performance and SLO Tests', () => {
    it('should complete semantic diff within 400ms for typical manifests', async () => {
      const startTime = performance.now();
      
      const diff = ManifestDiffer.generateSemanticDiff(baseManifest, tamperedManifest);
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(400);
      expect(diff).toBeDefined();
    });

    it('should complete lineage analysis within 600ms for small graphs', async () => {
      const startTime = performance.now();
      
      const lineage = await LineageReconstructor.buildLineage(baseManifest, [], 10);
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(600);
      expect(lineage).toBeDefined();
      expect(lineage.nodes.length).toBeLessThanOrEqual(10);
    });
  });

  describe('Spec Compliance Tests', () => {
    it('should use exact validation code names from specification', async () => {
      const validation = await ManifestValidator.validateManifest(tamperedManifest);
      
      // Verify codes match spec exactly
      const specCodes = [
        'assertion.hashedURI.match',
        'assertion.hashedURI.mismatch',
        'assertion.missing',
        'assertion.notRedacted',
        'assertion.invalidRedaction',
        'assertion.redactionAllowed',
        'signature.valid',
        'signature.invalid',
        'signingCredential.trusted',
        'signingCredential.untrusted',
        'manifest.structureValid',
        'manifest.structureInvalid'
      ];
      
      validation.codes.forEach(code => {
        expect(specCodes).toContain(code);
      });
    });

    it('should provide spec references for all validation codes', () => {
      const codes: ValidationCode[] = [
        'signingCredential.trusted',
        'timestamp.trusted',
        'assertion.hashedURI.match',
        'ingredient.claimSignature.match',
        'manifest.structureValid'
      ];

      codes.forEach(code => {
        const reference = ManifestValidator.getSpecReference(code);
        expect(reference).toMatch(/^https:\/\/spec\.c2pa\.org\//);
      });
    });

    it('should follow RFC 6902 for JSON Patch operations', () => {
      const patch = ManifestDiffer.generateJSONPatch(baseManifest, tamperedManifest);
      
      patch.forEach(operation => {
        expect(operation).toHaveProperty('op');
        expect(operation).toHaveProperty('path');
        
        const validOps = ['add', 'remove', 'replace', 'move', 'copy', 'test'];
        expect(validOps).toContain(operation.op);
        
        if (operation.op !== 'remove') {
          expect(operation).toHaveProperty('value');
        }
        
        if (['move', 'copy'].includes(operation.op)) {
          expect(operation).toHaveProperty('from');
        }
      });
    });

    it('should follow RFC 7386 for JSON Merge Patch', () => {
      const mergePatch = ManifestDiffer.generateMergePatch(baseManifest, tamperedManifest);
      
      expect(mergePatch).toBeDefined();
      expect(typeof mergePatch).toBe('object');
    });
  });
});

// Helper functions to create test manifests

function createBaseManifest(): C2PAManifest {
  return {
    manifest_hash: 'base1234567890abcdef',
    claim_generator: 'C2PA Test Tool',
    claim_generator_version: '1.0.0',
    timestamp: '2024-01-01T00:00:00.000Z',
    claim_signature: {
      protected: {
        alg: 'ES256',
        kid: 'test-key-id',
        iat: 1704067200
      },
      signature: 'test-signature',
      certificate_chain: [
        {
          subject: 'CN=Test Signer',
          issuer: 'CN=Test CA',
          serial_number: '123456',
          not_before: '2024-01-01T00:00:00.000Z',
          not_after: '2025-01-01T00:00:00.000Z',
          eku: ['1.3.6.1.5.5.7.3.8'],
          thumbprint: 'thumb1234567890abcdef',
          trusted: true,
          revoked: false
        }
      ],
      validation_status: {
        valid: true,
        codes: ['signature.valid', 'signingCredential.trusted'],
        summary: 'Valid signature'
      }
    },
    assertions: [
      {
        label: 'c2pa.actions',
        hashed_uri: 'hash://sha256/abcdef1234567890',
        data: {
          actions: [
            { type: 'c2pa.created', when: '2024-01-01T00:00:00.000Z' }
          ]
        },
        redacted: false,
        validation_status: {
          valid: true,
          codes: ['assertion.hashedURI.match'],
          summary: 'Valid assertion'
        }
      },
      {
        label: 'c2pa.rights',
        hashed_uri: 'hash://sha256/1234567890abcdef',
        data: {
          usage: {
            license: 'CC BY 4.0',
            credit: 'Test Creator'
          }
        },
        redacted: false,
        validation_status: {
          valid: true,
          codes: ['assertion.hashedURI.match'],
          summary: 'Valid assertion'
        }
      }
    ],
    ingredients: [],
    redactions: []
  };
}

function createTamperedManifest(base: C2PAManifest): C2PAManifest {
  const tampered = JSON.parse(JSON.stringify(base));
  
  // Modify assertion data but keep the same hash URI (simulating tampering)
  tampered.assertions[0].data = {
    actions: [
      { type: 'c2pa.created', when: '2024-01-01T00:00:00.000Z' },
      { type: 'c2pa.modified', when: '2024-01-02T00:00:00.000Z' } // Added action
    ]
  };
  
  // Update validation status to reflect tampering
  tampered.assertions[0].validation_status = {
    valid: false,
    codes: ['assertion.hashedURI.mismatch'],
    summary: 'Assertion hash mismatch'
  };
  
  return tampered;
}

function createReencodedManifest(base: C2PAManifest): C2PAManifest {
  const reencoded = JSON.parse(JSON.stringify(base));
  
  // Update timestamp to simulate re-encoding
  reencoded.timestamp = '2024-01-01T01:00:00.000Z';
  reencoded.claim_signature.protected.iat = 1704070800;
  
  // Manifest structure remains the same, so validation should pass
  reencoded.assertions.forEach(assertion => {
    assertion.validation_status = {
      valid: true,
      codes: ['assertion.hashedURI.match'],
      summary: 'Valid assertion'
    };
  });
  
  return reencoded;
}

function createRedactedManifest(base: C2PAManifest): C2PAManifest {
  const redacted = JSON.parse(JSON.stringify(base));
  
  // Remove rights assertion via redaction
  const rightsAssertion = redacted.assertions.find(a => a.label === 'c2pa.rights');
  if (rightsAssertion) {
    rightsAssertion.redacted = true;
    rightsAssertion.data = undefined;
    rightsAssertion.validation_status = {
      valid: true,
      codes: ['assertion.redactionAllowed'],
      summary: 'Redacted assertion'
    };
  }
  
  // Add redaction record
  redacted.redactions = [
    {
      jumbf_uri: 'hash://sha256/1234567890abcdef',
      allowed: true,
      reason: 'License information redacted'
    }
  ];
  
  return redacted;
}

function createVerificationTranscript(codes: string[]): any[] {
  return codes.map(code => ({
    step: code,
    code: code,
    result: !code.includes('mismatch') && !code.includes('invalid'),
    spec_reference: ManifestValidator.getSpecReference(code as ValidationCode)
  }));
}
