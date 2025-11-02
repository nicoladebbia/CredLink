#!/usr/bin/env node
"use strict";
/**
 * Phase 6 - Optimizer Auto-Fallback: Incident Query Script
 * Queries and displays incident logs from the system
 */
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const path_1 = require("path");
class IncidentQuerier {
    config;
    results;
    constructor(config) {
        this.config = config;
        this.results = {
            config,
            incidents: [],
            totalIncidents: 0,
            errors: []
        };
    }
    async query() {
        console.log(`🔍 Querying incidents for ${this.config.route}`);
        try {
            // Query admin API for incidents
            const adminResponse = await fetch(`${this.config.endpoint}/_c2/admin?route=${encodeURIComponent(this.config.route)}`, {
                headers: {
                    'Authorization': `Bearer ${process.env['ADMIN_TOKEN'] || 'test-token'}`
                }
            });
            if (!adminResponse.ok) {
                throw new Error(`HTTP ${adminResponse.status}: ${adminResponse.statusText}`);
            }
            const adminData = await adminResponse.json();
            // Extract incidents from admin data
            if (adminData.lastDecision) {
                this.results.incidents.push(adminData.lastDecision);
            }
            this.results.totalIncidents = this.results.incidents.length;
            console.log(`✅ Found ${this.results.totalIncidents} incidents`);
        }
        catch (error) {
            this.results.errors.push(`Query failed: ${error}`);
        }
        return this.results;
    }
    displayResults() {
        if (this.results.errors.length > 0) {
            console.log('\n❌ Errors:');
            this.results.errors.forEach(error => console.log(`   - ${error}`));
            return;
        }
        if (this.results.incidents.length === 0) {
            console.log('\n✅ No incidents found');
            return;
        }
        console.log('\n📊 Incident Summary:');
        this.results.incidents.forEach((incident, index) => {
            console.log(`\n${index + 1}. ${incident.id}`);
            console.log(`   Route: ${incident.route}`);
            console.log(`   Time: ${incident.startedAt}`);
            console.log(`   Change: ${incident.stateFrom} → ${incident.stateTo}`);
            console.log(`   Reason: ${incident.reason}`);
            console.log(`   Rules: ${incident.firedRules.join(', ')}`);
        });
    }
}
// CLI interface
async function main() {
    const args = process.argv.slice(2);
    const config = {
        endpoint: 'http://localhost:8787',
        route: 'default',
        limit: 50,
        format: 'table'
    };
    // Parse arguments
    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--endpoint':
                config.endpoint = args[++i] || '';
                break;
            case '--route':
                config.route = args[++i] || '';
                break;
            case '--limit':
                config.limit = parseInt(args[++i] || '50');
                break;
            case '--format':
                config.format = (args[++i] || 'table');
                break;
        }
    }
    // Validate configuration
    if (!config.endpoint) {
        console.error('❌ --endpoint is required');
        process.exit(1);
    }
    const querier = new IncidentQuerier(config);
    const results = await querier.query();
    if (config.format === 'table') {
        querier.displayResults();
    }
    else {
        console.log(JSON.stringify(results, null, 2));
    }
    // Save results
    const resultsFile = (0, path_1.join)(process.cwd(), 'incident-query-results.json');
    (0, fs_1.writeFileSync)(resultsFile, JSON.stringify(results, null, 2));
    console.log(`\n💾 Results saved to: ${resultsFile}`);
    // Exit with error code if there were errors
    process.exit(results.errors.length > 0 ? 1 : 0);
}
if (require.main === module) {
    main().catch(error => {
        console.error('❌ Query failed:', error);
        process.exit(1);
    });
}
//# sourceMappingURL=query-incidents.js.map