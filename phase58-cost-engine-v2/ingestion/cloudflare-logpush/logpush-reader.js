/**
 * Cloudflare Logpush Reader
 * Ingests HTTP request logs from Cloudflare Logpush
 *
 * Reference: https://developers.cloudflare.com/logs/get-started/enable-destinations/
 * Key fields: CacheCacheStatus, EdgeResponseBytes, ClientRequestPath
 *
 * CacheCacheStatus values: hit, miss, expired, stale, bypass, revalidated, updating, dynamic, ignored
 * Reference: https://developers.cloudflare.com/cache/concepts/cache-responses/
 */

import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { createLogger } from '../../src/utils/logger.js';
import { Readable } from 'stream';
import zlib from 'zlib';
import readline from 'readline';

const logger = createLogger('LogpushReader');

export class LogpushReader {
  constructor() {
    this.s3Client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1'
    });

    this.bucket = process.env.CLOUDFLARE_LOGPUSH_BUCKET;
    this.prefix = process.env.CLOUDFLARE_LOGPUSH_PREFIX || 'http-requests/';

    // Security: Validate configuration
    if (!this.bucket) {
      throw new Error('CLOUDFLARE_LOGPUSH_BUCKET environment variable is required');
    }

    // Security: Validate bucket name format
    if (
      !/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(this.bucket) ||
      this.bucket.length < 3 ||
      this.bucket.length > 63
    ) {
      throw new Error('Invalid AWS bucket name format');
    }

    // Security: Validate prefix to prevent directory traversal
    if (this.prefix.includes('..') || this.prefix.includes('~')) {
      throw new Error('Invalid prefix: path traversal characters detected');
    }

    // Cache status categories
    this.cacheBypass = ['bypass', 'dynamic', 'ignored'];
    this.cacheHit = ['hit', 'revalidated'];
    this.cacheMiss = ['miss', 'expired', 'stale', 'updating'];
  }

  /**
   * Read latest Logpush data
   * Returns parsed HTTP request records
   */
  async readLatest() {
    logger.info('Reading latest Logpush data', {
      bucket: this.bucket,
      prefix: this.prefix
    });

    try {
      // List objects from last hour
      const hourAgo = new Date(Date.now() - 3600000);
      const listCommand = new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: this.prefix,
        MaxKeys: 100
      });

      const listResponse = await this.s3Client.send(listCommand);

      if (!listResponse.Contents || listResponse.Contents.length === 0) {
        logger.warn('No Logpush data found');
        return null;
      }

      // Filter to recent files
      const recentFiles = listResponse.Contents.filter(obj => obj.LastModified >= hourAgo)
        .sort((a, b) => b.LastModified - a.LastModified)
        .slice(0, 10); // Limit to 10 most recent files

      if (recentFiles.length === 0) {
        logger.info('No recent Logpush files found');
        return null;
      }

      logger.info('Found recent Logpush files', { count: recentFiles.length });

      // Read and parse files
      const allRecords = [];
      for (const file of recentFiles) {
        const records = await this.readLogFile(file.Key);
        allRecords.push(...records);
      }

      // Aggregate metrics
      const metrics = this.aggregateMetrics(allRecords);

      logger.info('Logpush data read successfully', {
        records: allRecords.length,
        metrics
      });

      return {
        records: allRecords,
        metrics,
        readAt: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Failed to read Logpush data', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Read and parse a single log file (NDJSON format, gzipped)
   */
  async readLogFile(key) {
    try {
      logger.debug('Reading log file', { key });

      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key
      });

      const response = await this.s3Client.send(command);

      // Parse NDJSON (newline-delimited JSON)
      const records = await this.parseNDJSON(response.Body, key.endsWith('.gz'));

      logger.debug('Log file read successfully', {
        key,
        records: records.length
      });

      return records;
    } catch (error) {
      logger.error('Failed to read log file', {
        key,
        error: error.message
      });
      return [];
    }
  }

  /**
   * Parse NDJSON stream (potentially gzipped)
   */
  async parseNDJSON(stream, isGzipped) {
    return new Promise((resolve, reject) => {
      const records = [];

      // Create readable stream
      const readableStream = Readable.from(stream);

      // Decompress if gzipped
      const processStream = isGzipped ? readableStream.pipe(zlib.createGunzip()) : readableStream;

      // Read line by line
      const rl = readline.createInterface({
        input: processStream,
        crlfDelay: Infinity
      });

      rl.on('line', line => {
        try {
          // Security: Validate line length
          if (line.length > 10000) {
            logger.warn('Skipping oversized log line');
            return;
          }

          const record = JSON.parse(line);
          records.push(record);

          // Security: Limit total records
          if (records.length >= 1000000) {
            logger.warn('Reached max records limit');
            rl.close();
          }
        } catch (error) {
          logger.debug('Failed to parse log line', { error: error.message });
        }
      });

      rl.on('close', () => {
        resolve(records);
      });

      rl.on('error', error => {
        reject(error);
      });
    });
  }

  /**
   * Aggregate metrics from log records
   * Calculate egress, cache performance, and routing patterns
   */
  aggregateMetrics(records) {
    const metrics = {
      totalRequests: records.length,
      totalEgressBytes: 0,
      cacheHits: 0,
      cacheMisses: 0,
      cacheBypasses: 0,
      byRoute: {},
      byTenant: {},
      byStatus: {}
    };

    for (const record of records) {
      // Security: Validate record structure
      if (!record || typeof record !== 'object') {
        continue;
      }

      // Aggregate egress
      const egressBytes = parseInt(record.EdgeResponseBytes) || 0;
      metrics.totalEgressBytes += egressBytes;

      // Aggregate cache status
      const cacheStatus = (record.CacheCacheStatus || '').toLowerCase();
      if (this.cacheBypass.includes(cacheStatus)) {
        metrics.cacheBypasses++;
      } else if (this.cacheHit.includes(cacheStatus)) {
        metrics.cacheHits++;
      } else if (this.cacheMiss.includes(cacheStatus)) {
        metrics.cacheMisses++;
      }

      // Aggregate by route (path prefix)
      const path = record.ClientRequestPath || '/';
      const routePrefix = this.extractRoutePrefix(path);
      if (!metrics.byRoute[routePrefix]) {
        metrics.byRoute[routePrefix] = {
          requests: 0,
          egressBytes: 0,
          cacheBypasses: 0
        };
      }
      metrics.byRoute[routePrefix].requests++;
      metrics.byRoute[routePrefix].egressBytes += egressBytes;
      if (this.cacheBypass.includes(cacheStatus)) {
        metrics.byRoute[routePrefix].cacheBypasses++;
      }

      // Aggregate by tenant (extracted from headers/path)
      const tenantId = this.extractTenantId(record);
      if (tenantId) {
        if (!metrics.byTenant[tenantId]) {
          metrics.byTenant[tenantId] = {
            requests: 0,
            egressBytes: 0
          };
        }
        metrics.byTenant[tenantId].requests++;
        metrics.byTenant[tenantId].egressBytes += egressBytes;
      }

      // Aggregate by status code
      const status = record.EdgeResponseStatus || 0;
      metrics.byStatus[status] = (metrics.byStatus[status] || 0) + 1;
    }

    // Calculate derived metrics
    metrics.cacheBypassRate =
      metrics.totalRequests > 0 ? metrics.cacheBypasses / metrics.totalRequests : 0;

    metrics.egressPerRequest =
      metrics.totalRequests > 0 ? metrics.totalEgressBytes / metrics.totalRequests : 0;

    return metrics;
  }

  /**
   * Extract route prefix from path (first segment)
   */
  extractRoutePrefix(path) {
    // Security: Validate and sanitize path
    if (!path || typeof path !== 'string') {
      return '/';
    }

    const parts = path.split('/').filter(p => p.length > 0);
    return parts.length > 0 ? `/${parts[0]}` : '/';
  }

  /**
   * Extract tenant ID from request
   * Try headers first, then path-based heuristics
   */
  extractTenantId(record) {
    // Try custom header
    const headers = record.ClientRequestHeaders || {};
    if (headers['x-tenant-id']) {
      return headers['x-tenant-id'];
    }

    // Try subdomain
    const host = record.ClientRequestHost || '';
    const subdomain = host.split('.')[0];
    if (subdomain && subdomain !== 'www' && subdomain !== 'api') {
      return subdomain;
    }

    // Try path pattern (e.g., /tenants/{tenant_id}/...)
    const path = record.ClientRequestPath || '';
    const match = path.match(/\/tenants\/([^/]+)/);
    if (match) {
      return match[1];
    }

    return null;
  }

  /**
   * Detect egress hotspots
   * Identify routes with high egress + cache bypass
   */
  detectEgressHotspots(metrics, threshold = 0.5) {
    const hotspots = [];

    for (const [route, routeMetrics] of Object.entries(metrics.byRoute)) {
      const bypassRate =
        routeMetrics.requests > 0 ? routeMetrics.cacheBypasses / routeMetrics.requests : 0;

      const egressPerReq =
        routeMetrics.requests > 0 ? routeMetrics.egressBytes / routeMetrics.requests : 0;

      // Hotspot if high bypass rate AND high egress per request
      if (bypassRate > threshold && egressPerReq > 10000) {
        hotspots.push({
          route,
          requests: routeMetrics.requests,
          egressBytes: routeMetrics.egressBytes,
          egressPerReq,
          bypassRate,
          severity: this.calculateSeverity(bypassRate, egressPerReq)
        });
      }
    }

    return hotspots.sort((a, b) => b.severity - a.severity);
  }

  /**
   * Calculate hotspot severity score
   */
  calculateSeverity(bypassRate, egressPerReq) {
    // Higher bypass rate and egress = higher severity
    return bypassRate * (egressPerReq / 1000);
  }
}

export default LogpushReader;
