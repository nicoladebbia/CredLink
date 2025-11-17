/**
 * API Key Management Routes
 * STEP 7: CRED-007 - API Key Rotation Mechanism
 */

import { Router, Request, Response, NextFunction } from 'express';
import { ApiKeyService, CreateApiKeyOptions } from '../services/api-key-service';
import { logger } from '../utils/logger';
import { requirePermission } from '../middleware/rbac-auth';

const router = Router();

interface AuthenticatedRequest extends Request {
  clientId?: string;
  clientName?: string;
}

/**
 * Create a new API key
 * POST /api-keys
 */
router.post('/', requirePermission('create', 'api_key'), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { clientId, clientName, rotationIntervalHours, expiresAt } = req.body;

    if (!clientId || !clientName) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'clientId and clientName are required'
      });
      return;
    }

    const options: CreateApiKeyOptions = {
      clientId,
      clientName,
      rotationIntervalHours,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      createdBy: req.clientId || 'system'
    };

    const apiKeyService = req.app.get('apiKeyService') as ApiKeyService;
    if (!apiKeyService) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'API key service not available'
      });
      return;
    }

    const result = await apiKeyService.createApiKey(options);

    logger.info('API key created', {
      keyId: result.keyId,
      clientId: result.clientId,
      createdBy: req.clientId
    });

    res.status(201).json({
      keyId: result.keyId,
      apiKey: result.apiKey, // Only returned during creation
      clientId: result.clientId,
      clientName: result.clientName,
      version: result.version,
      expiresAt: result.expiresAt,
      rotationIntervalHours: result.rotationIntervalHours,
      createdAt: result.createdAt
    });
  } catch (error) {
    logger.error('Failed to create API key', { 
      error: error instanceof Error ? error.message : String(error),
      clientId: req.body.clientId
    });
    next(error);
  }
});

/**
 * Rotate an existing API key
 * POST /api-keys/rotate
 */
router.post('/rotate', requirePermission('rotate', 'api_key'), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { clientId } = req.body;

    if (!clientId) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'clientId is required'
      });
      return;
    }

    const apiKeyService = req.app.get('apiKeyService') as ApiKeyService;
    if (!apiKeyService) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'API key service not available'
      });
      return;
    }

    const result = await apiKeyService.rotateApiKey(clientId, req.clientId);

    if (!result) {
      res.status(404).json({
        error: 'Not Found',
        message: 'No active API key found for this client'
      });
      return;
    }

    logger.info('API key rotated', {
      keyId: result.keyId,
      clientId: result.clientId,
      rotatedBy: req.clientId
    });

    res.json({
      keyId: result.keyId,
      apiKey: result.apiKey, // Only returned during rotation
      clientId: result.clientId,
      clientName: result.clientName,
      version: result.version,
      expiresAt: result.expiresAt,
      rotationIntervalHours: result.rotationIntervalHours,
      createdAt: result.createdAt
    });
  } catch (error) {
    logger.error('Failed to rotate API key', { 
      error: error instanceof Error ? error.message : String(error),
      clientId: req.body.clientId
    });
    next(error);
  }
});

/**
 * Revoke an API key
 * DELETE /api-keys/:keyId
 */
router.delete('/:keyId', requirePermission('revoke', 'api_key'), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { keyId } = req.params;

    const apiKeyService = req.app.get('apiKeyService') as ApiKeyService;
    if (!apiKeyService) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'API key service not available'
      });
      return;
    }

    const success = await apiKeyService.revokeApiKey(keyId, req.clientId);

    if (!success) {
      res.status(404).json({
        error: 'Not Found',
        message: 'API key not found or already inactive'
      });
      return;
    }

    logger.info('API key revoked', {
      keyId,
      revokedBy: req.clientId
    });

    res.json({
      message: 'API key revoked successfully',
      keyId
    });
  } catch (error) {
    logger.error('Failed to revoke API key', { 
      error: error instanceof Error ? error.message : String(error),
      keyId: req.params.keyId
    });
    next(error);
  }
});

/**
 * Get keys that need rotation soon
 * GET /api-keys/rotation-needed?hours=:hours
 * MUST COME BEFORE /:keyId route to avoid parameter conflicts
 */
router.get('/rotation-needed', requirePermission('read', 'api_key'), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const hours = parseInt(req.query.hours as string) || 72; // Default 72 hours

    const apiKeyService = req.app.get('apiKeyService') as ApiKeyService;
    if (!apiKeyService) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'API key service not available'
      });
      return;
    }

    const keysNeedingRotation = await apiKeyService.getKeysNeedingRotation(hours);

    res.json({
      hoursThreshold: hours,
      keysNeedingRotation: keysNeedingRotation.map(key => ({
        keyId: key.keyId,
        clientId: key.clientId,
        clientName: key.clientName,
        version: key.version,
        expiresAt: key.expiresAt,
        lastUsedAt: key.lastUsedAt,
        rotationIntervalHours: key.rotationIntervalHours
      }))
    });
  } catch (error) {
    logger.error('Failed to get keys needing rotation', { 
      error: error instanceof Error ? error.message : String(error)
    });
    next(error);
  }
});

/**
 * Get API key information
 * GET /api-keys/:keyId
 */
router.get('/:keyId', requirePermission('read', 'api_key'), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { keyId } = req.params;

    const apiKeyService = req.app.get('apiKeyService') as ApiKeyService;
    if (!apiKeyService) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'API key service not available'
      });
      return;
    }

    const apiKeyInfo = await apiKeyService.getApiKey(keyId);

    if (!apiKeyInfo) {
      res.status(404).json({
        error: 'Not Found',
        message: 'API key not found'
      });
      return;
    }

    res.json({
      keyId: apiKeyInfo.keyId,
      clientId: apiKeyInfo.clientId,
      clientName: apiKeyInfo.clientName,
      version: apiKeyInfo.version,
      isActive: apiKeyInfo.isActive,
      expiresAt: apiKeyInfo.expiresAt,
      createdAt: apiKeyInfo.createdAt,
      updatedAt: apiKeyInfo.updatedAt,
      lastUsedAt: apiKeyInfo.lastUsedAt,
      rotationIntervalHours: apiKeyInfo.rotationIntervalHours
    });
  } catch (error) {
    logger.error('Failed to get API key', { 
      error: error instanceof Error ? error.message : String(error),
      keyId: req.params.keyId
    });
    next(error);
  }
});

/**
 * List API keys for a client
 * GET /api-keys?clientId=:clientId
 */
router.get('/', requirePermission('read', 'api_key'), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { clientId } = req.query;

    if (!clientId || typeof clientId !== 'string') {
      res.status(400).json({
        error: 'Bad Request',
        message: 'clientId query parameter is required'
      });
      return;
    }

    const apiKeyService = req.app.get('apiKeyService') as ApiKeyService;
    if (!apiKeyService) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'API key service not available'
      });
      return;
    }

    const apiKeys = await apiKeyService.listApiKeys(clientId);

    res.json({
      clientId,
      apiKeys: apiKeys.map(key => ({
        keyId: key.keyId,
        clientName: key.clientName,
        version: key.version,
        isActive: key.isActive,
        expiresAt: key.expiresAt,
        createdAt: key.createdAt,
        updatedAt: key.updatedAt,
        lastUsedAt: key.lastUsedAt,
        rotationIntervalHours: key.rotationIntervalHours
      }))
    });
  } catch (error) {
    logger.error('Failed to list API keys', { 
      error: error instanceof Error ? error.message : String(error),
      clientId: req.query.clientId
    });
    next(error);
  }
});

/**
 * Clean up expired keys
 * POST /api-keys/cleanup-expired
 */
router.post('/cleanup-expired', requirePermission('delete', 'api_key'), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const apiKeyService = req.app.get('apiKeyService') as ApiKeyService;
    if (!apiKeyService) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'API key service not available'
      });
      return;
    }

    const deactivatedCount = await apiKeyService.cleanupExpiredKeys();

    logger.info('Expired keys cleanup performed', {
      deactivatedCount,
      performedBy: req.clientId
    });

    res.json({
      message: 'Expired keys cleaned up successfully',
      deactivatedCount
    });
  } catch (error) {
    logger.error('Failed to cleanup expired keys', { 
      error: error instanceof Error ? error.message : String(error)
    });
    next(error);
  }
});

export default router;
