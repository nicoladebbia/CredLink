import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { C2PAService } from '../services/c2pa-service';
import { CertificateManager } from '../services/certificate-manager';
import { BatchSigningService } from '../services/batch-signing-service';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/error-handler';
import { metricsCollector } from '../middleware/metrics';
import { validateRequest } from '../middleware/validation';

const router: Router = Router();
let c2paService: C2PAService | null = null;
let certificateManager: CertificateManager | null = null;
let batchService: BatchSigningService | null = null;

// Initialize services
function initializeSigningServices() {
  if (!certificateManager) {
    certificateManager = new CertificateManager();
  }
  if (!c2paService) {
    c2paService = new C2PAService({ certificateManager });
  }
  if (!batchService) {
    batchService = new BatchSigningService({ c2paService });
  }
  return { c2paService, certificateManager, batchService };
}

// Get services (throws if not initialized)
const getServices = () => {
  if (!c2paService || !certificateManager || !batchService) {
    initializeSigningServices();
  }
  return { c2paService, certificateManager, batchService };
};

// Rate limiting for signing endpoints
const signLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many signing requests from this IP, please try again later',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const batchSignLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 batch requests per windowMs
  message: {
    error: 'Too many batch signing requests from this IP, please try again later',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Multer configuration for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max file size
    files: 10 // Max 10 files for batch operations
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/tiff',
      'image/webp',
      'image/heic',
      'image/heif'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new AppError(`Unsupported file type: ${file.mimetype}`, 400));
    }
  }
});

// Validation schemas
const customAssertionSchema = z.object({
  label: z.string().max(100).regex(/^[a-zA-Z0-9._-]+$/),
  data: z.union([
    z.string().max(10000),
    z.number(),
    z.boolean(),
    z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
  ])
}).strict();

const signRequestSchema = z.object({
  custom_assertions: z.array(customAssertionSchema).optional(),
  claim_generator: z.string().max(200).optional(),
  title: z.string().max(200).optional(),
  format: z.enum(['jpeg', 'png', 'tiff', 'webp']).optional(),
}).strict();

/**
 * POST /api/v1/sign
 * Sign an image with C2PA manifest
 */
router.post('/', signLimiter, upload.single('image'), validateRequest(signRequestSchema), async (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  
  try {
    const { c2paService } = getServices();
    
    if (!req.file) {
      throw new AppError('No image file provided', 400);
    }

    const {
      custom_assertions = [],
      claim_generator = 'CredLink Signing Service v1.0.0',
      title = 'CredLink Signed Image',
      format
    } = req.body;

    logger.info('Sign request received', {
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      customAssertionsCount: custom_assertions.length,
      claimGenerator: claim_generator,
      title
    });

    // Sign image with C2PA
    if (!c2paService) {
      throw new AppError('C2PA Service not initialized', 500);
    }
    
    const signingResult = await c2paService.signImage(req.file.buffer, {
      customAssertions: custom_assertions,
      claimGenerator: claim_generator,
      title,
      outputFormat: format
    });

    const duration = Date.now() - startTime;
    
    // Track metrics
    metricsCollector.trackImageSigning(
      req.file.mimetype,
      req.file.size,
      duration,
      true
    );

    logger.info('Image signed successfully', {
      imageHash: signingResult.imageHash,
      proofUri: signingResult.proofUri,
      duration
    });

    // Return signed image
    res.set({
      'Content-Type': req.file.mimetype,
      'Content-Length': signingResult.signedBuffer.length,
      'X-CredLink-Signature': signingResult.imageHash,
      'X-CredLink-Proof-URI': signingResult.proofUri,
      'X-CredLink-Processing-Time': duration.toString()
    });

    res.send(signingResult.signedBuffer);

  } catch (error) {
    const duration = Date.now() - startTime;
    
    // Track failed metrics
    if (req.file) {
      metricsCollector.trackImageSigning(
        req.file.mimetype,
        req.file.size,
        duration,
        false
      );
    }

    logger.error('Signing failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      duration,
      fileSize: req.file?.size
    });

    next(error);
  }
});

/**
 * POST /api/v1/sign/batch
 * Batch sign multiple images
 */
router.post('/batch', batchSignLimiter, upload.array('images', 10), async (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  
  try {
    const { batchService } = getServices();
    
    if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
      throw new AppError('No image files provided', 400);
    }

    if (!batchService) {
      throw new AppError('Batch Service not initialized', 500);
    }

    const batchOptions = req.body.batch_options ? JSON.parse(req.body.batch_options) : {};

    logger.info('Batch sign request received', {
      fileCount: req.files.length,
      totalSize: req.files.reduce((sum, file) => sum + file.size, 0),
      options: batchOptions
    });

    // Process batch signing
    const results = await batchService.signBatch(req.files, {
      ...batchOptions,
      claimGenerator: batchOptions.claimGenerator || 'CredLink Batch Signing v1.0.0'
    });

    const duration = Date.now() - startTime;
    
    // Track metrics
    metricsCollector.trackBatchSigning(
      req.files.length,
      req.files.reduce((sum, file) => sum + file.size, 0),
      duration,
      results.every(r => r.success)
    );

    logger.info('Batch signing completed', {
      totalFiles: req.files.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      duration
    });

    res.json({
      batch_id: results[0]?.batchId || `batch_${Date.now()}`,
      total_files: req.files.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      processing_time: duration,
      results: results.map((result, index) => ({
        file_index: index,
        original_name: (req.files as Express.Multer.File[])[index].originalname,
        success: result.success,
        image_hash: result.imageHash,
        proof_uri: result.proofUri,
        error: result.error || null,
        processing_time: result.processingTime
      }))
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    
    logger.error('Batch signing failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      duration,
      fileCount: req.files?.length || 0
    });

    next(error);
  }
});

/**
 * GET /api/v1/sign/status
 * Get signing service status
 */
router.get('/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { c2paService, certificateManager } = getServices();
    
    if (!c2paService || !certificateManager) {
      throw new AppError('Services not initialized', 500);
    }
    
    const [c2paStatus, certStatus] = await Promise.all([
      c2paService.getStatus(),
      certificateManager.getStatus()
    ]);

    res.json({
      service: 'CredLink Signing Service',
      status: 'operational',
      timestamp: new Date().toISOString(),
      components: {
        c2pa_service: c2paStatus,
        certificate_manager: certStatus,
        batch_service: { status: 'ready' }
      },
      limits: {
        max_file_size: '50MB',
        max_batch_size: 10,
        rate_limit: {
          single: '100 requests per 15 minutes',
          batch: '10 requests per 15 minutes'
        }
      }
    });

  } catch (error) {
    logger.error('Status check failed', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    next(error);
  }
});

/**
 * GET /api/v1/sign/certificates
 * Get available signing certificates
 */
router.get('/certificates', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { certificateManager } = getServices();
    
    if (!certificateManager) {
      throw new AppError('Certificate Manager not initialized', 500);
    }
    
    const certificates = await certificateManager.getAvailableCertificates();

    res.json({
      certificates: certificates.map(cert => ({
        id: cert.id,
        name: cert.name,
        issuer: cert.issuer,
        valid_from: cert.validFrom,
        valid_until: cert.validUntil,
        status: cert.status,
        algorithm: cert.algorithm
      }))
    });

  } catch (error) {
    logger.error('Certificate listing failed', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    next(error);
  }
});

export { router as signRouter };
