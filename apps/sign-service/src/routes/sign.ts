import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { C2PAService } from '../services/c2pa-service';
import { ProofStorage } from '../services/proof-storage';
import { embedProofUri } from '../services/metadata-embedder';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/error-handler';

const proofStorage = new ProofStorage();

const router: Router = Router();

// Rate limiting: 10 requests per minute per IP
const signLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute
  message: 'Too many signing requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

// Configure multer for file uploads
const upload = multer({
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE_MB || '50') * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    // Accept images only
    if (!file.mimetype.startsWith('image/')) {
      cb(new Error('Only image files are allowed'));
      return;
    }
    cb(null, true);
  }
});

const c2paService = new C2PAService();

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
  try {
    // Validate file upload
    if (!req.file) {
      throw new AppError(400, 'No image file provided');
    }

    const startTime = Date.now();
    
    logger.info('Sign request received', {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      creator: req.body.creator || req.body.issuer
    });

    // 1. Sign image with C2PA
    const signingResult = await c2paService.signImage(
      req.file.buffer,
      {
        creator: req.body.creator || req.body.issuer || 'CredLink',
        assertions: req.body.customAssertions ? JSON.parse(req.body.customAssertions) : undefined
      }
    );

    // 2. Proof is already stored by the service
    const proofUri = signingResult.proofUri;
    const manifestHash = signingResult.imageHash;

    // 3. Return signed image (for now, return original - embedding will be added later)
    const finalImage = req.file.buffer;

    // 4. Return signed image
    const duration = Date.now() - startTime;
    
    logger.info('Sign completed successfully', {
      duration,
      proofUri,
      manifestHash,
      originalSize: req.file.size,
      signedSize: finalImage.length
    });

    // Set response headers
    res.set('Content-Type', req.file.mimetype);
    res.set('Content-Disposition', `attachment; filename="signed-${req.file.originalname}"`);
    res.set('X-Proof-Uri', proofUri);
    res.set('X-Manifest-Hash', manifestHash);
    res.set('X-Processing-Time', `${duration}ms`);
    
    // Send signed image
    res.send(finalImage);

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
