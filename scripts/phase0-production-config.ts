#!/usr/bin/env tsx

/**
 * Phase 0 Production Configuration System
 * Environment-specific settings for realistic production deployment
 */

interface ProductionConfig {
    mode: 'development' | 'production' | 'testing';
    performance: {
        maxExecutionTime: {
            step01: number; // seconds
            step02: number; // seconds
            step03: number; // seconds
            step04: number; // seconds
            step05: number; // seconds
        };
        syntheticWorkloads: {
            functionCalls: {
                baseline: number;
                stress: number;
                production: number;
            };
            branchExecutions: {
                baseline: number;
                stress: number;
                production: number;
            };
            externalCalls: {
                baseline: number;
                stress: number;
                production: number;
            };
        };
    };
    validation: {
        exhaustive: boolean;
        mutationTesting: {
            enabled: boolean;
            count: number;
            scoreThreshold: number;
        };
        chaosTesting: {
            enabled: boolean;
            scenarios: number;
        };
    };
    observability: {
        overhead: {
            maxPercent: number;
            sampleSize: number;
        };
        adaptiveSampling: {
            enabled: boolean;
            loadThreshold: number;
        };
    };
}

class Phase0ProductionConfig {
    private config: ProductionConfig;

    constructor() {
        const mode = (process.env.PHASE0_MODE || 'development') as 'development' | 'production' | 'testing';
        this.config = this.buildConfig(mode);
    }

    private buildConfig(mode: string): ProductionConfig {
        const baseConfig = {
            mode,
            performance: {
                maxExecutionTime: {
                    step01: mode === 'production' ? 5 : 30, // Production: 5s, Dev: 30s
                    step02: mode === 'production' ? 2 : 60, // Production: 2s, Dev: 60s
                    step03: mode === 'production' ? 10 : 120, // Production: 10s, Dev: 120s
                    step04: mode === 'production' ? 5 : 60, // Production: 5s, Dev: 60s
                    step05: mode === 'production' ? 3 : 30, // Production: 3s, Dev: 30s
                },
                syntheticWorkloads: {
                    functionCalls: {
                        baseline: mode === 'production' ? 1000 : 100, // Realistic production volume
                        stress: mode === 'production' ? 5000 : 500,
                        production: mode === 'production' ? 2000 : 200,
                    },
                    branchExecutions: {
                        baseline: mode === 'production' ? 500 : 50,
                        stress: mode === 'production' ? 2500 : 250,
                        production: mode === 'production' ? 1000 : 100,
                    },
                    externalCalls: {
                        baseline: mode === 'production' ? 100 : 10,
                        stress: mode === 'production' ? 500 : 50,
                        production: mode === 'production' ? 200 : 20,
                    },
                },
            },
            validation: {
                exhaustive: mode !== 'production', // Skip exhaustive in production
                mutationTesting: {
                    enabled: mode !== 'production',
                    count: mode === 'production' ? 0 : 3,
                    scoreThreshold: mode === 'production' ? 0 : 10,
                },
                chaosTesting: {
                    enabled: mode !== 'production',
                    scenarios: mode === 'production' ? 0 : 2,
                },
            },
            observability: {
                overhead: {
                    maxPercent: mode === 'production' ? 1.0 : 0.1, // Production allows 1% overhead
                    sampleSize: mode === 'production' ? 1000 : 62,
                },
                adaptiveSampling: {
                    enabled: mode === 'production',
                    loadThreshold: mode === 'production' ? 100 : 1000,
                },
            },
        };

        return baseConfig as ProductionConfig;
    }

    getConfig(): ProductionConfig {
        return this.config;
    }

    isProductionMode(): boolean {
        return this.config.mode === 'production';
    }

    isDevelopmentMode(): boolean {
        return this.config.mode === 'development';
    }

    isTestingMode(): boolean {
        return this.config.mode === 'testing';
    }

    // Helper methods for specific configurations
    getFunctionCallVolume(workloadType: 'baseline' | 'stress' | 'production' = 'baseline'): number {
        return this.config.performance.syntheticWorkloads.functionCalls[workloadType];
    }

    getBranchExecutionVolume(workloadType: 'baseline' | 'stress' | 'production' = 'baseline'): number {
        return this.config.performance.syntheticWorkloads.branchExecutions[workloadType];
    }

    getMaxExecutionTime(step: 'step01' | 'step02' | 'step03' | 'step04' | 'step05'): number {
        return this.config.performance.maxExecutionTime[step];
    }

    shouldRunExhaustiveValidation(): boolean {
        return this.config.validation.exhaustive;
    }

    getMutationTestingConfig() {
        return this.config.validation.mutationTesting;
    }

    getChaosTestingConfig() {
        return this.config.validation.chaosTesting;
    }

    getObservabilityConfig() {
        return this.config.observability;
    }

    printConfiguration(): void {
        console.log(`\n🔧 PHASE 0 CONFIGURATION MODE: ${this.config.mode.toUpperCase()}`);
        console.log(`⏱️  Max Execution Times:`);
        Object.entries(this.config.performance.maxExecutionTime).forEach(([step, time]) => {
            console.log(`   ${step}: ${time}s`);
        });
        console.log(`📊 Synthetic Workloads (baseline):`);
        console.log(`   Function Calls: ${this.config.performance.syntheticWorkloads.functionCalls.baseline}`);
        console.log(`   Branch Executions: ${this.config.performance.syntheticWorkloads.branchExecutions.baseline}`);
        console.log(`🔍 Validation:`);
        console.log(`   Exhaustive: ${this.config.validation.exhaustive}`);
        console.log(`   Mutation Testing: ${this.config.validation.mutationTesting.enabled ? 'ENABLED' : 'DISABLED'}`);
        console.log(`   Chaos Testing: ${this.config.validation.chaosTesting.enabled ? 'ENABLED' : 'DISABLED'}`);
        console.log(`📈 Observability:`);
        console.log(`   Max Overhead: ${this.config.observability.overhead.maxPercent}%`);
        console.log(`   Sample Size: ${this.config.observability.overhead.sampleSize}`);
        console.log(`\n`);
    }
}

// Export for use in other scripts
export { Phase0ProductionConfig, ProductionConfig };

// If run directly, print configuration
if (require.main === module) {
    const config = new Phase0ProductionConfig();
    config.printConfiguration();
}
