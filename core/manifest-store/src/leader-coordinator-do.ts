// Phase 21.3 Leader Election & Split-Brain Avoidance
// Cloudflare Durable Objects for single-writer coordination

import { timingSafeEqual } from 'crypto';

export interface LeaderLease {
  lease_id: string;
  leader_id: string;
  region: string;
  expires_at: string;
  last_heartbeat: string;
  fence_token: string;
}

export interface JobState {
  job_id: string;
  job_type: 'anchor' | 'rotation' | 'cleanup';
  tenant_id?: string;
  last_completed_period?: string;
  last_run_at?: string;
  status: 'idle' | 'running' | 'paused' | 'failed';
  fence_token: string;
  error?: string;
}

export interface LeadershipRequest {
  requester_id: string;
  region: string;
  timestamp: string;
}

export interface LeadershipResponse {
  is_leader: boolean;
  lease?: LeaderLease;
  fence_token: string;
  error?: string;
}

// Cloudflare Durable Object interfaces
export interface DurableObjectState {
  id: DurableObjectId;
  storage: DurableObjectStorage;
  blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T>;
}

export interface DurableObjectId {
  toString(): string;
}

export interface DurableObjectStorage {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: any): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface DurableObject {
  fetch(request: Request): Promise<Response>;
}

export interface DurableObjectStub {
  fetch(request: Request): Promise<Response>;
}

// Input validation schemas
const LEADERSHIP_REQUEST_SCHEMA = {
  required: ['requester_id', 'region', 'timestamp'],
  properties: {
    requester_id: { type: 'string', minLength: 1, maxLength: 255 },
    region: { type: 'string', minLength: 1, maxLength: 50 },
    timestamp: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}.*Z$' }
  }
};

const JOB_REQUEST_SCHEMA = {
  required: ['job_id', 'job_type', 'leader_id', 'fence_token'],
  properties: {
    job_id: { type: 'string', minLength: 1, maxLength: 255 },
    job_type: { type: 'string', enum: ['anchor', 'rotation', 'cleanup'] },
    tenant_id: { type: 'string', maxLength: 100 },
    leader_id: { type: 'string', minLength: 1, maxLength: 255 },
    fence_token: { type: 'string', minLength: 32, maxLength: 32 }
  }
};

export class LeaderCoordinator {
  private lease: LeaderLease | null = null;
  private jobs: Map<string, JobState> = new Map();
  private readonly LEASE_DURATION_SECONDS = 60; // 1 minute lease
  private readonly HEARTBEAT_INTERVAL_SECONDS = 15; // Heartbeat every 15 seconds
  private readonly FENCE_TOKEN_LENGTH = 32;
  private readonly MAX_LEASE_ID_LENGTH = 64;
  private readonly REQUEST_RATE_LIMIT = 10; // Max 10 requests per minute per leader
  private requestCounts: Map<string, { count: number; resetTime: number }> = new Map();

  constructor(private state: DurableObjectState, private env: any) {
    // Load existing state from storage
    this.state.blockConcurrencyWhile(async () => {
      await this.loadState();
    });
  }

  /**
   * Request leadership for background jobs coordination
   * Implements single-writer semantics with lease and fence tokens
   */
  async requestLeadership(request: LeadershipRequest): Promise<LeadershipResponse> {
    try {
      // Validate input
      const validation = this.validateLeadershipRequest(request);
      if (!validation.valid) {
        return {
          is_leader: false,
          fence_token: this.generateSecureFenceToken(),
          error: 'Invalid request format'
        };
      }

      // Rate limiting
      if (!this.checkRateLimit(request.requester_id)) {
        return {
          is_leader: false,
          fence_token: this.generateSecureFenceToken(),
          error: 'Rate limit exceeded'
        };
      }

      const now = new Date();
      
      // Check if current lease is still valid
      if (this.lease && this.isLeaseValid(this.lease)) {
        // Current lease is valid, check if requester is current leader
        if (this.lease.leader_id === request.requester_id) {
          // Renew lease for current leader
          this.lease.expires_at = new Date(now.getTime() + this.LEASE_DURATION_SECONDS * 1000).toISOString();
          this.lease.last_heartbeat = now.toISOString();
          await this.saveState();
          
          return {
            is_leader: true,
            lease: this.lease,
            fence_token: this.lease.fence_token
          };
        } else {
          // Another leader holds valid lease
          return {
            is_leader: false,
            fence_token: this.generateSecureFenceToken(),
            error: 'Leadership currently held by another instance'
          };
        }
      }

      // Lease is expired or doesn't exist, grant leadership to requester
      const newLease: LeaderLease = {
        lease_id: this.generateSecureLeaseId(),
        leader_id: request.requester_id,
        region: request.region,
        expires_at: new Date(now.getTime() + this.LEASE_DURATION_SECONDS * 1000).toISOString(),
        last_heartbeat: now.toISOString(),
        fence_token: this.generateSecureFenceToken()
      };

      this.lease = newLease;
      await this.saveState();

      console.log('Leadership granted:', {
        leader_id: request.requester_id,
        region: request.region,
        lease_id: newLease.lease_id,
        expires_at: newLease.expires_at
      });

      return {
        is_leader: true,
        lease: newLease,
        fence_token: newLease.fence_token
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Request failed';
      console.error('Leadership request failed:', { 
        requester_id: request.requester_id,
        error: errorMsg 
      });
      
      return {
        is_leader: false,
        fence_token: this.generateSecureFenceToken(),
        error: 'Internal error'
      };
    }
  }

  /**
   * Renew leadership lease
   */
  async renewLeadership(leaderId: string, fenceToken: string): Promise<{
    success: boolean;
    lease?: LeaderLease;
    error?: string;
  }> {
    try {
      if (!this.lease) {
        return { success: false, error: 'No active lease' };
      }

      // Use constant-time comparison for security
      if (!this.constantTimeEquals(this.lease.leader_id, leaderId)) {
        return { success: false, error: 'Invalid credentials' };
      }

      if (!this.constantTimeEquals(this.lease.fence_token, fenceToken)) {
        return { success: false, error: 'Invalid credentials' };
      }

      const now = new Date();
      this.lease.expires_at = new Date(now.getTime() + this.LEASE_DURATION_SECONDS * 1000).toISOString();
      this.lease.last_heartbeat = now.toISOString();
      
      await this.saveState();

      return { success: true, lease: this.lease };

    } catch (error) {
      console.error('Leadership renewal failed:', { leader_id: leaderId });
      return { success: false, error: 'Internal error' };
    }
  }

  /**
   * Release leadership voluntarily
   */
  async releaseLeadership(leaderId: string, fenceToken: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      if (!this.lease) {
        return { success: true }; // Already released
      }

      // Use constant-time comparison for security
      if (!this.constantTimeEquals(this.lease.leader_id, leaderId)) {
        return { success: false, error: 'Invalid credentials' };
      }

      if (!this.constantTimeEquals(this.lease.fence_token, fenceToken)) {
        return { success: false, error: 'Invalid credentials' };
      }

      // Clear lease and pause all jobs
      this.lease = null;
      for (const job of this.jobs.values()) {
        if (job.status === 'running') {
          job.status = 'idle';
        }
      }

      await this.saveState();

      console.log('Leadership released:', { leader_id: leaderId });

      return { success: true };

    } catch (error) {
      console.error('Leadership release failed:', { leader_id: leaderId });
      return { success: false, error: 'Internal error' };
    }
  }

  /**
   * Start a background job with split-brain protection
   */
  async startJob(
    jobId: string,
    jobType: 'anchor' | 'rotation' | 'cleanup',
    tenantId: string | undefined,
    leaderId: string,
    fenceToken: string
  ): Promise<{
    success: boolean;
    job_fence_token: string;
    error?: string;
  }> {
    try {
      // Validate input
      const validation = this.validateJobRequest({ job_id: jobId, job_type: jobType, tenant_id: tenantId, leader_id: leaderId, fence_token: fenceToken });
      if (!validation.valid) {
        return { success: false, job_fence_token: '', error: 'Invalid request format' };
      }

      // Verify leadership with constant-time comparison
      if (!this.lease || 
          !this.constantTimeEquals(this.lease.leader_id, leaderId) || 
          !this.constantTimeEquals(this.lease.fence_token, fenceToken)) {
        return { success: false, job_fence_token: '', error: 'Invalid credentials' };
      }

      // Check if job is already running
      const existingJob = this.jobs.get(jobId);
      if (existingJob && existingJob.status === 'running') {
        return { success: false, job_fence_token: '', error: 'Job already running' };
      }

      // Create/update job state
      const jobState: JobState = {
        job_id: jobId,
        job_type: jobType,
        tenant_id: tenantId,
        status: 'running',
        fence_token: this.generateSecureFenceToken(),
        last_run_at: new Date().toISOString()
      };

      this.jobs.set(jobId, jobState);
      await this.saveState();

      console.log('Job started:', {
        job_id: jobId,
        job_type: jobType,
        tenant_id: tenantId,
        leader_id: leaderId
      });

      return { success: true, job_fence_token: jobState.fence_token };

    } catch (error) {
      console.error('Job start failed:', { job_id: jobId, leader_id: leaderId });
      return { success: false, job_fence_token: '', error: 'Internal error' };
    }
  }

  /**
   * Complete a background job
   */
  async completeJob(
    jobId: string,
    leaderId: string,
    fenceToken: string,
    jobFenceToken: string,
    completedPeriod?: string
  ): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      // Verify leadership with constant-time comparison
      if (!this.lease || 
          !this.constantTimeEquals(this.lease.leader_id, leaderId) || 
          !this.constantTimeEquals(this.lease.fence_token, fenceToken)) {
        return { success: false, error: 'Invalid credentials' };
      }

      const job = this.jobs.get(jobId);
      if (!job) {
        return { success: false, error: 'Job not found' };
      }

      if (!this.constantTimeEquals(job.fence_token, jobFenceToken)) {
        return { success: false, error: 'Invalid credentials' };
      }

      // Update job state
      job.status = 'idle';
      job.last_completed_period = completedPeriod;
      job.error = undefined;

      this.jobs.set(jobId, job);
      await this.saveState();

      console.log('Job completed:', {
        job_id: jobId,
        leader_id: leaderId,
        completed_period: completedPeriod
      });

      return { success: true };

    } catch (error) {
      console.error('Job completion failed:', { job_id: jobId, leader_id: leaderId });
      return { success: false, error: 'Internal error' };
    }
  }

  /**
   * Fail a background job
   */
  async failJob(
    jobId: string,
    leaderId: string,
    fenceToken: string,
    jobFenceToken: string,
    error: string
  ): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      // Sanitize error message to prevent injection
      const sanitizedError = error.substring(0, 500).replace(/[<>\"']/g, '');

      // Verify leadership with constant-time comparison
      if (!this.lease || 
          !this.constantTimeEquals(this.lease.leader_id, leaderId) || 
          !this.constantTimeEquals(this.lease.fence_token, fenceToken)) {
        return { success: false, error: 'Invalid credentials' };
      }

      const job = this.jobs.get(jobId);
      if (!job) {
        return { success: false, error: 'Job not found' };
      }

      if (!this.constantTimeEquals(job.fence_token, jobFenceToken)) {
        return { success: false, error: 'Invalid credentials' };
      }

      // Update job state
      job.status = 'failed';
      job.error = sanitizedError;

      this.jobs.set(jobId, job);
      await this.saveState();

      console.log('Job failed:', {
        job_id: jobId,
        leader_id: leaderId,
        error: sanitizedError
      });

      return { success: true };

    } catch (error) {
      console.error('Job failure reporting failed:', { job_id: jobId, leader_id: leaderId });
      return { success: false, error: 'Internal error' };
    }
  }

  /**
   * Get current leadership status
   */
  async getLeadershipStatus(): Promise<{
    is_leader: boolean;
    lease?: LeaderLease;
    active_jobs: Array<{
      job_id: string;
      job_type: string;
      tenant_id?: string;
      status: string;
      last_run_at?: string;
    }>;
  }> {
    const activeJobs = Array.from(this.jobs.values()).map(job => ({
      job_id: job.job_id,
      job_type: job.job_type,
      tenant_id: job.tenant_id,
      status: job.status,
      last_run_at: job.last_run_at
    }));

    return {
      is_leader: this.lease !== null && this.isLeaseValid(this.lease),
      lease: this.lease || undefined,
      active_jobs: activeJobs
    };
  }

  /**
   * Force leadership transfer (break-glass)
   */
  async forceLeadershipTransfer(newLeaderId: string, region: string): Promise<{
    success: boolean;
    new_lease?: LeaderLease;
    error?: string;
  }> {
    try {
      // Validate input
      if (!newLeaderId || newLeaderId.length > 255 || !region || region.length > 50) {
        return { success: false, error: 'Invalid parameters' };
      }

      console.warn('Force leadership transfer initiated:', {
        old_leader_id: this.lease?.leader_id,
        new_leader_id: newLeaderId,
        region: region
      });

      // Clear current lease and pause all jobs
      this.lease = null;
      for (const job of this.jobs.values()) {
        if (job.status === 'running') {
          job.status = 'idle';
        }
      }

      // Grant leadership to new leader
      const now = new Date();
      const newLease: LeaderLease = {
        lease_id: this.generateSecureLeaseId(),
        leader_id: newLeaderId,
        region: region,
        expires_at: new Date(now.getTime() + this.LEASE_DURATION_SECONDS * 1000).toISOString(),
        last_heartbeat: now.toISOString(),
        fence_token: this.generateSecureFenceToken()
      };

      this.lease = newLease;
      await this.saveState();

      return { success: true, new_lease: newLease };

    } catch (error) {
      console.error('Force leadership transfer failed:', { new_leader_id: newLeaderId });
      return { success: false, error: 'Internal error' };
    }
  }

  // Private helper methods

  private async loadState(): Promise<void> {
    try {
      const leaseData = await this.state.storage.get<LeaderLease>('lease');
      if (leaseData) {
        this.lease = leaseData;
      }

      const jobsData = await this.state.storage.get<Map<string, JobState>>('jobs');
      if (jobsData) {
        this.jobs = jobsData;
      }

      console.log('State loaded:', {
        lease_exists: this.lease !== null,
        jobs_count: this.jobs.size
      });

    } catch (error) {
      console.error('Failed to load state:', error);
    }
  }

  private async saveState(): Promise<void> {
    try {
      if (this.lease) {
        await this.state.storage.put('lease', this.lease);
      } else {
        await this.state.storage.delete('lease');
      }

      await this.state.storage.put('jobs', this.jobs);

    } catch (error) {
      console.error('Failed to save state:', error);
      throw error; // Re-throw to handle at call site
    }
  }

  private isLeaseValid(lease: LeaderLease): boolean {
    const now = new Date();
    const expiresAt = new Date(lease.expires_at);
    return now < expiresAt;
  }

  private generateSecureLeaseId(): string {
    const timestamp = Date.now();
    const randomBytes = new Uint8Array(16);
    crypto.getRandomValues(randomBytes);
    const random = Array.from(randomBytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return `lease_${timestamp}_${random}`;
  }

  private generateSecureFenceToken(): string {
    const randomBytes = new Uint8Array(16);
    crypto.getRandomValues(randomBytes);
    return Array.from(randomBytes, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  private constantTimeEquals(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }
    
    try {
      const aBuffer = Buffer.from(a, 'utf8');
      const bBuffer = Buffer.from(b, 'utf8');
      return timingSafeEqual(aBuffer, bBuffer);
    } catch {
      // Fallback to regular comparison if Buffer operations fail
      let result = 0;
      for (let i = 0; i < a.length; i++) {
        result |= a.charCodeAt(i) ^ b.charCodeAt(i);
      }
      return result === 0;
    }
  }

  private validateLeadershipRequest(request: LeadershipRequest): { valid: boolean; error?: string } {
    if (!request) {
      return { valid: false, error: 'Request is required' };
    }

    if (!request.requester_id || request.requester_id.length < 1 || request.requester_id.length > 255) {
      return { valid: false, error: 'Invalid requester_id' };
    }

    if (!request.region || request.region.length < 1 || request.region.length > 50) {
      return { valid: false, error: 'Invalid region' };
    }

    if (!request.timestamp || !request.timestamp.match(/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}.*Z$/)) {
      return { valid: false, error: 'Invalid timestamp format' };
    }

    return { valid: true };
  }

  private validateJobRequest(request: {
    job_id: string;
    job_type: string;
    tenant_id?: string;
    leader_id: string;
    fence_token: string;
  }): { valid: boolean; error?: string } {
    if (!request) {
      return { valid: false, error: 'Request is required' };
    }

    if (!request.job_id || request.job_id.length < 1 || request.job_id.length > 255) {
      return { valid: false, error: 'Invalid job_id' };
    }

    if (!['anchor', 'rotation', 'cleanup'].includes(request.job_type)) {
      return { valid: false, error: 'Invalid job_type' };
    }

    if (request.tenant_id && request.tenant_id.length > 100) {
      return { valid: false, error: 'Invalid tenant_id' };
    }

    if (!request.leader_id || request.leader_id.length < 1 || request.leader_id.length > 255) {
      return { valid: false, error: 'Invalid leader_id' };
    }

    if (!request.fence_token || request.fence_token.length !== 32) {
      return { valid: false, error: 'Invalid fence_token' };
    }

    return { valid: true };
  }

  private checkRateLimit(requesterId: string): boolean {
    const now = Date.now();
    const windowStart = now - 60000; // 1 minute window
    
    let rateLimitData = this.requestCounts.get(requesterId);
    if (!rateLimitData || now > rateLimitData.resetTime) {
      rateLimitData = { count: 0, resetTime: now + 60000 };
      this.requestCounts.set(requesterId, rateLimitData);
    }
    
    if (rateLimitData.count >= this.REQUEST_RATE_LIMIT) {
      return false;
    }
    
    rateLimitData.count++;
    return true;
  }
}

// Durable Object export for Cloudflare Workers
export class LeaderCoordinatorDOExporter {
  async fetch(request: Request, env: any): Promise<Response> {
    const id = env.LEADER_COORDINATOR.idFromName('global-coordinator');
    const stub = env.LEADER_COORDINATOR.get(id);
    
    return stub.fetch(request);
  }
}

// Durable Object class definition
export class LeaderCoordinatorDO implements DurableObject {
  private coordinator: LeaderCoordinator;

  constructor(state: DurableObjectState, env: any) {
    this.coordinator = new LeaderCoordinator(state, env);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Rate limiting per IP
    const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (!this.checkIPRateLimit(clientIP)) {
      return new Response('Rate limit exceeded', { status: 429 });
    }

    try {
      switch (path) {
        case '/request-leadership':
          return this.handleRequestLeadership(request);
        
        case '/renew-leadership':
          return this.handleRenewLeadership(request);
        
        case '/release-leadership':
          return this.handleReleaseLeadership(request);
        
        case '/start-job':
          return this.handleStartJob(request);
        
        case '/complete-job':
          return this.handleCompleteJob(request);
        
        case '/fail-job':
          return this.handleFailJob(request);
        
        case '/status':
          return this.handleStatus(request);
        
        case '/force-transfer':
          return this.handleForceTransfer(request);
        
        default:
          return new Response('Not found', { status: 404 });
      }
    } catch (error) {
      console.error('DO request failed:', { path, error: error instanceof Error ? error.message : 'Unknown error' });
      return new Response('Internal server error', { status: 500 });
    }
  }

  private async handleRequestLeadership(request: Request): Promise<Response> {
    try {
      const body = await request.text();
      if (!body) {
        return new Response('Invalid request body', { status: 400 });
      }
      
      const leadershipRequest = JSON.parse(body) as LeadershipRequest;
      const response = await this.coordinator.requestLeadership(leadershipRequest);
      return Response.json(response);
    } catch (error) {
      return new Response('Invalid JSON', { status: 400 });
    }
  }

  private async handleRenewLeadership(request: Request): Promise<Response> {
    try {
      const body = await request.text();
      if (!body) {
        return new Response('Invalid request body', { status: 400 });
      }
      
      const { leader_id, fence_token } = JSON.parse(body);
      const response = await this.coordinator.renewLeadership(leader_id, fence_token);
      return Response.json(response);
    } catch (error) {
      return new Response('Invalid JSON', { status: 400 });
    }
  }

  private async handleReleaseLeadership(request: Request): Promise<Response> {
    try {
      const body = await request.text();
      if (!body) {
        return new Response('Invalid request body', { status: 400 });
      }
      
      const { leader_id, fence_token } = JSON.parse(body);
      const response = await this.coordinator.releaseLeadership(leader_id, fence_token);
      return Response.json(response);
    } catch (error) {
      return new Response('Invalid JSON', { status: 400 });
    }
  }

  private async handleStartJob(request: Request): Promise<Response> {
    try {
      const body = await request.text();
      if (!body) {
        return new Response('Invalid request body', { status: 400 });
      }
      
      const { job_id, job_type, tenant_id, leader_id, fence_token } = JSON.parse(body);
      const response = await this.coordinator.startJob(job_id, job_type, tenant_id, leader_id, fence_token);
      return Response.json(response);
    } catch (error) {
      return new Response('Invalid JSON', { status: 400 });
    }
  }

  private async handleCompleteJob(request: Request): Promise<Response> {
    try {
      const body = await request.text();
      if (!body) {
        return new Response('Invalid request body', { status: 400 });
      }
      
      const { job_id, leader_id, fence_token, job_fence_token, completed_period } = JSON.parse(body);
      const response = await this.coordinator.completeJob(job_id, leader_id, fence_token, job_fence_token, completed_period);
      return Response.json(response);
    } catch (error) {
      return new Response('Invalid JSON', { status: 400 });
    }
  }

  private async handleFailJob(request: Request): Promise<Response> {
    try {
      const body = await request.text();
      if (!body) {
        return new Response('Invalid request body', { status: 400 });
      }
      
      const { job_id, leader_id, fence_token, job_fence_token, error } = JSON.parse(body);
      const response = await this.coordinator.failJob(job_id, leader_id, fence_token, job_fence_token, error);
      return Response.json(response);
    } catch (error) {
      return new Response('Invalid JSON', { status: 400 });
    }
  }

  private async handleStatus(request: Request): Promise<Response> {
    const response = await this.coordinator.getLeadershipStatus();
    return Response.json(response);
  }

  private async handleForceTransfer(request: Request): Promise<Response> {
    try {
      const body = await request.text();
      if (!body) {
        return new Response('Invalid request body', { status: 400 });
      }
      
      const { new_leader_id, region } = JSON.parse(body);
      const response = await this.coordinator.forceLeadershipTransfer(new_leader_id, region);
      return Response.json(response);
    } catch (error) {
      return new Response('Invalid JSON', { status: 400 });
    }
  }

  private readonly ipRequestCounts: Map<string, { count: number; resetTime: number }> = new Map();
  private readonly IP_RATE_LIMIT = 100; // Max 100 requests per minute per IP

  private checkIPRateLimit(clientIP: string): boolean {
    const now = Date.now();
    
    let rateLimitData = this.ipRequestCounts.get(clientIP);
    if (!rateLimitData || now > rateLimitData.resetTime) {
      rateLimitData = { count: 0, resetTime: now + 60000 };
      this.ipRequestCounts.set(clientIP, rateLimitData);
    }
    
    if (rateLimitData.count >= this.IP_RATE_LIMIT) {
      return false;
    }
    
    rateLimitData.count++;
    return true;
  }
}
