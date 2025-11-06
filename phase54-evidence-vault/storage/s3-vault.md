# S3 Evidence Vault Storage Layer

## Overview

Implements WORM (Write Once Read Many) storage using Amazon S3 Object Lock in Compliance mode. Provides immutable, versioned storage for all evidence records with SEC 17a-4, CFTC, and FINRA compliance as assessed by Cohasset.

## S3 Bucket Configuration

### Primary Evidence Vault

```typescript
import { S3Client, PutBucketVersioningCommand, PutObjectLockConfigurationCommand } from '@aws-sdk/client-s3';

interface S3VaultConfig {
  bucketName: string;
  region: string;
  defaultRetentionDays: number;  // 730 days (24 months)
  accountId: string;
}

export class S3EvidenceVault {
  private readonly s3: S3Client;
  private readonly config: S3VaultConfig;

  constructor(config: S3VaultConfig) {
    this.config = config;
    this.s3 = new S3Client({ region: config.region });
  }

  /**
   * Initialize evidence vault bucket with Object Lock
   * Must be called during bucket creation
   */
  async initializeVault(): Promise<void> {
    // Validate configuration
    if (!this.config.bucketName || !this.config.region) {
      throw new Error('Bucket name and region are required');
    }
    
    if (!this.config.bucketName.match(/^[a-z0-9.-]{3,63}$/)) {
      throw new Error('Invalid bucket name format');
    }
    
    if (this.config.defaultRetentionDays < 1 || this.config.defaultRetentionDays > 3650) {
      throw new Error('Retention days must be between 1 and 3650');
    }
    
    try {
      // Enable versioning (required for Object Lock)
      await this.s3.send(new PutBucketVersioningCommand({
        Bucket: this.config.bucketName,
        VersioningConfiguration: {
          Status: 'Enabled'
        }
      }));
    } catch (error) {
      throw new Error(`Failed to enable versioning: ${error}`);
    }
    
    try {
      // Configure Object Lock in Compliance mode
      await this.s3.send(new PutObjectLockConfigurationCommand({
        Bucket: this.config.bucketName,
        ObjectLockConfiguration: {
          ObjectLockEnabled: 'Enabled',
          Rule: {
            DefaultRetention: {
              Mode: 'COMPLIANCE',  // Cannot be overridden by any user
              Days: this.config.defaultRetentionDays
            }
          }
        }
      }));
    } catch (error) {
      throw new Error(`Failed to configure Object Lock: ${error}`);
    }
  }
}
```

### Bucket Policy (Least Privilege)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyInsecureTransport",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::evidence-vault-prod",
        "arn:aws:s3:::evidence-vault-prod/*"
      ],
      "Condition": {
        "Bool": {
          "aws:SecureTransport": "false"
        }
      }
    },
    {
      "Sid": "DenyDeleteObject",
      "Effect": "Deny",
      "Principal": "*",
      "Action": [
        "s3:DeleteObject",
        "s3:DeleteObjectVersion"
      ],
      "Resource": "arn:aws:s3:::evidence-vault-prod/*"
    },
    {
      "Sid": "DenyObjectLockBypass",
      "Effect": "Deny",
      "Principal": "*",
      "Action": [
        "s3:BypassGovernanceRetention",
        "s3:PutObjectRetention"
      ],
      "Resource": "arn:aws:s3:::evidence-vault-prod/*",
      "Condition": {
        "StringNotEquals": {
          "s3:object-lock-mode": "COMPLIANCE"
        }
      }
    },
    {
      "Sid": "DenyUnencryptedObjectUpload",
      "Effect": "Deny",
      "Principal": "*",
      "Action": [
        "s3:PutObject"
      ],
      "Resource": "arn:aws:s3:::evidence-vault-prod/*",
      "Condition": {
        "StringNotEquals": {
          "s3:x-amz-server-side-encryption": "aws:kms"
        }
      }
    },
    {
      "Sid": "AllowEvidenceWrite",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::ACCOUNT_ID:role/EvidenceVaultWriter"
      },
      "Action": [
        "s3:PutObject",
        "s3:PutObjectLegalHold"
      ],
      "Resource": "arn:aws:s3:::evidence-vault-prod/*",
      "Condition": {
        "StringEquals": {
          "s3:x-amz-server-side-encryption": "aws:kms"
        }
      }
    },
    {
      "Sid": "AllowEvidenceRead",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::ACCOUNT_ID:role/EvidenceVaultReader"
      },
      "Action": [
        "s3:GetObject",
        "s3:GetObjectVersion",
        "s3:GetObjectLegalHold",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::evidence-vault-prod",
        "arn:aws:s3:::evidence-vault-prod/*"
      ]
    }
  ]
}
```

## Evidence Storage Operations

### Store Evidence Record

```typescript
import { PutObjectCommand, PutObjectLegalHoldCommand } from '@aws-sdk/client-s3';
import { createHash } from 'crypto';

interface StoreEvidenceRequest {
  evidenceId: string;
  tenantId: string;
  assetId: string;
  data: EvidenceRecord;
  legalHold?: boolean;
}

export class EvidenceStorage {
  private readonly s3: S3Client;
  private readonly bucketName: string;

  /**
   * Store evidence record with WORM protection
   */
  async storeEvidence(request: StoreEvidenceRequest): Promise<StoreEvidenceResponse> {
    // Security: Validate request
    if (!request || !request.data || !request.evidenceId || !request.tenantId || !request.assetId) {
      throw new Error('Invalid request: missing required fields');
    }
    
    // Security: Validate request size
    const MAX_EVIDENCE_SIZE = 100 * 1024 * 1024; // 100MB limit
    const data = JSON.stringify(request.data);
    
    if (data.length > MAX_EVIDENCE_SIZE) {
      throw new Error(`Evidence record too large: ${data.length} bytes`);
    }
    
    // Security: Validate evidence structure
    if (!this.isValidEvidenceRecord(request.data)) {
      throw new Error('Invalid evidence record structure');
    }
    
    // Security: Validate KMS key
    const kmsKeyArn = process.env.EVIDENCE_KMS_KEY_ARN;
    if (!kmsKeyArn) {
      throw new Error('EVIDENCE_KMS_KEY_ARN environment variable not set');
    }
    
    if (!kmsKeyArn.startsWith('arn:aws:kms:')) {
      throw new Error('Invalid KMS key ARN format');
    }
    
    const key = this.buildObjectKey(request.tenantId, request.assetId, request.evidenceId);
    const sha256 = createHash('sha256').update(data).digest('hex');

    try {
      // Store object with Object Lock and encryption
      const putResult = await this.s3.send(new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: data,
        ContentType: 'application/json',
        ServerSideEncryption: 'aws:kms',
        SSEKMSKeyId: kmsKeyArn,
        Metadata: {
          'evidence-id': request.evidenceId,
          'tenant-id': request.tenantId,
          'asset-id': request.assetId,
          'sha256': sha256,
          'created-at': Date.now().toString(),
          'content-size': data.length.toString()
        },
        // Object Lock retention (uses bucket default)
        ObjectLockMode: 'COMPLIANCE',
        ObjectLockRetainUntilDate: this.calculateRetentionDate()
      }));

      // Apply legal hold if requested
      if (request.legalHold) {
        if (!putResult.VersionId) {
          throw new Error('Failed to get version ID from S3');
        }
        
        await this.s3.send(new PutObjectLegalHoldCommand({
          Bucket: this.bucketName,
          Key: key,
          VersionId: putResult.VersionId,
          LegalHold: {
            Status: 'ON'
          }
        }));
      }

      return {
        objectKey: key,
        versionId: putResult.VersionId!,
        sha256,
        retentionUntil: this.calculateRetentionDate().getTime(),
        legalHold: request.legalHold || false
      };
    } catch (error) {
      throw new Error(`Failed to store evidence: ${error}`);
    }
  }

  /**
   * Validate evidence record structure
   */
  private isValidEvidenceRecord(record: any): boolean {
    if (!record || typeof record !== 'object') {
      return false;
    }
    
    // Required fields
    const required = ['evidenceId', 'tenantId', 'assetId', 'createdAt'];
    for (const field of required) {
      if (!(field in record)) {
        return false;
      }
    }
    
    // Validate ID formats
    if (!this.isValidId(record.evidenceId) ||
        !this.isValidId(record.tenantId) ||
        !this.isValidId(record.assetId)) {
      return false;
    }
    
    // Validate timestamp
    if (typeof record.createdAt !== 'number' || record.createdAt <= 0) {
      return false;
    }
    
    return true;
  }

  /**
   * Build S3 object key with hierarchical structure
   */
  private buildObjectKey(tenantId: string, assetId: string, evidenceId: string): string {
    // Validate inputs to prevent path traversal
    if (!this.isValidId(tenantId) || !this.isValidId(assetId) || !this.isValidId(evidenceId)) {
      throw new Error('Invalid ID format');
    }

    // Structure: evidence/{tenant}/{asset}/{evidence_id}.json
    return `evidence/${tenantId}/${assetId}/${evidenceId}.json`;
  }

  /**
   * Validate ID format (strict alphanumeric with limited symbols)
   * Prevents path traversal, injection, and malformed keys
   */
  private isValidId(id: string): boolean {
    // Must be 1-128 characters, alphanumeric with hyphens and underscores
    // Cannot start or end with hyphen/underscore
    // No consecutive hyphens/underscores
    const idPattern = /^[a-zA-Z0-9](?:[a-zA-Z0-9_-]{0,126}[a-zA-Z0-9])$/;
    
    if (!idPattern.test(id)) {
      return false;
    }
    
    // Additional checks for security
    if (id.includes('--') || id.includes('__')) {
      return false;
    }
    
    // Check for common path traversal patterns
    if (id.includes('../') || id.includes('..\\') || id.includes('%2e%2e')) {
      return false;
    }
    
    // No null bytes or control characters
    if (id.includes('\0') || /[\x00-\x1F\x7F]/.test(id)) {
      return false;
    }
    
    return true;
  }

  /**
   * Calculate retention date (24 months from now)
   */
  private calculateRetentionDate(): Date {
    const date = new Date();
    date.setMonth(date.getMonth() + 24);
    return date;
  }
}

interface StoreEvidenceResponse {
  objectKey: string;
  versionId: string;
  sha256: string;
  retentionUntil: number;
  legalHold: boolean;
}
```

### Store HTTP Headers Snapshot

```typescript
interface HttpHeadersSnapshot {
  etag: string;
  cacheControl: string;
  date: string;
  contentType: string;
  contentLength: number;
  rawHeaders: Record<string, string>;
}

export class HttpSnapshotStorage {
  private readonly s3: S3Client;
  private readonly bucketName: string;

  /**
   * Store HTTP headers verbatim for forensic reconstruction
   */
  async storeHttpSnapshot(
    tenantId: string,
    assetId: string,
    timestamp: number,
    snapshot: HttpHeadersSnapshot
  ): Promise<string> {
    // Validate inputs
    if (!this.isValidId(tenantId) || !this.isValidId(assetId)) {
      throw new Error('Invalid ID format');
    }

    const key = `headers/${tenantId}/${assetId}/${timestamp}.http`;
    
    // Format as HTTP/1.1 headers (RFC 9110)
    const httpFormat = this.formatAsHttpHeaders(snapshot);

    const result = await this.s3.send(new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: httpFormat,
      ContentType: 'message/http',
      Metadata: {
        'tenant-id': tenantId,
        'asset-id': assetId,
        'timestamp': timestamp.toString(),
        'etag': snapshot.etag
      },
      ObjectLockMode: 'COMPLIANCE',
      ObjectLockRetainUntilDate: this.calculateRetentionDate()
    }));

    return result.VersionId!;
  }

  /**
   * Format snapshot as RFC 9110 HTTP headers
   */
  private formatAsHttpHeaders(snapshot: HttpHeadersSnapshot): string {
    const lines: string[] = [];
    
    // Add standard headers
    lines.push(`ETag: ${snapshot.etag}`);
    lines.push(`Cache-Control: ${snapshot.cacheControl}`);
    lines.push(`Date: ${snapshot.date}`);
    lines.push(`Content-Type: ${snapshot.contentType}`);
    lines.push(`Content-Length: ${snapshot.contentLength}`);
    
    // Add all raw headers
    for (const [name, value] of Object.entries(snapshot.rawHeaders)) {
      // Skip duplicates
      if (!['etag', 'cache-control', 'date', 'content-type', 'content-length'].includes(name.toLowerCase())) {
        lines.push(`${name}: ${value}`);
      }
    }
    
    return lines.join('\r\n') + '\r\n\r\n';
  }

  private isValidId(id: string): boolean {
    return /^[a-zA-Z0-9_-]+$/.test(id);
  }

  private calculateRetentionDate(): Date {
    const date = new Date();
    date.setMonth(date.getMonth() + 24);
    return date;
  }
}
```

### Store Manifest

```typescript
export class ManifestStorage {
  private readonly s3: S3Client;
  private readonly bucketName: string;

  /**
   * Store C2PA manifest with optional compression
   */
  async storeManifest(
    tenantId: string,
    manifestHash: string,
    manifestData: Buffer
  ): Promise<string> {
    // Validate inputs
    if (!this.isValidId(tenantId) || !/^[a-f0-9]{64}$/i.test(manifestHash)) {
      throw new Error('Invalid input format');
    }

    const key = `manifests/${tenantId}/${manifestHash}.c2pa.json`;
    
    // Compress if large (>1MB)
    const data = manifestData.length > 1024 * 1024 
      ? await this.compressManifest(manifestData)
      : manifestData;

    const result = await this.s3.send(new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: data,
      ContentType: 'application/json',
      ContentEncoding: manifestData.length > 1024 * 1024 ? 'gzip' : undefined,
      Metadata: {
        'tenant-id': tenantId,
        'manifest-hash': manifestHash,
        'original-size': manifestData.length.toString(),
        'compressed': (manifestData.length > 1024 * 1024).toString()
      },
      ObjectLockMode: 'COMPLIANCE',
      ObjectLockRetainUntilDate: this.calculateRetentionDate()
    }));

    return result.VersionId!;
  }

  /**
   * Compress manifest per C2PA guidance
   */
  private async compressManifest(data: Buffer): Promise<Buffer> {
    const { gzip } = await import('zlib');
    const { promisify } = await import('util');
    const gzipAsync = promisify(gzip);
    return await gzipAsync(data);
  }

  private isValidId(id: string): boolean {
    return /^[a-zA-Z0-9_-]+$/.test(id);
  }

  private calculateRetentionDate(): Date {
    const date = new Date();
    date.setMonth(date.getMonth() + 24);
    return date;
  }
}
```

## Legal Hold Management

```typescript
import { GetObjectLegalHoldCommand, PutObjectLegalHoldCommand } from '@aws-sdk/client-s3';

export class LegalHoldManager {
  private readonly s3: S3Client;
  private readonly bucketName: string;

  /**
   * Place legal hold on object
   */
  async placeLegalHold(
    objectKey: string,
    versionId: string,
    reason: string,
    placedBy: string
  ): Promise<void> {
    // Validate inputs
    if (!objectKey || !versionId) {
      throw new Error('Object key and version ID required');
    }

    await this.s3.send(new PutObjectLegalHoldCommand({
      Bucket: this.bucketName,
      Key: objectKey,
      VersionId: versionId,
      LegalHold: {
        Status: 'ON'
      }
    }));

    // Log hold placement (to transparency log)
    await this.logHoldEvent({
      action: 'place',
      objectKey,
      versionId,
      reason,
      placedBy,
      timestamp: Date.now()
    });
  }

  /**
   * Release legal hold
   */
  async releaseLegalHold(
    objectKey: string,
    versionId: string,
    reason: string,
    releasedBy: string
  ): Promise<void> {
    // Validate inputs
    if (!objectKey || !versionId) {
      throw new Error('Object key and version ID required');
    }

    await this.s3.send(new PutObjectLegalHoldCommand({
      Bucket: this.bucketName,
      Key: objectKey,
      VersionId: versionId,
      LegalHold: {
        Status: 'OFF'
      }
    }));

    // Log hold release (to transparency log)
    await this.logHoldEvent({
      action: 'release',
      objectKey,
      versionId,
      reason,
      releasedBy,
      timestamp: Date.now()
    });
  }

  /**
   * Check if object has legal hold
   */
  async hasLegalHold(objectKey: string, versionId: string): Promise<boolean> {
    try {
      const result = await this.s3.send(new GetObjectLegalHoldCommand({
        Bucket: this.bucketName,
        Key: objectKey,
        VersionId: versionId
      }));

      return result.LegalHold?.Status === 'ON';
    } catch (error) {
      // No legal hold set
      return false;
    }
  }

  /**
   * Log hold event to transparency log
   */
  private async logHoldEvent(event: LegalHoldEvent): Promise<void> {
    // Implementation in transparency-log.md
  }
}

interface LegalHoldEvent {
  action: 'place' | 'release';
  objectKey: string;
  versionId: string;
  reason: string;
  placedBy?: string;
  releasedBy?: string;
  timestamp: number;
}
```

## S3 Lifecycle Configuration

```typescript
import { PutBucketLifecycleConfigurationCommand } from '@aws-sdk/client-s3';

export class LifecycleManager {
  private readonly s3: S3Client;
  private readonly bucketName: string;

  /**
   * Configure tiered storage for cost optimization
   */
  async configureLifecycle(): Promise<void> {
    await this.s3.send(new PutBucketLifecycleConfigurationCommand({
      Bucket: this.bucketName,
      LifecycleConfiguration: {
        Rules: [
          {
            Id: 'TransitionToIA',
            Status: 'Enabled',
            Filter: {
              Prefix: 'evidence/'
            },
            Transitions: [
              {
                Days: 90,  // After 90 days
                StorageClass: 'STANDARD_IA'
              },
              {
                Days: 180,  // After 180 days
                StorageClass: 'GLACIER_IR'  // Instant Retrieval
              },
              {
                Days: 365,  // After 1 year
                StorageClass: 'DEEP_ARCHIVE'
              }
            ]
          },
          {
            Id: 'ExpireOldVersions',
            Status: 'Enabled',
            NoncurrentVersionExpiration: {
              NoncurrentDays: 90  // Keep old versions for 90 days
            }
          }
        ]
      }
    }));
  }
}
```

## Monitoring & Metrics

```typescript
import { CloudWatch } from '@aws-sdk/client-cloudwatch';

export class VaultMetrics {
  private readonly cloudwatch: CloudWatch;
  private readonly namespace = 'EvidenceVault';

  /**
   * Record WORM write operation
   */
  async recordWormWrite(success: boolean, latencyMs: number): Promise<void> {
    await this.cloudwatch.putMetricData({
      Namespace: this.namespace,
      MetricData: [
        {
          MetricName: 'WormWrites',
          Value: 1,
          Unit: 'Count',
          Dimensions: [
            { Name: 'Status', Value: success ? 'Success' : 'Failure' }
          ]
        },
        {
          MetricName: 'WormWriteLatency',
          Value: latencyMs,
          Unit: 'Milliseconds'
        }
      ]
    });
  }

  /**
   * Record legal hold operation
   */
  async recordLegalHold(action: 'place' | 'release'): Promise<void> {
    await this.cloudwatch.putMetricData({
      Namespace: this.namespace,
      MetricData: [
        {
          MetricName: 'LegalHoldOperations',
          Value: 1,
          Unit: 'Count',
          Dimensions: [
            { Name: 'Action', Value: action }
          ]
        }
      ]
    });
  }

  /**
   * Record storage usage
   */
  async recordStorageUsage(tenantId: string, bytes: number): Promise<void> {
    await this.cloudwatch.putMetricData({
      Namespace: this.namespace,
      MetricData: [
        {
          MetricName: 'StorageUsage',
          Value: bytes,
          Unit: 'Bytes',
          Dimensions: [
            { Name: 'TenantId', Value: tenantId }
          ]
        }
      ]
    });
  }
}
```

## Security Considerations

### Access Control
- Use IAM roles with least privilege
- Separate reader and writer roles
- MFA required for legal hold operations
- All access logged to CloudTrail

### Encryption
- S3 server-side encryption (SSE-S3 or SSE-KMS)
- Encryption at rest for all objects
- TLS 1.3 for data in transit

### Audit Trail
- CloudTrail logs all S3 API calls
- Object-level logging enabled
- Logs stored in separate account
- Logs also have Object Lock enabled

### Compliance
- SEC 17a-4(f) compliant (Cohasset assessment)
- CFTC Rule 1.31 compliant
- FINRA Rule 4511 compliant
- NIST 800-53 controls implemented

## Cost Optimization

### Storage Tiering
- **Standard:** 0-90 days (hot access)
- **Standard-IA:** 90-180 days (warm access)
- **Glacier IR:** 180-365 days (cold access)
- **Deep Archive:** 365+ days (archive)

### Data Compression
- Compress manifests >1MB
- Gzip compression for JSON
- Maintain original hash for verification

### Lifecycle Management
- Automatic transition to cheaper storage classes
- Expire non-current versions after 90 days
- Monitor and alert on storage growth

## Disaster Recovery

### Cross-Region Replication
```typescript
import { PutBucketReplicationCommand } from '@aws-sdk/client-s3';

export class DisasterRecovery {
  async enableCrossRegionReplication(
    sourceBucket: string,
    destinationBucket: string,
    roleArn: string
  ): Promise<void> {
    await this.s3.send(new PutBucketReplicationCommand({
      Bucket: sourceBucket,
      ReplicationConfiguration: {
        Role: roleArn,
        Rules: [
          {
            Id: 'ReplicateEvidence',
            Status: 'Enabled',
            Priority: 1,
            Filter: {
              Prefix: 'evidence/'
            },
            Destination: {
              Bucket: `arn:aws:s3:::${destinationBucket}`,
              ReplicationTime: {
                Status: 'Enabled',
                Time: {
                  Minutes: 15  // RTC: 15-minute SLA
                }
              },
              Metrics: {
                Status: 'Enabled'
              }
            },
            DeleteMarkerReplication: {
              Status: 'Disabled'  // Don't replicate deletes
            }
          }
        ]
      }
    }));
  }
}
```

## References

- **AWS S3 Object Lock:** https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html
- **SEC 17a-4 Compliance:** Cohasset Assessment
- **NIST SP 800-53:** Security and Privacy Controls
- **AWS CloudTrail:** https://docs.aws.amazon.com/awscloudtrail/latest/userguide/
