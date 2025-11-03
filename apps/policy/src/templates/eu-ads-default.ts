/**
 * Phase 20: Policy Engine & Assertions Builder - EU Ads Default Template
 * Goal: auditable AI disclosures + license facts for campaigns; minimizes PII
 */

import { Policy } from '../types/policy.js';

export const EU_ADS_DEFAULT_POLICY: Policy = {
  policy_id: 'eu-ads-default',
  version: 1,
  applies_to: {
    kinds: ['image', 'video'],
    audience_regions: ['eu']
  },
  disclosure: {
    creation_mode: 'created',
    digital_source_type: 'auto',
    ai: {
      used: true,
      generator: 'Stable Diffusion XL:1.0',
      prompt_disclosure: 'minimal'
    }
  },
  editing: {
    steps: [
      {
        action: 'composite',
        tool: 'After Effects',
        ai_assist: true
      }
    ]
  },
  license: {
    provider: 'custom',
    license_id: 'EU-AD-2025-001',
    rights_window: {
      from: '2025-10-01T00:00:00Z',
      to: '2026-01-31T23:59:59Z'
    },
    terms_url: 'https://brand.example/ad-terms'
  },
  display: {
    badge_copy: 'verbose',
    link_manifest: 'remote'
  },
  controls: {
    redact_personal_fields: true,
    allow_ingredients: true,
    retain_assertions: ['thumbnail']
  },
  lock: {
    enforce_version: true
  }
};

// YAML representation for documentation
export const EU_ADS_DEFAULT_YAML = `policy_id: eu-ads-default
version: 1
applies_to:
  kinds: [image, video]
  audience_regions: [eu]
disclosure:
  creation_mode: created
  digital_source_type: auto
  ai:
    used: true
    generator: Stable Diffusion XL:1.0
    prompt_disclosure: minimal
editing:
  steps:
    - action: composite
      tool: After Effects
      ai_assist: true
license:
  provider: custom
  license_id: EU-AD-2025-001
  rights_window:
    from: 2025-10-01T00:00:00Z
    to: 2026-01-31T23:59:59Z
  terms_url: https://brand.example/ad-terms
display:
  badge_copy: verbose
  link_manifest: remote
controls:
  redact_personal_fields: true
  allow_ingredients: true
  retain_assertions: [thumbnail]
lock:
  enforce_version: true`;

// Template metadata
export const EU_ADS_DEFAULT_METADATA = {
  name: 'EU Ads Default',
  description: 'Policy for EU advertising campaigns with mandatory AI disclosure and PII protection',
  use_case: 'Digital advertising, marketing campaigns, EU regulatory compliance',
  features: [
    'Mandatory AI usage disclosure',
    'PII redaction by default',
    'Verbose badge copy for transparency',
    'Campaign-specific licensing',
    'Limited retention for privacy'
  ],
  compliance: [
    'EU Digital Services Act',
    'AI Act compliance',
    'GDPR privacy protection',
    'C2PA 2.2 compliant'
  ]
};
