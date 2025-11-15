/**
 * Phase 20: Policy Engine & Assertions Builder - Marketplace Listing Default Template
 * Goal: provenance + license statements tied to the listing; remote-only
 */

import { Policy } from '../types/policy.js';

export const MARKETPLACE_LISTING_DEFAULT_POLICY: Policy = {
  policy_id: 'marketplace-listing-default',
  version: 1,
  applies_to: {
    kinds: ['image'],
    audience_regions: ['global']
  },
  disclosure: {
    creation_mode: 'opened',
    digital_source_type: 'humanCapture',
    ai: {
      used: false,
      prompt_disclosure: 'none'
    }
  },
  editing: {
    steps: []
  },
  license: {
    provider: 'getty',
    license_id: '123456',
    rights_window: {
      from: '2025-10-01T00:00:00Z',
      to: '2026-10-01T00:00:00Z'
    },
    terms_url: 'https://www.gettyimages.com/eula'
  },
  display: {
    badge_copy: 'concise',
    link_manifest: 'remote'
  },
  controls: {
    redact_personal_fields: false,
    allow_ingredients: true,
    retain_assertions: ['thumbnail', 'ingredient']
  },
  lock: {
    enforce_version: true
  }
};

// YAML representation for documentation
export const MARKETPLACE_LISTING_DEFAULT_YAML = `policy_id: marketplace-listing-default
version: 1
applies_to:
  kinds: [image]
  audience_regions: [global]
disclosure:
  creation_mode: opened
  digital_source_type: humanCapture
  ai:
    used: false
    prompt_disclosure: none
editing:
  steps: []
license:
  provider: getty
  license_id: 123456
  rights_window:
    from: 2025-10-01T00:00:00Z
    to: 2026-10-01T00:00:00Z
  terms_url: https://www.gettyimages.com/eula
display:
  badge_copy: concise
  link_manifest: remote
controls:
  redact_personal_fields: false
  allow_ingredients: true
  retain_assertions: [thumbnail, ingredient]
lock:
  enforce_version: true`;

// Template metadata
export const MARKETPLACE_LISTING_DEFAULT_METADATA = {
  name: 'Marketplace Listing Default',
  description: 'Policy for marketplace listings with provenance tracking and provider license integration',
  use_case: 'Stock photo marketplaces, content licensing platforms, creative asset sales',
  features: [
    'Provider license integration',
    'Remote manifest linking',
    'IPTC-aligned license fields',
    'Rights window enforcement',
    'Thumbnail and ingredient retention'
  ],
  compliance: [
    'C2PA 2.2 compliant',
    'IPTC license standards',
    'Provider terms compliance',
    'Marketplace platform requirements'
  ]
};
