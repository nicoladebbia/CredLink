# Async Asset Ingest Pipeline Implementation

## Overview
High-throughput asynchronous pipeline for processing signed assets, extracting perceptual hashes and embeddings, and updating collision indexes. Designed to handle 10,000+ assets/minute with fault tolerance and backpressure control.

## Dependencies
```json
{
  "dependencies": {
    "@bull-board/api": "^5.8.0",
    "@bull-board/express": "^5.8.0",
    "bull": "^4.11.3",
    "ioredis": "^5.3.2",
    "aws-sdk": "^2.1467.0",
    "sharp": "^0.32.6",
    "pino": "^8.14.1",
    "pino-pretty": "^10.2.0"
  }
}
```

## Core Implementation

### Pipeline Configuration
```typescript
export interface IngestConfig {
  // Queue Configuration
  queues: {
    assetProcessing: {
      concurrency: number;
      maxAttempts: number;
      backoffStrategy: 'fixed' | 'exponential';
      removeOnComplete: number;
      removeOnFail: number;
    };
    hashComputation: {
      concurrency: number;
      priority: boolean;
      cpuThreshold: number;
    };
    embeddingComputation: {
      concurrency: number;
      gpuEnabled: boolean;
      batchSize: number;
    };
    indexUpdate: {
      concurrency: number;
      batchSize: number;
      flushInterval: number;
    };
  };
  
  // Processing Configuration
  processing: {
    enablePDQ: boolean;
    enableEnsemble: boolean;
    enableEmbeddings: boolean;
    embeddingModels: string[];
    qualityThresholds: {
      minImageQuality: number;
      minPDQQuality: number;
      minEmbeddingConfidence: number;
    };
  };
  
  // Storage Configuration
  storage: {
    tempDir: string;
    maxTempSize: number;
    cleanupInterval: number;
    s3Bucket: string;
    s3Region: string;
  };
  
  // Monitoring Configuration
  monitoring: {
    metricsInterval: number;
    healthCheckInterval: number;
    alertThresholds: {
      errorRate: number;
      queueDepth: number;
      processingLatency: number;
    };
  };
}

export interface AssetProcessingJob {
  id: string;
  tenantId: string;
  assetId: string;
  manifestUrl: string;
  imageUrl: string;
  metadata: {
    contentType: string;
    fileSize: number;
    uploadedAt: Date;
    userId?: string;
  };
  priority: 'low' | 'normal' | 'high' | 'critical';
  options: {
    skipEmbeddings?: boolean;
    customThresholds?: boolean;
    notifyOnComplete?: boolean;
  };
}

export interface ProcessingResult {
  assetId: string;
  tenantId: string;
  status: 'success' | 'failed' | 'partial';
  hashes: {
    pdq?: PDQHash;
    ensemble?: EnsembleHashes;
    embedding?: DenseEmbedding;
  };
  metrics: {
    processingTime: number;
    hashComputationTime: number;
    embeddingComputationTime: number;
    indexUpdateTime: number;
  };
  errors?: string[];
  warnings?: string[];
}
```

### Async Ingest Pipeline Manager
```typescript
import Bull, { Queue, Job } from 'bull';
import Redis from 'ioredis';
import { PDQHashEngine } from '../hashing/pdq-engine';
import { EnsembleHashEngine } from '../hashing/ensemble-hashing';
import { EmbeddingEngine } from '../hashing/embedding-engine';
import { CollisionIndex } from '../indexing/collision-index';
import pino from 'pino';

export class AsyncIngestPipeline {
  private config: IngestConfig;
  private redis: Redis;
  private queues: Map<string, Queue> = new Map();
  private pdqEngine: PDQHashEngine;
  private ensembleEngine: EnsembleHashEngine;
  private embeddingEngine: EmbeddingEngine;
  private collisionIndex: CollisionIndex;
  private logger: pino.Logger;
  private metrics: IngestMetrics;

  constructor(
    config: IngestConfig,
    redis: Redis,
    collisionIndex: CollisionIndex
  ) {
    this.config = config;
    this.redis = redis;
    this.collisionIndex = collisionIndex;
    
    this.logger = pino({
      level: 'info',
      transport: { target: 'pino-pretty' }
    });
    
    this.initializeEngines();
    this.initializeQueues();
    this.initializeMetrics();
  }

  /**
   * Initialize hash computation engines
   */
  private initializeEngines(): void {
    this.pdqEngine = new PDQHashEngine({
      targetSize: 256,
      minQuality: this.config.processing.qualityThresholds.minPDQQuality,
      enablePreprocessing: true
    });

    this.ensembleEngine = new EnsembleHashEngine({
      enableAHash: this.config.processing.enableEnsemble,
      enableDHash: this.config.processing.enableEnsemble,
      enablePHash: this.config.processing.enableEnsemble,
      targetImageSize: 64
    });

    this.embeddingEngine = new EmbeddingEngine({
      model: 'efficientnet-b0',
      dimensions: 512,
      batchSize: this.config.queues.embeddingComputation.batchSize,
      useGPU: this.config.queues.embeddingComputation.gpuEnabled,
      normalizeVectors: true
    });
  }

  /**
   * Initialize processing queues
   */
  private initializeQueues(): void {
    // Asset Processing Queue (main entry point)
    const assetProcessingQueue = new Bull.Queue('asset processing', {
      connection: this.redis.options,
      defaultJobOptions: {
        attempts: this.config.queues.assetProcessing.maxAttempts,
        backoff: {
          type: this.config.queues.assetProcessing.backoffStrategy,
          delay: 2000
        },
        removeOnComplete: this.config.queues.assetProcessing.removeOnComplete,
        removeOnFail: this.config.queues.assetProcessing.removeOnFail
      }
    });

    // Hash Computation Queue
    const hashComputationQueue = new Bull.Queue('hash computation', {
      connection: this.redis.options,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: this.config.queues.assetProcessing.backoffStrategy,
          delay: 1000
        }
      }
    });

    // Embedding Computation Queue
    const embeddingComputationQueue = new Bull.Queue('embedding computation', {
      connection: this.redis.options,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: this.config.queues.assetProcessing.backoffStrategy,
          delay: 1000
        }
      }
    });

    // Index Update Queue
    const indexUpdateQueue = new Bull.Queue('index update', {
      connection: this.redis.options,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: this.config.queues.assetProcessing.backoffStrategy,
          delay: 1000
        }
      }
    });

    // Store queues
    this.queues.set('assetProcessing', assetProcessingQueue);
    this.queues.set('hashComputation', hashComputationQueue);
    this.queues.set('embeddingComputation', embeddingComputationQueue);
    this.queues.set('indexUpdate', indexUpdateQueue);

    // Register processors
    this.registerProcessors();
  }

  /**
   * Register queue processors
   */
  private registerProcessors(): void {
    // Asset Processing Processor
    this.queues.get('assetProcessing')!.process(
      this.config.queues.assetProcessing.concurrency,
      async (job: Job<AssetProcessingJob>) => {
        return this.processAsset(job.data, job);
      }
    );

    // Hash Computation Processor
    this.queues.get('hashComputation')!.process(
      this.config.queues.hashComputation.concurrency,
      async (job: Job) => {
        return this.computeHashes(job.data);
      }
    );

    // Embedding Computation Processor
    this.queues.get('embeddingComputation')!.process(
      this.config.queues.embeddingComputation.concurrency,
      async (job: Job) => {
        return this.computeEmbeddings(job.data);
      }
    );

    // Index Update Processor
    this.queues.get('indexUpdate')!.process(
      this.config.queues.indexUpdate.concurrency,
      async (job: Job) => {
        return this.updateIndex(job.data);
      }
    );

    // Register error handlers
    this.registerErrorHandlers();
  }

  /**
   * Register error handlers for queues
   */
  private registerErrorHandlers(): void {
    this.queues.forEach(queue => {
      queue.on('error', (error) => {
        this.logger.error({ error }, 'Queue error');
        this.metrics.recordError(error.name);
      });

      queue.on('failed', (job, error) => {
        this.logger.error({ 
          jobId: job.id, 
          error: error.message 
        }, 'Job failed');
        this.metrics.recordJobFailure(job.data.assetId);
      });

      queue.on('completed', (job, result) => {
        this.logger.info({ 
          jobId: job.id, 
          assetId: job.data.assetId 
        }, 'Job completed');
        this.metrics.recordJobSuccess(job.data.assetId);
      });
    });
  }

  /**
   * Submit asset for processing
   */
  async submitAsset(
    jobData: AssetProcessingJob,
    options?: JobOptions
  ): Promise<Job<AssetProcessingJob>> {
    const queue = this.queues.get('assetProcessing')!;
    
    // Validate job data
    this.validateJobData(jobData);
    
    // Set job priority based on urgency
    const jobOptions: JobOptions = {
      priority: this.getJobPriority(jobData.priority),
      delay: 0,
      attempts: this.config.queues.assetProcessing.maxAttempts,
      ...options
    };

    const job = await queue.add('process asset', jobData, jobOptions);
    
    this.logger.info({ 
      jobId: job.id, 
      assetId: jobData.assetId,
      tenantId: jobData.tenantId 
    }, 'Asset submitted for processing');

    return job;
  }

  /**
   * Process asset through the pipeline
   */
  private async processAsset(
    jobData: AssetProcessingJob,
    job: Job
  ): Promise<ProcessingResult> {
    const startTime = performance.now();
    const result: ProcessingResult = {
      assetId: jobData.assetId,
      tenantId: jobData.tenantId,
      status: 'success',
      hashes: {},
      metrics: {
        processingTime: 0,
        hashComputationTime: 0,
        embeddingComputationTime: 0,
        indexUpdateTime: 0
      }
    };

    try {
      // Step 1: Download and validate asset
      const imageData = await this.downloadAsset(jobData.imageUrl);
      await this.validateAsset(imageData, jobData.metadata);

      // Step 2: Extract manifest lineage
      const manifest = await this.extractManifest(jobData.manifestUrl);
      const lineage = this.extractLineage(manifest);

      // Step 3: Compute hashes (parallel)
      const hashStartTime = performance.now();
      const hashPromises: Promise<any>[] = [];

      if (this.config.processing.enablePDQ) {
        hashPromises.push(
          this.pdqEngine.computePDQ(imageData).then(pdq => ({ pdq }))
        );
      }

      if (this.config.processing.enableEnsemble) {
        hashPromises.push(
          this.ensembleEngine.computeEnsembleHashes(imageData).then(ensemble => ({ ensemble }))
        );
      }

      const hashResults = await Promise.all(hashPromises);
      hashResults.forEach(hashes => Object.assign(result.hashes, hashes));
      result.metrics.hashComputationTime = performance.now() - hashStartTime;

      // Step 4: Compute embeddings (if enabled)
      if (this.config.processing.enableEmbeddings && !jobData.options.skipEmbeddings) {
        const embeddingStartTime = performance.now();
        const embedding = await this.embeddingEngine.computeEmbedding(imageData);
        result.hashes.embedding = embedding;
        result.metrics.embeddingComputationTime = performance.now() - embeddingStartTime;
      }

      // Step 5: Update indexes
      const indexStartTime = performance.now();
      await this.updateIndexes(jobData.assetId, result.hashes, lineage);
      result.metrics.indexUpdateTime = performance.now() - indexStartTime;

      // Step 6: Cleanup temporary files
      await this.cleanupTempFiles(jobData.assetId);

      result.metrics.processingTime = performance.now() - startTime;
      
      // Step 7: Send notification if requested
      if (jobData.options.notifyOnComplete) {
        await this.sendCompletionNotification(jobData, result);
      }

      this.logger.info({ 
        assetId: jobData.assetId,
        processingTime: result.metrics.processingTime 
      }, 'Asset processing completed');

      return result;

    } catch (error) {
      result.status = 'failed';
      result.errors = [error.message];
      result.metrics.processingTime = performance.now() - startTime;
      
      this.logger.error({ 
        assetId: jobData.assetId,
        error: error.message 
      }, 'Asset processing failed');

      throw error;
    }
  }

  /**
   * Download asset from URL with security controls
   */
  private async downloadAsset(imageUrl: string): Promise<Buffer> {
    // SECURITY: Validate URL format and allowed domains
    if (!this.isValidUrl(imageUrl)) {
      throw new SecurityError(`Invalid or unauthorized URL: ${imageUrl}`);
    }

    const maxFileSize = 100 * 1024 * 1024; // 100MB limit
    const timeout = 30000; // 30 second timeout

    try {
      // SECURITY: Use secure fetch with timeout and size limits
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(imageUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Collision-Detection-System/1.0',
          'Accept': 'image/*',
          'Accept-Encoding': 'gzip, deflate'
        }
      });

      clearTimeout(timeoutId);

      // SECURITY: Validate response
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // SECURITY: Check content type
      const contentType = response.headers.get('content-type');
      if (!contentType || !this.isValidImageContentType(contentType)) {
        throw new SecurityError(`Invalid content type: ${contentType}`);
      }

      // SECURITY: Check content length
      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength) > maxFileSize) {
        throw new SecurityError(`File too large: ${contentLength} bytes`);
      }

      // SECURITY: Stream download with size limit
      const chunks: Buffer[] = [];
      let totalSize = 0;
      
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Unable to read response body');
      }

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        totalSize += value.length;
        if (totalSize > maxFileSize) {
          reader.releaseLock();
          throw new SecurityError(`Download exceeded size limit: ${totalSize} bytes`);
        }
        
        chunks.push(Buffer.from(value));
      }

      const buffer = Buffer.concat(chunks);
      
      // SECURITY: Final size validation
      if (buffer.length > maxFileSize) {
        throw new SecurityError(`File too large: ${buffer.length} bytes`);
      }

      return buffer;
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new SecurityError('Download timeout exceeded');
      }
      throw new SecurityError(`Download failed: ${error.message}`);
    }
  }

  /**
   * Validate URL format and security
   */
  private isValidUrl(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      
      // SECURITY: Only allow HTTPS and HTTP
      if (!['https:', 'http:'].includes(parsedUrl.protocol)) {
        return false;
      }

      // SECURITY: Block private/internal IPs
      const hostname = parsedUrl.hostname;
      if (this.isPrivateIP(hostname)) {
        return false;
      }

      // SECURITY: Block localhost and file URLs
      if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.') || 
          hostname.startsWith('10.') || hostname.startsWith('172.')) {
        return false;
      }

      // SECURITY: Validate domain against allowlist if configured
      if (this.config.allowedDomains && this.config.allowedDomains.length > 0) {
        if (!this.config.allowedDomains.some(domain => hostname === domain || hostname.endsWith(`.${domain}`))) {
          return false;
        }
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if hostname is a private IP
   */
  private isPrivateIP(hostname: string): boolean {
    // Basic private IP detection
    const privateRanges = [
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /^192\.168\./,
      /^127\./,
      /^169\.254\./,
      /^::1$/,
      /^fc00:/,
      /^fe80:/
    ];

    return privateRanges.some(range => range.test(hostname));
  }

  /**
   * Validate image content type
   */
  private isValidImageContentType(contentType: string): boolean {
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'image/tiff'
    ];

    return allowedTypes.some(type => contentType.toLowerCase().includes(type));
  }

  /**
   * Validate asset data
   */
  private async validateAsset(
    imageData: Buffer,
    metadata: AssetProcessingJob['metadata']
  ): Promise<void> {
    // Check file size
    if (imageData.length !== metadata.fileSize) {
      throw new Error(`File size mismatch: expected ${metadata.fileSize}, got ${imageData.length}`);
    }

    // Check if valid image
    try {
      await sharp(imageData).metadata();
    } catch (error) {
      throw new Error(`Invalid image format: ${error.message}`);
    }

    // Check minimum quality
    if (imageData.length < 1024) {
      throw new Error('Image too small for processing');
    }
  }

  /**
   * Extract and parse C2PA manifest
   */
  private async extractManifest(manifestUrl: string): Promise<any> {
    try {
      const response = await fetch(manifestUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch manifest: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      throw new Error(`Manifest extraction failed: ${error.message}`);
    }
  }

  /**
   * Extract lineage information from manifest
   */
  private extractLineage(manifest: any): ManifestLineage {
    return {
      issuerKeyId: manifest.claim_generator?.split('/')[0] || '',
      parentHash: manifest.assertions?.find((a: any) => a.label === 'c2pa.parent')?.data?.hash || '',
      assetId: manifest.claim_generator?.split('/').pop() || '',
      timestamp: manifest.assertions?.find((a: any) => a.label === 'c2pa.actions')?.timestamp || new Date().toISOString()
    };
  }

  /**
   * Update collision indexes
   */
  private async updateIndexes(
    assetId: string,
    hashes: ProcessingResult['hashes'],
    lineage: ManifestLineage
  ): Promise<void> {
    const updateData = {
      assetId,
      pdqHash: hashes.pdq?.binary,
      embedding: hashes.embedding?.vector
    };

    await this.collisionIndex.upsert(updateData);
  }

  /**
   * Send completion notification
   */
  private async sendCompletionNotification(
    jobData: AssetProcessingJob,
    result: ProcessingResult
  ): Promise<void> {
    // Implementation would send webhook or notification
    this.logger.info({
      assetId: jobData.assetId,
      status: result.status,
      processingTime: result.metrics.processingTime
    }, 'Processing completion notification sent');
  }

  /**
   * Cleanup temporary files
   */
  private async cleanupTempFiles(assetId: string): Promise<void> {
    const tempPath = `${this.config.storage.tempDir}/${assetId}`;
    try {
      await fs.rm(tempPath, { recursive: true, force: true });
    } catch (error) {
      this.logger.warn({ assetId, error: error.message }, 'Failed to cleanup temp files');
    }
  }

  /**
   * Validate job data
   */
  private validateJobData(jobData: AssetProcessingJob): void {
    if (!jobData.assetId || !jobData.tenantId) {
      throw new Error('Asset ID and tenant ID are required');
    }
    
    if (!jobData.imageUrl || !jobData.manifestUrl) {
      throw new Error('Image URL and manifest URL are required');
    }
    
    if (!jobData.metadata) {
      throw new Error('Metadata is required');
    }
  }

  /**
   * Get job priority numeric value
   */
  private getJobPriority(priority: AssetProcessingJob['priority']): number {
    switch (priority) {
      case 'critical': return 10;
      case 'high': return 7;
      case 'normal': return 5;
      case 'low': return 1;
      default: return 5;
    }
  }

  /**
   * Initialize metrics collection
   */
  private initializeMetrics(): void {
    this.metrics = new IngestMetrics();
    
    // Start metrics collection interval
    setInterval(() => {
      this.collectQueueMetrics();
    }, this.config.monitoring.metricsInterval);
  }

  /**
   * Collect queue metrics
   */
  private async collectQueueMetrics(): Promise<void> {
    for (const [name, queue] of this.queues.entries()) {
      const waiting = await queue.getWaiting();
      const active = await queue.getActive();
      const completed = await queue.getCompleted();
      const failed = await queue.getFailed();
      
      this.metrics.updateQueueMetrics(name, {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length
      });
    }
  }

  /**
   * Get pipeline status
   */
  async getStatus(): Promise<{
    queues: Record<string, any>;
    metrics: any;
    health: 'healthy' | 'degraded' | 'unhealthy';
  }> {
    const queueStatuses: Record<string, any> = {};
    
    for (const [name, queue] of this.queues.entries()) {
      queueStatuses[name] = {
        waiting: await queue.getWaitingCount(),
        active: await queue.getActiveCount(),
        completed: await queue.getCompletedCount(),
        failed: await queue.getFailedCount()
      };
    }

    const health = this assessHealth(queueStatuses);

    return {
      queues: queueStatuses,
      metrics: this.metrics.getSnapshot(),
      health
    };
  }

  /**
   * Assess overall pipeline health
   */
  private assessHealth(queueStatuses: Record<string, any>): 'healthy' | 'degraded' | 'unhealthy' {
    const totalActive = Object.values(queueStatuses).reduce((sum: number, status: any) => sum + status.active, 0);
    const totalFailed = Object.values(queueStatuses).reduce((sum: number, status: any) => sum + status.failed, 0);
    
    const errorRate = totalFailed / (totalActive + totalFailed + 1);
    
    if (errorRate > this.config.monitoring.alertThresholds.errorRate) {
      return 'unhealthy';
    }
    
    if (totalActive > this.config.monitoring.alertThresholds.queueDepth) {
      return 'degraded';
    }
    
    return 'healthy';
  }

  /**
   * Pause processing
   */
  async pause(): Promise<void> {
    for (const queue of this.queues.values()) {
      await queue.pause();
    }
    this.logger.info('Pipeline paused');
  }

  /**
   * Resume processing
   */
  async resume(): Promise<void> {
    for (const queue of this.queues.values()) {
      await queue.resume();
    }
    this.logger.info('Pipeline resumed');
  }

  /**
   * Drain queues (wait for all active jobs to complete)
   */
  async drain(): Promise<void> {
    const drainPromises = Array.from(this.queues.values()).map(queue => queue.drain());
    await Promise.all(drainPromises);
    this.logger.info('Pipeline drained');
  }

  /**
   * Dispose resources
   */
  async dispose(): Promise<void> {
    // Close queues
    const closePromises = Array.from(this.queues.values()).map(queue => queue.close());
    await Promise.all(closePromises);
    
    // Dispose engines
    await this.embeddingEngine.dispose();
    
    this.logger.info('Pipeline disposed');
  }
}
```

### Metrics Collection
```typescript
export class IngestMetrics {
  private metrics: Map<string, any> = new Map();
  private counters: Map<string, number> = new Map();
  private timers: Map<string, number[]> = new Map();

  constructor() {
    this.initializeMetrics();
  }

  private initializeMetrics(): void {
    this.metrics.set('pipeline', {
      jobsProcessed: 0,
      jobsSucceeded: 0,
      jobsFailed: 0,
      totalProcessingTime: 0,
      avgProcessingTime: 0
    });
  }

  recordJobSuccess(assetId: string): void {
    const pipeline = this.metrics.get('pipeline');
    pipeline.jobsProcessed++;
    pipeline.jobsSucceeded++;
  }

  recordJobFailure(assetId: string): void {
    const pipeline = this.metrics.get('pipeline');
    pipeline.jobsProcessed++;
    pipeline.jobsFailed++;
  }

  recordProcessingTime(duration: number): void {
    const pipeline = this.metrics.get('pipeline');
    pipeline.totalProcessingTime += duration;
    pipeline.avgProcessingTime = pipeline.totalProcessingTime / pipeline.jobsProcessed;
  }

  recordError(errorType: string): void {
    const count = this.counters.get(errorType) || 0;
    this.counters.set(errorType, count + 1);
  }

  updateQueueMetrics(queueName: string, metrics: any): void {
    this.metrics.set(queueName, metrics);
  }

  getSnapshot(): any {
    return {
      pipeline: this.metrics.get('pipeline'),
      queues: Object.fromEntries(
        Array.from(this.metrics.entries()).filter(([key]) => key !== 'pipeline')
      ),
      errors: Object.fromEntries(this.counters),
      timestamp: new Date().toISOString()
    };
  }
}
```

### Batch Processing Support
```typescript
export class BatchIngestProcessor {
  private pipeline: AsyncIngestPipeline;
  private batchSize: number;
  private batchTimeout: number;

  constructor(
    pipeline: AsyncIngestPipeline,
    batchSize: number = 100,
    batchTimeout: number = 30000
  ) {
    this.pipeline = pipeline;
    this.batchSize = batchSize;
    this.batchTimeout = batchTimeout;
  }

  /**
   * Submit batch of assets for processing
   */
  async submitBatch(
    assets: AssetProcessingJob[],
    options?: { priority?: AssetProcessingJob['priority']; delay?: number }
  ): Promise<Job[]> {
    const jobs: Job[] = [];
    
    // Submit jobs with staggered delays to prevent overwhelming the system
    for (let i = 0; i < assets.length; i++) {
      const asset = assets[i];
      const delay = options?.delay ? options.delay + (i * 100) : i * 100;
      
      const job = await this.pipeline.submitAsset(asset, {
        delay,
        priority: this.pipeline.getJobPriority(options?.priority || asset.priority)
      });
      
      jobs.push(job);
    }

    return jobs;
  }

  /**
   * Wait for batch completion
   */
  async waitForBatch(
    jobs: Job[],
    timeout: number = 300000
  ): Promise<{
    completed: Job[];
    failed: Job[];
    results: ProcessingResult[];
  }> {
    const completed: Job[] = [];
    const failed: Job[] = [];
    const results: ProcessingResult[] = [];

    const promises = jobs.map(async (job) => {
      try {
        const result = await job.finished();
        completed.push(job);
        results.push(result);
      } catch (error) {
        failed.push(job);
      }
    });

    await Promise.allSettled(promises);

    return { completed, failed, results };
  }

  /**
   * Process batch with automatic retry for failed jobs
   */
  async processBatchWithRetry(
    assets: AssetProcessingJob[],
    maxRetries: number = 2
  ): Promise<{
    successful: ProcessingResult[];
    failed: AssetProcessingJob[];
  }> {
    let remainingAssets = [...assets];
    const successful: ProcessingResult[] = [];
    const failed: AssetProcessingJob[] = [];

    for (let attempt = 0; attempt <= maxRetries && remainingAssets.length > 0; attempt++) {
      const jobs = await this.submitBatch(remainingAssets, {
        priority: attempt > 0 ? 'high' : 'normal'
      });

      const { completed, failed: failedJobs, results } = await this.waitForBatch(jobs);

      // Add successful results
      successful.push(...results);

      // Prepare failed assets for retry
      remainingAssets = failedJobs.map(job => 
        remainingAssets.find(asset => asset.assetId === job.data.assetId)!
      );

      if (attempt < maxRetries) {
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 5000 * (attempt + 1)));
      }
    }

    failed.push(...remainingAssets);

    return { successful, failed };
  }
}
```
