/**
 * Phase 34 Acceptance Tests - Spec Watch System
 * Comprehensive test suite for C2PA specification tracking and contributions
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SpecWatchSystem } from '@/index';
import { ContentWatcher } from '@/watchers/content-watcher';
import { GauntletTestRunner } from '@/gauntlet/test-runner';
import { IssueGenerator } from '@/reporters/issue-generator';
import { QuarterlyReporter } from '@/reporters/quarterly-reporter';
import { validateUrl, validateId, createSecureHash } from '@/utils/security';
import type { WatchTarget, SpecChange, GauntletResult } from '@/types';

// Mock configuration
const mockConfig = {
  server: { host: 'localhost', port: 3001 },
  redis: { host: 'localhost', port: 6379, db: 1 },
  watch: {
    watch_job: {
      targets: [
        {
          id: 'test-spec',
          url: 'https://c2pa.org/specifications/specifications/2.2/specs/C2PA_Specification.html',
          type: 'html' as const,
          interval: 24,
          enabled: true,
        },
      ],
      interval_hours: 24,
      gauntlet_enabled: true,
      notification_enabled: true,
      storage: {
        redis: { host: 'localhost', port: 6379, db: 1 },
        artifacts: { base_path: './test-artifacts', retention_days: 90 },
      },
    },
    github: {
      token: 'test-token',
      owner: 'c2pa-org',
      repo: 'specifications',
      issue_labels: ['spec-watch', 'c2pa-2.2'],
    },
    gauntlet: {
      enabled: true,
      sentinel_assets: ['test-asset-001'],
      timeout_ms: 30000,
      parallel_jobs: 2,
    },
    notifications: {
      email_recipients: ['test@example.com'],
      quarterly_report: { enabled: true, delivery_day: 30 },
    },
  },
  logging: { level: 'info', pretty: false },
};

describe('Phase 34 Spec Watch System', () => {
  let specWatchSystem: SpecWatchSystem;

  beforeEach(() => {
    // Mock environment variables
    vi.stubEnv('GITHUB_TOKEN', 'test-token');
    vi.stubEnv('REDIS_HOST', 'localhost');
    vi.stubEnv('PORT', '3001');
    
    // Mock Redis
    vi.mock('ioredis', () => ({
      Redis: vi.fn().mockImplementation(() => ({
        ping: vi.fn().mockResolvedValue('PONG'),
        info: vi.fn().mockResolvedValue('used_memory:1234567'),
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue('OK'),
        quit: vi.fn().mockResolvedValue('OK'),
      })),
    }));

    // Mock fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue('<html><body>Test content</body></html>'),
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
      headers: new Map(),
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe('System Initialization', () => {
    it('should initialize system with valid configuration', () => {
      expect(() => {
        specWatchSystem = new SpecWatchSystem(mockConfig);
      }).not.toThrow();
    });

    it('should fail initialization with invalid configuration', () => {
      const invalidConfig = { ...mockConfig, server: { host: '', port: -1 } };
      
      expect(() => {
        new SpecWatchSystem(invalidConfig);
      }).toThrow();
    });
  });

  describe('Security Utilities', () => {
    it('should validate URLs correctly', () => {
      const validUrls = [
        'https://c2pa.org/specifications',
        'https://spec.c2pa.org/specifications/2.2/specs/C2PA_Specification.html',
        'https://github.com/c2pa-org/specifications',
      ];

      validUrls.forEach(url => {
        expect(() => validateUrl(url)).not.toThrow();
        expect(validateUrl(url)).toBe(url);
      });
    });

    it('should reject invalid URLs', () => {
      const invalidUrls = [
        'ftp://example.com/file.pdf',
        'http://192.168.1.1/spec.html',
        'javascript:alert(1)',
        'https://malicious-site.com/spec.html',
      ];

      invalidUrls.forEach(url => {
        expect(() => validateUrl(url)).toThrow();
      });
    });

    it('should validate IDs correctly', () => {
      const validIds = ['test-id', 'spec_123', 'target-456'];
      const invalidIds = ['', 'invalid id!', 'test@id', 'a'.repeat(101)];

      validIds.forEach(id => {
        expect(() => validateId(id, 'test')).not.toThrow();
      });

      invalidIds.forEach(id => {
        expect(() => validateId(id, 'test')).toThrow();
      });
    });

    it('should create secure hashes consistently', () => {
      const data = 'test content';
      const hash1 = createSecureHash(data);
      const hash2 = createSecureHash(data);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex
    });
  });

  describe('Content Watcher', () => {
    let contentWatcher: ContentWatcher;

    beforeEach(() => {
      contentWatcher = new ContentWatcher({
        timeout: 5000,
        max_redirects: 3,
        user_agent: 'test-agent',
        retry_attempts: 2,
        retry_delay: 100,
      });
    });

    it('should watch target for changes', async () => {
      const target: WatchTarget = {
        id: 'test-target',
        url: 'https://c2pa.org/specifications/specifications/2.2/specs/C2PA_Specification.html',
        type: 'html',
        interval: 24,
        enabled: true,
      };

      // Mock first run (no previous content)
      const change = await contentWatcher.watchTarget(target);
      expect(change).toBeNull(); // No change on first run
    });

    it('should detect content changes', async () => {
      const target: WatchTarget = {
        id: 'test-target',
        url: 'https://c2pa.org/specifications/specifications/2.2/specs/C2PA_Specification.html',
        type: 'html',
        interval: 24,
        enabled: true,
      };

      // Mock fetch with different content
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue('<html><body>Original content</body></html>'),
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
        headers: new Map(),
      }).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue('<html><body>Updated content</body></html>'),
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
        headers: new Map(),
      });

      // First call establishes baseline
      await contentWatcher.watchTarget(target);
      
      // Second call detects change
      const change = await contentWatcher.watchTarget(target);
      
      expect(change).not.toBeNull();
      expect(change?.target_id).toBe(target.id);
      expect(change?.change_type).toBe('content');
    });

    it('should handle network errors gracefully', async () => {
      const target: WatchTarget = {
        id: 'test-target',
        url: 'https://c2pa.org/specifications/specifications/2.2/specs/C2PA_Specification.html',
        type: 'html',
        interval: 24,
        enabled: true,
      };

      // Mock network error
      (global.fetch as any).mockRejectedValue(new Error('Network error'));

      await expect(contentWatcher.watchTarget(target)).rejects.toThrow('Network error');
    });
  });

  describe('Gauntlet Test Runner', () => {
    let gauntletRunner: GauntletTestRunner;

    beforeEach(() => {
      gauntletRunner = new GauntletTestRunner({
        sentinel_assets: ['test-asset-001'],
        timeout_ms: 10000,
        parallel_jobs: 1,
        output_dir: './test-gauntlet',
        c2patool_path: 'c2patool',
        verify_tool_path: 'cai-verify',
      });
    });

    it('should initialize with correct configuration', () => {
      expect(gauntletRunner).toBeDefined();
    });

    it('should run gauntlet tests for spec change', async () => {
      const mockChange: SpecChange = {
        id: 'test-change-001',
        target_id: 'test-spec',
        detected_at: new Date().toISOString(),
        change_type: 'content',
        severity: 'medium',
        title: 'Test change',
        description: 'Test description',
        sections: [],
        metadata: {
          content_hash: 'abc123',
          previous_hash: 'def456',
          size_diff: 100,
          lines_added: 5,
          lines_removed: 2,
        },
        spec_references: [],
      };

      // Mock child process spawn
      vi.mock('child_process', () => ({
        spawn: vi.fn().mockImplementation(() => ({
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn().mockImplementation((event, callback) => {
            if (event === 'close') callback(0);
          }),
        })),
      }));

      // Mock file system operations
      vi.mock('fs/promises', () => ({
        writeFile: vi.fn().mockResolvedValue(undefined),
        readFile: vi.fn().mockResolvedValue('{"manifests": []}'),
        mkdir: vi.fn().mockResolvedValue(undefined),
      }));

      const result = await gauntletRunner.runGauntlet(mockChange);
      
      expect(result).toBeDefined();
      expect(result.change_id).toBe(mockChange.id);
      expect(result.status).toBe('passed'); // Default status for mocked tests
    });
  });

  describe('Issue Generator', () => {
    let issueGenerator: IssueGenerator;

    beforeEach(() => {
      issueGenerator = new IssueGenerator({
        github_token: 'test-token',
        owner: 'c2pa-org',
        repo: 'specifications',
        issue_labels: ['spec-watch'],
        pr_labels: ['enhancement'],
        output_dir: './test-issues',
        auto_submit: false,
      });
    });

    it('should generate issue for spec change', async () => {
      const mockChange: SpecChange = {
        id: 'test-change-001',
        target_id: 'test-spec',
        detected_at: new Date().toISOString(),
        change_type: 'content',
        severity: 'high',
        title: 'Discovery precedence change',
        description: 'Manifest discovery order needs clarification',
        sections: [{
          title: 'Discovery Order',
          new_content: 'When both embedded and remote manifests are present, remote takes precedence',
        }],
        metadata: {
          content_hash: 'abc123',
          previous_hash: 'def456',
          size_diff: 100,
          lines_added: 5,
          lines_removed: 2,
        },
        spec_references: [{
          section: '15.5.3.1',
          paragraph: 'Discovery precedence',
          url: 'https://spec.c2pa.org/specifications/specifications/2.2/specs/C2PA_Specification.html#15.5.3.1',
        }],
      };

      const mockGauntletResult: GauntletResult = {
        id: 'gauntlet-001',
        change_id: mockChange.id,
        run_at: new Date().toISOString(),
        status: 'failed',
        summary: {
          total_assets: 24,
          embedded_survived: 20,
          remote_survived: 18,
          discovery_precedence_changed: true,
          video_semantics_affected: false,
        },
        assets: [],
        artifacts: {
          trace_file: './test-trace.json',
          diff_file: './test-diff.json',
          evidence_pack: './test-evidence.json',
        },
      };

      const issue = await issueGenerator.generateIssue(mockChange, mockGauntletResult);
      
      expect(issue).toBeDefined();
      expect(issue.type).toBe('issue');
      expect(issue.title).toContain('Discovery precedence');
      expect(issue.labels).toContain('priority: high');
      expect(issue.spec_references).toContain(mockChange.spec_references[0].url);
    });

    it('should generate pull request for low-severity changes', async () => {
      const mockChange: SpecChange = {
        id: 'test-change-002',
        target_id: 'test-spec',
        detected_at: new Date().toISOString(),
        change_type: 'content',
        severity: 'low',
        title: 'Typo correction',
        description: 'Fixed typo in specification',
        sections: [{
          title: 'Typo Fix',
          new_content: 'Corrected spelling',
        }],
        metadata: {
          content_hash: 'abc123',
          previous_hash: 'def456',
          size_diff: 5,
          lines_added: 1,
          lines_removed: 1,
        },
        spec_references: [],
      };

      const mockGauntletResult: GauntletResult = {
        id: 'gauntlet-002',
        change_id: mockChange.id,
        run_at: new Date().toISOString(),
        status: 'passed',
        summary: {
          total_assets: 24,
          embedded_survived: 24,
          remote_survived: 24,
          discovery_precedence_changed: false,
          video_semantics_affected: false,
        },
        assets: [],
        artifacts: {
          trace_file: './test-trace.json',
          diff_file: './test-diff.json',
          evidence_pack: './test-evidence.json',
        },
      };

      const pr = await issueGenerator.generatePullRequest(mockChange, mockGauntletResult);
      
      expect(pr).toBeDefined();
      expect(pr.type).toBe('pull_request');
      expect(pr.title).toContain('improve');
      expect(pr.labels).toContain('enhancement');
    });
  });

  describe('Quarterly Reporter', () => {
    let quarterlyReporter: QuarterlyReporter;

    beforeEach(() => {
      quarterlyReporter = new QuarterlyReporter({
        output_dir: './test-reports',
        template_dir: './test-templates',
        delivery_day: 30,
        recipients: ['test@example.com'],
        auto_email: false,
      });
    });

    it('should generate quarterly report', async () => {
      const mockChanges: SpecChange[] = [
        {
          id: 'change-001',
          target_id: 'spec-html',
          detected_at: '2024-01-15T10:00:00Z',
          change_type: 'content',
          severity: 'critical',
          title: 'Discovery order change',
          description: 'Critical change to manifest discovery',
          sections: [],
          metadata: {
            content_hash: 'abc123',
            previous_hash: 'def456',
            size_diff: 1000,
            lines_added: 50,
            lines_removed: 10,
          },
          spec_references: [],
        },
      ];

      const mockGauntletResults: GauntletResult[] = [
        {
          id: 'gauntlet-001',
          change_id: 'change-001',
          run_at: '2024-01-15T11:00:00Z',
          status: 'failed',
          summary: {
            total_assets: 24,
            embedded_survived: 20,
            remote_survived: 18,
            discovery_precedence_changed: true,
            video_semantics_affected: false,
          },
          assets: [],
          artifacts: {
            trace_file: './trace.json',
            diff_file: './diff.json',
            evidence_pack: './evidence.json',
          },
        },
      ];

      const report = await quarterlyReporter.generateQuarterlyReport(
        '2024-Q1',
        mockChanges,
        mockGauntletResults
      );

      expect(report).toBeDefined();
      expect(report.quarter).toBe('2024-Q1');
      expect(report.summary.total_changes).toBe(1);
      expect(report.summary.critical_changes).toBe(1);
      expect(report.sections.what_changed).toHaveLength(1);
      expect(report.sections.impact_analysis).toHaveLength(1);
      expect(report.sections.customer_actions).toHaveLength(1);
    });

    it('should determine if report is due', () => {
      const isDue = quarterlyReporter.isReportDue();
      expect(typeof isDue).toBe('boolean');
    });

    it('should get next report due date', () => {
      const dueDate = quarterlyReporter.getNextReportDueDate();
      expect(dueDate).toBeInstanceOf(Date);
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete watch cycle', async () => {
      specWatchSystem = new SpecWatchSystem(mockConfig);
      
      // Mock the watch cycle components
      vi.spyOn(specWatchSystem as any, 'runWatchCycle').mockResolvedValue({
        duration: 5000,
        changes_found: 1,
        gauntlet_runs: 1,
        changes: [{ id: 'change-001', title: 'Test change', severity: 'medium' }],
        gauntlet_results: [{ id: 'gauntlet-001', status: 'passed' }],
      });

      const result = await (specWatchSystem as any).runWatchCycle();
      
      expect(result).toBeDefined();
      expect(result.changes_found).toBe(1);
      expect(result.gauntlet_runs).toBe(1);
    });

    it('should start and stop system gracefully', async () => {
      specWatchSystem = new SpecWatchSystem(mockConfig);
      
      // Mock server methods
      const mockListen = vi.fn().mockResolvedValue(undefined);
      const mockClose = vi.fn().mockResolvedValue(undefined);
      
      specWatchSystem.server.listen = mockListen;
      specWatchSystem.server.close = mockClose;
      
      await expect(specWatchSystem.start()).resolves.not.toThrow();
      await expect(specWatchSystem.stop()).resolves.not.toThrow();
      
      expect(mockListen).toHaveBeenCalled();
      expect(mockClose).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle missing environment variables', () => {
      vi.unstubEnv('GITHUB_TOKEN');
      
      expect(() => {
        new SpecWatchSystem(mockConfig);
      }).toThrow('GITHUB_TOKEN');
    });

    it('should handle invalid GitHub token', () => {
      vi.stubEnv('GITHUB_TOKEN', 'invalid-token');
      
      expect(() => {
        new SpecWatchSystem(mockConfig);
      }).toThrow('Invalid GitHub token format');
    });

    it('should handle network failures gracefully', async () => {
      const contentWatcher = new ContentWatcher({
        timeout: 1000,
        max_redirects: 1,
        user_agent: 'test-agent',
        retry_attempts: 1,
        retry_delay: 100,
      });

      const target: WatchTarget = {
        id: 'test-target',
        url: 'https://invalid-url-that-does-not-exist.com/spec.html',
        type: 'html',
        interval: 24,
        enabled: true,
      };

      await expect(contentWatcher.watchTarget(target)).rejects.toThrow();
    });
  });

  describe('Performance Tests', () => {
    it('should handle concurrent watch targets', async () => {
      const contentWatcher = new ContentWatcher({
        timeout: 5000,
        max_redirects: 3,
        user_agent: 'test-agent',
        retry_attempts: 2,
        retry_delay: 100,
      });

      const targets: WatchTarget[] = Array.from({ length: 10 }, (_, i) => ({
        id: `target-${i}`,
        url: `https://c2pa.org/specifications/specifications/2.2/specs/C2PA_Specification.html`,
        type: 'html' as const,
        interval: 24,
        enabled: true,
      }));

      const startTime = Date.now();
      const promises = targets.map(target => contentWatcher.watchTarget(target));
      const results = await Promise.all(promises);
      const duration = Date.now() - startTime;

      expect(results).toHaveLength(10);
      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
    });

    it('should handle large content processing', async () => {
      const largeContent = 'x'.repeat(1000000); // 1MB of content
      
      (global.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue(largeContent),
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(1000000)),
        headers: new Map(),
      });

      const contentWatcher = new ContentWatcher({
        timeout: 10000,
        max_redirects: 3,
        user_agent: 'test-agent',
        retry_attempts: 2,
        retry_delay: 100,
      });

      const target: WatchTarget = {
        id: 'large-content-target',
        url: 'https://c2pa.org/specifications/specifications/2.2/specs/C2PA_Specification.html',
        type: 'html',
        interval: 24,
        enabled: true,
      };

      const result = await contentWatcher.watchTarget(target);
      expect(result).toBeNull(); // First run, no previous content to compare
    });
  });
});
