# Phase 30 Variant Linking - Tooling & Debug
# Comprehensive tooling guide for development, debugging, and CI/CD integration

## 1. c2patool Integration

### Low-Level Manifest Analysis
```bash
# Extract and display full manifest structure
c2patool -d asset.jpg

# Output manifest to JSON file
c2patool -d asset.jpg -o manifest.json

# Extract ingredient tree
c2patool -d asset.jpg --output ingredient_tree.json

# Generate assertion thumbnails
c2patool -d asset.jpg --output assertion_thumbs/

# Detailed validation with spec references
c2patool -d asset.jpg --info --verbose
```

### Variant Chain Analysis
```bash
# Analyze parent-child relationships
c2patool -d child_asset.jpg --info | jq '.ingredients[] | select(.relationship == "parentOf")'

# Compare parent and child manifests
c2patool -d parent.jpg -o parent.json
c2patool -d child.jpg -o child.json
diff parent.json child.json

# Validate hashed URIs
c2patool -d asset.jpg --info | jq '.assertions[] | .hashed_uri'

# Extract action parameters
c2patool -d asset.jpg --info | jq '.assertions[] | select(.label == "c2pa.actions") | .data.actions[]'
```

### Batch Processing for CI/CD
```bash
#!/bin/bash
# ci-variant-validation.sh

set -e

ASSETS_DIR="$1"
OUTPUT_DIR="$2"
FAILED_VALIDATIONS=0

mkdir -p "$OUTPUT_DIR"

echo "🔍 Starting C2PA variant validation..."
echo "Assets directory: $ASSETS_DIR"
echo "Output directory: $OUTPUT_DIR"

# Process all C2PA-enabled assets
find "$ASSETS_DIR" -type f \( -name "*.jpg" -o -name "*.jpeg" -o -name "*.png" -o -name "*.webp" \) | while read asset; do
    echo "📋 Processing: $asset"
    
    # Extract manifest
    if c2patool -d "$asset" -o "$OUTPUT_DIR/$(basename "$asset").json" 2>/dev/null; then
        echo "✅ Manifest extracted successfully"
        
        # Validate structure
        if c2patool -d "$asset" --info --validate 2>/dev/null; then
            echo "✅ Validation passed"
        else
            echo "❌ Validation failed"
            FAILED_VALIDATIONS=$((FAILED_VALIDATIONS + 1))
        fi
        
        # Check for variant linking
        if c2patool -d "$asset" --info | grep -q "parentOf\|componentOf"; then
            echo "🔗 Variant linking detected"
            c2patool -d "$asset" --info > "$OUTPUT_DIR/$(basename "$asset").lineage.txt"
        fi
        
    else
        echo "⚠️  No C2PA manifest found"
    fi
    
    echo "---"
done

echo "📊 Validation Summary:"
echo "Failed validations: $FAILED_VALIDATIONS"

if [ $FAILED_VALIDATIONS -gt 0 ]; then
    echo "❌ CI/CD validation failed"
    exit 1
else
    echo "✅ CI/CD validation passed"
    exit 0
fi
```

## 2. Debug Scripts

### Variant Chain Debugger
```typescript
// debug-variant-chain.ts
import { ManifestParser } from './src/core/parser';
import { VariantValidator } from './src/core/variant-validator';
import { VariantLinker } from './src/core/variant-linker';
import * as fs from 'fs';
import * as path from 'path';

interface DebugOptions {
  verbose: boolean;
  outputDir: string;
  validateParents: boolean;
  checkLinks: boolean;
}

class VariantChainDebugger {
  constructor(private options: DebugOptions) {}

  async debugAsset(assetPath: string): Promise<void> {
    console.log(`🔍 Debugging variant chain for: ${assetPath}`);
    
    try {
      // 1. Parse manifest
      const manifest = await this.parseManifest(assetPath);
      
      // 2. Analyze structure
      const structureAnalysis = this.analyzeStructure(manifest);
      this.outputAnalysis('structure', structureAnalysis);
      
      // 3. Validate variant linking
      const validationResult = await this.validateVariantLinking(manifest);
      this.outputAnalysis('validation', validationResult);
      
      // 4. Check parent relationships
      if (this.options.validateParents) {
        const parentAnalysis = await this.analyzeParents(manifest);
        this.outputAnalysis('parents', parentAnalysis);
      }
      
      // 5. Verify Link headers
      if (this.options.checkLinks) {
        const linkAnalysis = await this.verifyLinks(assetPath);
        this.outputAnalysis('links', linkAnalysis);
      }
      
      // 6. Generate visualization
      await this.generateVisualization(manifest);
      
      console.log('✅ Debugging complete');
      
    } catch (error) {
      console.error('❌ Debugging failed:', error);
      throw error;
    }
  }

  private async parseManifest(assetPath: string): Promise<any> {
    console.log('📋 Parsing manifest...');
    
    const assetBuffer = fs.readFileSync(assetPath);
    const manifest = await ManifestParser.parseManifest(assetBuffer);
    
    if (this.options.verbose) {
      console.log('Manifest structure:');
      console.log(JSON.stringify(manifest, null, 2));
    }
    
    return manifest;
  }

  private analyzeStructure(manifest: any): any {
    console.log('🏗️  Analyzing structure...');
    
    const analysis = {
      manifestHash: manifest.manifest_hash,
      claimGenerator: manifest.claim_generator,
      timestamp: manifest.timestamp,
      assertionCount: manifest.assertions?.length || 0,
      ingredientCount: manifest.ingredients?.length || 0,
      hasActions: manifest.assertions?.some(a => a.label === 'c2pa.actions'),
      hasParentIngredient: manifest.ingredients?.some(i => i.relationship === 'parentOf'),
      hasComponentIngredients: manifest.ingredients?.some(i => i.relationship === 'componentOf'),
      actionTypes: this.extractActionTypes(manifest)
    };
    
    console.log('Structure analysis:', analysis);
    return analysis;
  }

  private async validateVariantLinking(manifest: any): Promise<any> {
    console.log('✅ Validating variant linking...');
    
    const validation = await VariantValidator.validateVariantManifest(manifest);
    
    if (this.options.verbose) {
      console.log('Validation steps:');
      validation.steps.forEach(step => {
        console.log(`  ${step.name}: ${step.result ? '✅' : '❌'} ${step.code}`);
        if (!step.result && step.error) {
          console.log(`    Error: ${step.error}`);
        }
      });
    }
    
    return validation;
  }

  private async analyzeParents(manifest: any): Promise<any> {
    console.log('👨‍👦 Analyzing parent relationships...');
    
    const parentIngredients = manifest.ingredients?.filter(i => i.relationship === 'parentOf') || [];
    
    const analysis = {
      parentCount: parentIngredients.length,
      parents: []
    };
    
    for (const parent of parentIngredients) {
      const parentAnalysis = {
        activeManifest: parent.active_manifest,
        claimSignature: parent.claim_signature,
        hashedUri: parent.hashed_uri,
        validationStatus: parent.validation_status
      };
      
      // Try to fetch parent manifest
      try {
        if (parent.asset_url) {
          const parentManifest = await this.fetchRemoteManifest(parent.asset_url);
          parentAnalysis.parentExists = true;
          parentAnalysis.parentValid = parentManifest.manifest_hash === parent.active_manifest;
        }
      } catch (error) {
        parentAnalysis.parentExists = false;
        parentAnalysis.error = error instanceof Error ? error.message : 'Unknown error';
      }
      
      analysis.parents.push(parentAnalysis);
    }
    
    console.log('Parent analysis:', analysis);
    return analysis;
  }

  private async verifyLinks(assetPath: string): Promise<any> {
    console.log('🔗 Verifying Link headers...');
    
    // Extract base URL from asset path
    const baseUrl = this.extractBaseUrl(assetPath);
    
    const analysis = {
      baseUrl,
      linkHeaders: [],
      accessibleManifests: []
    };
    
    // Check common variant URLs
    const variantUrls = this.generateVariantUrls(baseUrl);
    
    for (const url of variantUrls) {
      try {
        const response = await fetch(url, { method: 'HEAD' });
        const linkHeader = response.headers.get('Link');
        
        if (linkHeader) {
          const manifestUrl = this.extractManifestUrlFromLink(linkHeader);
          analysis.linkHeaders.push({
            url,
            linkHeader,
            manifestUrl
          });
          
          // Check if manifest is accessible
          if (manifestUrl) {
            try {
              const manifestResponse = await fetch(manifestUrl, { method: 'HEAD' });
              analysis.accessibleManifests.push({
                manifestUrl,
                accessible: manifestResponse.ok,
                status: manifestResponse.status
              });
            } catch (error) {
              analysis.accessibleManifests.push({
                manifestUrl,
                accessible: false,
                error: error instanceof Error ? error.message : 'Unknown error'
              });
            }
          }
        }
      } catch (error) {
        console.warn(`Failed to check ${url}:`, error);
      }
    }
    
    console.log('Link analysis:', analysis);
    return analysis;
  }

  private async generateVisualization(manifest: any): Promise<void> {
    console.log('📊 Generating visualization...');
    
    const dotContent = this.generateDotGraph(manifest);
    const outputPath = path.join(this.options.outputDir, 'variant-graph.dot');
    
    fs.writeFileSync(outputPath, dotContent);
    
    // Generate SVG if Graphviz is available
    try {
      const { exec } = require('child_process');
      exec(`dot -Tsvg ${outputPath} -o ${outputPath}.svg`, (error) => {
        if (!error) {
          console.log(`📈 Visualization saved: ${outputPath}.svg`);
        }
      });
    } catch {
      console.log(`📈 DOT graph saved: ${outputPath}`);
    }
  }

  private generateDotGraph(manifest: any): string {
    let dot = 'digraph VariantChain {\n';
    dot += '  rankdir=TB;\n';
    dot += '  node [shape=box, style=filled];\n';
    
    // Add current manifest
    const currentId = manifest.manifest_hash.substring(0, 8);
    dot += `  "${currentId}" [label="${manifest.claim_generator}\\n${currentId}", fillcolor=lightblue];\n`;
    
    // Add parent relationships
    if (manifest.ingredients) {
      for (const ingredient of manifest.ingredients) {
        if (ingredient.relationship === 'parentOf') {
          const parentId = ingredient.active_manifest.substring(0, 8);
          dot += `  "${parentId}" [label="Parent\\n${parentId}", fillcolor=lightgreen];\n`;
          dot += `  "${parentId}" -> "${currentId}" [label="parentOf"];\n`;
        } else if (ingredient.relationship === 'componentOf') {
          const componentId = ingredient.active_manifest.substring(0, 8);
          dot += `  "${componentId}" [label="Component\\n${componentId}", fillcolor=orange];\n`;
          dot += `  "${componentId}" -> "${currentId}" [label="componentOf", style=dashed];\n`;
        }
      }
    }
    
    dot += '}\n';
    return dot;
  }

  private extractActionTypes(manifest: any): string[] {
    const actionsAssertion = manifest.assertions?.find(a => a.label === 'c2pa.actions');
    return actionsAssertion?.data?.actions?.map(a => a.type) || [];
  }

  private async fetchRemoteManifest(url: string): Promise<any> {
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    return ManifestParser.parseManifest(buffer);
  }

  private extractBaseUrl(assetPath: string): string {
    // Convert local path to URL format for testing
    const filename = path.basename(assetPath, path.extname(assetPath));
    return `https://cdn.example.com/media/${filename}`;
  }

  private generateVariantUrls(baseUrl: string): string[] {
    return [
      baseUrl,
      `${baseUrl}?w=800`,
      `${baseUrl}?w=1200&h=800`,
      `${baseUrl}?format=webp`,
      `${baseUrl}?w=800&format=webp`,
      `${baseUrl}?w=400&h=400&fit=crop`
    ];
  }

  private extractManifestUrlFromLink(linkHeader: string): string | null {
    const match = linkHeader.match(/<([^>]+)>;\s*rel="c2pa-manifest"/);
    return match ? match[1] : null;
  }

  private outputAnalysis(type: string, analysis: any): void {
    const outputPath = path.join(this.options.outputDir, `${type}-analysis.json`);
    fs.writeFileSync(outputPath, JSON.stringify(analysis, null, 2));
    console.log(`📄 ${type} analysis saved: ${outputPath}`);
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.log('Usage: ts-node debug-variant-chain.ts <asset-path> [options]');
    console.log('Options:');
    console.log('  --verbose     Enable verbose output');
    console.log('  --output-dir  Output directory (default: ./debug-output)');
    console.log('  --validate-parents  Validate parent manifests');
    console.log('  --check-links  Verify Link headers');
    process.exit(1);
  }
  
  const assetPath = args[0];
  const options: DebugOptions = {
    verbose: args.includes('--verbose'),
    outputDir: args.find(arg => arg.startsWith('--output-dir='))?.split('=')[1] || './debug-output',
    validateParents: args.includes('--validate-parents'),
    checkLinks: args.includes('--check-links')
  };
  
  // Ensure output directory exists
  if (!fs.existsSync(options.outputDir)) {
    fs.mkdirSync(options.outputDir, { recursive: true });
  }
  
  const debugger = new VariantChainDebugger(options);
  await debugger.debugAsset(assetPath);
}

if (require.main === module) {
  main().catch(console.error);
}

export { VariantChainDebugger };
```

### Performance Profiler
```typescript
// performance-profiler.ts
import { performance } from 'perf_hooks';

interface ProfileEntry {
  operation: string;
  startTime: number;
  endTime: number;
  duration: number;
  metadata?: Record<string, any>;
}

class VariantLinkingProfiler {
  private entries: ProfileEntry[] = [];
  private currentOperations = new Map<string, number>();

  startOperation(operation: string, metadata?: Record<string, any>): string {
    const operationId = `${operation}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = performance.now();
    
    this.currentOperations.set(operationId, startTime);
    
    if (this.verbose) {
      console.log(`⏱️  Started: ${operation} (${operationId})`);
    }
    
    return operationId;
  }

  endOperation(operationId: string, metadata?: Record<string, any>): void {
    const startTime = this.currentOperations.get(operationId);
    if (!startTime) {
      console.warn(`Operation not found: ${operationId}`);
      return;
    }
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    const entry: ProfileEntry = {
      operation: operationId.split('_')[0],
      startTime,
      endTime,
      duration,
      metadata
    };
    
    this.entries.push(entry);
    this.currentOperations.delete(operationId);
    
    if (this.verbose) {
      console.log(`✅ Completed: ${entry.operation} in ${duration.toFixed(2)}ms`);
    }
  }

  getProfileReport(): {
    totalOperations: number;
    totalDuration: number;
    averageDuration: number;
    slowestOperations: ProfileEntry[];
    operationBreakdown: Record<string, { count: number; totalDuration: number; averageDuration: number }>;
  } {
    const totalOperations = this.entries.length;
    const totalDuration = this.entries.reduce((sum, entry) => sum + entry.duration, 0);
    const averageDuration = totalOperations > 0 ? totalDuration / totalOperations : 0;
    
    const slowestOperations = this.entries
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 10);
    
    const operationBreakdown: Record<string, { count: number; totalDuration: number; averageDuration: number }> = {};
    
    for (const entry of this.entries) {
      if (!operationBreakdown[entry.operation]) {
        operationBreakdown[entry.operation] = {
          count: 0,
          totalDuration: 0,
          averageDuration: 0
        };
      }
      
      const breakdown = operationBreakdown[entry.operation];
      breakdown.count++;
      breakdown.totalDuration += entry.duration;
      breakdown.averageDuration = breakdown.totalDuration / breakdown.count;
    }
    
    return {
      totalOperations,
      totalDuration,
      averageDuration,
      slowestOperations,
      operationBreakdown
    };
  }

  checkSLOCompliance(slos: Record<string, number>): {
    compliant: boolean;
    violations: Array<{ operation: string; actual: number; target: number; violation: number }>;
  } {
    const violations: Array<{ operation: string; actual: number; target: number; violation: number }> = [];
    
    for (const [operation, target] of Object.entries(slos)) {
      const operationEntries = this.entries.filter(e => e.operation === operation);
      if (operationEntries.length === 0) continue;
      
      const p95 = this.calculatePercentile(operationEntries.map(e => e.duration), 95);
      
      if (p95 > target) {
        violations.push({
          operation,
          actual: p95,
          target,
          violation: p95 - target
        });
      }
    }
    
    return {
      compliant: violations.length === 0,
      violations
    };
  }

  private calculatePercentile(values: number[], percentile: number): number {
    const sorted = values.sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  reset(): void {
    this.entries = [];
    this.currentOperations.clear();
  }

  constructor(private verbose: boolean = false) {}
}

// Usage example
const profiler = new VariantLinkingProfiler(true);

// Profile variant linking operations
const validationId = profiler.startOperation('variant_validation');
// ... perform validation ...
profiler.endOperation(validationId, { manifestSize: 1024 });

const cacheId = profiler.startOperation('cache_lookup');
// ... perform cache lookup ...
profiler.endOperation(cacheId, { cacheHit: true });

// Generate report
const report = profiler.getProfileReport();
console.log('Profile Report:', JSON.stringify(report, null, 2));

// Check SLO compliance
const slos = {
  variant_validation: 600,  // 600ms target
  cache_lookup: 3          // 3ms target
};

const compliance = profiler.checkSLOCompliance(slos);
console.log('SLO Compliance:', compliance);
```

## 3. CI/CD Integration

### GitHub Actions Workflow
```yaml
# .github/workflows/variant-linking-ci.yml
name: C2PA Variant Linking CI

on:
  push:
    branches: [ main, develop ]
    paths: [ 'src/**', 'tests/**' ]
  pull_request:
    branches: [ main ]
    paths: [ 'src/**', 'tests/**' ]

jobs:
  variant-linking-tests:
    runs-on: ubuntu-latest
    
    strategy:
      matrix:
        node-version: [18, 20]
    
    steps:
    - name: Checkout code
      uses: actions/checkout@v4
    
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: ${{ matrix.node-version }}
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run TypeScript compilation
      run: npm run typecheck
    
    - name: Run linting
      run: npm run lint
    
    - name: Run unit tests
      run: npm run test:unit
    
    - name: Run Phase 30 acceptance tests
      run: npm run test:phase30
    
    - name: Install c2patool
      run: |
        wget https://github.com/contentauth/c2patool/releases/latest/download/c2patool-linux-x64.zip
        unzip c2patool-linux-x64.zip
        chmod +x c2patool
    
    - name: Run variant validation on test assets
      run: |
        mkdir -p test-output
        ./scripts/ci-variant-validation.sh ./test-assets ./test-output
    
    - name: Upload test results
      uses: actions/upload-artifact@v4
      if: always()
      with:
        name: variant-test-results-${{ matrix.node-version }}
        path: test-output/
    
    - name: Generate performance report
      run: npm run test:performance
    
    - name: Check SLO compliance
      run: npm run check:slos
    
    - name: Security audit
      run: npm run security:audit

  integration-tests:
    runs-on: ubuntu-latest
    needs: variant-linking-tests
    
    services:
      redis:
        image: redis:7
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    
    steps:
    - name: Checkout code
      uses: actions/checkout@v4
    
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '20'
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Build project
      run: npm run build
    
    - name: Start test server
      run: |
        npm run start:test &
        sleep 10
    
    - name: Run integration tests
      run: npm run test:integration
      env:
        REDIS_URL: redis://localhost:6379
        MANIFEST_SERVICE: http://localhost:3000
    
    - name: Run variant linking E2E tests
      run: npm run test:e2e:variants
    
    - name: Stop test server
      run: pkill -f "npm run start:test"

  deployment-validation:
    runs-on: ubuntu-latest
    needs: [variant-linking-tests, integration-tests]
    if: github.ref == 'refs/heads/main'
    
    steps:
    - name: Checkout code
      uses: actions/checkout@v4
    
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '20'
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Build for production
      run: npm run build:prod
    
    - name: Deploy to staging
      run: |
        # Deployment script here
        echo "Deploying to staging..."
    
    - name: Validate deployment
      run: |
        # Wait for deployment to be ready
        sleep 30
        
        # Run smoke tests
        npm run test:smoke
        
        # Validate variant linking endpoints
        npm run validate:deployment
    
    - name: Run variant matrix audit
      run: |
        npm run audit:variant-matrix \
          --environment=staging \
          --output=variant-audit-report.json
    
    - name: Upload audit report
      uses: actions/upload-artifact@v4
      with:
        name: variant-audit-report
        path: variant-audit-report.json
```

### Package.json Scripts
```json
{
  "scripts": {
    "test:phase30": "vitest run src/tests/phase30-acceptance.test.ts",
    "test:variants": "vitest run src/tests/variant-*.test.ts",
    "test:performance": "vitest run --reporter=verbose src/tests/performance.test.ts",
    "test:e2e:variants": "playwright test e2e/variant-linking/",
    "validate:deployment": "node scripts/validate-deployment.js",
    "audit:variant-matrix": "node scripts/variant-matrix-audit.js",
    "check:slos": "node scripts/check-slo-compliance.js",
    "debug:variant": "ts-node src/debug/variant-chain-debugger.ts",
    "profile:variants": "node scripts/profile-variant-operations.js"
  }
}
```

## 4. Debug Utilities

### Manifest Comparison Tool
```bash
#!/bin/bash
# compare-manifests.sh

set -e

MANIFEST1="$1"
MANIFEST2="$2"
OUTPUT_DIR="$3"

if [ $# -ne 3 ]; then
    echo "Usage: compare-manifests.sh <manifest1> <manifest2> <output-dir>"
    exit 1
fi

mkdir -p "$OUTPUT_DIR"

echo "🔍 Comparing manifests:"
echo "  Manifest 1: $MANIFEST1"
echo "  Manifest 2: $MANIFEST2"
echo "  Output: $OUTPUT_DIR"

# Extract manifests
c2patool -d "$MANIFEST1" -o "$OUTPUT_DIR/manifest1.json"
c2patool -d "$MANIFEST2" -o "$OUTPUT_DIR/manifest2.json"

# Generate semantic diff
node dist/cli/index.js diff \
  --base "$OUTPUT_DIR/manifest1.json" \
  --target "$OUTPUT_DIR/manifest2.json" \
  --format semantic \
  --out "$OUTPUT_DIR/semantic-diff.json"

# Generate lineage
node dist/cli/index.js lineage \
  --asset "$MANIFEST2" \
  --out "$OUTPUT_DIR/lineage.json"

# Compare ingredients
echo "📊 Ingredient comparison:" > "$OUTPUT_DIR/ingredient-comparison.txt"
jq -r '.ingredients[] | "\(.relationship): \(.active_manifest)"' "$OUTPUT_DIR/manifest1.json" > "$OUTPUT_DIR/ingredients1.txt"
jq -r '.ingredients[] | "\(.relationship): \(.active_manifest)"' "$OUTPUT_DIR/manifest2.json" > "$OUTPUT_DIR/ingredients2.txt"
diff -u "$OUTPUT_DIR/ingredients1.txt" "$OUTPUT_DIR/ingredients2.txt" >> "$OUTPUT_DIR/ingredient-comparison.txt"

# Compare actions
echo "🔧 Action comparison:" > "$OUTPUT_DIR/action-comparison.txt"
jq -r '.assertions[] | select(.label == "c2pa.actions") | .data.actions[] | "\(.type): \(.parameters)"' "$OUTPUT_DIR/manifest1.json" > "$OUTPUT_DIR/actions1.txt"
jq -r '.assertions[] | select(.label == "c2pa.actions") | .data.actions[] | "\(.type): \(.parameters)"' "$OUTPUT_DIR/manifest2.json" > "$OUTPUT_DIR/actions2.txt"
diff -u "$OUTPUT_DIR/actions1.txt" "$OUTPUT_DIR/actions2.txt" >> "$OUTPUT_DIR/action-comparison.txt"

echo "✅ Comparison complete"
echo "📄 Results saved in: $OUTPUT_DIR"
```

### Link Header Validator
```typescript
// link-validator.ts
import * as https from 'https';
import * as http from 'http';

interface LinkValidationResult {
  url: string;
  hasLinkHeader: boolean;
  linkHeaderValue?: string;
  manifestUrl?: string;
  manifestAccessible: boolean;
  manifestStatus?: number;
  errors: string[];
}

class LinkHeaderValidator {
  async validateUrls(urls: string[]): Promise<LinkValidationResult[]> {
    const results: LinkValidationResult[] = [];
    
    for (const url of urls) {
      try {
        const result = await this.validateSingleUrl(url);
        results.push(result);
      } catch (error) {
        results.push({
          url,
          hasLinkHeader: false,
          manifestAccessible: false,
          errors: [error instanceof Error ? error.message : 'Unknown error']
        });
      }
    }
    
    return results;
  }

  private async validateSingleUrl(url: string): Promise<LinkValidationResult> {
    const result: LinkValidationResult = {
      url,
      hasLinkHeader: false,
      manifestAccessible: false,
      errors: []
    };

    return new Promise((resolve) => {
      const client = url.startsWith('https:') ? https : http;
      
      const request = client.request(url, { method: 'HEAD', timeout: 10000 }, (response) => {
        result.linkHeaderValue = response.headers['link'];
        result.hasLinkHeader = !!result.linkHeaderValue;
        
        if (result.hasLinkHeader) {
          const manifestUrl = this.extractManifestUrl(result.linkHeaderValue!);
          result.manifestUrl = manifestUrl;
          
          if (manifestUrl) {
            this.validateManifest(manifestUrl).then(accessible => {
              result.manifestAccessible = accessible.accessible;
              result.manifestStatus = accessible.status;
              resolve(result);
            }).catch(error => {
              result.errors.push(`Manifest validation failed: ${error.message}`);
              resolve(result);
            });
          } else {
            result.errors.push('Could not extract manifest URL from Link header');
            resolve(result);
          }
        } else {
          result.errors.push('No Link header found');
          resolve(result);
        }
      });
      
      request.on('error', (error) => {
        result.errors.push(`Request failed: ${error.message}`);
        resolve(result);
      });
      
      request.on('timeout', () => {
        request.destroy();
        result.errors.push('Request timeout');
        resolve(result);
      });
      
      request.end();
    });
  }

  private extractManifestUrl(linkHeader: string): string | null {
    const match = linkHeader.match(/<([^>]+)>;\s*rel="c2pa-manifest"/i);
    return match ? match[1] : null;
  }

  private async validateManifest(manifestUrl: string): Promise<{ accessible: boolean; status?: number }> {
    return new Promise((resolve) => {
      const client = manifestUrl.startsWith('https:') ? https : http;
      
      const request = client.request(manifestUrl, { method: 'HEAD', timeout: 5000 }, (response) => {
        resolve({
          accessible: response.statusCode === 200,
          status: response.statusCode
        });
      });
      
      request.on('error', () => {
        resolve({ accessible: false });
      });
      
      request.on('timeout', () => {
        request.destroy();
        resolve({ accessible: false });
      });
      
      request.end();
    });
  }
}

// CLI usage
async function main() {
  const urls = process.argv.slice(2);
  
  if (urls.length === 0) {
    console.log('Usage: ts-node link-validator.ts <url1> <url2> ...');
    process.exit(1);
  }
  
  const validator = new LinkHeaderValidator();
  const results = await validator.validateUrls(urls);
  
  console.log('🔗 Link Header Validation Results:');
  console.log('');
  
  for (const result of results) {
    console.log(`URL: ${result.url}`);
    console.log(`  Link Header: ${result.hasLinkHeader ? '✅' : '❌'}`);
    
    if (result.hasLinkHeader) {
      console.log(`  Value: ${result.linkHeaderValue}`);
      console.log(`  Manifest URL: ${result.manifestUrl}`);
      console.log(`  Manifest Accessible: ${result.manifestAccessible ? '✅' : '❌'}`);
      
      if (result.manifestStatus) {
        console.log(`  Manifest Status: ${result.manifestStatus}`);
      }
    }
    
    if (result.errors.length > 0) {
      console.log('  Errors:');
      result.errors.forEach(error => console.log(`    - ${error}`));
    }
    
    console.log('');
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { LinkHeaderValidator };
```

---

**Usage Summary:**

1. **Development**: Use `debug-variant-chain.ts` for local debugging
2. **CI/CD**: Integrate acceptance tests and validation scripts
3. **Performance**: Profile operations with `performance-profiler.ts`
4. **Validation**: Use `link-validator.ts` to verify Link headers
5. **Comparison**: Use `compare-manifests.sh` to analyze manifest differences

All tools are designed to work with the c2patool ecosystem and provide comprehensive debugging capabilities for variant linking implementations.
