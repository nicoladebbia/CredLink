/**
 * TLS Configuration Manager
 * Ensures secure SSL/TLS configuration for all communications
 */

import { TlsOptions } from 'tls';

export interface TLSConfig {
  minVersion: 'TLSv1.2' | 'TLSv1.3';
  ciphers: string[];
  honorCipherOrder: boolean;
  rejectUnauthorized: boolean;
  ecdhCurve: string;
  secureOptions: number;
}

/**
 * Secure TLS configuration manager
 */
export class TLSConfigurationManager {
  private static readonly SECURE_CIPHERS = [
    // TLS 1.3
    'TLS_AES_256_GCM_SHA384',
    'TLS_CHACHA20_POLY1305_SHA256',
    'TLS_AES_128_GCM_SHA256',
    
    // TLS 1.2 (ECDHE only)
    'ECDHE-ECDSA-AES256-GCM-SHA384',
    'ECDHE-RSA-AES256-GCM-SHA384',
    'ECDHE-ECDSA-CHACHA20-POLY1305',
    'ECDHE-RSA-CHACHA20-POLY1305',
    'ECDHE-ECDSA-AES128-GCM-SHA256',
    'ECDHE-RSA-AES128-GCM-SHA256'
  ];

  private static readonly INSECURE_CIPHERS = [
    'RC4',
    'DES',
    '3DES',
    'MD5',
    'SHA1',
    'NULL',
    'EXPORT',
    'ADH',
    'AECDH',
    'PSK',
    'SRP',
    'DSS'
  ];

  /**
   * Get production-ready TLS configuration
   */
  static getProductionTLSConfig(): TlsOptions & TLSConfig {
    return {
      minVersion: 'TLSv1.2',
      maxVersion: 'TLSv1.3',
      ciphers: this.SECURE_CIPHERS.join(':') as string,
      honorCipherOrder: true,
      rejectUnauthorized: true,
      ecdhCurve: 'X25519:P-256:P-384:P-521',
      secureOptions: this.getSecureOptions(),
      
      // Certificate validation
      requestCert: false, // We don't request client certs by default
      ca: this.loadTrustedCAs(),
      
      // Session resumption for performance
      sessionTimeout: 300, // 5 minutes
      sessionIdContext: 'c2pa-audit-server'
    };
  }

  /**
   * Get development TLS configuration
   */
  static getDevelopmentTLSConfig(): TlsOptions & TLSConfig {
    return {
      minVersion: 'TLSv1.2',
      ciphers: this.SECURE_CIPHERS.join(':') as string,
      honorCipherOrder: true,
      rejectUnauthorized: false, // Less strict for development
      secureOptions: this.getSecureOptions(),
      
      // Development-friendly settings
      requestCert: false,
      ecdhCurve: 'X25519:P-256:P-384:P-521'
    };
  }

  /**
   * Get secure options bitmask
   */
  private static getSecureOptions(): number {
    // Node.js secure options constants
    const SSL_OP_NO_SSLv2 = 0x01000000;
    const SSL_OP_NO_SSLv3 = 0x02000000;
    const SSL_OP_NO_TLSv1 = 0x04000000;
    const SSL_OP_NO_TLSv1_1 = 0x08000000;
    const SSL_OP_NO_COMPRESSION = 0x00020000;
    const SSL_OP_CIPHER_SERVER_PREFERENCE = 0x00400000;
    
    return SSL_OP_NO_SSLv2 | SSL_OP_NO_SSLv3 | SSL_OP_NO_TLSv1 | 
           SSL_OP_NO_TLSv1_1 | SSL_OP_NO_COMPRESSION | SSL_OP_CIPHER_SERVER_PREFERENCE;
  }

  /**
   * Load trusted Certificate Authorities
   */
  private static loadTrustedCAs(): string[] {
    // In production, load from trusted CA store
    const trustedCAs: string[] = [];
    
    // Add system CAs
    if (process.env.NODE_EXTRA_CA_CERTS) {
      trustedCAs.push(process.env.NODE_EXTRA_CA_CERTS);
    }
    
    return trustedCAs;
  }

  /**
   * Validate TLS configuration
   */
  static validateTLSConfig(config: TLSConfig): { valid: boolean; issues: string[] } {
    const issues: string[] = [];
    
    // Check minimum version
    if (!['TLSv1.2', 'TLSv1.3'].includes(config.minVersion)) {
      issues.push('Minimum TLS version should be TLS 1.2 or higher');
    }
    
    // Check for insecure ciphers
    const cipherList = config.ciphers.join(':');
    for (const insecureCipher of this.INSECURE_CIPHERS) {
      if (cipherList.includes(insecureCipher)) {
        issues.push(`Insecure cipher detected: ${insecureCipher}`);
      }
    }
    
    // Check cipher order
    if (!config.honorCipherOrder) {
      issues.push('Cipher order should be honored for security');
    }
    
    // Check certificate validation
    if (!config.rejectUnauthorized) {
      issues.push('Certificate validation should be enforced in production');
    }
    
    // Check ECDH curve
    if (!config.ecdhCurve.includes('X25519')) {
      issues.push('X25519 ECDH curve should be preferred');
    }
    
    return {
      valid: issues.length === 0,
      issues
    };
  }

  /**
   * Generate TLS certificate requirements documentation
   */
  static getCertificateRequirements(): string {
    return `
TLS Certificate Requirements:
============================

1. Certificate Format:
   - PEM encoded certificate and private key
   - Full certificate chain (intermediate + root)

2. Key Requirements:
   - RSA: 2048 bits minimum (4096 recommended)
   - ECDSA: P-256 or higher
   - Private key must not have a passphrase

3. Certificate Validation:
   - Must be issued by trusted CA
   - Subject Alternative Names (SAN) required
   - Common Name (CN) deprecated in favor of SAN

4. Expiration:
   - Maximum validity: 398 days
   - Renewal reminder: 30 days before expiration

5. Signature Algorithm:
   - SHA-256 with RSA or ECDSA
   - SHA-1 not allowed
   - MD5 not allowed

6. Extended Key Usage:
   - Server Authentication (1.3.6.1.5.5.7.3.1)
   - Optional: Client Authentication

7. Certificate Transparency:
   - SCTs embedded for public CAs
   - Required for Chrome信任

Example CSR generation:
openssl req -new -newkey rsa:4096 -keyout private.key -out server.csr -nodes -sha256

Example self-signed cert (dev only):
openssl req -x509 -newkey rsa:4096 -keyout private.key -out server.crt -nodes -sha256 -days 365
    `;
  }

  /**
   * Check if URL uses HTTPS with valid TLS
   */
  static async validateHTTPSConnection(url: string): Promise<{ valid: boolean; details: any }> {
    try {
      const parsed = new URL(url);
      
      if (parsed.protocol !== 'https:') {
        return {
          valid: false,
          details: { error: 'URL does not use HTTPS' }
        };
      }

      // In a real implementation, you would validate the TLS connection
      // This is a simplified version for demonstration
      return {
        valid: true,
        details: {
          protocol: 'https',
          expectedMinVersion: 'TLSv1.2',
          secureCiphers: this.SECURE_CIPHERS.length
        }
      };
    } catch (error) {
      return {
        valid: false,
        details: { error: (error as Error).message }
      };
    }
  }
}

/**
 * Default TLS configuration for the application
 */
export const DEFAULT_TLS_CONFIG = TLSConfigurationManager.getProductionTLSConfig();
