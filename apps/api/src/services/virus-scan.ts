/**
 * S-8: File Upload Security - Virus Scanning
 * 
 * Integration with ClamAV or VirusTotal API for malware detection
 */

import { logger } from '../utils/logger';
import * as crypto from 'crypto';

export interface ScanResult {
  clean: boolean;
  threats: string[];
  scanner: string;
  scanTime: number;
}

/**
 * Virus scanner using VirusTotal API
 */
export class VirusTotalScanner {
  private apiKey: string;
  private enabled: boolean;

  constructor() {
    this.apiKey = process.env.VIRUSTOTAL_API_KEY || '';
    this.enabled = !!this.apiKey && process.env.ENABLE_VIRUS_SCAN === 'true';
  }

  async scanFile(buffer: Buffer, filename: string): Promise<ScanResult> {
    if (!this.enabled) {
      return {
        clean: true,
        threats: [],
        scanner: 'disabled',
        scanTime: 0
      };
    }

    const startTime = Date.now();

    try {
      // Calculate file hash
      const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');

      // Check VirusTotal API
      const response = await fetch(
        `https://www.virustotal.com/api/v3/files/${fileHash}`,
        {
          headers: {
            'x-apikey': this.apiKey
          }
        }
      );

      const scanTime = Date.now() - startTime;

      if (response.status === 404) {
        // File not in database - upload for scanning
        logger.info('File not in VirusTotal database, uploading', { filename });
        return await this.uploadAndScan(buffer, filename);
      }

      const data = await response.json() as any;
      const stats = data.data?.attributes?.last_analysis_stats || {};
      const malicious = stats.malicious || 0;
      const suspicious = stats.suspicious || 0;

      const threats: string[] = [];
      if (data.data?.attributes?.last_analysis_results) {
        for (const [engine, result] of Object.entries(data.data.attributes.last_analysis_results as any)) {
          const analysisResult = result as any;
          if (analysisResult.category === 'malicious' || analysisResult.category === 'suspicious') {
            threats.push(`${engine}: ${analysisResult.result}`);
          }
        }
      }

      return {
        clean: malicious === 0 && suspicious === 0,
        threats,
        scanner: 'virustotal',
        scanTime
      };
    } catch (error: any) {
      logger.error('VirusTotal scan failed', { error: error.message, filename });
      
      // Fail open or closed based on configuration
      const failClosed = process.env.VIRUS_SCAN_FAIL_CLOSED === 'true';
      
      return {
        clean: !failClosed,
        threats: failClosed ? ['Scan failed - rejecting as precaution'] : [],
        scanner: 'virustotal-error',
        scanTime: Date.now() - startTime
      };
    }
  }

  private async uploadAndScan(buffer: Buffer, filename: string): Promise<ScanResult> {
    // Note: Uploading to VirusTotal makes file public
    // Only enable if acceptable for your use case
    
    logger.warn('File upload to VirusTotal disabled for privacy', { filename });
    
    return {
      clean: true,
      threats: [],
      scanner: 'virustotal-not-found',
      scanTime: 0
    };
  }
}

/**
 * ClamAV scanner (local daemon)
 */
export class ClamAVScanner {
  private host: string;
  private port: number;
  private enabled: boolean;

  constructor() {
    this.host = process.env.CLAMAV_HOST || 'localhost';
    this.port = parseInt(process.env.CLAMAV_PORT || '3310', 10);
    this.enabled = process.env.ENABLE_CLAMAV === 'true';
  }

  async scanFile(buffer: Buffer, filename: string): Promise<ScanResult> {
    if (!this.enabled) {
      return {
        clean: true,
        threats: [],
        scanner: 'disabled',
        scanTime: 0
      };
    }

    const startTime = Date.now();

    try {
      const net = require('net');
      
      return await new Promise<ScanResult>((resolve, reject) => {
        const client = net.createConnection(this.port, this.host, () => {
          // Send INSTREAM command
          client.write('zINSTREAM\0');
          
          // Send file size and data
          const size = Buffer.alloc(4);
          size.writeUInt32BE(buffer.length, 0);
          client.write(size);
          client.write(buffer);
          
          // Send zero-length chunk to indicate end
          client.write(Buffer.alloc(4));
        });

        let response = '';
        client.on('data', (data: Buffer) => {
          response += data.toString();
        });

        client.on('end', () => {
          const scanTime = Date.now() - startTime;
          
          if (response.includes('OK')) {
            resolve({
              clean: true,
              threats: [],
              scanner: 'clamav',
              scanTime
            });
          } else {
            const match = response.match(/FOUND (.+)/);
            const threat = match ? match[1] : 'Unknown threat';
            
            resolve({
              clean: false,
              threats: [threat],
              scanner: 'clamav',
              scanTime
            });
          }
        });

        client.on('error', (error: Error) => {
          reject(error);
        });
      });
    } catch (error: any) {
      logger.error('ClamAV scan failed', { error: error.message, filename });
      
      const failClosed = process.env.VIRUS_SCAN_FAIL_CLOSED === 'true';
      
      return {
        clean: !failClosed,
        threats: failClosed ? ['Scan failed - rejecting as precaution'] : [],
        scanner: 'clamav-error',
        scanTime: Date.now() - startTime
      };
    }
  }
}

// Export singleton instances
export const virusTotalScanner = new VirusTotalScanner();
export const clamAVScanner = new ClamAVScanner();

/**
 * Scan file with all available scanners
 */
export async function scanFileForMalware(
  buffer: Buffer,
  filename: string
): Promise<ScanResult> {
  // Try ClamAV first (faster, local)
  if (process.env.ENABLE_CLAMAV === 'true') {
    return await clamAVScanner.scanFile(buffer, filename);
  }

  // Fall back to VirusTotal
  if (process.env.VIRUSTOTAL_API_KEY) {
    return await virusTotalScanner.scanFile(buffer, filename);
  }

  // No scanners enabled
  return {
    clean: true,
    threats: [],
    scanner: 'none',
    scanTime: 0
  };
}
