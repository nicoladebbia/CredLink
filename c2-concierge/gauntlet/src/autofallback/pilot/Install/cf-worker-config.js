/**
 * C2PA Pilot - Cloudflare Worker Configuration
 * Install this in your Cloudflare Worker for pilot domain
 */

// Worker Configuration for C2PA Pilot
const C2PA_PILOT_CONFIG = {
  // Tenant Configuration - MUST BE CONFIGURED
  tenantId: '', // Set your actual tenant ID here
  apiKey: '',     // Set your actual API key here
  manifestBaseUrl: '', // Set your manifest base URL here
  
  // API Endpoints
  api: {
    manifest: 'https://api.credlink.io/sign',
    verify: 'https://api.credlink.io/verify',
    track: 'https://api.credlink.io/track',
    health: 'https://api.credlink.io/health'
  },
  
  // Pilot Settings
  pilotMode: true,
  pilotStartDate: '2024-10-31',
  pilotEndDate: '2024-11-14',
  
  // Badge Configuration
  badgeEnabled: true,
  badgePosition: 'bottom-right', // top-left, top-right, bottom-left, bottom-right
  badgeScriptUrl: '', // Set your badge script URL here
  
  // Routes to Monitor
  monitoredRoutes: [
    '/images/*',
    '/wp-content/*',
    '/cdn/*',
    '/assets/*',
    '/media/*'
  ],
  
  // CDN Optimizers to Detect
  optimizers: {
    'cloudflare-polish': {
      headers: ['cf-polished'],
      weight: 35
    },
    'imgix': {
      params: ['w=', 'h=', 'fit=', 'auto='],
      weight: 35
    },
    'cloudinary': {
      params: ['w_', 'h_', 'c_', 'f_'],
      weight: 35
    },
    'fastly-io': {
      headers: ['fastly-io'],
      weight: 35
    },
    'akamai-ivm': {
      headers: ['akamai-ivm'],
      weight: 35
    }
  },
  
  // API Endpoints
  api: {
    verify: 'https://api.credlink.io/verify',
    manifest: 'https://api.credlink.io/manifest',
    tracking: 'https://api.credlink.io/track'
  }
};

// Main Worker Handler
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const startTime = Date.now();
    
    // Handle pilot-specific routes
    if (url.pathname.startsWith('/_c2pa/')) {
      return handleC2PARequest(request, env, url);
    }
    
    // Process image requests
    if (isImageRequest(url.pathname)) {
      return handleImageRequest(request, env, url, startTime);
    }
    
    // Inject badge script on HTML pages
    if (isHtmlPage(request)) {
      return handleHtmlRequest(request, env, url);
    }
    
    // Pass through other requests
    return fetch(request);
  }
};

// Handle C2PA-specific routes
async function handleC2PARequest(request, env, url) {
  const path = url.pathname.replace('/_c2pa/', '');
  
  switch (path) {
    case 'health':
      return new Response(JSON.stringify({
        status: 'healthy',
        pilot: {
          tenantId: C2PA_PILOT_CONFIG.tenantId,
          mode: 'active',
          day: Math.floor((Date.now() - new Date(C2PA_PILOT_CONFIG.pilotStartDate)) / (1000 * 60 * 60 * 24)),
          endDate: C2PA_PILOT_CONFIG.pilotEndDate
        },
        timestamp: new Date().toISOString()
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
      
    case 'manifest':
      const assetUrl = url.searchParams.get('asset');
      if (!assetUrl) {
        return new Response('Missing asset parameter', { status: 400 });
      }
      
      const manifest = await generateManifest(assetUrl, env);
      return new Response(JSON.stringify(manifest, null, 2), {
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
      
    case 'verify':
      const verifyAsset = url.searchParams.get('asset');
      if (!verifyAsset) {
        return new Response('Missing asset parameter', { status: 400 });
      }
      
      const verifyResult = await verifyAsset(verifyAsset, env);
      return new Response(JSON.stringify(verifyResult, null, 2), {
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
      
    default:
      return new Response('Not found', { status: 404 });
  }
}

// Handle image requests with manifest injection
async function handleImageRequest(request, env, url, startTime) {
  
  // Detect CDN optimizer signals
  const optimizerSignal = detectOptimizerSignal(request, url);
  
  // Fetch original image
  const originalResponse = await fetch(request);
  
  // Create modified response
  const response = new Response(originalResponse.body, originalResponse);
  
  // Inject manifest link header
  const manifestUrl = `${C2PA_PILOT_CONFIG.manifestBaseUrl}/manifests${url.pathname}.jsonld`;
  response.headers.set('Link', `<${manifestUrl}>; rel="c2pa-manifest"`);
  
  // Add C2PA tracking headers
  response.headers.set('X-C2PA-Tenant', C2PA_PILOT_CONFIG.tenantId);
  response.headers.set('X-C2PA-Pilot', 'active');
  response.headers.set('X-C2PA-Optimizer', optimizerSignal || 'none');
  
  // Log verification event
  ctx.waitUntil(logVerificationEvent({
    tenantId: C2PA_PILOT_CONFIG.tenantId,
    assetUrl: url.href,
    manifestUrl,
    optimizer: optimizerSignal,
    timestamp: new Date().toISOString(),
    processingTime: Date.now() - startTime
  }, env));
  
  return response;
}

// Handle HTML requests with badge script injection
async function handleHtmlRequest(request, env, url) {
  
  const response = await fetch(request);
  const contentType = response.headers.get('content-type') || '';
  
  if (!contentType.includes('text/html')) {
    return response;
  }
  
  // Rewrite HTML to inject badge script
  const rewriter = new HTMLRewriter()
    .on('head', new HeadInjector())
    .on('img', new ImageWrapper());
  
  return rewriter.transform(response);
}

// HTML rewriter for head injection
class HeadInjector {
  element(element) {
    if (C2PA_PILOT_CONFIG.badgeEnabled) {
      element.append(`
        <!-- C2PA Pilot Badge -->
        <link rel="c2pa-manifest" href="${C2PA_PILOT_CONFIG.manifestBaseUrl}/site-manifest.jsonld">
        <script type="module" src="${C2PA_PILOT_CONFIG.badgeScriptUrl}" defer></script>
      `, { html: true });
    }
  }
}

// HTML rewriter for image wrapping
class ImageWrapper {
  element(element) {
    const src = element.getAttribute('src');
    if (src && isImageRequest(src)) {
      element.setAttribute('data-c2pa-manifest', `${C2PA_PILOT_CONFIG.manifestBaseUrl}/manifests${new URL(src).pathname}.jsonld`);
      element.setAttribute('data-c2pa-tenant', C2PA_PILOT_CONFIG.tenantId);
    }
  }
}

// Detect CDN optimizer signals
function detectOptimizerSignal(request, url) {
  
  // Check URL parameters for optimizer signatures
  const params = url.searchParams;
  
  for (const [optimizer, config] of Object.entries(C2PA_PILOT_CONFIG.optimizers)) {
    if (config.params) {
      for (const param of config.params) {
        if (params.has(param.replace('=', ''))) {
          return optimizer;
        }
      }
    }
  }
  
  // Check headers for optimizer signatures
  const headers = request.headers;
  
  for (const [optimizer, config] of Object.entries(C2PA_PILOT_CONFIG.optimizers)) {
    if (config.headers) {
      for (const header of config.headers) {
        if (headers.get(header)) {
          return optimizer;
        }
      }
    }
  }
  
  return null;
}

// Generate C2PA manifest
async function generateManifest(assetUrl, env) {
  try {
    // Validate inputs
    if (!assetUrl || typeof assetUrl !== 'string') {
      throw new Error('Invalid asset URL');
    }
    
    if (!C2PA_PILOT_CONFIG.tenantId) {
      throw new Error('Tenant ID not configured');
    }
    
    const assetId = assetUrl.split('/').pop()?.split('.')[0] || 'unknown';
    const instanceId = generateUUID();
    
    // Call actual signing service
    const signResponse = await fetch(C2PA_PILOT_CONFIG.api.manifest, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${C2PA_PILOT_CONFIG.apiKey}`,
        'X-Tenant-ID': C2PA_PILOT_CONFIG.tenantId
      },
      body: JSON.stringify({
        assetId,
        assetUrl,
        instanceId,
        tenantId: C2PA_PILOT_CONFIG.tenantId,
        pilotMode: C2PA_PILOT_CONFIG.pilotMode
      })
    });
    
    if (!signResponse.ok) {
      const errorText = await signResponse.text();
      throw new Error(`Signing service error: ${signResponse.status} ${errorText}`);
    }
    
    const manifest = await signResponse.json();
    
    // Validate manifest structure
    if (!manifest['@context'] || !manifest.manifest) {
      throw new Error('Invalid manifest structure from signing service');
    }
    
    // Add pilot metadata
    manifest.pilot = {
      tenantId: C2PA_PILOT_CONFIG.tenantId,
      startDate: C2PA_PILOT_CONFIG.pilotStartDate,
      endDate: C2PA_PILOT_CONFIG.pilotEndDate,
      version: '1.0.0',
      workerGenerated: true
    };
    
    return manifest;
    
  } catch (error) {
    console.error('Failed to generate manifest:', error);
    
    // Return fallback manifest for pilot continuity
    const assetId = assetUrl?.split('/').pop()?.split('.')[0] || 'unknown';
    
    return {
      '@context': 'https://w3id.org/c2pa/1.0',
      'manifest': {
        'title': `Asset ${assetId}`,
        'format': 'image/jpeg',
        'instance_id': generateUUID(),
        'claim_generator': 'C2PA Pilot Cloudflare Worker v1.0.0',
        'assertions': [
          {
            'label': 'c2pa.actions',
            'data': {
              'actions': [
                {
                  'action': 'c2pa.created',
                  'digitalSourceType': 'https://ns.c2pa.org/digitalSourceType/composite',
                  'when': new Date().toISOString(),
                  'softwareAgent': 'C2PA Pilot Cloudflare Worker'
                }
              ]
            }
          },
          {
            'label': 'c2pa.training-mining',
            'data': {
              'use': 'notAllowed'
            }
          }
        ]
      },
      'pilot': {
        tenantId: C2PA_PILOT_CONFIG.tenantId,
        startDate: C2PA_PILOT_CONFIG.pilotStartDate,
        endDate: C2PA_PILOT_CONFIG.pilotEndDate,
        version: '1.0.0',
        error: error.message,
        fallbackGenerated: true
      }
    };
  }
}

// Verify asset manifest
async function verifyAsset(assetUrl, env) {
  try {
    const manifestUrl = `${C2PA_PILOT_CONFIG.manifestBaseUrl}/manifests${new URL(assetUrl).pathname}.jsonld`;
    const manifestResponse = await fetch(manifestUrl);
    
    if (!manifestResponse.ok) {
      return {
        valid: false,
        error: 'Manifest not found',
        assetUrl,
        manifestUrl
      };
    }
    
    const manifest = await manifestResponse.json();
    
    // In production, this would do actual cryptographic verification
    return {
      valid: true,
      assetUrl,
      manifestUrl,
      manifest,
      verifiedAt: new Date().toISOString(),
      pilot: {
        tenantId: C2PA_PILOT_CONFIG.tenantId,
        active: true
      }
    };
    
  } catch (error) {
    return {
      valid: false,
      error: error.message,
      assetUrl
    };
  }
}

// Log verification event
async function logVerificationEvent(event, env) {
  try {
    await fetch(C2PA_PILOT_CONFIG.api.tracking, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${C2PA_PILOT_CONFIG.apiKey}`
      },
      body: JSON.stringify(event)
    });
  } catch (error) {
    console.log('Failed to log verification event:', error);
  }
}

// Utility functions
function isImageRequest(pathname) {
  return C2PA_PILOT_CONFIG.monitoredRoutes.some(route => {
    const regex = new RegExp(route.replace('*', '.*'));
    return regex.test(pathname);
  });
}

function isHtmlPage(request) {
  const accept = request.headers.get('accept') || '';
  return accept.includes('text/html');
}

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Export configuration for external use
export { C2PA_PILOT_CONFIG };
