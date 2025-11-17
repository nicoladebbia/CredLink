import { C2PAService, SigningOptions, SigningResult } from './c2pa-service';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/error-handler';
import { v4 as uuidv4 } from 'uuid';

export interface BatchSigningOptions extends SigningOptions {
  maxConcurrency?: number;
  timeoutMs?: number;
  continueOnError?: boolean;
}

export interface BatchSigningResult {
  fileIndex: number;
  success: boolean;
  imageHash?: string;
  proofUri?: string;
  error?: string;
  processingTime: number;
  batchId: string;
}

export interface BatchFileInfo {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

export class BatchSigningService {
  private c2paService: C2PAService;
  private readonly defaultMaxConcurrency = 5;
  private readonly defaultTimeoutMs = 60000; // 60 seconds

  constructor(options: { c2paService: C2PAService }) {
    this.c2paService = options.c2paService;
    logger.info('Batch Signing Service initialized');
  }

  /**
   * Sign multiple images in batch
   */
  async signBatch(
    files: Express.Multer.File[], 
    options: BatchSigningOptions = {}
  ): Promise<BatchSigningResult[]> {
    const batchId = uuidv4();
    const startTime = Date.now();
    
    const {
      maxConcurrency = this.defaultMaxConcurrency,
      timeoutMs = this.defaultTimeoutMs,
      continueOnError = true,
      ...signingOptions
    } = options;

    logger.info('Starting batch signing', {
      batchId,
      fileCount: files.length,
      maxConcurrency,
      timeoutMs,
      continueOnError
    });

    // Convert files to batch info format
    const batchFiles: BatchFileInfo[] = files.map(file => ({
      buffer: file.buffer,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size
    }));

    // Process files in batches
    const results = await this.processBatchConcurrently(
      batchFiles,
      signingOptions,
      maxConcurrency,
      timeoutMs,
      continueOnError,
      batchId
    );

    const totalProcessingTime = Date.now() - startTime;
    
    logger.info('Batch signing completed', {
      batchId,
      totalFiles: files.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      totalProcessingTime
    });

    return results;
  }

  /**
   * Process files concurrently with controlled concurrency
   */
  private async processBatchConcurrently(
    files: BatchFileInfo[],
    options: SigningOptions,
    maxConcurrency: number,
    timeoutMs: number,
    continueOnError: boolean,
    batchId: string
  ): Promise<BatchSigningResult[]> {
    const results: BatchSigningResult[] = [];
    
    // Process files in chunks to control concurrency
    for (let i = 0; i < files.length; i += maxConcurrency) {
      const chunk = files.slice(i, i + maxConcurrency);
      
      const chunkPromises = chunk.map(async (file, chunkIndex) => {
        const fileIndex = i + chunkIndex;
        const fileStartTime = Date.now();
        
        try {
          // Add timeout to individual file processing
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('File processing timeout')), timeoutMs);
          });

          const signingPromise = this.c2paService.signImage(file.buffer, options);
          
          const result = await Promise.race([signingPromise, timeoutPromise]);
          
          return {
            fileIndex,
            success: true,
            imageHash: result.imageHash,
            proofUri: result.proofUri,
            processingTime: Date.now() - fileStartTime,
            batchId
          };
          
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          
          logger.error('File signing failed in batch', {
            fileIndex,
            originalName: file.originalname,
            error: errorMessage,
            processingTime: Date.now() - fileStartTime
          });

          if (!continueOnError) {
            throw new AppError(
              `Batch processing failed at file ${fileIndex}: ${errorMessage}`,
              500
            );
          }

          return {
            fileIndex,
            success: false,
            error: errorMessage,
            processingTime: Date.now() - fileStartTime,
            batchId
          };
        }
      });

      // Wait for current chunk to complete
      const chunkResults = await Promise.all(chunkPromises);
      results.push(...chunkResults);
    }

    return results;
  }

  /**
   * Get batch processing statistics
   */
  getBatchStatistics(results: BatchSigningResult[]): {
    totalFiles: number;
    successful: number;
    failed: number;
    successRate: number;
    averageProcessingTime: number;
    totalProcessingTime: number;
  } {
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const totalProcessingTime = results.reduce((sum, r) => sum + r.processingTime, 0);
    
    return {
      totalFiles: results.length,
      successful,
      failed,
      successRate: results.length > 0 ? (successful / results.length) * 100 : 0,
      averageProcessingTime: results.length > 0 ? totalProcessingTime / results.length : 0,
      totalProcessingTime
    };
  }

  /**
   * Validate batch request
   */
  validateBatchRequest(files: Express.Multer.File[], options: BatchSigningOptions): void {
    if (!files || files.length === 0) {
      throw new AppError('No files provided for batch signing', 400);
    }

    if (files.length > 10) {
      throw new AppError('Maximum 10 files allowed per batch', 400);
    }

    // Check total size
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    const maxTotalSize = 100 * 1024 * 1024; // 100MB
    
    if (totalSize > maxTotalSize) {
      throw new AppError(
        `Total batch size exceeds limit: ${Math.round(totalSize / 1024 / 1024)}MB > ${Math.round(maxTotalSize / 1024 / 1024)}MB`,
        400
      );
    }

    // Validate individual files
    files.forEach((file, index) => {
      if (file.size > 50 * 1024 * 1024) { // 50MB per file
        throw new AppError(
          `File ${index + 1} (${file.originalname}) exceeds 50MB limit`,
          400
        );
      }

      const allowedTypes = [
        'image/jpeg',
        'image/png',
        'image/tiff',
        'image/webp',
        'image/heic',
        'image/heif'
      ];

      if (!allowedTypes.includes(file.mimetype)) {
        throw new AppError(
          `File ${index + 1} (${file.originalname}) has unsupported type: ${file.mimetype}`,
          400
        );
      }
    });

    // Validate options
    if (options.maxConcurrency && (options.maxConcurrency < 1 || options.maxConcurrency > 10)) {
      throw new AppError('Max concurrency must be between 1 and 10', 400);
    }

    if (options.timeoutMs && (options.timeoutMs < 5000 || options.timeoutMs > 300000)) {
      throw new AppError('Timeout must be between 5 seconds and 5 minutes', 400);
    }
  }

  /**
   * Get service status
   */
  async getStatus(): Promise<{ status: string; details: any }> {
    return {
      status: 'operational',
      details: {
        max_concurrency: this.defaultMaxConcurrency,
        default_timeout: this.defaultTimeoutMs,
        max_batch_size: 10,
        max_file_size: '50MB',
        max_total_size: '100MB',
        supported_formats: ['jpeg', 'png', 'tiff', 'webp', 'heic', 'heif']
      }
    };
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    logger.info('Batch Signing Service cleanup completed');
  }
}
