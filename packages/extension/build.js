/**
 * Build Script for C2 Concierge Browser Extension
 * Creates distribution packages for Chrome, Edge, and Safari
 */

import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';
import crypto from 'crypto';

// Build configuration
const BUILD_CONFIG = {
  sourceDir: '.',
  distDir: 'dist',
  browsers: ['chrome', 'edge', 'safari'],
  version: '0.1.0',
  excludePatterns: [
    '**/tests/**',
    '**/docs/**',
    '**/*.test.js',
    '**/build.js',
    '**/README.md',
    'node_modules/**'
  ],
  requiredFiles: [
    'manifest.json',
    'src/bg.js',
    'src/content.js',
    'popup.html',
    'popup.css',
    'popup.js',
    'lib/parse-link.js'
  ]
};

// Main build function
async function build() {
  console.log('🏗️  Building C2 Concierge Extension...');
  
  try {
    // Clean previous builds
    await clean();
    
    // Validate source files
    await validateSource();
    
    // Build for each browser
    for (const browser of BUILD_CONFIG.browsers) {
      await buildForBrowser(browser);
    }
    
    // Generate SBOM
    await generateSBOM();
    
    // Calculate checksums
    await generateChecksums();
    
    console.log('✅ Build completed successfully');
    console.log(`📦 Distribution packages created in: ${BUILD_CONFIG.distDir}`);
    
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

// Clean previous builds
async function clean() {
  console.log('🧹 Cleaning previous builds...');
  
  try {
    await fs.rm(BUILD_CONFIG.distDir, { recursive: true, force: true });
    await fs.mkdir(BUILD_CONFIG.distDir, { recursive: true });
  } catch (error) {
    throw new Error(`Failed to clean build directory: ${error.message}`);
  }
}

// Validate source files exist
async function validateSource() {
  console.log('✅ Validating source files...');
  
  for (const file of BUILD_CONFIG.requiredFiles) {
    const filePath = path.join(BUILD_CONFIG.sourceDir, file);
    try {
      await fs.access(filePath);
    } catch {
      throw new Error(`Required file missing: ${file}`);
    }
  }
  
  // Validate manifest syntax
  try {
    const manifestPath = path.join(BUILD_CONFIG.sourceDir, 'manifest.json');
    const manifestContent = await fs.readFile(manifestPath, 'utf8');
    JSON.parse(manifestContent);
  } catch (error) {
    throw new Error(`Invalid manifest.json: ${error.message}`);
  }
}

// Build for specific browser
async function buildForBrowser(browser) {
  console.log(`🌐 Building for ${browser}...`);
  
  const browserDir = path.join(BUILD_CONFIG.distDir, browser);
  await fs.mkdir(browserDir, { recursive: true });
  
  // Copy files
  await copyFiles(BUILD_CONFIG.sourceDir, browserDir);
  
  // Browser-specific modifications
  switch (browser) {
    case 'chrome':
      await prepareChromeBuild(browserDir);
      break;
    case 'edge':
      await prepareEdgeBuild(browserDir);
      break;
    case 'safari':
      await prepareSafariBuild(browserDir);
      break;
  }
  
  // Create zip package
  await createZipPackage(browserDir, browser);
  
  console.log(`✅ ${browser} build completed`);
}

// Copy files with exclusions
async function copyFiles(srcDir, destDir) {
  const files = await getFilesToCopy(srcDir);
  
  for (const file of files) {
    const srcPath = path.join(srcDir, file);
    const destPath = path.join(destDir, file);
    
    // Ensure destination directory exists
    await fs.mkdir(path.dirname(destPath), { recursive: true });
    
    // Copy file
    await fs.copyFile(srcPath, destPath);
  }
}

// Get list of files to copy
async function getFilesToCopy(dir) {
  const files = [];
  
  async function scan(currentDir, relativePath = '') {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relativeFilePath = path.join(relativePath, entry.name);
      
      if (entry.isDirectory()) {
        await scan(fullPath, relativeFilePath);
      } else {
        // Check if file should be included
        if (shouldIncludeFile(relativeFilePath)) {
          files.push(relativeFilePath);
        }
      }
    }
  }
  
  await scan(dir);
  return files;
}

// Check if file should be included
function shouldIncludeFile(filePath) {
  // Check exclude patterns
  for (const pattern of BUILD_CONFIG.excludePatterns) {
    if (matchesPattern(filePath, pattern)) {
      return false;
    }
  }
  
  return true;
}

// Simple pattern matching (glob-like)
function matchesPattern(filePath, pattern) {
  const regexPattern = pattern
    .replace(/\*\*/g, '.*')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]');
  
  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(filePath);
}

// Prepare Chrome build
async function prepareChromeBuild(buildDir) {
  // Chrome-specific manifest modifications
  const manifestPath = path.join(buildDir, 'manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  
  // Ensure Chrome-specific settings
  manifest.manifest_version = 3;
  manifest.key = await generateExtensionKey();
  
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
}

// Prepare Edge build
async function prepareEdgeBuild(buildDir) {
  // Edge uses same manifest as Chrome
  await prepareChromeBuild(buildDir);
}

// Prepare Safari build
async function prepareSafariBuild(buildDir) {
  // Safari requires Xcode project structure
  const safariDir = path.join(BUILD_CONFIG.distDir, 'safari-xcode');
  await fs.mkdir(safariDir, { recursive: true });
  
  // Copy build to Safari directory
  await copyFiles(buildDir, safariDir);
  
  // Create Safari-specific Info.plist
  const infoPlist = {
    CFBundleDisplayName: 'C2 Concierge',
    CFBundleExecutable: 'C2 Concierge',
    CFBundleIdentifier: 'com.c2concierge.safari-extension',
    CFBundleInfoDictionaryVersion: '6.0',
    CFBundleName: 'C2 Concierge',
    CFBundlePackageType: 'XPC!',
    CFBundleShortVersionString: BUILD_CONFIG.version,
    CFBundleVersion: BUILD_CONFIG.version,
    LSMinimumSystemVersion: '12.0',
    NSHumanReadableCopyright: 'Copyright © 2025 C2 Concierge. All rights reserved.',
    NSExtension: {
      NSExtensionPointIdentifier: 'com.apple.Safari.web-extension',
      NSExtensionPointVersion: '1.0',
      NSExtensionPrincipalClass: 'SafariExtensionHandler'
    }
  };
  
  await fs.writeFile(
    path.join(safariDir, 'Info.plist'),
    JSON.stringify(infoPlist, null, 2)
  );
}

// Generate extension key for Chrome
async function generateExtensionKey() {
  // In production, this would be a fixed key
  // For development, generate a random one
  return crypto.randomBytes(32).toString('base64');
}

// Create zip package
async function createZipPackage(buildDir, browserName) {
  const zipPath = path.join(BUILD_CONFIG.distDir, `${browserName}-extension.zip`);
  
  try {
    execSync(`cd "${buildDir}" && zip -r "../${browserName}-extension.zip" .`, {
      stdio: 'inherit'
    });
  } catch (error) {
    throw new Error(`Failed to create zip package for ${browserName}: ${error.message}`);
  }
}

// Generate SBOM (Software Bill of Materials)
async function generateSBOM() {
  console.log('📋 Generating SBOM...');
  
  const sbom = {
    bomFormat: 'CycloneDX',
    specVersion: '1.4',
    serialNumber: `urn:uuid:${crypto.randomUUID()}`,
    version: 1,
    metadata: {
      timestamp: new Date().toISOString(),
      tools: [
        {
          vendor: 'C2 Concierge',
          name: 'Extension Build Script',
          version: '1.0.0'
        }
      ],
      component: {
        type: 'application',
        name: 'C2 Concierge Browser Extension',
        version: BUILD_CONFIG.version,
        purl: `pkg:npm/c2-concierge-extension@${BUILD_CONFIG.version}`
      }
    },
    components: [
      {
        type: 'library',
        name: 'parse-link.js',
        version: '1.0.0',
        purl: 'pkg:js/c2-concierge/parse-link@1.0.0'
      }
    ]
  };
  
  const sbomPath = path.join(BUILD_CONFIG.distDir, 'sbom.json');
  await fs.writeFile(sbomPath, JSON.stringify(sbom, null, 2));
}

// Generate checksums for all packages
async function generateChecksums() {
  console.log('🔐 Generating checksums...');
  
  const checksums = {};
  
  // Get all zip files
  const files = await fs.readdir(BUILD_CONFIG.distDir);
  const zipFiles = files.filter(file => file.endsWith('.zip'));
  
  for (const file of zipFiles) {
    const filePath = path.join(BUILD_CONFIG.distDir, file);
    const content = await fs.readFile(filePath);
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    checksums[file] = hash;
  }
  
  // Write checksums file
  const checksumsPath = path.join(BUILD_CONFIG.distDir, 'checksums.txt');
  const checksumsContent = Object.entries(checksums)
    .map(([file, hash]) => `${hash}  ${file}`)
    .join('\n');
  
  await fs.writeFile(checksumsPath, checksumsContent);
}

// Command line interface
if (import.meta.url === `file://${process.argv[1]}`) {
  build().catch(console.error);
}

export { build, BUILD_CONFIG };
