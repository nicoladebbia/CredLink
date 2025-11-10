/**
 * Content Watcher - Phase 34 Spec Watch
 * Monitors C2PA specifications, guidance, and security documents for changes
 */

import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import pdfParse from 'pdf-parse';
import RSSParser from 'rss-parser';
import type { WatchTarget, SpecChange } from '@/types';
import { validateUrl, createSecureHash, sanitizeContent, SECURITY_CONFIG } from '@/utils/security';

export interface ContentWatcherConfig {
  timeout: number;
  max_redirects: number;
  user_agent: string;
  retry_attempts: number;
  retry_delay: number;
}

export class ContentWatcher {
  private config: ContentWatcherConfig;
  // private octokit: Octokit;
  private rssParser: RSSParser;

  constructor(config: Partial<ContentWatcherConfig> = {}) {
    this.config = {
      timeout: 30000,
      max_redirects: 5,
      user_agent: 'Mozilla/5.0 (compatible; C2PA-Spec-Watch/1.1.0)',
      retry_attempts: 3,
      retry_delay: 1000,
      ...config,
    };

    // this.octokit = new Octokit({
    //   auth: process.env['GITHUB_TOKEN'],
    //   userAgent: this.config.user_agent,
    // });

    this.rssParser = new RSSParser({
      timeout: this.config.timeout,
      customFields: {
        item: ['updated', 'published', 'category'],
      },
    });
  }

  /**
   * Watches a target for changes
   */
  async watchTarget(target: WatchTarget): Promise<SpecChange | null> {
    try {
      // Validate target URL
      const validatedUrl = validateUrl(target.url);
      
      // Get current content
      const currentContent = await this.fetchContent(validatedUrl, target);
      
      // Calculate content hash
      const currentHash = createSecureHash(currentContent);
      
      // Get previous hash from storage (simulated)
      const previousHash = await this.getPreviousHash(target.id);
      
      // Compare hashes
      if (previousHash && previousHash === currentHash) {
        return null; // No changes detected
      }

      // Analyze changes
      const change = await this.analyzeChanges(target, currentContent, previousHash);
      
      // Store new hash
      await this.storeHash(target.id, currentHash);
      
      return change;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to watch target ${target.id}: ${errorMessage}`);
    }
  }

  /**
   * Fetches content from a URL based on target type
   */
  private async fetchContent(url: string, target: WatchTarget): Promise<string> {
    // Sanitize and validate headers to prevent injection
    const sanitizedHeaders = this.sanitizeHeaders(target.headers);
    
    const headers = {
      'User-Agent': this.config.user_agent,
      'Accept': this.getAcceptHeader(target.type),
      ...sanitizedHeaders,
    };

    for (let attempt = 1; attempt <= this.config.retry_attempts; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers,
          timeout: this.config.timeout,
          redirect: 'manual',
        });

        // Handle redirects manually
        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get('location');
          if (location) {
            const redirectUrl = validateUrl(location);
            return this.fetchContent(redirectUrl, target);
          }
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // Process content based on type
        return await this.processContent(response, target);
      } catch (error) {
        if (attempt === this.config.retry_attempts) {
          throw error;
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, this.config.retry_delay * attempt));
      }
    }

    throw new Error('Max retry attempts exceeded');
  }

  /**
   * Processes response content based on target type
   */
  private async processContent(response: any, target: WatchTarget): Promise<string> {
    switch (target.type) {
      case 'html':
        const htmlContent = await response.text();
        const sanitizedHtml = sanitizeContent(htmlContent, SECURITY_CONFIG.MAX_CONTENT_SIZE);
        
        // Extract relevant content using selector
        if (target.selector) {
          const $ = cheerio.load(sanitizedHtml);
          const selectedContent = $(target.selector).text() || sanitizedHtml;
          return selectedContent.trim();
        }
        
        return sanitizedHtml;

      case 'pdf':
        const pdfBuffer = Buffer.from(await response.arrayBuffer());
        const pdfData = await pdfParse(pdfBuffer);
        return sanitizeContent(pdfData.text, SECURITY_CONFIG.MAX_CONTENT_SIZE);

      case 'rss':
        const rssText = await response.text();
        const sanitizedRss = sanitizeContent(rssText, SECURITY_CONFIG.MAX_CONTENT_SIZE);
        const feed = await this.rssParser.parseString(sanitizedRss);
        return JSON.stringify(feed.items);

      case 'github-api':
        const apiData = await response.json();
        return JSON.stringify(apiData);

      case 'changelog':
        const changelogContent = await response.text();
        const sanitizedChangelog = sanitizeContent(changelogContent, SECURITY_CONFIG.MAX_CONTENT_SIZE);
        
        // Extract changelog entries
        if (target.selector) {
          const $ = cheerio.load(sanitizedChangelog);
          const changelogEntries = $(target.selector).map((_, el) => $(el).text()).get();
          return changelogEntries.join('\n');
        }
        
        return sanitizedChangelog;

      default:
        const content = await response.text();
        return sanitizeContent(content, SECURITY_CONFIG.MAX_CONTENT_SIZE);
    }
  }

  /**
   * Analyzes changes between current and previous content
   */
  private async analyzeChanges(target: WatchTarget, currentContent: string, previousHash?: string): Promise<SpecChange> {
    const previousContent = previousHash ? await this.getPreviousContent(target.id) : '';
    
    // Perform diff analysis
    const changes = this.performDiff(previousContent, currentContent);
    
    // Determine severity based on content analysis
    const severity = this.determineSeverity(target, changes);
    
    // Extract spec references
    const specReferences = this.extractSpecReferences(currentContent, target.type);

    return {
      id: `change-${target.id}-${Date.now()}`,
      target_id: target.id,
      detected_at: new Date().toISOString(),
      change_type: this.detectChangeType(changes),
      severity,
      title: this.generateChangeTitle(target, changes),
      description: this.generateChangeDescription(changes),
      sections: changes.sections,
      metadata: {
        content_hash: createSecureHash(currentContent),
        previous_hash: previousHash || '',
        size_diff: changes.sizeDiff,
        lines_added: changes.linesAdded,
        lines_removed: changes.linesRemoved,
      },
      spec_references: specReferences,
    };
  }

  /**
   * Performs diff analysis between content versions
   */
  private performDiff(oldContent: string, newContent: string): any {
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    
    const sections: any[] = [];
    let linesAdded = 0;
    let linesRemoved = 0;
    let maxSize = 50; // Limit number of sections to prevent memory issues

    // Simple line-by-line diff
    for (let i = 0; i < Math.max(oldLines.length, newLines.length) && sections.length < maxSize; i++) {
      const oldLine = oldLines[i] || '';
      const newLine = newLines[i] || '';

      if (oldLine !== newLine) {
        sections.push({
          title: `Line ${i + 1}`,
          old_content: oldLine || undefined,
          new_content: newLine || undefined,
          context_before: oldLines[i - 1] || undefined,
          context_after: newLines[i + 1] || undefined,
        });

        if (oldLine && !newLine) linesRemoved++;
        if (!oldLine && newLine) linesAdded++;
      }
    }

    return {
      sections,
      sizeDiff: newContent.length - oldContent.length,
      linesAdded,
      linesRemoved,
    };
  }

  /**
   * Determines change severity based on content analysis
   */
  private determineSeverity(_target: WatchTarget, changes: any): 'low' | 'medium' | 'high' | 'critical' {
    const content = changes.sections.map((s: any) => s.new_content).join(' ').toLowerCase();
    
    // Critical changes affecting core functionality
    if (content.includes('discovery') || content.includes('manifest') || content.includes('remote')) {
      return 'critical';
    }
    
    // High changes affecting security or video
    if (content.includes('security') || content.includes('validation') || content.includes('video')) {
      return 'high';
    }
    
    // Medium changes affecting structure
    if (changes.linesAdded > 100 || changes.linesRemoved > 100) {
      return 'medium';
    }
    
    // Low changes
    return 'low';
  }

  /**
   * Detects the type of change
   */
  private detectChangeType(changes: any): 'content' | 'structure' | 'metadata' | 'hash' {
    if (changes.linesAdded === 0 && changes.linesRemoved === 0) {
      return 'hash';
    }
    
    if (changes.linesAdded > 50 || changes.linesRemoved > 50) {
      return 'structure';
    }
    
    return 'content';
  }

  /**
   * Generates a change title
   */
  private generateChangeTitle(target: WatchTarget, changes: any): string {
    const changeType = this.detectChangeType(changes);
    const severity = this.determineSeverity(target, changes);
    
    return `${severity.toUpperCase()}: ${target.id} - ${changeType} change detected`;
  }

  /**
   * Generates a change description
   */
  private generateChangeDescription(changes: any): string {
    return `Detected ${changes.linesAdded} lines added and ${changes.linesRemoved} lines removed. Total size change: ${changes.sizeDiff} bytes.`;
  }

  /**
   * Extracts specification references from content
   */
  private extractSpecReferences(content: string, _targetType: string): any[] {
    const references: any[] = [];
    
    // Extract section references like "§15.5.3.1"
    const sectionRegex = /§(\d+(?:\.\d+)*)/g;
    let match;
    
    while ((match = sectionRegex.exec(content)) !== null) {
      references.push({
        section: match[1],
        paragraph: '',
        url: `https://spec.c2pa.org/specifications/specifications/2.2/specs/C2PA_Specification.html#${match[1]}`,
      });
    }
    
    return references;
  }

  /**
   * Gets appropriate Accept header for target type
   */
  private getAcceptHeader(type: string): string {
    switch (type) {
      case 'html':
        return 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
      case 'pdf':
        return 'application/pdf,application/octet-stream';
      case 'rss':
        return 'application/rss+xml,application/xml;q=0.9,*/*;q=0.8';
      case 'github-api':
        return 'application/vnd.github.v3+json,application/json';
      default:
        return 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
    }
  }

  /**
   * Sanitizes headers to prevent injection attacks
   */
  private sanitizeHeaders(headers?: Record<string, string>): Record<string, string> {
    if (!headers) return {};
    
    const sanitized: Record<string, string> = {};
    const dangerousHeaders = [
      'host', 'connection', 'upgrade', 'proxy-authorization',
      'proxy-connection', 'te', 'trailer', 'transfer-encoding',
      'content-length', 'content-encoding', 'expect', 'max-forwards',
      'via', 'warning', 'forwarded', 'x-forwarded-for', 'x-forwarded-host',
      'x-forwarded-proto', 'x-real-ip', 'origin', 'referer'
    ];
    
    for (const [key, value] of Object.entries(headers)) {
      const lowerKey = key.toLowerCase();
      
      // Skip dangerous headers
      if (dangerousHeaders.includes(lowerKey)) {
        continue;
      }
      
      // Validate header name
      if (!/^[a-zA-Z0-9-]+$/.test(key)) {
        continue;
      }
      
      // Validate and sanitize header value
      if (typeof value !== 'string') {
        continue;
      }
      
      // Remove newline characters to prevent header injection
      const sanitizedValue = value.replace(/[\r\n]/g, '').trim();
      
      // Limit header value length
      if (sanitizedValue.length > 8192) {
        continue;
      }
      
      sanitized[key] = sanitizedValue;
    }
    
    return sanitized;
  }

  /**
   * Storage methods (simulated - in production would use Redis/database)
   */
  private async getPreviousHash(_targetId: string): Promise<string | undefined> {
    // Simulated storage - would use Redis in production
    return undefined;
  }

  private async storeHash(targetId: string, hash: string): Promise<void> {
    // Simulated storage - would use Redis in production
    console.log(`Stored hash for ${targetId}: ${hash}`);
  }

  private async getPreviousContent(_targetId: string): Promise<string> {
    // Simulated storage - would use file system or database in production
    return '';
  }
}
