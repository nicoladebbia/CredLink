/**
 * Phase 34 Spec Watch System - Core Type Definitions
 * C2PA Specification Tracking and Contribution System
 */

import { z } from 'zod';

// Watch Target Configuration Schema
export const WatchTargetSchema = z.object({
  id: z.string().min(1),
  url: z.string().url(),
  type: z.enum(['html', 'pdf', 'rss', 'github-api', 'changelog']),
  selector: z.string().optional(),
  interval: z.number().int().positive().default(24), // hours
  enabled: z.boolean().default(true),
  headers: z.record(z.string(), z.string()).optional(),
});

export type WatchTarget = z.infer<typeof WatchTargetSchema>;

// Watch Job Configuration Schema
export const WatchJobConfigSchema = z.object({
  targets: z.array(WatchTargetSchema),
  interval_hours: z.number().int().min(1).max(168).default(24),
  gauntlet_enabled: z.boolean().default(true),
  notification_enabled: z.boolean().default(true),
  storage: z.object({
    redis: z.object({
      host: z.string(),
      port: z.number().int(),
      db: z.number().int().default(0),
    }),
    artifacts: z.object({
      base_path: z.string(),
      retention_days: z.number().int().default(90),
    }),
  }),
});

export type WatchJobConfig = z.infer<typeof WatchJobConfigSchema>;

// Change Detection Schema
export const SpecChangeSchema = z.object({
  id: z.string().min(1),
  target_id: z.string().min(1),
  detected_at: z.string().datetime(),
  change_type: z.enum(['content', 'structure', 'metadata', 'hash']),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  title: z.string().min(1),
  description: z.string().min(1),
  sections: z.array(z.object({
    title: z.string(),
    old_content: z.string().optional(),
    new_content: z.string().optional(),
    context_before: z.string().optional(),
    context_after: z.string().optional(),
  })),
  metadata: z.object({
    content_hash: z.string(),
    previous_hash: z.string().optional(),
    size_diff: z.number().int(),
    lines_added: z.number().int(),
    lines_removed: z.number().int(),
  }),
  spec_references: z.array(z.object({
    section: z.string(),
    paragraph: z.string().optional(),
    url: z.string().url(),
  })),
});

export type SpecChange = z.infer<typeof SpecChangeSchema>;

// Gauntlet Test Results Schema
export const GauntletResultSchema = z.object({
  id: z.string().min(1),
  change_id: z.string().min(1),
  run_at: z.string().datetime(),
  status: z.enum(['passed', 'failed', 'partial']),
  summary: z.object({
    total_assets: z.number().int(),
    embedded_survived: z.number().int(),
    remote_survived: z.number().int(),
    discovery_precedence_changed: z.boolean(),
    video_semantics_affected: z.boolean(),
  }),
  assets: z.array(z.object({
    id: z.string(),
    type: z.enum(['image', 'video']),
    embedded_manifest: z.boolean(),
    remote_manifest: z.boolean(),
    discovery_order: z.array(z.string()),
    verify_output: z.string(),
    error: z.string().optional(),
  })),
  artifacts: z.object({
    trace_file: z.string(),
    diff_file: z.string(),
    evidence_pack: z.string(),
  }),
});

export type GauntletResult = z.infer<typeof GauntletResultSchema>;

// Issue/PR Template Schema
export const IssueTemplateSchema = z.object({
  type: z.enum(['issue', 'pull_request']),
  title: z.string().min(1),
  body: z.string().min(1),
  labels: z.array(z.string()),
  spec_references: z.array(z.string().url()),
  evidence_pack: z.string(),
  repro_steps: z.array(z.string()),
  expected_behavior: z.string(),
  actual_behavior: z.string(),
});

export type IssueTemplate = z.infer<typeof IssueTemplateSchema>;

// Quarterly Report Schema
export const QuarterlyReportSchema = z.object({
  id: z.string().min(1),
  quarter: z.string().regex(/^\d{4}-Q[1-4]$/),
  generated_at: z.string().datetime(),
  summary: z.object({
    total_changes: z.number().int(),
    critical_changes: z.number().int(),
    gauntlet_runs: z.number().int(),
    upstream_contributions: z.number().int(),
  }),
  sections: z.object({
    what_changed: z.array(z.object({
      title: z.string(),
      description: z.string(),
      spec_refs: z.array(z.string().url()),
      impact: z.string(),
    })),
    impact_analysis: z.array(z.object({
      area: z.enum(['discovery', 'remote_manifest', 'video_semantics', 'security']),
      effect: z.string(),
      mitigation: z.string(),
    })),
    our_response: z.array(z.object({
      action: z.string(),
      status: z.enum(['completed', 'in_progress', 'planned']),
      timeline: z.string(),
    })),
    customer_actions: z.array(z.object({
      action: z.string(),
      priority: z.enum(['required', 'recommended', 'optional']),
      deadline: z.string().optional(),
    })),
  }),
  appendix: z.object({
    sdk_changes: z.array(z.object({
      sdk: z.string(),
      version: z.string(),
      breaking_changes: z.boolean(),
      api_diffs: z.string().optional(),
    })),
    conformance_news: z.array(z.object({
      title: z.string(),
      url: z.string().url(),
      impact: z.string(),
    })),
  }),
});

export type QuarterlyReport = z.infer<typeof QuarterlyReportSchema>;

// System Configuration Schema
export const SpecWatchConfigSchema = z.object({
  watch_job: WatchJobConfigSchema,
  github: z.object({
    token: z.string().min(1),
    owner: z.string().min(1),
    repo: z.string().min(1),
    issue_labels: z.array(z.string()).default(['spec-watch', 'c2pa-2.2']),
  }),
  gauntlet: z.object({
    enabled: z.boolean(),
    sentinel_assets: z.array(z.string()),
    timeout_ms: z.number().int().positive().default(300000),
    parallel_jobs: z.number().int().positive().default(4),
  }),
  notifications: z.object({
    slack_webhook: z.string().url().optional(),
    email_recipients: z.array(z.string().email()),
    quarterly_report: z.object({
      enabled: z.boolean(),
      delivery_day: z.number().int().min(1).max(28).default(30),
    }),
  }),
});

export type SpecWatchConfig = z.infer<typeof SpecWatchConfigSchema>;

// API Response Schemas
export const ApiResponseSchema = z.object({
  success: z.boolean(),
  data: z.unknown().optional(),
  error: z.string().optional(),
  timestamp: z.string().datetime(),
  request_id: z.string().min(1),
});

export type ApiResponse = z.infer<typeof ApiResponseSchema>;

export const PaginatedResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(z.unknown()),
  pagination: z.object({
    page: z.number().int().positive(),
    limit: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    total_pages: z.number().int().positive(),
  }),
  timestamp: z.string().datetime(),
  request_id: z.string().min(1),
});

export type PaginatedResponse = z.infer<typeof PaginatedResponseSchema>;
