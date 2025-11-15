#!/usr/bin/env ts-node

/**
 * Certificate Generation Helper
 * 
 * Generates self-signed certificates for development
 * 
 * Usage:
 *   ts-node scripts/generate-cert.ts [--output-dir <dir>]
 */

import { execSync } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';

interface CertOptions {
  outputDir: string;
  commonName: string;
  organization: string;
  country: string;
  validDays: number;
}

async function generateCertificate(options: CertOptions): Promise<void> {
  console.log('=== Certificate Generation ===\n');
  console.log(`Output directory: ${options.outputDir}`);
  console.log(`Common Name: ${options.commonName}`);
  console.log(`Organization: ${options.organization}`);
  console.log(`Valid for: ${options.validDays} days\n`);
  
  // Ensure output directory exists
  await fs.mkdir(options.outputDir, { recursive: true });
  
  const keyPath = path.join(options.outputDir, 'signing-key.pem');
  const certPath = path.join(options.outputDir, 'signing-cert.pem');
  const csrPath = path.join(options.outputDir, 'signing.csr');
  
  try {
    // Generate private key
    console.log('Generating RSA private key (2048 bits)...');
    execSync(
      `openssl genrsa -out "${keyPath}" 2048`,
      { stdio: 'inherit' }
    );
    console.log(`✓ Private key saved: ${keyPath}\n`);
    
    // Generate CSR
    console.log('Generating Certificate Signing Request...');
    const subject = `/C=${options.country}/O=${options.organization}/CN=${options.commonName}`;
    execSync(
      `openssl req -new -key "${keyPath}" -out "${csrPath}" -subj "${subject}"`,
      { stdio: 'inherit' }
    );
    console.log(`✓ CSR saved: ${csrPath}\n`);
    
    // Generate self-signed certificate
    console.log('Generating self-signed certificate...');
    execSync(
      `openssl x509 -req -days ${options.validDays} -in "${csrPath}" -signkey "${keyPath}" -out "${certPath}"`,
      { stdio: 'inherit' }
    );
    console.log(`✓ Certificate saved: ${certPath}\n`);
    
    // Set proper permissions
    await fs.chmod(keyPath, 0o600);
    console.log(`✓ Set private key permissions: 600\n`);
    
    // Display certificate info
    console.log('=== Certificate Information ===');
    execSync(`openssl x509 -in "${certPath}" -text -noout | head -20`, { stdio: 'inherit' });
    
    console.log('\n=== Files Created ===');
    console.log(`Private Key: ${keyPath}`);
    console.log(`Certificate: ${certPath}`);
    console.log(`CSR: ${csrPath}`);
    
    console.log('\n⚠️  WARNING: This is a self-signed certificate for DEVELOPMENT ONLY');
    console.log('For production, use a certificate from a trusted CA');
    
    console.log('\n✅ Certificate generation complete!');
  } catch (error) {
    console.error('\n❌ Certificate generation failed:', error);
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  const options: CertOptions = {
    outputDir: './certs',
    commonName: 'CredLink Signing Service',
    organization: 'CredLink',
    country: 'US',
    validDays: 365,
  };
  
  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--output-dir':
        options.outputDir = args[++i];
        break;
      case '--common-name':
        options.commonName = args[++i];
        break;
      case '--organization':
        options.organization = args[++i];
        break;
      case '--country':
        options.country = args[++i];
        break;
      case '--valid-days':
        options.validDays = parseInt(args[++i], 10);
        break;
      case '--help':
        console.log('Usage: ts-node scripts/generate-cert.ts [options]');
        console.log('');
        console.log('Options:');
        console.log('  --output-dir <dir>      Output directory (default: ./certs)');
        console.log('  --common-name <name>    Common Name (default: CredLink Signing Service)');
        console.log('  --organization <org>    Organization (default: CredLink)');
        console.log('  --country <code>        Country code (default: US)');
        console.log('  --valid-days <days>     Validity period (default: 365)');
        process.exit(0);
    }
  }
  
  options.outputDir = path.resolve(options.outputDir);
  
  await generateCertificate(options);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
