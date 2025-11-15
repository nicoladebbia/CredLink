/**
 * Timeout wrapper utility
 * Week 7 Day 1: Prevent operations from hanging indefinitely
 * 
 * Wraps any promise with a timeout that will reject if the operation
 * takes longer than the specified duration.
 * 
 * Usage:
 *   const result = await withTimeout(
 *     longRunningOperation(),
 *     5000,
 *     'Operation timed out after 5s'
 *   );
 */

export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  errorMessage?: string
): Promise<T> {
  let timeoutId: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(errorMessage || `Operation timed out after ${ms}ms`));
    }, ms);
  });

  return Promise.race([
    promise.then((result) => {
      clearTimeout(timeoutId);
      return result;
    }).catch((error) => {
      clearTimeout(timeoutId);
      throw error;
    }),
    timeoutPromise
  ]);
}

/**
 * Create a timeout-wrapped version of an async function
 * 
 * Usage:
 *   const safeOperation = withTimeoutFn(operation, 5000);
 *   const result = await safeOperation(args);
 */
export function withTimeoutFn<TArgs extends any[], TReturn>(
  fn: (...args: TArgs) => Promise<TReturn>,
  ms: number,
  errorMessage?: string
): (...args: TArgs) => Promise<TReturn> {
  return (...args: TArgs) => {
    return withTimeout(fn(...args), ms, errorMessage);
  };
}

/**
 * Sleep for a specified duration (for testing/delays)
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
