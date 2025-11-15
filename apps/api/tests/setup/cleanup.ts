/**
 * Global test cleanup utility
 * Week 7 Day 1: Prevent test hangs by ensuring all resources are released
 * 
 * Usage:
 *   beforeEach(() => {
 *     const service = new MyService();
 *     TestCleanup.register(() => service.cleanup());
 *   });
 * 
 * This ensures all resources are released after each test.
 */

export class TestCleanup {
  private static cleanupFns: Array<() => Promise<void>> = [];
  private static isCleaningUp = false;

  /**
   * Register a cleanup function to be called after each test
   */
  static register(fn: () => Promise<void>): void {
    this.cleanupFns.push(fn);
  }

  /**
   * Execute all registered cleanup functions
   */
  static async cleanup(): Promise<void> {
    if (this.isCleaningUp) {
      console.warn('Cleanup already in progress, skipping duplicate cleanup');
      return;
    }

    this.isCleaningUp = true;
    
    try {
      // Run all cleanup functions in parallel for speed
      await Promise.allSettled(
        this.cleanupFns.map(async (fn) => {
          try {
            await fn();
          } catch (error) {
            console.error('Cleanup function failed:', error);
          }
        })
      );
    } finally {
      this.cleanupFns = [];
      this.isCleaningUp = false;
    }
  }

  /**
   * Clear all registered cleanup functions without executing them
   * Use only in case of catastrophic failure
   */
  static reset(): void {
    this.cleanupFns = [];
    this.isCleaningUp = false;
  }
}
