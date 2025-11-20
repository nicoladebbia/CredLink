// @ts-nocheck
/**
 * SSO Authentication Routes
 * Handles SAML, OAuth 2.0, OIDC, Azure AD, Google authentication
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import 'express-session';

// Extend Express Request to include session and user
declare module 'express-session' {
  interface SessionData {
    returnUrl?: string;
    orgId?: string;
  }
}

declare global {
  namespace Express {
    interface User {
      id: string;
      email: string;
      [key: string]: any;
    }
  }
}
import { SSOAuthMiddleware } from '../middleware/sso-auth';
import { SSOService } from '../services/sso-service';
import { logger } from '../utils/logger';
import jwt from 'jsonwebtoken';

export function createSSORouter(pool: Pool): Router {
  const router = Router();
  const ssoAuth = new SSOAuthMiddleware(pool);
  const ssoService = new SSOService(pool);
  const passport = ssoAuth.getPassport();

  /**
   * GET /auth/sso/providers/:orgId
   * Get available SSO providers for an organization
   */
  router.get('/providers/:orgId', async (req: Request, res: Response) => {
    try {
      const { orgId } = req.params;
      
      const result = await pool.query(
        `SELECT id, provider_type, provider_name, enabled, metadata
         FROM sso_providers
         WHERE org_id = $1 AND enabled = true`,
        [orgId]
      );
      
      res.json({
        providers: result.rows.map(row => ({
          id: row.id,
          type: row.provider_type,
          name: row.provider_name,
          enabled: row.enabled
        }))
      });
    } catch (error) {
      logger.error('Failed to get SSO providers', { error });
      res.status(500).json({ error: 'Failed to retrieve SSO providers' });
    }
  });

  /**
   * POST /auth/sso/initiate
   * Initiate SSO authentication flow
   */
  router.post('/initiate', async (req: Request, res: Response) => {
    try {
      const { orgId, providerName, returnUrl } = req.body;
      
      if (!orgId) {
        return res.status(400).json({ error: 'Organization ID required' });
      }

      // Initialize provider strategy
      const provider = await ssoAuth.initializeProvider(orgId, providerName);
      
      // Store return URL in session
      if (req.session) {
        req.session.returnUrl = returnUrl || '/dashboard';
        req.session.orgId = orgId;
      }

      // Build strategy name
      const strategyName = `${provider.providerType}-${provider.orgId}-${provider.providerName}`;
      
      // Redirect to provider
      res.json({
        redirectUrl: `/auth/sso/${provider.providerType}/login?strategy=${encodeURIComponent(strategyName)}`
      });
    } catch (error) {
      logger.error('Failed to initiate SSO', { error });
      res.status(500).json({ error: 'Failed to initiate SSO authentication' });
    }
  });

  /**
   * GET /auth/sso/saml/login
   * SAML authentication entry point
   */
  router.get('/saml/login', (req: Request, res: Response, next) => {
    const strategy = req.query.strategy as string;
    
    if (!strategy) {
      return res.status(400).json({ error: 'Strategy name required' });
    }

    passport.authenticate(strategy, {
      failureRedirect: '/login?error=saml_failed',
      failureFlash: true
    })(req, res, next);
  });

  /**
   * POST /auth/sso/saml/callback
   * SAML assertion consumer service (ACS)
   */
  router.post('/saml/callback', (req: Request, res: Response, next) => {
    const strategy = req.query.strategy as string || req.body.RelayState;
    
    if (!strategy) {
      return res.status(400).json({ error: 'Strategy name required' });
    }

    passport.authenticate(strategy, {
      failureRedirect: '/login?error=saml_callback_failed',
      failureFlash: true
    })(req, res, async (err: any) => {
      if (err) {
        logger.error('SAML callback error', { error: err });
        return res.redirect('/login?error=authentication_failed');
      }

      const user = req.user as any;
      
      // 🔥 CRITICAL SECURITY FIX: Regenerate session to prevent session fixation
      // Old session ID could be hijacked before authentication
      if (req.session) {
        req.session.regenerate((err) => {
          if (err) {
            logger.error('Session regeneration failed', { error: err });
            return res.redirect('/login?error=session_failed');
          }
          
          // Store new session data after regeneration
          req.session.userId = user.id;
          req.session.email = user.email;
          req.session.orgId = user.org_id;
          req.session.authenticated = true;
        });
      }
      
      // 🔥 REALISTIC SECURITY: FAIL-HARD - No fallbacks, crash if env vars missing
      const jwtSecret = process.env.JWT_SECRET || process.env.SSO_JWT_SECRET;
      if (!jwtSecret || jwtSecret.length < 32) {
        throw new Error('JWT_SECRET or SSO_JWT_SECRET environment variable required (32+ characters)');
      }
      
      // Generate JWT token
      const token = jwt.sign(
        { 
          userId: user.id, 
          email: user.email, 
          orgId: user.org_id,
          ssoSessionId: user.ssoSessionId
        },
        jwtSecret,
        { expiresIn: '24h' }
      );

      // 🔥 CRITICAL SECURITY FIX: Set JWT token in secure cookie instead of URL
      // URL parameter exposure allowed token theft from browser history/referrers
      res.cookie('auth_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
      });

      // Set session cookie
      res.cookie('sso_session_id', user.ssoSessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
      });

      // 🔥 CRITICAL SECURITY FIX: Validate return URL to prevent open redirect attacks
      const returnUrl = req.session?.returnUrl || '/dashboard';
      
      // 🔥 REALISTIC SECURITY: Exact domain matching prevents ALL bypass attacks
      const allowedDomainsRegex = /^(localhost:3000|localhost:3001|localhost:3002|credlink\.com|app\.credlink\.com|dashboard\.credlink\.com)$/;
      
      let safeRedirectUrl = '/dashboard'; // Default safe fallback
      
      if (returnUrl && returnUrl !== '/') {
        try {
          const url = new URL(returnUrl, `http://${req.headers.host}`);
          const hostname = url.hostname + (url.port ? `:${url.port}` : '');
          
          // 🔥 CRITICAL: Exact domain match prevents 'evil-credlink.com.attacker.com' bypass
          if (allowedDomainsRegex.test(hostname)) {
            safeRedirectUrl = returnUrl;
          } else {
            logger.warn('Blocked malicious redirect attempt', { 
              returnUrl, 
              hostname,
              userAgent: req.get('User-Agent'),
              ip: req.ip 
            });
          }
        } catch (error) {
          logger.warn('Invalid return URL format', { returnUrl });
        }
      }
      
      res.redirect(safeRedirectUrl);
    });
  });

  /**
   * GET /auth/sso/oauth2/login
   * OAuth 2.0 authentication entry point
   */
  router.get('/oauth2/login', (req: Request, res: Response, next) => {
    const strategy = req.query.strategy as string;
    
    if (!strategy) {
      return res.status(400).json({ error: 'Strategy name required' });
    }

    passport.authenticate(strategy, {
      scope: ['openid', 'profile', 'email'],
      failureRedirect: '/login?error=oauth_failed'
    })(req, res, next);
  });

  /**
   * GET /auth/sso/oauth2/callback
   * OAuth 2.0 callback
   */
  router.get('/oauth2/callback', (req: Request, res: Response, next) => {
    const strategy = req.query.strategy as string || req.query.state as string;
    
    if (!strategy) {
      return res.status(400).json({ error: 'Strategy name required' });
    }

    passport.authenticate(strategy, {
      failureRedirect: '/login?error=oauth_callback_failed'
    })(req, res, async (err: any) => {
      if (err) {
        logger.error('OAuth callback error', { error: err });
        return res.redirect('/login?error=authentication_failed');
      }

      const user = req.user as any;
      
      // 🔥 CRITICAL SECURITY FIX: Regenerate session to prevent session fixation
      if (req.session) {
        req.session.regenerate((err) => {
          if (err) {
            logger.error('Session regeneration failed', { error: err });
            return res.redirect('/login?error=session_failed');
          }
          
          req.session.userId = user.id;
          req.session.email = user.email;
          req.session.orgId = user.org_id;
          req.session.authenticated = true;
        });
      }
      
      // 🔥 REALISTIC SECURITY: FAIL-HARD - No fallbacks, crash if env vars missing
      const jwtSecret = process.env.JWT_SECRET || process.env.SSO_JWT_SECRET;
      if (!jwtSecret || jwtSecret.length < 32) {
        throw new Error('JWT_SECRET or SSO_JWT_SECRET environment variable required (32+ characters)');
      }
      
      const token = jwt.sign(
        { 
          userId: user.id, 
          email: user.email, 
          orgId: user.org_id,
          ssoSessionId: user.ssoSessionId
        },
        jwtSecret,
        { expiresIn: '24h' }
      );

      res.cookie('sso_session_id', user.ssoSessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000
      });

      const returnUrl = req.session?.returnUrl || '/dashboard';
      // 🔥 CRITICAL SECURITY FIX: Set JWT token in secure cookie instead of URL
      res.cookie('auth_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000
      });
      res.redirect(returnUrl);
    });
  });

  /**
   * GET /auth/sso/google/login
   * Google OAuth entry point
   */
  router.get('/google/login', (req: Request, res: Response, next) => {
    const strategy = req.query.strategy as string;
    
    if (!strategy) {
      return res.status(400).json({ error: 'Strategy name required' });
    }

    passport.authenticate(strategy, {
      scope: ['openid', 'profile', 'email'],
      failureRedirect: '/login?error=google_failed'
    } as any)(req, res, next);
  });

  /**
   * GET /auth/sso/google/callback
   * Google OAuth callback
   */
  router.get('/google/callback', (req: Request, res: Response, next) => {
    const strategy = req.query.strategy as string || req.query.state as string;
    
    if (!strategy) {
      return res.status(400).json({ error: 'Strategy name required' });
    }

    passport.authenticate(strategy, {
      failureRedirect: '/login?error=google_callback_failed'
    })(req, res, async (err: any) => {
      if (err) {
        logger.error('Google callback error', { error: err });
        return res.redirect('/login?error=authentication_failed');
      }

      const user = req.user as any;
      
      // 🔥 CRITICAL SECURITY FIX: Regenerate session to prevent session fixation
      if (req.session) {
        req.session.regenerate((err) => {
          if (err) {
            logger.error('Session regeneration failed', { error: err });
            return res.redirect('/login?error=session_failed');
          }
          
          req.session.userId = user.id;
          req.session.email = user.email;
          req.session.orgId = user.org_id;
          req.session.authenticated = true;
        });
      }
      
      // 🔥 REALISTIC SECURITY: FAIL-HARD - No fallbacks, crash if env vars missing
      const jwtSecret = process.env.JWT_SECRET || process.env.SSO_JWT_SECRET;
      if (!jwtSecret || jwtSecret.length < 32) {
        throw new Error('JWT_SECRET or SSO_JWT_SECRET environment variable required (32+ characters)');
      }
      
      const token = jwt.sign(
        { 
          userId: user.id, 
          email: user.email, 
          orgId: user.org_id,
          ssoSessionId: user.ssoSessionId
        },
        jwtSecret,
        { expiresIn: '24h' }
      );

      res.cookie('sso_session_id', user.ssoSessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000
      });

      const returnUrl = req.session?.returnUrl || '/dashboard';
      // 🔥 CRITICAL SECURITY FIX: Set JWT token in secure cookie instead of URL
      res.cookie('auth_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000
      });
      res.redirect(returnUrl);
    });
  });

  /**
   * GET /auth/sso/azure/login
   * Azure AD OIDC entry point
   */
  router.get('/azure/login', (req: Request, res: Response, next) => {
    const strategy = req.query.strategy as string;
    
    if (!strategy) {
      return res.status(400).json({ error: 'Strategy name required' });
    }

    passport.authenticate(strategy, {
      failureRedirect: '/login?error=azure_failed'
    })(req, res, next);
  });

  /**
   * POST /auth/sso/azure/callback
   * Azure AD OIDC callback
   */
  router.post('/azure/callback', (req: Request, res: Response, next) => {
    const strategy = req.query.strategy as string || req.body.state;
    
    if (!strategy) {
      return res.status(400).json({ error: 'Strategy name required' });
    }

    passport.authenticate(strategy, {
      failureRedirect: '/login?error=azure_callback_failed'
    })(req, res, async (err: any) => {
      if (err) {
        logger.error('Azure AD callback error', { error: err });
        return res.redirect('/login?error=authentication_failed');
      }

      const user = req.user as any;
      
      // 🔥 CRITICAL SECURITY FIX: Regenerate session to prevent session fixation
      if (req.session) {
        req.session.regenerate((err) => {
          if (err) {
            logger.error('Session regeneration failed', { error: err });
            return res.redirect('/login?error=session_failed');
          }
          
          req.session.userId = user.id;
          req.session.email = user.email;
          req.session.orgId = user.org_id;
          req.session.authenticated = true;
        });
      }
      
      // 🔥 REALISTIC SECURITY: FAIL-HARD - No fallbacks, crash if env vars missing
      const jwtSecret = process.env.JWT_SECRET || process.env.SSO_JWT_SECRET;
      if (!jwtSecret || jwtSecret.length < 32) {
        throw new Error('JWT_SECRET or SSO_JWT_SECRET environment variable required (32+ characters)');
      }
      
      const token = jwt.sign(
        { 
          userId: user.id, 
          email: user.email, 
          orgId: user.org_id,
          ssoSessionId: user.ssoSessionId
        },
        jwtSecret,
        { expiresIn: '24h' }
      );

      res.cookie('sso_session_id', user.ssoSessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000
      });

      const returnUrl = req.session?.returnUrl || '/dashboard';
      // 🔥 CRITICAL SECURITY FIX: Set JWT token in secure cookie instead of URL
      res.cookie('auth_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000
      });
      res.redirect(returnUrl);
    });
  });

  /**
   * POST /auth/sso/logout
   * SSO logout (with SLO support)
   */
  router.post('/logout', async (req: Request, res: Response) => {
    try {
      const sessionId = req.headers['x-sso-session-id'] as string || req.cookies?.sso_session_id;
      
      if (!sessionId) {
        return res.status(400).json({ error: 'Session ID required' });
      }

      const session = await ssoService.getSession(sessionId);
      
      if (session) {
        // Get provider for SLO
        const provider = await ssoService.getProvider(session.orgId);
        
        // Delete session
        await ssoService.deleteSession(sessionId);
        
        // Log logout
        await ssoService.logAudit({
          orgId: session.orgId,
          providerId: session.providerId,
          userId: session.userId,
          eventType: 'logout',
          eventStatus: 'success',
          eventMessage: 'User logged out'
        });

        // Clear cookie
        res.clearCookie('sso_session_id');
        
        // If SAML with SLO, redirect to IdP logout
        if (provider && provider.providerType === 'saml' && provider.samlLogoutUrl && session.nameId) {
          const strategyName = `saml-${provider.orgId}-${provider.providerName}`;
          
          return passport.authenticate(strategyName)(req, res);
        }
      }

      res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
      logger.error('SSO logout failed', { error });
      res.status(500).json({ error: 'Logout failed' });
    }
  });

  /**
   * GET /auth/sso/metadata/:orgId/:providerName
   * SAML SP metadata endpoint
   */
  router.get('/metadata/:orgId/:providerName', async (req: Request, res: Response) => {
    try {
      const { orgId, providerName } = req.params;
      
      const provider = await ssoService.getProvider(orgId, providerName);
      
      if (!provider || provider.providerType !== 'saml') {
        return res.status(404).json({ error: 'SAML provider not found' });
      }

      // Generate SAML SP metadata
      const metadata = `<?xml version="1.0"?>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata"
                  entityID="${process.env.API_URL}/auth/sso/metadata/${orgId}/${providerName}">
  <SPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</NameIDFormat>
    <AssertionConsumerService 
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
      Location="${provider.samlCallbackUrl || `${process.env.API_URL}/auth/sso/saml/callback`}"
      index="0" />
  </SPSSODescriptor>
</EntityDescriptor>`;

      res.set('Content-Type', 'application/xml');
      res.send(metadata);
    } catch (error) {
      logger.error('Failed to generate SAML metadata', { error });
      res.status(500).json({ error: 'Failed to generate metadata' });
    }
  });

  /**
   * GET /auth/sso/session
   * Get current SSO session info
   */
  router.get('/session', ssoAuth.requireSSOAuth, async (req: any, res: Response) => {
    try {
      res.json({
        user: {
          id: req.ssoUser.id,
          email: req.ssoUser.email,
          firstName: req.ssoUser.first_name,
          lastName: req.ssoUser.last_name,
          displayName: req.ssoUser.display_name,
          orgId: req.ssoUser.org_id,
          role: req.ssoUser.role
        },
        session: {
          id: req.ssoSession.sessionId,
          authMethod: req.ssoSession.authMethod,
          authTime: req.ssoSession.authTime,
          expiresAt: req.ssoSession.expiresAt
        }
      });
    } catch (error) {
      logger.error('Failed to get SSO session', { error });
      res.status(500).json({ error: 'Failed to retrieve session' });
    }
  });

  return router;
}

export default createSSORouter;
