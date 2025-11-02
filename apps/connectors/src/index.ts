/**
 * Phase 19: Marketplace Connectors - Main Entry Point
 * Read-only adapters for Getty, AP, Shutterstock with IPTC-compliant license assertions
 */

export * from './types.js';
export * from './assertion-builder.js';

// Re-export for convenience
export type { LicenseProvider } from './types.js';
