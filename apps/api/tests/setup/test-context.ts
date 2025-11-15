/**
 * Test context for service isolation
 * Week 7 Day 1: Ensure each test has isolated services
 * 
 * Prevents tests from sharing state and resources, which can cause hangs
 * and flaky tests.
 * 
 * Usage:
 *   let context: TestContext;
 *   
 *   beforeEach(() => {
 *     context = new TestContext();
 *   });
 *   
 *   afterEach(async () => {
 *     await context.cleanup();
 *   });
 *   
 *   it('test', () => {
 *     const service = new MyService();
 *     context.registerService('myService', service);
 *   });
 */

interface CleanupableService {
  cleanup?: () => Promise<void> | void;
  close?: () => Promise<void> | void;
  destroy?: () => Promise<void> | void;
}

export class TestContext {
  private services: Map<string, CleanupableService> = new Map();
  private cleanupCallbacks: Array<() => Promise<void>> = [];

  /**
   * Register a service instance for cleanup
   */
  registerService<T extends CleanupableService>(name: string, instance: T): T {
    if (this.services.has(name)) {
      console.warn(`Service '${name}' already registered, replacing`);
    }
    this.services.set(name, instance);
    return instance;
  }

  /**
   * Get a registered service by name
   */
  getService<T extends CleanupableService>(name: string): T | undefined {
    return this.services.get(name) as T | undefined;
  }

  /**
   * Register a custom cleanup callback
   */
  onCleanup(callback: () => Promise<void>): void {
    this.cleanupCallbacks.push(callback);
  }

  /**
   * Check if a service is registered
   */
  hasService(name: string): boolean {
    return this.services.has(name);
  }

  /**
   * Cleanup all registered services
   */
  async cleanup(): Promise<void> {
    // Run custom cleanup callbacks first
    for (const callback of this.cleanupCallbacks) {
      try {
        await callback();
      } catch (error) {
        console.error('Custom cleanup callback failed:', error);
      }
    }

    // Cleanup all registered services
    const cleanupPromises: Promise<void>[] = [];

    for (const [name, service] of this.services.entries()) {
      const cleanupFn = async () => {
        try {
          // Try cleanup() method
          if (service.cleanup) {
            await service.cleanup();
            return;
          }

          // Try close() method
          if (service.close) {
            await service.close();
            return;
          }

          // Try destroy() method
          if (service.destroy) {
            await service.destroy();
            return;
          }

          // No cleanup method found, that's OK
        } catch (error) {
          console.error(`Failed to cleanup service '${name}':`, error);
        }
      };

      cleanupPromises.push(cleanupFn());
    }

    // Wait for all cleanup operations to complete
    await Promise.allSettled(cleanupPromises);

    // Clear all services and callbacks
    this.services.clear();
    this.cleanupCallbacks = [];
  }

  /**
   * Get count of registered services (for debugging)
   */
  getServiceCount(): number {
    return this.services.size;
  }

  /**
   * Get list of registered service names (for debugging)
   */
  getServiceNames(): string[] {
    return Array.from(this.services.keys());
  }
}
