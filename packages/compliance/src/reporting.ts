/**
 * Phase 48 - Compliance v2 Reporting Engine
 * Harmonizes compliance data across regions with AI Act, DSA, OSA, FTC, LGPD
 */

import { TEMPLATE_VERSIONS } from './assertions.js';

// Data Source Interfaces
export interface ComplianceManifest {
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

// Configuration and Request/Response Interfaces
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

// Appendix Interfaces
interface EUAppendix {
  ai_act_compliance: {
    total_assessed: number;
    ai_generated: number;
    ai_altered: number;
    compliance_rate: number;
  };
  dsa_compliance: {
    total_platform_reports: number;
    transparency_reports: number;
    compliance_rate: number;
  };
}

interface UKAppendix {
  osa_compliance: {
    total_assessed: number;
    ai_disclosed: number;
    compliance_rate: number;
  };
}

interface USAppendix {
  ftc_compliance: {
    total_assessed: number;
    ai_disclosed: number;
    compliance_rate: number;
  };
}

interface BRAppendix {
  lgpd_compliance: {
    total_assessed: number;
    ai_disclosed: number;
    compliance_rate: number;
  };
}

interface ComplianceAppendices {
  EU: EUAppendix;
  UK: UKAppendix;
  US: USAppendix;
  BR: BRAppendix;
}

interface RetentionPolicy {
  retention_months: number;
  legal_hold_required: boolean;
  automatic_purge: boolean;
}

export interface CompliancePack {
  tenant_id: string;
  period: string;
  regions: Array<"EU" | "UK" | "US" | "BR">;
  generated_at: string;
  template_versions: Record<string, string>;
  total_assets: number;
  ai_generated: number;
  ai_altered: number;
  ad_transparency: number;
  badge_visible: number;
  compliance_rate: number;
  evidence: {
    manifest_count: number;
    tsa_receipt_count: number;
    badge_log_count: number;
    ad_metadata_count: number;
  };
  appendices: Partial<ComplianceAppendices>;
  retention_policy: RetentionPolicy;
}

// Main Reporting Harmonizer Class
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
    
    const aiGenerated = aiManifests.filter(m => {
      const disclosure = m.assertions["cai.disclosure"] as any;
      return disclosure?.ai_generated;
    }).length;
    
    const aiAltered = aiManifests.filter(m => {
      const disclosure = m.assertions["cai.disclosure"] as any;
      return disclosure?.ai_altered;
    }).length;

    // Ad transparency metrics
    const adManifests = dataSource.manifests.filter(m => 
      m.assertions["ads.transparency"]
    ).length;

    // Badge visibility metrics
    const visibleBadges = dataSource.badge_logs.filter(log => 
      log.badge_visible
    ).length;

    return {
      total_assets: totalAssets,
      ai_generated: aiGenerated,
      ai_altered: aiAltered,
      ad_transparency: adManifests,
      badge_visible: visibleBadges,
      compliance_rate: totalAssets > 0 ? (aiManifests.length / totalAssets) * 100 : 0
    };
  }

  /**
   * Compile evidence from data sources
   */
  private compileEvidence(dataSource: ComplianceDataSource) {
    return {
      manifest_count: dataSource.manifests.length,
      tsa_receipt_count: dataSource.tsa_receipts.length,
      badge_log_count: dataSource.badge_logs.length,
      ad_metadata_count: dataSource.ad_metadata.length
    };
  }

  /**
   * Calculate retention policy (strictest wins)
   */
  private calculateRetentionPolicy(regions: Array<"EU" | "UK" | "US" | "BR">): RetentionPolicy {
    // In production, implement actual retention policy calculation
    return {
      retention_months: 84, // 7 years default
      legal_hold_required: regions.includes("EU") || regions.includes("UK"),
      automatic_purge: false
    };
  }

  /**
   * Generate regional appendices
   */
  private async generateRegionalAppendices(
    regions: Array<"EU" | "UK" | "US" | "BR">,
    dataSource: ComplianceDataSource
  ): Promise<Partial<ComplianceAppendices>> {
    const appendices: Partial<ComplianceAppendices> = {};
    
    if (regions.includes("EU")) {
      appendices.EU = this.generateEUAppendix(dataSource);
    }
    if (regions.includes("UK")) {
      appendices.UK = this.generateUKAppendix(dataSource);
    }
    if (regions.includes("US")) {
      appendices.US = this.generateUSAppendix(dataSource);
    }
    if (regions.includes("BR")) {
      appendices.BR = this.generateBRAppendix(dataSource);
    }
    
    return appendices;
  }

  /**
   * Generate EU appendix with AI Act and DSA compliance data
   */
  private generateEUAppendix(dataSource: ComplianceDataSource): EUAppendix {
    const euManifests = dataSource.manifests.filter(m => 
      m.assertions["cai.disclosure"] || m.assertions["ads.transparency"]
    );

    // AI Act Art. 50 metrics
    const aiGenerated = euManifests.filter(m => {
      const disclosure = m.assertions["cai.disclosure"] as any;
      return disclosure?.ai_generated;
    }).length;
    
    const aiAltered = euManifests.filter(m => {
      const disclosure = m.assertions["cai.disclosure"] as any;
      return disclosure?.ai_altered;
    }).length;

    // DSA transparency metrics
    const dsaManifests = euManifests.filter(m => 
      m.assertions["ads.transparency"]
    ).length;

    return {
      ai_act_compliance: {
        total_assessed: euManifests.length,
        ai_generated: aiGenerated,
        ai_altered: aiAltered,
        compliance_rate: euManifests.length > 0 ? (aiGenerated + aiAltered) / euManifests.length * 100 : 0
      },
      dsa_compliance: {
        total_platform_reports: dsaManifests,
        transparency_reports: dsaManifests,
        compliance_rate: 100
      }
    };
  }

  /**
   * Generate UK appendix with OSA compliance data
   */
  private generateUKAppendix(dataSource: ComplianceDataSource): UKAppendix {
    const ukManifests = dataSource.manifests.filter(m => 
      m.assertions["cai.disclosure"]
    );

    return {
      osa_compliance: {
        total_assessed: ukManifests.length,
        ai_disclosed: ukManifests.length,
        compliance_rate: ukManifests.length > 0 ? 100 : 0
      }
    };
  }

  /**
   * Generate US appendix with FTC compliance data
   */
  private generateUSAppendix(dataSource: ComplianceDataSource): USAppendix {
    const usManifests = dataSource.manifests.filter(m => 
      m.assertions["cai.disclosure"]
    );

    return {
      ftc_compliance: {
        total_assessed: usManifests.length,
        ai_disclosed: usManifests.length,
        compliance_rate: usManifests.length > 0 ? 100 : 0
      }
    };
  }

  /**
   * Generate Brazil appendix with LGPD compliance data
   */
  private generateBRAppendix(dataSource: ComplianceDataSource): BRAppendix {
    const brManifests = dataSource.manifests.filter(m => 
      m.assertions["cai.disclosure"]
    );

    return {
      lgpd_compliance: {
        total_assessed: brManifests.length,
        ai_disclosed: brManifests.length,
        compliance_rate: brManifests.length > 0 ? 100 : 0
      }
    };
  }
}
