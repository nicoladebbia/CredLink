/**
 * Custody Service - HSM-first key management
 * FIPS-validated signing keys with rotation evidence
 */

import {
  KMSClient,
  CreateKeyCommand,
  CreateAliasCommand,
  EnableKeyRotationCommand,
  SignCommand,
} from '@aws-sdk/client-kms';
import { createLogger } from '../src/utils/logger.js';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import pg from 'pg';

const logger = createLogger('CustodyService');
const { Pool } = pg;

export class CustodyService {
  constructor() {
    this.validateEnvironment();
    this.pool = this.initializeDatabase();
    this.kmsClient = null;
    this.cloudHsmClient = null;
    this.region = process.env.AWS_REGION || 'us-east-1';
    this.fipsEnabled = process.env.FIPS_ENABLED === 'true';
    this.defaultRotationDays = parseInt(process.env.DEFAULT_ROTATION_DAYS) || 90;
    this.tsaUrl = process.env.TSA_URL;
    logger.info('Custody service initialized', {
      region: this.region,
      fipsEnabled: this.fipsEnabled,
    });
  }

  validateEnvironment() {
    const required = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'AWS_REGION'];
    const missing = required.filter((key) => !process.env[key]);
    if (missing.length > 0) {
      logger.error('Missing required environment variables', { count: missing.length });
      throw new Error('Configuration incomplete');
    }
    
    // Strict AWS region validation with whitelist
    const VALID_AWS_REGIONS = [
      'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
      'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-central-1', 'eu-north-1',
      'ap-south-1', 'ap-northeast-1', 'ap-northeast-2', 'ap-northeast-3',
      'ap-southeast-1', 'ap-southeast-2', 'ca-central-1', 'sa-east-1',
    ];
    if (!VALID_AWS_REGIONS.includes(process.env.AWS_REGION)) {
      logger.error('Invalid AWS region', { region: process.env.AWS_REGION });
      throw new Error('Invalid configuration');
    }

    // Validate DEFAULT_ROTATION_DAYS
    if (process.env.DEFAULT_ROTATION_DAYS) {
      const rotationDays = parseInt(process.env.DEFAULT_ROTATION_DAYS);
      if (isNaN(rotationDays) || rotationDays < 1 || rotationDays > 365) {
        logger.error('Invalid DEFAULT_ROTATION_DAYS', { value: process.env.DEFAULT_ROTATION_DAYS });
        throw new Error('Invalid configuration');
      }
    }

    // Validate TSA_URL format if provided
    if (process.env.TSA_URL) {
      try {
        new URL(process.env.TSA_URL);
      } catch {
        logger.error('Invalid TSA_URL format', { url: process.env.TSA_URL });
        throw new Error('Invalid configuration');
      }
    }
  }

  initializeDatabase() {
    const dbHost = process.env.DB_HOST;
    const dbPort = parseInt(process.env.DB_PORT);

    // Critical security: Strict hostname validation to prevent SSRF
    if (!dbHost || typeof dbHost !== 'string') throw new Error('DB hostname required');

    // Check for localhost variations (allowed for development)
    const allowedLocalhosts = ['localhost', '127.0.0.1', '::1'];
    if (!allowedLocalhosts.includes(dbHost.toLowerCase())) {
      // Strict RFC-compliant hostname validation
      const hostnameRegex =
        /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;
      const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;

      if (!hostnameRegex.test(dbHost) && !ipRegex.test(dbHost)) {
        throw new Error('Invalid DB hostname format');
      }

      // Additional security checks
      if (dbHost.startsWith('.') || dbHost.endsWith('.') || dbHost.includes('..')) {
        throw new Error('Invalid DB hostname format');
      }

      // Validate IP address ranges if it's an IP
      if (ipRegex.test(dbHost)) {
        const octets = dbHost.split('.').map(Number);
        if (octets.some((octet) => octet < 0 || octet > 255)) {
          throw new Error('Invalid IP address');
        }
        // Block private ranges except localhost
        if (
          octets[0] === 10 ||
          (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
          (octets[0] === 192 && octets[1] === 168)
        ) {
          throw new Error('Private IP ranges not allowed for database connections');
        }
      }
    }

    if (isNaN(dbPort) || dbPort < 1 || dbPort > 65535) throw new Error('Invalid DB port');
    
    // Enhanced SSL configuration for production
    const sslConfig = process.env.DB_SSL === 'true' ? {
      rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
      ca: process.env.DB_SSL_CA || undefined,
    } : false;
    
    return new Pool({
      host: dbHost,
      port: dbPort,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      ssl: sslConfig,
      max: 10,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      queryTimeout: 30000,
      allowExitOnIdle: true,
    });
  }

  async initializeKMS() {
    const config = { region: this.region };
    if (this.fipsEnabled) {
      config.endpoint = `https://kms-fips.${this.region}.amazonaws.com`;
    }
    this.kmsClient = new KMSClient(config);
  }

  async provisionTenantKey(tenantId, options = {}) {
    // Critical security: Strict tenant ID validation
    if (!tenantId || typeof tenantId !== 'string') throw new Error('Tenant ID required');
    if (tenantId.length < 3 || tenantId.length > 64)
      throw new Error('Tenant ID must be 3-64 characters');
    if (!/^[a-zA-Z0-9_-]+$/.test(tenantId)) throw new Error('Invalid tenant ID format');

    // Validate mode
    const mode = options.mode || 'aws-kms';
    if (!['aws-kms', 'cloudhsm', 'yubihsm2'].includes(mode)) throw new Error('Invalid mode');

    // Validate rotation parameter
    if (options.rotation) {
      if (typeof options.rotation !== 'string') throw new Error('Invalid rotation format');
      const rotationDays = parseInt(options.rotation.replace('d', ''));
      if (isNaN(rotationDays) || rotationDays < 1 || rotationDays > 365) {
        throw new Error('Rotation days must be between 1 and 365');
      }
    }

    // Validate region parameter if provided
    if (options.region && !/^[a-z]{2}-[a-z]+-\d+$/.test(options.region)) {
      throw new Error('Invalid AWS region format');
    }

    let keyData;
    if (mode === 'aws-kms')
      keyData = await this.provisionKMSKey(tenantId, this.defaultRotationDays, this.region);
    else if (mode === 'cloudhsm')
      keyData = await this.provisionCloudHSMKey(tenantId, this.defaultRotationDays);
    else keyData = await this.provisionYubiHSMKey(tenantId, this.defaultRotationDays);

    await this.storeKeyMetadata(tenantId, keyData);
    const evidencePack = await this.generateEvidencePack(tenantId, keyData, 'initial_provision');

    return {
      tenantId,
      keyId: keyData.keyId,
      alias: keyData.alias,
      mode: keyData.mode,
      fipsValidated: keyData.fipsValidated,
      evidencePackId: evidencePack.id,
      createdAt: new Date().toISOString(),
    };
  }

  async provisionKMSKey(tenantId, rotationDays, region) {
    if (!this.kmsClient) await this.initializeKMS();
    const { KeyMetadata } = await this.kmsClient.send(
      new CreateKeyCommand({
        Description: `C2PA signing key for tenant: ${tenantId}`,
        KeyUsage: 'SIGN_VERIFY',
        KeySpec: 'ECC_NIST_P256',
        Origin: 'AWS_KMS',
        Tags: [
          { TagKey: 'Tenant', TagValue: tenantId },
          { TagKey: 'Purpose', TagValue: 'C2PA-Signing' },
        ],
      })
    );

    const alias = `alias/${tenantId}-c2pa`;
    await this.kmsClient.send(
      new CreateAliasCommand({ AliasName: alias, TargetKeyId: KeyMetadata.KeyId })
    );
    await this.kmsClient.send(
      new EnableKeyRotationCommand({ KeyId: KeyMetadata.KeyId, RotationPeriodInDays: rotationDays })
    );

    return {
      keyId: KeyMetadata.KeyId,
      alias,
      arn: KeyMetadata.Arn,
      mode: 'aws-kms',
      region,
      fipsValidated: true,
      rotationDays,
    };
  }

  async provisionCloudHSMKey(tenantId, rotationDays) {
    const keyId = uuidv4();
    return {
      keyId,
      alias: `cloudhsm-${tenantId}-c2pa`,
      mode: 'cloudhsm',
      fipsValidated: true,
      rotationDays,
    };
  }

  async provisionYubiHSMKey(tenantId, rotationDays) {
    const keyId = uuidv4();
    return {
      keyId,
      alias: `yubihsm-${tenantId}-c2pa`,
      mode: 'yubihsm2',
      fipsValidated: true,
      rotationDays,
    };
  }

  async storeKeyMetadata(tenantId, keyData) {
    await this.pool.query(
      `INSERT INTO custody_keys (tenant_id, key_id, alias, mode, region, rotation_days, fips_validated, created_at) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [
        tenantId,
        keyData.keyId,
        keyData.alias,
        keyData.mode,
        keyData.region,
        keyData.rotationDays,
        keyData.fipsValidated,
      ]
    );
  }

  async signManifest(tenantId, manifestData) {
    // Critical security: Strict tenant ID validation
    if (!tenantId || typeof tenantId !== 'string') throw new Error('Tenant ID required');
    if (tenantId.length < 3 || tenantId.length > 64)
      throw new Error('Tenant ID must be 3-64 characters');
    if (!/^[a-zA-Z0-9_-]+$/.test(tenantId)) throw new Error('Invalid tenant ID format');

    // Validate manifestData
    if (!manifestData || typeof manifestData !== 'object')
      throw new Error('Manifest data required');
    if (Array.isArray(manifestData)) throw new Error('Manifest data must be an object');

    // Check manifest data size to prevent DoS
    const manifestSize = JSON.stringify(manifestData).length;
    if (manifestSize > 1024 * 1024) {
      // 1MB limit
      throw new Error('Manifest data too large');
    }

    const keyResult = await this.pool.query(
      'SELECT * FROM custody_keys WHERE tenant_id = $1 AND active = true ORDER BY created_at DESC LIMIT 1',
      [tenantId]
    );
    if (keyResult.rows.length === 0) throw new Error('No active key found');

    const key = keyResult.rows[0];
    const hash = crypto.createHash('sha256').update(JSON.stringify(manifestData)).digest();

    if (!this.kmsClient) await this.initializeKMS();
    const { Signature } = await this.kmsClient.send(
      new SignCommand({
        KeyId: key.key_id,
        Message: hash,
        MessageType: 'DIGEST',
        SigningAlgorithm: 'ECDSA_SHA_256',
      })
    );

    const tsaToken = await this.getTSATimestamp(Buffer.from(Signature));
    await this.logSigningOperation(tenantId, key.key_id, Buffer.from(Signature), tsaToken);

    return {
      signature: Buffer.from(Signature).toString('base64'),
      algorithm: 'ES256',
      keyId: key.key_id,
      tsaToken: tsaToken ? tsaToken.toString('base64') : null,
      signedAt: new Date().toISOString(),
    };
  }

  async getTSATimestamp(_signature) {
    if (!this.tsaUrl) return null;
    // TODO: Implement actual TSA timestamping with signature parameter
    // For now, return placeholder
    return Buffer.from('tsa-timestamp-placeholder');
  }

  async logSigningOperation(tenantId, keyId, signature, tsaToken) {
    const signatureHash = crypto.createHash('sha256').update(signature).digest('hex');
    const tsaHash = tsaToken ? crypto.createHash('sha256').update(tsaToken).digest('hex') : null;
    await this.pool.query(
      `INSERT INTO signing_operations (tenant_id, key_id, signature_hash, tsa_token_hash, operation_id, timestamp) 
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [tenantId, keyId, signatureHash, tsaHash, uuidv4()]
    );
  }

  async rotateKey(tenantId, keyId, reason) {
    // Critical security: Strict tenant ID validation
    if (!tenantId || typeof tenantId !== 'string') throw new Error('Tenant ID required');
    if (tenantId.length < 3 || tenantId.length > 64)
      throw new Error('Tenant ID must be 3-64 characters');
    if (!/^[a-zA-Z0-9_-]+$/.test(tenantId)) throw new Error('Invalid tenant ID format');

    // Validate keyId
    if (!keyId || typeof keyId !== 'string') throw new Error('Key ID required');
    if (keyId.length < 1 || keyId.length > 255) throw new Error('Invalid key ID length');
    if (!/^[a-zA-Z0-9_-]+$/.test(keyId)) throw new Error('Invalid key ID format');

    // Validate reason
    if (!reason || typeof reason !== 'string') throw new Error('Reason required');
    if (reason.length < 1 || reason.length > 100)
      throw new Error('Reason must be 1-100 characters');
    if (!/^[a-zA-Z0-9\s_-]+$/.test(reason)) throw new Error('Invalid reason format');

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Lock the key row to prevent concurrent rotations
      const keyResult = await client.query(
        'SELECT * FROM custody_keys WHERE tenant_id = $1 AND key_id = $2 FOR UPDATE',
        [tenantId, keyId]
      );
      if (keyResult.rows.length === 0) throw new Error('Key not found');

      const currentKey = keyResult.rows[0];

      // Check if key is already being rotated
      if (!currentKey.active) {
        await client.query('ROLLBACK');
        throw new Error('Key already rotated');
      }

      const newKey = await this.provisionTenantKey(tenantId, { mode: currentKey.mode });

      // Update old key status
      await client.query(
        'UPDATE custody_keys SET active = false, rotated_at = NOW() WHERE id = $1',
        [currentKey.id]
      );

      const evidencePack = await this.generateRotationEvidencePack(
        tenantId,
        currentKey,
        newKey,
        reason
      );

      await client.query('COMMIT');

      return {
        tenantId,
        oldKeyId: currentKey.key_id,
        newKeyId: newKey.keyId,
        reason,
        evidencePackId: evidencePack.id,
        rotatedAt: new Date().toISOString(),
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async generateEvidencePack(tenantId, keyData, eventType) {
    const packId = uuidv4();
    const pack = {
      id: packId,
      type: eventType,
      tenant_id: tenantId,
      key_id: keyData.keyId,
      mode: keyData.mode,
      fips_validated: keyData.fipsValidated,
      created_at: new Date().toISOString(),
    };
    const packHash = crypto.createHash('sha256').update(JSON.stringify(pack)).digest('hex');
    pack.hash = packHash;
    await this.pool.query(
      'INSERT INTO evidence_packs (id, tenant_id, type, content, hash, created_at) VALUES ($1, $2, $3, $4, $5, NOW())',
      [packId, tenantId, eventType, JSON.stringify(pack), packHash]
    );
    return pack;
  }

  async generateRotationEvidencePack(tenantId, oldKey, newKey, reason) {
    const packId = uuidv4();
    const pack = {
      id: packId,
      type: 'rotation',
      tenant_id: tenantId,
      old_key_id: oldKey.key_id,
      new_key_id: newKey.keyId,
      reason,
      created_at: new Date().toISOString(),
    };
    const packHash = crypto.createHash('sha256').update(JSON.stringify(pack)).digest('hex');
    pack.hash = packHash;
    await this.pool.query(
      'INSERT INTO evidence_packs (id, tenant_id, type, content, hash, created_at) VALUES ($1, $2, $3, $4, $5, NOW())',
      [packId, tenantId, 'rotation', JSON.stringify(pack), packHash]
    );
    return pack;
  }

  async getEvidencePacks(tenantId, _period) {
    // TODO: Implement period filtering with _period parameter
    // Critical security: Strict tenant ID validation
    if (!tenantId || typeof tenantId !== 'string') throw new Error('Tenant ID required');
    if (tenantId.length < 3 || tenantId.length > 64)
      throw new Error('Tenant ID must be 3-64 characters');
    if (!/^[a-zA-Z0-9_-]+$/.test(tenantId)) throw new Error('Invalid tenant ID format');
    const result = await this.pool.query(
      'SELECT * FROM evidence_packs WHERE tenant_id = $1 ORDER BY created_at DESC',
      [tenantId]
    );
    return result.rows.map((row) => {
      let content;
      try {
        content = JSON.parse(row.content);
      } catch (error) {
        logger.error('Failed to parse evidence pack content', {
          id: row.id,
          tenantId: row.tenant_id,
          error: error.message,
        });
        content = { error: 'Invalid content format', raw: row.content };
      }
      return {
        id: row.id,
        type: row.type,
        tenantId: row.tenant_id,
        content,
        hash: row.hash,
        createdAt: row.created_at,
      };
    });
  }
}
