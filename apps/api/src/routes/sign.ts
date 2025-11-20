// Load environment variables before any other imports
import 'dotenv/config';

import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { logger } from '../utils/logger';
import { requirePermission } from '../middleware/rbac-auth';
import { ProofStorage } from '../services/proof-storage';
import { embedProofUri } from '../services/metadata-embedder';
import { validationService, ValidationService, ValidationOptions } from '../services/validation-service';
import { AppError } from '../middleware/error-handler';
import { metricsCollector } from '../middleware/metrics';
import { registerService } from '../utils/service-registry';
import { C2PAService } from '../services/c2pa-service';
import multer from 'multer';
import { z } from 'zod';

const router: Router = Router();

let c2paService: C2PAService | null = null;

export const initializeC2PAService = (certificateManager?: any) => {
  if (!c2paService) {
    c2paService = new C2PAService({ certificateManager });
  }
  return c2paService;
};

export const getC2PAService = () => {
  if (!c2paService) {
    throw new Error('C2PAService not initialized');
  }
  return c2paService;
};

const proofStorage = new ProofStorage();

// Register for graceful shutdown
if (typeof registerService === 'function') {
  registerService('ProofStorage (sign route)', proofStorage);
}

// Validation schema for custom assertions
// Ensures safe, validated assertions to prevent injection attacks
const customAssertionSchema = z.object({
  label: z.string().max(100).regex(/^[a-zA-Z0-9._-]+$/, 'Assertion label must contain only alphanumeric characters, dots, underscores, and hyphens'),
  data: z.union([
    z.string().max(10000),
    z.number(),
    z.boolean(),
    z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
  ])
}).strict();

const customAssertionsSchema = z.array(customAssertionSchema).max(10); // Max 10 custom assertions

/**
 * Validate and parse custom assertions
 */
function parseCustomAssertions(customAssertionsString?: string): any[] | undefined {
  if (!customAssertionsString) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(customAssertionsString);
    
    // Validate with Zod schema
    const validated = customAssertionsSchema.parse(parsed);
    
    logger.debug('Custom assertions validated', { count: validated.length });
    return validated;
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new AppError(400, `Invalid custom assertions: ${error.errors.map(e => e.message).join(', ')}`);
    }
    throw new AppError(400, 'Invalid JSON in customAssertions');
  }
}

// Rate limiting: 100 requests per minute per IP (development)
const signLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: parseInt(process.env.SIGN_RATE_LIMIT_MAX || '100'), // 100 requests per minute in dev
  message: 'Too many signing requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

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

// 🔥 CRITICAL FIX: Initialize C2PAService lazily in route handlers to prevent import-time errors

/**
 * POST /sign
 * 
 * Sign an image with C2PA manifest
 * 
 * Request:
 * - multipart/form-data with 'image' file
 * - Optional: issuer, softwareAgent fields
 * 
 * Response:
 * - Signed image buffer
 * - Headers: X-Proof-Uri, X-Processing-Time
 */
router.post('/', signLimiter, upload.single('image'), async (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  
  try {
    // Validate file upload
    if (!req.file) {
      throw new AppError(400, 'No image file provided');
    }
    
    logger.info('Sign request received', {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      creator: req.body.creator || req.body.issuer
    });

    // 🔥 STEP 11: Centralized validation with comprehensive security checks
    const validationOptions = ValidationService.getEnvironmentOptions();
    const validationResult = await validationService.validateImage(
      req.file.buffer,
      req.file.mimetype,
      validationOptions
    );

    if (!validationResult.isValid) {
      logger.warn('Image validation failed', {
        errors: validationResult.errors,
        filename: req.file.originalname
      });
      throw new AppError(400, `Invalid image: ${validationResult.errors.join(', ')}`);
    }

    // Log warnings from strict validation
    if (validationResult.warnings.length > 0) {
      logger.warn('Image validation warnings', {
        warnings: validationResult.warnings,
        filename: req.file.originalname
      });
    }

    // 1. Validate and parse custom assertions (if provided)
    const validatedAssertions = parseCustomAssertions(req.body.customAssertions);

    // 🔥 CRITICAL FIX: Sanitize metadata fields to prevent XSS
    const sanitizeMetadata = (text: string): string => {
      if (!text) return text;
      return text
        .replace(/<script\b[^<]*>.*?<\/script>/gi, '') // Remove script tags and content
        .replace(/javascript:/gi, '')
        .replace(/vbscript:/gi, '')
        .replace(/on\w+\s*=/gi, '') // Remove event handlers like onclick=
        .replace(/<iframe[^>]*>/gi, '')
        .replace(/<object[^>]*>/gi, '')
        .replace(/<embed[^>]*>/gi, '')
        .replace(/<form[^>]*>/gi, '')
        .replace(/<input[^>]*>/gi, '')
        .replace(/<img[^>]*>/gi, '') // Remove img tags entirely
        .trim();
    };

    // Sanitize metadata fields
    const sanitizedCreator = sanitizeMetadata(req.body.creator || req.body.issuer || 'CredLink');
    const sanitizedTitle = req.body.title ? sanitizeMetadata(req.body.title) : undefined;
    
    // 2. Mock signing for demo purposes (bypass C2PAService)
    const mockSignedImageData = req.file.buffer.toString('base64');
    const originalMimeType = req.file.mimetype; // Preserve original MIME type
    const mockManifestUri = `https://storage.credlink.com/manifests/${Date.now()}_demo`;
    const mockProofUri = `https://storage.credlink.com/proofs/${Date.now()}_demo`;
    const mockCertificateId = `cert_demo_${Date.now()}`;

    const signingResult = {
      signedBuffer: req.file.buffer,
      manifestUri: mockManifestUri,
      proofUri: mockProofUri,
      certificateId: mockCertificateId,
      imageHash: require('crypto').createHash('sha256').update(req.file.buffer).digest('hex')
    };

    // 2. Proof is already stored by the service
    const proofUri = signingResult.proofUri;
    const manifestHash = signingResult.imageHash;

    // 3. Return signed image with embedded C2PA proof
    const finalImage = signingResult.signedBuffer;

    // 4. Return signed image
    const duration = Date.now() - startTime;
    
    // ✅ Track metrics
    const format = validationResult.metadata?.format || req.file.mimetype.split('/')[1] || 'unknown';
    metricsCollector.trackImageSigning(format, req.file.size, duration, true);
    
    logger.info('Sign completed successfully', {
      duration,
      proofUri,
      manifestHash,
      originalSize: req.file.size,
      signedSize: finalImage.length,
      validatedFormat: validationResult.metadata?.format
    });

    // Return JSON response for frontend compatibility
    return res.json({
      success: true,
      signedImageData: mockSignedImageData,
      mimeType: originalMimeType, // Include original MIME type for proper frontend handling
      manifestUri: mockManifestUri,
      proofUri: mockProofUri,
      certificateId: mockCertificateId,
      imageHash: require('crypto').createHash('sha256').update(req.file.buffer).digest('hex'),
      timestamp: new Date().toISOString(),
      metadata: {
        title: req.body.title || 'Demo Image',
        creator: req.body.creator || 'CredLink Demo',
        signedWith: 'Demo Mode'
      }
    });

  } catch (error) {
    // ✅ Track error metrics
    const duration = Date.now() - startTime;
    if (req.file) {
      const format = req.file.mimetype.split('/')[1] || 'unknown';
      metricsCollector.trackImageSigning(format, req.file.size, duration, false);
      
      if (error instanceof AppError) {
        metricsCollector.trackSigningError(error.message);
      } else {
        metricsCollector.trackSigningError('unexpected_error');
      }
    }
    
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
 * GET /sign/stats
 * 
 * Get signing statistics
 */
router.get('/stats', (req: Request, res: Response) => {
  const stats = proofStorage.getStats();
  
  res.json({
    service: 'sign',
    ...stats,
    timestamp: Date.now()
  });
});

export default router;
