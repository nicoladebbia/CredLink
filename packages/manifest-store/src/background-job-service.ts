// Phase 21.5 Background Jobs with DR Pause/Resume Semantics
// Anchors and rotations with leader election and failover support

export interface JobConfig {
  job_id: string;
  job_type: 'anchor' | 'rotation' | 'cleanup' | 'replication';
  tenant_id?: string;
  schedule_cron: string;
  timeout_seconds: number;
  retry_attempts: number;
  dr_mode: 'pause' | 'resume' | 'failover';
}

export interface JobState {
  job_id: string;
  status: 'idle' | 'running' | 'paused' | 'failed';
  last_run_at?: string;
  last_completed_period?: string;
  next_run_at?: string;
  consecutive_failures: number;
  error?: string;
  fence_token: string;
  leader_id?: string;
  dr_paused: boolean;
  dr_pause_reason?: string;
}

export interface JobExecutionResult {
  success: boolean;
  duration_ms: number;
  processed_items?: number;
  error?: string;
  should_retry: boolean;
}

export class BackgroundJobService {
  private jobs: Map<string, JobState> = new Map();
  private jobConfigs: Map<string, JobConfig> = new Map();
  private executionTimers: Map<string, NodeJS.Timeout> = new Map();
  private isLeader: boolean = false;
  private leaderId: string = '';
  private fenceToken: string = '';
  
  private readonly MAX_JOB_ID_LENGTH = 100;
  private readonly MAX_TENANT_ID_LENGTH = 100;
  private readonly MAX_CRON_LENGTH = 50;
  private readonly MAX_TIMEOUT_SECONDS = 3600; // 1 hour max
  private readonly MAX_RETRY_ATTEMPTS = 10;
  private readonly MAX_ERROR_LENGTH = 500;
  private readonly MAX_REASON_LENGTH = 200;
  private readonly VALID_JOB_TYPES = ['anchor', 'rotation', 'cleanup', 'replication'];
  private readonly VALID_DR_MODES = ['pause', 'resume', 'failover'];
  private readonly VALID_CRON_PATTERNS = [
    '*/5 * * * *', // Every 5 minutes
    '*/1 * * * *', // Every minute
    '*/15 * * * *', // Every 15 minutes
    '0 */6 * * *', // Every 6 hours
    '0 2 * * *'    // Daily at 2 AM
  ];

  constructor(
    private leaderElectionService: any,
    private replicationService: any,
    private consistencyChecker: any
  ) {
    this.validateConstructor();
    this.setupLeaderElectionHandlers();
  }

  private validateConstructor(): void {
    if (!this.leaderElectionService) {
      throw new Error('Leader election service is required');
    }
    
    if (!this.replicationService) {
      throw new Error('Replication service is required');
    }
    
    if (!this.consistencyChecker) {
      throw new Error('Consistency checker is required');
    }
  }

  private sanitizeError(error: string): string {
    if (!error) return 'Unknown error';
    return error.substring(0, this.MAX_ERROR_LENGTH).replace(/[<>\"']/g, '');
  }

  private sanitizeReason(reason: string): string {
    if (!reason) return 'Unknown reason';
    return reason.substring(0, this.MAX_REASON_LENGTH).replace(/[<>\"']/g, '');
  }

  private validateJobId(jobId: string): boolean {
    return jobId && 
           jobId.length > 0 && 
           jobId.length <= this.MAX_JOB_ID_LENGTH &&
           /^[a-zA-Z0-9_-]+$/.test(jobId);
  }

  private validateTenantId(tenantId?: string): boolean {
    if (!tenantId) return true; // Optional
    return tenantId.length > 0 && 
           tenantId.length <= this.MAX_TENANT_ID_LENGTH &&
           /^[a-zA-Z0-9_-]+$/.test(tenantId);
  }

  private validateCronExpression(cron: string): boolean {
    if (!cron || cron.length > this.MAX_CRON_LENGTH) {
      return false;
    }
    
    return this.VALID_CRON_PATTERNS.includes(cron.trim());
  }

  private validateJobConfig(config: JobConfig): boolean {
    return this.validateJobId(config.job_id) &&
           this.VALID_JOB_TYPES.includes(config.job_type) &&
           this.validateTenantId(config.tenant_id) &&
           this.validateCronExpression(config.schedule_cron) &&
           Number.isInteger(config.timeout_seconds) && 
           config.timeout_seconds > 0 && 
           config.timeout_seconds <= this.MAX_TIMEOUT_SECONDS &&
           Number.isInteger(config.retry_attempts) && 
           config.retry_attempts >= 0 && 
           config.retry_attempts <= this.MAX_RETRY_ATTEMPTS &&
           this.VALID_DR_MODES.includes(config.dr_mode);
  }

  private validateDRMode(mode: string): boolean {
    return this.VALID_DR_MODES.includes(mode);
  }

  /**
   * Start the background job service
   */
  async start(): Promise<void> {
    console.log('Starting background job service...');

    // Register default jobs
    await this.registerDefaultJobs();

    // Start leader election
    await this.leaderElectionService.start();

    console.log('Background job service started');
  }

  /**
   * Stop the background job service
   */
  async stop(): Promise<void> {
    console.log('Stopping background job service...');

    // Stop all job timers
    for (const [jobId, timer] of this.executionTimers) {
      if (timer) {
        clearTimeout(timer);
      }
    }
    this.executionTimers.clear();

    // Stop leader election
    await this.leaderElectionService.stop();

    console.log('Background job service stopped');
  }

  /**
   * Register a new background job
   */
  async registerJob(config: JobConfig): Promise<void> {
    try {
      // Validate input
      if (!this.validateJobConfig(config)) {
        throw new Error('Invalid job configuration');
      }

      console.log('Registering background job:', {
        job_id: config.job_id,
        job_type: config.job_type,
        tenant_id: config.tenant_id,
        schedule: config.schedule_cron
      });

      this.jobConfigs.set(config.job_id, config);

      // Initialize job state
      const jobState: JobState = {
        job_id: config.job_id,
        status: 'idle',
        consecutive_failures: 0,
        fence_token: '',
        dr_paused: false
      };

      this.jobs.set(config.job_id, jobState);

      // Schedule the job if we're the leader
      if (this.isLeader) {
        this.scheduleJob(config.job_id);
      }
    } catch (error) {
      throw new Error(`Failed to register job: ${this.sanitizeError(error instanceof Error ? error.message : 'Unknown error')}`);
    }
  }

  /**
   * Handle DR event - pause or resume jobs based on mode
   */
  async handleDREvent(mode: 'pause' | 'resume' | 'failover', reason?: string): Promise<void> {
    try {
      // Validate input
      if (!this.validateDRMode(mode)) {
        throw new Error('Invalid DR mode');
      }

      if (reason && reason.length > this.MAX_REASON_LENGTH) {
        throw new Error('Reason too long');
      }

      const sanitizedReason = reason ? this.sanitizeReason(reason) : 'DR event';

      console.log('Handling DR event:', { mode, reason: sanitizedReason });

      for (const [jobId, jobState] of this.jobs) {
        const config = this.jobConfigs.get(jobId);
        if (!config) continue;

        switch (mode) {
          case 'pause':
            await this.pauseJob(jobId, sanitizedReason);
            break;

          case 'resume':
            if (jobState.dr_paused) {
              await this.resumeJob(jobId);
            }
            break;

          case 'failover':
            if (config.dr_mode === 'failover') {
              await this.handleFailoverJob(jobId);
            } else {
              await this.pauseJob(jobId, sanitizedReason);
            }
            break;
        }
      }
    } catch (error) {
      throw new Error(`Failed to handle DR event: ${this.sanitizeError(error instanceof Error ? error.message : 'Unknown error')}`);
    }
  }

  /**
   * Get job status for monitoring
   */
  getJobStatus(): Array<{
    job_id: string;
    job_type: string;
    tenant_id?: string;
    status: string;
    last_run_at?: string;
    next_run_at?: string;
    consecutive_failures: number;
    dr_paused: boolean;
    dr_pause_reason?: string;
  }> {
    return Array.from(this.jobs.values()).map(jobState => {
      const config = this.jobConfigs.get(jobState.job_id);
      return {
        job_id: jobState.job_id,
        job_type: config?.job_type || 'unknown',
        tenant_id: config?.tenant_id,
        status: jobState.status,
        last_run_at: jobState.last_run_at,
        next_run_at: jobState.next_run_at,
        consecutive_failures: jobState.consecutive_failures,
        dr_paused: jobState.dr_paused,
        dr_pause_reason: jobState.dr_pause_reason
      };
    });
  }

  // Private helper methods

  private async registerDefaultJobs(): Promise<void> {
    // Anchor job - timestamps new manifests
    await this.registerJob({
      job_id: 'anchor-timestamps',
      job_type: 'anchor',
      schedule_cron: '*/5 * * * *', // Every 5 minutes
      timeout_seconds: 300,
      retry_attempts: 3,
      dr_mode: 'pause'
    });

    // Rotation job - refreshes expiring timestamps
    await this.registerJob({
      job_id: 'rotation-timestamps',
      job_type: 'rotation',
      schedule_cron: '0 */6 * * *', // Every 6 hours
      timeout_seconds: 600,
      retry_attempts: 3,
      dr_mode: 'resume'
    });

    // Cleanup job - removes old temporary data
    await this.registerJob({
      job_id: 'cleanup-temp-data',
      job_type: 'cleanup',
      schedule_cron: '0 2 * * *', // Daily at 2 AM
      timeout_seconds: 1800,
      retry_attempts: 2,
      dr_mode: 'pause'
    });

    // Replication job - processes async replication queue
    await this.registerJob({
      job_id: 'replication-queue',
      job_type: 'replication',
      schedule_cron: '*/1 * * * *', // Every minute
      timeout_seconds: 120,
      retry_attempts: 3,
      dr_mode: 'resume'
    });

    // Consistency check job - verifies regional consistency
    await this.registerJob({
      job_id: 'consistency-check',
      job_type: 'cleanup',
      schedule_cron: '*/15 * * * *', // Every 15 minutes
      timeout_seconds: 300,
      retry_attempts: 2,
      dr_mode: 'pause'
    });
  }

  private setupLeaderElectionHandlers(): void {
    // Handle leadership acquisition
    this.leaderElectionService.on('leadership_acquired', async (lease: any) => {
      console.log('Leadership acquired, scheduling all jobs');
      this.isLeader = true;
      this.leaderId = lease.leader_id;
      this.fenceToken = lease.fence_token;

      // Schedule all jobs
      for (const jobId of this.jobConfigs.keys()) {
        this.scheduleJob(jobId);
      }
    });

    // Handle leadership loss
    this.leaderElectionService.on('leadership_lost', async () => {
      console.log('Leadership lost, stopping all jobs');
      this.isLeader = false;
      this.leaderId = '';
      this.fenceToken = '';

      // Stop all job timers
      for (const [jobId, timer] of this.executionTimers) {
        if (timer) {
          clearTimeout(timer);
        }
      }
      this.executionTimers.clear();

      // Update job states
      for (const jobState of this.jobs.values()) {
        if (jobState.status === 'running') {
          jobState.status = 'idle';
        }
      }
    });
  }

  private scheduleJob(jobId: string): void {
    const config = this.jobConfigs.get(jobId);
    const jobState = this.jobs.get(jobId);
    
    if (!config || !jobState) {
      console.warn(`Cannot schedule job ${jobId}: missing config or state`);
      return;
    }

    // Validate job ID before scheduling
    if (!this.validateJobId(jobId)) {
      console.warn(`Invalid job ID format: ${jobId}`);
      return;
    }

    // Clear existing timer
    const existingTimer = this.executionTimers.get(jobId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.executionTimers.delete(jobId);
    }

    // Calculate next run time
    const nextRunTime = this.calculateNextRunTime(config.schedule_cron);
    jobState.next_run_at = nextRunTime.toISOString();

    const delayMs = nextRunTime.getTime() - Date.now();
    
    // Validate delay
    if (delayMs < 0 || delayMs > 24 * 60 * 60 * 1000) { // Max 24 hours
      console.warn(`Invalid delay for job ${jobId}: ${delayMs}ms`);
      return;
    }
    
    console.log(`Scheduling job ${jobId} to run in ${Math.round(delayMs / 1000)} seconds`);

    const timer = setTimeout(async () => {
      await this.executeJob(jobId);
      
      // Schedule next run if still leader
      if (this.isLeader) {
        this.scheduleJob(jobId);
      }
    }, delayMs) as NodeJS.Timeout;

    this.executionTimers.set(jobId, timer);
  }

  private async executeJob(jobId: string): Promise<void> {
    const config = this.jobConfigs.get(jobId);
    const jobState = this.jobs.get(jobId);
    
    if (!config || !jobState) {
      return;
    }

    // Validate job ID
    if (!this.validateJobId(jobId)) {
      console.warn(`Invalid job ID format: ${jobId}`);
      return;
    }

    // Check if job is paused for DR
    if (jobState.dr_paused) {
      console.log(`Job ${jobId} is paused for DR, skipping execution`);
      return;
    }

    // Check if we're still the leader
    if (!this.isLeader) {
      console.log(`Not leader anymore, skipping job ${jobId}`);
      return;
    }

    console.log(`Executing job ${jobId} (type: ${config.job_type})`);

    const startTime = Date.now();
    jobState.status = 'running';
    jobState.last_run_at = new Date().toISOString();

    try {
      // Start job with leader coordination
      const jobResult = await this.leaderElectionService.startJob(
        jobId,
        config.job_type,
        config.tenant_id
      );

      if (!jobResult.success) {
        throw new Error(jobResult.error || 'Failed to start job');
      }

      // Execute the actual job
      const executionResult = await this.runJobExecution(config);

      // Complete job with leader coordination
      const completeResult = await this.leaderElectionService.completeJob(
        jobId,
        jobResult.job_fence_token,
        this.getCurrentPeriod(config.schedule_cron)
      );

      if (!completeResult.success) {
        throw new Error(completeResult.error || 'Failed to complete job');
      }

      // Update job state on success
      jobState.status = 'idle';
      jobState.consecutive_failures = 0;
      jobState.last_completed_period = this.getCurrentPeriod(config.schedule_cron);
      jobState.error = undefined;

      console.log(`Job ${jobId} completed successfully`, {
        duration_ms: Date.now() - startTime,
        processed_items: executionResult.processed_items
      });

    } catch (error) {
      const errorMsg = this.sanitizeError(error instanceof Error ? error.message : 'Unknown error');
      
      // Fail job with leader coordination
      await this.leaderElectionService.failJob(jobId, this.fenceToken, errorMsg);

      // Update job state on failure
      jobState.status = 'failed';
      jobState.consecutive_failures += 1;
      jobState.error = errorMsg;

      console.error(`Job ${jobId} failed`, {
        error: errorMsg,
        consecutive_failures: jobState.consecutive_failures,
        duration_ms: Date.now() - startTime
      });

      // Check if we should retry
      if (jobState.consecutive_failures < config.retry_attempts) {
        console.log(`Retrying job ${jobId} (attempt ${jobState.consecutive_failures + 1}/${config.retry_attempts})`);
        
        // Schedule retry with exponential backoff
        const retryDelayMs = Math.min(300000, Math.pow(2, jobState.consecutive_failures) * 30000); // Max 5 minutes
        
        // Validate retry delay
        if (retryDelayMs > 0 && retryDelayMs <= 300000) {
          const retryTimer = setTimeout(async () => {
            if (this.isLeader) {
              await this.executeJob(jobId);
            }
          }, retryDelayMs) as NodeJS.Timeout;
          
          this.executionTimers.set(jobId, retryTimer);
        } else {
          console.warn(`Invalid retry delay for job ${jobId}: ${retryDelayMs}ms`);
        }
      } else {
        console.error(`Job ${jobId} exceeded max retry attempts, marking as failed`);
      }
    }
  }

  private async runJobExecution(config: JobConfig): Promise<JobExecutionResult> {
    const startTime = Date.now();

    try {
      // Validate job type before execution
      if (!this.VALID_JOB_TYPES.includes(config.job_type)) {
        throw new Error(`Unknown job type: ${config.job_type}`);
      }

      switch (config.job_type) {
        case 'anchor':
          return await this.executeAnchorJob(config);
        
        case 'rotation':
          return await this.executeRotationJob(config);
        
        case 'cleanup':
          return await this.executeCleanupJob(config);
        
        case 'replication':
          return await this.executeReplicationJob(config);
        
        default:
          throw new Error(`Unknown job type: ${config.job_type}`);
      }

    } catch (error) {
      const errorMsg = this.sanitizeError(error instanceof Error ? error.message : 'Unknown error');
      return {
        success: false,
        duration_ms: Date.now() - startTime,
        error: errorMsg,
        should_retry: true
      };
    }
  }

  private async executeAnchorJob(config: JobConfig): Promise<JobExecutionResult> {
    // This would implement timestamp anchoring for new manifests
    // Placeholder implementation
    console.log('Executing anchor job...');
    
    // Simulate processing
    await new Promise(resolve => setTimeout(resolve, 5000));

    return {
      success: true,
      duration_ms: 5000,
      processed_items: 10,
      should_retry: false
    };
  }

  private async executeRotationJob(config: JobConfig): Promise<JobExecutionResult> {
    // This would implement timestamp rotation for expiring manifests
    // Placeholder implementation
    console.log('Executing rotation job...');
    
    // Simulate processing
    await new Promise(resolve => setTimeout(resolve, 10000));

    return {
      success: true,
      duration_ms: 10000,
      processed_items: 5,
      should_retry: false
    };
  }

  private async executeCleanupJob(config: JobConfig): Promise<JobExecutionResult> {
    // This would implement cleanup of old temporary data
    // Placeholder implementation
    console.log('Executing cleanup job...');
    
    // Simulate processing
    await new Promise(resolve => setTimeout(resolve, 3000));

    return {
      success: true,
      duration_ms: 3000,
      processed_items: 50,
      should_retry: false
    };
  }

  private async executeReplicationJob(config: JobConfig): Promise<JobExecutionResult> {
    // Process replication queue
    const result = await this.replicationService.processReplicationQueue();
    
    return {
      success: result.failed_count === 0,
      duration_ms: 0, // Would be measured in actual implementation
      processed_items: result.processed_count,
      should_retry: result.failed_count > 0
    };
  }

  private async pauseJob(jobId: string, reason: string): Promise<void> {
    const jobState = this.jobs.get(jobId);
    if (!jobState) return;

    // Validate inputs
    if (!this.validateJobId(jobId)) {
      console.warn(`Invalid job ID format: ${jobId}`);
      return;
    }

    if (!reason || reason.length > this.MAX_REASON_LENGTH) {
      console.warn(`Invalid pause reason for job ${jobId}`);
      return;
    }

    const sanitizedReason = this.sanitizeReason(reason);

    console.log(`Pausing job ${jobId}: ${sanitizedReason}`);

    // Clear timer
    const timer = this.executionTimers.get(jobId);
    if (timer) {
      clearTimeout(timer);
      this.executionTimers.delete(jobId);
    }

    // Update state
    jobState.dr_paused = true;
    jobState.dr_pause_reason = sanitizedReason;
    if (jobState.status === 'running') {
      jobState.status = 'paused';
    }
  }

  private async resumeJob(jobId: string): Promise<void> {
    const jobState = this.jobs.get(jobId);
    const config = this.jobConfigs.get(jobId);
    
    if (!jobState || !config) return;

    // Validate job ID
    if (!this.validateJobId(jobId)) {
      console.warn(`Invalid job ID format: ${jobId}`);
      return;
    }

    console.log(`Resuming job ${jobId}`);

    // Update state
    jobState.dr_paused = false;
    jobState.dr_pause_reason = undefined;
    if (jobState.status === 'paused') {
      jobState.status = 'idle';
    }

    // Reschedule if we're the leader
    if (this.isLeader) {
      this.scheduleJob(jobId);
    }
  }

  private async handleFailoverJob(jobId: string): Promise<void> {
    const config = this.jobConfigs.get(jobId);
    if (!config) return;

    // Validate job ID
    if (!this.validateJobId(jobId)) {
      console.warn(`Invalid job ID format: ${jobId}`);
      return;
    }

    console.log(`Handling failover for job ${jobId}`);

    // For failover mode, we might want to:
    // 1. Pause critical jobs that could cause split-brain
    // 2. Continue read-only jobs like consistency checks
    // 3. Resume replication jobs to catch up

    switch (config.job_type) {
      case 'anchor':
      case 'rotation':
        // Pause write operations during failover
        await this.pauseJob(jobId, 'Failover mode - write operations paused');
        break;
      
      case 'replication':
      case 'cleanup':
        // Continue read-only operations
        await this.resumeJob(jobId);
        break;
    }
  }

  private calculateNextRunTime(cronExpression: string): Date {
    // Validate cron expression before parsing
    if (!this.validateCronExpression(cronExpression)) {
      console.warn(`Invalid cron expression: ${cronExpression}`);
      // Default to 1 hour from now
      return new Date(Date.now() + 60 * 60 * 1000);
    }

    const now = new Date();
    
    if (cronExpression.includes('*/5 * * * *')) {
      // Every 5 minutes
      return new Date(now.getTime() + 5 * 60 * 1000);
    } else if (cronExpression.includes('*/1 * * * *')) {
      // Every minute
      return new Date(now.getTime() + 1 * 60 * 1000);
    } else if (cronExpression.includes('*/15 * * * *')) {
      // Every 15 minutes
      return new Date(now.getTime() + 15 * 60 * 1000);
    } else if (cronExpression.includes('0 */6 * * *')) {
      // Every 6 hours
      return new Date(now.getTime() + 6 * 60 * 60 * 1000);
    } else if (cronExpression.includes('0 2 * * *')) {
      // Daily at 2 AM
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(2, 0, 0, 0);
      return tomorrow;
    }
    
    // Default to 1 hour
    return new Date(now.getTime() + 60 * 60 * 1000);
  }

  private getCurrentPeriod(cronExpression: string): string {
    // Validate cron expression before parsing
    if (!this.validateCronExpression(cronExpression)) {
      console.warn(`Invalid cron expression: ${cronExpression}`);
      // Default to current hour
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}:00`;
    }

    const now = new Date();
    
    if (cronExpression.includes('*/5 * * * *')) {
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(Math.floor(now.getMinutes() / 5) * 5).padStart(2, '0')}:00`;
    } else if (cronExpression.includes('*/1 * * * *')) {
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:00`;
    } else if (cronExpression.includes('0 */6 * * *')) {
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(Math.floor(now.getHours() / 6) * 6).padStart(2, '0')}:00`;
    } else if (cronExpression.includes('0 2 * * *')) {
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T02:00`;
    }
    
    // Default to hourly
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}:00`;
  }
}
