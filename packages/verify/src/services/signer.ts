// Signer service for verify-api
// Production-ready cryptographic signing implementation

import { createSign, createVerify } from 'crypto';

// Simple logger for this package
const logger = {
  error: (message: string, data?: any) => console.error(`[Signer] ${message}`, data || ''),
  debug: (message: string, data?: any) => console.debug(`[Signer] ${message}`, data || ''),
  warn: (message: string, data?: any) => console.warn(`[Signer] ${message}`, data || ''),
  info: (message: string, data?: any) => console.info(`[Signer] ${message}`, data || '')
};

export interface SignerService {
  sign(data: any): Promise<string>;
  verify(signature: string, data: any): Promise<boolean>;
  healthCheck(): Promise<boolean>;
}

// Configuration for signing
const SIGNING_ALGORITHM = process.env.SIGNING_ALGORITHM || 'RSA-SHA256';
const PRIVATE_KEY_PATH = process.env.SIGNING_PRIVATE_KEY || './keys/signing-private.pem';
const PUBLIC_KEY_PATH = process.env.SIGNING_PUBLIC_KEY || './keys/signing-public.pem';

// In-memory cache for keys to avoid repeated file reads
let privateKey: string | null = null;
let publicKey: string | null = null;

/**
 * Load signing keys from environment or files
 */
async function loadKeys(): Promise<{ privateKey: string; publicKey: string }> {
  if (privateKey && publicKey) {
    return { privateKey, publicKey };
  }

  try {
    // For production, keys should be provided via environment variables
    if (process.env.SIGNING_PRIVATE_KEY && process.env.SIGNING_PUBLIC_KEY) {
      privateKey = process.env.SIGNING_PRIVATE_KEY;
      publicKey = process.env.SIGNING_PUBLIC_KEY;
    } else {
      // Development fallback - load from files
      const fs = require('fs').promises;
      privateKey = await fs.readFile(PRIVATE_KEY_PATH, 'utf8');
      publicKey = await fs.readFile(PUBLIC_KEY_PATH, 'utf8');
    }
    
    // Ensure keys are loaded before returning
    if (!privateKey || !publicKey) {
      throw new Error('Failed to load signing keys');
    }
    
    return { privateKey, publicKey };
  } catch (error) {
    logger.error('Failed to load signing keys', { 
      error: error instanceof Error ? error.message : String(error) 
    });
    throw new Error('Signing keys not available');
  }
}

export const signerService: SignerService = {
  async sign(data: any): Promise<string> {
    try {
      const keys = await loadKeys();
      
      // Convert data to string and create signature
      const dataString = typeof data === 'string' ? data : JSON.stringify(data);
      const sign = createSign(SIGNING_ALGORITHM);
      sign.update(dataString);
      
      const signature = sign.sign(keys.privateKey, 'base64');
      
      logger.debug('Data signed successfully', { 
        algorithm: SIGNING_ALGORITHM,
        dataLength: dataString.length 
      });
      
      return signature;
    } catch (error) {
      logger.error('Failed to sign data', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      throw new Error('Signing operation failed');
    }
  },
  
  async verify(signature: string, data: any): Promise<boolean> {
    try {
      const keys = await loadKeys();
      
      // Convert data to string and verify signature
      const dataString = typeof data === 'string' ? data : JSON.stringify(data);
      const verify = createVerify(SIGNING_ALGORITHM);
      verify.update(dataString);
      
      const isValid = verify.verify(keys.publicKey, signature, 'base64');
      
      logger.debug('Signature verification completed', { 
        valid: isValid,
        algorithm: SIGNING_ALGORITHM 
      });
      
      return isValid;
    } catch (error) {
      logger.error('Failed to verify signature', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      return false;
    }
  },
  
  async healthCheck(): Promise<boolean> {
    try {
      // Test signing and verification with sample data
      const testData = { test: 'health-check', timestamp: Date.now() };
      const signature = await this.sign(testData);
      const isValid = await this.verify(signature, testData);
      
      logger.debug('Signer service health check completed', { valid: isValid });
      return isValid;
    } catch (error) {
      logger.error('Signer service health check failed', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      return false;
    }
  }
};
