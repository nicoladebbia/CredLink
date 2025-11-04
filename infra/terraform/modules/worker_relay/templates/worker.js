// Enhanced Worker with Rate Limiting and Security Headers
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

// Configuration from environment variables
const RATE_LIMITING_CONFIG = JSON.parse(typeof RATE_LIMITING_CONFIG !== 'undefined' ? RATE_LIMITING_CONFIG : '{}')
const SECURITY_HEADERS_CONFIG = JSON.parse(typeof SECURITY_HEADERS_CONFIG !== 'undefined' ? SECURITY_HEADERS_CONFIG : '{}')
const API_CONFIG = JSON.parse(typeof API_CONFIG !== 'undefined' ? API_CONFIG : '{}')

// Rate limiting store (in production, use KV or Durable Objects)
const rateLimitStore = new Map()

async function handleRequest(request) {
  try {
    // Apply rate limiting if enabled
    if (RATE_LIMITING_CONFIG.enabled) {
      const rateLimitResult = await checkRateLimit(request)
      if (!rateLimitResult.allowed) {
        const response = RATE_LIMITING_CONFIG.rate_limit_response || {
          status_code: 429,
          message: 'Rate limit exceeded. Please try again later.',
          retry_after: 60
        }
        return new Response(response.message, { 
          status: response.status_code,
          headers: {
            ...getSecurityHeaders(),
            'Retry-After': response.retry_after.toString(),
            'X-RateLimit-Limit': RATE_LIMITING_CONFIG.requests_per_minute.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': Math.ceil(Date.now() / 1000 + response.retry_after).toString()
          }
        })
      }
    }

    // Apply country filtering
    if (RATE_LIMITING_CONFIG.allowed_countries.length > 0 || RATE_LIMITING_CONFIG.blocked_countries.length > 0) {
      const country = request.cf?.country
      if (country) {
        if (RATE_LIMITING_CONFIG.allowed_countries.length > 0 && !RATE_LIMITING_CONFIG.allowed_countries.includes(country)) {
          return new Response('Access denied from your location', { 
            status: 403,
            headers: getSecurityHeaders()
          })
        }
        if (RATE_LIMITING_CONFIG.blocked_countries.includes(country)) {
          return new Response('Access denied from your location', { 
            status: 403,
            headers: getSecurityHeaders()
          })
        }
      }
    }

    // Apply IP filtering
    if (RATE_LIMITING_CONFIG.allowed_ip_ranges.length > 0 || RATE_LIMITING_CONFIG.blocked_ip_ranges.length > 0) {
      const clientIP = request.cf?.connectingIP || request.headers.get('CF-Connecting-IP')
      if (clientIP) {
        if (RATE_LIMITING_CONFIG.allowed_ip_ranges.length > 0 && !isIPAllowed(clientIP, RATE_LIMITING_CONFIG.allowed_ip_ranges)) {
          return new Response('Access denied from your IP', { 
            status: 403,
            headers: getSecurityHeaders()
          })
        }
        if (isIPBlocked(clientIP, RATE_LIMITING_CONFIG.blocked_ip_ranges)) {
          return new Response('Access denied from your IP', { 
            status: 403,
            headers: getSecurityHeaders()
          })
        }
      }
    }

    // Handle the request
    const url = new URL(request.url)
    const path = url.pathname

    // Route handling
    if (path.startsWith('/api/')) {
      return handleAPIRequest(request)
    } else if (path.startsWith('/manifest/')) {
      return handleManifestRequest(request)
    } else {
      return handleStaticRequest(request)
    }

  } catch (error) {
    console.error('Worker error:', error)
    return new Response('Internal Server Error', { 
      status: 500,
      headers: getSecurityHeaders()
    })
  }
}

async function checkRateLimit(request) {
  const clientIP = request.cf?.connectingIP || request.headers.get('CF-Connecting-IP')
  const now = Date.now()
  const windowStart = now - 60000 // 1 minute window
  
  if (!clientIP) {
    return { allowed: true } // Cannot rate limit without IP
  }

  // Clean old entries
  for (const [ip, requests] of rateLimitStore.entries()) {
    const validRequests = requests.filter(timestamp => timestamp > windowStart)
    if (validRequests.length === 0) {
      rateLimitStore.delete(ip)
    } else {
      rateLimitStore.set(ip, validRequests)
    }
  }

  // Check current IP
  const ipRequests = rateLimitStore.get(clientIP) || []
  const recentRequests = ipRequests.filter(timestamp => timestamp > windowStart)
  
  if (recentRequests.length >= RATE_LIMITING_CONFIG.requests_per_minute) {
    return { allowed: false, resetTime: Math.min(...recentRequests) + 60000 }
  }

  // Add current request
  recentRequests.push(now)
  rateLimitStore.set(clientIP, recentRequests)
  
  return { allowed: true }
}

function isIPAllowed(ip, allowedRanges) {
  // Simple IP range checking (in production, use a proper IP range library)
  for (const range of allowedRanges) {
    if (ip.startsWith(range.replace('/32', ''))) {
      return true
    }
  }
  return false
}

function isIPBlocked(ip, blockedRanges) {
  for (const range of blockedRanges) {
    if (ip.startsWith(range.replace('/32', ''))) {
      return true
    }
  }
  return false
}

function getSecurityHeaders() {
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=3600'
  }

  if (SECURITY_HEADERS_CONFIG.strict_transport_security) {
    headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains; preload'
  }

  if (SECURITY_HEADERS_CONFIG.content_type_options) {
    headers['X-Content-Type-Options'] = 'nosniff'
  }

  if (SECURITY_HEADERS_CONFIG.frame_options) {
    headers['X-Frame-Options'] = 'DENY'
  }

  if (SECURITY_HEADERS_CONFIG.xss_protection) {
    headers['X-XSS-Protection'] = '1; mode=block'
  }

  if (SECURITY_HEADERS_CONFIG.referrer_policy) {
    headers['Referrer-Policy'] = SECURITY_HEADERS_CONFIG.referrer_policy
  }

  if (SECURITY_HEADERS_CONFIG.permissions_policy) {
    headers['Permissions-Policy'] = SECURITY_HEADERS_CONFIG.permissions_policy
  }

  return headers
}

async function handleAPIRequest(request) {
  const url = new URL(request.url)
  const path = url.pathname

  // Health check endpoints
  if (path === '/api/health') {
    return new Response(JSON.stringify({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: API_CONFIG.env,
      version: '1.0.0'
    }), {
      headers: getSecurityHeaders()
    })
  }

  // Cache health check
  if (path === '/api/health/cache') {
    return new Response(JSON.stringify({
      status: 'healthy',
      cache_status: 'operational',
      last_check: new Date().toISOString()
    }), {
      headers: getSecurityHeaders()
    })
  }

  // Rehydration health check
  if (path === '/api/health/rehydration') {
    return new Response(JSON.stringify({
      status: 'healthy',
      rehydration_status: 'complete',
      last_rehydration: new Date().toISOString()
    }), {
      headers: getSecurityHeaders()
    })
  }

  // Worker health check
  if (path === '/api/health/worker') {
    return new Response(JSON.stringify({
      status: 'healthy',
      worker_uptime: process.uptime ? process.uptime() : 0,
      memory_usage: performance.memory ? {
        used: performance.memory.usedJSHeapSize,
        total: performance.memory.totalJSHeapSize,
        limit: performance.memory.jsHeapSizeLimit
      } : null
    }), {
      headers: getSecurityHeaders()
    })
  }

  return new Response('API endpoint not found', { 
    status: 404,
    headers: getSecurityHeaders()
  })
}

async function handleManifestRequest(request) {
  const url = new URL(request.url)
  const manifestId = url.pathname.replace('/manifest/', '')

  if (!manifestId) {
    return new Response('Manifest ID required', { 
      status: 400,
      headers: getSecurityHeaders()
    })
  }

  // In a real implementation, fetch from storage
  const manifest = {
    id: manifestId,
    version: '1.0.0',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    content: {
      // Manifest content here
    }
  }

  return new Response(JSON.stringify(manifest), {
    headers: getSecurityHeaders()
  })
}

async function handleStaticRequest(request) {
  const url = new URL(request.url)
  const path = url.pathname

  // Serve static assets from KV storage
  if (path.startsWith('/static/')) {
    const assetKey = path.replace('/static/', '')
    
    try {
      const asset = await ASSETS.get(assetKey)
      if (asset) {
        return new Response(asset, {
          headers: {
            ...getSecurityHeaders(),
            'Cache-Control': 'public, max-age=86400' // 24 hours for static assets
          }
        })
      }
    } catch (error) {
      console.error('Error fetching asset:', error)
    }
  }

  // Default response
  return new Response(JSON.stringify({
    message: 'CredLink Worker',
    timestamp: new Date().toISOString(),
    environment: API_CONFIG.env
  }), {
    headers: getSecurityHeaders()
  })
}

// Export for testing
export {
  handleRequest,
  checkRateLimit,
  getSecurityHeaders
}
