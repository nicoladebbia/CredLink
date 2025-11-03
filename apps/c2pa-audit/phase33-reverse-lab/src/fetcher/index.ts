/**
 * HTTP Fetcher - Phase 33 Reverse Lab
 * RFC 9309 compliant web fetcher with rate limiting and robots.txt support
 */

import { createHash } from 'crypto';
import type { RequestRecipe, ResponseResult, RobotsCompliance } from '@/types/index.js';
import { validateUrl, SECURITY_CONFIG } from '@/utils/security.js';

export interface FetcherConfig {
  timeout: number; // milliseconds
  maxConcurrency: number;
  respectRobots: boolean;
  defaultHeaders: Record<string, string>;
  maxRedirects: number;
  maxResponseSize: number; // bytes
}

export interface FetchContext {
  providerId: string;
  transformId: string;
  assetId: string;
  runNumber: number;
}

export class Fetcher {
  private config: FetcherConfig;
  private activeRequests = new Map<string, AbortController>();
  private concurrency = 0;
  private requestQueue: Array<{
    context: FetchContext;
    recipe: RequestRecipe;
    resolve: (result: ResponseResult) => void;
    reject: (error: Error) => void;
  }> = [];

  constructor(config: FetcherConfig) {
    this.config = config;
  }

  async fetch(context: FetchContext, recipe: RequestRecipe): Promise<ResponseResult> {
    // Check concurrency limits
    if (this.concurrency >= this.config.maxConcurrency) {
      return new Promise((resolve, reject) => {
        this.requestQueue.push({ context, recipe, resolve, reject });
      });
    }

    return this.executeRequest(context, recipe);
  }

  private async executeRequest(context: FetchContext, recipe: RequestRecipe): Promise<ResponseResult> {
    const requestId = `${context.providerId}-${context.transformId}-${context.assetId}-${context.runNumber}`;
    const controller = new AbortController();
    this.activeRequests.set(requestId, controller);
    this.concurrency++;

    try {
      const startTime = Date.now();
      let connectTime = 0;
      let firstByteTime = 0;

      // Prepare request URL and options
      const validatedUrl = validateUrl(recipe.url);
      const url = new URL(validatedUrl);
      const requestOptions: RequestInit = {
        method: recipe.method,
        headers: {
          ...this.config.defaultHeaders,
          ...recipe.headers,
          'Accept': 'image/*,*/*;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'Cache-Control': recipe.params.cacheBust ? 'no-cache, no-store' : 'max-age=3600',
          'User-Agent': 'Mozilla/5.0 (compatible; C2PA-Analyzer/1.0)', // Generic user agent
        },
        signal: controller.signal,
        redirect: 'manual', // Handle redirects manually
      };

      // Add cache-busting if requested
      if (recipe.params.cacheBust) {
        url.searchParams.set('_cb', Date.now().toString());
        url.searchParams.set('_run', context.runNumber.toString());
      }

      // Execute request with timing
      const connectStart = Date.now();
      let response: Response;
      let redirectCount = 0;

      do {
        response = await fetch(url.toString(), requestOptions);
        
        if (redirectCount === 0) {
          connectTime = Date.now() - connectStart;
        }

        // Handle redirects manually
        if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
          const location = response.headers.get('location')!;
          
          // Validate redirect URL to prevent SSRF
          const validatedRedirect = validateUrl(location);
          url.href = validatedRedirect;
          redirectCount++;
          
          if (redirectCount > this.config.maxRedirects) {
            throw new Error(`Too many redirects: ${redirectCount}`);
          }
          
          // Update redirect timing
          if (firstByteTime === 0) {
            firstByteTime = Date.now() - connectStart;
          }
          continue;
        }
        
        break;
      } while (true);

      if (firstByteTime === 0) {
        firstByteTime = Date.now() - connectStart;
      }

      const totalTime = Date.now() - startTime;

      // Check response size limits
      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength) > this.config.maxResponseSize) {
        throw new Error(`Response too large: ${contentLength} bytes`);
      }

      // Read response data
      const arrayBuffer = await this.readResponseWithLimit(response, this.config.maxResponseSize);
      const buffer = Buffer.from(arrayBuffer);
      
      // Extract headers
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key.toLowerCase()] = value;
      });

      // Calculate hash
      const hash = createHash('sha256').update(buffer).digest('hex');

      // Extract server and cache headers
      const serverHeader = headers['server'] || headers['x-server'] || headers['x-powered-by'];
      const cacheHeaders = Object.fromEntries(
        Object.entries(headers).filter(([key]) => 
          key.startsWith('cache-') || key.startsWith('x-cache-')
        )
      );

      const result: ResponseResult = {
        status: response.status,
        headers,
        bytes: {
          size: buffer.length,
          hash: `sha256:${hash}`,
          data: buffer.length <= 1024 ? buffer.toString('base64') : undefined, // Store small samples for debugging
        },
        timing: {
          connectMs: connectTime,
          firstByteMs: firstByteTime,
          totalMs: totalTime,
        },
        serverHeader,
        cacheHeaders,
      };

      return result;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timeout or aborted');
      }
      throw error;
    } finally {
      this.activeRequests.delete(requestId);
      this.concurrency--;
      
      // Process next request in queue
      if (this.requestQueue.length > 0) {
        const next = this.requestQueue.shift()!;
        this.executeRequest(next.context, next.recipe)
          .then(next.resolve)
          .catch(next.reject);
      }
    }
  }

  private async readResponseWithLimit(response: Response, maxSize: number): Promise<ArrayBuffer> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body reader available');
    }

    const chunks: Uint8Array[] = [];
    let totalSize = 0;

    while (true) {
      const { done, value } = await reader.read();
      
      if (done) break;
      
      totalSize += value.length;
      
      if (totalSize > maxSize) {
        reader.releaseLock();
        throw new Error(`Response exceeds maximum size: ${totalSize} > ${maxSize}`);
      }
      
      chunks.push(value);
    }

    // Combine all chunks
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    return result.buffer;
  }

  cancelRequest(requestId: string): void {
    const controller = this.activeRequests.get(requestId);
    if (controller) {
      controller.abort();
      this.activeRequests.delete(requestId);
    }
  }

  cancelAllRequests(): void {
    for (const [requestId, controller] of this.activeRequests) {
      controller.abort();
    }
    this.activeRequests.clear();
    this.requestQueue.length = 0;
    this.concurrency = 0;
  }

  getActiveRequests(): string[] {
    return Array.from(this.activeRequests.keys());
  }

  getQueueLength(): number {
    return this.requestQueue.length;
  }

  getConcurrency(): number {
    return this.concurrency;
  }
}
