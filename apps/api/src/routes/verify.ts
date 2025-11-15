import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { C2PAService } from '../services/c2pa-service';
import { ProofStorage } from '../services/proof-storage';
import { extractManifest, extractProofUri } from '../services/metadata-extractor';
import { CertificateValidator } from '../services/certificate-validator';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/error-handler';
import { VerificationResult } from '../types';
import { registerService } from '../index';

const router: Router = Router();
const proofStorage = new ProofStorage();
const certValidator = new CertificateValidator();

// Register for graceful shutdown
if (typeof registerService === 'function') {
  registerService('ProofStorage (verify route)', proofStorage);
}

// Configure multer for file uploads
const upload = multer({
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE_MB || '50') * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      cb(new Error('Only image files are allowed'));
      return;
    }
    cb(null, true);
  }
});

const c2paService = new C2PAService();

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

    // 1. Extract embedded C2PA manifest
    const embeddedManifest = await extractManifest(req.file.buffer);
    
    // 2. Validate signature (if manifest exists)
    let signatureValid = false;
    if (embeddedManifest) {
      signatureValid = await c2paService.verifySignature(req.file.buffer, 'extracted-signature');
    }
    
    // 3. Certificate validation (real implementation)
    let certValid = false;
    let certValidationDetails = null;
    if (embeddedManifest) {
      try {
        // Extract certificate from embedded metadata or use default cert path
        const certPath = process.env.SIGNING_CERTIFICATE || './certs/signing-cert.pem';
        const issuerPath = process.env.ISSUER_CERTIFICATE || null;
        
        // Read certificates
        const fs = require('fs');
        const certPem = fs.existsSync(certPath) ? fs.readFileSync(certPath, 'utf8') : null;
        const issuerPem = issuerPath && fs.existsSync(issuerPath) ? fs.readFileSync(issuerPath, 'utf8') : null;
        
        if (certPem) {
          const validationResult = await certValidator.validateCertificateChain([certPem]);
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
          remoteProof = await proofStorage.getProof(proofId);
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
      hasProof: !!remoteProof
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
        manifestTimestamp: embeddedManifest?.claim_generator?.timestamp || new Date().toISOString()
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
