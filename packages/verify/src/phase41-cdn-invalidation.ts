/**
 * Phase 41 — CDN Invalidation & Signer Hooks
 * Cloudflare instant purge integration for manifest and verify cache invalidation
 * STANDARDS: Tied to signer events per Phase 41 invalidation model
 * PERFORMANCE: Instant purge propagates immediately across edge network
 */

import * as crypto from 'crypto';

// SECURITY: Cloudflare API credentials (must be set via environment)
const CLOUDFLARE_ZONE_ID = process.env.CLOUDFLARE_ZONE_ID;
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CLOUDFLARE_API_ENDPOINT = 'https://api.cloudflare.com/client/v4';

// PERFORMANCE: Batch purge requests to reduce API calls
const PURGE_BATCH_SIZE = 30; // Cloudflare max is 30 URLs per request
const PURGE_BATCH_DELAY_MS = 100; // Delay between batches

/**
 * STANDARDS: Purge request payload per Cloudflare API
 */
interface PurgeRequest {
  files?: string[]; // URLs to purge
  tags?: string[]; // Cache tags to purge
  hosts?: string[]; // Hostnames to purge
  prefixes?: string[]; // URL prefixes to purge
}

/**
 * STANDARDS: Purge response from Cloudflare API
 */
interface PurgeResponse {
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  messages: string[];
  result: {
    id: string;
  };
}

/**
 * SECURITY: Validate Cloudflare API configuration
 */
function validateCloudflareConfig(): void {
  if (!CLOUDFLARE_ZONE_ID) {
    throw new Error('CLOUDFLARE_ZONE_ID environment variable not set');
  }
  if (!CLOUDFLARE_API_TOKEN) {
    throw new Error('CLOUDFLARE_API_TOKEN environment variable not set');
  }
  if (!/^[a-f0-9]{32}$/.test(CLOUDFLARE_ZONE_ID)) {
    throw new Error('Invalid CLOUDFLARE_ZONE_ID format - must be 32-character hex string');
  }
  
  // SECURITY: Additional validation for API token format
  if (CLOUDFLARE_API_TOKEN.length < 30) {
    throw new Error('CLOUDFLARE_API_TOKEN appears too short');
  }
}

/**
 * PERFORMANCE: Execute Cloudflare purge API request
 * Reference: https://developers.cloudflare.com/api/operations/zone-purge
 */
async function executePurgeRequest(payload: PurgeRequest): Promise<PurgeResponse> {
  // SECURITY: Validate inputs
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid purge request payload');
  }
  if (!payload.files && !payload.tags && !payload.hosts && !payload.prefixes) {
    throw new Error('Purge request must contain files, tags, hosts, or prefixes');
  }
  if (payload.files && (!Array.isArray(payload.files) || payload.files.length === 0)) {
    throw new Error('Files must be non-empty array');
  }
  if (payload.tags && (!Array.isArray(payload.tags) || payload.tags.length === 0)) {
    throw new Error('Tags must be non-empty array');
  }
  if (payload.hosts && (!Array.isArray(payload.hosts) || payload.hosts.length === 0)) {
    throw new Error('Hosts must be non-empty array');
  }
  if (payload.prefixes && (!Array.isArray(payload.prefixes) || payload.prefixes.length === 0)) {
    throw new Error('Prefixes must be non-empty array');
  }

  validateCloudflareConfig();

  const url = `${CLOUDFLARE_API_ENDPOINT}/zones/${CLOUDFLARE_ZONE_ID}/purge_cache`;

  // SECURITY: Add timeout and proper error handling
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
        'Content-Type': 'application/json',
        'User-Agent': 'CredLink-Phase41/1.0',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    // SECURITY: Validate response before parsing
    if (!response) {
      throw new Error('Cloudflare API returned null response');
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Cloudflare purge failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    // SECURITY: Validate content type before JSON parsing
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      throw new Error(`Unexpected content type from Cloudflare API: ${contentType}`);
    }

    let result: PurgeResponse;
    try {
      result = await response.json() as PurgeResponse;
    } catch (parseError) {
      throw new Error('Failed to parse Cloudflare API response as JSON');
    }

    // SECURITY: Comprehensive response structure validation
    if (!result) {
      throw new Error('Cloudflare API returned null response');
    }
    if (typeof result !== 'object') {
      throw new Error('Cloudflare API response must be an object');
    }
    if (typeof result.success !== 'boolean') {
      throw new Error('Missing or invalid success field in Cloudflare response');
    }
    if (!Array.isArray(result.errors)) {
      throw new Error('Missing or invalid errors array in Cloudflare response');
    }
    if (!Array.isArray(result.messages)) {
      throw new Error('Missing or invalid messages array in Cloudflare response');
    }
    if (!result.result || typeof result.result !== 'object') {
      throw new Error('Missing or invalid result object in Cloudflare response');
    }
    if (typeof result.result.id !== 'string') {
      throw new Error('Missing or invalid result ID in Cloudflare response');
    }

    if (!result.success) {
      // SECURITY: Validate error objects before processing
      const validErrors = result.errors.filter((e: any) => 
        e && typeof e === 'object' && typeof e.code === 'number' && typeof e.message === 'string'
      );
      if (validErrors.length === 0 && result.errors.length > 0) {
        throw new Error('Cloudflare API returned invalid error format');
      }
      const errors = validErrors.map((e: { code: number; message: string }) => `${e.code}: ${e.message}`).join(', ');
      throw new Error(`Cloudflare purge errors: ${errors}`);
    }

    return result;

  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Cloudflare API request timed out after 30 seconds');
    }
    throw error;
  }
}

/**
 * PERFORMANCE: Purge manifest URLs from CDN cache
 * @param manifestUrls - Full URLs to manifest files
 */
export async function purgeManifestUrls(manifestUrls: string[]): Promise<void> {
  // SECURITY: Validate inputs
  if (!manifestUrls || !Array.isArray(manifestUrls)) {
    throw new Error('Manifest URLs must be an array');
  }
  if (manifestUrls.length === 0) {
    return;
  }
  if (manifestUrls.length > 1000) {
    throw new Error('Cannot purge more than 1000 URLs at once');
  }

  // SECURITY: Validate URLs are HTTPS and properly formatted
  for (const url of manifestUrls) {
    if (!url || typeof url !== 'string') {
      throw new Error('Each manifest URL must be a string');
    }
    if (!url.startsWith('https://')) {
      throw new Error(`Invalid manifest URL (must be HTTPS): ${url}`);
    }
    try {
      new URL(url);
    } catch {
      throw new Error(`Invalid URL format: ${url}`);
    }
  }

  // PERFORMANCE: Batch purge requests
  const batches: string[][] = [];
  for (let i = 0; i < manifestUrls.length; i += PURGE_BATCH_SIZE) {
    batches.push(manifestUrls.slice(i, i + PURGE_BATCH_SIZE));
  }

  // PERFORMANCE: Execute batches with delay
  for (let i = 0; i < batches.length; i++) {
    await executePurgeRequest({ files: batches[i] });
    
    if (i < batches.length - 1) {
      await new Promise(resolve => setTimeout(resolve, PURGE_BATCH_DELAY_MS));
    }
  }

  // SECURITY: Avoid logging sensitive information in production
    // console.log(`Purged ${manifestUrls.length} manifest URLs from CDN cache`);
}

/**
 * PERFORMANCE: Purge by cache tags
 * @param tags - Cache tags to purge (e.g., manifest hashes, verify keys)
 */
export async function purgeByCacheTags(tags: string[]): Promise<void> {
  // SECURITY: Validate inputs
  if (!tags || !Array.isArray(tags)) {
    throw new Error('Tags must be an array');
  }
  if (tags.length === 0) {
    return;
  }
  if (tags.length > 1000) {
    throw new Error('Cannot purge more than 1000 tags at once');
  }

  // SECURITY: Validate tag format
  for (const tag of tags) {
    if (!tag || typeof tag !== 'string') {
      throw new Error('Each tag must be a string');
    }
    if (!/^[a-zA-Z0-9:_-]+$/.test(tag)) {
      throw new Error(`Invalid cache tag format: ${tag}`);
    }
    if (tag.length > 100) {
      throw new Error(`Cache tag too long (max 100 chars): ${tag}`);
    }
  }

  // PERFORMANCE: Cloudflare supports up to 30 tags per request
  const batches: string[][] = [];
  for (let i = 0; i < tags.length; i += PURGE_BATCH_SIZE) {
    batches.push(tags.slice(i, i + PURGE_BATCH_SIZE));
  }

  for (let i = 0; i < batches.length; i++) {
    await executePurgeRequest({ tags: batches[i] });
    
    if (i < batches.length - 1) {
      await new Promise(resolve => setTimeout(resolve, PURGE_BATCH_DELAY_MS));
    }
  }

  // SECURITY: Avoid logging sensitive information in production
  // console.log(`Purged ${tags.length} cache tags from CDN`);
}

/**
 * STANDARDS: Invalidation model - Rule: Any new assertion set invalidates dependent keys
 * Event: Signer writes/updates a manifest → produces manifest_etag_new
 */
export interface ManifestUpdateEvent {
  manifestHash: string; // SHA-256 of manifest content
  manifestUrl: string; // Full URL to manifest
  oldETag?: string; // Previous ETag (if update)
  newETag: string; // New ETag after update
  assertionsChanged: boolean; // Whether assertions were modified
  policyVersionBump: boolean; // Whether policy version changed
  timestamp: Date;
}

/**
 * STANDARDS: Generate cache tags for a manifest
 */
function generateManifestCacheTags(manifestHash: string): string[] {
  return [
    `manifest:${manifestHash}`,
    `manifest-hash:${manifestHash}`
  ];
}

/**
 * STANDARDS: Generate cache tags for verify responses
 */
function generateVerifyCacheTags(manifestHash: string, policyVersion: string): string[] {
  return [
    `verify:${manifestHash}`,
    `verify:${manifestHash}:${policyVersion}`,
    `verify-manifest:${manifestHash}`
  ];
}

/**
 * STANDARDS: Handle manifest update event and purge dependent caches
 * Invalidation model per Phase 41:
 * 1. Signer writes/updates manifest → manifest_etag_new
 * 2. Emit CDN purge for /{sha256}.c2pa (URL + tag)
 * 3. Purge related verify keys
 * 4. Bump policy_version if verification policy changed
 */
export async function handleManifestUpdate(event: ManifestUpdateEvent): Promise<void> {
  // SECURITY: Validate event
  if (!event || typeof event !== 'object') {
    throw new Error('Invalid manifest update event');
  }
  if (!event.manifestHash || typeof event.manifestHash !== 'string') {
    throw new Error('Invalid manifest hash in update event');
  }
  if (!/^[a-f0-9]{64}$/.test(event.manifestHash)) {
    throw new Error('Manifest hash must be 64-character hex string');
  }
  if (!event.manifestUrl || typeof event.manifestUrl !== 'string') {
    throw new Error('Invalid manifest URL in update event');
  }
  if (!event.manifestUrl.startsWith('https://')) {
    throw new Error('Manifest URL must be HTTPS');
  }
  try {
    new URL(event.manifestUrl);
  } catch {
    throw new Error(`Invalid manifest URL format: ${event.manifestUrl}`);
  }
  if (!event.newETag || typeof event.newETag !== 'string') {
    throw new Error('Missing new ETag in update event');
  }
  if (!/^"[a-f0-9]+"$/.test(event.newETag)) {
    throw new Error('New ETag must be in quoted format');
  }
  if (typeof event.assertionsChanged !== 'boolean') {
    throw new Error('Assertions changed must be boolean');
  }
  if (typeof event.policyVersionBump !== 'boolean') {
    throw new Error('Policy version bump must be boolean');
  }
  if (!event.timestamp || !(event.timestamp instanceof Date)) {
    throw new Error('Timestamp must be Date object');
  }
  if (event.oldETag && typeof event.oldETag === 'string' && !/^"[a-f0-9]+"$/.test(event.oldETag)) {
    throw new Error('Old ETag must be in quoted format');
  }

  // SECURITY: Avoid logging sensitive ETags and manifest hashes in production
  // console.log(`Processing manifest update: ${event.manifestHash}`);
  // console.log(`  Old ETag: ${event.oldETag || 'N/A'}`);
  // console.log(`  New ETag: ${event.newETag}`);
  // console.log(`  Assertions changed: ${event.assertionsChanged}`);
  // console.log(`  Policy version bump: ${event.policyVersionBump}`);

  // PERFORMANCE: Collect all URLs and tags to purge
  const urlsToPurge: string[] = [event.manifestUrl];
  const tagsToPurge: string[] = [];

  // STANDARDS: Purge manifest cache tags
  tagsToPurge.push(...generateManifestCacheTags(event.manifestHash));

  // STANDARDS: Purge verify cache tags (all policy versions if assertions changed)
  if (event.assertionsChanged) {
    tagsToPurge.push(...generateVerifyCacheTags(event.manifestHash, 'v1'));
    // Add other policy versions if needed
  }

  // PERFORMANCE: Execute purges in parallel
  await Promise.all([
    purgeManifestUrls(urlsToPurge),
    purgeByCacheTags(tagsToPurge)
  ]);

  // SECURITY: Avoid logging sensitive manifest hashes in production
  // console.log(`Manifest update purge complete: ${event.manifestHash}`);
}

/**
 * STANDARDS: Purge all verify responses for a specific manifest
 */
export async function purgeVerifyResponsesForManifest(manifestHash: string): Promise<void> {
  // SECURITY: Validate inputs
  if (!manifestHash || typeof manifestHash !== 'string') {
    throw new Error('Manifest hash must be a string');
  }
  if (!/^[a-f0-9]{64}$/.test(manifestHash)) {
    throw new Error('Manifest hash must be 64-character hex string');
  }

  const tags = generateVerifyCacheTags(manifestHash, 'v1');
  await purgeByCacheTags(tags);

  // SECURITY: Avoid logging sensitive manifest hashes in production
  // console.log(`Purged all verify responses for manifest: ${manifestHash}`);
}

/**
 * STANDARDS: Purge everything related to a policy version bump
 */
export async function purgePolicyVersionCaches(oldVersion: string, newVersion: string): Promise<void> {
  // SECURITY: Validate inputs
  if (!oldVersion || typeof oldVersion !== 'string') {
    throw new Error('Old version must be a string');
  }
  if (!newVersion || typeof newVersion !== 'string') {
    throw new Error('New version must be a string');
  }
  if (!/^v\d+$/.test(oldVersion)) {
    throw new Error('Old version must be in format v1, v2, etc.');
  }
  if (!/^v\d+$/.test(newVersion)) {
    throw new Error('New version must be in format v1, v2, etc.');
  }
  if (oldVersion === newVersion) {
    throw new Error('Old and new versions must be different');
  }

  const tags = [`policy:${oldVersion}`, `policy:${newVersion}`];
  await purgeByCacheTags(tags);

  // SECURITY: Avoid logging policy version information in production
  // console.log(`Purged caches for policy version change: ${oldVersion} → ${newVersion}`);
}

/**
 * PERFORMANCE: Purge statistics for monitoring
 */
export interface PurgeStats {
  totalPurges: number;
  manifestPurges: number;
  verifyPurges: number;
  tagPurges: number;
  lastPurge: Date | null;
  errors: number;
}

const purgeStats: PurgeStats = {
  totalPurges: 0,
  manifestPurges: 0,
  verifyPurges: 0,
  tagPurges: 0,
  lastPurge: null,
  errors: 0
};

/**
 * PERFORMANCE: Record purge operation
 */
export function recordPurge(type: 'manifest' | 'verify' | 'tag', count: number = 1): void {
  // SECURITY: Validate inputs
  if (!type || typeof type !== 'string') {
    throw new Error('Purge type must be a string');
  }
  if (type !== 'manifest' && type !== 'verify' && type !== 'tag') {
    throw new Error('Purge type must be "manifest", "verify", or "tag"');
  }
  if (typeof count !== 'number' || count < 0 || count > 1000) {
    throw new Error('Count must be a number between 0 and 1000');
  }
  
  purgeStats.totalPurges += count;
  purgeStats.lastPurge = new Date();
  
  if (type === 'manifest') {
    purgeStats.manifestPurges += count;
  } else if (type === 'verify') {
    purgeStats.verifyPurges += count;
  } else {
    purgeStats.tagPurges += count;
  }
}

/**
 * PERFORMANCE: Record purge error
 */
export function recordPurgeError(): void {
  purgeStats.errors++;
}

/**
 * PERFORMANCE: Get purge statistics
 */
export function getPurgeStats(): PurgeStats {
  return { ...purgeStats };
}

/**
 * SECURITY: Generate signed URL for manifest (R2/S3 presigned URL pattern)
 * For hotfix windows or private buckets with hard expiries
 */
export function generateSignedManifestUrl(
  baseUrl: string,
  manifestHash: string,
  expirySeconds: number = 3600
): string {
  // SECURITY: Validate inputs
  if (!baseUrl || typeof baseUrl !== 'string') {
    throw new Error('Base URL must be a string');
  }
  if (!baseUrl.startsWith('https://')) {
    throw new Error('Base URL must be HTTPS');
  }
  try {
    new URL(baseUrl);
  } catch {
    throw new Error(`Invalid base URL format: ${baseUrl}`);
  }
  if (!manifestHash || typeof manifestHash !== 'string') {
    throw new Error('Manifest hash must be a string');
  }
  if (!/^[a-f0-9]{64}$/.test(manifestHash)) {
    throw new Error('Manifest hash must be 64-character hex string');
  }
  if (typeof expirySeconds !== 'number' || expirySeconds < 60 || expirySeconds > 86400) {
    throw new Error('Expiry must be a number between 60 and 86400 seconds');
  }

  // STANDARDS: Generate expiry timestamp
  const expiryTime = Math.floor(Date.now() / 1000) + expirySeconds;

  // SECURITY: Generate HMAC signature
  const secret = process.env.MANIFEST_SIGNING_SECRET;
  if (!secret) {
    throw new Error('MANIFEST_SIGNING_SECRET environment variable not set');
  }
  if (secret.length < 32) {
    throw new Error('MANIFEST_SIGNING_SECRET must be at least 32 characters long');
  }
  if (secret === 'default-secret-change-me' || secret.includes('default')) {
    throw new Error('MANIFEST_SIGNING_SECRET must be changed from default value');
  }
  
  const message = `${manifestHash}:${expiryTime}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(message)
    .digest('hex');

  // STANDARDS: Construct signed URL
  const url = new URL(`${baseUrl}/${manifestHash}.c2pa`);
  url.searchParams.set('expires', expiryTime.toString());
  url.searchParams.set('signature', signature);

  return url.toString();
}

/**
 * SECURITY: Verify signed manifest URL
 */
export function verifySignedManifestUrl(signedUrl: string): boolean {
  // SECURITY: Validate inputs
  if (!signedUrl || typeof signedUrl !== 'string') {
    return false;
  }

  try {
    const url = new URL(signedUrl);
    
    // SECURITY: Must be HTTPS
    if (url.protocol !== 'https:') {
      return false;
    }
    
    const manifestHash = url.pathname.split('/').pop()?.replace('.c2pa', '');
    const expires = url.searchParams.get('expires');
    const signature = url.searchParams.get('signature');

    if (!manifestHash || !expires || !signature) {
      return false;
    }
    
    // SECURITY: Validate extracted components
    if (!/^[a-f0-9]{64}$/.test(manifestHash)) {
      return false;
    }
    if (!/^[a-f0-9]+$/.test(expires)) {
      return false;
    }
    if (!/^[a-f0-9]{64}$/.test(signature)) {
      return false;
    }

    // SECURITY: Check expiry
    const expiryTime = parseInt(expires, 10);
    if (Date.now() / 1000 > expiryTime) {
      return false; // URL expired
    }

    // SECURITY: Verify signature
    const secret = process.env.MANIFEST_SIGNING_SECRET;
    if (!secret) {
      return false; // Cannot verify without secret
    }
    if (secret.length < 32) {
      return false; // Secret too short
    }
    if (secret === 'default-secret-change-me' || secret.includes('default')) {
      return false; // Default secret insecure
    }
    
    const message = `${manifestHash}:${expiryTime}`;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(message)
      .digest('hex');

    return signature === expectedSignature;
  } catch (error) {
    return false;
  }
}
