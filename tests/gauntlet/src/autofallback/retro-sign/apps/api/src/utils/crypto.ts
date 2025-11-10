/**
 * Cryptographic Utilities
 * Secure random generation and cryptographic operations
 */

import { randomBytes, createHash, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const randomBytesAsync = promisify(randomBytes);

/**
 * Generate cryptographically secure random string
 */
export async function generateSecureRandomString(length: number = 32): Promise<string> {
  const bytes = await randomBytesAsync(Math.ceil(length / 2));
  return bytes.toString('hex').substring(0, length);
}

/**
 * Generate cryptographically secure random ID
 */
export async function generateSecureId(prefix: string = '', length: number = 16): Promise<string> {
  const randomPart = await generateSecureRandomString(length);
  return prefix ? `${prefix}_${randomPart}` : randomPart;
}

/**
 * Generate secure JWT ID (jti)
 */
export async function generateJwtId(): Promise<string> {
  return await generateSecureId('jti', 16);
}

/**
 * Generate secure request ID
 */
export async function generateRequestId(): Promise<string> {
  return await generateSecureId('req', 12);
}

/**
 * Generate secure audit event ID
 */
export async function generateAuditEventId(): Promise<string> {
  return await generateSecureId('audit', 16);
}

/**
 * Generate secure security event ID
 */
export async function generateSecurityEventId(): Promise<string> {
  return await generateSecureId('sec', 16);
}

/**
 * Generate secure session ID
 */
export async function generateSessionId(): Promise<string> {
  return await generateSecureId('sess', 24);
}

/**
 * Generate secure API key
 */
export async function generateApiKey(): Promise<string> {
  return await generateSecureId('key', 32);
}

/**
 * Generate secure development secret
 */
export async function generateDevelopmentSecret(): Promise<string> {
  return `dev_${await generateSecureRandomString(48)}`;
}

/**
 * Generate secure nonce for CSP
 */
export async function generateCspNonce(): Promise<string> {
  const bytes = await randomBytesAsync(16);
  return bytes.toString('base64');
}

/**
 * Hash data with SHA-256
 */
export function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  
  const aBuffer = Buffer.from(a, 'utf8');
  const bBuffer = Buffer.from(b, 'utf8');
  
  return timingSafeEqual(aBuffer, bBuffer);
}

/**
 * Generate secure token for password reset
 */
export async function generatePasswordResetToken(): Promise<string> {
  return await generateSecureId('reset', 32);
}

/**
 * Generate secure email verification token
 */
export async function generateEmailVerificationToken(): Promise<string> {
  return await generateSecureId('verify', 32);
}

/**
 * Generate secure timestamp-based ID (still cryptographically random)
 */
export async function generateSecureTimestampId(prefix: string = ''): Promise<string> {
  const timestamp = Date.now().toString(36);
  const randomPart = await generateSecureRandomString(8);
  return prefix ? `${prefix}_${timestamp}_${randomPart}` : `${timestamp}_${randomPart}`;
}

/**
 * Generate secure edge ID for trust graph
 */
export async function generateSecureEdgeId(fromNode: string, toNode: string): Promise<string> {
  const timestamp = Date.now().toString(36);
  const hash = sha256(`${fromNode}:${toNode}:${timestamp}`).substring(0, 8);
  return `edge_${timestamp}_${hash}`;
}

/**
 * Validate if a string is properly formatted as a secure ID
 */
export function isValidSecureId(id: string, prefix: string = ''): boolean {
  const pattern = prefix ? 
    new RegExp(`^${prefix}_[a-f0-9]{8,}$`) : 
    /^[a-f0-9]{8,}$/;
  return pattern.test(id);
}

/**
 * Generate secure fingerprint for user agent
 */
export function generateUserAgentFingerprint(userAgent: string): string {
  return sha256(userAgent).substring(0, 16);
}

/**
 * Generate secure fingerprint for IP address
 */
export function generateIpFingerprint(ip: string): string {
  return sha256(ip).substring(0, 16);
}
