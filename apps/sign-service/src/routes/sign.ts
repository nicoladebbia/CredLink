import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { C2PAService } from '../services/c2pa-service';
import { proofStorage } from '../services/proof-storage';
import { embedProofUri } from '../services/metadata-embedder';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/error-handler';

const router: Router = Router();

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
router.post('/', upload.single('image'), async (req: Request, res: Response, next: NextFunction) => {
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
      issuer: req.body.issuer
    });

    // 1. Sign image with C2PA
    const { imageBuffer, manifest, manifestHash } = await c2paService.signImage(
      req.file.buffer,
      {
        issuer: req.body.issuer || 'CredLink',
        softwareAgent: req.body.softwareAgent || 'CredLink Sign Service/1.0',
        customAssertions: req.body.customAssertions ? JSON.parse(req.body.customAssertions) : undefined
      }
    );

    // 2. Store proof remotely
    const proofUri = await proofStorage.storeProof(manifest, manifestHash);

    // 3. Embed proof URI in image metadata
    const finalImage = await embedProofUri(imageBuffer, proofUri);

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
