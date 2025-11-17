/**
 * Production-Ready Certificate Rotation Service
 * Implements automated certificate lifecycle management with AWS KMS integration
 */

import { EventEmitter } from 'events';
import { Pool } from 'pg';
import { logger } from '../utils/secure-logger';
import { AtomicCertificateManager } from './certificate-manager-atomic';
import { TimeoutConfig } from '../utils/timeout-config';

interface CertificateRotationConfig {
  rotationIntervalDays: number;
  expirationWarningDays: number;
  maxRetryAttempts: number;
  retryDelayMs: number;
  enableAutoRotation: boolean;
  backupBeforeRotation: boolean;
  testAfterRotation: boolean;
}

interface CertificateRotationJob {
  id: string;
  certificateId: string;
  scheduledAt: Date;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  attempts: number;
  lastAttempt?: Date;
  error?: string;
  completedAt?: Date;
  previousCertificateArn?: string;
  newCertificateArn?: string;
}

interface RotationMetrics {
  totalRotations: number;
  successfulRotations: number;
  failedRotations: number;
  lastRotationTime?: Date;
  averageRotationTime: number;
  certificatesExpiring: number;
  certificatesExpired: number;
}

export class CertificateRotationService extends EventEmitter {
  private config: CertificateRotationConfig;
  private dbPool: Pool;
  private certificateManager: AtomicCertificateManager;
  private rotationJobs: Map<string, CertificateRotationJob> = new Map();
  private isRunning: boolean = false;
  private rotationTimer?: NodeJS.Timeout;
  private metrics: RotationMetrics;

  constructor(
    dbPool: Pool,
    certificateManager: AtomicCertificateManager,
    config: Partial<CertificateRotationConfig> = {}
  ) {
    super();
    
    this.dbPool = dbPool;
    this.certificateManager = certificateManager;
    
    this.config = {
      rotationIntervalDays: 90, // Rotate certificates every 90 days
      expirationWarningDays: 30, // Warn 30 days before expiration
      maxRetryAttempts: 3,
      retryDelayMs: 300000, // 5 minutes
      enableAutoRotation: true,
      backupBeforeRotation: true,
      testAfterRotation: true,
      ...config
    };

    this.metrics = {
      totalRotations: 0,
      successfulRotations: 0,
      failedRotations: 0,
      averageRotationTime: 0,
      certificatesExpiring: 0,
      certificatesExpired: 0
    };

    logger.info('CertificateRotationService initialized', {
      config: this.config
    });
  }

  /**
   * Start the certificate rotation service
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Certificate rotation service is already running');
      return;
    }

    try {
      // Initialize database tables
      await this.initializeDatabase();
      
      // Load existing rotation jobs
      await this.loadRotationJobs();
      
      // Start rotation check interval (every hour)
      this.rotationTimer = setInterval(() => {
        this.checkAndExecuteRotations().catch(error => {
          logger.error('Rotation check failed', { error });
        });
      }, 60 * 60 * 1000);

      // Perform initial check
      await this.checkAndExecuteRotations();
      
      this.isRunning = true;
      logger.info('Certificate rotation service started successfully');
      
      this.emit('started');
    } catch (error) {
      logger.error('Failed to start certificate rotation service', { error });
      throw error;
    }
  }

  /**
   * Stop the certificate rotation service
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      logger.warn('Certificate rotation service is not running');
      return;
    }

    try {
      // Clear rotation timer
      if (this.rotationTimer) {
        clearInterval(this.rotationTimer);
        this.rotationTimer = undefined;
      }

      // Wait for any in-progress rotations to complete
      const inProgressJobs = Array.from(this.rotationJobs.values())
        .filter(job => job.status === 'in_progress');

      if (inProgressJobs.length > 0) {
        logger.info('Waiting for in-progress rotations to complete', {
          count: inProgressJobs.length
        });
        
        // Wait up to 30 minutes for rotations to complete
        const maxWaitTime = 30 * 60 * 1000;
        const startTime = Date.now();
        
        while (Date.now() - startTime < maxWaitTime) {
          const stillInProgress = Array.from(this.rotationJobs.values())
            .filter(job => job.status === 'in_progress');
          
          if (stillInProgress.length === 0) {
            break;
          }
          
          await new Promise(resolve => setTimeout(resolve, TimeoutConfig.JOB_SHUTDOWN_TIMEOUT));
        }
      }

      this.isRunning = false;
      logger.info('Certificate rotation service stopped successfully');
      
      this.emit('stopped');
    } catch (error) {
      logger.error('Failed to stop certificate rotation service', { error });
      throw error;
    }
  }

  /**
   * Schedule a certificate rotation
   */
  async scheduleRotation(
    certificateId: string,
    scheduledAt?: Date,
    priority: boolean = false
  ): Promise<string> {
    const rotationTime = scheduledAt || new Date(Date.now() + 24 * 60 * 60 * 1000); // Default: tomorrow
    
    const jobId = `rotation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const job: CertificateRotationJob = {
      id: jobId,
      certificateId,
      scheduledAt: rotationTime,
      status: 'pending',
      attempts: 0
    };

    // Store in database
    await this.persistRotationJob(job);
    
    // Store in memory
    this.rotationJobs.set(jobId, job);
    
    logger.info('Certificate rotation scheduled', {
      jobId,
      certificateId,
      scheduledAt: rotationTime.toISOString(),
      priority
    });

    this.emit('rotationScheduled', { jobId, certificateId, scheduledAt: rotationTime });
    
    // If priority and service is running, execute immediately
    if (priority && this.isRunning) {
      this.executeRotation(job).catch(error => {
        logger.error('Priority rotation failed', { jobId, error });
      });
    }
    
    return jobId;
  }

  /**
   * Get rotation status
   */
  getRotationStatus(jobId: string): CertificateRotationJob | null {
    return this.rotationJobs.get(jobId) || null;
  }

  /**
   * Get all rotation jobs
   */
  getAllRotationJobs(): CertificateRotationJob[] {
    return Array.from(this.rotationJobs.values());
  }

  /**
   * Get certificates that need rotation
   */
  async getCertificatesNeedingRotation(): Promise<Array<{
    id: string;
    name: string;
    expiresAt: Date;
    daysUntilExpiration: number;
    priority: 'urgent' | 'warning' | 'scheduled';
  }>> {
    try {
      const result = await this.dbPool.query(`
        SELECT id, name, expires_at 
        FROM certificates 
        WHERE expires_at <= NOW() + INTERVAL '${this.config.expirationWarningDays} days'
        AND status = 'active'
        ORDER BY expires_at ASC
      `);

      const certificates = result.rows.map((row: any) => {
        const expiresAt = new Date(row.expires_at);
        const daysUntilExpiration = Math.ceil((expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
        
        let priority: 'urgent' | 'warning' | 'scheduled';
        if (daysUntilExpiration <= 7) {
          priority = 'urgent';
        } else if (daysUntilExpiration <= 30) {
          priority = 'warning';
        } else {
          priority = 'scheduled';
        }

        return {
          id: row.id,
          name: row.name,
          expiresAt,
          daysUntilExpiration,
          priority
        };
      });

      // Update metrics
      this.metrics.certificatesExpiring = certificates.filter((c: any) => c.daysUntilExpiration > 0).length;
      this.metrics.certificatesExpired = certificates.filter((c: any) => c.daysUntilExpiration <= 0).length;

      return certificates;
    } catch (error) {
      logger.error('Failed to get certificates needing rotation', { error });
      return [];
    }
  }

  /**
   * Get rotation metrics
   */
  getMetrics(): RotationMetrics {
    return { ...this.metrics };
  }

  /**
   * Force rotate a certificate immediately
   */
  async forceRotation(certificateId: string): Promise<boolean> {
    logger.info('Forcing immediate certificate rotation', { certificateId });
    
    try {
      const jobId = await this.scheduleRotation(certificateId, new Date(), true);
      const job = this.rotationJobs.get(jobId);
      
      if (job) {
        await this.executeRotation(job);
        return job.status === 'completed';
      }
      
      return false;
    } catch (error) {
      logger.error('Forced rotation failed', { certificateId, error });
      return false;
    }
  }

  /**
   * Private methods
   */

  private async initializeDatabase(): Promise<void> {
    try {
      await this.dbPool.query(`
        CREATE TABLE IF NOT EXISTS certificate_rotations (
          job_id VARCHAR(255) PRIMARY KEY,
          certificate_id VARCHAR(255) NOT NULL,
          scheduled_at TIMESTAMP NOT NULL,
          status VARCHAR(50) NOT NULL DEFAULT 'pending',
          attempts INTEGER DEFAULT 0,
          last_attempt TIMESTAMP,
          error TEXT,
          completed_at TIMESTAMP,
          previous_certificate_arn TEXT,
          new_certificate_arn TEXT,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);

      // Create index for efficient querying
      await this.dbPool.query(`
        CREATE INDEX IF NOT EXISTS idx_certificate_rotations_status 
        ON certificate_rotations(status, scheduled_at)
      `);

      logger.info('Certificate rotation database tables initialized');
    } catch (error) {
      logger.error('Failed to initialize rotation database', { error });
      throw error;
    }
  }

  private async loadRotationJobs(): Promise<void> {
    try {
      const result = await this.dbPool.query(`
        SELECT * FROM certificate_rotations 
        WHERE status IN ('pending', 'in_progress')
        ORDER BY scheduled_at ASC
      `);

      for (const row of result.rows) {
        const job: CertificateRotationJob = {
          id: row.job_id,
          certificateId: row.certificate_id,
          scheduledAt: new Date(row.scheduled_at),
          status: row.status as any,
          attempts: row.attempts,
          lastAttempt: row.last_attempt ? new Date(row.last_attempt) : undefined,
          error: row.error,
          completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
          previousCertificateArn: row.previous_certificate_arn,
          newCertificateArn: row.new_certificate_arn
        };

        this.rotationJobs.set(job.id, job);
      }

      logger.info('Loaded rotation jobs from database', {
        count: this.rotationJobs.size
      });
    } catch (error) {
      logger.error('Failed to load rotation jobs', { error });
      // Don't throw - service can start without existing jobs
    }
  }

  private async checkAndExecuteRotations(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      // Get certificates that need rotation
      const certificatesNeedingRotation = await this.getCertificatesNeedingRotation();
      
      for (const cert of certificatesNeedingRotation) {
        // Check if rotation is already scheduled
        const existingJob = Array.from(this.rotationJobs.values())
          .find(job => job.certificateId === cert.id && job.status !== 'completed');
        
        if (!existingJob) {
          // Schedule rotation based on priority
          let scheduledAt: Date;
          
          if (cert.priority === 'urgent') {
            scheduledAt = new Date(); // Rotate immediately
          } else if (cert.priority === 'warning') {
            scheduledAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // Tomorrow
          } else {
            scheduledAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // Next week
          }
          
          await this.scheduleRotation(cert.id, scheduledAt);
        }
      }

      // Execute pending rotations that are due
      const now = new Date();
      const dueJobs = Array.from(this.rotationJobs.values())
        .filter(job => job.status === 'pending' && job.scheduledAt <= now);

      for (const job of dueJobs) {
        this.executeRotation(job).catch(error => {
          logger.error('Scheduled rotation execution failed', { jobId: job.id, error });
        });
      }

    } catch (error) {
      logger.error('Rotation check failed', { error });
    }
  }

  private async executeRotation(job: CertificateRotationJob): Promise<void> {
    if (job.status === 'in_progress') {
      logger.warn('Rotation job already in progress', { jobId: job.id });
      return;
    }

    job.status = 'in_progress';
    job.lastAttempt = new Date();
    job.attempts++;
    
    await this.updateRotationJob(job);
    
    const startTime = Date.now();
    
    logger.info('Starting certificate rotation', {
      jobId: job.id,
      certificateId: job.certificateId,
      attempt: job.attempts
    });

    try {
      // Get current certificate info
      const currentCert = await this.certificateManager.getCurrentCertificate();
      if (!currentCert) {
        throw new Error('No current certificate found for rotation');
      }

      job.previousCertificateArn = currentCert.id;

      // Backup current certificate if configured
      if (this.config.backupBeforeRotation) {
        await this.backupCertificate(currentCert);
      }

      // Generate new certificate
      const newCertificate = await this.certificateManager.rotateCertificate();
      job.newCertificateArn = newCertificate.newCertificate?.id || 'unknown';

      // Test new certificate if configured
      if (this.config.testAfterRotation) {
        await this.testCertificate(newCertificate);
      }

      // Mark as completed
      job.status = 'completed';
      job.completedAt = new Date();
      
      const duration = Date.now() - startTime;
      
      // Update metrics
      this.metrics.totalRotations++;
      this.metrics.successfulRotations++;
      this.metrics.lastRotationTime = new Date();
      this.metrics.averageRotationTime = 
        (this.metrics.averageRotationTime * (this.metrics.successfulRotations - 1) + duration) / 
        this.metrics.successfulRotations;

      await this.updateRotationJob(job);
      
      logger.info('Certificate rotation completed successfully', {
        jobId: job.id,
        certificateId: job.certificateId,
        duration,
        previousArn: job.previousCertificateArn,
        newArn: job.newCertificateArn
      });

      this.emit('rotationCompleted', {
        jobId: job.id,
        certificateId: job.certificateId,
        duration,
        previousArn: job.previousCertificateArn,
        newArn: job.newCertificateArn
      });

    } catch (error) {
      job.error = (error as Error).message;
      
      // Retry logic
      if (job.attempts < this.config.maxRetryAttempts) {
        job.status = 'pending';
        job.scheduledAt = new Date(Date.now() + this.config.retryDelayMs);
        
        logger.warn('Certificate rotation failed, scheduling retry', {
          jobId: job.id,
          certificateId: job.certificateId,
          attempt: job.attempts,
          maxAttempts: this.config.maxRetryAttempts,
          error: job.error,
          nextAttempt: job.scheduledAt
        });
        
        this.emit('rotationRetryScheduled', {
          jobId: job.id,
          certificateId: job.certificateId,
          attempt: job.attempts,
          nextAttempt: job.scheduledAt
        });
      } else {
        job.status = 'failed';
        
        // Update metrics
        this.metrics.totalRotations++;
        this.metrics.failedRotations++;
        
        logger.error('Certificate rotation failed after all retries', {
          jobId: job.id,
          certificateId: job.certificateId,
          attempts: job.attempts,
          error: job.error
        });
        
        this.emit('rotationFailed', {
          jobId: job.id,
          certificateId: job.certificateId,
          error: job.error
        });
      }
      
      await this.updateRotationJob(job);
    }
  }

  private async backupCertificate(certificate: any): Promise<void> {
    try {
      // Store certificate backup in database
      await this.dbPool.query(`
        INSERT INTO certificate_backups 
        (certificate_id, arn, certificate_data, backup_reason, created_at)
        VALUES ($1, $2, $3, $4, NOW())
      `, [
        certificate.id,
        certificate.arn,
        JSON.stringify(certificate),
        'pre_rotation'
      ]);
      
      logger.info('Certificate backed up successfully', {
        certificateId: certificate.id,
        arn: certificate.arn
      });
    } catch (error) {
      logger.error('Failed to backup certificate', { 
        certificateId: certificate.id, 
        error 
      });
      // Don't throw rotation failure for backup issues
    }
  }

  private async testCertificate(certificate: any): Promise<void> {
    try {
      // Basic certificate property validation (rotateCertificate already validates security)
      if (!certificate.pem || !certificate.expiresAt) {
        throw new Error('Generated certificate missing required properties');
      }
      
      logger.info('Certificate validation passed', {
        certificateId: certificate.id,
        expiresAt: certificate.expiresAt
      });
    } catch (error) {
      logger.error('Certificate validation failed', { error });
      throw error;
    }
  }

  private async persistRotationJob(job: CertificateRotationJob): Promise<void> {
    try {
      await this.dbPool.query(`
        INSERT INTO certificate_rotations 
        (job_id, certificate_id, scheduled_at, status, attempts, 
         last_attempt, error, completed_at, previous_certificate_arn, new_certificate_arn)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (job_id) 
        DO UPDATE SET 
          status = EXCLUDED.status,
          attempts = EXCLUDED.attempts,
          last_attempt = EXCLUDED.last_attempt,
          error = EXCLUDED.error,
          completed_at = EXCLUDED.completed_at,
          previous_certificate_arn = EXCLUDED.previous_certificate_arn,
          new_certificate_arn = EXCLUDED.new_certificate_arn,
          updated_at = NOW()
      `, [
        job.id,
        job.certificateId,
        job.scheduledAt,
        job.status,
        job.attempts,
        job.lastAttempt,
        job.error,
        job.completedAt,
        job.previousCertificateArn,
        job.newCertificateArn
      ]);
    } catch (error) {
      logger.error('Failed to persist rotation job', { jobId: job.id, error });
      throw error;
    }
  }

  private async updateRotationJob(job: CertificateRotationJob): Promise<void> {
    try {
      await this.dbPool.query(`
        UPDATE certificate_rotations 
        SET status = $1, attempts = $2, last_attempt = $3, 
            error = $4, completed_at = $5, previous_certificate_arn = $6,
            new_certificate_arn = $7, updated_at = NOW()
        WHERE job_id = $8
      `, [
        job.status,
        job.attempts,
        job.lastAttempt,
        job.error,
        job.completedAt,
        job.previousCertificateArn,
        job.newCertificateArn,
        job.id
      ]);
    } catch (error) {
      logger.error('Failed to update rotation job', { jobId: job.id, error });
      // Don't throw - this shouldn't break the rotation process
    }
  }
}

// Legacy export for backward compatibility
export const initializeTrustedRootCertificates = () => {
  logger.warn('initializeTrustedRootCertificates is deprecated - use CertificateRotationService instead');
  return Promise.resolve();
};
