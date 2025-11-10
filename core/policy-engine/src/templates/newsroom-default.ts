/**
 * Phase 20: Policy Engine & Assertions Builder - Newsroom Default Template
 * Goal: clear creation/edit history; GenAI disclosure when present; keep attribution
 */

import { Policy } from '../types/policy.js';

export const NEWSROOM_DEFAULT_POLICY: Policy = {
  policy_id: 'newsroom-default',
  version: 1,
  applies_to: {
    kinds: ['image', 'video', 'audio'],
    audience_regions: ['global', 'eu', 'us', 'apac']
  },
  disclosure: {
    creation_mode: 'created',
    digital_source_type: 'auto',
    ai: {
      used: false,
      prompt_disclosure: 'minimal'
    }
  },
  editing: {
    steps: []
  },
  license: {
    provider: 'custom',
    terms_url: 'https://news.example/terms'
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
export const NEWSROOM_DEFAULT_YAML = `policy_id: newsroom-default
version: 1
applies_to:
  kinds: [image, video, audio]
  audience_regions: [global, eu, us, apac]
disclosure:
  creation_mode: created
  digital_source_type: auto
  ai:
    used: false
    prompt_disclosure: minimal
editing:
  steps: []
license:
  provider: custom
  terms_url: https://news.example/terms
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
export const NEWSROOM_DEFAULT_METADATA = {
  name: 'Newsroom Default',
  description: 'Standard policy for newsroom content with clear provenance and optional AI disclosure',
  use_case: 'News publishing, editorial content, journalism',
  features: [
    'Automatic AI detection and disclosure',
    'Comprehensive editing history',
    'Flexible licensing for custom terms',
    'Remote manifest linking',
    'Thumbnail and ingredient retention'
  ],
  compliance: [
    'C2PA 2.2 compliant',
    'IPTC license standards',
    'Editorial best practices'
  ]
};
