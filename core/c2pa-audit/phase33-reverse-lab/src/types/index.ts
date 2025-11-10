/**
 * Core type definitions for Phase 33 Reverse Lab
 * Optimizer Behavior Fingerprinting and Tracking System
 */

import { z } from 'zod';

// Provider Configuration Schema
export const ProviderSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  baseUrl: z.string().url(),
  docs: z.object({
    reference: z.string().url().optional(),
    blog: z.string().url().optional(),
    changelog: z.string().url().optional(),
  }).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  rateLimit: z.object({
    rps: z.number().min(1).max(30),
    concurrency: z.number().min(1).max(3),
    backoffMs: z.number().min(1000),
  }),
  transforms: z.array(z.string()),
});

export type Provider = z.infer<typeof ProviderSchema>;

// Transform Configuration Schema
export const TransformSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  expectedBehavior: z.object({
    preservesC2PA: z.boolean(),
    preservesEXIF: z.boolean(),
    preservesXMP: z.boolean(),
    remoteManifestSupported: z.boolean(),
  }),
});

export type Transform = z.infer<typeof TransformSchema>;

// Test Asset Schema
export const TestAssetSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  format: z.enum(['jpeg', 'png', 'webp', 'avif']),
  size: z.number().positive(),
  hasEmbeddedManifest: z.boolean(),
  hasRemoteManifest: z.boolean(),
  manifestUrl: z.string().url().optional(),
  checksum: z.string().min(1),
  publicUrl: z.string().url(),
});

export type TestAsset = z.infer<typeof TestAssetSchema>;

// Request/Response Tracking Schema
export const RequestRecipeSchema = z.object({
  url: z.string().url(),
  method: z.enum(['GET', 'HEAD']),
  headers: z.record(z.string(), z.string()),
  params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  timestamp: z.string().datetime(),
});

export type RequestRecipe = z.infer<typeof RequestRecipeSchema>;

export const ResponseResultSchema = z.object({
  status: z.number().int().min(100).max(599),
  headers: z.record(z.string(), z.string()),
  bytes: z.object({
    size: z.number().int().nonnegative(),
    hash: z.string().min(1),
    data: z.string().base64().optional(), // Store sample for debugging
  }),
  timing: z.object({
    connectMs: z.number().nonnegative(),
    firstByteMs: z.number().nonnegative(),
    totalMs: z.number().nonnegative(),
  }),
  serverHeader: z.string().optional(),
  cacheHeaders: z.record(z.string(), z.string()).optional(),
});

export type ResponseResult = z.infer<typeof ResponseResultSchema>;

// C2PA Verification Results Schema
export const VerificationResultSchema = z.object({
  embeddedManifest: z.object({
    present: z.boolean(),
    valid: z.boolean(),
    jumbfSize: z.number().nonnegative().optional(),
    signatureAlgorithm: z.string().optional(),
    claimGenerator: z.string().optional(),
    claimGeneratorVersion: z.string().optional(),
  }),
  remoteManifest: z.object({
    linked: z.boolean(),
    accessible: z.boolean(),
    url: z.string().url().optional(),
    valid: z.boolean(),
  }),
  integrity: z.object({
    hashValid: z.boolean(),
    signatureValid: z.boolean(),
    certificateChainValid: z.boolean(),
    timestampValid: z.boolean(),
  }),
  metadata: z.object({
    exifPreserved: z.boolean(),
    xmpPreserved: z.boolean(),
    iptcPreserved: z.boolean(),
    otherPreserved: z.boolean(),
  }),
});

export type VerificationResult = z.infer<typeof VerificationResultSchema>;

// Provider Profile Schema (Canonical, Versioned)
export const ProviderProfileSchema = z.object({
  provider: z.string().min(1),
  versionHint: z.object({
    serverHeader: z.string().optional(),
    docUrl: z.string().url().optional(),
    observedAt: z.string().datetime(),
    profileVersion: z.string().min(1), // e.g., "2025.44"
  }),
  matrix: z.array(z.object({
    transform: z.string().min(1),
    request: RequestRecipeSchema,
    response: ResponseResultSchema,
    verify: VerificationResultSchema,
    notes: z.string().optional(),
  })),
  policy: z.object({
    recommendation: z.enum(['embed', 'remote-only', 'force-remote', 'hybrid']),
    autoFallback: z.boolean(),
    evidence: z.array(z.string()),
    confidence: z.number().min(0).max(1),
  }),
  metadata: z.object({
    totalCases: z.number().int().nonnegative(),
    successRate: z.number().min(0).max(1),
    generatedAt: z.string().datetime(),
    jobId: z.string().min(1),
  }),
});

export type ProviderProfile = z.infer<typeof ProviderProfileSchema>;

// Change Event Schema
export const ChangeEventSchema = z.object({
  id: z.string().min(1),
  providerId: z.string().min(1),
  detectedAt: z.string().datetime(),
  changeType: z.enum(['behavior_flip', 'header_drift', 'manifest_loss', 'manifest_gain']),
  severity: z.enum(['info', 'warning', 'critical']),
  oldProfileHash: z.string().min(1),
  newProfileHash: z.string().min(1),
  affectedTransforms: z.array(z.string()),
  evidence: z.array(z.string()),
  proposedRuleDiff: z.record(z.string(), z.unknown()),
  impact: z.object({
    affectedTenants: z.number().int().nonnegative(),
    embedSurvivalDrop: z.number().min(0).max(1),
    remoteSurvivalAffected: z.boolean(),
  }),
});

export type ChangeEvent = z.infer<typeof ChangeEventSchema>;

// Job Specification Schema
export const JobSpecSchema = z.object({
  id: z.string().min(1),
  providers: z.array(z.string().min(1)),
  transforms: z.array(z.string().min(1)),
  assets: z.array(z.string().min(1)),
  runs: z.number().int().min(1).max(10),
  priority: z.enum(['low', 'normal', 'high', 'weekly']),
  scheduledAt: z.string().datetime().optional(),
  timeout: z.number().int().positive().optional(), // milliseconds
  cacheBust: z.boolean().optional(),
});

export type JobSpec = z.infer<typeof JobSpecSchema>;

// Job Result Schema
export const JobResultSchema = z.object({
  jobId: z.string().min(1),
  status: z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  totalCases: z.number().int().nonnegative(),
  completedCases: z.number().int().nonnegative(),
  failedCases: z.number().int().nonnegative(),
  profiles: z.array(z.string()), // Profile file paths
  changeEvents: z.array(ChangeEventSchema),
  summary: z.object({
    providersProcessed: z.number().int().nonnegative(),
    transformsTested: z.number().int().nonnegative(),
    assetsAnalyzed: z.number().int().nonnegative(),
    successRate: z.number().min(0).max(1),
    duration: z.number().nonnegative(), // milliseconds
  }),
});

export type JobResult = z.infer<typeof JobResultSchema>;

// Optimizer Rules Schema
export const OptimizerRulesSchema = z.object({
  version: z.string().min(1),
  updatedAt: z.string().datetime(),
  providers: z.record(z.string(), z.object({
    embedSurvival: z.union([z.boolean(), z.string()]), // boolean or "depends_on_*"
    remoteSurvival: z.boolean(),
    enforceRemote: z.boolean(),
    gauntletProfile: z.string().optional(),
    recommendation: z.enum(['embed', 'remote-only', 'force-remote', 'hybrid']),
    evidence: z.array(z.string()),
    lastChecked: z.string().datetime(),
  })),
});

export type OptimizerRules = z.infer<typeof OptimizerRulesSchema>;

// Robots.txt Compliance Schema
export const RobotsComplianceSchema = z.object({
  allowed: z.boolean(),
  crawlDelay: z.number().int().nonnegative().optional(),
  disallowedPaths: z.array(z.string()),
  allowedPaths: z.array(z.string()),
  userAgent: z.string().optional(),
  lastChecked: z.string().datetime(),
});

export type RobotsCompliance = z.infer<typeof RobotsComplianceSchema>;

// Weekly Report Schema
export const WeeklyReportSchema = z.object({
  weekId: z.string().min(1), // e.g., "2025-W44"
  generatedAt: z.string().datetime(),
  summary: z.object({
    totalProviders: z.number().int().nonnegative(),
    totalTransforms: z.number().int().nonnegative(),
    totalCases: z.number().int().nonnegative(),
    changeEvents: z.number().int().nonnegative(),
    policyUpdates: z.number().int().nonnegative(),
  }),
  optimizerDeltas: z.array(z.object({
    provider: z.string().min(1),
    changeType: z.enum(['behavior_flip', 'header_drift', 'manifest_loss', 'manifest_gain']),
    description: z.string().min(1),
    evidence: z.array(z.string()),
    docReferences: z.array(z.string().url()),
    impact: z.string().min(1),
    ruleChanges: z.record(z.string(), z.unknown()),
  })),
  performanceMetrics: z.object({
    averageResponseTime: z.number().nonnegative(),
    successRate: z.number().min(0).max(1),
    blockedRequests: z.number().int().nonnegative(),
    rateLimitHits: z.number().int().nonnegative(),
  }),
});

export type WeeklyReport = z.infer<typeof WeeklyReportSchema>;

// API Response Schemas
export const ApiResponseSchema = z.object({
  success: z.boolean(),
  data: z.unknown().optional(),
  error: z.string().optional(),
  timestamp: z.string().datetime(),
  requestId: z.string().min(1),
});

export type ApiResponse = z.infer<typeof ApiResponseSchema>;

export const PaginatedResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(z.unknown()),
  pagination: z.object({
    page: z.number().int().positive(),
    limit: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().positive(),
  }),
  timestamp: z.string().datetime(),
  requestId: z.string().min(1),
});

export type PaginatedResponse = z.infer<typeof PaginatedResponseSchema>;
