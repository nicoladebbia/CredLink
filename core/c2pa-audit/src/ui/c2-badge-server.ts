/**
 * Licensed Content Enforcement Hooks - C2 Badge Component (Node.js Compatible)
 * Phase 32 v1.1 - License-aware badge with soft-block UI
 * This version provides server-side rendering and browser compatibility
 */

import { VerifyResponse } from '../api/license-enforcement.js';

export interface BadgeConfig {
  /** Badge position */
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  /** Badge size */
  size: 'small' | 'medium' | 'large';
  /** Preview degradation settings */
  preview_degrade: {
    warn: { scale: number; blur_px: number };
    block: { scale: number; blur_px: number };
  };
  /** Call-to-action text */
  cta: {
    warn: string;
    block: string;
  };
  /** Show license details */
  show_license_info: boolean;
}

export interface BadgeState {
  /** Current badge state */
  status: 'ok' | 'warn' | 'block' | 'loading' | 'error';
  /** License information */
  license?: {
    license_uri: string;
    rights_page: string;
    licensor_name?: string;
    usage_terms?: string;
    permission_level: 'permissive' | 'restricted' | 'prohibited';
  };
  /** Verification result */
  verification?: {
    result: 'ok' | 'warn' | 'block';
    manifest_hash: string;
    verification_time_ms: number;
  };
  /** Action buttons */
  actions?: {
    primary?: { text: string; url: string; style: 'primary' | 'secondary' };
    secondary?: { text: string; url: string; style: 'primary' | 'secondary' };
  };
}

/**
 * C2 Badge component with license enforcement awareness
 * Server-side compatible version
 */
export class C2LicenseBadge {
  private config: BadgeConfig;
  private currentState: BadgeState = { status: 'loading' };

  constructor(config: Partial<BadgeConfig> = {}) {
    this.config = {
      position: 'top-right',
      size: 'medium',
      preview_degrade: {
        warn: { scale: 0.4, blur_px: 6 },
        block: { scale: 0.2, blur_px: 12 }
      },
      cta: {
        warn: 'View license / Provide proof',
        block: 'License required for this use'
      },
      show_license_info: true,
      ...config
    };
  }

  /**
   * Generate CSS styles for badge
   */
  generateStyles(): string {
    return `
      .c2-badge {
        position: relative;
        display: inline-block;
      }

      .c2-badge-widget {
        position: absolute;
        background: white;
        border: 1px solid #e1e5e9;
        border-radius: 6px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 12px;
        z-index: 1000;
        transition: all 0.2s ease;
      }

      .c2-badge-widget:hover {
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
      }

      .c2-badge-top-left { top: 8px; left: 8px; }
      .c2-badge-top-right { top: 8px; right: 8px; }
      .c2-badge-bottom-left { bottom: 8px; left: 8px; }
      .c2-badge-bottom-right { bottom: 8px; right: 8px; }

      .c2-badge-small { width: 32px; height: 32px; }
      .c2-badge-medium { width: 200px; }
      .c2-badge-large { width: 300px; }

      .c2-badge-icon {
        width: 24px;
        height: 24px;
        display: block;
        margin: 4px;
      }

      .c2-badge-content {
        padding: 8px 12px;
      }

      .c2-badge-status {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-bottom: 4px;
      }

      .c2-badge-status-icon {
        width: 12px;
        height: 12px;
        border-radius: 50%;
      }

      .c2-badge-status-ok { background: #10b981; }
      .c2-badge-status-warn { background: #f59e0b; }
      .c2-badge-status-block { background: #ef4444; }
      .c2-badge-status-loading { background: #6b7280; }

      .c2-badge-title {
        font-weight: 600;
        color: #1f2937;
      }

      .c2-badge-message {
        color: #6b7280;
        font-size: 11px;
        margin: 4px 0;
      }

      .c2-badge-actions {
        display: flex;
        gap: 6px;
        margin-top: 6px;
      }

      .c2-badge-button {
        padding: 4px 8px;
        border: none;
        border-radius: 4px;
        font-size: 11px;
        cursor: pointer;
        text-decoration: none;
        display: inline-block;
      }

      .c2-badge-button-primary {
        background: #3b82f6;
        color: white;
      }

      .c2-badge-button-primary:hover {
        background: #2563eb;
      }

      .c2-badge-button-secondary {
        background: #f3f4f6;
        color: #374151;
        border: 1px solid #d1d5db;
      }

      .c2-badge-button-secondary:hover {
        background: #e5e7eb;
      }

      .c2-badge-details {
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px solid #e5e7eb;
      }

      .c2-badge-license-info {
        font-size: 10px;
        color: #6b7280;
      }

      .c2-badge-license-uri {
        word-break: break-all;
      }

      .c2-preview-degraded {
        filter: blur(var(--blur-px)) brightness(0.7);
        transform: scale(var(--scale));
        transform-origin: top left;
        transition: all 0.3s ease;
      }

      .c2-preview-degraded:hover {
        filter: none;
        transform: none;
      }

      .c2-badge-banner {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        background: #fbbf24;
        color: #92400e;
        padding: 8px;
        font-size: 12px;
        text-align: center;
        z-index: 999;
      }

      .c2-badge-spinner {
        width: 16px;
        height: 16px;
        border: 2px solid #e5e7eb;
        border-top: 2px solid #3b82f6;
        border-radius: 50%;
        animation: spin 1s linear infinite;
      }

      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;
  }

  /**
   * Generate badge HTML
   */
  generateHTML(): string {
    const { status, license, actions } = this.currentState;

    let statusClass = '';
    let title = '';
    let message = '';
    let showActions = false;

    switch (status) {
      case 'ok':
        statusClass = 'c2-badge-status-ok';
        title = 'Verified Content';
        message = license?.licensor_name || 'Content authenticity verified';
        break;

      case 'warn':
        statusClass = 'c2-badge-status-warn';
        title = 'License Required';
        message = this.config.cta.warn;
        showActions = true;
        break;

      case 'block':
        statusClass = 'c2-badge-status-block';
        title = 'Access Blocked';
        message = this.config.cta.block;
        showActions = true;
        break;

      case 'loading':
        statusClass = 'c2-badge-status-loading';
        title = 'Verifying...';
        message = 'Checking content authenticity';
        break;

      case 'error':
        statusClass = 'c2-badge-status-block';
        title = 'Verification Failed';
        message = 'Unable to verify content authenticity';
        break;
    }

    let actionsHtml = '';
    if (showActions && actions) {
      actionsHtml = `
        <div class="c2-badge-actions">
          ${actions.primary ? `<a href="${actions.primary.url}" class="c2-badge-button c2-badge-button-${actions.primary.style}">${actions.primary.text}</a>` : ''}
          ${actions.secondary ? `<a href="${actions.secondary.url}" class="c2-badge-button c2-badge-button-${actions.secondary.style}">${actions.secondary.text}</a>` : ''}
        </div>
      `;
    }

    let licenseHtml = '';
    if (this.config.show_license_info && license && status !== 'loading') {
      licenseHtml = `
        <div class="c2-badge-details">
          <div class="c2-badge-license-info">
            <div><strong>License:</strong> ${license.permission_level}</div>
            ${license.licensor_name ? `<div><strong>Licensor:</strong> ${license.licensor_name}</div>` : ''}
            <div class="c2-badge-license-uri"><strong>URI:</strong> <a href="${license.license_uri}" target="_blank">${license.license_uri}</a></div>
          </div>
        </div>
      `;
    }

    let statusIcon = '';
    if (status === 'loading') {
      statusIcon = '<div class="c2-badge-spinner"></div>';
    } else {
      statusIcon = `<div class="c2-badge-status-icon ${statusClass}"></div>`;
    }

    return `
      <div class="c2-badge-widget c2-badge-${this.config.position} c2-badge-${this.config.size}">
        <div class="c2-badge-content">
          <div class="c2-badge-status">
            ${statusIcon}
            <span class="c2-badge-title">${title}</span>
          </div>
          <div class="c2-badge-message">${message}</div>
          ${actionsHtml}
          ${licenseHtml}
        </div>
      </div>
    `;
  }

  /**
   * Generate complete HTML with styles
   */
  generateCompleteHTML(): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>${this.generateStyles()}</style>
      </head>
      <body>
        <div class="c2-badge">
          ${this.generateHTML()}
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Update badge state
   */
  updateState(state: BadgeState): void {
    this.currentState = state;
  }

  /**
   * Update badge with verification response
   */
  updateWithVerification(response: VerifyResponse): void {
    const state: BadgeState = {
      status: response.result,
      license: response.license,
      verification: {
        result: response.result,
        manifest_hash: response.manifest_hash,
        verification_time_ms: response.signals.verification_time_ms
      }
    };

    // Add action buttons based on status
    if (response.result === 'warn' || response.result === 'block') {
      state.actions = {
        primary: {
          text: 'View License',
          url: response.license.rights_page,
          style: 'primary'
        },
        secondary: {
          text: 'I have a license',
          url: '#appeal',
          style: 'secondary'
        }
      };
    }

    this.updateState(state);
  }

  /**
   * Show error state
   */
  showError(): void {
    this.updateState({
      status: 'error',
      verification: {
        result: 'block',
        manifest_hash: 'unknown',
        verification_time_ms: 0
      }
    });
  }

  /**
   * Get current badge state
   */
  getState(): BadgeState {
    return { ...this.currentState };
  }

  /**
   * Get badge configuration
   */
  getConfig(): BadgeConfig {
    return { ...this.config };
  }

  /**
   * Generate server-side renderable badge for given asset URL
   */
  static generateForAsset(_assetUrl: string, config?: Partial<BadgeConfig>): string {
    const badge = new C2LicenseBadge(config);
    
    // Generate mock verification response for server-side rendering
    const mockResponse: VerifyResponse = {
      result: 'warn',
      license: {
        license_uri: 'https://creativecommons.org/licenses/by/4.0/',
        rights_page: 'https://publisher.example.com/licensing/asset-123',
        licensor_name: 'Publisher, Inc.',
        usage_terms: 'Editorial use only; no AI training',
        permission_level: 'restricted'
      },
      manifest_hash: 'sha256:3b8a...d10',
      signals: {
        assertions: ['c2pa.metadata'],
        chain_ok: true,
        verification_time_ms: 150,
        verifier: 'cai-verify@1.0'
      },
      action: {
        show_badge: true,
        badge_state: 'warn',
        preview_degrade: { scale: 0.4, blur_px: 6 },
        cta_text: 'View license / Provide proof'
      }
    };

    badge.updateWithVerification(mockResponse);
    return badge.generateCompleteHTML();
  }
}

/**
 * Initialize C2 License Badge (server-side compatible)
 */
export function initializeC2Badges(): void {
  // Server-side initialization - just log that badges are ready
  if (typeof console !== 'undefined') {
    console.log('C2 License Badges initialized');
  }
}

/**
 * Server-side badge generation utility
 */
export function generateBadgeHTML(_assetUrl: string, verificationResponse: VerifyResponse, config?: Partial<BadgeConfig>): string {
  const badge = new C2LicenseBadge(config);
  badge.updateWithVerification(verificationResponse);
  return badge.generateHTML();
}

/**
 * Generate badge styles for inclusion in HTML head
 */
export function generateBadgeStyles(): string {
  const badge = new C2LicenseBadge();
  return `<style>${badge.generateStyles()}</style>`;
}
