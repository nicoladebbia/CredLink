/**
 * C2 Badge Type Definitions
 */

export interface C2BadgeAttributes {
  /** URL of the asset to verify */
  'asset-url'?: string;
  /** Direct URL of the manifest to verify */
  'manifest-url'?: string;
  /** URL of the verification API */
  'api-url'?: string;
  /** Custom badge text */
  'text'?: string;
  /** Whether to auto-open the modal */
  'auto-open'?: string;
  /** URL to the CSS stylesheet */
  'styles-url'?: string;
}

export interface VerificationResult {
  valid: boolean;
  signer: {
    name: string;
    key_id: string;
    organization?: string;
    trusted: boolean;
  };
  assertions: {
    ai_generated: boolean;
    edits: string[];
    created_at?: string;
    content_type?: string;
  };
  warnings: string[];
  decision_path: {
    discovery: 'link_header' | 'direct_url' | 'embedded' | 'not_found';
    source: string;
    steps: string[];
  };
  metrics: {
    total_time_ms: number;
    fetch_time_ms: number;
    validation_time_ms: number;
    cached: boolean;
  };
}

export interface C2BadgeConfig {
  apiUrl?: string;
  assetUrl?: string;
  manifestUrl?: string;
  text?: string;
  autoOpen?: boolean;
}

export interface C2BadgeEvents {
  'c2-badge:open': CustomEvent<void>;
  'c2-badge:close': CustomEvent<void>;
  'c2-badge:verify-start': CustomEvent<{ url: string }>;
  'c2-badge:verify-success': CustomEvent<VerificationResult>;
  'c2-badge:verify-error': CustomEvent<{ error: string }>;
}

// Forward declaration for the actual class
declare class C2BadgeClass extends HTMLElement {
  connectedCallback(): void;
  disconnectedCallback(): void;
  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void;
  static get observedAttributes(): string[];
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-badge': C2BadgeClass;
  }
}
