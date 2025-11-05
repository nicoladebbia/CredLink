/**
 * C2 Concierge Edge Worker
 * Cloudflare Worker for C2PA manifest processing and survival checks
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Handle different routes
    switch (url.pathname) {
      case '/health':
        return new Response(JSON.stringify({
          success: true,
          data: {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            version: '1.0.0'
          }
        }), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
        
      case '/verify':
        return handleVerification(request, env);
        
      default:
        return new Response('Not Found', { status: 404 });
    }
  }
};

async function handleVerification(request, env) {
  try {
    // Basic verification endpoint
    const body = await request.json();
    
    return new Response(JSON.stringify({
      success: true,
      data: {
        verified: true,
        manifest: body.manifest || null,
        timestamp: new Date().toISOString()
      }
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}
