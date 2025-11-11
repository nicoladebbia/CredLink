import dotenv from 'dotenv';
import { APIGateway } from './server';
import { logger } from './utils/logger';

// Load environment variables
dotenv.config();

/**
 * Start API Gateway
 */
async function main() {
  try {
    const port = parseInt(process.env.PORT || '3000', 10);
    const gateway = new APIGateway();

    await gateway.start(port);

    logger.info('CredLink API Gateway is running', {
      port,
      environment: process.env.NODE_ENV || 'development'
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received, shutting down gracefully');
      await gateway.stop();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      logger.info('SIGINT received, shutting down gracefully');
      await gateway.stop();
      process.exit(0);
    });
  } catch (error) {
    logger.error('Failed to start API Gateway', { error });
    process.exit(1);
  }
}

main();
