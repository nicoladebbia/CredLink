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
        warn: {
            scale: number;
            blur_px: number;
        };
        block: {
            scale: number;
            blur_px: number;
        };
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
        primary?: {
            text: string;
            url: string;
            style: 'primary' | 'secondary';
        };
        secondary?: {
            text: string;
            url: string;
            style: 'primary' | 'secondary';
        };
    };
}
/**
 * C2 Badge component with license enforcement awareness
 * Server-side compatible version
 */
export declare class C2LicenseBadge {
    private config;
    private currentState;
    constructor(config?: Partial<BadgeConfig>);
    /**
     * Generate CSS styles for badge
     */
    generateStyles(): string;
    /**
     * Generate badge HTML
     */
    generateHTML(): string;
    /**
     * Generate complete HTML with styles
     */
    generateCompleteHTML(): string;
    /**
     * Update badge state
     */
    updateState(state: BadgeState): void;
    /**
     * Update badge with verification response
     */
    updateWithVerification(response: VerifyResponse): void;
    /**
     * Show error state
     */
    showError(): void;
    /**
     * Get current badge state
     */
    getState(): BadgeState;
    /**
     * Get badge configuration
     */
    getConfig(): BadgeConfig;
    /**
     * Generate server-side renderable badge for given asset URL
     */
    static generateForAsset(_assetUrl: string, config?: Partial<BadgeConfig>): string;
}
/**
 * Initialize C2 License Badge (server-side compatible)
 */
export declare function initializeC2Badges(): void;
/**
 * Server-side badge generation utility
 */
export declare function generateBadgeHTML(_assetUrl: string, verificationResponse: VerifyResponse, config?: Partial<BadgeConfig>): string;
/**
 * Generate badge styles for inclusion in HTML head
 */
export declare function generateBadgeStyles(): string;
//# sourceMappingURL=c2-badge-server.d.ts.map