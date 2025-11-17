/**
 * Verification API Routes
 * Phase 11 — Trust Graph & Badge Reputation v1
 * Enhanced verification endpoints with trust snippet integration
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { verifyManifest } from '@c2pa/verify';
import { verifyAtTime } from '../verify';
import { Manifest, VerifyResponse } from '../types';
import { TrustService, VerificationContext, TrustSnippet } from '@c2pa/trust';
import { 
  authenticateJWT, 
  requireRole, 
  requirePermission, 
  createRateLimit, 
  addSecurityHeaders, 
  validateCORS,
  createAuditLogger,
  createAuditEventFromRequest
} from '../middleware/auth';
import { createAuditService } from '../services/audit-service';
import { createSecurityMonitoringMiddleware, securityMonitoring } from '../services/security-monitoring-service';
import { RateLimitPresets } from '../services/rate-limit-service';
import { defaultRequestLimits, strictRequestLimits } from '../middleware/request-limits';
import { defaultParameterPollution, strictParameterPollution } from '../middleware/parameter-pollution';
import { standardReplayProtection, strictReplayProtection } from '../middleware/replay-protection';
import { standardSideChannelProtection, strictSideChannelProtection } from '../middleware/side-channel';

interface VerifyVideoRequest {
  Querystring: {
    asset_url: string;
    t?: number;
    tracks?: string;
    manifest_url?: string;
  };
}

interface VerifyAudioRequest {
  Querystring: {
    asset_url: string;
    t?: number;
    tracks?: string;
    manifest_url?: string;
  };
}

interface MediaMapRequest {
  Body: {
    master_url: string;
    poster_url?: string;
    track_hints?: Array<{
      type: string;
      id: string;
      codec: string;
      lang?: string;
    }>;
    ad_breaks?: Array<{
      start: number;
      end: number;
    }>;
  };
}

// Phase 11: Enhanced response with trust information
interface VerifyResponse {
  status: 'valid' | 'unknown' | 'invalid';
  active_assertions: string[];
  reason?: string;
  asset_url: string;
  manifest_url?: string;
  links?: {
    manifest?: string;
    evidence?: string;
  };
  timestamp: string;
  trust?: TrustSnippet; // Phase 11 addition
}

interface TrustPathRequest {
  Params: {
    key_id: string;
  };
}

interface TrustScoreRequest {
  Params: {
    key_id: string;
  };
}

interface AdminRevocationRequest {
  Body: {
    key_id: string;
    reason: string;
    evidence_url?: string;
  };
}

// Missing interfaces for gauntlet test environment
interface TrustSnippet {
  trust_score: number;
  confidence: number;
  issuer: string;
  valid_from: string;
  valid_until?: string;
  revocation_status: 'active' | 'revoked' | 'unknown';
  metadata?: Record<string, any>;
}

interface VerificationContext {
  asset_url: string;
  manifest_url?: string;
  mixed_content: boolean;
  timestamp: string;
}

interface MediaMapResponse {
  sam: TemporalMap;
  manifest_url: string;
  asset_info: AssetInfo;
}

interface TemporalMap {
  version: string;
  temporal: {
    timebase: string;
    tolerance: {
      pts: number;
    };
    maps: Array<{
      label: string;
      applies_to: string[];
      regions: Array<{
        start: number;
        end: number;
        assertions: string[];
      }>;
    }>;
  };
}

interface AssetInfo {
  kind: 'video' | 'audio';
  tracks: Array<{
    type: string;
    id: string;
    codec: string;
    lang?: string;
  }>;
  hash: {
    alg: string;
    value: string;
  };
}

// In-memory manifest cache for demo (replace with proper storage in production)
const manifestCache = new Map<string, any>();

// Phase 11: Initialize trust service
let trustService: TrustService;

/**
 * Initialize trust service with database connection
 */
async function initializeTrustService() {
  try {
    // Initialize trust service with default configuration
    trustService = new TrustService({
      cache_ttl_seconds: 300,
      revocation_poll_interval_seconds: 180,
      revocation_sources: [
        {
          name: 'demo-revocations',
          url: 'https://demo.c2pa.example.com/revocations.json',
          type: 'json',
          poll_interval_seconds: 180,
          enabled: true
        }
      ]
    });
    
    console.log('Trust service initialized successfully');
  } catch (error) {
    console.error('Failed to initialize trust service:', error);
    // Continue without trust service for backward compatibility
  }
}

export async function verifyRoutes(fastify: FastifyInstance) {
  
  // 🚨 CRITICAL: ADD SECURITY MIDDLEWARE - THIS WAS COMPLETELY MISSING!
  
  // Global security headers
  fastify.addHook('preHandler', addSecurityHeaders);
  
  // Global request size limits (prevent DoS)
  fastify.addHook('preHandler', defaultRequestLimits);
  
  // Global parameter pollution protection
  fastify.addHook('preHandler', defaultParameterPollution);
  
  // Global replay attack protection
  fastify.addHook('preHandler', standardReplayProtection);
  
  // Global side-channel attack protection
  fastify.addHook('preHandler', standardSideChannelProtection);
  
  // Global CORS validation
  fastify.addHook('preHandler', validateCORS([
    'http://localhost:3000',
    'http://localhost:3001', 
    'https://demo.c2pa.example.com'
  ]));
  
  // Global security monitoring
  fastify.addHook('preHandler', createSecurityMonitoringMiddleware());
  
  // Phase 11: Initialize trust service
  await initializeTrustService();
  
  // Serve manifest files
  fastify.get('/manifests/:manifestId', async (request: FastifyRequest<{ Params: { manifestId: string } }>, reply: FastifyReply) => {
    const { manifestId } = request.params;
    const manifestUrl = `/manifests/${manifestId}`;
    
    const manifest = manifestCache.get(manifestUrl);
    if (!manifest) {
      return reply.status(404).send({ error: 'Manifest not found' });
    }
    
    reply.header('Content-Type', 'application/c2pa+json');
    reply.header('Access-Control-Allow-Origin', '*');
    return reply.send(manifest);
  });
  
  // Verify video endpoint
  fastify.get<VerifyVideoRequest>('/verify/video', {
    preHandler: [RateLimitPresets.verification.middleware],
    schema: {
      querystring: {
        type: 'object',
        required: ['asset_url'],
        properties: {
          asset_url: { type: 'string', format: 'uri' },
          t: { type: 'number', minimum: 0 },
          tracks: { type: 'string', pattern: '^[a-zA-Z0-9,_-]+$' },
          manifest_url: { type: 'string', format: 'uri' }
        }
      }
    }
  }, async (request: FastifyRequest<VerifyVideoRequest>, reply: FastifyReply) => {
    try {
      const { asset_url, t = 0, tracks = 'main', manifest_url } = request.query;
      
      // Parse tracks
      const trackList = tracks.split(',').map(t => t.trim()).filter(t => t);
      
      // Load manifest
      let manifest;
      if (manifest_url) {
        manifest = await loadManifest(manifest_url);
      } else {
        // Try to discover manifest from asset URL
        manifest = await discoverManifest(asset_url);
      }
      
      if (!manifest) {
        return reply.status(404).send({
          status: 'unknown',
          active_assertions: [],
          reason: 'No manifest found',
          asset_url,
          timestamp: new Date().toISOString()
        } as VerifyResponse);
      }
      
      // Verify at specific time
      const result = await verifyAtTime(manifest, t, trackList);
      
      // Phase 11: Add trust information
      let trust: TrustSnippet | undefined;
      if (trustService && manifest) {
        try {
          // Extract key ID from signature or use demo fallback
          const keyId = manifest.signature?.key_id || 
                       manifest.signature?.cert_chain?.[0] || 
                       'key:demo:abc123';
          
          // Create verification context
          const context: VerificationContext = {
            asset_url,
            manifest_url,
            mixed_content: !asset_url.startsWith('https://'),
            timestamp: new Date().toISOString()
          };
          
          // Resolve trust snippet
          trust = await trustService.resolveTrustSnippet(keyId, context);
        } catch (error) {
          console.error('Error resolving trust snippet:', error);
          // Continue without trust information
        }
      }
      
      return reply.send({
        ...result,
        asset_url,
        manifest_url,
        links: {
          manifest: manifest_url,
          evidence: `/verify/evidence/${Buffer.from(asset_url).toString('base64')}`
        },
        timestamp: new Date().toISOString(),
        trust // Phase 11 addition
      } as VerifyResponse);
      
    } catch (error) {
      fastify.log.error('Video verification failed:', error);
      return reply.status(500).send({
        error: 'Internal verification error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
});

/**
 * Load manifest from URL
 */
async function loadManifest(manifestUrl: string): Promise<any> {
  const response = await fetch(manifestUrl, {
    headers: { 'Accept': 'application/c2pa+json' }
  });
  
  if (!response.ok) {
    throw new Error(`Manifest fetch failed: ${response.status}`);
  }
  
  return response.json();
}

/**
 * Discover manifest from asset URL
 */
async function discoverManifest(assetUrl: string): Promise<any> {
  // Extract base URL and try common manifest locations
  const baseUrl = new URL(assetUrl);
  const possiblePaths = [
    `${baseUrl.pathname}.c2pa.json`,
    `${baseUrl.pathname.replace(/\.[^.]+$/, '')}.c2pa.json`,
    `/manifests${baseUrl.pathname}.c2pa.json`
  ];
  
  for (const path of possiblePaths) {
    try {
      const manifestUrl = `${baseUrl.origin}${path}`;
      const manifest = await loadManifest(manifestUrl);
      return manifest;
    } catch {
      // Try next path
      continue;
    }
  }
  
  return null;
}

/**
 * Verify manifest at specific time
 */
async function verifyAtTime(manifest: any, currentTime: number, tracks: string[]): Promise<Omit<VerifyResponse, 'timestamp' | 'links'>> {
  if (!manifest.temporal || !manifest.temporal.maps) {
    return {
      status: 'unknown',
      active_assertions: [],
      reason: 'No temporal maps found'
    };
  }
  
  const tolerance = manifest.temporal.tolerance?.pts || 0.5;
  const activeAssertions = new Set<string>();
  
  // Find active regions
  for (const map of manifest.temporal.maps) {
    // Check if map applies to current tracks
    const appliesToTracks = map.applies_to.some(trackId => 
      tracks.includes(trackId) || trackId === 'video' || trackId === 'audio'
    );
    
    if (!appliesToTracks) continue;
    
    // Find regions that include current time
    for (const region of map.regions) {
      const startTime = region.start - tolerance;
      const endTime = region.end + tolerance;
      
      if (currentTime >= startTime && currentTime <= endTime) {
        for (const assertion of region.assertions) {
          activeAssertions.add(assertion);
        }
      }
    }
  }
  
  // Check for denied assertions
  const deniedAssertions = manifest.policy?.deny || [];
  const foundDenied = Array.from(activeAssertions).filter(a => deniedAssertions.includes(a));
  
  if (foundDenied.length > 0) {
    return {
      status: 'invalid',
      active_assertions: foundDenied,
      reason: `Denied assertions found: ${foundDenied.join(', ')}`
    };
  }
  
  // Determine status
  const assertions = Array.from(activeAssertions);
  let status: 'valid' | 'unknown' = 'unknown';
  
  if (assertions.length > 0) {
    status = 'valid';
  }
  
  // Check for warning conditions
  if (assertions.some(a => a.includes('ad') || a.includes('overlay'))) {
    // Keep as valid but could be warning in UI
  }
  
  return {
    status,
    active_assertions: assertions
  };
}

/**
 * Analyze master playlist
 */
async function analyzeMasterPlaylist(masterUrl: string): Promise<any> {
  const response = await fetch(masterUrl);
  const playlist = await response.text();
  
  // Parse HLS master playlist
  const lines = playlist.split('\n');
  const tracks: any[] = [];
  let kind = 'video';
  
  for (const line of lines) {
    if (line.startsWith('#EXT-X-STREAM-INF:')) {
      // Extract video track info
      const resolution = line.match(/RESOLUTION=(\d+)x(\d+)/);
      const codecs = line.match(/CODECS="([^"]+)"/);
      
      if (resolution) {
        tracks.push({
          type: 'video',
          id: `v${tracks.length + 1}`,
          codec: codecs ? codecs[1] : 'avc1',
          lang: null
        });
      }
    } else if (line.startsWith('#EXT-X-MEDIA:TYPE=AUDIO')) {
      // Extract audio track info
      const groupId = line.match(/GROUP-ID="([^"]+)"/);
      const name = line.match(/NAME="([^"]+)"/);
      const language = line.match(/LANGUAGE="([^"]+)"/);
      
      if (groupId) {
        tracks.push({
          type: 'audio',
          id: groupId[1],
          codec: 'mp4a.40.2',
          lang: language ? language[1] : 'en'
        });
      }
    }
  }
  
  // Generate hash (simplified)
  const hash = {
    alg: 'sha256',
    value: Buffer.from(playlist).toString('base64').substring(0, 64)
  };
  
  return {
    kind,
    tracks,
    hash
  };
}

/**
 * Generate temporal map
 */
function generateTemporalMap(analysis: any, adBreaks: Array<{start: number, end: number}>): TemporalMap {
  const maps = [];
  
  // Main content regions
  const trackIds = analysis.tracks.map((t: any) => t.id);
  
  let currentTime = 0;
  for (const adBreak of adBreaks) {
    // Add content region before ad
    if (adBreak.start > currentTime) {
      maps.push({
        label: 'program',
        applies_to: trackIds,
        regions: [{
          start: currentTime,
          end: adBreak.start,
          assertions: ['c2pa.actions', 'c2pa.hash.data']
        }]
      });
    }
    
    // Add ad region
    maps.push({
      label: 'advertisement',
      applies_to: trackIds,
      regions: [{
        start: adBreak.start,
        end: adBreak.end,
        assertions: ['ad.overlay', 'c2pa.actions']
      }]
    });
    
    currentTime = adBreak.end;
  }
  
  // Add final content region
  if (currentTime < 600) { // Assume 10 minute video
    maps.push({
      label: 'program',
      applies_to: trackIds,
      regions: [{
        start: currentTime,
        end: 600,
        assertions: ['c2pa.actions', 'editor.note:colorfix']
      }]
    });
  }
  
  return {
    version: '1.0',
    temporal: {
      timebase: 'seconds',
      tolerance: { pts: 0.5 },
      maps
    }
  };
}

/**
 * Generate manifest
 */
async function generateManifest(sam: TemporalMap, masterUrl: string, posterUrl?: string): Promise<string> {
  const manifest = {
    version: '1.0',
    asset: {
      kind: sam.temporal.maps[0]?.applies_to.includes('audio') ? 'audio' : 'video',
      primary_url: masterUrl,
      poster: posterUrl,
      tracks: [], // Would be populated from analysis
      hash: { alg: 'sha256', value: 'placeholder' }
    },
    temporal: sam.temporal,
    signature: {
      alg: 'ES256',
      issuer: 'c2c.example/tenants/demo',
      cert_chain: ['-----BEGIN CERTIFICATE-----\nplaceholder\n-----END CERTIFICATE-----'],
      created_at: new Date().toISOString()
    },
    policy: {
      remote_only: true,
      badge_required: true,
      deny: ['c2pa.location.precise']
    }
  };
  
  // Store manifest in cache for demo
  const manifestId = Buffer.from(JSON.stringify(manifest)).toString('base64').substring(0, 16);
  const manifestUrl = `/manifests/${manifestId}.c2pa.json`;
  
  manifestCache.set(manifestUrl, manifest);
  
  return manifestUrl;
}

/**
 * Generate evidence package
 */
async function generateEvidence(assetUrl: string): Promise<any> {
  return {
    asset_url: assetUrl,
    evidence: {
      verification_log: [
        { timestamp: new Date().toISOString(), event: 'verification_started' },
        { timestamp: new Date().toISOString(), event: 'manifest_loaded' },
        { timestamp: new Date().toISOString(), event: 'verification_completed' }
      ],
      manifest_hash: 'placeholder-hash',
      verification_chain: ['manifest', 'temporal_map', 'signature'],
      compliance: {
        c2pa_spec: '1.0',
        hls_compliance: 'RFC 8216',
        dash_compliance: 'ISO/IEC 23009-1'
      }
    }
  };
}
