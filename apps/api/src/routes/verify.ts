import { Router, Request, Response, NextFunction } from 'express';
import { readFile } from 'fs/promises';
import { X509Certificate } from 'crypto';
import multer from 'multer';
import { C2PAService } from '../services/c2pa-service';
import { ProofStorage } from '../services/proof-storage';
import { extractManifest, extractProofUri } from '../services/metadata-extractor';
import { CertificateValidator } from '../services/certificate-validator';
import { validationService, ValidationService } from '../services/validation-service';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/error-handler';
import { VerificationResult } from '../types';
import { registerService } from '../utils/service-registry';
import { TimeoutConfig } from '../utils/timeout-config';

const router: Router = Router();
let proofStorage: ProofStorage | null = null;
let c2paService: C2PAService | null = null;

// Lazy initialization function
function getProofStorage(): ProofStorage {
  if (!proofStorage) {
    proofStorage = new ProofStorage();
  }
  return proofStorage;
}

function getC2PAService(): C2PAService {
  if (!c2paService) {
    c2paService = new C2PAService();
  }
  return c2paService;
}

const certValidator = new CertificateValidator();

// Register for graceful shutdown
if (typeof registerService === 'function') {
  registerService('ProofStorage (verify route)', getProofStorage());
}

// Configure multer for file uploads
// 🔥 STEP 11: Replace duplicate validation with centralized ValidationService
const upload = multer({
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE_MB || '50') * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    // Basic MIME type check - detailed validation happens in route handler
    if (!file.mimetype.startsWith('image/')) {
      cb(new Error('Only image files are allowed'));
      return;
    }
    cb(null, true);
  }
});

// 🔥 HARSH FIX: Remove duplicate c2paService declaration - use lazy initialization
// const c2paService = new C2PAService();

/**
 * POST /verify
 * 
 * Verify an image's C2PA signature and proof
 * 
 * Request:
 * - multipart/form-data with 'image' file
 * 
 * Response:
 * - VerificationResult JSON with:
 *   - valid: boolean
 *   - confidence: number (0-100)
 *   - details: object with verification breakdown
 */
router.post('/', upload.single('image'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) {
      throw new AppError(400, 'No image file provided');
    }

    const startTime = Date.now();
    
    logger.info('Verify request received', {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    });

    // 🔥 STEP 11: Centralized validation with comprehensive security checks
    const validationOptions = ValidationService.getEnvironmentOptions();
    const validationResult = await validationService.validateImage(
      req.file.buffer,
      req.file.mimetype,
      validationOptions
    );

    if (!validationResult.isValid) {
      logger.warn('Image validation failed during verification', {
        errors: validationResult.errors,
        filename: req.file.originalname
      });
      throw new AppError(400, `Invalid image: ${validationResult.errors.join(', ')}`);
    }

    // Log warnings from strict validation
    if (validationResult.warnings.length > 0) {
      logger.warn('Image validation warnings during verification', {
        warnings: validationResult.warnings,
        filename: req.file.originalname
      });
    }

    // 1. Extract embedded C2PA manifest
    const embeddedManifest = await extractManifest(req.file.buffer);
    
    // 2. Validate signature (if manifest exists)
    let signatureValid = false;
    if (embeddedManifest) {
      signatureValid = await getC2PAService().verifySignature(req.file.buffer, 'extracted-signature');
    }
    
    // 3. Certificate validation (real implementation)
    let certValid = false;
    let certValidationDetails = null;
    if (embeddedManifest) {
      try {
        // 🔥 SECURITY FIX: Load certificates asynchronously with timeouts
        const certPath = process.env.SIGNING_CERTIFICATE || './certs/signing-cert.pem';
        const issuerPath = process.env.ISSUER_CERTIFICATE || null;
        
        // Load certificates asynchronously with timeout protection
        const timeoutMs = TimeoutConfig.CERTIFICATE_LOAD_TIMEOUT;
        
        const [certPem, issuerPem] = await Promise.all([
          Promise.race([
            readFile(certPath, 'utf8').catch(() => null),
            new Promise<never>((_, reject) => 
              setTimeout(() => reject(new Error('Certificate load timeout')), timeoutMs)
            )
          ]),
          issuerPath ? Promise.race([
            readFile(issuerPath, 'utf8').catch(() => null),
            new Promise<never>((_, reject) => 
              setTimeout(() => reject(new Error('Issuer certificate load timeout')), timeoutMs)
            )
          ]) : Promise.resolve(null)
        ]);
        
        const certificates: X509Certificate[] = [];
        if (certPem) {
          try {
            certificates.push(new X509Certificate(certPem));
          } catch (error) {
            logger.error('Failed to parse certificate', { error });
          }
        }
        if (issuerPem) {
          try {
            certificates.push(new X509Certificate(issuerPem));
          } catch (error) {
            logger.error('Failed to parse issuer certificate', { error });
          }
        }
        
        if (certificates.length > 0) {
          const validationResult = await certValidator.validateCertificateChain(certificates);
          certValid = validationResult.isValid;
          certValidationDetails = {
            errors: validationResult.errors,
            certificateResults: validationResult.certificateResults.map(r => ({
              errors: r.errors,
              warnings: r.warnings,
              checks: r.checks
            }))
          };
          
          if (!certValid) {
            logger.warn('Certificate validation failed', {
              errors: validationResult.errors
            });
          }
        } else {
          logger.warn('No certificate file found at path', { certPath });
          certValid = false;
        }
      } catch (error) {
        logger.error('Certificate validation error', { error });
        certValid = false;
      }
    }
    
    // 4. Extract proof URI from metadata
    const proofUri = await extractProofUri(req.file.buffer);
    
    // 5. Fetch remote proof (if proof URI exists)
    let remoteProof = null;
    if (proofUri) {
      try {
        const proofId = proofUri.split('/').pop();
        if (proofId) {
          remoteProof = await getProofStorage().getProof(proofId);
        }
      } catch (error) {
        logger.warn('Failed to retrieve remote proof', { proofUri, error });
      }
    }
    
    // 6. Compare embedded vs remote manifests
    const proofsMatch = (embeddedManifest && remoteProof) ? 
      JSON.stringify(embeddedManifest) === JSON.stringify(remoteProof) : 
      false;

    // 7. Calculate confidence score
    const confidence = calculateConfidence({
      hasManifest: !!embeddedManifest,
      signatureValid,
      certValid,
      hasProofUri: !!proofUri,
      proofFound: !!remoteProof,
      proofsMatch
    });

    // 8. Determine overall validity
    const valid = embeddedManifest ? 
      (signatureValid && certValid && (!proofUri || proofsMatch)) : 
      false;

    const duration = Date.now() - startTime;
    
    logger.info('Verification completed', {
      duration,
      valid,
      confidence,
      hasManifest: !!embeddedManifest,
      hasProof: !!remoteProof,
      validatedFormat: validationResult.metadata?.format
    });

    const result: VerificationResult = {
      valid,
      confidence,
      timestamp: Date.now(),
      processingTime: duration,
      details: {
        signature: signatureValid,
        certificate: certValid,
        proofUri: proofUri || null,
        proofFound: !!remoteProof,
        proofMatches: proofsMatch,
        manifestTimestamp: embeddedManifest?.claim_generator?.timestamp || new Date().toISOString(),
        imageFormat: validationResult.metadata?.format,
        imageDimensions: validationResult.metadata ? {
          width: validationResult.metadata.width,
          height: validationResult.metadata.height
        } : undefined
      }
    };

    res.json(result);

  } catch (error) {
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        next(new AppError(413, `File too large. Maximum size: ${process.env.MAX_FILE_SIZE_MB || 50}MB`));
      } else {
        next(new AppError(400, `Upload error: ${error.message}`));
      }
    } else {
      next(error);
    }
  }
});

/**
 * Calculate confidence score based on verification checks
 * 
 * Scoring:
 * - Has manifest: 20 points (baseline)
 * - Valid signature: 30 points
 * - Valid certificate: 25 points
 * - Has proof URI: 10 points
 * - Proof found remotely: 10 points
 * - Proofs match: 5 points
 * 
 * Total: 100 points maximum
 */
function calculateConfidence(checks: {
  hasManifest: boolean;
  signatureValid: boolean;
  certValid: boolean;
  hasProofUri: boolean;
  proofFound: boolean;
  proofsMatch: boolean;
}): number {
  let score = 0;
  
  if (checks.hasManifest) score += 20;
  if (checks.signatureValid) score += 30;
  if (checks.certValid) score += 25;
  if (checks.hasProofUri) score += 10;
  if (checks.proofFound) score += 10;
  if (checks.proofsMatch) score += 5;
  
  return Math.min(score, 100);
}

export default router;
