/**
 * Rotate Keys - Automated key rotation script
 * Can be run as a cron job for scheduled rotations
 */

import { CustodyService } from '../custody/custody-service.js';
import { createLogger } from '../src/utils/logger.js';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const logger = createLogger('KeyRotation');
const { Pool } = pg;

async function rotateKeys() {
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true',
    max: 10,
    connectionTimeoutMillis: 5000,
    queryTimeout: 30000,
  });

  const custodyService = new CustodyService();

  try {
    logger.info('Starting key rotation check');

    // Find keys that need rotation
    const query = `
      SELECT tenant_id, key_id, rotation_days, created_at
      FROM custody_keys
      WHERE active = true
        AND created_at < NOW() - INTERVAL '1 day' * rotation_days
      ORDER BY created_at ASC
    `;

    const result = await pool.query(query);

    if (result.rows.length === 0) {
      logger.info('No keys require rotation');
      return;
    }

    logger.info(`Found ${result.rows.length} keys requiring rotation`);

    for (const row of result.rows) {
      try {
        logger.info('Rotating key', {
          tenantId: row.tenant_id,
          keyId: row.key_id,
          age: Math.floor(
            (Date.now() - new Date(row.created_at).getTime()) / (1000 * 60 * 60 * 24)
          ),
          rotationDays: row.rotation_days,
        });

        const rotationResult = await custodyService.rotateKey(
          row.tenant_id,
          row.key_id,
          'quarterly'
        );

        logger.info('Key rotated successfully', {
          tenantId: row.tenant_id,
          oldKeyId: rotationResult.oldKeyId,
          newKeyId: rotationResult.newKeyId,
          evidencePackId: rotationResult.evidencePackId,
        });
      } catch (error) {
        logger.error('Failed to rotate key', {
          tenantId: row.tenant_id,
          keyId: row.key_id,
          error: error.message,
        });
      }
    }

    logger.info('Key rotation check complete');
  } catch (error) {
    logger.error('Key rotation script failed', { error: error.message, stack: error.stack });
    process.exit(1);
  } finally {
    await pool.end();
  }
}

rotateKeys();
