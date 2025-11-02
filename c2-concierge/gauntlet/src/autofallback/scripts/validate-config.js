#!/usr/bin/env node
"use strict";
/**
 * Phase 6 - Optimizer Auto-Fallback: Configuration Validation Script
 * Validates wrangler.toml and environment configuration
 */
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const path_1 = require("path");
class ConfigValidator {
    results = {
        valid: true,
        errors: [],
        warnings: [],
        config: null
    };
    async validate() {
        console.log('🔍 Validating configuration...');
        await this.validateWranglerToml();
        await this.validateEnvironmentVariables();
        await this.validateDurableObjects();
        await this.validateKVNamespaces();
        return this.results;
    }
    async validateWranglerToml() {
        try {
            const wranglerPath = (0, path_1.join)(process.cwd(), 'wrangler.toml');
            const content = (0, fs_1.readFileSync)(wranglerPath, 'utf8');
            // Basic TOML validation
            if (!content.includes('[build]')) {
                this.results.errors.push('Missing [build] section in wrangler.toml');
            }
            if (!content.includes('main = ')) {
                this.results.errors.push('Missing main entry point in wrangler.toml');
            }
            if (!content.includes('[[durable_objects.bindings]]')) {
                this.results.errors.push('Missing Durable Objects configuration in wrangler.toml');
            }
            if (!content.includes('[[kv_namespaces]]')) {
                this.results.errors.push('Missing KV namespaces configuration in wrangler.toml');
            }
            console.log('✅ wrangler.toml structure validated');
        }
        catch (error) {
            this.results.errors.push(`Failed to read wrangler.toml: ${error}`);
        }
    }
    async validateEnvironmentVariables() {
        const requiredVars = [
            'REMOTE_ONLY_DEFAULT',
            'WINDOW_SECS',
            'RESTORE_HYSTERESIS_SECS',
            'ROUTE_MIN_SAMPLES',
            'SCORE_THRESHOLD',
            'SCORE_RESTORE',
            'BADGE_REQUIRED',
            'MANIFEST_BASE',
            'TENANT_ID',
            'HMAC_SECRET',
            'ADMIN_TOKEN'
        ];
        for (const varName of requiredVars) {
            const value = process.env[varName];
            if (!value) {
                this.results.warnings.push(`Environment variable ${varName} not set`);
            }
        }
        console.log('✅ Environment variables validated');
    }
    async validateDurableObjects() {
        try {
            const wranglerPath = (0, path_1.join)(process.cwd(), 'wrangler.toml');
            const content = (0, fs_1.readFileSync)(wranglerPath, 'utf8');
            if (!content.includes('C2_AUTOFALLBACK')) {
                this.results.errors.push('Missing C2_AUTOFALLBACK Durable Object binding');
            }
            console.log('✅ Durable Objects configuration validated');
        }
        catch (error) {
            this.results.errors.push(`Failed to validate Durable Objects: ${error}`);
        }
    }
    async validateKVNamespaces() {
        try {
            const wranglerPath = (0, path_1.join)(process.cwd(), 'wrangler.toml');
            const content = (0, fs_1.readFileSync)(wranglerPath, 'utf8');
            if (!content.includes('C2_BREAKGLASS')) {
                this.results.errors.push('Missing C2_BREAKGLASS KV namespace');
            }
            if (!content.includes('C2_POLICY_CACHE')) {
                this.results.errors.push('Missing C2_POLICY_CACHE KV namespace');
            }
            console.log('✅ KV namespaces configuration validated');
        }
        catch (error) {
            this.results.errors.push(`Failed to validate KV namespaces: ${error}`);
        }
    }
}
// CLI interface
async function main() {
    const validator = new ConfigValidator();
    const results = await validator.validate();
    if (results.errors.length > 0) {
        console.log('\n❌ Configuration errors found:');
        results.errors.forEach(error => console.log(`   - ${error}`));
    }
    if (results.warnings.length > 0) {
        console.log('\n⚠️  Configuration warnings:');
        results.warnings.forEach(warning => console.log(`   - ${warning}`));
    }
    if (results.errors.length === 0 && results.warnings.length === 0) {
        console.log('\n✅ Configuration is valid!');
    }
    // Save validation results
    const resultsFile = (0, path_1.join)(process.cwd(), 'config-validation.json');
    (0, fs_1.writeFileSync)(resultsFile, JSON.stringify(results, null, 2));
    console.log(`\n💾 Validation results saved to: ${resultsFile}`);
    // Exit with error code if validation failed
    process.exit(results.valid ? 0 : 1);
}
if (require.main === module) {
    main().catch(error => {
        console.error('❌ Validation failed:', error);
        process.exit(1);
    });
}
//# sourceMappingURL=validate-config.js.map