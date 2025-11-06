# RFC 3161 Time-Stamp Authority (TSA) Integration

## Overview

Implements RFC 3161 Time-Stamp Protocol (TSP) for cryptographic proof of existence at a specific time. TSA tokens provide legally defensible timestamps that cannot be backdated or manipulated.

## RFC 3161 Protocol

### Time-Stamp Request (TSR)

```typescript
import { createHash, randomBytes } from 'crypto';
import { request as httpsRequest } from 'https';

interface TimeStampRequest {
  messageImprint: {
    hashAlgorithm: 'SHA-256' | 'SHA-384' | 'SHA-512';
    hashedMessage: Buffer;
  };
  reqPolicy?: string;           // OID of TSA policy
  nonce?: Buffer;               // Random nonce for replay protection
  certReq?: boolean;            // Request TSA certificate in response
}

export class RFC3161Client {
  private readonly tsaUrl: string;
  private readonly timeout: number = 30000;

  constructor(tsaUrl: string) {
    // Validate TSA URL
    if (!tsaUrl.startsWith('https://')) {
      throw new Error('TSA URL must use HTTPS');
    }
    this.tsaUrl = tsaUrl;
  }

  /**
   * Create RFC 3161 Time-Stamp Request
   */
  createTimeStampRequest(data: Buffer, options?: {
    hashAlgorithm?: 'SHA-256' | 'SHA-384' | 'SHA-512';
    policy?: string;
    includeCert?: boolean;
  }): Buffer {
    const hashAlgorithm = options?.hashAlgorithm || 'SHA-256';
    const hash = this.hashData(data, hashAlgorithm);
    const nonce = randomBytes(8);

    // Build ASN.1 DER-encoded TimeStampReq
    const tsReq = this.buildTimeStampReq({
      messageImprint: {
        hashAlgorithm,
        hashedMessage: hash
      },
      reqPolicy: options?.policy,
      nonce,
      certReq: options?.includeCert !== false
    });

    return tsReq;
  }

  /**
   * Hash data using specified algorithm
   */
  private hashData(data: Buffer, algorithm: string): Buffer {
    const hashAlg = algorithm.toLowerCase().replace('-', '');
    return createHash(hashAlg).update(data).digest();
  }

  /**
   * Build ASN.1 DER-encoded TimeStampReq
   */
  private buildTimeStampReq(request: TimeStampRequest): Buffer {
    // Use asn1.js or similar library for proper ASN.1 encoding
    // This is a simplified representation
    const { AsnSerializer } = require('@peculiar/asn1-schema');
    
    // Build TimeStampReq structure per RFC 3161
    const tsReq = {
      version: 1,
      messageImprint: {
        hashAlgorithm: this.getHashAlgorithmOID(request.messageImprint.hashAlgorithm),
        hashedMessage: request.messageImprint.hashedMessage
      },
      reqPolicy: request.reqPolicy,
      nonce: request.nonce,
      certReq: request.certReq || false
    };

    // Serialize to DER
    return Buffer.from(AsnSerializer.serialize(tsReq));
  }

  /**
   * Get OID for hash algorithm
   */
  private getHashAlgorithmOID(algorithm: string): string {
    const oids: Record<string, string> = {
      'SHA-256': '2.16.840.1.101.3.4.2.1',
      'SHA-384': '2.16.840.1.101.3.4.2.2',
      'SHA-512': '2.16.840.1.101.3.4.2.3'
    };
    return oids[algorithm] || oids['SHA-256'];
  }
}
```

### Time-Stamp Response (TSP)

```typescript
interface TimeStampResponse {
  status: {
    status: 'granted' | 'grantedWithMods' | 'rejection' | 'waiting' | 'revocationWarning' | 'revocationNotification';
    statusString?: string;
    failInfo?: string;
  };
  timeStampToken?: Buffer;      // DER-encoded SignedData
}

export class TimeStampResponseParser {
  /**
   * Parse RFC 3161 Time-Stamp Response
   */
  parseTimeStampResponse(responseData: Buffer): TimeStampResponse {
    const { AsnParser } = require('@peculiar/asn1-schema');
    
    // Parse DER-encoded response
    // Note: TimeStampResp, SignedData, and TSTInfo would be defined in ASN.1 schema
    // This is a simplified representation for documentation
    const tsResp = AsnParser.parse(responseData, 'TimeStampResp');

    // Check status
    if (tsResp.status.status !== 0) {  // 0 = granted
      throw new Error(`TSA request failed: ${tsResp.status.statusString || 'Unknown error'}`);
    }

    return {
      status: {
        status: this.mapStatus(tsResp.status.status),
        statusString: tsResp.status.statusString,
        failInfo: tsResp.status.failInfo
      },
      timeStampToken: tsResp.timeStampToken ? Buffer.from(tsResp.timeStampToken) : undefined
    };
  }

  /**
   * Map numeric status to string
   */
  private mapStatus(status: number): TimeStampResponse['status']['status'] {
    const statusMap: Record<number, TimeStampResponse['status']['status']> = {
      0: 'granted',
      1: 'grantedWithMods',
      2: 'rejection',
      3: 'waiting',
      4: 'revocationWarning',
      5: 'revocationNotification'
    };
    return statusMap[status] || 'rejection';
  }

  /**
   * Extract timestamp from token
   */
  extractTimestamp(token: Buffer): Date {
    const { AsnParser } = require('@peculiar/asn1-schema');
    
    // Parse SignedData
    const signedData = AsnParser.parse(token, 'SignedData');
    
    // Extract TSTInfo from encapContentInfo
    const tstInfo = AsnParser.parse(signedData.encapContentInfo.eContent, 'TSTInfo');
    
    // Return genTime
    return new Date(tstInfo.genTime);
  }

  /**
   * Verify timestamp token signature
   */
  async verifyToken(token: Buffer, trustedCerts: Buffer[]): Promise<boolean> {
    const crypto = await import('crypto');
    const { X509Certificate } = crypto;

    // Parse token
    const { AsnParser } = require('@peculiar/asn1-schema');
    const signedData = AsnParser.parse(token, 'SignedData');

    // Extract signer certificate
    const signerCert = signedData.certificates[0];
    const cert = new X509Certificate(Buffer.from(signerCert));

    // Verify certificate chain
    for (const trustedCert of trustedCerts) {
      const trusted = new X509Certificate(trustedCert);
      if (cert.verify(trusted.publicKey)) {
        // Verify signature on TSTInfo
        const signature = Buffer.from(signedData.signerInfos[0].signature);
        const data = Buffer.from(signedData.encapContentInfo.eContent);
        
        const verify = crypto.createVerify('SHA256');
        verify.update(data);
        return verify.verify(cert.publicKey, signature);
      }
    }

    return false;
  }
}
```

## TSA Client Implementation

```typescript
import { EventEmitter } from 'events';

export class TSAClient extends EventEmitter {
  private readonly rfc3161Client: RFC3161Client;
  private readonly parser: TimeStampResponseParser;
  private readonly maxRetries: number = 3;
  private readonly retryDelay: number = 1000;

  constructor(tsaUrl: string) {
    super();
    this.rfc3161Client = new RFC3161Client(tsaUrl);
    this.parser = new TimeStampResponseParser();
  }

  /**
   * Request timestamp for data
   */
  async timestamp(data: Buffer, options?: {
    hashAlgorithm?: 'SHA-256' | 'SHA-384' | 'SHA-512';
    policy?: string;
  }): Promise<TimeStampResult> {
    // Create request
    const request = this.rfc3161Client.createTimeStampRequest(data, {
      hashAlgorithm: options?.hashAlgorithm,
      policy: options?.policy,
      includeCert: true
    });

    // Send request with retries
    let lastError: Error | undefined;
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.sendRequest(request);
        const parsed = this.parser.parseTimeStampResponse(response);

        if (parsed.status.status !== 'granted') {
          throw new Error(`TSA request not granted: ${parsed.status.statusString}`);
        }

        if (!parsed.timeStampToken) {
          throw new Error('No timestamp token in response');
        }

        // Extract timestamp
        const timestamp = this.parser.extractTimestamp(parsed.timeStampToken);

        this.emit('timestamp_success', {
          timestamp,
          attempt,
          tokenSize: parsed.timeStampToken.length
        });

        return {
          token: parsed.timeStampToken,
          timestamp,
          hashAlgorithm: options?.hashAlgorithm || 'SHA-256'
        };

      } catch (error) {
        lastError = error as Error;
        this.emit('timestamp_error', { attempt, error });

        if (attempt < this.maxRetries) {
          await this.sleep(this.retryDelay * attempt);
        }
      }
    }

    throw new Error(`TSA request failed after ${this.maxRetries} attempts: ${lastError?.message}`);
  }

  /**
   * Send HTTP request to TSA
   */
  private async sendRequest(request: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const url = new URL(this.rfc3161Client['tsaUrl']);
      
      const options = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/timestamp-query',
          'Content-Length': request.length
        },
        timeout: this.rfc3161Client['timeout']
      };

      const req = httpsRequest(options, (res) => {
        const chunks: Buffer[] = [];

        res.on('data', (chunk) => chunks.push(chunk));
        
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`TSA returned status ${res.statusCode}`));
            return;
          }

          const response = Buffer.concat(chunks);
          resolve(response);
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('TSA request timeout'));
      });

      req.write(request);
      req.end();
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

interface TimeStampResult {
  token: Buffer;                // DER-encoded timestamp token
  timestamp: Date;              // Extracted timestamp
  hashAlgorithm: string;
}
```

## Evidence Timestamping Service

```typescript
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

export class EvidenceTimestampService {
  private readonly tsaClient: TSAClient;
  private readonly s3: S3Client;
  private readonly bucketName: string;

  constructor(tsaUrl: string, bucketName: string) {
    this.tsaClient = new TSAClient(tsaUrl);
    this.s3 = new S3Client({});
    this.bucketName = bucketName;
  }

  /**
   * Timestamp evidence record and store token
   */
  async timestampEvidence(
    tenantId: string,
    assetId: string,
    evidenceId: string,
    data: Buffer
  ): Promise<TimestampResult> {
    // Validate inputs
    if (!this.isValidId(tenantId) || !this.isValidId(assetId) || !this.isValidId(evidenceId)) {
      throw new Error('Invalid ID format');
    }

    // Request timestamp
    const result = await this.tsaClient.timestamp(data, {
      hashAlgorithm: 'SHA-256'
    });

    // Store token in S3
    const key = `tsa/${tenantId}/${assetId}/${evidenceId}.tsr`;
    
    await this.s3.send(new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: result.token,
      ContentType: 'application/timestamp-reply',
      Metadata: {
        'tenant-id': tenantId,
        'asset-id': assetId,
        'evidence-id': evidenceId,
        'timestamp': result.timestamp.toISOString(),
        'hash-algorithm': result.hashAlgorithm
      },
      ObjectLockMode: 'COMPLIANCE',
      ObjectLockRetainUntilDate: this.calculateRetentionDate()
    }));

    return {
      tokenKey: key,
      timestamp: result.timestamp,
      tokenSize: result.token.length
    };
  }

  /**
   * Timestamp manifest
   */
  async timestampManifest(
    tenantId: string,
    manifestHash: string,
    manifestData: Buffer
  ): Promise<TimestampResult> {
    // Validate inputs
    if (!this.isValidId(tenantId) || !/^[a-f0-9]{64}$/i.test(manifestHash)) {
      throw new Error('Invalid input format');
    }

    // Request timestamp
    const result = await this.tsaClient.timestamp(manifestData, {
      hashAlgorithm: 'SHA-256'
    });

    // Store token
    const key = `tsa/manifests/${tenantId}/${manifestHash}.tsr`;
    
    await this.s3.send(new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: result.token,
      ContentType: 'application/timestamp-reply',
      Metadata: {
        'tenant-id': tenantId,
        'manifest-hash': manifestHash,
        'timestamp': result.timestamp.toISOString(),
        'hash-algorithm': result.hashAlgorithm
      },
      ObjectLockMode: 'COMPLIANCE',
      ObjectLockRetainUntilDate: this.calculateRetentionDate()
    }));

    return {
      tokenKey: key,
      timestamp: result.timestamp,
      tokenSize: result.token.length
    };
  }

  /**
   * Batch timestamp multiple items
   */
  async batchTimestamp(items: TimestampItem[]): Promise<BatchTimestampResult> {
    const results: TimestampResult[] = [];
    const errors: Array<{ item: TimestampItem; error: Error }> = [];

    // Process in parallel with concurrency limit
    const concurrency = 5;
    for (let i = 0; i < items.length; i += concurrency) {
      const batch = items.slice(i, i + concurrency);
      
      const batchResults = await Promise.allSettled(
        batch.map(item => this.timestampItem(item))
      );

      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          errors.push({
            item: batch[j],
            error: result.reason
          });
        }
      }
    }

    return {
      successful: results.length,
      failed: errors.length,
      results,
      errors
    };
  }

  private async timestampItem(item: TimestampItem): Promise<TimestampResult> {
    switch (item.type) {
      case 'evidence':
        return await this.timestampEvidence(
          item.tenantId,
          item.assetId!,
          item.evidenceId!,
          item.data
        );
      case 'manifest':
        return await this.timestampManifest(
          item.tenantId,
          item.manifestHash!,
          item.data
        );
      default:
        throw new Error(`Unknown timestamp type: ${item.type}`);
    }
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

interface TimestampItem {
  type: 'evidence' | 'manifest';
  tenantId: string;
  assetId?: string;
  evidenceId?: string;
  manifestHash?: string;
  data: Buffer;
}

interface TimestampResult {
  tokenKey: string;
  timestamp: Date;
  tokenSize: number;
}

interface BatchTimestampResult {
  successful: number;
  failed: number;
  results: TimestampResult[];
  errors: Array<{ item: TimestampItem; error: Error }>;
}
```

## TSA Token Verification

```typescript
export class TSATokenVerifier {
  private readonly parser: TimeStampResponseParser;
  private readonly trustedCerts: Buffer[];

  constructor(trustedCertsPath: string) {
    this.parser = new TimeStampResponseParser();
    this.trustedCerts = this.loadTrustedCerts(trustedCertsPath);
  }

  /**
   * Verify TSA token
   */
  async verifyToken(token: Buffer, originalData: Buffer): Promise<VerificationResult> {
    try {
      // Verify signature
      const signatureValid = await this.parser.verifyToken(token, this.trustedCerts);
      if (!signatureValid) {
        return {
          valid: false,
          reason: 'Invalid signature'
        };
      }

      // Extract and verify hash
      const { AsnParser } = require('@peculiar/asn1-schema');
      const signedData = AsnParser.parse(token, SignedData);
      const tstInfo = AsnParser.parse(signedData.encapContentInfo.eContent, TSTInfo);

      // Compute hash of original data
      const hashAlg = this.getHashAlgorithm(tstInfo.messageImprint.hashAlgorithm);
      const computedHash = createHash(hashAlg).update(originalData).digest();

      // Compare hashes
      const tokenHash = Buffer.from(tstInfo.messageImprint.hashedMessage);
      if (!computedHash.equals(tokenHash)) {
        return {
          valid: false,
          reason: 'Hash mismatch'
        };
      }

      // Extract timestamp
      const timestamp = this.parser.extractTimestamp(token);

      return {
        valid: true,
        timestamp,
        hashAlgorithm: hashAlg
      };

    } catch (error) {
      return {
        valid: false,
        reason: `Verification error: ${(error as Error).message}`
      };
    }
  }

  /**
   * Verify token from S3
   */
  async verifyTokenFromS3(
    tokenKey: string,
    originalData: Buffer
  ): Promise<VerificationResult> {
    // Fetch token from S3
    const token = await this.fetchTokenFromS3(tokenKey);
    
    // Verify
    return await this.verifyToken(token, originalData);
  }

  private async fetchTokenFromS3(key: string): Promise<Buffer> {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const s3 = new S3Client({});
    
    const result = await s3.send(new GetObjectCommand({
      Bucket: process.env.EVIDENCE_BUCKET!,
      Key: key
    }));

    const chunks: Buffer[] = [];
    for await (const chunk of result.Body as any) {
      chunks.push(chunk);
    }
    
    return Buffer.concat(chunks);
  }

  private loadTrustedCerts(path: string): Buffer[] {
    const fs = require('fs');
    const certData = fs.readFileSync(path, 'utf8');
    
    // Split PEM certificates
    const certs = certData.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g);
    
    return certs ? certs.map((cert: string) => Buffer.from(cert)) : [];
  }

  private getHashAlgorithm(oid: string): string {
    const algorithms: Record<string, string> = {
      '2.16.840.1.101.3.4.2.1': 'sha256',
      '2.16.840.1.101.3.4.2.2': 'sha384',
      '2.16.840.1.101.3.4.2.3': 'sha512'
    };
    return algorithms[oid] || 'sha256';
  }
}

interface VerificationResult {
  valid: boolean;
  timestamp?: Date;
  hashAlgorithm?: string;
  reason?: string;
}
```

## Nightly TSA Gap Closer

```typescript
export class TSAGapCloser {
  private readonly timestampService: EvidenceTimestampService;
  private readonly s3: S3Client;
  private readonly bucketName: string;

  /**
   * Find and timestamp evidence records missing TSA tokens
   */
  async closeGaps(): Promise<GapClosureReport> {
    const report: GapClosureReport = {
      scanned: 0,
      missing: 0,
      timestamped: 0,
      failed: 0,
      errors: []
    };

    // Scan evidence records
    let continuationToken: string | undefined;
    
    do {
      const listResult = await this.s3.send(new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: 'evidence/',
        ContinuationToken: continuationToken,
        MaxKeys: 1000
      }));

      for (const object of listResult.Contents || []) {
        report.scanned++;

        // Check if TSA token exists
        const evidenceKey = object.Key!;
        const tsaKey = this.getTsaKeyForEvidence(evidenceKey);
        
        const hasToken = await this.objectExists(tsaKey);
        
        if (!hasToken) {
          report.missing++;
          
          try {
            // Fetch evidence data
            const evidenceData = await this.fetchObject(evidenceKey);
            
            // Extract IDs from key
            const { tenantId, assetId, evidenceId } = this.parseEvidenceKey(evidenceKey);
            
            // Timestamp
            await this.timestampService.timestampEvidence(
              tenantId,
              assetId,
              evidenceId,
              evidenceData
            );
            
            report.timestamped++;
          } catch (error) {
            report.failed++;
            report.errors.push({
              key: evidenceKey,
              error: (error as Error).message
            });
          }
        }
      }

      continuationToken = listResult.NextContinuationToken;
    } while (continuationToken);

    return report;
  }

  private getTsaKeyForEvidence(evidenceKey: string): string {
    // evidence/{tenant}/{asset}/{evidence_id}.json
    // -> tsa/{tenant}/{asset}/{evidence_id}.tsr
    return evidenceKey.replace('evidence/', 'tsa/').replace('.json', '.tsr');
  }

  private async objectExists(key: string): Promise<boolean> {
    try {
      await this.s3.send(new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key
      }));
      return true;
    } catch {
      return false;
    }
  }

  private async fetchObject(key: string): Promise<Buffer> {
    const result = await this.s3.send(new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key
    }));

    const chunks: Buffer[] = [];
    for await (const chunk of result.Body as any) {
      chunks.push(chunk);
    }
    
    return Buffer.concat(chunks);
  }

  private parseEvidenceKey(key: string): { tenantId: string; assetId: string; evidenceId: string } {
    // evidence/{tenant}/{asset}/{evidence_id}.json
    const parts = key.split('/');
    return {
      tenantId: parts[1],
      assetId: parts[2],
      evidenceId: parts[3].replace('.json', '')
    };
  }
}

interface GapClosureReport {
  scanned: number;
  missing: number;
  timestamped: number;
  failed: number;
  errors: Array<{ key: string; error: string }>;
}
```

## Monitoring & Metrics

```typescript
import { CloudWatch } from '@aws-sdk/client-cloudwatch';

export class TSAMetrics {
  private readonly cloudwatch: CloudWatch;
  private readonly namespace = 'EvidenceVault/TSA';

  async recordTimestampRequest(success: boolean, latencyMs: number): Promise<void> {
    await this.cloudwatch.putMetricData({
      Namespace: this.namespace,
      MetricData: [
        {
          MetricName: 'TimestampRequests',
          Value: 1,
          Unit: 'Count',
          Dimensions: [
            { Name: 'Status', Value: success ? 'Success' : 'Failure' }
          ]
        },
        {
          MetricName: 'TimestampLatency',
          Value: latencyMs,
          Unit: 'Milliseconds'
        }
      ]
    });
  }

  async recordGapClosure(report: GapClosureReport): Promise<void> {
    await this.cloudwatch.putMetricData({
      Namespace: this.namespace,
      MetricData: [
        {
          MetricName: 'GapsFound',
          Value: report.missing,
          Unit: 'Count'
        },
        {
          MetricName: 'GapsClosed',
          Value: report.timestamped,
          Unit: 'Count'
        },
        {
          MetricName: 'GapClosureFailures',
          Value: report.failed,
          Unit: 'Count'
        }
      ]
    });
  }
}
```

## References

- **RFC 3161:** Time-Stamp Protocol (TSP) - https://www.rfc-editor.org/rfc/rfc3161
- **RFC 5652:** Cryptographic Message Syntax (CMS) - https://www.rfc-editor.org/rfc/rfc5652
- **ASN.1:** Abstract Syntax Notation One
- **DER:** Distinguished Encoding Rules
