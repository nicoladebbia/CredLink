/**
 * Robots.txt Compliance Checker - Phase 33 Reverse Lab
 * RFC 9309 compliant robots.txt parsing and compliance checking
 */

import type { RobotsCompliance } from '@/types/index.js';
import { validateUrl } from '@/utils/security.js';

export interface RobotsCheckerConfig {
  cacheTtl: number; // milliseconds
  defaultDelay: number; // milliseconds
  maxDelay: number; // milliseconds
  userAgent: string;
}

interface ParsedRobots {
  allowed: boolean;
  crawlDelay: number;
  disallowedPaths: string[];
  allowedPaths: string[];
  userAgent: string;
  lastChecked: number;
}

export class RobotsComplianceChecker {
  private config: RobotsCheckerConfig;
  private cache = new Map<string, ParsedRobots>();

  constructor(config: RobotsCheckerConfig) {
    this.config = config;
  }

  async checkCompliance(baseUrl: string): Promise<RobotsCompliance> {
    const now = Date.now();
    const cached = this.cache.get(baseUrl);
    
    // Return cached result if still valid
    if (cached && (now - cached.lastChecked) < this.config.cacheTtl) {
      return {
        allowed: cached.allowed,
        crawlDelay: cached.crawlDelay,
        disallowedPaths: cached.disallowedPaths,
        allowedPaths: cached.allowedPaths,
        userAgent: cached.userAgent,
        lastChecked: new Date(cached.lastChecked).toISOString(),
      };
    }

    try {
      const robots = await this.parseRobotsTxt(baseUrl);
      this.cache.set(baseUrl, robots);
      
      return {
        allowed: robots.allowed,
        crawlDelay: robots.crawlDelay,
        disallowedPaths: robots.disallowedPaths,
        allowedPaths: robots.allowedPaths,
        userAgent: robots.userAgent,
        lastChecked: new Date(robots.lastChecked).toISOString(),
      };
    } catch (error) {
      // If we can't fetch robots.txt, assume conservative behavior
      const conservative: RobotsCompliance = {
        allowed: false,
        crawlDelay: this.config.maxDelay,
        disallowedPaths: ['/'],
        allowedPaths: [],
        userAgent: this.config.userAgent,
        lastChecked: new Date().toISOString(),
      };
      
      this.cache.set(baseUrl, {
        allowed: conservative.allowed,
        crawlDelay: conservative.crawlDelay || 0,
        disallowedPaths: conservative.disallowedPaths,
        allowedPaths: conservative.allowedPaths,
        userAgent: conservative.userAgent || this.config.userAgent,
        lastChecked: now,
      });
      
      return conservative;
    }
  }

  private async parseRobotsTxt(baseUrl: string): Promise<ParsedRobots> {
    // Validate base URL to prevent SSRF
    const validatedBaseUrl = validateUrl(baseUrl);
    const robotsUrl = new URL('/robots.txt', validatedBaseUrl);
    
    try {
      const response = await fetch(robotsUrl.toString(), {
        method: 'GET',
        headers: {
          'User-Agent': this.config.userAgent,
          'Accept': 'text/plain',
        },
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      if (!response.ok) {
        // If robots.txt doesn't exist or is not accessible, allow crawling
        return {
          allowed: true,
          crawlDelay: this.config.defaultDelay,
          disallowedPaths: [],
          allowedPaths: [],
          userAgent: this.config.userAgent,
          lastChecked: Date.now(),
        };
      }

      const text = await response.text();
      return this.parseRobotsText(text);
    } catch (error) {
      // Network errors - assume conservative
      return {
        allowed: false,
        crawlDelay: this.config.maxDelay,
        disallowedPaths: ['/'],
        allowedPaths: [],
        userAgent: this.config.userAgent,
        lastChecked: Date.now(),
      };
    }
  }

  private parseRobotsText(text: string): ParsedRobots {
    const lines = text.split('\n');
    let currentAgent = '';
    let ourAgentRules = false;
    
    const result: ParsedRobots = {
      allowed: true,
      crawlDelay: this.config.defaultDelay,
      disallowedPaths: [],
      allowedPaths: [],
      userAgent: this.config.userAgent,
      lastChecked: Date.now(),
    };

    for (const line of lines) {
      const trimmed = line.trim();
      
      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      // Parse key-value pairs
      const separatorIndex = trimmed.indexOf(':');
      if (separatorIndex === -1) {
        continue;
      }

      const key = trimmed.substring(0, separatorIndex).trim().toLowerCase();
      const value = trimmed.substring(separatorIndex + 1).trim();

      switch (key) {
        case 'user-agent':
          currentAgent = value.toLowerCase();
          ourAgentRules = currentAgent === '*' || 
                         currentAgent === this.config.userAgent.toLowerCase() ||
                         this.config.userAgent.toLowerCase().includes(currentAgent);
          break;

        case 'disallow':
          if (ourAgentRules && value) {
            const path = this.normalizePath(value);
            if (path === '/') {
              result.allowed = false;
            }
            result.disallowedPaths.push(path);
          }
          break;

        case 'allow':
          if (ourAgentRules && value) {
            const path = this.normalizePath(value);
            result.allowedPaths.push(path);
          }
          break;

        case 'crawl-delay':
          if (ourAgentRules && value) {
            const delay = parseFloat(value);
            if (!isNaN(delay) && delay >= 0) {
              result.crawlDelay = Math.min(
                Math.max(delay * 1000, this.config.defaultDelay), // Convert to ms
                this.config.maxDelay
              );
            }
          }
          break;

        case 'sitemap':
          // Ignore sitemap directives for compliance checking
          break;

        default:
          // Ignore unknown directives
          break;
      }
    }

    // Sort paths by specificity (longer paths first)
    result.disallowedPaths.sort((a, b) => b.length - a.length);
    result.allowedPaths.sort((a, b) => b.length - a.length);

    return result;
  }

  private normalizePath(path: string): string {
    // Remove query parameters and fragments
    const cleanPath = path.split('?')[0]?.split('#')[0];
    
    if (!cleanPath || !cleanPath.startsWith('/')) {
      return cleanPath || '/';
    }
    return cleanPath;
  }

  isPathAllowed(path: string, baseUrl: string): boolean {
    const compliance = this.cache.get(baseUrl);
    if (!compliance) {
      return false;
    }

    const normalizedPath = this.normalizePath(path);

    // Check explicit allows first (more specific)
    for (const allowedPath of compliance.allowedPaths) {
      if (this.pathMatches(normalizedPath, allowedPath)) {
        return true;
      }
    }

    // Check disallows
    for (const disallowedPath of compliance.disallowedPaths) {
      if (this.pathMatches(normalizedPath, disallowedPath)) {
        return false;
      }
    }

    // Default to allowed if no rules match
    return compliance.allowed;
  }

  private pathMatches(path: string, pattern: string): boolean {
    // Exact match
    if (path === pattern) {
      return true;
    }

    // Pattern ends with wildcard
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      return path.startsWith(prefix);
    }

    // Pattern is a prefix match
    if (path.startsWith(pattern)) {
      // If pattern ends with /, it matches subdirectories
      if (pattern.endsWith('/')) {
        return true;
      }
      
      // Otherwise, must match full path segment
      const remainingPath = path.slice(pattern.length);
      return remainingPath === '' || remainingPath.startsWith('/');
    }

    return false;
  }

  getCrawlDelay(baseUrl: string): number {
    const compliance = this.cache.get(baseUrl);
    return compliance ? compliance.crawlDelay : this.config.maxDelay;
  }

  clearCache(): void {
    this.cache.clear();
  }

  getCacheSize(): number {
    return this.cache.size;
  }

  getCachedUrls(): string[] {
    return Array.from(this.cache.keys());
  }
}
