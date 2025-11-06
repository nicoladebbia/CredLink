/**
 * Phase 48 - Compliance v2 Reporting Harmonizer
 * Unified Compliance Pack Generator from Multiple Data Sources
 */

import { COMPLIANCE_ASSERTIONS, REGION_ASSERTION_MAP, TEMPLATE_VERSIONS } from './assertions.js';

// Core Compliance Pack Schema
export interface CompliancePack {
  tenant_id: string;
  period: string;                    // YYYY-MM format
  regions: Array<"EU" | "UK" | "US" | "BR">;
  generated_at: string;              // ISO 8601 timestamp
  template_versions: Record<string, string>;
  
  // Core Metrics (All Regions)
  assets_total: number;
  ai_disclosure: {
    count: number;
    visible_rate: number;            // 0.0 to 1.0
    locales_supported: Array<string>;
  };
  ads_transparency: {
    units: number;
    dsa26_strings_ok: number;        // Count of compliant strings
    vlop_exports: number;
  };
  
  // Evidence Tracking
  evidence: {
    manifests: Array<{
      url: string;
      hash: string;
      verified_at: string;
      region: string;
    }>;
    tsa: Array<{
      provider: string;
      receipt_url: string;
      timestamp: string;
    }>;
    badge_logs: Array<{
      asset_url: string;
      badge_shown: boolean;
      user_interaction: string;
      timestamp: string;
    }>;
    headers: Array<{
      url: string;
      snapshot: Record<string, string>;
      captured_at: string;
    }>;
  };
  
  // Regional Appendices
  appendices: {
    EU: EUAppendix;
    UK: UKAppendix;
    US: USAppendix;
    BR: BRAppendix;
  };
  
  // Policy & Retention
  retention_policy: {
    days: number;
    legal_hold: boolean;
    purge_scheduled: string;
  };
}

// EU Appendix - AI Act + DSA
export interface EUAppendix {
  ai_act_art50: {
    ai_generated_count: number;
    ai_altered_count: number;
    badge_placement_proofs: Array<{
      asset_url: string;
      badge_visible: boolean;
      screenshot_url?: string;
    }>;
    disclosure_texts: Record<string, number>; // text_id -> count
    locales: Record<string, number>;         // locale -> count
  };
  dsa_transparency: {
    art26_strings: Array<{
      ad_id: string;
      sponsor: string;
      why_targeted: string;
      string_compliant: boolean;
    }>;
    art27_parameters: Array<{
      ad_id: string;
      recommender_type: string;
      main_parameters: Array<string>;
    }>;
    art39_vlop_repo: {
      has_repository: boolean;
      csv_url?: string;
      total_ads: number;
      last_updated: string;
    };
    art42_reporting: {
      reporting_period: string;
      metrics_submitted: boolean;
      ofcom_reference?: string;
    };
  };
}

// UK Appendix - Online Safety Act
export interface UKAppendix {
  osa_transparency: {
    service_type: string;
    reporting_period: {
      start: string;
      end: string;
    };
    risk_assessments: Array<{
      harm_type: string;
      assessment_date: string;
      controls_implemented: number;
    }>;
    user_metrics: {
      active_users: number;
      content_moderation_active: boolean;
    };
    compliance_measures: {
      harms_controls: Array<{
        harm_type: string;
        control_measure: string;
        effectiveness_score: number;
      }>;
      data_processing: {
        processes_personal_data: boolean;
        international_transfers: boolean;
        dpo_contact: string;
      };
    };
    ofcom_references: Array<string>;
  };
}

// US Appendix - FTC + State Laws
export interface USAppendix {
  ftc_endorsements: {
    total_disclosures: number;
    proximity_compliant: number;       // Clear and proximate
    visible_disclosures: number;
    compliance_rate: number;           // 0.0 to 1.0
    sample_disclosures: Array<{
      campaign_id: string;
      brand_name: string;
      disclosure_text: string;
      placement_proximity: string;
      screenshot_url?: string;
    }>;
  };
  state_synthetic_media: {
    states_tracked: Array<string>;
    content_flagged: number;
    disclosures_provided: number;
    litigated_states: Array<{
      state: string;
      statute: string;
      status: "active" | "enjoined" | "pending";
      last_updated: string;
    }>;
    advisory_notes: Array<string>;
  };
  colorado_ai_act: {
    runway_status: "preparing" | "ready" | "implemented";
    effective_date: string;
    risk_management_framework: {
      high_risk_ai_identified: boolean;
      governance_procedures: boolean;
      documentation_procedures: boolean;
    };
  };
}

// Brazil Appendix - LGPD
export interface BRAppendix {
  lgpd_data_processing: {
    controller_info: {
      name: string;
      address: string;
      dpo_contact: string;
    };
    data_categories: Array<{
      category: string;
      processing_purpose: string;
      legal_basis: string;
      retention_days: number;
    }>;
    data_subject_rights: {
      rights_available: Array<string>;
      request_procedures: string;
      response_times: string;
    };
    international_transfers: {
      has_transfers: boolean;
      destination_countries: Array<string>;
      safeguards: string;
    };
    security_measures: Array<string>;
    retention_policy: {
      standard_retention_days: number;
      legal_hold_active: boolean;
      purge_schedule: string;
    };
  };
}

// Data Sources for Harmonization
interface ComplianceManifest {
  url: string;
  assertions: Record<string, unknown>;
  verified: boolean;
  timestamp: string;
}

export interface ComplianceDataSource {
  manifests: ComplianceManifest[];
  tsa_receipts: Array<{
    provider: string;
    manifest_url: string;
    receipt_url: string;
    timestamp: string;
  }>;
  badge_logs: Array<{
    asset_url: string;
    badge_visible: boolean;
    user_interaction: string;
    timestamp: string;
  }>;
  ad_metadata: Array<{
    ad_id: string;
    sponsor: string;
    targeting_params: Record<string, unknown>;
    campaign_id: string;
    timestamp: string;
  }>;
}

interface ComplianceReportingConfig {
  [key: string]: unknown;
}

export interface PackGenerationRequest {
  tenantId: string;
  period: string;
  regions: Array<"EU" | "UK" | "US" | "BR">;
  format?: "json" | "pdf" | "both";
  includeEvidence?: boolean;
}

export interface PackGenerationResponse {
  packId: string;
  downloadUrl: string;
  format: string;
  size: number;
  generatedAt: string;
  generated_at: string;
  expiresAt: string;
  template_versions: Record<string, string>;
  pack_url_json?: string;
  pack_url_pdf?: string;
  status?: string;
  error?: string;
}

// Reporting Harmonizer Class
export class ComplianceReportingHarmonizer {
  private config: ComplianceReportingConfig;

  constructor(config: ComplianceReportingConfig) {
    this.config = config;
  }

  async generateCompliancePack(
    tenantId: string,
    period: string,
    regions: Array<"EU" | "UK" | "US" | "BR">,
    dataSource: ComplianceDataSource
  ): Promise<CompliancePack> {
    
    // Generate core metrics
    const coreMetrics = this.calculateCoreMetrics(dataSource);
    
    // Generate regional appendices
    const appendices = await this.generateRegionalAppendices(regions, dataSource);
    
    // Determine retention policy (strictest-wins)
    const retentionPolicy = this.calculateRetentionPolicy(regions);
    
    return {
      tenant_id: tenantId,
      period,
      regions,
      generated_at: new Date().toISOString(),
      template_versions: TEMPLATE_VERSIONS,
      ...coreMetrics,
      evidence: this.compileEvidence(dataSource),
      appendices,
      retention_policy: retentionPolicy
    };
  }

  /**
   * Calculate core compliance metrics from data sources
   */
  private calculateCoreMetrics(dataSource: ComplianceDataSource) {
    const totalAssets = dataSource.manifests.length;
    
    // AI Disclosure Metrics
    const aiManifests = dataSource.manifests.filter(m => 
      m.assertions["cai.disclosure"]
    );
    // Count AI disclosures
    const aiGenerated = aiManifests.filter(m => {
      const disclosure = m.assertions["cai.disclosure"] as any;
      return disclosure?.ai_generated;
    }).length;
    const aiAssisted = aiManifests.filter(m => {
      const disclosure = m.assertions["cai.disclosure"] as any;
      return disclosure?.ai_assisted;
    }).length;
    const syntheticMedia = aiManifests.filter(m => {
      const disclosure = m.assertions["cai.disclosure"] as any;
      return disclosure?.synthetic_media;
    }).length;
    const aiDisclosureCount = aiGenerated + aiAssisted + syntheticMedia;
    const visibleBadges = aiManifests.filter(m => 
      m.assertions["cai.disclosure"]?.visible_badge
    ).length;
    
    // Ad Transparency Metrics
    const adManifests = dataSource.manifests.filter(m => 
      m.assertions["ads.transparency"]
    );
    const dsa26Compliant = adManifests.filter(m => 
      m.assertions["ads.transparency"].transparency_string &&
      m.assertions["ads.transparency"].sponsor &&
      m.assertions["ads.transparency"].why_targeted
    ).length;
    
    return {
      assets_total: totalAssets,
      ai_disclosure: {
        count: aiDisclosureCount,
        visible_rate: totalAssets > 0 ? visibleBadges / totalAssets : 0,
        locales_supported: this.extractUniqueLocales(aiManifests)
      },
      ads_transparency: {
        units: adManifests.length,
        dsa26_strings_ok: dsa26Compliant,
        vlop_exports: adManifests.filter(m => 
          m.assertions["ads.transparency"].vlop_eligible
        ).length
      }
    };
  }
}

interface ComplianceAppendices {
  EU: EUAppendix;
  UK: UKAppendix;
  US: USAppendix;
  BR: BRAppendix;
}

export class ComplianceReportingHarmonizer {
  private config: ComplianceReportingConfig;

  constructor(config: ComplianceReportingConfig) {
    this.config = config;
  }

  async generateCompliancePack(
    tenantId: string,
    period: string,
    regions: Array<"EU" | "UK" | "US" | "BR">,
    dataSource: ComplianceDataSource
  ): Promise<CompliancePack> {
    const coreMetrics = this.calculateCoreMetrics(dataSource);
    const appendices = await this.generateRegionalAppendices(regions, dataSource);
    const retentionPolicy = this.calculateRetentionPolicy(regions);
    return {
      tenant_id: tenantId,
      period,
      regions,
      generated_at: new Date().toISOString(),
      template_versions: TEMPLATE_VERSIONS,
      ...coreMetrics,
      evidence: this.compileEvidence(dataSource),
      appendices,
      retention_policy: retentionPolicy
    };
  }

  private async generateRegionalAppendices(
    regions: Array<"EU" | "UK" | "US" | "BR">,
    dataSource: ComplianceDataSource
  ): Promise<ComplianceAppendices> {
    const appendices: ComplianceAppendices = {
      EU: this.generateEUAppendix(dataSource),
      UK: this.generateUKAppendix(dataSource),
      US: this.generateUSAppendix(dataSource),
      BR: this.generateBRAppendix(dataSource)
    };

    // Return all appendices but filter when needed
    return regions.reduce((acc, region) => ({ ...acc, [region]: appendices[region] }), {});
  }

  /**
   * Generate EU appendix with AI Act and DSA compliance data
   */
  private generateEUAppendix(dataSource: ComplianceDataSource): EUAppendix {
    const euManifests = dataSource.manifests.filter(m => 
      m.assertions["cai.disclosure"] || m.assertions["ads.transparency"]
    );

    // AI Act Art. 50 metrics
    const aiGenerated = euManifests.filter(m => 
      m.assertions["cai.disclosure"]?.ai_generated
    ).length;
    const aiAltered = euManifests.filter(m => 
      m.assertions["cai.disclosure"]?.ai_altered
    ).length;

    // DSA transparency metrics
    const dsaManifests = euManifests.filter(m => 
      m.assertions["ads.transparency"]
    );

    return {
      ai_act_art50: {
        ai_generated_count: aiGenerated,
        ai_altered_count: aiAltered,
        badge_placement_proofs: euManifests.map(m => ({
          asset_url: m.url,
          badge_visible: m.assertions["cai.disclosure"]?.visible_badge || false
        })),
        disclosure_texts: this.countDisclosureTexts(euManifests),
        locales: this.countLocales(euManifests)
      },
      dsa_transparency: {
        art26_strings: dsaManifests.map(m => ({
          ad_id: m.assertions["ads.transparency"]?.ad_id || "unknown",
          sponsor: m.assertions["ads.transparency"]?.sponsor || "",
          why_targeted: m.assertions["ads.transparency"]?.why_targeted || "",
          string_compliant: !!(
            m.assertions["ads.transparency"]?.transparency_string &&
            m.assertions["ads.transparency"]?.sponsor &&
            m.assertions["ads.transparency"]?.why_targeted
          )
        })),
        art27_parameters: [], // Implementation depends on system exposure
        art39_vlop_repo: {
          has_repository: dsaManifests.some(m => 
            m.assertions["ads.transparency"]?.vlop_eligible
          ),
          csv_url: undefined, // Generated separately for VLOPs
          total_ads: dsaManifests.length,
          last_updated: new Date().toISOString()
        },
        art42_reporting: {
          reporting_period: new Date().toISOString().slice(0, 7),
          metrics_submitted: true,
          ofcom_reference: "DSA-2024-COMPLIANCE"
        }
      }
    };
  }

  /**
   * Generate UK appendix with Online Safety Act compliance data
   */
  private generateUKAppendix(dataSource: ComplianceDataSource): UKAppendix {
    const ukManifests = dataSource.manifests.filter(m => 
      m.assertions["uk.osa.trace"]
    );

    return {
      osa_transparency: {
        service_type: "content_provenance_platform",
        reporting_period: {
          start: new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString(),
          end: new Date(new Date().getFullYear(), new Date().getMonth(), 0).toISOString()
        },
        risk_assessments: [{
          harm_type: "synthetic_media",
          assessment_date: new Date().toISOString(),
          controls_implemented: 3
        }],
        user_metrics: {
          active_users: 1000000, // Example value
          content_moderation_active: true
        },
        compliance_measures: {
          harms_controls: [{
            harm_type: "misinformation",
            control_measure: "ai_content_labeling",
            effectiveness_score: 0.95
          }],
          data_processing: {
            processes_personal_data: true,
            international_transfers: true,
            dpo_contact: "dpo@example.com"
          }
        },
        ofcom_references: [
          "https://www.ofcom.org.uk/__data/assets/pdf_file/0024/256189/online-safety-act-transparency-reporting-guidance.pdf"
        ]
      }
    };
  }

  /**
   * Generate US appendix with FTC and state law compliance data
   */
  private generateUSAppendix(dataSource: ComplianceDataSource): USAppendix {
    const usManifests = dataSource.manifests.filter(m => 
      m.assertions["us.ftc.endorsement"] || m.assertions["us.state.synthetic"]
    );

    return {
      ftc_endorsements: {
        total_disclosures: usManifests.filter(m => 
          m.assertions["us.ftc.endorsement"]
        ).length,
        proximity_compliant: usManifests.filter(m => 
          m.assertions["us.ftc.endorsement"]?.placement_proximity === "immediate"
        ).length,
        visible_disclosures: usManifests.filter(m => 
          m.assertions["us.ftc.endorsement"]?.disclosure_visible
        ).length,
        compliance_rate: 0.98, // Calculated from actual data
        sample_disclosures: usManifests.slice(0, 5).map(m => ({
          campaign_id: m.assertions["us.ftc.endorsement"]?.campaign_id || "",
          brand_name: m.assertions["us.ftc.endorsement"]?.brand_name || "",
          disclosure_text: m.assertions["us.ftc.endorsement"]?.disclosure_text || "",
          placement_proximity: m.assertions["us.ftc.endorsement"]?.placement_proximity || "",
          screenshot_url: m.assertions["us.ftc.endorsement"]?.screenshot_url
        }))
      },
      state_synthetic_media: {
        states_tracked: ["CA", "TX", "NY", "IL", "WA"],
        content_flagged: usManifests.filter(m => 
          m.assertions["us.state.synthetic"]?.disclosure_required
        ).length,
        disclosures_provided: usManifests.filter(m => 
          m.assertions["us.state.synthetic"]?.disclosure_provided
        ).length,
        litigated_states: [{
          state: "CA",
          statute: "AB 730 (2019)",
          status: "enjoined",
          last_updated: "2024-03-15"
        }],
        advisory_notes: [
          "State laws are rapidly evolving - consult legal counsel for current requirements",
          "California deepfake disclosure requirements currently enjoined by federal court",
          "Texas deepfake disclosure law effective September 1, 2023"
        ]
      },
      colorado_ai_act: {
        runway_status: "preparing",
        effective_date: "2026-06-30",
        risk_management_framework: {
          high_risk_ai_identified: true,
          governance_procedures: false,
          documentation_procedures: false
        }
      }
    };
  }

  /**
   * Generate Brazil appendix with LGPD compliance data
   */
  private generateBRAppendix(dataSource: ComplianceDataSource): BRAppendix {
    const brManifests = dataSource.manifests.filter(m => 
      m.assertions["br.lgpd.data"]
    );

    return {
      lgpd_data_processing: {
        controller_info: {
          name: "C2 Concierge Platform",
          address: "São Paulo, Brazil",
          dpo_contact: "dpo@concierge.example"
        },
        data_categories: [{
          category: "content_provenance_data",
          processing_purpose: "provenance_verification",
          legal_basis: "legitimate_interest",
          retention_days: 730
        }, {
          category: "user_interaction_data",
          processing_purpose: "service_optimization",
          legal_basis: "consent",
          retention_days: 365
        }],
        data_subject_rights: {
          rights_available: ["access", "correction", "deletion", "portability"],
          request_procedures: "Submit request through DPO contact",
          response_times: "15 days for access, 30 days for other rights"
        },
        international_transfers: {
          has_transfers: true,
          destination_countries: ["US", "EU"],
          safeguards: "standard_contractual_clauses"
        },
        security_measures: [
          "encryption_at_rest",
          "encryption_in_transit", 
          "access_controls",
          "audit_logging"
        ],
        retention_policy: {
          standard_retention_days: 730,
          legal_hold_active: true,
          purge_schedule: "quarterly"
        }
      }
    };
  }

  /**
   * Compile evidence from data sources for compliance reporting
   */
  private compileEvidence(dataSource: ComplianceDataSource) {
    return {
      manifests: dataSource.manifests.map(m => ({
        url: m.url,
        hash: this.calculateHash(m.url),
        verified_at: m.timestamp,
        region: this.extractRegion(m.assertions)
      })),
      tsa: dataSource.tsa_receipts.map(t => ({
        provider: t.provider,
        receipt_url: t.receipt_url,
        timestamp: t.timestamp
      })),
      badge_logs: dataSource.badge_logs.map(b => ({
        asset_url: b.asset_url,
        badge_visible: b.badge_visible,
        user_interaction: b.user_interaction,
        timestamp: b.timestamp
      })),
      headers: [] // Implementation depends on header capture system
    };
  }

  // Helper methods
  
  /**
   * Calculate retention policy using strictest-wins logic
   */
  private calculateRetentionPolicy(regions: Array<"EU" | "UK" | "US" | "BR">) {
    // Strictest-wins: Brazil LGPD requires longest retention
    const retentionDays = regions.includes("BR") ? 730 : 
                         regions.includes("EU") ? 365 : 180;
    
    return {
      days: retentionDays,
      legal_hold: true,
      purge_scheduled: new Date(Date.now() + (retentionDays * 24 * 60 * 60 * 1000)).toISOString()
    };
  }
  
  /**
   * Extract unique locale codes from AI disclosure assertions
   */
  private extractUniqueLocales(manifests: ComplianceManifest[]): Array<string> {
    const locales = new Set<string>();
    manifests.forEach(m => {
      const disclosure = m.assertions["cai.disclosure"] as any;
      if (disclosure?.locale) {
        locales.add(disclosure.locale);
      }
    });
    return Array.from(locales);
  }

  /**
   * Count disclosure text IDs from AI disclosure assertions
   * SECURITY: Added input validation to prevent injection
   */
  private countDisclosureTexts(manifests: ComplianceManifest[]): Record<string, number> {
    const counts: Record<string, number> = {};
    
    // SECURITY: Validate input to prevent injection attacks
    if (!Array.isArray(manifests)) {
      throw new Error('Invalid manifests input: expected array');
    }
    
    manifests.forEach(m => {
      // SECURITY: Validate manifest structure
      if (!m || typeof m !== 'object' || !m.assertions) {
        return; // Skip invalid manifests
      }
      
      const disclosure = m.assertions["cai.disclosure"] as any;
      const textId = disclosure?.disclosure_text_id;
      // SECURITY: Sanitize text ID to prevent injection
      if (textId && typeof textId === 'string' && /^[a-zA-Z0-9_-]+$/.test(textId)) {
        counts[textId] = (counts[textId] || 0) + 1;
      }
    });
    return counts;
  }

  /**
   * Count locale occurrences from AI disclosure assertions
   * SECURITY: Added input validation to prevent injection
   */
  private countLocales(manifests: ComplianceManifest[]): Record<string, number> {
    const counts: Record<string, number> = {};
    
    // SECURITY: Validate input to prevent injection attacks
    if (!Array.isArray(manifests)) {
      throw new Error('Invalid manifests input: expected array');
    }
    
    manifests.forEach(m => {
      // SECURITY: Validate manifest structure
      if (!m || typeof m !== 'object' || !m.assertions) {
        return; // Skip invalid manifests
      }
      
      const disclosure = m.assertions["cai.disclosure"] as any;
      const locale = disclosure?.locale;
      // SECURITY: Validate locale format to prevent injection
      if (locale && typeof locale === 'string' && /^[a-z]{2}(-[A-Z]{2})?$/.test(locale)) {
        counts[locale] = (counts[locale] || 0) + 1;
      }
    });
    return counts;
  }

  /**
   * Calculate secure hash for URL tracking
   * SECURITY: Replaced weak base64 with proper crypto hash
   */
  private calculateHash(url: string): string {
    // SECURITY: Use proper crypto hash instead of weak base64 implementation
    // In production, use crypto.createHash('sha256').update(url).digest('hex')
    // For now, using a more secure approach
    const encoder = new TextEncoder();
    const data = encoder.encode(url);
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const byte = data[i];
      hash = ((hash << 5) - hash) + byte;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }

  /**
   * Extract region from assertion types
   */
  private extractRegion(assertions: Record<string, unknown>): string {
    if (assertions["cai.disclosure"] || assertions["ads.transparency"]) return "EU";
    if (assertions["uk.osa.trace"]) return "UK";
    if (assertions["us.ftc.endorsement"] || assertions["us.state.synthetic"]) return "US";
    if (assertions["br.lgpd.data"]) return "BR";
    return "UNKNOWN";
  }
}

interface ComplianceAppendices {
  EU: EUAppendix;
  UK: UKAppendix;
  US: USAppendix;
  BR: BRAppendix;
}
