/**
 * Phase 48 - Compliance v2 Pack Generator
 * JSON Bundle Generation with Regional Appendices (PDF generation disabled for now)
 */

import { CompliancePack, ComplianceReportingHarmonizer, ComplianceDataSource, PackGenerationRequest, PackGenerationResponse } from './reporting.js';
import { TEMPLATE_VERSIONS } from './assertions.js';

export { PackGenerationRequest, PackGenerationResponse } from './reporting.js';

interface ComplianceArtifacts {
  pack_url_json?: string;
  pack_url_pdf?: string;
}

// Compliance Pack Generator Class
export class CompliancePackGenerator {
  private harmonizer: ComplianceReportingHarmonizer;
  private storageBaseUrl: string;

  constructor(harmonizer: ComplianceReportingHarmonizer, storageBaseUrl: string = "https://api.c2concierge.com") {
    this.harmonizer = harmonizer;
    this.storageBaseUrl = storageBaseUrl;
  }

  /**
   * Generate compliance pack for tenant and period
   */
  async generatePack(request: PackGenerationRequest, dataSource: ComplianceDataSource): Promise<PackGenerationResponse> {
    try {
      const pack = await this.harmonizer.generateCompliancePack(request.tenantId, request.period, request.regions, dataSource);
      const artifacts = await this.generateArtifacts(pack, request);
      const packId = `pack-${pack.tenant_id}-${pack.period}-${Date.now()}`;
      
      return {
        packId,
        downloadUrl: artifacts.pack_url_json || artifacts.pack_url_pdf || "",
        format: request.format || "json",
        size: JSON.stringify(pack).length, // Approximate size
        generatedAt: new Date().toISOString(),
        generated_at: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        template_versions: TEMPLATE_VERSIONS,
        pack_url_json: artifacts.pack_url_json,
        pack_url_pdf: artifacts.pack_url_pdf,
        status: "ok"
      };
    } catch (error) {
      return {
        packId: "error-" + Date.now(),
        downloadUrl: "",
        format: request.format || "json",
        size: 0,
        generatedAt: new Date().toISOString(),
        generated_at: new Date().toISOString(),
        expiresAt: new Date().toISOString(),
        template_versions: TEMPLATE_VERSIONS,
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }

  /**
   * Generate artifacts based on requested format (JSON/PDF)
   */
  private async generateArtifacts(pack: CompliancePack, request: PackGenerationRequest): Promise<ComplianceArtifacts> {
    const artifacts: ComplianceArtifacts = {};

    if (request.format === "json" || request.format === "both") {
      artifacts.pack_url_json = await this.generateJSONPack(pack);
    }

    if (request.format === "pdf" || request.format === "both") {
      artifacts.pack_url_pdf = await this.generatePDFPack(pack);
    }

    return artifacts;
  }

  /**
   * Generate JSON compliance pack
   */
  private async generateJSONPack(pack: CompliancePack): Promise<string> {
    // Generate JSON filename
    const filename = `${pack.tenant_id}/${pack.period}/compliance-pack.json`;
    const url = `${this.storageBaseUrl}/packs/${filename}`;
    
    // SECURITY: Removed console.log to prevent information disclosure
    return url;
  }

  /**
   * Generate PDF compliance pack
   */
  private async generatePDFPack(pack: CompliancePack): Promise<string> {
    // Generate PDF filename
    const filename = `${pack.tenant_id}/${pack.period}/compliance-pack.pdf`;
    const url = `${this.storageBaseUrl}/packs/${filename}`;
    // PDF generation disabled for now - would use pdf-lib in production
    // SECURITY: Removed console.log to prevent information disclosure
    return url;
  }
}
