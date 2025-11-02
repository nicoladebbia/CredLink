/**
 * Timing Attack Protection Utilities
 * Constant-time operations to prevent timing side-channel attacks
 */

import { constantTimeEqual } from './crypto';

/**
 * Constant-time string comparison for sensitive data
 * Prevents timing attacks on password/token comparisons
 */
export function secureCompare(a: string, b: string): boolean {
  return constantTimeEqual(a, b);
}

/**
 * Constant-time buffer comparison
 */
export function secureBufferEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) {
    return false;
  }
  
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  
  return result === 0;
}

/**
 * Add random delay to prevent timing attacks
 * Use sparingly as it impacts performance
 */
export function addRandomDelay(minMs: number = 50, maxMs: number = 150): Promise<void> {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Constant-time array comparison
 */
export function secureArrayEqual<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    // Convert to strings for comparison
    const aStr = String(a[i]);
    const bStr = String(b[i]);
    result |= secureCompare(aStr, bStr) ? 0 : 1;
  }
  
  return result === 0;
}

/**
 * Constant-time object comparison (shallow)
 */
export function secureObjectEqual(a: Record<string, any>, b: Record<string, any>): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  
  if (!secureArrayEqual(aKeys, bKeys)) {
    return false;
  }
  
  let result = 0;
  for (const key of aKeys) {
    const aVal = String(a[key]);
    const bVal = String(b[key]);
    result |= secureCompare(aVal, bVal) ? 0 : 1;
  }
  
  return result === 0;
}

/**
 * Constant-time number comparison
 */
export function secureNumberEqual(a: number, b: number): boolean {
  // Convert to strings and use secure compare
  return secureCompare(a.toString(), b.toString());
}

/**
 * Secure password verification with timing protection
 */
export async function securePasswordVerify(
  providedPassword: string,
  storedHash: string,
  hashFunction: (password: string) => Promise<string>
): Promise<boolean> {
  // Always compute hash to prevent timing attacks
  const providedHash = await hashFunction(providedPassword);
  
  // Add small random delay to further obscure timing
  await addRandomDelay(10, 50);
  
  return secureCompare(providedHash, storedHash);
}

/**
 * Secure token verification with timing protection
 */
export function secureTokenVerify(providedToken: string, expectedToken: string): boolean {
  return secureCompare(providedToken, expectedToken);
}

/**
 * Secure API key verification with timing protection
 */
export function secureApiKeyVerify(providedKey: string, expectedKey: string): boolean {
  return secureCompare(providedKey, expectedKey);
}

/**
 * Secure session ID verification with timing protection
 */
export function secureSessionVerify(providedSession: string, expectedSession: string): boolean {
  return secureCompare(providedSession, expectedSession);
}

/**
 * Secure permission check with timing protection
 */
export function securePermissionCheck(
  userPermissions: string[],
  requiredPermission: string
): boolean {
  // Always check all permissions to prevent timing attacks
  let hasPermission = false;
  
  for (const permission of userPermissions) {
    if (secureCompare(permission, requiredPermission)) {
      hasPermission = true;
    }
  }
  
  return hasPermission;
}

/**
 * Secure role check with timing protection
 */
export function secureRoleCheck(userRole: string, requiredRole: string): boolean {
  return secureCompare(userRole, requiredRole);
}

/**
 * Secure array membership check with timing protection
 */
export function secureArrayIncludes<T>(array: T[], item: T): boolean {
  let found = false;
  
  for (const arrayItem of array) {
    if (secureCompare(String(arrayItem), String(item))) {
      found = true;
    }
  }
  
  return found;
}

/**
 * Secure object property check with timing protection
 */
export function secureObjectHasProperty(
  obj: Record<string, any>,
  property: string
): boolean {
  const properties = Object.keys(obj);
  return secureArrayIncludes(properties, property);
}

/**
 * Create a timing-safe comparison function for specific use cases
 */
export function createTimingSafeComparator<T>(
  transform: (item: T) => string = (item) => String(item)
) {
  return (a: T, b: T): boolean => {
    return secureCompare(transform(a), transform(b));
  };
}

/**
 * Timing-safe email comparison (case-insensitive)
 */
export const secureEmailCompare = createTimingSafeComparator(
  (email) => email.toLowerCase().trim()
);

/**
 * Timing-safe username comparison
 */
export const secureUsernameCompare = createTimingSafeComparator(
  (username) => username.toLowerCase().trim()
);

/**
 * Timing-safe URL comparison
 */
export const secureUrlCompare = createTimingSafeComparator(
  (url) => url.toLowerCase().trim()
);

/**
 * Timing-safe domain comparison
 */
export const secureDomainCompare = createTimingSafeComparator(
  (domain) => domain.toLowerCase().trim()
);
