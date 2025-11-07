/**
 * AWS CUR 2.0 Reader
 * Ingests Cost and Usage Reports from S3
 * 
 * Reference: https://docs.aws.amazon.com/cur/latest/userguide/what-is-cur.html
 * Granularity: Hourly/Daily
 * Update frequency: 3× daily
 */

import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { createLogger } from '../../src/utils/logger.js';
import { Readable } from 'stream';
import zlib from 'zlib';
import readline from 'readline';

const logger = createLogger('CURReader');

export class CURReader {
  constructor() {
    this.s3Client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1'
    });
    
    this.bucket = process.env.AWS_CUR_BUCKET;
    this.prefix = process.env.AWS_CUR_PREFIX || 'cur-data/';
    this.reportName = process.env.AWS_CUR_REPORT_NAME || 'hourly-cost-and-usage';
    
    // Security: Validate configuration
    if (!this.bucket) {
      throw new Error('AWS_CUR_BUCKET environment variable is required');
    }
  }

  /**
   * Read latest CUR data from S3
   * Returns parsed cost and usage records
   */
  async readLatest() {
    logger.info('Reading latest CUR data', {
      bucket: this.bucket,
      prefix: this.prefix
    });

    try {
      // List objects to find latest report
      const listCommand = new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: this.prefix,
        MaxKeys: 1000
      });

      const listResponse = await this.s3Client.send(listCommand);
      
      if (!listResponse.Contents || listResponse.Contents.length === 0) {
        logger.warn('No CUR data found in S3');
        return null;
      }

      // Find latest manifest file
      const manifestFiles = listResponse.Contents
        .filter(obj => obj.Key.includes('Manifest.json'))
        .sort((a, b) => b.LastModified - a.LastModified);

      if (manifestFiles.length === 0) {
        logger.warn('No CUR manifest files found');
        return null;
      }

      const latestManifest = manifestFiles[0];
      logger.info('Found latest CUR manifest', { key: latestManifest.Key });

      // Read manifest to get data files
      const manifest = await this.readManifest(latestManifest.Key);
      
      // Read and parse data files
      const records = await this.readDataFiles(manifest);
      
      logger.info('CUR data read successfully', {
        records: records.length,
        billingPeriod: manifest.billingPeriod
      });

      return {
        records,
        manifest,
        readAt: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Failed to read CUR data', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Read and parse CUR manifest file
   */
  async readManifest(key) {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key
      });

      const response = await this.s3Client.send(command);
      const body = await this.streamToString(response.Body);
      const manifest = JSON.parse(body);

      // Security: Validate manifest structure
      if (!manifest.reportKeys || !Array.isArray(manifest.reportKeys)) {
        throw new Error('Invalid manifest structure: missing reportKeys');
      }

      return {
        reportKeys: manifest.reportKeys,
        billingPeriod: manifest.billingPeriod || {},
        assembly: manifest.assembly || {},
        columns: manifest.columns || []
      };
    } catch (error) {
      logger.error('Failed to read manifest', {
        key,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Read and parse CUR data files (CSV format, gzipped)
   */
  async readDataFiles(manifest) {
    const allRecords = [];

    for (const reportKey of manifest.reportKeys) {
      try {
        logger.info('Reading CUR data file', { key: reportKey });

        const command = new GetObjectCommand({
          Bucket: this.bucket,
          Key: reportKey
        });

        const response = await this.s3Client.send(command);
        
        // Handle gzipped CSV
        const records = await this.parseCSV(response.Body, reportKey.endsWith('.gz'));
        allRecords.push(...records);

        logger.info('Data file read successfully', {
          key: reportKey,
          records: records.length
        });
      } catch (error) {
        logger.error('Failed to read data file', {
          key: reportKey,
          error: error.message
        });
        // Continue with other files
      }
    }

    return allRecords;
  }

  /**
   * Parse CSV stream (potentially gzipped)
   */
  async parseCSV(stream, isGzipped) {
    return new Promise((resolve, reject) => {
      const records = [];
      let headers = null;

      // Create readable stream
      const readableStream = Readable.from(stream);
      
      // Decompress if gzipped
      const processStream = isGzipped
        ? readableStream.pipe(zlib.createGunzip())
        : readableStream;

      // Read line by line
      const rl = readline.createInterface({
        input: processStream,
        crlfDelay: Infinity
      });

      rl.on('line', (line) => {
        if (!headers) {
          // First line is headers
          headers = line.split(',').map(h => h.trim().replace(/"/g, ''));
        } else {
          // Parse data line
          const values = this.parseCSVLine(line);
          
          // Security: Limit record size
          if (values.length > 500) {
            logger.warn('Skipping oversized record', { columns: values.length });
            return;
          }

          const record = {};
          headers.forEach((header, i) => {
            record[header] = values[i] || '';
          });
          
          records.push(record);

          // Security: Limit total records per file
          if (records.length >= 100000) {
            logger.warn('Reached max records per file limit');
            rl.close();
          }
        }
      });

      rl.on('close', () => {
        resolve(records);
      });

      rl.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Parse CSV line handling quoted values
   */
  parseCSVLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    values.push(current.trim());
    return values;
  }

  /**
   * Convert stream to string
   */
  async streamToString(stream) {
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString('utf-8');
  }

  /**
   * Transform CUR records to normalized cost facts
   * Maps CUR columns to our internal schema
   */
  transformRecords(records) {
    return records.map(record => {
      // Security: Validate required fields
      if (!record.line_item_usage_account_id || !record.line_item_usage_start_date) {
        logger.warn('Skipping record with missing required fields');
        return null;
      }

      return {
        timestamp: record.line_item_usage_start_date,
        account_id: record.line_item_usage_account_id,
        service: record.product_servicename || 'Unknown',
        usage_type: record.line_item_usage_type || '',
        operation: record.line_item_operation || '',
        resource_id: record.line_item_resource_id || '',
        cost: parseFloat(record.line_item_unblended_cost) || 0,
        usage_amount: parseFloat(record.line_item_usage_amount) || 0,
        usage_unit: record.pricing_unit || '',
        tags: this.extractTags(record),
        raw: record // Keep for debugging
      };
    }).filter(r => r !== null);
  }

  /**
   * Extract resource tags from CUR record
   */
  extractTags(record) {
    const tags = {};
    const tagPrefix = 'resource_tags_user_';

    for (const key of Object.keys(record)) {
      if (key.startsWith(tagPrefix)) {
        const tagName = key.substring(tagPrefix.length);
        tags[tagName] = record[key];
      }
    }

    return tags;
  }
}

export default CURReader;
