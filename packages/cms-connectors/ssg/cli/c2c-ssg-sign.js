#!/usr/bin/env node

/**
 * C2 Concierge SSG CLI Tool
 * Pre-publish script for static site generators
 * 
 * Usage: c2c-ssg-sign [options] [directory]
 * 
 * Features:
 * - Walk output directory for images
 * - Call /sign endpoint for each asset
 * - Write .c2pa manifests to manifest store
 * - Inject <link rel="c2pa-manifest"> into HTML
 * - Support for Next.js, Hugo, Jekyll, Eleventy, Astro
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const fetch = require('node-fetch');
const { program } = require('commander');
const chalk = require('chalk');
const glob = require('glob');

class SSGSigner {
  constructor(config = {}) {
    this.config = {
      signUrl: config.signUrl || 'https://verify.c2concierge.org/sign',
      manifestHost: config.manifestHost || 'https://manifests.c2concierge.org',
      manifestDir: config.manifestDir || './c2pa-manifests',
      outputDir: config.outputDir || './public',
      concurrency: config.concurrency || 5,
      includePatterns: config.includePatterns || [
        '**/*.{jpg,jpeg,png,gif,webp,avif,tiff,svg}',
        '!**/node_modules/**',
        '!**/.git/**',
        '!**/c2pa-manifests/**'
      ],
      excludePatterns: config.excludePatterns || [
        '**/*.min.*',
        '**/favicon.*',
        '**/apple-touch-icon.*',
        '**/android-chrome-*'
      ],
      enableTelemetry: config.enableTelemetry !== false,
      analyticsUrl: config.analyticsUrl || 'https://analytics.c2concierge.org/telemetry',
      dryRun: config.dryRun || false,
      verbose: config.verbose || false,
      timeout: config.timeout || 30000,
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 1000,
      maxFileSize: config.maxFileSize || 50 * 1024 * 1024, // 50MB
      minFileSize: config.minFileSize || 1024, // 1KB
      ...config
    };

    this.stats = {
      totalImages: 0,
      processedImages: 0,
      failedImages: 0,
      skippedImages: 0,
      totalHtml: 0,
      modifiedHtml: 0,
      startTime: Date.now(),
      errors: []
    };
    
    this.validateConfig();
  }

  /**
   * CRITICAL: Validate configuration on initialization
   */
  validateConfig() {
    if (!this.config.signUrl || !this.isValidUrl(this.config.signUrl)) {
      throw new Error('Invalid signUrl: must be valid HTTPS URL');
    }
    
    if (!this.config.manifestHost || !this.isValidUrl(this.config.manifestHost)) {
      throw new Error('Invalid manifestHost: must be valid HTTPS URL');
    }
    
    if (!this.config.analyticsUrl || !this.isValidUrl(this.config.analyticsUrl)) {
      throw new Error('Invalid analyticsUrl: must be valid HTTPS URL');
    }
    
    if (typeof this.config.concurrency !== 'number' || this.config.concurrency < 1 || this.config.concurrency > 20) {
      throw new Error('Invalid concurrency: must be between 1 and 20');
    }
    
    if (typeof this.config.timeout !== 'number' || this.config.timeout <= 0) {
      throw new Error('Invalid timeout: must be positive number');
    }
    
    if (typeof this.config.maxFileSize !== 'number' || this.config.maxFileSize <= 0) {
      throw new Error('Invalid maxFileSize: must be positive number');
    }
    
    if (typeof this.config.minFileSize !== 'number' || this.config.minFileSize < 0) {
      throw new Error('Invalid minFileSize: must be non-negative number');
    }
    
    if (this.config.minFileSize >= this.config.maxFileSize) {
      throw new Error('minFileSize must be less than maxFileSize');
    }
  }

  /**
   * CRITICAL: Enhanced URL validation
   */
  isValidUrl(url) {
    if (!url || typeof url !== 'string') return false;
    
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'https:' && parsed.hostname.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Main execution method
   */
  async run(directory = this.config.outputDir) {
    try {
      console.log(chalk.blue.bold('🔐 C2 Concierge SSG Signer'));
      console.log(chalk.gray(`Processing directory: ${directory}`));
      
      // Validate directory
      await this.validateDirectory(directory);
      
      // Create manifest directory
      await this.ensureManifestDirectory();
      
      // Find images to process
      const images = await this.findImages(directory);
      console.log(chalk.yellow(`Found ${images.length} images to process`));
      
      // Process images
      const manifests = await this.processImages(images);
      
      // Find and modify HTML files
      const htmlFiles = await this.findHtmlFiles(directory);
      console.log(chalk.yellow(`Found ${htmlFiles.length} HTML files to modify`));
      
      await this.processHtmlFiles(htmlFiles, manifests);
      
      // Generate summary
      this.generateSummary();
      
      // Send telemetry
      await this.sendTelemetry('ssg_sign_complete', this.stats);
      
      console.log(chalk.green.bold('✅ SSG signing completed successfully!'));
      
    } catch (error) {
      console.error(chalk.red.bold('❌ Error:'), error.message);
      if (this.config.verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  }

  /**
   * CRITICAL: Enhanced directory validation with security checks
   */
  async validateDirectory(directory) {
    if (!directory || typeof directory !== 'string') {
      throw new Error('Invalid directory path');
    }
    
    try {
      const resolvedPath = path.resolve(directory);
      const stat = await fs.stat(resolvedPath);
      
      if (!stat.isDirectory()) {
        throw new Error(`Path is not a directory: ${resolvedPath}`);
      }
      
      // CRITICAL: Check directory permissions
      try {
        await fs.access(resolvedPath, fs.constants.R_OK | fs.constants.W_OK);
      } catch {
        throw new Error(`Insufficient permissions for directory: ${resolvedPath}`);
      }
      
      // CRITICAL: Check for dangerous path components
      if (directory.includes('..') || directory.includes('~')) {
        throw new Error('Dangerous path components detected in directory path');
      }
      
      return resolvedPath;
    } catch (error) {
      throw new Error(`Cannot access directory: ${directory} - ${error.message}`);
    }
  }

  /**
   * CRITICAL: Enhanced manifest directory creation with security
   */
  async ensureManifestDirectory() {
    if (!this.config.manifestDir || typeof this.config.manifestDir !== 'string') {
      throw new Error('Invalid manifest directory path');
    }
    
    try {
      const resolvedPath = path.resolve(this.config.manifestDir);
      
      // CRITICAL: Check for dangerous path components
      if (this.config.manifestDir.includes('..') || this.config.manifestDir.includes('~')) {
        throw new Error('Dangerous path components detected in manifest directory');
      }
      
      await fs.mkdir(resolvedPath, { recursive: true, mode: 0o755 });
      
      // CRITICAL: Verify directory was created and is accessible
      await fs.access(resolvedPath, fs.constants.R_OK | fs.constants.W_OK);
      
      return resolvedPath;
    } catch (error) {
      throw new Error(`Cannot create manifest directory: ${this.config.manifestDir} - ${error.message}`);
    }
  }

  /**
   * CRITICAL: Validate file path to prevent directory traversal
   */
  validateFilePath(filePath, allowedDirectory) {
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('Invalid file path');
    }
    
    // CRITICAL: Resolve absolute paths and check they stay within allowed directory
    const resolvedPath = path.resolve(filePath);
    const resolvedAllowed = path.resolve(allowedDirectory);
    
    if (!resolvedPath.startsWith(resolvedAllowed)) {
      throw new Error('Path traversal detected - file path outside allowed directory');
    }
    
    // CRITICAL: Check for dangerous path components
    if (filePath.includes('..') || filePath.includes('~')) {
      throw new Error('Dangerous path components detected');
    }
    
    return resolvedPath;
  }

  /**
   * Find all image files in directory with security validation
   */
  async findImages(directory) {
    const patterns = this.config.includePatterns.map(pattern => 
      path.join(directory, pattern)
    );

    const allFiles = [];
    
    for (const pattern of patterns) {
      const files = glob.sync(pattern, { 
        cwd: directory,
        absolute: true,
        nodir: true 
      });
      allFiles.push(...files);
    }

    // Filter out excluded patterns
    const filteredFiles = allFiles.filter(file => {
      try {
        // CRITICAL: Validate each file path to prevent traversal
        const validatedPath = this.validateFilePath(file, directory);
        const relativePath = path.relative(directory, validatedPath);
        return !this.config.excludePatterns.some(pattern => 
          minimatch(relativePath, pattern)
        );
      } catch (error) {
        console.warn(chalk.yellow(`Skipping invalid path: ${file} - ${error.message}`));
        return false;
      }
    });

    this.stats.totalImages = filteredFiles.length;
    return filteredFiles;
  }

  /**
   * Process images with concurrency control
   */
  async processImages(images) {
    const manifests = new Map();
    const chunks = this.chunkArray(images, this.config.concurrency);

    for (const chunk of chunks) {
      const chunkPromises = chunk.map(image => this.processImage(image, manifests));
      await Promise.allSettled(chunkPromises);
      
      // Progress indicator
      const progress = Math.round((this.stats.processedImages + this.stats.failedImages + this.stats.skippedImages) / this.stats.totalImages * 100);
      process.stdout.write(`\r${chalk.blue('Progress:')} ${progress}%`);
    }

    console.log(); // New line after progress
    return manifests;
  }

  /**
   * CRITICAL: Process individual image with security validation
   */
  async processImage(imagePath, manifests) {
    try {
      // CRITICAL: Validate image path to prevent directory traversal
      const validatedPath = this.validateFilePath(imagePath, this.config.outputDir);
      
      // Skip if already processed
      const imageHash = await this.generateFileHash(validatedPath);
      const manifestPath = path.join(this.config.manifestDir, `${imageHash}.c2pa`);
      
      try {
        await fs.access(manifestPath);
        this.stats.skippedImages++;
        if (this.config.verbose) {
          console.log(chalk.gray(`Skipping existing manifest: ${validatedPath}`));
        }
        return;
      } catch {
        // Manifest doesn't exist, proceed
      }

      // Skip if too small (likely icon/thumbnail)
      const stat = await fs.stat(validatedPath);
      if (stat.size < 1024) { // Less than 1KB
        this.stats.skippedImages++;
        if (this.config.verbose) {
          console.log(chalk.gray(`Skipping small file: ${validatedPath}`));
        }
        return;
      }

      if (this.config.dryRun) {
        console.log(chalk.blue(`[DRY RUN] Would sign: ${validatedPath}`));
        this.stats.processedImages++;
        return;
      }

      // Read image data
      const imageData = await fs.readFile(validatedPath);
      const base64Data = imageData.toString('base64');

      // Call signing service
      const manifest = await this.signAsset(base64Data, {
        filename: path.basename(validatedPath),
        originalPath: path.relative(process.cwd(), validatedPath),
        fileSize: stat.size,
        ssg: true
      });

      // Write manifest file
      await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

      // Store mapping for HTML injection
      const relativePath = path.relative(this.config.outputDir, imagePath);
      const manifestUrl = `${this.config.manifestHost}/ssg/${imageHash}.c2pa`;
      manifests.set(relativePath, {
        manifestUrl,
        manifestPath,
        imageHash
      });

      this.stats.processedImages++;
      
      if (this.config.verbose) {
        console.log(chalk.green(`✓ Signed: ${imagePath} -> ${manifestUrl}`));
      }

    } catch (error) {
      this.stats.failedImages++;
      console.error(chalk.red(`✗ Failed to sign ${imagePath}:`), error.message);
    }
  }

  /**
   * Generate file hash
   */
  async generateFileHash(filePath) {
    const data = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Sign asset via API
   */
  async signAsset(base64Data, metadata = {}) {
    const response = await fetch(this.config.signUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-C2C-Platform': 'ssg',
        'X-C2C-Version': '1.0.0',
        'User-Agent': 'c2c-ssg-sign/1.0.0'
      },
      body: JSON.stringify({
        asset: {
          data: base64Data,
          type: 'base64'
        },
        metadata: {
          platform: 'ssg',
          timestamp: new Date().toISOString(),
          remoteOnly: true,
          ...metadata
        }
      }),
      timeout: 30000
    });

    if (!response.ok) {
      throw new Error(`Signing failed: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    
    if (!result.manifest_url) {
      throw new Error('No manifest URL returned from signing service');
    }

    return result;
  }

  /**
   * Find HTML files
   */
  async findHtmlFiles(directory) {
    const htmlFiles = glob.sync('**/*.html', { 
      cwd: directory,
      absolute: true,
      nodir: true 
    });

    this.stats.totalHtml = htmlFiles.length;
    return htmlFiles;
  }

  /**
   * Process HTML files and inject manifest links
   */
  async processHtmlFiles(htmlFiles, manifests) {
    for (const htmlFile of htmlFiles) {
      try {
        await this.processHtmlFile(htmlFile, manifests);
      } catch (error) {
        console.error(chalk.red(`✗ Failed to process HTML ${htmlFile}:`), error.message);
      }
    }
  }

  /**
   * Process individual HTML file
   */
  async processHtmlFile(htmlFile, manifests) {
    let content = await fs.readFile(htmlFile, 'utf8');
    let modified = false;

    // Extract image paths from HTML
    const imagePaths = this.extractImagePaths(content, htmlFile);

    for (const imagePath of imagePaths) {
      const manifest = manifests.get(imagePath);
      if (manifest) {
        // Inject manifest link
        const linkTag = `<link rel="c2pa-manifest" href="${manifest.manifestUrl}">`;
        
        // Insert after <head> or before </head>
        if (content.includes('<head>')) {
          content = content.replace('<head>', `<head>\n    ${linkTag}`);
        } else if (content.includes('</head>')) {
          content = content.replace('</head>', `    ${linkTag}\n</head>`);
        }
        
        // Add data attributes to img tag
        const imgTag = `src="${imagePath}"`;
        const imgWithManifest = `src="${imagePath}" data-c2pa-manifest="${manifest.manifestUrl}" data-c2pa-hash="${manifest.imageHash}"`;
        content = content.replace(imgTag, imgWithManifest);
        
        modified = true;
        
        if (this.config.verbose) {
          console.log(chalk.green(`✓ Added manifest to ${htmlFile} for ${imagePath}`));
        }
      }
    }

    if (modified && !this.config.dryRun) {
      await fs.writeFile(htmlFile, content);
      this.stats.modifiedHtml++;
    }
  }

  /**
   * Extract image paths from HTML content
   */
  extractImagePaths(content, htmlFile) {
    const imagePaths = [];
    const htmlDir = path.dirname(htmlFile);
    
    // Extract from img tags
    const imgRegex = /<img[^>]+src="([^">]+)"/g;
    let match;
    
    while ((match = imgRegex.exec(content)) !== null) {
      const src = match[1];
      
      // Skip data URLs, external URLs, and anchors
      if (src.startsWith('data:') || 
          src.startsWith('http://') || 
          src.startsWith('https://') ||
          src.startsWith('#')) {
        continue;
      }
      
      // Convert relative path to be relative to output directory
      const absolutePath = path.resolve(htmlDir, src);
      const relativePath = path.relative(this.config.outputDir, absolutePath);
      
      imagePaths.push(relativePath);
    }

    // Extract from picture tags
    const pictureRegex = /<picture[^>]*>(.*?)<\/picture>/gs;
    let pictureMatch;
    
    while ((pictureMatch = pictureRegex.exec(content)) !== null) {
      const pictureContent = pictureMatch[1];
      const sourceRegex = /<source[^>]+srcset="([^">]+)"/g;
      
      while ((match = sourceRegex.exec(pictureContent)) !== null) {
        const srcset = match[1];
        const sources = srcset.split(',').map(s => s.trim().split(' ')[0]);
        
        sources.forEach(src => {
          if (!src.startsWith('data:') && 
              !src.startsWith('http://') && 
              !src.startsWith('https://')) {
            const absolutePath = path.resolve(htmlDir, src);
            const relativePath = path.relative(this.config.outputDir, absolutePath);
            imagePaths.push(relativePath);
          }
        });
      }
    }

    return [...new Set(imagePaths)]; // Remove duplicates
  }

  /**
   * Send telemetry data
   */
  async sendTelemetry(event, data) {
    if (!this.config.enableTelemetry) return;

    try {
      await fetch(this.config.analyticsUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'c2c-ssg-sign/1.0.0'
        },
        body: JSON.stringify({
          event,
          platform: 'ssg',
          version: '1.0.0',
          timestamp: new Date().toISOString(),
          duration: Date.now() - this.stats.startTime,
          ...data
        }),
        timeout: 5000
      });
    } catch (error) {
      // Silently fail telemetry
      if (this.config.verbose) {
        console.warn(chalk.yellow('Telemetry failed:'), error.message);
      }
    }
  }

  /**
   * Generate execution summary
   */
  generateSummary() {
    const duration = Date.now() - this.stats.startTime;
    
    console.log(chalk.blue.bold('\n📊 Execution Summary:'));
    console.log(chalk.gray(`Duration: ${(duration / 1000).toFixed(2)}s`));
    console.log(chalk.gray(`Images processed: ${this.stats.processedImages}/${this.stats.totalImages}`));
    console.log(chalk.gray(`Images failed: ${this.stats.failedImages}`));
    console.log(chalk.gray(`Images skipped: ${this.stats.skippedImages}`));
    console.log(chalk.gray(`HTML files modified: ${this.stats.modifiedHtml}/${this.stats.totalHtml}`));
    console.log(chalk.gray(`Manifests stored in: ${this.config.manifestDir}`));
    
    if (this.stats.failedImages > 0) {
      console.log(chalk.yellow(`⚠️  ${this.stats.failedImages} images failed to sign`));
    }
  }

  /**
   * Utility: Chunk array for concurrency
   */
  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}

// CLI setup
program
  .name('c2c-ssg-sign')
  .description('C2 Concierge SSG signing tool for static site generators')
  .version('1.0.0');

program
  .argument('[directory]', 'Output directory to process', './public')
  .option('-d, --dry-run', 'Show what would be processed without making changes')
  .option('-v, --verbose', 'Enable verbose logging')
  .option('-c, --concurrency <number>', 'Number of concurrent sign operations', '5')
  .option('--sign-url <url>', 'Custom signing service URL')
  .option('--manifest-host <url>', 'Custom manifest host URL')
  .option('--manifest-dir <path>', 'Directory to store manifests', './c2pa-manifests')
  .option('--no-telemetry', 'Disable usage telemetry')
  .action(async (directory, options) => {
    const config = {
      ...options,
      concurrency: parseInt(options.concurrency) || 5
    };
    
    const signer = new SSGSigner(config);
    await signer.run(directory);
  });

// Parse command line arguments
program.parse();

// Export for use as module
module.exports = SSGSigner;
