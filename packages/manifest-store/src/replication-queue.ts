// Phase 21.2 Replication Queue for Async Manifest Replication
// Ensures RPO ≤ 5 min with queue processing and retry logic

import { KVNamespace } from '@cloudflare/workers-types';

export interface ReplicationTask {
  id: string;
  hash: string;
  tenant_id: string;
  size: number;
  created_at: string;
  metadata: any;
  attempts: number;
  last_attempt?: string;
  error?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

export interface QueueStats {
  pending_count: number;
  processing_count: number;
  completed_count: number;
  failed_count: number;
  oldest_pending_age_seconds: number;
}

export class ReplicationQueue {
  private readonly MAX_ATTEMPTS = 3;
  private readonly TASK_TIMEOUT_SECONDS = 300; // 5 minutes
  private readonly RETRY_DELAY_SECONDS = 60; // 1 minute between retries
  private readonly MAX_HASH_LENGTH = 64;
  private readonly MAX_TENANT_ID_LENGTH = 100;
  private readonly MAX_TASK_SIZE = 100 * 1024 * 1024; // 100MB
  private readonly MAX_ERROR_LENGTH = 500;
  private readonly MAX_LIMIT = 10000;
  private readonly TASK_ID_LENGTH = 16;

  constructor(
    private kv: KVNamespace,
    private queueName: string = 'replication-queue'
  ) {
    this.validateConstructor();
  }

  private validateConstructor(): void {
    if (!this.queueName || this.queueName.length < 1 || this.queueName.length > 100) {
      throw new Error('Invalid queue name');
    }
  }

  private sanitizeError(error: string): string {
    if (!error) return 'Unknown error';
    return error.substring(0, this.MAX_ERROR_LENGTH).replace(/[<>\"']/g, '');
  }

  private validateHash(hash: string): boolean {
    return !!hash && 
           hash.length <= this.MAX_HASH_LENGTH && 
           /^[a-fA-F0-9]+$/.test(hash);
  }

  private validateTenantId(tenantId: string): boolean {
    return !!tenantId && 
           tenantId.length > 0 && 
           tenantId.length <= this.MAX_TENANT_ID_LENGTH &&
           /^[a-zA-Z0-9_-]+$/.test(tenantId);
  }

  private validateLimit(limit: number): boolean {
    return Number.isInteger(limit) && limit > 0 && limit <= this.MAX_LIMIT;
  }

  private generateSecureTaskId(hash: string): string {
    const timestamp = Date.now();
    const randomBytes = new Uint8Array(this.TASK_ID_LENGTH);
    crypto.getRandomValues(randomBytes);
    const random = Array.from(randomBytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return `task_${hash}_${timestamp}_${random}`;
  }

  private truncateHash(hash: string): string {
    return hash.length > 8 ? hash.substring(0, 8) + '...' : hash;
  }

  /**
   * Enqueue a manifest for replication
   */
  async enqueue(task: Omit<ReplicationTask, 'id' | 'attempts' | 'status'>): Promise<string> {
    try {
      // Validate input
      if (!this.validateHash(task.hash)) {
        throw new Error('Invalid hash format');
      }

      if (!this.validateTenantId(task.tenant_id)) {
        throw new Error('Invalid tenant ID');
      }

      if (!Number.isInteger(task.size) || task.size < 0 || task.size > this.MAX_TASK_SIZE) {
        throw new Error('Invalid task size');
      }

      if (!task.created_at || new Date(task.created_at).toString() === 'Invalid Date') {
        throw new Error('Invalid created_at timestamp');
      }

      if (!task.metadata) {
        throw new Error('Metadata is required');
      }

      const taskId = this.generateSecureTaskId(task.hash);
      
      const fullTask: ReplicationTask = {
        ...task,
        id: taskId,
        attempts: 0,
        status: 'pending'
      };

      await this.kv.put(this.getTaskKey(taskId), JSON.stringify(fullTask), {
        expirationTtl: 86400 // 24 hours TTL
      });

      // Add to pending set for efficient listing
      await this.addToPendingSet(taskId);

      return taskId;
    } catch (error) {
      throw new Error(`Failed to enqueue replication task: ${this.sanitizeError(error instanceof Error ? error.message : 'Unknown error')}`);
    }
  }

  /**
   * Get pending replication tasks
   */
  async getPendingTasks(limit: number = 100): Promise<ReplicationTask[]> {
    try {
      // Validate input
      if (!this.validateLimit(limit)) {
        throw new Error('Invalid limit');
      }

      const pendingTaskIds = await this.getPendingTaskIds(limit);
      const tasks: ReplicationTask[] = [];

      for (const taskId of pendingTaskIds) {
        const task = await this.getTask(taskId);
        if (task && task.status === 'pending') {
          // Check if task is ready for retry
          if (this.isReadyForRetry(task)) {
            tasks.push(task);
          }
        }
      }

      return tasks;
    } catch (error) {
      console.error('Failed to get pending tasks:', error instanceof Error ? error.message : 'Unknown error');
      return [];
    }
  }

  /**
   * Mark task as completed
   */
  async markTaskCompleted(taskId: string): Promise<void> {
    try {
      // Validate input
      if (!taskId || taskId.length < 1 || taskId.length > 200) {
        throw new Error('Invalid task ID');
      }

      const task = await this.getTask(taskId);
      if (!task) {
        throw new Error(`Task not found: ${this.truncateHash(taskId)}`);
      }

      task.status = 'completed';
      task.attempts += 1;

      await this.kv.put(this.getTaskKey(taskId), JSON.stringify(task), {
        expirationTtl: 86400
      });

      // Remove from pending set
      await this.removeFromPendingSet(taskId);

      // Add to completed set
      await this.addToCompletedSet(taskId);

    } catch (error) {
      throw new Error(`Failed to mark task completed: ${this.sanitizeError(error instanceof Error ? error.message : 'Unknown error')}`);
    }
  }

  /**
   * Mark task as failed
   */
  async markTaskFailed(taskId: string, error: string): Promise<void> {
    try {
      // Validate input
      if (!taskId || taskId.length < 1 || taskId.length > 200) {
        throw new Error('Invalid task ID');
      }

      if (!error || error.length > this.MAX_ERROR_LENGTH) {
        throw new Error('Invalid error message');
      }

      const task = await this.getTask(taskId);
      if (!task) {
        throw new Error(`Task not found: ${this.truncateHash(taskId)}`);
      }

      task.status = 'failed';
      task.attempts += 1;
      task.last_attempt = new Date().toISOString();
      task.error = this.sanitizeError(error);

      // Check if we should retry or give up
      if (task.attempts < this.MAX_ATTEMPTS) {
        task.status = 'pending'; // Reset to pending for retry
        task.error = undefined; // Clear error for retry
      }

      await this.kv.put(this.getTaskKey(taskId), JSON.stringify(task), {
        expirationTtl: 86400
      });

      if (task.status === 'failed') {
        // Remove from pending set permanently
        await this.removeFromPendingSet(taskId);
        await this.addToFailedSet(taskId);
      }

    } catch (error) {
      throw new Error(`Failed to mark task failed: ${this.sanitizeError(error instanceof Error ? error.message : 'Unknown error')}`);
    }
  }

  /**
   * Get queue statistics
   */
  async getStats(): Promise<QueueStats> {
    try {
      const pendingCount = await this.getPendingCount();
      const processingCount = await this.getProcessingCount();
      const completedCount = await this.getCompletedCount();
      const failedCount = await this.getFailedCount();
      const oldestPendingAge = await this.getOldestPendingAge();

      return {
        pending_count: pendingCount,
        processing_count: processingCount,
        completed_count: completedCount,
        failed_count: failedCount,
        oldest_pending_age_seconds: oldestPendingAge
      };
    } catch (error) {
      console.error('Failed to get queue stats:', error instanceof Error ? error.message : 'Unknown error');
      return {
        pending_count: 0,
        processing_count: 0,
        completed_count: 0,
        failed_count: 0,
        oldest_pending_age_seconds: 0
      };
    }
  }

  /**
   * Cleanup old completed tasks
   */
  async cleanup(): Promise<{ cleaned_count: number; errors: string[] }> {
    let cleanedCount = 0;
    const errors: string[] = [];

    try {
      // Get old completed tasks (older than 24 hours)
      const completedTaskIds = await this.getCompletedTaskIds(Math.min(1000, this.MAX_LIMIT));
      const cutoffTime = new Date(Date.now() - 86400000); // 24 hours ago

      for (const taskId of completedTaskIds) {
        try {
          const task = await this.getTask(taskId);
          if (task && task.status === 'completed') {
            const taskTime = new Date(task.created_at);
            if (taskTime < cutoffTime) {
              await this.kv.delete(this.getTaskKey(taskId));
              await this.removeFromCompletedSet(taskId);
              cleanedCount++;
            }
          }
        } catch (error) {
          errors.push(`Failed to cleanup task ${this.truncateHash(taskId)}: ${this.sanitizeError(error instanceof Error ? error.message : 'Unknown error')}`);
        }
      }

      // Also cleanup old failed tasks
      const failedTaskIds = await this.getFailedTaskIds(Math.min(1000, this.MAX_LIMIT));
      for (const taskId of failedTaskIds) {
        try {
          const task = await this.getTask(taskId);
          if (task && task.status === 'failed') {
            const taskTime = new Date(task.created_at);
            if (taskTime < cutoffTime) {
              await this.kv.delete(this.getTaskKey(taskId));
              await this.removeFromFailedSet(taskId);
              cleanedCount++;
            }
          }
        } catch (error) {
          errors.push(`Failed to cleanup failed task ${this.truncateHash(taskId)}: ${this.sanitizeError(error instanceof Error ? error.message : 'Unknown error')}`);
        }
      }

      console.log('Queue cleanup completed:', { cleaned_count: cleanedCount, errors: errors.length });
      return { cleaned_count: cleanedCount, errors };

    } catch (error) {
      errors.push(`Cleanup failed: ${this.sanitizeError(error instanceof Error ? error.message : 'Unknown error')}`);
      return { cleaned_count: 0, errors };
    }
  }

  /**
   * Force retry of failed tasks
   */
  async retryFailedTasks(limit: number = 100): Promise<{ retried_count: number; errors: string[] }> {
    let retriedCount = 0;
    const errors: string[] = [];

    try {
      // Validate input
      if (!this.validateLimit(limit)) {
        throw new Error('Invalid limit');
      }

      const failedTaskIds = await this.getFailedTaskIds(limit);

      for (const taskId of failedTaskIds) {
        try {
          const task = await this.getTask(taskId);
          if (task && task.status === 'failed' && task.attempts < this.MAX_ATTEMPTS) {
            task.status = 'pending';
            task.error = undefined;
            
            await this.kv.put(this.getTaskKey(taskId), JSON.stringify(task), {
              expirationTtl: 86400
            });

            await this.removeFromFailedSet(taskId);
            await this.addToPendingSet(taskId);
            retriedCount++;
          }
        } catch (error) {
          errors.push(`Failed to retry task ${this.truncateHash(taskId)}: ${this.sanitizeError(error instanceof Error ? error.message : 'Unknown error')}`);
        }
      }

      console.log('Failed tasks retry completed:', { retried_count: retriedCount, errors: errors.length });
      return { retried_count: retriedCount, errors };

    } catch (error) {
      errors.push(`Retry failed: ${this.sanitizeError(error instanceof Error ? error.message : 'Unknown error')}`);
      return { retried_count: 0, errors };
    }
  }

  // Private helper methods

  private generateTaskId(hash: string): string {
    // This method is kept for backward compatibility but should not be used
    // Use generateSecureTaskId instead
    return this.generateSecureTaskId(hash);
  }

  private getTaskKey(taskId: string): string {
    return `${this.queueName}:task:${taskId}`;
  }

  private getPendingSetKey(): string {
    return `${this.queueName}:pending`;
  }

  private getCompletedSetKey(): string {
    return `${this.queueName}:completed`;
  }

  private getFailedSetKey(): string {
    return `${this.queueName}:failed`;
  }

  private async getTask(taskId: string): Promise<ReplicationTask | null> {
    try {
      const taskData = await this.kv.get(this.getTaskKey(taskId));
      if (!taskData) {
        return null;
      }

      const task = JSON.parse(taskData) as ReplicationTask;
      
      // Validate the loaded task
      if (!task.id || !this.validateHash(task.hash) || !this.validateTenantId(task.tenant_id)) {
        console.warn('Invalid task data loaded, skipping:', { taskId: this.truncateHash(taskId) });
        return null;
      }

      return task;
    } catch (error) {
      console.error('Failed to get task:', { 
        taskId: this.truncateHash(taskId), 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      return null;
    }
  }

  private async addToPendingSet(taskId: string): Promise<void> {
    const key = this.getPendingSetKey();
    const current = await this.kv.get(key) || '';
    const taskIds = current.split(',').filter((id: string) => id);
    
    // Limit the number of task IDs in the set
    if (taskIds.length >= this.MAX_LIMIT) {
      console.warn('Pending set is at maximum capacity, cannot add more tasks');
      return;
    }
    
    taskIds.push(taskId);
    await this.kv.put(key, taskIds.join(','));
  }

  private async removeFromPendingSet(taskId: string): Promise<void> {
    const key = this.getPendingSetKey();
    const current = await this.kv.get(key) || '';
    const taskIds = current.split(',').filter((id: string) => id && id !== taskId);
    await this.kv.put(key, taskIds.join(','));
  }

  private async addToCompletedSet(taskId: string): Promise<void> {
    const key = this.getCompletedSetKey();
    const current = await this.kv.get(key) || '';
    const taskIds = current.split(',').filter((id: string) => id);
    
    // Limit the number of task IDs in the set
    if (taskIds.length >= this.MAX_LIMIT) {
      console.warn('Completed set is at maximum capacity, cannot add more tasks');
      return;
    }
    
    taskIds.push(taskId);
    await this.kv.put(key, taskIds.join(','));
  }

  private async removeFromCompletedSet(taskId: string): Promise<void> {
    const key = this.getCompletedSetKey();
    const current = await this.kv.get(key) || '';
    const taskIds = current.split(',').filter((id: string) => id && id !== taskId);
    await this.kv.put(key, taskIds.join(','));
  }

  private async addToFailedSet(taskId: string): Promise<void> {
    const key = this.getFailedSetKey();
    const current = await this.kv.get(key) || '';
    const taskIds = current.split(',').filter((id: string) => id);
    
    // Limit the number of task IDs in the set
    if (taskIds.length >= this.MAX_LIMIT) {
      console.warn('Failed set is at maximum capacity, cannot add more tasks');
      return;
    }
    
    taskIds.push(taskId);
    await this.kv.put(key, taskIds.join(','));
  }

  private async removeFromFailedSet(taskId: string): Promise<void> {
    const key = this.getFailedSetKey();
    const current = await this.kv.get(key) || '';
    const taskIds = current.split(',').filter((id: string) => id && id !== taskId);
    await this.kv.put(key, taskIds.join(','));
  }

  private async getPendingTaskIds(limit: number): Promise<string[]> {
    const key = this.getPendingSetKey();
    const current = await this.kv.get(key) || '';
    const taskIds = current.split(',').filter((id: string) => id);
    return taskIds.slice(0, Math.min(limit, this.MAX_LIMIT));
  }

  private async getCompletedTaskIds(limit: number): Promise<string[]> {
    const key = this.getCompletedSetKey();
    const current = await this.kv.get(key) || '';
    const taskIds = current.split(',').filter((id: string) => id);
    return taskIds.slice(0, Math.min(limit, this.MAX_LIMIT));
  }

  private async getFailedTaskIds(limit: number): Promise<string[]> {
    const key = this.getFailedSetKey();
    const current = await this.kv.get(key) || '';
    const taskIds = current.split(',').filter((id: string) => id);
    return taskIds.slice(0, Math.min(limit, this.MAX_LIMIT));
  }

  private async getPendingCount(): Promise<number> {
    const taskIds = await this.getPendingTaskIds(Math.min(10000, this.MAX_LIMIT));
    return taskIds.length;
  }

  private async getProcessingCount(): Promise<number> {
    // For now, assume no tasks are processing
    // In a real implementation, this would track tasks currently being processed
    return 0;
  }

  private async getCompletedCount(): Promise<number> {
    const taskIds = await this.getCompletedTaskIds(Math.min(10000, this.MAX_LIMIT));
    return taskIds.length;
  }

  private async getFailedCount(): Promise<number> {
    const taskIds = await this.getFailedTaskIds(Math.min(10000, this.MAX_LIMIT));
    return taskIds.length;
  }

  private async getOldestPendingAge(): Promise<number> {
    try {
      const taskIds = await this.getPendingTaskIds(Math.min(100, this.MAX_LIMIT));
      let oldestAge = 0;

      for (const taskId of taskIds) {
        const task = await this.getTask(taskId);
        if (task && task.status === 'pending') {
          const age = (Date.now() - new Date(task.created_at).getTime()) / 1000;
          oldestAge = Math.max(oldestAge, age);
        }
      }

      return Math.floor(oldestAge);
    } catch (error) {
      console.error('Failed to get oldest pending age:', error instanceof Error ? error.message : 'Unknown error');
      return 0;
    }
  }

  private isReadyForRetry(task: ReplicationTask): boolean {
    if (task.attempts === 0) {
      return true; // First attempt
    }

    if (task.last_attempt) {
      const timeSinceLastAttempt = (Date.now() - new Date(task.last_attempt).getTime()) / 1000;
      return timeSinceLastAttempt >= this.RETRY_DELAY_SECONDS;
    }

    return true;
  }
}
