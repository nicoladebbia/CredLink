/**
 * Phase 48 - Compliance v2 Main Package
 * EU/UK/US/BR Regulatory Compliance Support
 */

// Export assertion presets and interfaces
export * from './assertions.js';

// Export reporting harmonizer and interfaces
export * from './reporting.js';

// Export pack generator and interfaces
export * from './generator.js';

// Export retention policy manager
export * from './retention.js';

// Export API server and interfaces
export * from './api.js';

// Main compliance package version
export const COMPLIANCE_VERSION = "1.0.0";

// Default export for easy importing
export default {
  COMPLIANCE_VERSION,
  assertions: () => import('./assertions.js'),
  reporting: () => import('./reporting.js'),
  generator: () => import('./generator.js'),
  retention: () => import('./retention.js'),
  api: () => import('./api.js')
};
