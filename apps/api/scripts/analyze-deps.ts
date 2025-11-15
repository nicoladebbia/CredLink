#!/usr/bin/env ts-node

/**
 * Dependency Analyzer
 * 
 * Analyzes package.json and node_modules to find:
 * - Unused dependencies
 * - Duplicate packages
 * - Large packages
 * - Dependency tree issues
 * 
 * Usage:
 *   ts-node scripts/analyze-deps.ts
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

interface PackageInfo {
  name: string;
  version: string;
  size?: string;
  duplicates?: number;
}

interface AnalysisResult {
  totalPackages: number;
  totalSize: string;
  unused: string[];
  duplicates: Map<string, string[]>;
  large: PackageInfo[];
  devInProd: string[];
}

function getPackageJson(path: string = './package.json'): any {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch (error) {
    console.error('Failed to read package.json:', error);
    process.exit(1);
  }
}

function getDependencySize(packageName: string): string {
  try {
    const result = execSync(
      `du -sh node_modules/${packageName} 2>/dev/null | cut -f1`,
      { encoding: 'utf-8' }
    );
    return result.trim();
  } catch {
    return 'N/A';
  }
}

function findUnusedDependencies(): string[] {
  console.log('\n🔍 Scanning for unused dependencies...');
  
  try {
    // Use depcheck if available
    execSync('npx depcheck --version', { stdio: 'ignore' });
    const result = execSync('npx depcheck --json', { encoding: 'utf-8' });
    const analysis = JSON.parse(result);
    return analysis.dependencies || [];
  } catch {
    console.log('⚠️  depcheck not available, skipping unused dependency analysis');
    return [];
  }
}

function findDuplicates(): Map<string, string[]> {
  console.log('\n🔍 Scanning for duplicate packages...');
  
  const duplicates = new Map<string, string[]>();
  
  try {
    const result = execSync('pnpm list --depth=100 --json 2>/dev/null || npm list --depth=100 --json', {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024
    });
    
    const tree = JSON.parse(result);
    const versions = new Map<string, Set<string>>();
    
    function traverse(node: any) {
      if (node.dependencies) {
        Object.entries(node.dependencies).forEach(([name, dep]: [string, any]) => {
          if (!versions.has(name)) {
            versions.set(name, new Set());
          }
          versions.get(name)!.add(dep.version);
          traverse(dep);
        });
      }
    }
    
    traverse(tree);
    
    versions.forEach((versionSet, name) => {
      if (versionSet.size > 1) {
        duplicates.set(name, Array.from(versionSet));
      }
    });
  } catch (error) {
    console.log('⚠️  Could not analyze duplicates');
  }
  
  return duplicates;
}

function findLargePackages(limit: number = 10): PackageInfo[] {
  console.log('\n🔍 Finding largest packages...');
  
  try {
    const result = execSync(
      'du -sh node_modules/* 2>/dev/null | sort -hr | head -n 20',
      { encoding: 'utf-8' }
    );
    
    const packages: PackageInfo[] = [];
    const lines = result.trim().split('\n');
    
    for (const line of lines.slice(0, limit)) {
      const [size, path] = line.split(/\s+/);
      const name = path.split('/').pop() || 'unknown';
      
      packages.push({ name, version: '', size });
    }
    
    return packages;
  } catch {
    return [];
  }
}

function checkDevDependenciesInProduction(): string[] {
  const pkg = getPackageJson();
  const devDeps = Object.keys(pkg.devDependencies || {});
  const prodDeps = Object.keys(pkg.dependencies || {});
  
  // Check if any dev dependencies are also in production
  return devDeps.filter(dep => prodDeps.includes(dep));
}

function getTotalSize(): string {
  try {
    const result = execSync('du -sh node_modules 2>/dev/null | cut -f1', {
      encoding: 'utf-8'
    });
    return result.trim();
  } catch {
    return 'Unknown';
  }
}

function getTotalPackages(): number {
  try {
    const result = execSync('find node_modules -maxdepth 2 -type d -name "*" | wc -l', {
      encoding: 'utf-8'
    });
    return parseInt(result.trim(), 10) - 1; // Subtract 1 for node_modules itself
  } catch {
    return 0;
  }
}

async function analyze(): Promise<AnalysisResult> {
  console.log('=== Dependency Analyzer ===\n');
  
  if (!existsSync('./node_modules')) {
    console.error('❌ node_modules not found. Run npm/pnpm install first.');
    process.exit(1);
  }
  
  const result: AnalysisResult = {
    totalPackages: getTotalPackages(),
    totalSize: getTotalSize(),
    unused: findUnusedDependencies(),
    duplicates: findDuplicates(),
    large: findLargePackages(),
    devInProd: checkDevDependenciesInProduction(),
  };
  
  return result;
}

function printReport(result: AnalysisResult): void {
  console.log('\n=== Analysis Report ===\n');
  
  console.log('📊 Overview:');
  console.log(`  Total packages: ${result.totalPackages}`);
  console.log(`  Total size: ${result.totalSize}`);
  console.log('');
  
  // Unused dependencies
  if (result.unused.length > 0) {
    console.log('❌ Unused Dependencies:');
    result.unused.forEach(dep => console.log(`  - ${dep}`));
    console.log(`  Total: ${result.unused.length}`);
    console.log('  Recommendation: Remove with: npm uninstall <package>');
    console.log('');
  } else {
    console.log('✅ No unused dependencies found\n');
  }
  
  // Duplicates
  if (result.duplicates.size > 0) {
    console.log('⚠️  Duplicate Packages:');
    result.duplicates.forEach((versions, name) => {
      console.log(`  - ${name}: ${versions.join(', ')}`);
    });
    console.log(`  Total: ${result.duplicates.size}`);
    console.log('  Recommendation: Use pnpm for better deduplication');
    console.log('');
  } else {
    console.log('✅ No duplicate packages found\n');
  }
  
  // Large packages
  if (result.large.length > 0) {
    console.log('📦 Largest Packages:');
    result.large.forEach(pkg => {
      console.log(`  - ${pkg.name}: ${pkg.size}`);
    });
    console.log('  Consider alternatives or lazy-loading');
    console.log('');
  }
  
  // Dev deps in production
  if (result.devInProd.length > 0) {
    console.log('⚠️  Dev Dependencies in Production:');
    result.devInProd.forEach(dep => console.log(`  - ${dep}`));
    console.log('  Move to devDependencies or dependencies, not both');
    console.log('');
  } else {
    console.log('✅ No dev/prod dependency conflicts\n');
  }
  
  // Recommendations
  console.log('💡 Recommendations:');
  console.log('  1. Use pnpm for better disk space efficiency');
  console.log('  2. Use --prod flag when installing for production');
  console.log('  3. Run "npm prune" to remove extraneous packages');
  console.log('  4. Use multi-stage Docker builds');
  console.log('  5. Consider lazy-loading large dependencies');
  console.log('');
  
  // Size calculation
  const sizeMB = result.totalSize.replace(/[^0-9.]/g, '');
  const sizeNum = parseFloat(sizeMB);
  
  if (sizeNum > 500) {
    console.log('⚠️  WARNING: node_modules is very large (>500MB)');
  } else if (sizeNum > 200) {
    console.log('⚠️  node_modules is larger than recommended (>200MB)');
  } else {
    console.log('✅ node_modules size is reasonable');
  }
}

// Run analysis
analyze().then(printReport).catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
