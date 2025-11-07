/**
 * Phase 59 - Pivots Up-Stack (Keys & Analytics)
 * Main entry point
 */

import { APIServer } from './api-server.js';
import { createLogger } from './utils/logger.js';
import dotenv from 'dotenv';

dotenv.config();

const logger = createLogger('Main');

async function main() {
  try {
    logger.info('Starting Phase 59 - Pivots Up-Stack');

    // Validate environment
    const required = [
      'DB_HOST',
      'DB_PORT',
      'DB_NAME',
      'DB_USER',
      'DB_PASSWORD',
      'AWS_REGION',
      'JWT_SECRET',
    ];
    const missing = required.filter((key) => !process.env[key]);
    if (missing.length > 0) {
      logger.error('Missing required environment variables', { count: missing.length });
      throw new Error('Configuration incomplete');
    }

    // Validate JWT_SECRET strength
    if (process.env.JWT_SECRET.length < 32) {
      logger.error('JWT_SECRET too short', { length: process.env.JWT_SECRET.length });
      throw new Error('Invalid configuration');
    }

    const server = new APIServer();
    await server.start();

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received, shutting down gracefully');
      await server.stop();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      logger.info('SIGINT received, shutting down gracefully');
      await server.stop();
      process.exit(0);
    });
  } catch (error) {
    logger.error('Failed to start application', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

main();
