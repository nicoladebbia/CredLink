# Tamper-Evident Transparency Log (Merkle Tree)

## Overview

Implements a Rekor-style append-only transparency log using Merkle trees for tamper-evident evidence tracking. Provides cryptographic proofs that the log history has not been rewritten.

## Merkle Tree Implementation

```typescript
import { createHash } from 'crypto';

export class MerkleTree {
  private leaves: Buffer[] = [];
  private nodes: Map<string, Buffer> = new Map();

  /**
   * Add leaf to tree
   */
  addLeaf(data: Buffer): number {
    const leafHash = this.hashLeaf(data);
    const leafIndex = this.leaves.length;
    this.leaves.push(leafHash);
    
    // Rebuild tree from this point
    this.rebuildFrom(leafIndex);
    
    return leafIndex;
  }

  /**
   * Get root hash
   */
  getRoot(): Buffer {
    if (this.leaves.length === 0) {
      return Buffer.alloc(32);  // Empty tree
    }
    
    return this.getNodeHash(0, this.leaves.length);
  }

  /**
   * Get tree size
   */
  getSize(): number {
    return this.leaves.length;
  }

  /**
   * Generate inclusion proof for leaf
   */
  generateInclusionProof(leafIndex: number): InclusionProof {
    if (leafIndex >= this.leaves.length) {
      throw new Error('Leaf index out of bounds');
    }

    const proof: Buffer[] = [];
    let index = leafIndex;
    let treeSize = this.leaves.length;

    // Build proof path from leaf to root
    while (treeSize > 1) {
      const isRightNode = index % 2 === 1;
      const siblingIndex = isRightNode ? index - 1 : index + 1;

      if (siblingIndex < treeSize) {
        const siblingHash = this.getLeafHash(siblingIndex);
        proof.push(siblingHash);
      }

      index = Math.floor(index / 2);
      treeSize = Math.ceil(treeSize / 2);
    }

    return {
      leafIndex,
      leafHash: this.leaves[leafIndex],
      treeSize: this.leaves.length,
      proof
    };
  }

  /**
   * Verify inclusion proof
   */
  verifyInclusionProof(proof: InclusionProof, expectedRoot: Buffer): boolean {
    let hash = proof.leafHash;
    let index = proof.leafIndex;

    for (const sibling of proof.proof) {
      const isRightNode = index % 2 === 1;
      
      if (isRightNode) {
        hash = this.hashNodes(sibling, hash);
      } else {
        hash = this.hashNodes(hash, sibling);
      }

      index = Math.floor(index / 2);
    }

    return hash.equals(expectedRoot);
  }

  /**
   * Generate consistency proof between two tree sizes
   */
  generateConsistencyProof(oldSize: number, newSize: number): ConsistencyProof {
    if (oldSize > newSize || oldSize > this.leaves.length || newSize > this.leaves.length) {
      throw new Error('Invalid tree sizes for consistency proof');
    }

    if (oldSize === newSize) {
      return {
        oldSize,
        newSize,
        proof: []
      };
    }

    const proof: Buffer[] = [];
    
    // Build consistency proof
    this.buildConsistencyProof(0, oldSize, newSize, proof);

    return {
      oldSize,
      newSize,
      proof
    };
  }

  /**
   * Verify consistency proof
   */
  verifyConsistencyProof(
    proof: ConsistencyProof,
    oldRoot: Buffer,
    newRoot: Buffer
  ): boolean {
    if (proof.oldSize === proof.newSize) {
      return oldRoot.equals(newRoot);
    }

    // Reconstruct old and new roots from proof
    let oldHash = proof.proof[0];
    let newHash = proof.proof[0];

    for (let i = 1; i < proof.proof.length; i++) {
      const sibling = proof.proof[i];
      oldHash = this.hashNodes(oldHash, sibling);
      newHash = this.hashNodes(newHash, sibling);
    }

    return oldHash.equals(oldRoot) && newHash.equals(newRoot);
  }

  /**
   * Hash leaf data
   */
  private hashLeaf(data: Buffer): Buffer {
    // Prefix with 0x00 to distinguish from internal nodes
    return createHash('sha256').update(Buffer.concat([Buffer.from([0x00]), data])).digest();
  }

  /**
   * Hash two nodes
   */
  private hashNodes(left: Buffer, right: Buffer): Buffer {
    // Prefix with 0x01 to distinguish from leaves
    return createHash('sha256')
      .update(Buffer.concat([Buffer.from([0x01]), left, right]))
      .digest();
  }

  /**
   * Get node hash at position
   */
  private getNodeHash(start: number, end: number): Buffer {
    const key = `${start}:${end}`;
    
    if (this.nodes.has(key)) {
      return this.nodes.get(key)!;
    }

    if (end - start === 1) {
      // Leaf node
      return this.leaves[start];
    }

    // Internal node
    const mid = Math.floor((start + end) / 2);
    const left = this.getNodeHash(start, mid);
    const right = this.getNodeHash(mid, end);
    const hash = this.hashNodes(left, right);
    
    this.nodes.set(key, hash);
    return hash;
  }

  /**
   * Get leaf hash
   */
  private getLeafHash(index: number): Buffer {
    return this.leaves[index];
  }

  /**
   * Rebuild tree from index
   */
  private rebuildFrom(startIndex: number): void {
    // Clear cached nodes that need recalculation
    const keysToDelete: string[] = [];
    for (const key of this.nodes.keys()) {
      const [start] = key.split(':').map(Number);
      if (start >= startIndex) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => this.nodes.delete(key));
  }

  /**
   * Build consistency proof recursively
   */
  private buildConsistencyProof(
    start: number,
    oldSize: number,
    newSize: number,
    proof: Buffer[]
  ): void {
    if (oldSize === newSize) {
      return;
    }

    const mid = this.largestPowerOfTwo(newSize - start);

    if (oldSize <= start + mid) {
      // Old tree is entirely in left subtree
      proof.push(this.getNodeHash(start, start + mid));
      this.buildConsistencyProof(start + mid, oldSize, newSize, proof);
    } else {
      // Old tree spans both subtrees
      this.buildConsistencyProof(start, oldSize, start + mid, proof);
      proof.push(this.getNodeHash(start + mid, newSize));
    }
  }

  /**
   * Find largest power of 2 less than n
   */
  private largestPowerOfTwo(n: number): number {
    let power = 1;
    while (power * 2 < n) {
      power *= 2;
    }
    return power;
  }
}

interface InclusionProof {
  leafIndex: number;
  leafHash: Buffer;
  treeSize: number;
  proof: Buffer[];
}

interface ConsistencyProof {
  oldSize: number;
  newSize: number;
  proof: Buffer[];
}
```

## Transparency Log Service

```typescript
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { EventEmitter } from 'events';

export class TransparencyLog extends EventEmitter {
  private readonly tree: MerkleTree;
  private readonly s3: S3Client;
  private readonly bucketName: string;
  private readonly logName: string;

  constructor(bucketName: string, logName: string = 'evidence-log') {
    super();
    this.tree = new MerkleTree();
    this.s3 = new S3Client({});
    this.bucketName = bucketName;
    this.logName = logName;
  }

  /**
   * Append entry to log
   */
  async appendEntry(entry: LogEntry): Promise<LogEntryResult> {
    // Serialize entry
    const entryData = this.serializeEntry(entry);
    const entryHash = createHash('sha256').update(entryData).digest('hex');

    // Add to Merkle tree
    const leafIndex = this.tree.addLeaf(entryData);
    const treeSize = this.tree.getSize();
    const rootHash = this.tree.getRoot().toString('hex');

    // Store entry in S3
    const key = `log/${this.logName}/entries/${leafIndex}.json`;
    await this.s3.send(new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: JSON.stringify({
        ...entry,
        leafIndex,
        entryHash,
        treeSize,
        rootHash
      }),
      ContentType: 'application/json',
      Metadata: {
        'leaf-index': leafIndex.toString(),
        'tree-size': treeSize.toString(),
        'root-hash': rootHash
      },
      ObjectLockMode: 'COMPLIANCE',
      ObjectLockRetainUntilDate: this.calculateRetentionDate()
    }));

    // Generate inclusion proof
    const inclusionProof = this.tree.generateInclusionProof(leafIndex);

    this.emit('entry_appended', {
      leafIndex,
      entryHash,
      treeSize,
      rootHash
    });

    return {
      leafIndex,
      entryHash,
      treeSize,
      rootHash,
      inclusionProof: {
        leafIndex: inclusionProof.leafIndex,
        leafHash: inclusionProof.leafHash.toString('hex'),
        treeSize: inclusionProof.treeSize,
        proof: inclusionProof.proof.map(p => p.toString('hex'))
      }
    };
  }

  /**
   * Generate checkpoint
   */
  async generateCheckpoint(): Promise<Checkpoint> {
    const treeSize = this.tree.getSize();
    const rootHash = this.tree.getRoot().toString('hex');
    const timestamp = Date.now();

    const checkpoint: Checkpoint = {
      origin: this.logName,
      treeSize,
      rootHash,
      timestamp,
      signature: '' // Will be signed
    };

    // Sign checkpoint
    checkpoint.signature = await this.signCheckpoint(checkpoint);

    // Store checkpoint
    const key = `log/${this.logName}/checkpoints/${timestamp}.json`;
    await this.s3.send(new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: JSON.stringify(checkpoint),
      ContentType: 'application/json',
      Metadata: {
        'tree-size': treeSize.toString(),
        'root-hash': rootHash,
        'timestamp': timestamp.toString()
      },
      ObjectLockMode: 'COMPLIANCE',
      ObjectLockRetainUntilDate: this.calculateRetentionDate()
    }));

    this.emit('checkpoint_created', checkpoint);

    return checkpoint;
  }

  /**
   * Verify consistency between checkpoints
   */
  async verifyConsistency(
    oldCheckpoint: Checkpoint,
    newCheckpoint: Checkpoint
  ): Promise<ConsistencyVerification> {
    if (oldCheckpoint.treeSize > newCheckpoint.treeSize) {
      return {
        consistent: false,
        reason: 'Old tree size greater than new tree size'
      };
    }

    // Generate consistency proof
    const proof = this.tree.generateConsistencyProof(
      oldCheckpoint.treeSize,
      newCheckpoint.treeSize
    );

    // Verify proof
    const oldRoot = Buffer.from(oldCheckpoint.rootHash, 'hex');
    const newRoot = Buffer.from(newCheckpoint.rootHash, 'hex');
    const consistent = this.tree.verifyConsistencyProof(proof, oldRoot, newRoot);

    return {
      consistent,
      proof: {
        oldSize: proof.oldSize,
        newSize: proof.newSize,
        proof: proof.proof.map(p => p.toString('hex'))
      }
    };
  }

  /**
   * Get entry by index
   */
  async getEntry(leafIndex: number): Promise<StoredLogEntry | null> {
    const key = `log/${this.logName}/entries/${leafIndex}.json`;
    
    try {
      const result = await this.s3.send(new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key
      }));

      const chunks: Buffer[] = [];
      for await (const chunk of result.Body as any) {
        chunks.push(chunk);
      }
      
      const data = Buffer.concat(chunks).toString('utf8');
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  /**
   * Get latest checkpoint
   */
  async getLatestCheckpoint(): Promise<Checkpoint | null> {
    // Security: Validate checkpoint size to prevent DoS
    const MAX_CHECKPOINT_SIZE = 1024 * 1024; // 1MB limit
    
    // List checkpoints and get latest
    const { ListObjectsV2Command } = await import('@aws-sdk/client-s3');
    
    const result = await this.s3.send(new ListObjectsV2Command({
      Bucket: this.bucketName,
      Prefix: `log/${this.logName}/checkpoints/`,
      MaxKeys: 1
    }));

    if (!result.Contents || result.Contents.length === 0) {
      return null;
    }

    const latestKey = result.Contents[result.Contents.length - 1].Key!;
    
    // Security: Validate key format
    if (!latestKey.match(/^log\/[a-zA-Z0-9_-]+\/checkpoints\/\d+\.json$/)) {
      throw new Error(`Invalid checkpoint key format: ${latestKey}`);
    }
    
    const checkpoint = await this.s3.send(new GetObjectCommand({
      Bucket: this.bucketName,
      Key: latestKey
    }));

    const chunks: Buffer[] = [];
    let totalSize = 0;
    
    // Security: Stream with size limit
    for await (const chunk of checkpoint.Body as any) {
      totalSize += chunk.length;
      if (totalSize > MAX_CHECKPOINT_SIZE) {
        throw new Error(`Checkpoint too large: ${totalSize} bytes`);
      }
      chunks.push(chunk);
    }
    
    const data = Buffer.concat(chunks).toString('utf8');
    
    // Security: Validate JSON before parsing
    let parsed;
    try {
      parsed = JSON.parse(data);
    } catch (error) {
      throw new Error(`Invalid checkpoint JSON: ${error}`);
    }
    
    // Security: Validate checkpoint structure
    if (!this.isValidCheckpoint(parsed)) {
      throw new Error('Invalid checkpoint structure');
    }
    
    return parsed;
  }

  /**
   * Serialize log entry
   */
  private serializeEntry(entry: LogEntry): Buffer {
    // Security: Validate entry size
    const serialized = JSON.stringify({
      type: entry.type,
      timestamp: entry.timestamp,
      tenantId: entry.tenantId,
      data: entry.data
    });
    
    if (serialized.length > 64 * 1024) { // 64KB limit
      throw new Error(`Log entry too large: ${serialized.length} bytes`);
    }
    
    return Buffer.from(serialized);
  }

  /**
   * Validate checkpoint structure
   */
  private isValidCheckpoint(checkpoint: any): boolean {
    if (!checkpoint || typeof checkpoint !== 'object') {
      return false;
    }
    
    // Required fields
    const required = ['origin', 'treeSize', 'rootHash', 'timestamp', 'signature'];
    for (const field of required) {
      if (!(field in checkpoint)) {
        return false;
      }
    }
    
    // Type validation
    if (typeof checkpoint.origin !== 'string' || 
        typeof checkpoint.treeSize !== 'number' ||
        typeof checkpoint.rootHash !== 'string' ||
        typeof checkpoint.timestamp !== 'number' ||
        typeof checkpoint.signature !== 'string') {
      return false;
    }
    
    // Value validation
    if (!checkpoint.origin.match(/^[a-zA-Z0-9_-]+$/) ||
        checkpoint.treeSize < 0 ||
        !checkpoint.rootHash.match(/^[a-f0-9]{64}$/i) ||
        checkpoint.timestamp <= 0 ||
        checkpoint.signature.length === 0) {
      return false;
    }
    
    return true;
  }

  /**
   * Sign checkpoint securely
   */
  private async signCheckpoint(checkpoint: Checkpoint): Promise<string> {
    const { createSign } = await import('crypto');
    
    // Security: Use KMS or secure key management in production
    const keyPath = process.env.LOG_SIGNING_KEY_PATH;
    if (!keyPath) {
      throw new Error('LOG_SIGNING_KEY_PATH environment variable not set');
    }
    
    // Security: Validate key path
    if (keyPath.includes('..') || keyPath.includes('\0')) {
      throw new Error('Invalid key path');
    }
    
    const { readFileSync } = await import('fs');
    let privateKey;
    
    try {
      privateKey = readFileSync(keyPath, 'utf8');
    } catch (error) {
      throw new Error(`Failed to read signing key: ${error}`);
    }
    
    // Security: Validate key format
    if (!privateKey.includes('-----BEGIN PRIVATE KEY-----') ||
        !privateKey.includes('-----END PRIVATE KEY-----')) {
      throw new Error('Invalid private key format');
    }
    
    // Create canonical signature data
    const data = JSON.stringify({
      origin: checkpoint.origin,
      treeSize: checkpoint.treeSize,
      rootHash: checkpoint.rootHash,
      timestamp: checkpoint.timestamp
    });
    
    const sign = createSign('SHA256');
    sign.update(data);
    return sign.sign(privateKey, 'hex');
  }

  private calculateRetentionDate(): Date {
    const date = new Date();
    date.setMonth(date.getMonth() + 24);
    return date;
  }
}

interface LogEntry {
  type: 'evidence_stored' | 'legal_hold_placed' | 'legal_hold_released' | 'export_created';
  timestamp: number;
  tenantId: string;
  data: Record<string, any>;
}

interface LogEntryResult {
  leafIndex: number;
  entryHash: string;
  treeSize: number;
  rootHash: string;
  inclusionProof: {
    leafIndex: number;
    leafHash: string;
    treeSize: number;
    proof: string[];
  };
}

interface StoredLogEntry extends LogEntry {
  leafIndex: number;
  entryHash: string;
  treeSize: number;
  rootHash: string;
}

interface Checkpoint {
  origin: string;
  treeSize: number;
  rootHash: string;
  timestamp: number;
  signature: string;
}

interface ConsistencyVerification {
  consistent: boolean;
  reason?: string;
  proof?: {
    oldSize: number;
    newSize: number;
    proof: string[];
  };
}
```

## Log Event Types

```typescript
export class LogEventBuilder {
  /**
   * Build evidence stored event
   */
  static evidenceStored(
    tenantId: string,
    evidenceId: string,
    assetId: string,
    manifestHash: string
  ): LogEntry {
    return {
      type: 'evidence_stored',
      timestamp: Date.now(),
      tenantId,
      data: {
        evidenceId,
        assetId,
        manifestHash
      }
    };
  }

  /**
   * Build legal hold placed event
   */
  static legalHoldPlaced(
    tenantId: string,
    holdId: string,
    reason: string,
    placedBy: string,
    objectsAffected: number
  ): LogEntry {
    return {
      type: 'legal_hold_placed',
      timestamp: Date.now(),
      tenantId,
      data: {
        holdId,
        reason,
        placedBy,
        objectsAffected
      }
    };
  }

  /**
   * Build legal hold released event
   */
  static legalHoldReleased(
    tenantId: string,
    holdId: string,
    reason: string,
    releasedBy: string
  ): LogEntry {
    return {
      type: 'legal_hold_released',
      timestamp: Date.now(),
      tenantId,
      data: {
        holdId,
        reason,
        releasedBy
      }
    };
  }

  /**
   * Build export created event
   */
  static exportCreated(
    tenantId: string,
    exportId: string,
    scope: string,
    fileCount: number
  ): LogEntry {
    return {
      type: 'export_created',
      timestamp: Date.now(),
      tenantId,
      data: {
        exportId,
        scope,
        fileCount
      }
    };
  }
}
```

## Checkpoint Verifier (Offline)

```typescript
export class CheckpointVerifier {
  /**
   * Verify checkpoint signature
   */
  async verifyCheckpointSignature(
    checkpoint: Checkpoint,
    publicKey: string
  ): Promise<boolean> {
    const { createVerify } = await import('crypto');
    
    // Reconstruct signed data
    const data = JSON.stringify({
      origin: checkpoint.origin,
      treeSize: checkpoint.treeSize,
      rootHash: checkpoint.rootHash,
      timestamp: checkpoint.timestamp
    });
    
    // Verify signature
    const verify = createVerify('SHA256');
    verify.update(data);
    return verify.verify(publicKey, checkpoint.signature, 'hex');
  }

  /**
   * Verify checkpoint consistency
   */
  verifyCheckpointConsistency(
    oldCheckpoint: Checkpoint,
    newCheckpoint: Checkpoint,
    proof: ConsistencyProof
  ): boolean {
    const tree = new MerkleTree();
    
    const oldRoot = Buffer.from(oldCheckpoint.rootHash, 'hex');
    const newRoot = Buffer.from(newCheckpoint.rootHash, 'hex');
    
    return tree.verifyConsistencyProof(proof, oldRoot, newRoot);
  }
}
```

## Monitoring & Metrics

```typescript
import { CloudWatch } from '@aws-sdk/client-cloudwatch';

export class TransparencyLogMetrics {
  private readonly cloudwatch: CloudWatch;
  private readonly namespace = 'EvidenceVault/TransparencyLog';

  async recordLogAppend(success: boolean, latencyMs: number): Promise<void> {
    await this.cloudwatch.putMetricData({
      Namespace: this.namespace,
      MetricData: [
        {
          MetricName: 'LogAppends',
          Value: 1,
          Unit: 'Count',
          Dimensions: [
            { Name: 'Status', Value: success ? 'Success' : 'Failure' }
          ]
        },
        {
          MetricName: 'LogAppendLatency',
          Value: latencyMs,
          Unit: 'Milliseconds'
        }
      ]
    });
  }

  async recordCheckpointCreation(treeSize: number): Promise<void> {
    await this.cloudwatch.putMetricData({
      Namespace: this.namespace,
      MetricData: [
        {
          MetricName: 'CheckpointsCreated',
          Value: 1,
          Unit: 'Count'
        },
        {
          MetricName: 'TreeSize',
          Value: treeSize,
          Unit: 'Count'
        }
      ]
    });
  }

  async recordConsistencyCheck(consistent: boolean): Promise<void> {
    await this.cloudwatch.putMetricData({
      Namespace: this.namespace,
      MetricData: [
        {
          MetricName: 'ConsistencyChecks',
          Value: 1,
          Unit: 'Count',
          Dimensions: [
            { Name: 'Result', Value: consistent ? 'Consistent' : 'Inconsistent' }
          ]
        }
      ]
    });
  }
}
```

## References

- **Rekor:** Sigstore Transparency Log - https://docs.sigstore.dev/rekor/overview
- **Merkle Trees:** Certificate Transparency RFC 6962
- **Trillian:** Google's transparency log implementation
