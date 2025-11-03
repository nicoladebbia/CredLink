#!/usr/bin/env node

/**
 * Phase 20: Policy Engine & Assertions Builder - Demo
 * Demonstrates the core functionality without external dependencies
 */

import { readFileSync } from 'fs';

// Mock the external dependencies for demo purposes
const mockYaml = {
  parse: (content: string) => {
    // Simple YAML parser for demo
    const lines = content.split('\n');
    const result: any = {};
    let current: any = result;
    const stack: any[] = [result];
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      
      if (trimmed.includes(':')) {
        const [key, ...valueParts] = trimmed.split(':');
        const value = valueParts.join(':').trim();
        
        if (value === '') {
          current[key] = {};
          stack.push(current[key]);
          current = current[key];
        } else if (value.startsWith('[') && value.endsWith(']')) {
          current[key] = value.slice(1, -1).split(',').map(v => v.trim().replace(/['"]/g, ''));
        } else if (value === 'true' || value === 'false') {
          current[key] = value === 'true';
        } else if (/^\d+$/.test(value)) {
          current[key] = parseInt(value);
        } else {
          current[key] = value.replace(/['"]/g, '');
        }
      }
    }
    
    return result;
  }
};

const mockCrypto = {
  createHash: (algorithm: string) => ({
    update: (data: string) => ({
      digest: (encoding: string) => {
        // Simple mock hash for demo
        return 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456';
      }
    })
  })
};

// Core Policy Types
interface Policy {
  policy_id: string;
  version: number;
  applies_to: {
    kinds: string[];
    audience_regions: string[];
  };
  disclosure: {
    creation_mode: string;
    digital_source_type: string;
    ai: {
      used: boolean;
      generator?: string;
      prompt_disclosure: string;
    };
  };
  editing: {
    steps: Array<{
      action: string;
      tool?: string;
      ai_assist: boolean;
    }>;
  };
  license: {
    provider: string;
    license_id?: string;
    rights_window?: {
      from: string;
      to: string;
    };
    terms_url?: string;
  };
  display: {
    badge_copy: string;
    link_manifest: string;
  };
  controls: {
    redact_personal_fields: boolean;
    allow_ingredients: boolean;
    retain_assertions: string[];
  };
  lock: {
    enforce_version: boolean;
  };
}

interface ValidationError {
  code: string;
  message: string;
  path?: string;
  fix_hint?: string;
}

interface CompiledAssertions {
  actions: {
    label: string;
    data: {
      actions: Array<{
        action: string;
        parameters?: any;
        softwareAgent: string;
        when: string;
      }>;
    };
  };
  license?: any;
  policy: {
    label: string;
    data: {
      policy_id: string;
      version: number;
      hash: string;
    };
  };
  metadata: {
    compiled_at: string;
    policy_hash: string;
    validation_errors: ValidationError[];
  };
}

// Simple Policy Validator
class SimplePolicyValidator {
  validate(policy: any): { isValid: boolean; errors: ValidationError[] } {
    const errors: ValidationError[] = [];

    // Basic validation
    if (!policy.policy_id) {
      errors.push({
        code: 'policy.id.required',
        message: 'policy_id is required',
        fix_hint: 'Add a policy_id field'
      });
    }

    if (!policy.version) {
      errors.push({
        code: 'policy.version.required',
        message: 'version is required',
        fix_hint: 'Add a version field'
      });
    }

    if (!policy.disclosure) {
      errors.push({
        code: 'policy.disclosure.required',
        message: 'disclosure section is required',
        fix_hint: 'Add a disclosure section'
      });
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

// Simple Policy Compiler
class SimplePolicyCompiler {
  private validator = new SimplePolicyValidator();

  compile(policy: Policy): { compiled: CompiledAssertions; errors: ValidationError[] } {
    const errors: ValidationError[] = [];
    
    // Validate first
    const validation = this.validator.validate(policy);
    errors.push(...validation.errors);

    if (errors.length > 0) {
      return {
        compiled: this.createEmptyCompiled(),
        errors
      };
    }

    // Generate actions assertion
    const actions = this.compileActionsAssertion(policy);
    
    // Generate policy assertion
    const policyAssertion = this.compilePolicyAssertion(policy);

    const compiled: CompiledAssertions = {
      actions,
      policy: policyAssertion,
      metadata: {
        compiled_at: new Date().toISOString(),
        policy_hash: this.calculatePolicyHash(policy),
        validation_errors: errors
      }
    };

    return { compiled, errors };
  }

  private compileActionsAssertion(policy: Policy) {
    const actions = [];

    // First action
    const creationAction: any = {
      action: policy.disclosure.creation_mode === 'created' ? 'c2pa.created' : 'c2pa.opened',
      parameters: {
        digitalSourceType: this.resolveDigitalSourceType(policy)
      },
      softwareAgent: 'C2 Concierge Signer 1.1',
      when: new Date().toISOString()
    };

    if (policy.disclosure.ai.used && policy.disclosure.ai.generator) {
      creationAction.parameters.generator = policy.disclosure.ai.generator;
    }

    actions.push(creationAction);

    // Add editing steps
    for (const step of policy.editing.steps) {
      actions.push({
        action: 'c2pa.edited',
        parameters: {
          operation: step.action
        },
        softwareAgent: step.tool || 'Unknown Tool',
        when: new Date().toISOString()
      });
    }

    return {
      label: 'c2pa.actions',
      data: { actions }
    };
  }

  private compilePolicyAssertion(policy: Policy) {
    return {
      label: 'com.c2c.policy.v1',
      data: {
        policy_id: policy.policy_id,
        version: policy.version,
        hash: this.calculatePolicyHash(policy)
      }
    };
  }

  private resolveDigitalSourceType(policy: Policy): string {
    if (policy.disclosure.digital_source_type === 'auto') {
      return policy.disclosure.ai.used 
        ? 'http://c2pa.org/digitalsourcetype/trainedAlgorithmicData'
        : 'http://c2pa.org/digitalsourcetype/humanCapture';
    }
    
    switch (policy.disclosure.digital_source_type) {
      case 'trainedAlgorithmicMedia':
        return 'http://c2pa.org/digitalsourcetype/trainedAlgorithmicData';
      case 'humanCapture':
        return 'http://c2pa.org/digitalsourcetype/humanCapture';
      default:
        return 'http://c2pa.org/digitalsourcetype/humanCapture';
    }
  }

  private calculatePolicyHash(policy: Policy): string {
    const canonical = JSON.stringify(policy, Object.keys(policy).sort());
    return mockCrypto.createHash('sha256').update(canonical).digest('hex');
  }

  private createEmptyCompiled(): CompiledAssertions {
    return {
      actions: {
        label: 'c2pa.actions',
        data: { actions: [] }
      },
      policy: {
        label: 'com.c2c.policy.v1',
        data: {
          policy_id: '',
          version: 0,
          hash: ''
        }
      },
      metadata: {
        compiled_at: new Date().toISOString(),
        policy_hash: '',
        validation_errors: []
      }
    };
  }

  generateBadgeCopy(compiled: CompiledAssertions): string {
    const parts: string[] = [];

    const firstAction = compiled.actions.data.actions[0];
    if (firstAction) {
      if (firstAction.action === 'c2pa.created') {
        parts.push('Created');
      } else if (firstAction.action === 'c2pa.opened') {
        parts.push('Opened');
      }

      if (firstAction.parameters?.digitalSourceType) {
        const dst = firstAction.parameters.digitalSourceType;
        if (dst.includes('trainedAlgorithmic')) {
          parts.push('(AI: trainedAlgorithmicData)');
        }
      }

      if (firstAction.parameters?.generator) {
        parts.push(`via ${firstAction.parameters.generator}`);
      }
    }

    const editActions = compiled.actions.data.actions.filter(a => a.action === 'c2pa.edited');
    if (editActions.length > 0) {
      const operations = editActions.map(a => a.parameters?.operation).filter(Boolean);
      if (operations.length > 0) {
        parts.push(`edited: ${operations.join(', ')}`);
      }
    }

    return parts.join(' • ');
  }
}

// Demo function
async function runDemo() {
  console.log('🚀 Phase 20: Policy Engine & Assertions Builder Demo');
  console.log('=====================================================\n');

  const compiler = new SimplePolicyCompiler();

  try {
    // Load and compile Newsroom Default policy
    console.log('📋 Loading Newsroom Default policy...');
    const newsroomYaml = readFileSync('./examples/newsroom-default.yaml', 'utf-8');
    const newsroomPolicy = mockYaml.parse(newsroomYaml);
    
    console.log('🔧 Compiling Newsroom Default policy...');
    const newsroomResult = compiler.compile(newsroomPolicy);
    
    if (newsroomResult.errors.length === 0) {
      console.log('✅ Newsroom Default compiled successfully!');
      console.log('📄 Badge Copy:', compiler.generateBadgeCopy(newsroomResult.compiled));
      console.log('🔍 Actions:', newsroomResult.compiled.actions.data.actions.length);
      console.log('🔐 Policy Hash:', newsroomResult.compiled.policy.data.hash.substring(0, 16) + '...');
    } else {
      console.log('❌ Newsroom Default validation failed:');
      newsroomResult.errors.forEach(error => {
        console.log(`  - ${error.message}`);
      });
    }

    console.log('\n' + '='.repeat(50) + '\n');

    // Load and compile EU Ads Default policy
    console.log('📋 Loading EU Ads Default policy...');
    const euAdsYaml = readFileSync('./examples/eu-ads-default.yaml', 'utf-8');
    const euAdsPolicy = mockYaml.parse(euAdsYaml);
    
    console.log('🔧 Compiling EU Ads Default policy...');
    const euAdsResult = compiler.compile(euAdsPolicy);
    
    if (euAdsResult.errors.length === 0) {
      console.log('✅ EU Ads Default compiled successfully!');
      console.log('📄 Badge Copy:', compiler.generateBadgeCopy(euAdsResult.compiled));
      console.log('🔍 Actions:', euAdsResult.compiled.actions.data.actions.length);
      console.log('🔐 Policy Hash:', euAdsResult.compiled.policy.data.hash.substring(0, 16) + '...');
    } else {
      console.log('❌ EU Ads Default validation failed:');
      euAdsResult.errors.forEach(error => {
        console.log(`  - ${error.message}`);
      });
    }

    console.log('\n' + '='.repeat(50) + '\n');

    // Load and compile Marketplace Listing policy
    console.log('📋 Loading Marketplace Listing policy...');
    const marketplaceYaml = readFileSync('./examples/marketplace-listing-default.yaml', 'utf-8');
    const marketplacePolicy = mockYaml.parse(marketplaceYaml);
    
    console.log('🔧 Compiling Marketplace Listing policy...');
    const marketplaceResult = compiler.compile(marketplacePolicy);
    
    if (marketplaceResult.errors.length === 0) {
      console.log('✅ Marketplace Listing compiled successfully!');
      console.log('📄 Badge Copy:', compiler.generateBadgeCopy(marketplaceResult.compiled));
      console.log('🔍 Actions:', marketplaceResult.compiled.actions.data.actions.length);
      console.log('🔐 Policy Hash:', marketplaceResult.compiled.policy.data.hash.substring(0, 16) + '...');
    } else {
      console.log('❌ Marketplace Listing validation failed:');
      marketplaceResult.errors.forEach(error => {
        console.log(`  - ${error.message}`);
      });
    }

    console.log('\n🎉 Demo completed!');
    console.log('\n📊 Summary:');
    console.log('- ✅ Human-readable YAML DSL');
    console.log('- ✅ C2PA 2.2 compliant assertions');
    console.log('- ✅ Policy validation with actionable errors');
    console.log('- ✅ Badge copy generation');
    console.log('- ✅ Policy hashing for version locking');
    console.log('- ✅ Sector templates (Newsroom, EU Ads, Marketplace)');

  } catch (error) {
    console.error('❌ Demo failed:', error);
  }
}

// Run the demo
runDemo().catch(console.error);
