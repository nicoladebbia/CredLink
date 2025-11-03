/**
 * IDP Service - SSO Broker (Simplified for development)
 * Handles OIDC (primary) and SAML (fallback) authentication
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { setCookie, getCookie } from 'hono/cookie';
import { sign, verify } from 'hono/jwt';
import { ssoManager, OIDCConfig, SAMLConfig, ClaimsMapping } from '@c2/oidc-saml';
import { check, Subject } from '@c2/rbac';

interface Session {
  user_id: string;
  org_id: string;
  email: string;
  roles: string[];
  idp_provider: string;
  expires_at: number;
  [key: string]: any; // Index signature for JWTPayload compatibility
}

const app = new Hono();

// CORS for cross-origin requests
app.use('/*', cors({
  origin: ['http://localhost:3000', 'https://*.company.com'],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Mock environment for development
const mockEnv = {
  KV: {
    get: async (key: string) => null,
    put: async (key: string, value: string, options?: any) => {},
    delete: async (key: string) => {}
  },
  AUDIT_BUCKET: {
    put: async (key: string, value: string) => {}
  },
  JWT_SECRET: 'mock-secret-key'
};

/**
 * OIDC Authentication Flow
 */

// Start OIDC login
app.post('/org/:orgId/oidc/login', async (c) => {
  const orgId = c.req.param('orgId');
  const { redirect_uri } = await c.req.json();

  try {
    // Get OIDC config for organization
    const oidcProvider = ssoManager.getOIDCProvider(orgId);
    if (!oidcProvider) {
      return c.json({ error: 'OIDC not configured for organization' }, 404);
    }

    // Generate PKCE verifier and state
    const codeVerifier = ssoManager.generatePKCEVerifier();
    const state = crypto.randomUUID();
    
    // Store PKCE verifier in session (mock)
    await mockEnv.KV.put(`oidc:${state}`, codeVerifier);

    // Generate authorization URL
    const authUrl = await oidcProvider.generateAuthUrl(state, codeVerifier);

    return c.json({
      auth_url: authUrl,
      state: state
    });
  } catch (error) {
    console.error('OIDC login error:', error);
    return c.json({ error: 'Failed to initiate OIDC login' }, 500);
  }
});

// OIDC callback
app.get('/org/:orgId/oidc/callback', async (c) => {
  const orgId = c.req.param('orgId');
  const code = c.req.query('code');
  const state = c.req.query('state');
  const error = c.req.query('error');

  if (error) {
    return c.redirect(`/login?error=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    return c.redirect('/login?error=missing_params');
  }

  try {
    // Retrieve PKCE verifier
    const codeVerifier = await mockEnv.KV.get(`oidc:${state}`);
    if (!codeVerifier) {
      return c.redirect('/login?error=invalid_state');
    }

    // Get OIDC provider
    const oidcProvider = ssoManager.getOIDCProvider(orgId);
    if (!oidcProvider) {
      return c.redirect('/login?error=no_provider');
    }

    // Exchange code for tokens
    const tokens = await oidcProvider.exchangeCode(code, codeVerifier);
    
    // Validate ID token
    const claims = await oidcProvider.validateIdToken(tokens.id_token);
    
    // Get user info
    const userInfo = await oidcProvider.getUserInfo(tokens.access_token);
    
    // Map claims to internal user format
    const mapping: ClaimsMapping = {
      user_id: 'sub',
      email: 'email',
      name: 'name',
      groups: 'groups',
      role_mapping: {
        'c2-admins': 'org_admin',
        'c2-integrators': 'integrator',
        'c2-auditors': 'auditor'
      }
    };
    
    const idpUser = oidcProvider.mapClaims({ ...claims, ...userInfo }, mapping);
    
    // Create or update user in database (mock)
    const user = await createOrUpdateUser(c, idpUser, orgId);
    
    // Create session
    const session: Session = {
      user_id: user.id,
      org_id: orgId,
      email: user.email,
      roles: user.roles,
      idp_provider: 'oidc',
      expires_at: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
    };
    
    const sessionToken = await sign(session, mockEnv.JWT_SECRET);
    
    // Set session cookie
    setCookie(c, 'session', sessionToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      maxAge: 24 * 60 * 60 // 24 hours
    });

    // Clean up PKCE verifier
    await mockEnv.KV.delete(`oidc:${state}`);

    return c.redirect('/dashboard');
  } catch (error) {
    console.error('OIDC callback error:', error);
    return c.redirect('/login?error=callback_failed');
  }
});

/**
 * SAML Authentication Flow (Fallback)
 */

// Get SP metadata
app.get('/org/:orgId/saml/metadata', async (c) => {
  const orgId = c.req.param('orgId');
  
  const samlProvider = ssoManager.getSAMLProvider(orgId);
  if (!samlProvider) {
    return c.json({ error: 'SAML not configured for organization' }, 404);
  }

  const metadata = samlProvider.generateSPMetadata();
  return c.text(metadata, 200, {
    'Content-Type': 'application/xml'
  });
});

// SAML ACS endpoint
app.post('/org/:orgId/saml/acs', async (c) => {
  const orgId = c.req.param('orgId');
  const body = await c.req.text();
  
  try {
    const samlProvider = ssoManager.getSAMLProvider(orgId);
    if (!samlProvider) {
      return c.json({ error: 'SAML not configured for organization' }, 404);
    }

    // Process SAML response
    const idpUser = await samlProvider.processResponse(body);
    
    // Create or update user
    const user = await createOrUpdateUser(c, idpUser, orgId);
    
    // Create session
    const session: Session = {
      user_id: user.id,
      org_id: orgId,
      email: user.email,
      roles: user.roles,
      idp_provider: 'saml',
      expires_at: Date.now() + (24 * 60 * 60 * 1000)
    };
    
    const sessionToken = await sign(session, mockEnv.JWT_SECRET);
    
    setCookie(c, 'session', sessionToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      maxAge: 24 * 60 * 60
    });

    return c.redirect('/dashboard');
  } catch (error) {
    console.error('SAML ACS error:', error);
    return c.redirect('/login?error=saml_failed');
  }
});

/**
 * Configuration Management
 */

// Configure OIDC for organization
app.put('/org/:orgId/oidc/config', async (c) => {
  const orgId = c.req.param('orgId');
  const config: OIDCConfig = await c.req.json();
  
  // Verify authorization (must be org admin)
  const session = await authenticateSession(c);
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  
  const canManage = check(
    session,
    { verb: 'update', resource: 'sso' },
    { type: 'sso', org_id: orgId },
    { timestamp: new Date(), request_id: 'config_oidc' }
  );
  
  if (!canManage.allow) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  try {
    // Store configuration
    await mockEnv.KV.put(`oidc_config:${orgId}`, JSON.stringify(config));
    
    // Register provider
    ssoManager.registerOIDC(orgId, config);
    
    // Log configuration change
    await logAuditEvent(c, {
      action: 'sso.oidc.configured',
      resource: { org_id: orgId },
      details: { issuer: config.issuer }
    });
    
    return c.json({ success: true });
  } catch (error) {
    console.error('OIDC config error:', error);
    return c.json({ error: 'Failed to configure OIDC' }, 500);
  }
});

// Configure SAML for organization
app.put('/org/:orgId/saml/config', async (c) => {
  const orgId = c.req.param('orgId');
  const config: SAMLConfig = await c.req.json();
  
  // Verify authorization
  const session = await authenticateSession(c);
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  
  const canManage = check(
    session,
    { verb: 'update', resource: 'sso' },
    { type: 'sso', org_id: orgId },
    { timestamp: new Date(), request_id: 'config_saml' }
  );
  
  if (!canManage.allow) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  try {
    await mockEnv.KV.put(`saml_config:${orgId}`, JSON.stringify(config));
    ssoManager.registerSAML(orgId, config);
    
    await logAuditEvent(c, {
      action: 'sso.saml.configured',
      resource: { org_id: orgId },
      details: { entity_id: config.sp_entity_id }
    });
    
    return c.json({ success: true });
  } catch (error) {
    console.error('SAML config error:', error);
    return c.json({ error: 'Failed to configure SAML' }, 500);
  }
});

/**
 * Session Management
 */

// Get current session
app.get('/session', async (c) => {
  const sessionToken = getCookie(c, 'session');
  if (!sessionToken) {
    return c.json({ error: 'No active session' }, 401);
  }
  
  try {
    const session = await verify(sessionToken, mockEnv.JWT_SECRET) as unknown as Session;
    
    // Check if session is expired
    if (Date.now() > session.expires_at) {
      return c.json({ error: 'Session expired' }, 401);
    }
    
    return c.json({
      user_id: session.user_id,
      org_id: session.org_id,
      email: session.email,
      roles: session.roles,
      idp_provider: session.idp_provider
    });
  } catch (error) {
    return c.json({ error: 'Invalid session' }, 401);
  }
});

// Logout
app.post('/logout', async (c) => {
  const sessionToken = getCookie(c, 'session');
  if (sessionToken) {
    // Invalidate session
    await mockEnv.KV.delete(`session:${sessionToken}`);
  }
  
  setCookie(c, 'session', '', {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    maxAge: 0
  });
  
  return c.json({ success: true });
});

/**
 * Helper Functions
 */

async function authenticateSession(c: any): Promise<Subject | null> {
  const sessionToken = getCookie(c, 'session');
  if (!sessionToken) {
    return null;
  }
  
  try {
    const session = await verify(sessionToken, mockEnv.JWT_SECRET) as unknown as Session;
    
    // Check if session is expired
    if (Date.now() > session.expires_at) {
      return null;
    }
    
    return {
      user_id: session.user_id,
      org_id: session.org_id,
      roles: session.roles,
      ip_address: c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For')
    };
  } catch (error) {
    return null;
  }
}

async function createOrUpdateUser(c: any, idpUser: any, orgId: string): Promise<any> {
  // In production, this would query/update the database
  // For now, return a mock user
  return {
    id: idpUser.id,
    email: idpUser.email,
    roles: [idpUser.role || 'auditor']
  };
}

async function logAuditEvent(c: any, event: any): Promise<void> {
  const auditRecord = {
    ts: new Date().toISOString(),
    actor: {
      user_id: 'system',
      ip: c.req.header('CF-Connecting-IP')
    },
    request_id: crypto.randomUUID(),
    action: event.action,
    resource: event.resource,
    details: event.details,
    hash: '', // Would compute hash chain
    sig: '' // Would sign with audit key
  };
  
  await mockEnv.AUDIT_BUCKET.put(
    `audit/${Date.now()}_${auditRecord.request_id}.json`,
    JSON.stringify(auditRecord)
  );
}

export default app;
