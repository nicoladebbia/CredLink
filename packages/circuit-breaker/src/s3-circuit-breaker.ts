import { CircuitBreaker, CircuitBreakerOptions } from './circuit-breaker';
import {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
    HeadObjectCommand,
    ListObjectsV2Command,
    CopyObjectCommand,
    DeleteObjectsCommand,
    S3ClientConfig
} from '@aws-sdk/client-s3';

export interface S3CircuitBreakerOptions {
    readOperations?: CircuitBreakerOptions;
    writeOperations?: CircuitBreakerOptions;
    s3Config?: S3ClientConfig;
}

export class S3CircuitBreaker {
    private s3Client: S3Client;
    private readBreaker: CircuitBreaker;
    private writeBreaker: CircuitBreaker;
    private destroyed = false;

    constructor(options: S3CircuitBreakerOptions = {}) {
        // 🔥 CRITICAL FIX: Use actual config for S3Client, sanitize only for logging
        const actualConfig = options.s3Config || {};
        this.s3Client = new S3Client(actualConfig);

        // 🔥 CATASTROPHIC FIX: Make thresholds configurable per environment
        const env = process.env.NODE_ENV || 'development';
        const isProduction = env === 'production';
        const isTest = env === 'test';
        
        // 🔥 HARDCODED DATA FIX: Environment-aware configurable defaults
        const defaultMonitoringPeriod = isTest ? 1000 : 10000;
        const defaultReadFailureThreshold = isProduction ? 10 : 5;
        const defaultReadResetTimeout = isProduction ? 15000 : 30000;
        const defaultReadRecoveryTime = isProduction ? 10000 : 15000;
        const defaultWriteFailureThreshold = isProduction ? 5 : 3;
        const defaultWriteResetTimeout = isProduction ? 30000 : 60000;
        const defaultWriteRecoveryTime = isProduction ? 20000 : 30000;
        
        // Separate circuit breakers for read vs write operations
        this.readBreaker = new CircuitBreaker({
            failureThreshold: options.readOperations?.failureThreshold || defaultReadFailureThreshold,
            resetTimeout: options.readOperations?.resetTimeout || defaultReadResetTimeout,
            monitoringPeriod: options.readOperations?.monitoringPeriod || defaultMonitoringPeriod,
            expectedRecoveryTime: options.readOperations?.expectedRecoveryTime || defaultReadRecoveryTime,
            lockTimeout: options.readOperations?.lockTimeout || (isTest ? 500 : 2000),
            lockCleanupInterval: options.readOperations?.lockCleanupInterval || 3000,
            maxLockWaitTime: options.readOperations?.maxLockWaitTime || (isProduction ? 2000 : 3000),
            randomDelayMin: options.readOperations?.randomDelayMin || 1,
            randomDelayMax: options.readOperations?.randomDelayMax || (isProduction ? 3 : 8),
            successThresholdBase: options.readOperations?.successThresholdBase || 3,
            forceReleaseThreshold: options.readOperations?.forceReleaseThreshold || 20000,
            ...options.readOperations
        });

        this.writeBreaker = new CircuitBreaker({
            failureThreshold: options.writeOperations?.failureThreshold || defaultWriteFailureThreshold,
            resetTimeout: options.writeOperations?.resetTimeout || defaultWriteResetTimeout,
            monitoringPeriod: options.writeOperations?.monitoringPeriod || defaultMonitoringPeriod,
            expectedRecoveryTime: options.writeOperations?.expectedRecoveryTime || defaultWriteRecoveryTime,
            lockTimeout: options.writeOperations?.lockTimeout || (isTest ? 500 : 2000),
            lockCleanupInterval: options.writeOperations?.lockCleanupInterval || 3000,
            maxLockWaitTime: options.writeOperations?.maxLockWaitTime || (isProduction ? 2000 : 3000),
            randomDelayMin: options.writeOperations?.randomDelayMin || 1,
            randomDelayMax: options.writeOperations?.randomDelayMax || (isProduction ? 3 : 8),
            successThresholdBase: options.writeOperations?.successThresholdBase || 3,
            forceReleaseThreshold: options.writeOperations?.forceReleaseThreshold || 20000,
            ...options.writeOperations
        });
    }

    // 🔥 FIX: Expose S3 client for getSignedUrl operations
    getClient(): S3Client {
        if (this.destroyed) {
            throw new Error('S3CircuitBreaker has been destroyed');
        }
        return this.s3Client;
    }

    // Read operations
    async getObject(command: GetObjectCommand) {
        // 🔥 CATASTROPHIC FIX: Add input validation and destroyed check
        if (this.destroyed) {
            throw new Error('S3CircuitBreaker has been destroyed');
        }
        if (!command) {
            throw new Error('Command is required');
        }
        
        return this.readBreaker.execute(async () => {
            return this.s3Client.send(command);
        });
    }

    async headObject(command: HeadObjectCommand) {
        // 🔥 CATASTROPHIC FIX: Add input validation and destroyed check
        if (this.destroyed) {
            throw new Error('S3CircuitBreaker has been destroyed');
        }
        if (!command) {
            throw new Error('Command is required');
        }
        
        return this.readBreaker.execute(async () => {
            return this.s3Client.send(command);
        });
    }

    async listObjectsV2(command: ListObjectsV2Command) {
        // 🔥 CATASTROPHIC FIX: Add input validation and destroyed check
        if (this.destroyed) {
            throw new Error('S3CircuitBreaker has been destroyed');
        }
        if (!command) {
            throw new Error('Command is required');
        }
        
        return this.readBreaker.execute(async () => {
            return this.s3Client.send(command);
        });
    }

    // Write operations
    async putObject(command: PutObjectCommand) {
        // 🔥 CATASTROPHIC FIX: Add input validation and destroyed check
        if (this.destroyed) {
            throw new Error('S3CircuitBreaker has been destroyed');
        }
        if (!command) {
            throw new Error('Command is required');
        }
        
        return this.writeBreaker.execute(async () => {
            return this.s3Client.send(command);
        });
    }

    async deleteObject(command: DeleteObjectCommand) {
        // 🔥 CATASTROPHIC FIX: Add input validation and destroyed check
        if (this.destroyed) {
            throw new Error('S3CircuitBreaker has been destroyed');
        }
        if (!command) {
            throw new Error('Command is required');
        }
        
        return this.writeBreaker.execute(async () => {
            return this.s3Client.send(command);
        });
    }

    async deleteObjects(command: DeleteObjectsCommand) {
        // 🔥 CATASTROPHIC FIX: Add input validation and destroyed check
        if (this.destroyed) {
            throw new Error('S3CircuitBreaker has been destroyed');
        }
        if (!command) {
            throw new Error('Command is required');
        }
        
        return this.writeBreaker.execute(async () => {
            return this.s3Client.send(command);
        });
    }

    async copyObject(command: CopyObjectCommand) {
        // 🔥 CATASTROPHIC FIX: Add input validation and destroyed check
        if (this.destroyed) {
            throw new Error('S3CircuitBreaker has been destroyed');
        }
        if (!command) {
            throw new Error('Command is required');
        }
        
        return this.writeBreaker.execute(async () => {
            return this.s3Client.send(command);
        });
    }

    // 🔥 CATASTROPHIC FIX: Add proper cleanup methods
    async destroy(): Promise<void> {
        if (this.destroyed) {
            return;
        }
        
        this.destroyed = true;
        
        try {
            await Promise.all([
                this.readBreaker.shutdown(),
                this.writeBreaker.shutdown()
            ]);
        } catch (error) {
            // Ignore shutdown errors
        }
    }

    // Circuit breaker status methods
    getReadStatus() {
        if (this.destroyed) {
            throw new Error('S3CircuitBreaker has been destroyed');
        }
        return this.readBreaker.getStats();
    }

    getWriteStatus() {
        if (this.destroyed) {
            throw new Error('S3CircuitBreaker has been destroyed');
        }
        return this.writeBreaker.getStats();
    }

    getAllStatus() {
        if (this.destroyed) {
            throw new Error('S3CircuitBreaker has been destroyed');
        }
        return {
            read: this.getReadStatus(),
            write: this.getWriteStatus()
        };
    }
}
