/**
 * Provider Documentation Adapters - Phase 33 Reverse Lab
 * Scrapes provider documentation for context pointers and evidence
 */

import type { Provider } from '@/types/index.js';

export interface DocAdapter {
  providerId: string;
  name: string;
  baseUrl: string;
  docs: {
    reference?: string;
    blog?: string;
    changelog?: string;
  };
}

export interface DocSnapshot {
  providerId: string;
  capturedAt: string;
  pages: Array<{
    url: string;
    title: string;
    content: string;
    metadata: Record<string, any>;
  }>;
  metadata: {
    totalPages: number;
    totalSize: number;
    hash: string;
  };
}

export class DocumentationAdapter {
  private adapters: Map<string, DocAdapter>;
  private cache = new Map<string, DocSnapshot>();

  constructor() {
    this.adapters = new Map();
    this.initializeAdapters();
  }

  private initializeAdapters(): void {
    // Cloudflare Images
    this.adapters.set('cloudflare-images', {
      providerId: 'cloudflare-images',
      name: 'Cloudflare Images',
      baseUrl: 'https://developers.cloudflare.com',
      docs: {
        reference: 'https://developers.cloudflare.com/images/image-resizing/format-and-quality/',
        blog: 'https://blog.cloudflare.com/announcing-support-for-c2pa-content-credentials/',
        changelog: 'https://developers.cloudflare.com/images/changelog/',
      },
    });

    // Fastly IO
    this.adapters.set('fastly-io', {
      providerId: 'fastly-io',
      name: 'Fastly Image Optimizer',
      baseUrl: 'https://www.fastly.com',
      docs: {
        reference: 'https://www.fastly.com/documentation/reference/io/',
        changelog: 'https://www.fastly.com/documentation/changelog/',
      },
    });

    // Akamai IVM
    this.adapters.set('akamai-ivm', {
      providerId: 'akamai-ivm',
      name: 'Akamai Image and Video Manager',
      baseUrl: 'https://techdocs.akamai.com',
      docs: {
        reference: 'https://techdocs.akamai.com/ivm/docs',
        changelog: 'https://techdocs.akamai.com/ivm/docs/release-notes',
      },
    });

    // Cloudinary
    this.adapters.set('cloudinary', {
      providerId: 'cloudinary',
      name: 'Cloudinary',
      baseUrl: 'https://cloudinary.com',
      docs: {
        reference: 'https://cloudinary.com/documentation/image_transformation_reference',
        blog: 'https://cloudinary.com/blog/content-authenticity-initiative-c2pa-support',
        changelog: 'https://cloudinary.com/documentation/changelog',
      },
    });

    // Imgix
    this.adapters.set('imgix', {
      providerId: 'imgix',
      name: 'Imgix',
      baseUrl: 'https://docs.imgix.com',
      docs: {
        reference: 'https://docs.imgix.com/apis/url/format/format',
        changelog: 'https://docs.imgix.com/changelog',
      },
    });
  }

  async captureDocumentation(providerId: string): Promise<DocSnapshot> {
    const adapter = this.adapters.get(providerId);
    if (!adapter) {
      throw new Error(`No adapter found for provider: ${providerId}`);
    }

    const cacheKey = `${providerId}-${Math.floor(Date.now() / (1000 * 60 * 60 * 24))}`; // Daily cache
    
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const snapshot: DocSnapshot = {
      providerId,
      capturedAt: new Date().toISOString(),
      pages: [],
      metadata: {
        totalPages: 0,
        totalSize: 0,
        hash: '',
      },
    };

    try {
      // Capture reference documentation
      if (adapter.docs.reference) {
        const page = await this.capturePage(adapter.docs.reference, 'reference');
        snapshot.pages.push(page);
      }

      // Capture blog posts
      if (adapter.docs.blog) {
        const page = await this.capturePage(adapter.docs.blog, 'blog');
        snapshot.pages.push(page);
      }

      // Capture changelog
      if (adapter.docs.changelog) {
        const page = await this.capturePage(adapter.docs.changelog, 'changelog');
        snapshot.pages.push(page);
      }

      // Calculate metadata
      snapshot.metadata.totalPages = snapshot.pages.length;
      snapshot.metadata.totalSize = snapshot.pages.reduce((sum, page) => sum + page.content.length, 0);
      snapshot.metadata.hash = this.calculateSnapshotHash(snapshot);

      // Cache the snapshot
      this.cache.set(cacheKey, snapshot);

    } catch (error) {
      console.error(`Failed to capture documentation for ${providerId}:`, error);
      throw error;
    }

    return snapshot;
  }

  private async capturePage(url: string, type: string): Promise<DocSnapshot['pages'][0]> {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'C2PA-Reverse-Lab/1.1.0 (+https://github.com/Nickiller04/c2-concierge)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'Cache-Control': 'max-age=3600',
        },
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();
      const { title, content, metadata } = this.parseHtml(html);

      return {
        url,
        title,
        content,
        metadata: {
          type,
          capturedAt: new Date().toISOString(),
          ...metadata,
        },
      };

    } catch (error) {
      throw new Error(`Failed to capture page ${url}: ${error.message}`);
    }
  }

  private parseHtml(html: string): { title: string; content: string; metadata: Record<string, any> } {
    // Simple HTML parsing (in production, would use a proper HTML parser)
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : 'Untitled';

    // Extract main content (simplified)
    const contentMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i) ||
                         html.match(/<article[^>]*>([\s\S]*?)<\/article>/i) ||
                         html.match(/<div[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);

    let content = contentMatch ? this.stripHtml(contentMatch[1]) : '';
    
    // If no main content found, extract all text
    if (!content) {
      content = this.stripHtml(html);
    }

    // Extract metadata
    const metadata: Record<string, any> = {};
    
    // Extract meta description
    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i);
    if (descMatch) {
      metadata.description = descMatch[1];
    }

    // Extract last modified date if available
    const modifiedMatch = html.match(/<meta[^>]*name=["']last-modified["'][^>]*content=["']([^"']+)["'][^>]*>/i);
    if (modifiedMatch) {
      metadata.lastModified = modifiedMatch[1];
    }

    // Look for C2PA-related keywords
    const c2paKeywords = ['c2pa', 'content credentials', 'content authenticity', 'manifest', 'jumbf'];
    const foundKeywords = c2paKeywords.filter(keyword => 
      content.toLowerCase().includes(keyword.toLowerCase())
    );
    
    if (foundKeywords.length > 0) {
      metadata.c2paKeywords = foundKeywords;
    }

    return { title, content, metadata };
  }

  private stripHtml(html: string): string {
    // Remove HTML tags and normalize whitespace
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private calculateSnapshotHash(snapshot: DocSnapshot): string {
    const crypto = require('crypto');
    const data = JSON.stringify({
      providerId: snapshot.providerId,
      capturedAt: snapshot.capturedAt,
      pages: snapshot.pages.map(p => ({
        url: p.url,
        title: p.title,
        content: p.content.substring(0, 1000), // First 1000 chars for hash
      })),
    });

    return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16);
  }

  async searchDocumentation(providerId: string, query: string): Promise<Array<{
    url: string;
    title: string;
    snippet: string;
    relevanceScore: number;
  }>> {
    const snapshot = await this.captureDocumentation(providerId);
    const results: Array<{
      url: string;
      title: string;
      snippet: string;
      relevanceScore: number;
    }> = [];

    const queryTerms = query.toLowerCase().split(' ').filter(term => term.length > 2);

    for (const page of snapshot.pages) {
      const content = page.content.toLowerCase();
      const title = page.title.toLowerCase();
      
      // Calculate relevance score
      let score = 0;
      
      // Title matches are worth more
      for (const term of queryTerms) {
        if (title.includes(term)) {
          score += 10;
        }
        if (content.includes(term)) {
          score += 1;
        }
      }

      if (score > 0) {
        // Extract snippet around first match
        const firstMatch = this.findSnippet(content, queryTerms[0]);
        
        results.push({
          url: page.url,
          title: page.title,
          snippet: firstMatch,
          relevanceScore: score,
        });
      }
    }

    // Sort by relevance score
    return results.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  private findSnippet(content: string, term: string): string {
    const index = content.indexOf(term);
    if (index === -1) {
      return content.substring(0, 200) + '...';
    }

    const start = Math.max(0, index - 100);
    const end = Math.min(content.length, index + term.length + 100);
    
    let snippet = content.substring(start, end);
    
    if (start > 0) snippet = '...' + snippet;
    if (end < content.length) snippet = snippet + '...';
    
    return snippet;
  }

  async extractC2PAStatements(providerId: string): Promise<Array<{
    context: string;
    quote: string;
    url: string;
    timestamp: string;
  }>> {
    const snapshot = await this.captureDocumentation(providerId);
    const statements: Array<{
      context: string;
      quote: string;
      url: string;
      timestamp: string;
    }> = [];

    // C2PA-related patterns to look for
    const patterns = [
      /c2pa[^.!?]*[.!?]/gi,
      /content credentials[^.!?]*[.!?]/gi,
      /content authenticity[^.!?]*[.!?]/gi,
      /manifest[^.!?]*[.!?]/gi,
      /jumbf[^.!?]*[.!?]/gi,
    ];

    for (const page of snapshot.pages) {
      for (const pattern of patterns) {
        const matches = page.content.match(pattern);
        
        if (matches) {
          for (const match of matches) {
            const cleanMatch = match.trim();
            
            // Only include substantial statements
            if (cleanMatch.length > 20) {
              statements.push({
                context: page.title,
                quote: cleanMatch,
                url: page.url,
                timestamp: snapshot.capturedAt,
              });
            }
          }
        }
      }
    }

    return statements;
  }

  async detectDocumentationChanges(providerId: string, oldSnapshot?: DocSnapshot): Promise<{
    hasChanges: boolean;
    changes: Array<{
      type: 'content' | 'metadata' | 'structure';
      description: string;
      url?: string;
    }>;
  }> {
    const currentSnapshot = await this.captureDocumentation(providerId);
    
    if (!oldSnapshot) {
      return {
        hasChanges: false,
        changes: [],
      };
    }

    const changes: Array<{
      type: 'content' | 'metadata' | 'structure';
      description: string;
      url?: string;
    }> = [];

    // Check for hash changes
    if (oldSnapshot.metadata.hash !== currentSnapshot.metadata.hash) {
      changes.push({
        type: 'content',
        description: 'Documentation content has changed',
      });
    }

    // Check for page count changes
    if (oldSnapshot.metadata.totalPages !== currentSnapshot.metadata.totalPages) {
      changes.push({
        type: 'structure',
        description: `Page count changed from ${oldSnapshot.metadata.totalPages} to ${currentSnapshot.metadata.totalPages}`,
      });
    }

    // Check for individual page changes
    for (const currentPage of currentSnapshot.pages) {
      const oldPage = oldSnapshot.pages.find(p => p.url === currentPage.url);
      
      if (oldPage) {
        if (oldPage.title !== currentPage.title) {
          changes.push({
            type: 'metadata',
            description: `Title changed for ${currentPage.url}`,
            url: currentPage.url,
          });
        }
        
        if (Math.abs(oldPage.content.length - currentPage.content.length) > 500) {
          changes.push({
            type: 'content',
            description: `Content length changed significantly for ${currentPage.url}`,
            url: currentPage.url,
          });
        }
      } else {
        changes.push({
          type: 'structure',
          description: `New page added: ${currentPage.url}`,
          url: currentPage.url,
        });
      }
    }

    // Check for removed pages
    for (const oldPage of oldSnapshot.pages) {
      const currentPage = currentSnapshot.pages.find(p => p.url === oldPage.url);
      
      if (!currentPage) {
        changes.push({
          type: 'structure',
          description: `Page removed: ${oldPage.url}`,
          url: oldPage.url,
        });
      }
    }

    return {
      hasChanges: changes.length > 0,
      changes,
    };
  }

  getAdapter(providerId: string): DocAdapter | undefined {
    return this.adapters.get(providerId);
  }

  listProviders(): string[] {
    return Array.from(this.adapters.keys());
  }

  clearCache(): void {
    this.cache.clear();
  }

  getCacheSize(): number {
    return this.cache.size;
  }
}
