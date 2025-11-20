/**
 * Certificate Rotation Management Routes
 * STEP 8: CRED-008 - Certificate Atomic Rotation
 */

import { Router, Request, Response, NextFunction } from 'express';
import { AtomicCertificateManager, CertificateRotationResult } from '../services/certificate-manager-atomic';
import { logger } from '../utils/logger';
import { requirePermission } from '../middleware/rbac-auth';

const router: Router = Router();

interface AuthenticatedRequest extends Request {
  clientId?: string;
  clientName?: string;
}

/**
 * Get current certificate information
 * GET /certificates/current
 */
router.get('/current', requirePermission('read', 'certificate'), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const certificateManager = req.app.get('certificateManager') as AtomicCertificateManager;
    if (!certificateManager) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Certificate manager not available'
      });
      return;
    }

    const currentCertificate = await certificateManager.getCurrentCertificate();

    logger.info('Current certificate retrieved', {
      certificateId: currentCertificate.id,
      version: currentCertificate.version,
      clientId: req.clientId
    });

    res.json({
      id: currentCertificate.id,
      fingerprint: currentCertificate.fingerprint,
      expiresAt: currentCertificate.expiresAt,
      version: currentCertificate.version,
      // Don't return the PEM certificate for security reasons
    });
  } catch (error) {
    logger.error('Failed to get current certificate', { 
      error: error instanceof Error ? error.message : String(error),
      clientId: req.clientId
    });
    next(error);
  }
});

/**
 * Get certificate rotation status
 * GET /certificates/status
 */
router.get('/status', requirePermission('read', 'certificate'), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const certificateManager = req.app.get('certificateManager') as AtomicCertificateManager;
    if (!certificateManager) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Certificate manager not available'
      });
      return;
    }

    const status = certificateManager.getRotationStatus();

    logger.info('Certificate status retrieved', {
      rotationInProgress: status.rotationInProgress,
      hasCurrentCertificate: !!status.currentCertificate,
      hasPreviousCertificate: !!status.previousCertificate,
      clientId: req.clientId
    });

    res.json({
      rotationInProgress: status.rotationInProgress,
      currentCertificate: status.currentCertificate ? {
        id: status.currentCertificate.id,
        fingerprint: status.currentCertificate.fingerprint,
        expiresAt: status.currentCertificate.expiresAt,
        version: status.currentCertificate.version
      } : null,
      previousCertificate: status.previousCertificate ? {
        id: status.previousCertificate.id,
        fingerprint: status.previousCertificate.fingerprint,
        expiresAt: status.previousCertificate.expiresAt,
        version: status.previousCertificate.version
      } : null
    });
  } catch (error) {
    logger.error('Failed to get certificate status', { 
      error: error instanceof Error ? error.message : String(error),
      clientId: req.clientId
    });
    next(error);
  }
});

/**
 * Rotate certificate atomically
 * POST /certificates/rotate
 */
router.post('/rotate', requirePermission('rotate', 'certificate'), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const certificateManager = req.app.get('certificateManager') as AtomicCertificateManager;
    if (!certificateManager) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Certificate manager not available'
      });
      return;
    }

    const result: CertificateRotationResult = await certificateManager.rotateCertificate();

    logger.info('Certificate rotation completed', {
      success: result.success,
      oldCertificateId: result.oldCertificate?.id,
      newCertificateId: result.newCertificate?.id,
      error: result.error,
      rollbackSuccessful: result.rollbackSuccessful,
      performedBy: req.clientId
    });

    if (result.success) {
      res.json({
        success: true,
        message: 'Certificate rotation completed successfully',
        oldCertificate: {
          id: result.oldCertificate!.id,
          fingerprint: result.oldCertificate!.fingerprint,
          expiresAt: result.oldCertificate!.expiresAt,
          version: result.oldCertificate!.version
        },
        newCertificate: {
          id: result.newCertificate!.id,
          fingerprint: result.newCertificate!.fingerprint,
          expiresAt: result.newCertificate!.expiresAt,
          version: result.newCertificate!.version
        }
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Certificate rotation failed',
        error: result.error,
        rollbackSuccessful: result.rollbackSuccessful,
        oldCertificate: result.oldCertificate ? {
          id: result.oldCertificate.id,
          fingerprint: result.oldCertificate.fingerprint,
          expiresAt: result.oldCertificate.expiresAt,
          version: result.oldCertificate.version
        } : null
      });
    }
  } catch (error) {
    logger.error('Failed to rotate certificate', { 
      error: error instanceof Error ? error.message : String(error),
      clientId: req.clientId
    });
    next(error);
  }
});

/**
 * Rollback certificate to previous version
 * POST /certificates/rollback
 */
router.post('/rollback', requirePermission('rollback', 'certificate'), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const certificateManager = req.app.get('certificateManager') as AtomicCertificateManager;
    if (!certificateManager) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Certificate manager not available'
      });
      return;
    }

    const rollbackSuccessful = await certificateManager.rollbackCertificate();

    logger.info('Certificate rollback completed', {
      success: rollbackSuccessful,
      performedBy: req.clientId
    });

    if (rollbackSuccessful) {
      res.json({
        success: true,
        message: 'Certificate rollback completed successfully'
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Certificate rollback failed - no previous certificate available'
      });
    }
  } catch (error) {
    logger.error('Failed to rollback certificate', { 
      error: error instanceof Error ? error.message : String(error),
      clientId: req.clientId
    });
    next(error);
  }
});

/**
 * Validate current certificate
 * GET /certificates/validate
 */
router.get('/validate', requirePermission('read', 'certificate'), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const certificateManager = req.app.get('certificateManager') as AtomicCertificateManager;
    if (!certificateManager) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Certificate manager not available'
      });
      return;
    }

    const currentCertificate = await certificateManager.getCurrentCertificate();
    
    // Check if certificate is expired
    const isExpired = new Date() > currentCertificate.expiresAt;
    
    // Check if certificate is near expiration (within 7 days)
    const sevenDaysFromNow = new Date(Date.now() + (7 * 24 * 60 * 60 * 1000));
    const isNearExpiration = currentCertificate.expiresAt < sevenDaysFromNow;
    
    // Calculate days until expiration
    const daysUntilExpiration = Math.ceil(
      (currentCertificate.expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
    );

    logger.info('Certificate validation completed', {
      certificateId: currentCertificate.id,
      version: currentCertificate.version,
      isExpired,
      isNearExpiration,
      daysUntilExpiration,
      clientId: req.clientId
    });

    res.json({
      valid: !isExpired,
      expired: isExpired,
      nearExpiration: isNearExpiration,
      daysUntilExpiration,
      expiresAt: currentCertificate.expiresAt,
      certificate: {
        id: currentCertificate.id,
        fingerprint: currentCertificate.fingerprint,
        version: currentCertificate.version
      }
    });
  } catch (error) {
    logger.error('Failed to validate certificate', { 
      error: error instanceof Error ? error.message : String(error),
      clientId: req.clientId
    });
    next(error);
  }
});

/**
 * Perform comprehensive certificate health check
 * GET /certificates/health
 */
router.get('/health', requirePermission('read', 'certificate'), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const certificateManager = req.app.get('certificateManager') as AtomicCertificateManager;
    if (!certificateManager) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Certificate manager not available'
      });
      return;
    }

    const healthResult = await certificateManager.performHealthCheck();

    logger.info('Certificate health check completed', {
      healthy: healthResult.healthy,
      issuesCount: healthResult.issues.length,
      timeUntilExpiry: healthResult.timeUntilExpiry,
      clientId: req.clientId
    });

    res.json({
      healthy: healthResult.healthy,
      certificate: healthResult.certificate ? {
        id: healthResult.certificate.id,
        fingerprint: healthResult.certificate.fingerprint,
        expiresAt: healthResult.certificate.expiresAt,
        version: healthResult.certificate.version
      } : null,
      issues: healthResult.issues,
      timeUntilExpiry: healthResult.timeUntilExpiry,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to perform certificate health check', { 
      error: error instanceof Error ? error.message : String(error),
      clientId: req.clientId
    });
    next(error);
  }
});

export default router;
