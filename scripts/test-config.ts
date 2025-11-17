console.log('DEBUG: test-config.ts - starting test');

async function testConfig() {
    try {
        console.log('DEBUG: test-config.ts - about to import ultra-config');
        const module = await import('./ultra-config');
        console.log('DEBUG: test-config.ts - import successful');
        console.log('DEBUG: test-config.ts - exported keys:', Object.keys(module));
        console.log('DEBUG: test-config.ts - default export:', module.default);
        console.log('DEBUG: test-config.ts - default export keys:', module.default ? Object.keys(module.default) : 'undefined');
        
        // Try to access createUltraConfig from default export
        const createUltraConfig = module.default?.createUltraConfig || module.default;
        console.log('DEBUG: test-config.ts - createUltraConfig type:', typeof createUltraConfig);
        
        if (typeof createUltraConfig === 'function') {
            console.log('DEBUG: test-config.ts - creating config instance');
            const ultraConfig = createUltraConfig();
            console.log('DEBUG: test-config.ts - ultraConfig type:', typeof ultraConfig);
            console.log('DEBUG: test-config.ts - ultraConfig exists:', !!ultraConfig);
            
            if (ultraConfig) {
                console.log('DEBUG: test-config.ts - testing getConfig()');
                const config = ultraConfig.getConfig();
                console.log('DEBUG: test-config.ts - getConfig() successful:', typeof config);
                
                console.log('DEBUG: test-config.ts - testing validate()');
                const validation = ultraConfig.validate();
                console.log('DEBUG: test-config.ts - validate() successful:', validation);
                
                console.log('✅ Ultra configuration system working correctly!');
            } else {
                console.log('❌ ultraConfig is undefined after creation');
            }
        } else {
            console.log('❌ createUltraConfig is not a function, it is:', typeof createUltraConfig);
            
            // Try using the class directly from default export
            const UltraConfiguration = module.default?.UltraConfiguration || module.default;
            if (typeof UltraConfiguration === 'function') {
                console.log('DEBUG: test-config.ts - found UltraConfiguration class, creating instance');
                const ultraConfig = new UltraConfiguration();
                console.log('DEBUG: test-config.ts - ultraConfig type:', typeof ultraConfig);
                console.log('DEBUG: test-config.ts - ultraConfig exists:', !!ultraConfig);
                
                if (ultraConfig) {
                    console.log('✅ Ultra configuration system working correctly!');
                }
            } else {
                console.log('❌ Could not find any usable exports');
            }
        }
    } catch (error) {
        console.error('❌ Error testing ultra configuration:', error);
    }
    
    console.log('DEBUG: test-config.ts - test complete');
}

testConfig();
