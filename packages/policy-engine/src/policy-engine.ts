/**
 * Phase 20: Policy Engine & Assertions Builder - Main API
 * Human-readable DSL to C2PA assertions compiler with strict validation
 */

import { Policy, DryRunResult, PolicyDiff, PolicyRecord } from './types/policy.js';
import { PolicyCompiler } from './compiler/policy-compiler.js';
import { PolicyValidator } from './validator/policy-validator.js';
import { templateRegistry, PolicyTemplate } from './templates/template-registry.js';

// Simple YAML parser for demo purposes
const parseYaml = (content: string): Policy => {
  // SECURITY: Limit input size to prevent DoS attacks
  const MAX_INPUT_SIZE = 1024 * 1024; // 1MB
  if (content.length > MAX_INPUT_SIZE) {
    throw new Error('Input too large');
  }
  
  // SECURITY: Limit line count to prevent parsing attacks
  const MAX_LINES = 10000;
  const lines = content.split('\n');
  if (lines.length > MAX_LINES) {
    throw new Error('Too many lines');
  }
  
  const result: any = {};
  let current: any = result;
  const stack: any[] = [result];
  
  // SECURITY: Limit nesting depth to prevent stack overflow
  const MAX_DEPTH = 50;
  let currentDepth = 0;
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    
    // SECURITY: Prevent excessively long lines
    if (trimmed.length > 1000) {
      throw new Error('Line too long');
    }
    
    // Calculate indentation level to determine nesting
    const indent = line.length - line.trimStart().length;
    const indentLevel = Math.floor(indent / 2); // Assuming 2 spaces per indent
    
    // Adjust stack based on indentation
    while (indentLevel < currentDepth && stack.length > 1) {
      stack.pop();
      currentDepth--;
      current = stack[stack.length - 1];
    }
    
    if (trimmed.includes(':')) {
      const [key, ...valueParts] = trimmed.split(':');
      const value = valueParts.join(':').trim();
      
      // SECURITY: Validate key format to prevent injection
      // Allow valid policy keys which may contain underscores
      if (!/^[a-zA-Z0-9_-]+$/.test(key)) {
        throw new Error(`Invalid key format: ${key}`);
      }
      
      if (value === '') {
        if (currentDepth >= MAX_DEPTH) {
          throw new Error('Nesting too deep');
        }
        current[key] = {};
        stack.push(current[key]);
        current = current[key];
        currentDepth++;
      } else if (value.startsWith('[') && value.endsWith(']')) {
        // SECURITY: Limit array size
        const arrayItems = value.slice(1, -1).split(',').map(v => v.trim().replace(/['"]/g, ''));
        if (arrayItems.length > 100) {
          throw new Error('Array too large');
        }
        current[key] = arrayItems;
      } else if (line.trim().startsWith('-')) {
        // Handle array items in YAML format (e.g., "  - item")
        const arrayValue = trimmed.substring(1).trim();
        if (!Array.isArray(current)) {
          // Look for the parent object that should be an array
          for (let i = stack.length - 1; i >= 0; i--) {
            const parent = stack[i];
            for (const key in parent) {
              if (Array.isArray(parent[key]) || (typeof parent[key] === 'object' && Object.keys(parent[key]).length === 0)) {
                if (!Array.isArray(parent[key])) {
                  parent[key] = [];
                }
                current = parent[key];
                break;
              }
            }
            if (Array.isArray(current)) break;
          }
        }
        
        if (arrayValue) {
          current.push(arrayValue);
        } else {
          current.push({});
          stack.push(current);
          current = current[current.length - 1];
          currentDepth++;
        }
      } else if (value === 'true' || value === 'false') {
        current[key] = value === 'true';
      } else if (/^\d+$/.test(value)) {
        // SECURITY: Limit number size
        const num = parseInt(value);
        if (num > Number.MAX_SAFE_INTEGER) {
          throw new Error('Number too large');
        }
        current[key] = num;
      } else {
        // SECURITY: Limit string length
        if (value.length > 500) {
          throw new Error('String value too long');
        }
        current[key] = value;
      }
    }
  }
  
  return result as Policy;
};

const stringifyYaml = (obj: any, indent = 0): string => {
  const spaces = '  '.repeat(indent);
  let result = '';
  
  if (Array.isArray(obj)) {
    if (obj.length === 0) {
      return '[]';
    }
    for (const item of obj) {
      if (typeof item === 'object' && item !== null) {
        result += `${spaces}-\n${stringifyYaml(item, indent + 1).trim()}\n`;
      } else {
        result += `${spaces}- ${item}\n`;
      }
    }
    return result.trim();
  }
  
  if (obj !== null && typeof obj === 'object') {
    const keys = Object.keys(obj).sort();
    for (const key of keys) {
      const value = obj[key];
      if (value === null || value === undefined) {
        continue;
      }
      
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        result += `${spaces}${key}:\n${stringifyYaml(value, indent + 1)}\n`;
      } else if (Array.isArray(value)) {
        if (value.length === 0) {
          result += `${spaces}${key}: []\n`;
        } else {
          result += `${spaces}${key}:\n`;
          for (const item of value) {
            if (typeof item === 'object' && item !== null) {
              result += `${spaces}  -\n${stringifyYaml(item, indent + 2).trim()}\n`;
            } else {
              result += `${spaces}  - ${item}\n`;
            }
          }
        }
      } else if (typeof value === 'string') {
        result += `${spaces}${key}: ${value}\n`;
      } else if (typeof value === 'boolean') {
        result += `${spaces}${key}: ${value}\n`;
      } else if (typeof value === 'number') {
        result += `${spaces}${key}: ${value}\n`;
      }
    }
    return result.trim();
  }
  
  return String(obj);
};

// Simple diff implementation
const diff = {
  createPatch: (filename: string, oldStr: string, newStr: string): string => {
    const oldLines = oldStr.split('\n');
    const newLines = newStr.split('\n');
    let patch = `--- ${filename}\n+++ ${filename}\n`;
    
    // Simple diff - just show the whole files for demo
    patch += `@@ -1,${oldLines.length} +1,${newLines.length} @@\n`;
    
    for (let i = 0; i < Math.max(oldLines.length, newLines.length); i++) {
      if (i < oldLines.length && i < newLines.length) {
        if (oldLines[i] !== newLines[i]) {
          patch += `-${oldLines[i]}\n+${newLines[i]}\n`;
        } else {
          patch += ` ${oldLines[i]}\n`;
        }
      } else if (i < oldLines.length) {
        patch += `-${oldLines[i]}\n`;
      } else {
        patch += `+${newLines[i]}\n`;
      }
    }
    
    return patch;
  }
};

export class C2PAPolicyEngine {
  private compiler: PolicyCompiler;
  private validator: PolicyValidator;
  private policies: Map<string, Map<number, PolicyRecord>> = new Map();

  constructor() {
    this.compiler = new PolicyCompiler();
    this.validator = new PolicyValidator();
  }

  /**
   * Create or update a policy
   * POST /policy
   */
  async createPolicy(yamlContent: string, createdBy: string): Promise<PolicyRecord> {
    try {
      // Parse YAML
      const policy = parseYaml(yamlContent) as Policy;
      
      // Validate
      const validation = this.validator.validate(policy);
      if (!validation.isValid) {
        // SECURITY: Sanitize error messages to prevent information disclosure
        const sanitizedErrors = validation.errors.map(e => e.message).join(', ');
        throw new Error(`Policy validation failed: ${sanitizedErrors}`);
      }

      // Get or create policy versions map
      if (!this.policies.has(policy.policy_id)) {
        this.policies.set(policy.policy_id, new Map());
      }

      const versions = this.policies.get(policy.policy_id)!;
      
      // Determine version (increment if exists, else start at 1)
      let version = policy.version;
      if (versions.has(version)) {
        // Find next available version
        version = Math.max(...Array.from(versions.keys())) + 1;
      }

      // Compile assertions
      const { compiled } = this.compiler.compile(policy);

      // Create policy record
      const record: PolicyRecord = {
        policy_id: policy.policy_id,
        version,
        canonical_yaml: this.canonicalizeYaml(policy),
        compiled_assertions: compiled,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        created_by: createdBy
      };

      // Store
      versions.set(version, record);
      
      return record;
    } catch (error) {
      // SECURITY: Sanitize error messages to prevent internal information disclosure
      const sanitizedMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to create policy: ${sanitizedMessage.substring(0, 500)}`);
    }
  }

  /**
   * Fetch policy by ID and version
   * GET /policy/:id/:version
   */
  async getPolicy(policyId: string, version: number): Promise<PolicyRecord | undefined> {
    const versions = this.policies.get(policyId);
    return versions?.get(version);
  }

  /**
   * Compile policy with dry-run preview
   * POST /policy/compile?dry_run=1
   */
  async compilePolicy(yamlContent: string, dryRun: boolean = true): Promise<DryRunResult> {
    try {
      // Parse YAML
      const policy = parseYaml(yamlContent) as Policy;
      
      // Compile
      const { compiled, errors } = this.compiler.compile(policy);
      
      // Generate badge copy
      const badgeCopy = this.compiler.generateBadgeCopy(compiled);
      
      // Generate manifest preview
      const manifestPreview = this.compiler.generateManifestPreview(compiled);

      return {
        policy,
        compiled,
        badge_copy: badgeCopy,
        validation_errors: errors,
        manifest_preview: manifestPreview
      };
    } catch (error) {
      // SECURITY: Sanitize error messages to prevent internal information disclosure
      const sanitizedMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to compile policy: ${sanitizedMessage.substring(0, 200)}`);
    }
  }

  /**
   * Get diff between policy versions
   * GET /policy/:id/:version/diff?to=:toVersion
   */
  async getPolicyDiff(policyId: string, fromVersion: number, toVersion: number): Promise<PolicyDiff | undefined> {
    const fromRecord = await this.getPolicy(policyId, fromVersion);
    const toRecord = await this.getPolicy(policyId, toVersion);

    if (!fromRecord || !toRecord) {
      return undefined;
    }

    // YAML diff
    const yamlDiff = diff.createPatch(
      'policy.yaml',
      fromRecord.canonical_yaml,
      toRecord.canonical_yaml
    );

    // Assertions diff
    const assertionsDiff = this.diffAssertions(
      fromRecord.compiled_assertions,
      toRecord.compiled_assertions
    );

    return {
      policy_id: policyId,
      from_version: fromVersion,
      to_version: toVersion,
      yaml_diff: yamlDiff,
      assertions_diff: assertionsDiff
    };
  }

  /**
   * Validate policy without compilation
   */
  async validatePolicy(yamlContent: string): Promise<{ isValid: boolean; errors: any[] }> {
    try {
      const policy = parseYaml(yamlContent) as Policy;
      return this.validator.validate(policy);
    } catch (error) {
      // SECURITY: Sanitize error messages to prevent internal information disclosure
      const sanitizedMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        isValid: false,
        errors: [{
          code: 'policy.parse.failed',
          message: `Failed to parse YAML: ${sanitizedMessage.substring(0, 100)}`
        }]
      };
    }
  }

  /**
   * Get available templates
   */
  getTemplates(): PolicyTemplate[] {
    return templateRegistry.getAllTemplates();
  }

  /**
   * Get template by ID
   */
  getTemplate(templateId: string): PolicyTemplate | undefined {
    return templateRegistry.getTemplate(templateId);
  }

  /**
   * Create policy from template
   */
  async createFromTemplate(
    templateId: string,
    overrides: Partial<Policy>,
    createdBy: string
  ): Promise<PolicyRecord> {
    const template = templateRegistry.getTemplate(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    // Deep merge template with overrides
    const policy = this.deepMerge(template.policy, overrides);
    
    // Convert to YAML and create
    const yaml = this.objectToYaml(policy);
    return this.createPolicy(yaml, createdBy);
  }

  /**
   * List all policies
   */
  listPolicies(): Array<{ policy_id: string; versions: number[]; latest_version: number }> {
    const result: Array<{ policy_id: string; versions: number[]; latest_version: number }> = [];
    
    for (const [policyId, versions] of this.policies.entries()) {
      const versionNumbers = Array.from(versions.keys()).sort((a, b) => a - b);
      result.push({
        policy_id: policyId,
        versions: versionNumbers,
        latest_version: Math.max(...versionNumbers)
      });
    }
    
    return result;
  }

  /**
   * Delete policy version
   */
  async deletePolicy(policyId: string, version: number): Promise<boolean> {
    const versions = this.policies.get(policyId);
    if (!versions) {
      return false;
    }

    const deleted = versions.delete(version);
    
    // Clean up empty policy maps
    if (versions.size === 0) {
      this.policies.delete(policyId);
    }
    
    return deleted;
  }

  /**
   * Lock policy to specific version (for signing)
   */
  async lockPolicyVersion(policyId: string, version: number): Promise<{ locked: boolean; hash: string }> {
    const record = await this.getPolicy(policyId, version);
    if (!record) {
      throw new Error(`Policy not found: ${policyId}:${version}`);
    }

    const hash = record.compiled_assertions.metadata.policy_hash;
    
    // In a real implementation, this would update a database
    // For now, we return the hash for validation
    
    return { locked: true, hash };
  }

  /**
   * Validate policy hash for signing
   */
  async validatePolicyHash(policyId: string, version: number, expectedHash: string): Promise<boolean> {
    const record = await this.getPolicy(policyId, version);
    if (!record) {
      return false;
    }

    const actualHash = record.compiled_assertions.metadata.policy_hash;
    return actualHash === expectedHash;
  }

  /**
   * Private helper methods
   */

  private canonicalizeYaml(policy: Policy): string {
    // Sort keys for consistent representation
    const sorted = this.sortObjectKeys(policy);
    return stringifyYaml(sorted);
  }

  private sortObjectKeys(obj: any): any {
    if (Array.isArray(obj)) {
      return obj.map(this.sortObjectKeys.bind(this));
    }
    
    if (obj !== null && typeof obj === 'object') {
      const sorted: any = {};
      const keys = Object.keys(obj).sort();
      
      for (const key of keys) {
        sorted[key] = this.sortObjectKeys(obj[key]);
      }
      
      return sorted;
    }
    
    return obj;
  }

  private diffAssertions(from: any, to: any): any {
    const result: any = {};

    // Simple diff implementation
    const fromStr = JSON.stringify(from, null, 2);
    const toStr = JSON.stringify(to, null, 2);

    if (fromStr !== toStr) {
      // For now, return full objects
      // In production, implement proper field-level diffing
      result.modified = {
        'compiled_assertions': {
          old: from,
          new: to
        }
      };
    }

    return result;
  }

  private objectToYaml(obj: any): string {
    return stringifyYaml(obj);
  }

  private deepMerge(target: any, source: any): any {
    if (!target) return source;
    if (!source) return target;
    
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    
    return result;
  }
}

// Export main service class
export default C2PAPolicyEngine;
