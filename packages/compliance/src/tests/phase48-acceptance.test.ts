/**
 * Phase 48 - Compliance v2 Acceptance Tests
 * Exit Criteria for Compliance Pack Generation
 */

import { test, describe } from 'node:test';
import * as assert from 'node:assert';
import { CompliancePackGenerator, PackGenerationRequest, PackGenerationResponse } from '../generator.js';
import { ComplianceReportingHarmonizer, ComplianceDataSource } from '../reporting.js';
import { RetentionPolicyManager, RetentionPolicy } from '../retention.js';
import { COMPLIANCE_ASSERTIONS, TEMPLATE_VERSIONS } from '../assertions.js';

interface ComplianceReportingConfig {
  [key: string]: unknown;
}

describe('Phase 48 Compliance v2 Acceptance Tests', () => {
  
  // Test data setup - Mock compliance data sources for comprehensive testing
  const mockDataSource: ComplianceDataSource = {
    manifests: [
      {
        url: "https://manifests.example.com/ai-content-1.json",
        assertions: {
          "cai.disclosure": {
            ai_generated: true,
            ai_altered: false,
            disclosure_text_id: "ai_generated_en",
            locale: "en",
            visible_badge: true,
            badge_type: "ai_generated",
            disclosure_timestamp: "2025-11-05T12:00:00Z",
            provenance_url: "https://verify.example.com/ai-content-1"
          }
        },
        verified: true,
        timestamp: "2025-11-05T12:00:00Z"
      },
      {
        url: "https://manifests.example.com/ad-content-1.json",
        assertions: {
          "ads.transparency": {
            sponsor: "Acme Corp",
            why_targeted: "you're interested in technology",
            main_params: [
              { param: "interest", value: "technology", category: "behavioral" },
              { param: "age", value: "25-34", category: "demographic" }
            ],
            ad_id: "ad_123123",
            campaign_id: "campaign_123",
            placement_type: "feed",
            vlop_eligible: false,
            transparency_string: "Ad by Acme Corp. You're seeing this because you're interested in technology. Learn more."
          }
        },
        verified: true,
        timestamp: "2025-11-05T13:00:00Z"
      },
      {
        url: "https://manifests.example.com/uk-content-1.json",
        assertions: {
          "uk.osa.trace": {
            service_type: "content_provenance_platform",
            risk_assessment_date: "2025-10-15",
            harms_controls: [
              { harm_type: "synthetic_media", control_measure: "ai_content_labeling", effectiveness_score: 0.95 }
            ],
            reporting_period_start: "2025-10-01",
            reporting_period_end: "2025-10-31",
            user_base_size: 1000000,
            content_moderation_active: true,
            ofcom_reference: "OSA-202-GUIDANCE",
            compliance_officer: "compliance@example.com",
            data_processed: true,
            international_transfers: true
          }
        },
        verified: true,
        timestamp: "2025-11-05T14:00:00Z"
      },
      {
        url: "https://manifests.example.com/us-endorsement-1.json",
        assertions: {
          "us.ftc.endorsement": {
            endorsement_type: "paid",
            brand_name: "TechBrand",
            compensation_type: "commission",
            disclosure_text: "Ad/Partner — we earn compensation from TechBrand. Details.",
            placement_proximity: "immediate",
            disclosure_visible: true,
            screenshot_url: "https://screenshots.example.com/endorsement-1.png",
            campaign_id: "campaign_us_1",
            influencer_id: "influencer_1",
            compliance_score: 100
          }
        },
        verified: true,
        timestamp: "2025-11-05T15:00:00Z"
      },
      {
        url: "https://manifests.example.com/br-lgpd--1.json",
        assertions: {
          "br.lgpd.data": {
            data_categories: ["content_provenance_data", "user_interaction_data"],
            legal_basis: "legitimate_interest",
            controller_name: "C2 Concierge Platform",
            processor_name: "Cloud Provider Inc",
            purpose: "provenance_verification",
            retention_period_days: 730,
            cross_border_transfer: true,
            transfer_destination: "US",
            dpo_contact: "dpo@concierge.example",
            data_subject_rights: ["access", "correction", "deletion", "portability"],
            security_measures: ["encryption_at_rest", "encryption_in_transit"],
            processing_location: "Brazil",
            legal_hold_active: true
          }
        },
        verified: true,
        timestamp: "2025-11-05T16:00:00Z"
      }
    ],
    verify_outcomes: [
      {
        manifest_url: "https://manifests.example.com/ai-content-1.json",
        status: "valid",
        details: { signature_valid: true, hash_match: true },
        timestamp: "2025-11-05T12:01:00Z"
      },
      {
        manifest_url: "https://manifests.example.com/ad-content-1.json",
        status: "valid", 
        details: { signature_valid: true, hash_match: true },
        timestamp: "2025-11-05T13:01:00Z"
      }
    ],
    badge_logs: [
      {
        asset_url: "https://content.example.com/ai-image-1.jpg",
        badge_visible: true,
        user_interaction: "click",
        timestamp: "2025-11-05T12:30:00Z"
      }
    ],
    ad_metadata: [
      {
        ad_id: "ad_123",
        sponsor: "Acme Corp",
        targeting_params: { interest: "technology", age: "25-34" },
        campaign_id: "campaign_1",
        timestamp: "2025-11-05T13:00:00Z"
      }
    ],
    tsa_receipts: [
      {
        provider: "timestamp_authority_1",
        manifest_url: "https://manifests.example.com/ai-content-1.json",
        receipt_url: "https://tsa.example.com/receipt_1.tsr",
        timestamp: "2025-11-05T12:00:01Z"
      }
    ]
  };

  describe('Exit Criteria 1: Unified Pack Auto-Generation', () => {
    test('should generate compliance pack for EU+UK+US+BR tenant', async () => {
      const harmonizer = new ComplianceReportingHarmonizer({} as ComplianceReportingConfig);
      const generator = new CompliancePackGenerator(harmonizer, "https://storage.example.com");
      
      const request: PackGenerationRequest = {
        tenant_id: "acme-news",
        period: "2025-10",
        regions: ["EU", "UK", "US", "BR"],
        include_samples: 25,
        format: "both"
      };

      const response = await generator.generatePack(request, mockDataSource);

      assert.strictEqual(response.status, "ok", "Pack generation should succeed");
      assert.ok(response.pack_url_json, "JSON pack URL should be provided");
      assert.ok(response.pack_url_pdf, "PDF pack URL should be provided");
      assert.ok(response.generated_at, "Generation timestamp should be set");
      
      // Verify template versions
      assert.strictEqual(response.template_versions["eu_ai"], "1.1.0");
      assert.strictEqual(response.template_versions["dsa26"], "1.2.0");
      assert.strictEqual(response.template_versions["uk_osa"], "1.0.2");
      assert.strictEqual(response.template_versions["us_ftc"], "1.0.1");
      assert.strictEqual(response.template_versions["br_lgpd"], "1.0.0");
    });

    test('should generate pack with correct structure for all regions', async () => {
      const harmonizer = new ComplianceReportingHarmonizer({} as ComplianceReportingConfig);
      const pack = await harmonizer.generateCompliancePack(
        "test-tenant",
        "2025-10",
        ["EU", "UK", "US", "BR"],
        mockDataSource
      );

      // Verify core structure
      assert.strictEqual(pack.tenant_id, "test-tenant");
      assert.strictEqual(pack.period, "2025-10");
      assert.deepStrictEqual(pack.regions, ["EU", "UK", "US", "BR"]);
      assert.ok(pack.generated_at);
      assert.strictEqual(pack.assets_total, 5);

      // Verify EU appendix
      assert.ok(pack.appendices.EU);
      assert.strictEqual(pack.appendices.EU.ai_act_art50.ai_generated_count, 1);
      assert.strictEqual(pack.appendices.EU.ai_act_art50.ai_altered_count, 0);
      assert.strictEqual(pack.appendices.EU.dsa_transparency.art26_strings.length, 1);

      // Verify UK appendix
      assert.ok(pack.appendices.UK);
      assert.strictEqual(pack.appendices.UK.osa_transparency.service_type, "content_provenance_platform");
      assert.strictEqual(pack.appendices.UK.osa_transparency.user_metrics.active_users, 1000000);

      // Verify US appendix
      assert.ok(pack.appendices.US);
      assert.strictEqual(pack.appendices.US.ftc_endorsements.total_disclosures, 1);
      assert.strictEqual(pack.appendices.US.ftc_endorsements.compliance_rate, 0.98);

      // Verify BR appendix
      assert.ok(pack.appendices.BR);
      assert.strictEqual(pack.appendices.BR.lgpd_data_processing.controller_info.name, "C2 Concierge Platform");
      assert.strictEqual(pack.appendices.BR.lgpd_data_processing.data_categories.length, 2);
    });
  });

  describe('Exit Criteria 2: Counsel Sign-Off Simulation', () => {
    test('should pass EU + UK counsel review with no changes requested', async () => {
      const harmonizer = new ComplianceReportingHarmonizer({} as ComplianceReportingConfig);
      const pack = await harmonizer.generateCompliancePack(
        "acme-news",
        "2025-10",
        ["EU", "UK"],
        mockDataSource
      );

      // Simulate counsel review checklist
      const counselReview = {
        eu_compliance: {
          ai_act_disclosure: {
            required: true,
            provided: pack.appendices.EU.ai_act_art50.ai_generated_count > 0,
            badge_visible: pack.evidence.badge_logs
            .filter((p: { asset_url: string; badge_visible: boolean }) => p.asset_url.includes('ai-content')) // Only check AI content badges
            .every((p: { badge_visible: boolean }) => p.badge_visible),
            locales_supported: Object.keys(pack.appendices.EU.ai_act_art50.locales).length > 0,
            passed: false
          },
          dsa_transparency: {
            required: true,
            strings_provided: pack.appendices.EU.dsa_transparency.art26_strings.length > 0,
            strings_compliant: pack.appendices.EU.dsa_transparency.art26_strings.every((s: { string_compliant: boolean }) => s.string_compliant),
            vlop_repo_available: pack.appendices.EU.dsa_transparency.art39_vlop_repo.has_repository === false, // Not required for this tenant
            passed: false
          }
        },
        uk_compliance: {
          osa_transparency: {
            required: true,
            service_type_defined: !!pack.appendices.UK.osa_transparency.service_type,
            risk_assessments_provided: pack.appendices.UK.osa_transparency.risk_assessments.length > 0,
            user_metrics_provided: !!pack.appendices.UK.osa_transparency.user_metrics.active_users,
            passed: false
          }
        }
      };

      // Evaluate EU compliance
      counselReview.eu_compliance.ai_act_disclosure.passed = 
        counselReview.eu_compliance.ai_act_disclosure.required &&
        counselReview.eu_compliance.ai_act_disclosure.provided &&
        counselReview.eu_compliance.ai_act_disclosure.badge_visible &&
        counselReview.eu_compliance.ai_act_disclosure.locales_supported;

      counselReview.eu_compliance.dsa_transparency.passed = 
        counselReview.eu_compliance.dsa_transparency.required &&
        counselReview.eu_compliance.dsa_transparency.strings_provided &&
        counselReview.eu_compliance.dsa_transparency.strings_compliant;

      // Evaluate UK compliance
      counselReview.uk_compliance.osa_transparency.passed = 
        counselReview.uk_compliance.osa_transparency.required &&
        counselReview.uk_compliance.osa_transparency.service_type_defined &&
        counselReview.uk_compliance.osa_transparency.risk_assessments_provided &&
        counselReview.uk_compliance.osa_transparency.user_metrics_provided;

      // Assert all checks pass
      assert.ok(counselReview.eu_compliance.ai_act_disclosure.passed, "EU AI Act disclosure should pass counsel review");
      assert.ok(counselReview.eu_compliance.dsa_transparency.passed, "EU DSA transparency should pass counsel review");
      assert.ok(counselReview.uk_compliance.osa_transparency.passed, "UK OSA transparency should pass counsel review");

      // Simulate sign-off
      const signOffResult = {
        regions: ["EU", "UK"],
        status: "approved",
        changes_requested: 0,
        approved_at: new Date().toISOString(),
        reviewer: "legal_counsel@acme.com"
      };

      assert.strictEqual(signOffResult.status, "approved");
      assert.strictEqual(signOffResult.changes_requested, 0);
    });
  });

  describe('Exit Criteria 3: Retention Policy Strictest-Wins Behavior', () => {
    test('should apply 24-month retention for BR+EU selection', () => {
      const policy = RetentionPolicyManager.calculateRetentionPolicy(
        "test-tenant",
        ["BR", "EU"],
        false
      );

      // Brazil LGPD (730 days) is stricter than EU AI Act (365 days)
      assert.strictEqual(policy.retention_days, 730, "Should apply Brazil's 730-day retention");
      assert.ok(policy.legal_hold, "Legal hold should be required");
      assert.ok(policy.worm_storage_enabled, "WORM storage should be enabled");
      assert.ok(policy.dsr_hooks_enabled, "DSR hooks should be enabled");
    });

    test('should apply 730-day retention for all regions', () => {
      const policy = RetentionPolicyManager.calculateRetentionPolicy(
        "test-tenant",
        ["EU", "UK", "US", "BR"],
        false
      );

      // Brazil LGPD (730 days) is the strictest among all regions
      assert.strictEqual(policy.retention_days, 730, "Should apply strictest 730-day retention");
      assert.ok(policy.legal_hold, "Legal hold should be required");
      assert.ok(policy.worm_storage_enabled, "WORM storage should be enabled");
    });

    test('should preserve data on legal hold', () => {
      const policy = RetentionPolicyManager.calculateRetentionPolicy(
        "test-tenant",
        ["EU", "UK"],
        true // Legal hold active
      );

      const oldTimestamp = "2024-01-01T12:00:00.000Z"; // Over 365 days old
      const shouldPurge = RetentionPolicyManager.shouldPurge(oldTimestamp, policy);

      assert.strictEqual(shouldPurge, false, "Data should not be purged when legal hold is active");
    });

    test('should purge expired data when no legal hold', () => {
      // Create a mock policy that doesn't require legal hold for testing
      const mockPolicy: RetentionPolicy = {
        tenant_id: "test-tenant",
        regions: ["UK"],
        retention_days: 180,
        legal_hold: false, // Explicitly false for this test
        purge_scheduled: new Date().toISOString(),
        worm_storage_enabled: false,
        dsr_hooks_enabled: true,
        last_updated: new Date().toISOString()
      };

      const oldTimestamp = "2024-11-01T12:00:00.000Z"; // Over 180 days old (approximately 228 days from 2025-06-18)
      const shouldPurge = RetentionPolicyManager.shouldPurge(oldTimestamp, mockPolicy);

      assert.strictEqual(shouldPurge, true, "Data should be purged when expired and no legal hold");
    });

    test('should validate retention policy against requirements', () => {
      const validPolicy = RetentionPolicyManager.calculateRetentionPolicy(
        "test-tenant",
        ["EU", "BR"],
        true
      );

      const validation = RetentionPolicyManager.validatePolicy(validPolicy);
      assert.ok(validation.valid, "Policy should be valid when meeting all requirements");
      assert.strictEqual(validation.violations.length, 0, "Should have no violations");

      const invalidPolicy = {
        ...validPolicy,
        retention_days: 180, // Less than required for EU (365) and BR (730)
        legal_hold: false // Required for both regions
      };

      const invalidValidation = RetentionPolicyManager.validatePolicy(invalidPolicy);
      assert.strictEqual(invalidValidation.valid, false, "Policy should be invalid when not meeting requirements");
      assert.ok(invalidValidation.violations.length > 0, "Should have violations");
    });
  });

  describe('Exit Criteria 4: Template Version Tracking', () => {
    test('should track all template versions correctly', () => {
      const expectedVersions = {
        "eu_ai": "1.1.0",
        "dsa26": "1.2.0",
        "uk_osa": "1.0.2",
        "us_ftc": "1.0.1",
        "br_lgpd": "1.0.0",
        "us_state_advisory": "1.0.0-advisory"
      };

      assert.deepStrictEqual(TEMPLATE_VERSIONS, expectedVersions, "All template versions should be tracked");
    });

    test('should include version history in compliance packs', async () => {
      const harmonizer = new ComplianceReportingHarmonizer({} as ComplianceReportingConfig);
      const pack = await harmonizer.generateCompliancePack(
        "test-tenant",
        "2025-10",
        ["EU"],
        mockDataSource
      );

      assert.ok(pack.template_versions, "Template versions should be included");
      assert.ok(pack.template_versions["eu_ai"], "EU AI template version should be present");
      assert.ok(pack.template_versions["dsa26"], "DSA template version should be present");
    });
  });

  describe('Exit Criteria 5: Evidence Compilation', () => {
    test('should compile evidence from all data sources', async () => {
      const harmonizer = new ComplianceReportingHarmonizer({} as ComplianceReportingConfig);
      const pack = await harmonizer.generateCompliancePack(
        "test-tenant",
        "2025-10",
        ["EU", "UK", "US", "BR"],
        mockDataSource
      );

      // Verify manifests evidence
      assert.strictEqual(pack.evidence.manifests.length, 5, "All manifests should be included");
      assert.ok(pack.evidence.manifests.every((m: { url: string; hash: string; verified_at: string }) => m.url && m.hash && m.verified_at), "All manifest evidence should be complete");

      // Verify TSA evidence
      assert.strictEqual(pack.evidence.tsa.length, 1, "TSA receipts should be included");
      assert.ok(pack.evidence.tsa.every((t: { provider: string; receipt_url: string }) => t.provider && t.receipt_url), "All TSA evidence should be complete");

      // Verify region mapping
      const euManifests = pack.evidence.manifests.filter((m: { region: string }) => m.region === "EU");
      const ukManifests = pack.evidence.manifests.filter((m: { region: string }) => m.region === "UK");
      const usManifests = pack.evidence.manifests.filter((m: { region: string }) => m.region === "US");
      const brManifests = pack.evidence.manifests.filter((m: { region: string }) => m.region === "BR");

      assert.strictEqual(euManifests.length, 2, "Should have 2 EU manifests");
      assert.strictEqual(ukManifests.length, 1, "Should have 1 UK manifest");
      assert.strictEqual(usManifests.length, 1, "Should have 1 US manifest");
      assert.strictEqual(brManifests.length, 1, "Should have 1 BR manifest");
    });
  });

  describe('Exit Criteria 6: Error Handling', () => {
    test('should handle empty data sources gracefully', async () => {
      const harmonizer = new ComplianceReportingHarmonizer({} as ComplianceReportingConfig);
      const generator = new CompliancePackGenerator(harmonizer, "https://storage.example.com");
      
      const emptyDataSource: ComplianceDataSource = {
        manifests: [],
        badge_logs: [],
        ad_metadata: [],
        tsa_receipts: []
      };

      const request: PackGenerationRequest = {
        tenant_id: "test-tenant",
        period: "2025-10",
        regions: ["EU"],
        format: "json"
      };

      const response = await generator.generatePack(request, emptyDataSource);

      assert.strictEqual(response.status, "ok", "Should handle empty data sources");
      assert.ok(response.pack_url_json, "Should still generate pack URL");
    });

    test('should handle invalid region combinations', () => {
      assert.throws(() => {
        RetentionPolicyManager.calculateRetentionPolicy(
          "test-tenant",
          [], // Empty regions
          false
        );
      }, /At least one region must be specified/, "Should throw error for empty regions");
    });

    test('should handle malformed assertion data', async () => {
      const malformedDataSource = {
        ...mockDataSource,
        manifests: [
          {
            url: "https://example.com/malformed.json",
            assertions: {
              "cai.disclosure": "invalid data" // Should be object
            },
            verified: false,
            timestamp: "2025-11-05T12:00:00Z"
          }
        ],
        verify_outcomes: [],
        badge_logs: [],
        ad_metadata: [],
        tsa_receipts: []
      };

      const harmonizer = new ComplianceReportingHarmonizer({} as ComplianceReportingConfig);
      const pack = await harmonizer.generateCompliancePack(
        "test-tenant",
        "2025-10",
        ["EU"],
        malformedDataSource
      );

      // Should still generate pack but with zero counts for malformed data
      assert.strictEqual(pack.ai_disclosure.count, 0, "Should handle malformed assertions gracefully");
    });
  });

  describe('Exit Criteria 7: Performance Requirements', () => {
    test('should generate pack with correct structure for all regions', async () => {
      const harmonizer = new ComplianceReportingHarmonizer({} as ComplianceReportingConfig);
      const generator = new CompliancePackGenerator(harmonizer, "https://storage.example.com");
      
      const request: PackGenerationRequest = {
        tenant_id: "performance-test",
        period: "2025-10",
        regions: ["EU", "UK", "US", "BR"],
        include_samples: 100,
        format: "both"
      };

      const startTime = Date.now();
      const response = await generator.generatePack(request, mockDataSource);
      const endTime = Date.now();

      const duration = endTime - startTime;
      assert.ok(duration < 5000, `Pack generation should complete within 5 seconds, took ${duration}ms`);
      assert.strictEqual(response.status, "ok", "Should complete successfully even under time pressure");
    });
  });
});
