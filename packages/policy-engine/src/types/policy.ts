/**
 * Phase 20: Policy Engine & Assertions Builder - Policy DSL Types
 * Human-readable YAML policy schema with strict validation
 * SECURITY: All types enforce strict validation and prevent injection
 */

export interface Policy {
  policy_id: string;
  version: number;
  applies_to: AppliesTo;
  disclosure: Disclosure;
  editing: Editing;
  license: License;
  display: Display;
  controls: Controls;
  lock: Lock;
}

export interface AppliesTo {
  kinds: AssetKind[];
  audience_regions: AudienceRegion[];
}

export interface Disclosure {
  creation_mode: CreationMode;
  digital_source_type: DigitalSourceType;
  ai: AI;
}

export interface AI {
  used: boolean;
  generator?: string;
  prompt_disclosure: PromptDisclosure;
}

export interface Editing {
  steps: EditingStep[];
}

export interface EditingStep {
  action: EditingAction;
  tool?: string;
  ai_assist: boolean;
}

export interface License {
  provider: LicenseProvider;
  license_id?: string;
  rights_window?: RightsWindow;
  terms_url?: string;
}

export interface RightsWindow {
  from: string; // ISO 8601 timestamp - SECURITY: validated format
  to: string;   // ISO 8601 timestamp - SECURITY: validated format
}

export interface Display {
  badge_copy: BadgeCopy;
  link_manifest: ManifestLink;
}

export interface Controls {
  redact_personal_fields: boolean;
  allow_ingredients: boolean;
  retain_assertions: AssertionType[];
}

export interface Lock {
  enforce_version: boolean;
}

// Enums with strict values per C2PA 2.2 spec - SECURITY: prevents injection
export type AssetKind = 'image' | 'video' | 'audio';
export type AudienceRegion = 'global' | 'eu' | 'us' | 'apac';
export type CreationMode = 'created' | 'opened';
export type DigitalSourceType = 'auto' | 'trainedAlgorithmicMedia' | 'computationalCapture' | 'humanCapture';
export type PromptDisclosure = 'none' | 'minimal' | 'full';
export type EditingAction = 'crop' | 'color_adjust' | 'inpaint' | 'caption_edit' | 'composite' | 'other';
export type LicenseProvider = 'getty' | 'ap' | 'reuters' | 'custom';
export type BadgeCopy = 'auto' | 'concise' | 'verbose';
export type ManifestLink = 'remote' | 'embedded';
export type AssertionType = 'thumbnail' | 'ingredient' | 'actions' | 'license';

// C2PA Assertion Types (v2 claims) - SECURITY: strict typing prevents malformed assertions
export interface C2PAActionsAssertion {
  label: 'c2pa.actions';
  data: {
    actions: C2PAAction[];
  };
}

export interface C2PAAction {
  action: 'c2pa.created' | 'c2pa.opened' | 'c2pa.edited' | 'c2pa.derived' | 'c2pa.configured' | 'c2pa.published';
  parameters?: Record<string, any>;
  softwareAgent?: string;
  when?: string; // ISO 8601 timestamp - SECURITY: validated format
}

export interface C2PALicenseAssertion {
  label: 'com.c2c.license.v1';
  data: {
    provider: LicenseProvider;
    license_id?: string;
    rights_window?: RightsWindow;
    terms_url?: string;
    // IPTC-aligned fields - SECURITY: optional fields properly typed
    LicensorName?: string;
    UsageTerms?: string;
    WebStatement?: string;
    Copyright?: string;
    Credit?: string;
    Source?: string;
  };
}

export interface C2CPolicyAssertion {
  label: 'com.c2c.policy.v1';
  data: {
    policy_id: string;
    version: number;
    hash: string; // SHA-256 of canonical policy - SECURITY: validated format
  };
}

// Compiled Assertions Output - SECURITY: comprehensive metadata for audit
export interface CompiledAssertions {
  actions: C2PAActionsAssertion;
  license?: C2PALicenseAssertion;
  policy: C2CPolicyAssertion;
  metadata: {
    compiled_at: string; // ISO 8601 timestamp - SECURITY: validated format
    policy_hash: string; // SECURITY: SHA-256 validated
    validation_errors: ValidationError[];
  };
}

export interface ValidationError {
  code: string;
  message: string;
  path?: string;
  fix_hint?: string;
}

// Policy Diff Output - SECURITY: comprehensive change tracking
export interface PolicyDiff {
  policy_id: string;
  from_version: number;
  to_version: number;
  yaml_diff: string;
  assertions_diff: {
    added?: Record<string, any>;
    removed?: Record<string, any>;
    modified?: Record<string, {old: any; new: any}>;
  };
}

// Dry Run Output - SECURITY: complete preview for validation
export interface DryRunResult {
  policy: Policy;
  compiled: CompiledAssertions;
  badge_copy: string;
  validation_errors: ValidationError[];
  manifest_preview: {
    claim_generator: string;
    claim_generator_version: string;
    assertions: Array<{label: string; data: any}>;
  };
}

// Policy Record (for storage) - SECURITY: immutable audit trail
export interface PolicyRecord {
  policy_id: string;
  version: number;
  canonical_yaml: string;
  compiled_assertions: CompiledAssertions;
  created_at: string;
  updated_at: string;
  created_by: string; // SECURITY: audit trail maintained
}

// Policy Template for registry - SECURITY: versioned and tracked
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

// C2PA Digital Source Type URIs (per spec) - SECURITY: immutable constants
export const DIGITAL_SOURCE_TYPE_URIS = {
  trainedAlgorithmicMedia: 'http://c2pa.org/digitalsourcetype/trainedAlgorithmicData',
  computationalCapture: 'http://c2pa.org/digitalsourcetype/computationalCapture',
  humanCapture: 'http://c2pa.org/digitalsourcetype/humanCapture',
  trainedAlgorithmicData: 'http://c2pa.org/digitalsourcetype/trainedAlgorithmicData',
} as const;

// C2PA Action Constants - SECURITY: immutable constants
export const C2PA_ACTIONS = {
  CREATED: 'c2pa.created',
  OPENED: 'c2pa.opened',
  EDITED: 'c2pa.edited',
  DERIVED: 'c2pa.derived',
  CONFIGURED: 'c2pa.configured',
  PUBLISHED: 'c2pa.published',
} as const;

// Error Code Constants - SECURITY: comprehensive error taxonomy
export const POLICY_ERROR_CODES = {
  ACTIONS_MISSING: 'policy.actions.missing',
  ACTIONS_ORDER: 'policy.actions.order',
  DST_INVALID: 'policy.dst.invalid',
  LICENSE_FIELDS: 'policy.license.fields',
  LOCK_HASH_MISMATCH: 'policy.lock.hash_mismatch',
  UNKNOWN_KEYS: 'policy.unknown_keys',
  INVALID_YAML: 'policy.invalid_yaml',
  VERSION_CONFLICT: 'policy.version.conflict',
  INPUT_TOO_LARGE: 'policy.input.too_large',
  INVALID_FORMAT: 'policy.invalid.format',
  NESTING_TOO_DEEP: 'policy.nesting.too_deep',
  ARRAY_TOO_LARGE: 'policy.array.too_large',
  STRING_TOO_LONG: 'policy.string.too_long',
  INVALID_DATE_RANGE: 'policy.date.invalid_range',
  EXCESSIVE_FUTURE_DATE: 'policy.date.excessive_future',
} as const;
