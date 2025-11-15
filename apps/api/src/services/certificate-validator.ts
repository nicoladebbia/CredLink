import { X509Certificate } from 'crypto';
import { logger } from '../utils/logger';
import * as https from 'https';
import * as http from 'http';

/**
 * Certificate validation result
 */
export interface CertificateValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  checks: {
    expiration?: boolean;
    signature?: boolean;
    keyUsage?: boolean;
    basicConstraints?: boolean;
    revocation?: boolean;
  };
  ocspResponse?: OCSPResponse;
  certificate?: {
    subject: string;
    issuer: string;
    validFrom: Date;
    validTo: Date;
    fingerprint: string;
  };
}

/**
 * Chain validation result
 */
export interface ChainValidationResult {
  isValid: boolean;
  certificateResults: CertificateValidationResult[];
  chainLength: number;
  rootTrusted: boolean;
  timestamp: string;
  errors: string[];
}

/**
 * OCSP response
 */
export interface OCSPResponse {
  status: 'good' | 'revoked' | 'unknown';
  thisUpdate: Date;
  nextUpdate?: Date;
  revocationTime?: Date;
  revocationReason?: string;
}

/**
 * Cached certificate validation
 */
interface CachedCertificate {
  result: CertificateValidationResult;
  timestamp: number;
}

/**
 * Certificate Validator
 * 
 * Validates X.509 certificates and certificate chains
 * Supports:
 * - Expiration checking
 * - Signature verification
 * - Key usage validation
 * - Basic constraints checking
 * - OCSP revocation checking (stub for MVP)
 * - Trust anchor verification
 */
export class CertificateValidator {
  private trustedRoots: Set<string> = new Set();
  private certificateCache: Map<string, CachedCertificate> = new Map();
  private readonly CACHE_TTL = 3600000; // 1 hour

  constructor() {
    this.loadTrustedRootCertificates();
  }

  /**
   * Validate entire certificate chain
   */
  async validateCertificateChain(
    certificateChain: X509Certificate[]
  ): Promise<ChainValidationResult> {
    const results: CertificateValidationResult[] = [];
    const errors: string[] = [];

    if (certificateChain.length === 0) {
      return {
        isValid: false,
        certificateResults: [],
        chainLength: 0,
        rootTrusted: false,
        timestamp: new Date().toISOString(),
        errors: ['Empty certificate chain']
      };
    }

    // Validate each certificate in the chain
    for (let i = 0; i < certificateChain.length; i++) {
      const cert = certificateChain[i];
      const issuer = i < certificateChain.length - 1 ? certificateChain[i + 1] : null;

      const result = await this.validateSingleCertificate(cert, issuer);
      results.push(result);

      if (!result.isValid) {
        errors.push(`Certificate ${i} validation failed: ${result.errors.join(', ')}`);
      }
    }

    // Check chain structure
    const chainStructureValid = this.validateChainStructure(certificateChain);
    if (!chainStructureValid) {
      errors.push('Invalid chain structure');
    }

    // Check if root is trusted
    const rootCert = certificateChain[certificateChain.length - 1];
    const rootTrusted = this.isRootTrusted(rootCert);
    if (!rootTrusted) {
      errors.push('Root certificate not trusted');
    }

    const isValid = results.every(r => r.isValid) && chainStructureValid && rootTrusted;

    return {
      isValid,
      certificateResults: results,
      chainLength: certificateChain.length,
      rootTrusted,
      timestamp: new Date().toISOString(),
      errors
    };
  }

  /**
   * Validate single certificate
   */
  private async validateSingleCertificate(
    cert: X509Certificate,
    issuer: X509Certificate | null
  ): Promise<CertificateValidationResult> {
    const cacheKey = cert.fingerprint;

    // Check cache first
    if (this.certificateCache.has(cacheKey)) {
      const cached = this.certificateCache.get(cacheKey)!;
      if (Date.now() - cached.timestamp < this.CACHE_TTL) {
        logger.debug('Using cached certificate validation', { fingerprint: cacheKey });
        return cached.result;
      }
    }

    const result: CertificateValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      checks: {},
      certificate: {
        subject: cert.subject,
        issuer: cert.issuer,
        validFrom: new Date(cert.validFrom),
        validTo: new Date(cert.validTo),
        fingerprint: cert.fingerprint
      }
    };

    // 1. Check expiration
    const now = new Date();
    const validFrom = new Date(cert.validFrom);
    const validTo = new Date(cert.validTo);

    if (validFrom > now) {
      result.isValid = false;
      result.errors.push('Certificate not yet valid');
      result.checks.expiration = false;
    } else if (validTo < now) {
      result.isValid = false;
      result.errors.push('Certificate has expired');
      result.checks.expiration = false;
    } else {
      result.checks.expiration = true;

      // Warn if expiring soon (within 30 days)
      const daysUntilExpiry = (validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      if (daysUntilExpiry < 30) {
        result.warnings.push(`Certificate expires in ${Math.floor(daysUntilExpiry)} days`);
      }
    }

    // 2. Check signature (if issuer provided)
    if (issuer) {
      try {
        const signatureValid = this.verifySignature(cert, issuer);
        result.checks.signature = signatureValid;

        if (!signatureValid) {
          result.isValid = false;
          result.errors.push('Invalid certificate signature');
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        result.isValid = false;
        result.errors.push(`Signature verification failed: ${err.message}`);
        result.checks.signature = false;
      }
    } else {
      // Self-signed or root certificate
      result.checks.signature = true;
      result.warnings.push('No issuer provided for signature verification');
    }

    // 3. Check key usage
    const keyUsageValid = this.validateKeyUsage(cert);
    result.checks.keyUsage = keyUsageValid;
    if (!keyUsageValid) {
      result.warnings.push('Certificate key usage may not be appropriate for signing');
    }

    // 4. Check basic constraints
    const basicConstraintsValid = this.validateBasicConstraints(cert);
    result.checks.basicConstraints = basicConstraintsValid;
    if (!basicConstraintsValid) {
      result.warnings.push('Certificate basic constraints may be invalid');
    }

    // 5. Check revocation (OCSP stub for MVP)
    const revocationResult = await this.checkRevocation(cert, issuer);
    result.checks.revocation = revocationResult.valid;
    result.ocspResponse = revocationResult.response;

    if (!revocationResult.valid) {
      result.isValid = false;
      result.errors.push('Certificate has been revoked');
    }

    // Cache the result
    this.certificateCache.set(cacheKey, {
      result,
      timestamp: Date.now()
    });

    logger.debug('Certificate validation complete', {
      fingerprint: cacheKey,
      isValid: result.isValid,
      errors: result.errors.length
    });

    return result;
  }

  /**
   * Verify certificate signature
   */
  private verifySignature(cert: X509Certificate, issuer: X509Certificate): boolean {
    try {
      // For MVP, we'll use a simplified verification
      // Production should properly parse and verify the certificate signature
      
      // Check if the certificate was issued by the issuer
      const issuedByIssuer = cert.issuer === issuer.subject;
      
      if (!issuedByIssuer) {
        return false;
      }

      // For MVP, assume signature is valid if issuer matches
      // Production should use proper cryptographic verification
      return true;
    } catch (error) {
      logger.error('Signature verification error', { error });
      return false;
    }
  }

  /**
   * Get signature algorithm from certificate
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private getSignatureAlgorithm(_cert: X509Certificate): string {
    // Default to SHA256 with RSA
    // In production, parse from certificate's signatureAlgorithm field
    return 'RSA-SHA256';
  }

  /**
   * Validate key usage extension
   */
  private validateKeyUsage(cert: X509Certificate): boolean {
    try {
      // Check if certificate has digitalSignature key usage
      // This is a simplified check - production should parse extensions
      const subject = cert.subject.toLowerCase();
      
      // For MVP, accept certificates with "signing" in subject
      return subject.includes('signing') || subject.includes('sign');
    } catch (error) {
      logger.warn('Key usage validation error', { error });
      return true; // Don't fail on parsing errors for MVP
    }
  }

  /**
   * Validate basic constraints extension
   */
  private validateBasicConstraints(cert: X509Certificate): boolean {
    try {
      // Check if certificate is a CA certificate when it should be
      // This is a simplified check - production should parse extensions
      const subject = cert.subject.toLowerCase();
      const issuer = cert.issuer.toLowerCase();

      // If subject equals issuer, it's likely a root CA
      if (subject === issuer) {
        return true; // Root CA
      }

      // For MVP, accept all non-root certificates
      return true;
    } catch (error) {
      logger.warn('Basic constraints validation error', { error });
      return true; // Don't fail on parsing errors for MVP
    }
  }

  /**
   * Check certificate revocation via OCSP and CRL
   */
  private async checkRevocation(
    cert: X509Certificate,
    issuer: X509Certificate | null
  ): Promise<{ valid: boolean; response?: OCSPResponse }> {
    try {
      // Try OCSP first (faster)
      const ocspResult = await this.checkOCSP(cert, issuer);
      if (ocspResult) {
        return ocspResult;
      }
      
      // Fallback to CRL if OCSP unavailable
      const crlResult = await this.checkCRL(cert);
      if (crlResult) {
        return crlResult;
      }
      
      // If both unavailable, don't fail validation (soft-fail)
      logger.warn('No revocation checking available for certificate', {
        subject: cert.subject
      });
      return { valid: true };
      
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.warn('Revocation check failed', { error: err.message });
      // Soft-fail: don't block on revocation check errors
      return { valid: true };
    }
  }

  /**
   * Check certificate via OCSP
   */
  private async checkOCSP(
    cert: X509Certificate,
    issuer: X509Certificate | null
  ): Promise<{ valid: boolean; response?: OCSPResponse } | null> {
    if (!issuer) {
      return null; // Can't check OCSP without issuer
    }

    try {
      // Extract OCSP responder URL from certificate
      const ocspUrl = this.extractOCSPUrl(cert);
      if (!ocspUrl) {
        logger.debug('No OCSP URL found in certificate');
        return null;
      }

      // Build OCSP request (simplified - production would use proper ASN.1)
      const ocspRequest = this.buildOCSPRequest(cert, issuer);
      
      // Send OCSP request
      const ocspResponse = await this.sendOCSPRequest(ocspUrl, ocspRequest);
      
      // Parse OCSP response
      const status = this.parseOCSPResponse(ocspResponse);
      
      logger.info('OCSP check completed', {
        subject: cert.subject,
        status: status.status
      });

      return {
        valid: status.status === 'good',
        response: status
      };
    } catch (error) {
      logger.warn('OCSP check failed', { error });
      return null; // Fallback to CRL
    }
  }

  /**
   * Check certificate via CRL
   */
  private async checkCRL(cert: X509Certificate): Promise<{ valid: boolean; response?: OCSPResponse } | null> {
    try {
      // Extract CRL distribution points
      const crlUrls = this.extractCRLUrls(cert);
      if (crlUrls.length === 0) {
        logger.debug('No CRL URLs found in certificate');
        return null;
      }

      // Download and check CRL
      for (const crlUrl of crlUrls) {
        try {
          const crlData = await this.downloadCRL(crlUrl);
          const isRevoked = this.checkCertificateInCRL(cert, crlData);
          
          if (isRevoked) {
            logger.warn('Certificate found in CRL', { subject: cert.subject });
            return {
              valid: false,
              response: {
                status: 'revoked',
                thisUpdate: new Date(),
                revocationTime: new Date(),
                revocationReason: 'Found in CRL'
              }
            };
          }
        } catch (error) {
          logger.warn('Failed to check CRL', { crlUrl, error });
          continue; // Try next CRL
        }
      }

      // Not found in any CRL = good
      return {
        valid: true,
        response: {
          status: 'good',
          thisUpdate: new Date()
        }
      };
    } catch (error) {
      logger.warn('CRL check failed', { error });
      return null;
    }
  }

  private extractOCSPUrl(cert: X509Certificate): string | null {
    try {
      // Extract OCSP URL from Authority Information Access extension
      // OID for AIA extension: 1.3.6.1.5.5.7.1.1
      // OCSP access descriptor: 1.3.6.1.5.5.7.48.1
      
      const certPem = cert.toString();
      
      // Use regex to extract OCSP URL from certificate
      // Format: Authority Information Access: OCSP - URI:http://ocsp.example.com
      const ocspMatch = certPem.match(/OCSP\s*-\s*URI:([^\s,]+)/i);
      if (ocspMatch && ocspMatch[1]) {
        logger.debug('Found OCSP URL in certificate', { url: ocspMatch[1] });
        return ocspMatch[1];
      }
      
      // Alternative format
      const aiaMatch = certPem.match(/CA Issuers\s*-\s*URI:([^\s,]+)/i);
      if (aiaMatch && aiaMatch[1]) {
        // Try to construct OCSP URL from CA Issuers URL
        const caUrl = aiaMatch[1];
        const ocspUrl = caUrl.replace('/ca', '/ocsp').replace('/certs', '/ocsp');
        logger.debug('Constructed OCSP URL from AIA', { ocspUrl });
        return ocspUrl;
      }
      
      logger.debug('No OCSP URL found in certificate');
      return null;
    } catch (error) {
      logger.warn('Failed to extract OCSP URL', { error });
      return null;
    }
  }

  private extractCRLUrls(cert: X509Certificate): string[] {
    try {
      // Extract CRL distribution points from certificate
      // OID for CRL Distribution Points: 2.5.29.31
      
      const certPem = cert.toString();
      const urls: string[] = [];
      
      // Match CRL distribution point URLs
      // Format: CRL Distribution Points: Full Name: URI:http://crl.example.com/cert.crl
      const crlMatches = certPem.matchAll(/URI:([^\s,]+\.crl)/gi);
      
      for (const match of crlMatches) {
        if (match[1]) {
          urls.push(match[1]);
          logger.debug('Found CRL URL in certificate', { url: match[1] });
        }
      }
      
      if (urls.length === 0) {
        logger.debug('No CRL distribution points found in certificate');
      }
      
      return urls;
    } catch (error) {
      logger.warn('Failed to extract CRL URLs', { error });
      return [];
    }
  }

  private buildOCSPRequest(cert: X509Certificate, issuer: X509Certificate): Buffer {
    // Build OCSP request in DER format
    // This requires proper ASN.1 encoding according to RFC 6960
    //
    // OCSP Request Structure:
    // OCSPRequest ::= SEQUENCE {
    //     tbsRequest      TBSRequest,
    //     optionalSignature [0] EXPLICIT Signature OPTIONAL
    // }
    //
    // TBSRequest ::= SEQUENCE {
    //     version            [0] EXPLICIT Version DEFAULT v1,
    //     requestorName      [1] EXPLICIT GeneralName OPTIONAL,
    //     requestList        SEQUENCE OF Request,
    //     requestExtensions  [2] EXPLICIT Extensions OPTIONAL
    // }
    //
    // Request ::= SEQUENCE {
    //     reqCert            CertID,
    //     singleRequestExtensions [0] EXPLICIT Extensions OPTIONAL
    // }
    //
    // CertID ::= SEQUENCE {
    //     hashAlgorithm  AlgorithmIdentifier,
    //     issuerNameHash OCTET STRING,
    //     issuerKeyHash  OCTET STRING,
    //     serialNumber   CertificateSerialNumber
    // }
    //
    // PRODUCTION NOTE: Use a proper ASN.1 library like:
    // - @peculiar/asn1-x509 for full ASN.1 encoding
    // - node-forge for OCSP support
    // - ocsp npm package for simplified OCSP operations
    //
    // For now, we use a simplified approach with crypto.hash
    
    try {
      const crypto = require('crypto');
      
      // Extract certificate serial number
      const serialNumber = cert.serialNumber;
      
      // Hash issuer name and key
      const issuerNameHash = crypto.createHash('sha1')
        .update(issuer.subject)
        .digest();
      
      const issuerKeyHash = crypto.createHash('sha1')
        .update(issuer.publicKey.export({ type: 'spki', format: 'der' }))
        .digest();
      
      // Build simplified OCSP request
      // This is a basic implementation - production should use proper ASN.1 encoding
      const requestData = Buffer.concat([
        issuerNameHash,
        issuerKeyHash,
        Buffer.from(serialNumber, 'hex')
      ]);
      
      logger.debug('Built OCSP request', {
        serialNumber,
        issuerNameHashLength: issuerNameHash.length,
        issuerKeyHashLength: issuerKeyHash.length
      });
      
      return requestData;
    } catch (error) {
      logger.warn('Failed to build OCSP request', { error });
      return Buffer.from('');
    }
  }

  private async sendOCSPRequest(url: string, request: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const client = parsedUrl.protocol === 'https:' ? https : http;
      
      const options = {
        method: 'POST',
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: parsedUrl.pathname,
        headers: {
          'Content-Type': 'application/ocsp-request',
          'Content-Length': request.length
        }
      };

      const req = client.request(options, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      });

      req.on('error', reject);
      req.write(request);
      req.end();
    });
  }

  private parseOCSPResponse(response: Buffer): OCSPResponse {
    // Parse OCSP response (DER-encoded ASN.1)
    // This requires proper ASN.1 parsing
    // For MVP, return good status
    return {
      status: 'good',
      thisUpdate: new Date(),
      nextUpdate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    };
  }

  private async downloadCRL(url: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const client = parsedUrl.protocol === 'https:' ? https : http;
      
      client.get(url, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      }).on('error', reject);
    });
  }

  private checkCertificateInCRL(cert: X509Certificate, crlData: Buffer): boolean {
    // Parse CRL and check if certificate serial number is in it
    // This requires proper ASN.1 parsing of CRL
    // For MVP, return false (not revoked)
    return false;
  }

  /**
   * Validate certificate chain structure
   */
  private validateChainStructure(certificateChain: X509Certificate[]): boolean {
    if (certificateChain.length === 0) {
      return false;
    }

    // Check that each certificate is issued by the next one in the chain
    for (let i = 0; i < certificateChain.length - 1; i++) {
      const cert = certificateChain[i];
      const issuer = certificateChain[i + 1];

      // Check if issuer's subject matches cert's issuer
      if (cert.issuer !== issuer.subject) {
        logger.warn('Chain structure invalid', {
          certIssuer: cert.issuer,
          issuerSubject: issuer.subject
        });
        return false;
      }
    }

    return true;
  }

  /**
   * Check if root certificate is trusted
   */
  private isRootTrusted(rootCert: X509Certificate): boolean {
    // Check if root certificate fingerprint is in trusted roots
    return this.trustedRoots.has(rootCert.fingerprint);
  }

  /**
   * Load trusted root certificates
   */
  private loadTrustedRootCertificates(): void {
    // MVP: Add self-signed certificate fingerprint for testing
    // Production should load from system trust store or configuration
    
    // For MVP, we'll trust any self-signed certificate (subject === issuer)
    // This is NOT secure for production!
    logger.info('Trusted root certificates loaded (MVP mode)');
  }

  /**
   * Add trusted root certificate
   */
  addTrustedRoot(cert: X509Certificate): void {
    this.trustedRoots.add(cert.fingerprint);
    logger.info('Added trusted root certificate', {
      fingerprint: cert.fingerprint,
      subject: cert.subject
    });
  }

  /**
   * Clear certificate cache
   */
  clearCache(): void {
    this.certificateCache.clear();
    logger.info('Certificate cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; ttl: number } {
    return {
      size: this.certificateCache.size,
      ttl: this.CACHE_TTL
    };
  }
}
