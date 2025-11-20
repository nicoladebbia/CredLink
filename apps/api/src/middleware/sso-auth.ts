// @ts-nocheck
/**
 * SSO Authentication Middleware
 * Handles SAML, OAuth 2.0, OIDC authentication flows
 */

import { Request, Response, NextFunction } from 'express';
import passport from 'passport';
import { Strategy as SamlStrategy, Profile as SamlProfile, VerifiedCallback } from 'passport-saml';
import { Strategy as OAuth2Strategy } from 'passport-oauth2';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { OIDCStrategy, IProfile as OIDCProfile } from 'passport-azure-ad';

// Type definitions for missing modules
type VerifyCallback = (err: Error | null, user?: any, info?: any) => void;
type OIDCVerifyCallback = (err: Error | null, user?: any) => void;
type GoogleProfile = any;
import { Pool } from 'pg';
import { SSOService, SSOProvider } from '../services/sso-service';
import { logger } from '../utils/logger';
import crypto from 'crypto';

export interface SSOAuthRequest extends Request {
  ssoUser?: any;
  ssoProvider?: SSOProvider;
  ssoSession?: any;
}

export class SSOAuthMiddleware {
  private ssoService: SSOService;
  private pool: Pool;
  private strategies: Map<string, any> = new Map();

  constructor(pool: Pool) {
    this.pool = pool;
    this.ssoService = new SSOService(pool);
    
    // Initialize passport
    this.initializePassport();
  }

  /**
   * Initialize Passport.js
   */
  private initializePassport(): void {
    // Serialize user for session
    passport.serializeUser((user: any, done: (err: any, id?: any) => void) => {
      done(null, user.id);
    });

    // Deserialize user from session
    passport.deserializeUser(async (id: string, done: (err: any, user?: any) => void) => {
      try {
        const result = await this.pool.query('SELECT * FROM users WHERE id = $1', [id]);
        done(null, result.rows[0] || null);
      } catch (error) {
        done(error, null);
      }
    });
  }

  /**
   * Configure SAML strategy for an organization
   */
  async configureSamlStrategy(provider: SSOProvider): Promise<void> {
    if (!provider.samlEntryPoint || !provider.samlIssuer || !provider.samlCert) {
      throw new Error('SAML configuration incomplete');
    }

    const strategyName = `saml-${provider.orgId}-${provider.providerName}`;
    
    const strategy = new SamlStrategy(
      {
        entryPoint: provider.samlEntryPoint,
        issuer: provider.samlIssuer,
        cert: provider.samlCert,
        callbackUrl: provider.samlCallbackUrl || `${process.env.API_URL}/auth/sso/saml/callback`,
        logoutUrl: provider.samlLogoutUrl,
        authnContext: provider.samlAuthnContext || ['urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport'],
        signatureAlgorithm: (provider.samlSignatureAlgorithm || 'sha256') as 'sha1' | 'sha256' | 'sha512',
        wantAssertionsSigned: provider.samlWantAssertionsSigned !== false,
        acceptedClockSkewMs: 5000,
        identifierFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
        passReqToCallback: true
      },
      async (req: Request, profile: SamlProfile, done: VerifiedCallback) => {
        try {
          logger.info('SAML authentication callback', { 
            nameID: profile.nameID,
            issuer: profile.issuer 
          });

          // Map SAML attributes to user
          const ssoUser = this.ssoService.mapAttributes(profile, provider.attributeMapping);
          
          // Provision user via JIT
          const user = await this.ssoService.provisionUser(provider, ssoUser);
          
          // Create SSO session
          const sessionId = crypto.randomUUID();
          const expiresAt = new Date(Date.now() + provider.sessionLifetimeHours * 60 * 60 * 1000);
          
          await this.ssoService.createSession({
            sessionId,
            providerId: provider.id,
            userId: user.id,
            orgId: provider.orgId,
            nameId: profile.nameID,
            sessionIndex: profile.sessionIndex,
            authMethod: 'saml',
            authTime: new Date(),
            expiresAt
          });
          
          // Log successful authentication
          await this.ssoService.logAudit({
            orgId: provider.orgId,
            providerId: provider.id,
            userId: user.id,
            eventType: 'login',
            eventStatus: 'success',
            eventMessage: 'SAML authentication successful',
            eventData: { nameID: profile.nameID }
          });
          
          done(null, { ...user, ssoSessionId: sessionId });
        } catch (error) {
          logger.error('SAML authentication failed', { error });
          
          await this.ssoService.logAudit({
            orgId: provider.orgId,
            providerId: provider.id,
            eventType: 'login',
            eventStatus: 'error',
            eventMessage: 'SAML authentication failed',
            errorDetails: { error: error instanceof Error ? error.message : String(error) }
          });
          
          done(error as Error);
        }
      }
    );

    passport.use(strategyName, strategy);
    this.strategies.set(strategyName, strategy);
    
    logger.info('SAML strategy configured', { orgId: provider.orgId, providerName: provider.providerName });
  }

  /**
   * Configure OAuth 2.0 strategy
   */
  async configureOAuth2Strategy(provider: SSOProvider): Promise<void> {
    if (!provider.oauthClientId || !provider.oauthClientSecret || !provider.oauthAuthorizationUrl || !provider.oauthTokenUrl) {
      throw new Error('OAuth 2.0 configuration incomplete');
    }

    const strategyName = `oauth2-${provider.orgId}-${provider.providerName}`;
    
    const strategy = new OAuth2Strategy(
      {
        authorizationURL: provider.oauthAuthorizationUrl,
        tokenURL: provider.oauthTokenUrl,
        clientID: provider.oauthClientId,
        clientSecret: provider.oauthClientSecret,
        callbackURL: `${process.env.API_URL}/auth/sso/oauth2/callback`,
        scope: provider.oauthScope || ['openid', 'profile', 'email'],
        passReqToCallback: true,
        pkce: provider.oauthPkceEnabled !== false
      },
      async (req: Request, accessToken: string, refreshToken: string, params: any, profile: any, done: VerifyCallback) => {
        try {
          // Fetch user info if URL provided
          let userProfile = profile;
          if (provider.oauthUserInfoUrl && !profile.id) {
            const response = await fetch(provider.oauthUserInfoUrl, {
              headers: { Authorization: `Bearer ${accessToken}` }
            });
            userProfile = await response.json();
          }

          // Map OAuth attributes to user
          const ssoUser = this.ssoService.mapAttributes(userProfile, provider.attributeMapping);
          
          // Provision user via JIT
          const user = await this.ssoService.provisionUser(provider, ssoUser);
          
          // Create SSO session with tokens
          const sessionId = crypto.randomUUID();
          const expiresAt = new Date(Date.now() + provider.sessionLifetimeHours * 60 * 60 * 1000);
          const tokenExpiresAt = params.expires_in ? new Date(Date.now() + params.expires_in * 1000) : undefined;
          
          await this.ssoService.createSession({
            sessionId,
            providerId: provider.id,
            userId: user.id,
            orgId: provider.orgId,
            authMethod: 'oauth2',
            authTime: new Date(),
            accessToken,
            refreshToken,
            idToken: params.id_token,
            tokenExpiresAt,
            expiresAt
          });
          
          await this.ssoService.logAudit({
            orgId: provider.orgId,
            providerId: provider.id,
            userId: user.id,
            eventType: 'login',
            eventStatus: 'success',
            eventMessage: 'OAuth 2.0 authentication successful'
          });
          
          done(null, { ...user, ssoSessionId: sessionId });
        } catch (error) {
          logger.error('OAuth 2.0 authentication failed', { error });
          
          await this.ssoService.logAudit({
            orgId: provider.orgId,
            providerId: provider.id,
            eventType: 'login',
            eventStatus: 'error',
            eventMessage: 'OAuth 2.0 authentication failed',
            errorDetails: { error: error instanceof Error ? error.message : String(error) }
          });
          
          done(error as Error);
        }
      }
    );

    passport.use(strategyName, strategy);
    this.strategies.set(strategyName, strategy);
    
    logger.info('OAuth 2.0 strategy configured', { orgId: provider.orgId, providerName: provider.providerName });
  }

  /**
   * Configure Google OAuth strategy
   */
  async configureGoogleStrategy(provider: SSOProvider): Promise<void> {
    if (!provider.oauthClientId || !provider.oauthClientSecret) {
      throw new Error('Google OAuth configuration incomplete');
    }

    const strategyName = `google-${provider.orgId}-${provider.providerName}`;
    
    const strategy = new GoogleStrategy(
      {
        clientID: provider.oauthClientId,
        clientSecret: provider.oauthClientSecret,
        callbackURL: `${process.env.API_URL}/auth/sso/google/callback`,
        scope: provider.oauthScope || ['openid', 'profile', 'email'],
        hd: provider.googleHd, // Hosted domain restriction
        passReqToCallback: true
      },
      async (req: Request, accessToken: string, refreshToken: string, profile: GoogleProfile, done: VerifyCallback) => {
        try {
          // Map Google profile to user
          const ssoUser = this.ssoService.mapAttributes({
            email: profile.emails?.[0]?.value,
            given_name: profile.name?.givenName,
            family_name: profile.name?.familyName,
            name: profile.displayName,
            picture: profile.photos?.[0]?.value
          }, provider.attributeMapping);
          
          // Provision user via JIT
          const user = await this.ssoService.provisionUser(provider, ssoUser);
          
          // Create SSO session
          const sessionId = crypto.randomUUID();
          const expiresAt = new Date(Date.now() + provider.sessionLifetimeHours * 60 * 60 * 1000);
          
          await this.ssoService.createSession({
            sessionId,
            providerId: provider.id,
            userId: user.id,
            orgId: provider.orgId,
            authMethod: 'google',
            authTime: new Date(),
            accessToken,
            refreshToken,
            expiresAt
          });
          
          await this.ssoService.logAudit({
            orgId: provider.orgId,
            providerId: provider.id,
            userId: user.id,
            eventType: 'login',
            eventStatus: 'success',
            eventMessage: 'Google authentication successful'
          });
          
          done(null, { ...user, ssoSessionId: sessionId });
        } catch (error) {
          logger.error('Google authentication failed', { error });
          
          await this.ssoService.logAudit({
            orgId: provider.orgId,
            providerId: provider.id,
            eventType: 'login',
            eventStatus: 'error',
            eventMessage: 'Google authentication failed',
            errorDetails: { error: error instanceof Error ? error.message : String(error) }
          });
          
          done(error as Error);
        }
      }
    );

    passport.use(strategyName, strategy);
    this.strategies.set(strategyName, strategy);
    
    logger.info('Google OAuth strategy configured', { orgId: provider.orgId, providerName: provider.providerName });
  }

  /**
   * Configure Azure AD OIDC strategy
   */
  async configureAzureADStrategy(provider: SSOProvider): Promise<void> {
    if (!provider.oauthClientId || !provider.oauthClientSecret || !provider.azureTenantId) {
      throw new Error('Azure AD configuration incomplete');
    }

    const strategyName = `azure-ad-${provider.orgId}-${provider.providerName}`;
    
    const strategy = new OIDCStrategy(
      {
        identityMetadata: `https://login.microsoftonline.com/${provider.azureTenantId}/v2.0/.well-known/openid-configuration`,
        clientID: provider.oauthClientId,
        clientSecret: provider.oauthClientSecret,
        responseType: 'code',
        responseMode: 'form_post',
        redirectUrl: `${process.env.API_URL}/auth/sso/azure/callback`,
        allowHttpForRedirectUrl: process.env.NODE_ENV === 'development',
        scope: provider.oauthScope || ['openid', 'profile', 'email'],
        passReqToCallback: true,
        validateIssuer: true,
        isB2C: !!provider.azurePolicyName,
        policyName: provider.azurePolicyName
      },
      async (req: Request, iss: string, sub: string, profile: OIDCProfile, accessToken: string, refreshToken: string, done: OIDCVerifyCallback) => {
        try {
          // Map Azure AD profile to user
          const ssoUser = this.ssoService.mapAttributes(profile._json, provider.attributeMapping);
          
          // Provision user via JIT
          const user = await this.ssoService.provisionUser(provider, ssoUser);
          
          // Create SSO session
          const sessionId = crypto.randomUUID();
          const expiresAt = new Date(Date.now() + provider.sessionLifetimeHours * 60 * 60 * 1000);
          
          await this.ssoService.createSession({
            sessionId,
            providerId: provider.id,
            userId: user.id,
            orgId: provider.orgId,
            authMethod: 'azure-ad',
            authTime: new Date(),
            accessToken,
            refreshToken,
            expiresAt
          });
          
          await this.ssoService.logAudit({
            orgId: provider.orgId,
            providerId: provider.id,
            userId: user.id,
            eventType: 'login',
            eventStatus: 'success',
            eventMessage: 'Azure AD authentication successful'
          });
          
          done(null, { ...user, ssoSessionId: sessionId });
        } catch (error) {
          logger.error('Azure AD authentication failed', { error });
          
          await this.ssoService.logAudit({
            orgId: provider.orgId,
            providerId: provider.id,
            eventType: 'login',
            eventStatus: 'error',
            eventMessage: 'Azure AD authentication failed',
            errorDetails: { error: error instanceof Error ? error.message : String(error) }
          });
          
          done(error as Error);
        }
      }
    );

    passport.use(strategyName, strategy);
    this.strategies.set(strategyName, strategy);
    
    logger.info('Azure AD OIDC strategy configured', { orgId: provider.orgId, providerName: provider.providerName });
  }

  /**
   * Initialize SSO provider strategy dynamically
   */
  async initializeProvider(orgId: string, providerName?: string): Promise<SSOProvider> {
    const provider = await this.ssoService.getProvider(orgId, providerName);
    
    if (!provider) {
      throw new Error(`SSO provider not found for organization: ${orgId}`);
    }
    
    if (!provider.enabled) {
      throw new Error(`SSO provider is disabled: ${provider.providerName}`);
    }

    const strategyKey = `${provider.providerType}-${provider.orgId}-${provider.providerName}`;
    
    // Skip if already configured
    if (this.strategies.has(strategyKey)) {
      return provider;
    }

    // Configure strategy based on type
    switch (provider.providerType) {
      case 'saml':
        await this.configureSamlStrategy(provider);
        break;
      case 'oauth2':
        await this.configureOAuth2Strategy(provider);
        break;
      case 'google':
        await this.configureGoogleStrategy(provider);
        break;
      case 'azure-ad':
        await this.configureAzureADStrategy(provider);
        break;
      default:
        throw new Error(`Unsupported SSO provider type: ${provider.providerType}`);
    }

    return provider;
  }

  /**
   * Middleware to require SSO authentication
   */
  requireSSOAuth = async (req: SSOAuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const sessionId = req.headers['x-sso-session-id'] as string || req.cookies?.sso_session_id;
      
      if (!sessionId) {
        res.status(401).json({ error: 'SSO session required' });
        return;
      }

      const session = await this.ssoService.getSession(sessionId);
      
      if (!session) {
        res.status(401).json({ error: 'Invalid or expired SSO session' });
        return;
      }

      // Attach session to request
      req.ssoSession = session;
      
      // Fetch user
      const userResult = await this.pool.query('SELECT * FROM users WHERE id = $1', [session.userId]);
      
      if (userResult.rows.length === 0) {
        res.status(401).json({ error: 'User not found' });
        return;
      }

      req.ssoUser = userResult.rows[0];
      
      next();
    } catch (error) {
      logger.error('SSO authentication failed', { error });
      res.status(500).json({ error: 'Authentication failed' });
    }
  };

  /**
   * Get passport instance
   */
  getPassport(): typeof passport {
    return passport;
  }
}
