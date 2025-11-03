// Phase 21.3 Leader Election Service
// Client service for interacting with Leader Coordinator Durable Object

export interface DurableObjectStub {
  fetch(request: Request): Promise<Response>;
}

export interface LeaderElectionConfig {
  instance_id: string;
  region: string;
  lease_renewal_interval_seconds: number;
  heartbeat_interval_seconds: number;
  max_lease_renewal_attempts: number;
}

export interface JobCoordinator {
  startJob(
    jobId: string,
    jobType: 'anchor' | 'rotation' | 'cleanup',
    tenantId?: string
  ): Promise<{ success: boolean; job_fence_token: string; error?: string }>;
  
  completeJob(
    jobId: string,
    jobFenceToken: string,
    completedPeriod?: string
  ): Promise<{ success: boolean; error?: string }>;
  
  failJob(
    jobId: string,
    jobFenceToken: string,
    error: string
  ): Promise<{ success: boolean; error?: string }>;
}

export class LeaderElectionService implements JobCoordinator {
  private isLeader: boolean = false;
  private lease: any = null;
  private fenceToken: string = '';
  private renewalTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private activeJobs: Map<string, string> = new Map(); // jobId -> jobFenceToken
  private readonly DO_BASE_URL = 'https://do';
  private readonly MAX_ERROR_LENGTH = 500;
  private readonly MAX_JOB_ID_LENGTH = 255;
  private readonly MAX_INSTANCE_ID_LENGTH = 255;
  private readonly MAX_REGION_LENGTH = 50;

  constructor(
    private config: LeaderElectionConfig,
    private leaderCoordinatorDO: DurableObjectStub
  ) {
    this.validateConfig();
  }

  private validateConfig(): void {
    if (!this.config.instance_id || 
        this.config.instance_id.length < 1 || 
        this.config.instance_id.length > this.MAX_INSTANCE_ID_LENGTH) {
      throw new Error('Invalid instance_id in configuration');
    }

    if (!this.config.region || 
        this.config.region.length < 1 || 
        this.config.region.length > this.MAX_REGION_LENGTH) {
      throw new Error('Invalid region in configuration');
    }

    if (this.config.lease_renewal_interval_seconds < 1 || 
        this.config.lease_renewal_interval_seconds > 300) {
      throw new Error('Invalid lease_renewal_interval_seconds (must be 1-300)');
    }

    if (this.config.heartbeat_interval_seconds < 1 || 
        this.config.heartbeat_interval_seconds > 300) {
      throw new Error('Invalid heartbeat_interval_seconds (must be 1-300)');
    }
  }

  private sanitizeError(error: string): string {
    if (!error) return 'Unknown error';
    return error.substring(0, this.MAX_ERROR_LENGTH).replace(/[<>\"']/g, '');
  }

  private validateJobId(jobId: string): boolean {
    return jobId && jobId.length > 0 && jobId.length <= this.MAX_JOB_ID_LENGTH;
  }

  private async safeFetch(request: Request): Promise<Response> {
    try {
      const response = await this.leaderCoordinatorDO.fetch(request);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return response;
    } catch (error) {
      console.error('Durable Object fetch failed:', error instanceof Error ? error.message : 'Unknown error');
      throw new Error('Communication with coordinator failed');
    }
  }

  private async safeJsonParse<T>(response: Response): Promise<T> {
    try {
      const text = await response.text();
      if (!text) {
        throw new Error('Empty response body');
      }
      return JSON.parse(text) as T;
    } catch (error) {
      console.error('JSON parse failed:', error instanceof Error ? error.message : 'Unknown error');
      throw new Error('Invalid response format');
    }
  }

  /**
   * Start the leader election process
   */
  async start(): Promise<void> {
    console.log('Starting leader election:', {
      instance_id: this.config.instance_id,
      region: this.config.region
    });

    // Request leadership
    await this.requestLeadership();

    // Start renewal timer if we got leadership
    if (this.isLeader) {
      this.startRenewalTimer();
      this.startHeartbeatTimer();
    }
  }

  /**
   * Stop the leader election process
   */
  async stop(): Promise<void> {
    console.log('Stopping leader election:', {
      instance_id: this.config.instance_id,
      is_leader: this.isLeader
    });

    // Clear timers
    if (this.renewalTimer) {
      clearInterval(this.renewalTimer);
      this.renewalTimer = null;
    }

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    // Release leadership if we have it
    if (this.isLeader) {
      await this.releaseLeadership();
    }
  }

  /**
   * Check if this instance is the current leader
   */
  isCurrentLeader(): boolean {
    return this.isLeader && this.lease && this.isLeaseValid(this.lease);
  }

  /**
   * Get current leadership status
   */
  async getStatus(): Promise<{
    is_leader: boolean;
    lease?: any;
    active_jobs_count: number;
    region: string;
    instance_id: string;
    do_status?: any;
  }> {
    try {
      const response = await this.safeFetch(
        new Request(`${this.DO_BASE_URL}/status`, { method: 'GET' })
      );
      
      const status = await this.safeJsonParse<any>(response);

      return {
        is_leader: this.isLeader,
        lease: this.lease,
        active_jobs_count: this.activeJobs.size,
        region: this.config.region,
        instance_id: this.config.instance_id,
        do_status: status
      };

    } catch (error) {
      console.error('Failed to get leadership status:', error instanceof Error ? error.message : 'Unknown error');
      return {
        is_leader: false,
        active_jobs_count: 0,
        region: this.config.region,
        instance_id: this.config.instance_id
      };
    }
  }

  /**
   * Force leadership transfer to another instance
   */
  async forceLeadershipTransfer(newLeaderId: string, region: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      // Validate inputs
      if (!newLeaderId || newLeaderId.length < 1 || newLeaderId.length > this.MAX_INSTANCE_ID_LENGTH) {
        return { success: false, error: 'Invalid new leader ID' };
      }

      if (!region || region.length < 1 || region.length > this.MAX_REGION_LENGTH) {
        return { success: false, error: 'Invalid region' };
      }

      const response = await this.safeFetch(
        new Request(`${this.DO_BASE_URL}/force-transfer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            new_leader_id: newLeaderId,
            region: region
          })
        })
      );

      const result = await this.safeJsonParse<any>(response);

      if (result.success) {
        // If we were the leader, we're not anymore
        if (this.isLeader) {
          this.isLeader = false;
          this.lease = null;
          this.fenceToken = '';
          this.activeJobs.clear();
          
          // Stop timers
          if (this.renewalTimer) {
            clearInterval(this.renewalTimer);
            this.renewalTimer = null;
          }
          
          if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
          }
        }

        console.log('Leadership transferred:', {
          from_instance_id: this.config.instance_id,
          to_instance_id: newLeaderId,
          region: region
        });
      }

      return result;

    } catch (error) {
      const errorMsg = this.sanitizeError(error instanceof Error ? error.message : 'Unknown error');
      console.error('Failed to force leadership transfer:', errorMsg);
      return { success: false, error: 'Internal error' };
    }
  }

  // Job Coordinator implementation

  async startJob(
    jobId: string,
    jobType: 'anchor' | 'rotation' | 'cleanup',
    tenantId?: string
  ): Promise<{ success: boolean; job_fence_token: string; error?: string }> {
    if (!this.isCurrentLeader()) {
      return { success: false, job_fence_token: '', error: 'Not current leader' };
    }

    try {
      // Validate inputs
      if (!this.validateJobId(jobId)) {
        return { success: false, job_fence_token: '', error: 'Invalid job ID' };
      }

      if (!['anchor', 'rotation', 'cleanup'].includes(jobType)) {
        return { success: false, job_fence_token: '', error: 'Invalid job type' };
      }

      if (tenantId && tenantId.length > 100) {
        return { success: false, job_fence_token: '', error: 'Invalid tenant ID' };
      }

      const response = await this.safeFetch(
        new Request(`${this.DO_BASE_URL}/start-job`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            job_id: jobId,
            job_type: jobType,
            tenant_id: tenantId,
            leader_id: this.config.instance_id,
            fence_token: this.fenceToken
          })
        })
      );

      const result = await this.safeJsonParse<any>(response);

      if (result.success) {
        this.activeJobs.set(jobId, result.job_fence_token);
      }

      return result;

    } catch (error) {
      const errorMsg = this.sanitizeError(error instanceof Error ? error.message : 'Unknown error');
      console.error('Failed to start job:', { job_id: jobId, error: errorMsg });
      return { success: false, job_fence_token: '', error: 'Internal error' };
    }
  }

  async completeJob(
    jobId: string,
    jobFenceToken: string,
    completedPeriod?: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.isCurrentLeader()) {
      return { success: false, error: 'Not current leader' };
    }

    try {
      // Validate inputs
      if (!this.validateJobId(jobId)) {
        return { success: false, error: 'Invalid job ID' };
      }

      if (!jobFenceToken || jobFenceToken.length !== 32) {
        return { success: false, error: 'Invalid job fence token' };
      }

      if (completedPeriod && completedPeriod.length > 50) {
        return { success: false, error: 'Invalid completed period' };
      }

      const response = await this.safeFetch(
        new Request(`${this.DO_BASE_URL}/complete-job`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            job_id: jobId,
            leader_id: this.config.instance_id,
            fence_token: this.fenceToken,
            job_fence_token: jobFenceToken,
            completed_period: completedPeriod
          })
        })
      );

      const result = await this.safeJsonParse<any>(response);

      if (result.success) {
        this.activeJobs.delete(jobId);
      }

      return result;

    } catch (error) {
      const errorMsg = this.sanitizeError(error instanceof Error ? error.message : 'Unknown error');
      console.error('Failed to complete job:', { job_id: jobId, error: errorMsg });
      return { success: false, error: 'Internal error' };
    }
  }

  async failJob(
    jobId: string,
    jobFenceToken: string,
    error: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.isCurrentLeader()) {
      return { success: false, error: 'Not current leader' };
    }

    try {
      // Validate inputs
      if (!this.validateJobId(jobId)) {
        return { success: false, error: 'Invalid job ID' };
      }

      if (!jobFenceToken || jobFenceToken.length !== 32) {
        return { success: false, error: 'Invalid job fence token' };
      }

      const sanitizedError = this.sanitizeError(error);

      const response = await this.safeFetch(
        new Request(`${this.DO_BASE_URL}/fail-job`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            job_id: jobId,
            leader_id: this.config.instance_id,
            fence_token: this.fenceToken,
            job_fence_token: jobFenceToken,
            error: sanitizedError
          })
        })
      );

      const result = await this.safeJsonParse<any>(response);

      if (result.success) {
        this.activeJobs.delete(jobId);
      }

      return result;

    } catch (error) {
      const errorMsg = this.sanitizeError(error instanceof Error ? error.message : 'Unknown error');
      console.error('Failed to fail job:', { job_id: jobId, error: errorMsg });
      return { success: false, error: 'Internal error' };
    }
  }

  // Private helper methods

  private async requestLeadership(): Promise<void> {
    try {
      const response = await this.safeFetch(
        new Request(`${this.DO_BASE_URL}/request-leadership`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requester_id: this.config.instance_id,
            region: this.config.region,
            timestamp: new Date().toISOString()
          })
        })
      );

      const result = await this.safeJsonParse<any>(response);

      if (result.is_leader) {
        this.isLeader = true;
        this.lease = result.lease;
        this.fenceToken = result.fence_token;
        
        console.log('Leadership acquired:', {
          instance_id: this.config.instance_id,
          lease_id: this.lease.lease_id,
          expires_at: this.lease.expires_at
        });
      } else {
        this.isLeader = false;
        this.lease = null;
        this.fenceToken = '';
        
        console.log('Leadership denied:', {
          instance_id: this.config.instance_id,
          error: result.error
        });
      }

    } catch (error) {
      console.error('Failed to request leadership:', error instanceof Error ? error.message : 'Unknown error');
      this.isLeader = false;
      this.lease = null;
      this.fenceToken = '';
    }
  }

  private async renewLeadership(): Promise<void> {
    if (!this.isLeader || !this.lease) {
      return;
    }

    try {
      const response = await this.safeFetch(
        new Request(`${this.DO_BASE_URL}/renew-leadership`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            leader_id: this.config.instance_id,
            fence_token: this.fenceToken
          })
        })
      );

      const result = await this.safeJsonParse<any>(response);

      if (result.success) {
        this.lease = result.lease;
        
        console.log('Leadership renewed:', {
          instance_id: this.config.instance_id,
          lease_id: this.lease.lease_id,
          expires_at: this.lease.expires_at
        });
      } else {
        console.warn('Leadership renewal failed:', {
          instance_id: this.config.instance_id,
          error: result.error
        });
        
        // Lost leadership, stop being leader
        this.isLeader = false;
        this.lease = null;
        this.fenceToken = '';
        this.activeJobs.clear();
        
        // Stop timers
        if (this.renewalTimer) {
          clearInterval(this.renewalTimer);
          this.renewalTimer = null;
        }
        
        if (this.heartbeatTimer) {
          clearInterval(this.heartbeatTimer);
          this.heartbeatTimer = null;
        }
        
        // Try to request leadership again after a delay
        setTimeout(() => {
          this.requestLeadership().then(() => {
            if (this.isLeader) {
              this.startRenewalTimer();
              this.startHeartbeatTimer();
            }
          }).catch(error => {
            console.error('Leadership re-request failed:', error instanceof Error ? error.message : 'Unknown error');
          });
        }, 5000); // 5 second delay
      }

    } catch (error) {
      console.error('Failed to renew leadership:', error instanceof Error ? error.message : 'Unknown error');
      
      // Assume we lost leadership on error
      this.isLeader = false;
      this.lease = null;
      this.fenceToken = '';
      this.activeJobs.clear();
      
      // Stop timers
      if (this.renewalTimer) {
        clearInterval(this.renewalTimer);
        this.renewalTimer = null;
      }
      
      if (this.heartbeatTimer) {
        clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;
      }
    }
  }

  private async releaseLeadership(): Promise<void> {
    if (!this.isLeader || !this.lease) {
      return;
    }

    try {
      const response = await this.safeFetch(
        new Request(`${this.DO_BASE_URL}/release-leadership`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            leader_id: this.config.instance_id,
            fence_token: this.fenceToken
          })
        })
      );

      const result = await this.safeJsonParse<any>(response);

      if (result.success) {
        console.log('Leadership released:', {
          instance_id: this.config.instance_id
        });
      } else {
        console.warn('Leadership release failed:', {
          instance_id: this.config.instance_id,
          error: result.error
        });
      }

    } catch (error) {
      console.error('Failed to release leadership:', error instanceof Error ? error.message : 'Unknown error');
    }

    this.isLeader = false;
    this.lease = null;
    this.fenceToken = '';
    this.activeJobs.clear();
  }

  private startRenewalTimer(): void {
    if (this.renewalTimer) {
      clearInterval(this.renewalTimer);
    }

    this.renewalTimer = setInterval(
      () => {
        this.renewLeadership().catch(error => {
          console.error('Leadership renewal timer error:', error instanceof Error ? error.message : 'Unknown error');
        });
      },
      this.config.lease_renewal_interval_seconds * 1000
    );
  }

  private startHeartbeatTimer(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    this.heartbeatTimer = setInterval(
      () => {
        this.sendHeartbeat().catch(error => {
          console.error('Heartbeat timer error:', error instanceof Error ? error.message : 'Unknown error');
        });
      },
      this.config.heartbeat_interval_seconds * 1000
    );
  }

  private async sendHeartbeat(): Promise<void> {
    if (!this.isLeader || !this.lease) {
      return;
    }

    try {
      // Heartbeat is handled as part of lease renewal
      // This is mainly for monitoring purposes
      console.log('Heartbeat sent:', {
        instance_id: this.config.instance_id,
        active_jobs: this.activeJobs.size,
        lease_expires_at: this.lease.expires_at
      });

    } catch (error) {
      console.error('Failed to send heartbeat:', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  private isLeaseValid(lease: any): boolean {
    if (!lease || !lease.expires_at) {
      return false;
    }

    const now = new Date();
    const expiresAt = new Date(lease.expires_at);
    return now < expiresAt;
  }
}
