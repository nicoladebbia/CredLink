import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger';
import { requirePermission } from '../middleware/rbac-auth';
import { requireAuth } from '../middleware/session-validator';
import { validateInput, SCHEMAS } from '../middleware/input-validator';
import { ProofStorage } from '../services/proof-storage';
import { PdfGenerator } from '../services/pdf-generator';

const router: Router = Router();
const proofStorage = new ProofStorage();

/**
 * 🔥 CRITICAL SECURITY FIX: GET /api/v1/proofs/:proofId/pdf
 * Download Certificate of Authenticity PDF - REQUIRES AUTHENTICATION
 */
router.get('/:proofId/pdf', 
  requireAuth(), // 🔥 SECURITY: Authentication required
  validateInput(SCHEMAS.PROOF_ID), // 🔥 SECURITY: Input validation
  async (req: Request, res: Response) => {
  try {
    const { proofId } = req.params;
    
    const proof = await proofStorage.getProof(proofId);
    if (!proof) {
      return res.status(404).json({
        error: 'Proof not found',
        code: 'PROOF_NOT_FOUND'
      });
    }

    const pdfBytes = await PdfGenerator.generateCertificate(proof);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="certificate-${proofId}.pdf"`);
    res.send(Buffer.from(pdfBytes));

  } catch (error: any) {
    logger.error('Failed to generate PDF certificate', { 
      error: error.message, 
      proofId: req.params.proofId 
    });
    
    res.status(500).json({
      error: 'Internal server error',
      code: 'PDF_GENERATION_FAILED',
      message: error.message
    });
  }
});

/**
 * 🔥 CRITICAL SECURITY FIX: GET /api/v1/proofs/:proofId
 * Retrieve proof by ID - REQUIRES AUTHENTICATION
 */
router.get('/:proofId', 
  requireAuth(), // 🔥 SECURITY: Authentication required
  validateInput(SCHEMAS.PROOF_ID), // 🔥 SECURITY: Input validation
  async (req: Request, res: Response) => {
  try {
    const { proofId } = req.params;
    
    if (!proofId) {
      return res.status(400).json({
        error: 'Proof ID is required',
        code: 'MISSING_PROOF_ID'
      });
    }

    const proof = await proofStorage.getProof(proofId);
    
    if (!proof) {
      return res.status(404).json({
        error: 'Proof not found',
        code: 'PROOF_NOT_FOUND',
        proofId
      });
    }

    res.json({
      success: true,
      proof: {
        proofId: proof.proofId,
        proofUri: proof.proofUri,
        imageHash: proof.imageHash,
        manifest: proof.manifest,
        signature: proof.signature,
        createdAt: proof.timestamp,
        expiresAt: proof.expiresAt
      }
    });
  } catch (error: any) {
    logger.error('Failed to retrieve proof by ID', { 
      error: error.message, 
      proofId: req.params.proofId 
    });
    
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * 🔥 CRITICAL SECURITY FIX: GET /api/v1/proofs/hash/:imageHash
 * Retrieve proof by image hash - REQUIRES AUTHENTICATION
 */
router.get('/hash/:imageHash', 
  requireAuth(), // 🔥 SECURITY: Authentication required
  validateInput({ // 🔥 SECURITY: Input validation for image hash
    params: {
      imageHash: {
        type: 'string',
        required: true,
        pattern: /^[a-fA-F0-9]{64}$/, // SHA-256 hash
        maxLength: 64
      }
    }
  }),
  async (req: Request, res: Response) => {
  try {
    const { imageHash } = req.params;
    
    if (!imageHash) {
      return res.status(400).json({
        error: 'Image hash is required',
        code: 'MISSING_IMAGE_HASH'
      });
    }

    const proof = await proofStorage.getProofByHash(imageHash);
    
    if (!proof) {
      return res.status(404).json({
        error: 'Proof not found for this image hash',
        code: 'PROOF_NOT_FOUND',
        imageHash
      });
    }

    res.json({
      success: true,
      proof: {
        proofId: proof.proofId,
        proofUri: proof.proofUri,
        imageHash: proof.imageHash,
        manifest: proof.manifest,
        signature: proof.signature,
        createdAt: proof.timestamp,
        expiresAt: proof.expiresAt
      }
    });
  } catch (error: any) {
    logger.error('Failed to retrieve proof by hash', { 
      error: error.message, 
      imageHash: req.params.imageHash 
    });
    
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * 🔥 CRITICAL SECURITY FIX: DELETE /api/v1/proofs/:proofId
 * Delete proof by ID (for cleanup or revocation) - REQUIRES AUTHENTICATION
 */
router.delete('/:proofId', 
  requireAuth(), // 🔥 SECURITY: Authentication required
  validateInput(SCHEMAS.PROOF_ID), // 🔥 SECURITY: Input validation
  async (req: Request, res: Response) => {
  try {
    const { proofId } = req.params;
    
    if (!proofId) {
      return res.status(400).json({
        error: 'Proof ID is required',
        code: 'MISSING_PROOF_ID'
      });
    }

    const deleted = await proofStorage.deleteProof(proofId);
    
    if (!deleted) {
      return res.status(404).json({
        error: 'Proof not found',
        code: 'PROOF_NOT_FOUND',
        proofId
      });
    }

    res.json({
      success: true,
      message: 'Proof deleted successfully',
      proofId
    });
  } catch (error: any) {
    logger.error('Failed to delete proof', { 
      error: error.message, 
      proofId: req.params.proofId 
    });
    
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * 🔥 CRITICAL SECURITY FIX: GET /api/v1/proofs
 * List all proofs (with pagination for production use) - REQUIRES AUTHENTICATION
 */
router.get('/', 
  requireAuth(), // 🔥 SECURITY: Authentication required
  validateInput(SCHEMAS.PAGINATION), // 🔥 SECURITY: Input validation
  async (req: Request, res: Response) => {
  try {
    // For development/testing, return empty array since LRUCache doesn't expose iteration
    // In production, this should include pagination and filtering with proper storage
    const proofs: any[] = [];
    
    res.json({
      success: true,
      proofs: proofs.map((proof: any) => ({
        proofId: proof.proofId,
        proofUri: proof.proofUri,
        imageHash: proof.imageHash,
        createdAt: proof.timestamp,
        expiresAt: proof.expiresAt
      })),
      count: proofs.length
    });
  } catch (error: any) {
    logger.error('Failed to list proofs', { error: error.message });
    
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

export default router;
