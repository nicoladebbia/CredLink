/**
 * Async Proof Storage Implementation
 * Eliminates synchronous file operations that block request handling
 */

import { randomUUID } from 'crypto';
import { C2PAManifest } from './manifest-builder';
import { logger } from '../utils/logger';
import { DataEncryption } from './encryption';
import { writeFile, readFile, mkdir, access } from 'fs/promises';
import { join } from 'path';
import { LRUCache } from 'lru-cache';

export interface ProofRecord {
    proofId: string;
    proofUri: string;
    imageHash: string;
    manifest: C2PAManifest;
    timestamp: string;
    signature: string;
    expiresAt: number;
}

export class AsyncProofStorage {
    private cache: LRUCache<string, ProofRecord>;
    private hashIndex: Map<string, string> = new Map();
    private storagePath: string;
    private useLocalFilesystem: boolean;
    private encryption: DataEncryption;
    private writeQueue: Promise<void> = Promise.resolve();
    private cleanupInterval: NodeJS.Timeout | null = null;
    private readonly maxCacheSize = 10000; // Prevent memory exhaustion
    private readonly cleanupIntervalMs = 60000; // 1 minute
    private initialized: boolean = false;

    constructor() {
        this.storagePath = process.env.PROOF_STORAGE_PATH || './proofs';
        this.useLocalFilesystem = process.env.USE_LOCAL_PROOF_STORAGE === 'true';
        this.encryption = new DataEncryption({
            kmsKeyId: process.env.KMS_KEY_ID,
            algorithm: 'aes-256-gcm'
        });

        // Initialize LRU cache with size limits to prevent memory exhaustion
        this.cache = new LRUCache<string, ProofRecord>({
            max: this.maxCacheSize,
            ttl: 1000 * 60 * 60 * 24, // 24 hours
            updateAgeOnGet: true
        });

        // Start async initialization
        this.initializeAsync();
    }

    private async initializeAsync(): Promise<void> {
        try {
            if (this.useLocalFilesystem) {
                await this.ensureStorageDirectory();
            }
            
            // Start periodic cleanup to prevent memory leaks
            this.startCleanupScheduler();
            
            this.initialized = true;
            logger.info('AsyncProofStorage initialized successfully', {
                maxCacheSize: this.maxCacheSize,
                cleanupInterval: this.cleanupIntervalMs
            });
        } catch (error) {
            logger.error('Failed to initialize AsyncProofStorage', { 
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    private async waitForInitialization(): Promise<void> {
        const maxWaitTime = 10000; // 10 seconds
        const checkInterval = 100; // 100ms
        let elapsed = 0;

        while (!this.initialized && elapsed < maxWaitTime) {
            await new Promise(resolve => setTimeout(resolve, checkInterval));
            elapsed += checkInterval;
        }

        if (!this.initialized) {
            throw new Error('AsyncProofStorage initialization timeout');
        }
    }

    private startCleanupScheduler(): void {
        if (process.env.NODE_ENV === 'production') {
            this.cleanupInterval = setInterval(async () => {
                try {
                    await this.cleanupExpiredProofs();
                } catch (error) {
                    logger.error('Cleanup scheduler error', { 
                        error: error instanceof Error ? error.message : String(error)
                    });
                }
            }, this.cleanupIntervalMs);
        }
    }

    async storeProof(manifest: C2PAManifest, imageHash: string): Promise<string> {
        try {
            // Wait for initialization if not ready
            await this.waitForInitialization();
            
            const proofId = randomUUID();
            const proofDomain = process.env.PROOF_URI_DOMAIN || 'https://proofs.credlink.com';
            const proofUri = `${proofDomain}/${proofId}`;
            
            const expiresAt = Date.now() + (365 * 24 * 60 * 60 * 1000);
            
            const proofRecord: ProofRecord = {
                proofId,
                proofUri,
                imageHash,
                manifest,
                timestamp: new Date().toISOString(),
                signature: 'pending-signature',
                expiresAt
            };

            // Store in memory cache (LRU with size limits)
            this.cache.set(proofId, proofRecord);
            this.hashIndex.set(imageHash, proofId);

            // Queue async write operation
            this.writeQueue = this.writeQueue.then(async () => {
                if (this.useLocalFilesystem) {
                    await this.storeProofLocal(proofRecord);
                }
            }).catch(error => {
                logger.error('Failed to store proof locally', { 
                    proofId, 
                    error: error instanceof Error ? error.message : String(error)
                });
            });

            return proofUri;
        } catch (error) {
            logger.error('Failed to store proof', { 
                imageHash, 
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    async retrieveProof(proofId: string): Promise<ProofRecord | null> {
        try {
            // Wait for initialization if not ready
            await this.waitForInitialization();
            
            // Check memory cache first (LRU with automatic eviction)
            let proofRecord = this.cache.get(proofId);
            
            if (!proofRecord && this.useLocalFilesystem) {
                // Load from filesystem if not in cache
                const localProofRecord = await this.loadProofLocal(proofId);
                if (localProofRecord) {
                    proofRecord = localProofRecord;
                    this.cache.set(proofId, proofRecord); // LRU will handle size limits
                }
            }

            return proofRecord || null;
        } catch (error) {
            logger.error('Failed to retrieve proof', { 
                proofId, 
                error: error instanceof Error ? error.message : String(error)
            });
            return null;
        }
    }

    async findProofByHash(imageHash: string): Promise<ProofRecord | null> {
        try {
            // Wait for initialization if not ready
            await this.waitForInitialization();
            
            const proofId = this.hashIndex.get(imageHash);
            if (!proofId) {
                return null;
            }

            return await this.retrieveProof(proofId);
        } catch (error) {
            logger.error('Failed to find proof by hash', { 
                imageHash, 
                error: error instanceof Error ? error.message : String(error)
            });
            return null;
        }
    }

    private async storeProofLocal(proofRecord: ProofRecord): Promise<void> {
        try {
            const proofPath = join(this.storagePath, `${proofRecord.proofId}.json`);
            
            // Encrypt proof data
            const proofJson = JSON.stringify(proofRecord);
            const encryptedData = this.encryption.encrypt(proofJson);
            
            // Write to filesystem asynchronously (serialize encrypted object)
            await writeFile(proofPath, JSON.stringify(encryptedData), 'utf8');
            
            logger.info('Proof stored locally', { 
                proofId: proofRecord.proofId,
                path: proofPath 
            });
        } catch (error) {
            logger.error('Failed to store proof locally', { 
                proofId: proofRecord.proofId,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    private async loadProofLocal(proofId: string): Promise<ProofRecord | null> {
        try {
            const proofPath = join(this.storagePath, `${proofId}.json`);
            
            // Check if file exists
            try {
                await access(proofPath);
            } catch {
                return null;
            }

            // Read and decrypt proof data
            const encryptedJson = await readFile(proofPath, 'utf8');
            const encryptedData = JSON.parse(encryptedJson);
            const proofJson = this.encryption.decrypt(encryptedData);
            const proofRecord: ProofRecord = JSON.parse(proofJson);

            return proofRecord;
        } catch (error) {
            logger.error('Failed to load proof locally', { 
                proofId,
                error: error instanceof Error ? error.message : String(error)
            });
            return null;
        }
    }

    private async ensureStorageDirectory(): Promise<void> {
        try {
            await access(this.storagePath);
        } catch {
            await mkdir(this.storagePath, { recursive: true });
            logger.info('Storage directory created', { path: this.storagePath });
        }
    }

    async cleanupExpiredProofs(): Promise<number> {
        try {
            // Wait for initialization if not ready
            await this.waitForInitialization();
            
            const now = Date.now();
            let cleanedCount = 0;

            // Clean memory cache
            for (const [proofId, proofRecord] of this.cache.entries()) {
                if (proofRecord.expiresAt < now) {
                    this.cache.delete(proofId);
                    this.hashIndex.delete(proofRecord.imageHash);
                    cleanedCount++;
                }
            }

            // Clean filesystem if enabled
            if (this.useLocalFilesystem) {
                // Implementation would require fs.readdir for async directory listing
                logger.info('Filesystem cleanup not implemented in this version');
            }

            logger.info('Expired proofs cleaned', { count: cleanedCount });
            return cleanedCount;
        } catch (error) {
            logger.error('Failed to cleanup expired proofs', { 
                error: error instanceof Error ? error.message : String(error)
            });
            return 0;
        }
    }

    async getStats(): Promise<{ totalProofs: number; cachedProofs: number }> {
        return {
            totalProofs: this.hashIndex.size,
            cachedProofs: this.cache.size
        };
    }

    async destroy(): Promise<void> {
        try {
            // Wait for all pending writes to complete
            await this.writeQueue;
            
            // Clear cleanup interval to prevent memory leaks
            if (this.cleanupInterval) {
                clearInterval(this.cleanupInterval);
                this.cleanupInterval = null;
            }
            
            // Clear memory
            this.cache.clear();
            this.hashIndex.clear();
            
            logger.info('AsyncProofStorage destroyed successfully');
        } catch (error) {
            logger.error('Failed to destroy AsyncProofStorage', { 
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    async close(): Promise<void> {
        await this.destroy();
    }
}
