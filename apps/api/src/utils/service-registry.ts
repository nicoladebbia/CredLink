/**
 * Service Registry for Graceful Shutdown
 * 
 * Moved from index.ts to break circular import dependency
 */

import { logger } from './logger';

const activeServices: Array<{ name: string; close: () => Promise<void> | void }> = [];

/**
 * Register a service for graceful shutdown
 */
export function registerService(name: string, service: { close: () => Promise<void> | void }) {
  activeServices.push({ name, close: service.close.bind(service) });
  logger.debug(`Service registered for cleanup: ${name}`);
}

/**
 * Cleanup all active services
 */
export async function cleanupServices() {
  logger.info(`Cleaning up ${activeServices.length} active services...`);
  
  for (const service of activeServices) {
    try {
      logger.info(`Cleaning up service: ${service.name}`);
      await service.close();
    } catch (error) {
      logger.error(`Error cleaning up service ${service.name}:`, error);
    }
  }
  
  logger.info('All services cleaned up successfully');
}
