/**
 * Phase 48 - Compliance v2 Retention & Purge Policy
 * Strictest-Wins Data Retention Implementation
 */

export interface RetentionPolicy {
  tenant_id: string;
  regions: Array<"EU" | "UK" | "US" | "BR">;
  retention_days: number;
  legal_hold: boolean;
  purge_scheduled: string;
  worm_storage_enabled: boolean;
  dsr_hooks_enabled: boolean;
  last_updated: string;
}

export interface RetentionRequirement {
  region: "EU" | "UK" | "US" | "BR";
  regulation: string;
  retention_days: number;
  requires_legal_hold: boolean;
  worm_storage_recommended: boolean;
  dsr_applicable: boolean;
  description: string;
}

export class RetentionPolicyManager {
  private static readonly RETENTION_REQUIREMENTS: Record<string, RetentionRequirement> = {
    "EU": {
      region: "EU",
      regulation: "AI Act + DSA",
      retention_days: 365,
      requires_legal_hold: true,
      worm_storage_recommended: true,
      dsr_applicable: true,
      description: "AI Act requires 12-month retention for AI-generated content, DSA requires transparency data retention"
    },
    "UK": {
      region: "UK", 
      regulation: "Online Safety Act",
      retention_days: 180,
      requires_legal_hold: true,
      worm_storage_recommended: false,
      dsr_applicable: true,
      description: "OSA requires 6-month retention for transparency reporting data"
    },
    "US": {
      region: "US",
      regulation: "FTC + State Laws",
      retention_days: 365,
      requires_legal_hold: true,
      worm_storage_recommended: false,
      dsr_applicable: true,
      description: "FTC requires 1-year retention for endorsement disclosures, state laws vary"
    },
    "BR": {
      region: "BR",
      regulation: "LGPD",
      retention_days: 730,
      requires_legal_hold: true,
      worm_storage_recommended: true,
      dsr_applicable: true,
      description: "LGPD allows up to 2-year retention for personal data processing records"
    }
  };

  /**
   * Calculate strictest-wins retention policy for multiple regions
   */
  static calculateRetentionPolicy(
    tenantId: string,
    regions: Array<"EU" | "UK" | "US" | "BR">,
    existingLegalHold: boolean = false
  ): RetentionPolicy {
    
    if (regions.length === 0) {
      throw new Error("At least one region must be specified");
    }

    // Get requirements for all regions
    const requirements = regions.map(region => this.RETENTION_REQUIREMENTS[region]);
    
    // Apply strictest-wins logic
    const strictestRequirement = requirements.reduce((strictest, current) => {
      // Longest retention period wins
      if (current.retention_days > strictest.retention_days) {
        return current;
      }
      // If retention periods are equal, prefer the one with WORM requirement
      if (current.retention_days === strictest.retention_days && 
          current.worm_storage_recommended && !strictest.worm_storage_recommended) {
        return current;
      }
      return strictest;
    });

    // Calculate purge date
    const purgeDate = new Date();
    purgeDate.setDate(purgeDate.getDate() + strictestRequirement.retention_days);

    return {
      tenant_id: tenantId,
      regions: regions,
      retention_days: strictestRequirement.retention_days,
      legal_hold: existingLegalHold || strictestRequirement.requires_legal_hold,
      purge_scheduled: purgeDate.toISOString(),
      worm_storage_enabled: strictestRequirement.worm_storage_recommended,
      dsr_hooks_enabled: requirements.some(req => req.dsr_applicable),
      last_updated: new Date().toISOString()
    };
  }

  /**
   * Check if data should be purged based on retention policy
   */
  static shouldPurge(dataTimestamp: string, policy: RetentionPolicy): boolean {
    if (policy.legal_hold) {
      return false; // Legal hold prevents purging
    }

    const dataAge = Date.now() - new Date(dataTimestamp).getTime();
    const maxAge = policy.retention_days * 24 * 60 * 60 * 1000; // Convert days to milliseconds
    
    return dataAge > maxAge;
  }

  /**
   * Apply DSR redactions for LGPD/US compliance
   */
  static applyDSRRedactions(
    data: Record<string, any>,
    regions: Array<"EU" | "UK" | "US" | "BR">,
    requestType: "access" | "deletion" | "correction"
  ): Record<string, any> {
    const redacted = { ...data };

    // Apply redactions based on regions
    if (regions.includes("BR")) {
      // LGPD redactions - remove sensitive personal data
      redacted.user_identifiers = this.redactField(data.user_identifiers);
      redacted.personal_data = this.redactField(data.personal_data);
      redacted.contact_information = this.redactField(data.contact_information);
    }

    if (regions.includes("EU")) {
      // GDPR-style redactions (if applicable)
      redacted.eu_personal_data = this.redactField(data.eu_personal_data);
    }

    if (regions.includes("US")) {
      // US state law redactions for ad repositories
      redacted.ad_targeting_data = this.redactField(data.ad_targeting_data);
      redacted.user_behavior_data = this.redactField(data.user_behavior_data);
    }

    return redacted;
  }

  /**
   * Generate retention schedule for compliance reporting
   */
  static generateRetentionSchedule(policy: RetentionPolicy): Array<{
    data_type: string;
    retention_days: number;
    purge_date: string;
    legal_hold_exempt: boolean;
  }> {
    const baseDate = new Date();
    
    return [
      {
        data_type: "signed_manifests",
        retention_days: policy.retention_days,
        purge_date: new Date(baseDate.getTime() + (policy.retention_days * 24 * 60 * 60 * 1000)).toISOString(),
        legal_hold_exempt: !policy.legal_hold
      },
      {
        data_type: "tsa_receipts",
        retention_days: policy.retention_days,
        purge_date: new Date(baseDate.getTime() + (policy.retention_days * 24 * 60 * 60 * 1000)).toISOString(),
        legal_hold_exempt: !policy.legal_hold
      },
      {
        data_type: "compliance_logs",
        retention_days: policy.retention_days,
        purge_date: new Date(baseDate.getTime() + (policy.retention_days * 24 * 60 * 60 * 1000)).toISOString(),
        legal_hold_exempt: !policy.legal_hold
      },
      {
        data_type: "badge_display_logs",
        retention_days: Math.min(policy.retention_days, 365), // Badge logs have shorter retention
        purge_date: new Date(baseDate.getTime() + (Math.min(policy.retention_days, 365) * 24 * 60 * 60 * 1000)).toISOString(),
        legal_hold_exempt: !policy.legal_hold
      },
      {
        data_type: "ad_repo_exports",
        retention_days: policy.regions.includes("EU") ? 365 : policy.retention_days, // DSA requires 1-year for VLOPs
        purge_date: new Date(baseDate.getTime() + ((policy.regions.includes("EU") ? 365 : policy.retention_days) * 24 * 60 * 60 * 1000)).toISOString(),
        legal_hold_exempt: !policy.legal_hold
      }
    ];
  }

  /**
   * Validate retention policy against regional requirements
   */
  static validatePolicy(policy: RetentionPolicy): {
    valid: boolean;
    violations: Array<{
      region: string;
      requirement: string;
      description: string;
    }>;
  } {
    const violations: Array<{
      region: string;
      requirement: string;
      description: string;
    }> = [];

    for (const region of policy.regions) {
      const requirement = this.RETENTION_REQUIREMENTS[region];
      
      if (policy.retention_days < requirement.retention_days) {
        violations.push({
          region,
          requirement: `${requirement.regulation} minimum retention`,
          description: `Retention period ${policy.retention_days} days is less than required ${requirement.retention_days} days`
        });
      }

      if (requirement.requires_legal_hold && !policy.legal_hold) {
        violations.push({
          region,
          requirement: `${requirement.regulation} legal hold`,
          description: "Legal hold is required for this region"
        });
      }

      if (requirement.worm_storage_recommended && !policy.worm_storage_enabled) {
        violations.push({
          region,
          requirement: `${requirement.regulation} WORM storage`,
          description: "WORM storage is recommended for evidence preservation"
        });
      }
    }

    return {
      valid: violations.length === 0,
      violations
    };
  }

  /**
   * Generate retention matrix for documentation
   */
  static generateRetentionMatrix(): Array<{
    region: string;
    regulation: string;
    data_types: Array<{
      type: string;
      retention_days: number;
      legal_hold_required: boolean;
      worm_recommended: boolean;
    }>;
  }> {
    return Object.values(this.RETENTION_REQUIREMENTS).map(req => ({
      region: req.region,
      regulation: req.regulation,
      data_types: [
        {
          type: "manifests",
          retention_days: req.retention_days,
          legal_hold_required: req.requires_legal_hold,
          worm_recommended: req.worm_storage_recommended
        },
        {
          type: "compliance_logs",
          retention_days: req.retention_days,
          legal_hold_required: req.requires_legal_hold,
          worm_recommended: false
        },
        {
          type: "personal_data",
          retention_days: req.region === "BR" ? 730 : req.retention_days,
          legal_hold_required: req.requires_legal_hold,
          worm_recommended: req.worm_storage_recommended
        },
        {
          type: "ad_transparency",
          retention_days: req.region === "EU" ? 365 : req.retention_days,
          legal_hold_required: req.requires_legal_hold,
          worm_recommended: false
        }
      ]
    }));
  }

  /**
   * Helper method to redact sensitive fields for DSR compliance
   */
  private static redactField(value: unknown): unknown {
    if (value === null || value === undefined) {
      return value;
    }

    if (typeof value === "string") {
      return value.length > 4 ? "XXXX" + value.slice(-4) : "XXXX";
    }

    if (typeof value === "object" && !Array.isArray(value)) {
      const redacted: Record<string, unknown> = {};
      Object.keys(value as Record<string, unknown>).forEach(key => {
        redacted[key] = this.redactField((value as Record<string, unknown>)[key]);
      });
      return redacted;
    }

    if (Array.isArray(value)) {
      return value.map(item => this.redactField(item));
    }

    return "REDACTED";
  }

  /**
   * Get retention requirement for a specific region
   * @throws {Error} When region is not supported
   */
  static getRequirement(region: "EU" | "UK" | "US" | "BR"): RetentionRequirement {
    // SECURITY: Validate input to prevent injection
    if (!region || typeof region !== 'string' || !['EU', 'UK', 'US', 'BR'].includes(region)) {
      throw new Error(`Invalid region: ${region}. Supported regions: EU, UK, US, BR`);
    }
    
    const requirement = this.RETENTION_REQUIREMENTS[region];
    if (!requirement) {
      throw new Error(`No retention requirement found for region: ${region}`);
    }
    return requirement;
  }

  /**
   * Calculate storage costs based on retention policy
   */
  static calculateStorageCosts(
    policy: RetentionPolicy,
    dailyDataVolumeGB: number
  ): {
    total_storage_gb: number;
    estimated_monthly_cost_usd: number;
    cost_breakdown: Array<{
      data_type: string;
      storage_gb: number;
      monthly_cost_usd: number;
    }>;
  } {
    const totalStorageGB = dailyDataVolumeGB * policy.retention_days;
    const estimatedMonthlyCostUSD = totalStorageGB * 0.023; // Standard S3 pricing

    return {
      total_storage_gb: totalStorageGB,
      estimated_monthly_cost_usd: estimatedMonthlyCostUSD,
      cost_breakdown: [
        {
          data_type: "manifests",
          storage_gb: totalStorageGB * 0.4,
          monthly_cost_usd: estimatedMonthlyCostUSD * 0.4
        },
        {
          data_type: "compliance_logs", 
          storage_gb: totalStorageGB * 0.3,
          monthly_cost_usd: estimatedMonthlyCostUSD * 0.3
        },
        {
          data_type: "tsa_receipts",
          storage_gb: totalStorageGB * 0.2,
          monthly_cost_usd: estimatedMonthlyCostUSD * 0.2
        },
        {
          data_type: "other",
          storage_gb: totalStorageGB * 0.1,
          monthly_cost_usd: estimatedMonthlyCostUSD * 0.1
        }
      ]
    };
  }
}
