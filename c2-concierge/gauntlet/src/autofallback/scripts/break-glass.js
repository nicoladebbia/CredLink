#!/usr/bin/env node
"use strict";
/**
 * Phase 6 - Optimizer Auto-Fallback: Break Glass Script
 * Manual override for emergency situations
 */
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const path_1 = require("path");
class BreakGlassManager {
    config;
    results;
    constructor(config) {
        this.config = config;
        this.results = {
            config,
            success: false,
            message: '',
            errors: []
        };
    }
    async execute() {
        console.log(`🔧 Executing break-glass action: ${this.config.action}`);
        if (this.config.action === 'set') {
            return await this.setBreakGlass();
        }
        else if (this.config.action === 'clear') {
            return await this.clearBreakGlass();
        }
        else {
            this.results.errors.push(`Invalid action: ${this.config.action}`);
            return this.results;
        }
    }
    async setBreakGlass() {
        try {
            const payload = {
                mode: this.config.mode,
                reason: this.config.reason,
                openedBy: process.env['USER'] || 'unknown',
                ttlMinutes: this.config.ttlMinutes,
                sig: this.generateSignature()
            };
            const response = await fetch(`${this.config.endpoint}/_c2/breakglass?route=${encodeURIComponent(this.config.route)}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env['ADMIN_TOKEN'] || 'test-token'}`
                },
                body: JSON.stringify(payload)
            });
            if (response.ok) {
                this.results.success = true;
                this.results.message = `Break-glass override set to ${this.config.mode} for ${this.config.route}`;
                console.log(`✅ ${this.results.message}`);
            }
            else {
                this.results.errors.push(`Failed to set break-glass: ${response.statusText}`);
            }
        }
        catch (error) {
            this.results.errors.push(`Set break-glass failed: ${error}`);
        }
        return this.results;
    }
    async clearBreakGlass() {
        try {
            const response = await fetch(`${this.config.endpoint}/_c2/breakglass?route=${encodeURIComponent(this.config.route)}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${process.env['ADMIN_TOKEN'] || 'test-token'}`
                }
            });
            if (response.ok) {
                this.results.success = true;
                this.results.message = `Break-glass override cleared for ${this.config.route}`;
                console.log(`✅ ${this.results.message}`);
            }
            else {
                this.results.errors.push(`Failed to clear break-glass: ${response.statusText}`);
            }
        }
        catch (error) {
            this.results.errors.push(`Clear break-glass failed: ${error}`);
        }
        return this.results;
    }
    generateSignature() {
        // Simplified signature generation
        const data = JSON.stringify({
            route: this.config.route,
            mode: this.config.mode,
            reason: this.config.reason,
            ttlMinutes: this.config.ttlMinutes
        });
        return btoa(data + '_signed_' + Date.now());
    }
}
// CLI interface
async function main() {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.log('Usage: break-glass.ts <set|clear> [options]');
        console.log('');
        console.log('Commands:');
        console.log('  set    Set break-glass override');
        console.log('  clear  Clear break-glass override');
        console.log('');
        console.log('Options for "set":');
        console.log('  --mode <mode>        Override mode (NORMAL|FALLBACK_REMOTE_ONLY|FREEZE)');
        console.log('  --route <route>      Route to override (default: default)');
        console.log('  --reason <reason>    Reason for override');
        console.log('  --ttl <minutes>      TTL in minutes (default: 60)');
        console.log('  --endpoint <url>     API endpoint (default: http://localhost:8787)');
        console.log('');
        process.exit(1);
    }
    const action = args[0];
    const config = {
        endpoint: 'http://localhost:8787',
        route: 'default',
        action,
        mode: 'NORMAL',
        reason: 'Manual override',
        ttlMinutes: 60
    };
    // Parse arguments
    for (let i = 1; i < args.length; i++) {
        switch (args[i]) {
            case '--endpoint':
                config.endpoint = args[++i] || '';
                break;
            case '--route':
                config.route = args[++i] || '';
                break;
            case '--mode':
                config.mode = args[++i];
                break;
            case '--reason':
                config.reason = args[++i] || '';
                break;
            case '--ttl':
                config.ttlMinutes = parseInt(args[++i] || '60');
                break;
        }
    }
    // Validate configuration
    if (!config.endpoint) {
        console.error('❌ --endpoint is required');
        process.exit(1);
    }
    if (action === 'set' && config.mode === 'NORMAL') {
        console.error('❌ --mode must be FALLBACK_REMOTE_ONLY or FREEZE for set action');
        process.exit(1);
    }
    const manager = new BreakGlassManager(config);
    const results = await manager.execute();
    if (results.errors.length > 0) {
        console.log('\n❌ Errors:');
        results.errors.forEach(error => console.log(`   - ${error}`));
    }
    // Save results
    const resultsFile = (0, path_1.join)(process.cwd(), 'break-glass-results.json');
    (0, fs_1.writeFileSync)(resultsFile, JSON.stringify(results, null, 2));
    console.log(`\n💾 Results saved to: ${resultsFile}`);
    // Exit with error code if failed
    process.exit(results.success ? 0 : 1);
}
if (require.main === module) {
    main().catch(error => {
        console.error('❌ Break-glass operation failed:', error);
        process.exit(1);
    });
}
//# sourceMappingURL=break-glass.js.map