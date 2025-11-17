/**
 * Phase 20: Policy Engine & Assertions Builder - Template Registry
 * Manages sector templates and provides template discovery
 */

import { Policy } from '../types/policy.js';
import {
  NEWSROOM_DEFAULT_POLICY,
  NEWSROOM_DEFAULT_YAML,
  NEWSROOM_DEFAULT_METADATA
} from './newsroom-default.js';
import {
  EU_ADS_DEFAULT_POLICY,
  EU_ADS_DEFAULT_YAML,
  EU_ADS_DEFAULT_METADATA
} from './eu-ads-default.js';
import {
  MARKETPLACE_LISTING_DEFAULT_POLICY,
  MARKETPLACE_LISTING_DEFAULT_YAML,
  MARKETPLACE_LISTING_DEFAULT_METADATA
} from './marketplace-listing-default.js';

export interface PolicyTemplate {
  id: string;
  name: string;
  description: string;
  use_case: string;
  policy: Policy;
  yaml: string;
  metadata: {
    features: string[];
    compliance: string[];
  };
  created_at: string;
  version: string;
}

export class TemplateRegistry {
  private templates: Map<string, PolicyTemplate> = new Map();

  constructor() {
    this.initializeTemplates();
  }

  /**
   * Initialize built-in sector templates
   */
  private initializeTemplates(): void {
    const templates: PolicyTemplate[] = [
      {
        id: 'newsroom-default',
        name: NEWSROOM_DEFAULT_METADATA.name,
        description: NEWSROOM_DEFAULT_METADATA.description,
        use_case: NEWSROOM_DEFAULT_METADATA.use_case,
        policy: NEWSROOM_DEFAULT_POLICY,
        yaml: NEWSROOM_DEFAULT_YAML,
        metadata: NEWSROOM_DEFAULT_METADATA,
        created_at: new Date().toISOString(),
        version: '1.0.0'
      },
      {
        id: 'eu-ads-default',
        name: EU_ADS_DEFAULT_METADATA.name,
        description: EU_ADS_DEFAULT_METADATA.description,
        use_case: EU_ADS_DEFAULT_METADATA.use_case,
        policy: EU_ADS_DEFAULT_POLICY,
        yaml: EU_ADS_DEFAULT_YAML,
        metadata: EU_ADS_DEFAULT_METADATA,
        created_at: new Date().toISOString(),
        version: '1.0.0'
      },
      {
        id: 'marketplace-listing-default',
        name: MARKETPLACE_LISTING_DEFAULT_METADATA.name,
        description: MARKETPLACE_LISTING_DEFAULT_METADATA.description,
        use_case: MARKETPLACE_LISTING_DEFAULT_METADATA.use_case,
        policy: MARKETPLACE_LISTING_DEFAULT_POLICY,
        yaml: MARKETPLACE_LISTING_DEFAULT_YAML,
        metadata: MARKETPLACE_LISTING_DEFAULT_METADATA,
        created_at: new Date().toISOString(),
        version: '1.0.0'
      }
    ];

    for (const template of templates) {
      this.templates.set(template.id, template);
    }
  }

  /**
   * Get template by ID
   */
  getTemplate(id: string): PolicyTemplate | undefined {
    return this.templates.get(id);
  }

  /**
   * Get all available templates
   */
  getAllTemplates(): PolicyTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * Get templates by asset kind
   */
  getTemplatesByAssetKind(kind: string): PolicyTemplate[] {
    return Array.from(this.templates.values()).filter(template =>
      template.policy.applies_to.kinds.includes(kind as any)
    );
  }

  /**
   * Get templates by audience region
   */
  getTemplatesByRegion(region: string): PolicyTemplate[] {
    return Array.from(this.templates.values()).filter(template =>
      template.policy.applies_to.audience_regions.includes(region as any)
    );
  }

  /**
   * Get templates by use case keywords
   */
  getTemplatesByUseCase(keywords: string[]): PolicyTemplate[] {
    return Array.from(this.templates.values()).filter(template => {
      const searchText = `${template.name} ${template.description} ${template.use_case}`.toLowerCase();
      return keywords.some(keyword => searchText.includes(keyword.toLowerCase()));
    });
  }

  /**
   * Create a new template from a policy
   */
  createTemplate(
    id: string,
    name: string,
    description: string,
    use_case: string,
    policy: Policy,
    metadata: PolicyTemplate['metadata']
  ): PolicyTemplate {
    const yaml = this.policyToYaml(policy);
    
    const template: PolicyTemplate = {
      id,
      name,
      description,
      use_case,
      policy,
      yaml,
      metadata,
      created_at: new Date().toISOString(),
      version: '1.0.0'
    };

    this.templates.set(id, template);
    return template;
  }

  /**
   * Update an existing template
   */
  updateTemplate(id: string, updates: Partial<PolicyTemplate>): PolicyTemplate | undefined {
    const existing = this.templates.get(id);
    if (!existing) {
      return undefined;
    }

    const updated: PolicyTemplate = {
      ...existing,
      ...updates,
      version: this.incrementVersion(existing.version)
    };

    if (updates.policy) {
      updated.yaml = this.policyToYaml(updates.policy);
    }

    this.templates.set(id, updated);
    return updated;
  }

  /**
   * Delete a template
   */
  deleteTemplate(id: string): boolean {
    return this.templates.delete(id);
  }

  /**
   * Validate template structure
   */
  validateTemplate(template: PolicyTemplate): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!template.id || !/^[a-z0-9-]+$/.test(template.id)) {
      errors.push('Template ID must contain only lowercase letters, numbers, and hyphens');
    }

    if (!template.name || template.name.trim().length === 0) {
      errors.push('Template name is required');
    }

    if (!template.description || template.description.trim().length === 0) {
      errors.push('Template description is required');
    }

    if (!template.policy) {
      errors.push('Template policy is required');
    }

    if (!template.metadata || !Array.isArray(template.metadata.features)) {
      errors.push('Template metadata with features array is required');
    }

    if (!template.metadata || !Array.isArray(template.metadata.compliance)) {
      errors.push('Template metadata with compliance array is required');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Get template statistics
   */
  getStatistics(): {
    total_templates: number;
    by_asset_kind: Record<string, number>;
    by_region: Record<string, number>;
    by_provider: Record<string, number>;
  } {
    const templates = Array.from(this.templates.values());
    
    const byAssetKind: Record<string, number> = {};
    const byRegion: Record<string, number> = {};
    const byProvider: Record<string, number> = {};

    for (const template of templates) {
      // Count by asset kind
      for (const kind of template.policy.applies_to.kinds) {
        byAssetKind[kind] = (byAssetKind[kind] || 0) + 1;
      }

      // Count by region
      for (const region of template.policy.applies_to.audience_regions) {
        byRegion[region] = (byRegion[region] || 0) + 1;
      }

      // Count by provider
      const provider = template.policy.license.provider;
      byProvider[provider] = (byProvider[provider] || 0) + 1;
    }

    return {
      total_templates: templates.length,
      by_asset_kind: byAssetKind,
      by_region: byRegion,
      by_provider: byProvider
    };
  }

  /**
   * Convert policy to YAML string
   */
  private policyToYaml(policy: Policy): string {
    // This is a simplified YAML conversion
    // In production, use a proper YAML library
    const yaml = this.objectToYaml(policy);
    return yaml;
  }

  /**
   * Simple object to YAML converter (for template purposes)
   * SECURITY: Sanitized YAML generation prevents injection
   */
  private objectToYaml(obj: any, indent: number = 0): string {
    // SECURITY: Limit recursion depth to prevent stack overflow
    const MAX_DEPTH = 20;
    if (indent > MAX_DEPTH) {
      return '  '.repeat(indent) + '# Max depth reached\n';
    }

    const spaces = '  '.repeat(indent);
    let yaml = '';

    if (Array.isArray(obj)) {
      // SECURITY: Limit array size to prevent DoS
      if (obj.length > 100) {
        return `${spaces}# Array too large (${obj.length} items)\n`;
      }
      
      for (const item of obj) {
        if (typeof item === 'object' && item !== null) {
          yaml += `${spaces}-\n${this.objectToYaml(item, indent + 1)}`;
        } else {
          // SECURITY: Sanitize string values to prevent injection
          const sanitized = typeof item === 'string' ? 
            item.replace(/[<>"'&\n\r\t]/g, '').substring(0, 200) : item;
          yaml += `${spaces}- ${sanitized}\n`;
        }
      }
    } else if (typeof obj === 'object' && obj !== null) {
      const keys = Object.keys(obj).sort();
      // SECURITY: Limit object size to prevent DoS
      if (keys.length > 50) {
        return `${spaces}# Object too large (${keys.length} keys)\n`;
      }
      
      for (const key of keys) {
        // SECURITY: Validate key format to prevent injection
        if (!/^[a-zA-Z0-9_-]+$/.test(key)) {
          yaml += `${spaces}# Invalid key: ${key}\n`;
          continue;
        }
        
        const value = obj[key];
        if (typeof value === 'object' && value !== null) {
          yaml += `${spaces}${key}:\n${this.objectToYaml(value, indent + 1)}`;
        } else if (typeof value === 'string') {
          // SECURITY: Sanitize string values to prevent injection
          const sanitized = value.replace(/[<>"'&\n\r\t]/g, '').substring(0, 500);
          yaml += `${spaces}${key}: ${sanitized}\n`;
        } else {
          yaml += `${spaces}${key}: ${value}\n`;
        }
      }
    }

    return yaml;
  }

  /**
   * Increment semantic version
   */
  private incrementVersion(version: string): string {
    const parts = version.split('.');
    if (parts.length === 3) {
      const patch = parseInt(parts[2]) + 1;
      return `${parts[0]}.${parts[1]}.${patch}`;
    }
    return version;
  }
}

// Export singleton instance
export const templateRegistry = new TemplateRegistry();
