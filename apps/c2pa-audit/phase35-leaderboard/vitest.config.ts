/**
 * Phase 35 Leaderboard - Vitest Configuration
 * Comprehensive testing setup with security and performance focus
 */

import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    // Test environment
    environment: 'node',
    
    // Global test setup
    globals: true,
    
    // Test file patterns
    include: [
      'src/tests/**/*.{test,spec}.{js,ts}',
      'src/**/*.{test,spec}.{js,ts}',
    ],
    
    exclude: [
      'node_modules',
      'dist',
      '**/*.d.ts',
      '**/node_modules/**',
    ],
    
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.test.ts',
        '**/*.spec.ts',
        'src/tests/',
        'src/types/',
        '**/*.d.ts',
        'vitest.config.ts',
        'build.sh',
      ],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
        // Critical files have higher thresholds
        './src/utils/security.ts': {
          branches: 95,
          functions: 95,
          lines: 95,
          statements: 95,
        },
        './src/core/scoring-engine.ts': {
          branches: 90,
          functions: 90,
          lines: 90,
          statements: 90,
        },
        './src/core/testing-engine.ts': {
          branches: 85,
          functions: 85,
          lines: 85,
          statements: 85,
        },
      },
      clean: true,
      cleanOnRerun: true,
    },
    
    // Test timeout
    testTimeout: 30000,
    hookTimeout: 10000,
    
    // Concurrency
    threads: true,
    maxThreads: 4,
    minThreads: 1,
    
    // Isolation
    isolate: true,
    
    // Reporting
    reporter: ['verbose', 'json', 'html'],
    outputFile: {
      json: './test-results.json',
      html: './test-results.html',
    },
    
    // Watch mode
    watch: false,
    
    // Retry failed tests
    retry: 2,
    
    // Global setup and teardown
    globalSetup: ['./src/tests/setup.ts'],
    globalTeardown: ['./src/tests/teardown.ts'],
    
    // Setup files
    setupFiles: ['./src/tests/helpers/setup.ts'],
    
    // Mock configuration
    clearMocks: true,
    restoreMocks: true,
    
    // Environment variables
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'error',
      REDIS_HOST: 'localhost',
      REDIS_PORT: '6379',
      REDIS_DB: '1', // Separate test database
      SKIP_AUTH: 'true',
      MOCK_EXTERNAL_SERVICES: 'true',
    },
    
    // Performance settings
    includeTaskLocation: true,
    
    // Benchmark configuration
    benchmark: {
      include: ['**/*.bench.{js,ts}'],
      exclude: ['node_modules', 'dist'],
      outputJson: './benchmark-results.json',
      outputJsonExtension: '.json',
      includeSamples: true,
    },
    
    // Type checking
    typecheck: {
      tsconfig: './tsconfig.json',
      include: ['src/**/*.{test,spec}.ts'],
      exclude: ['node_modules', 'dist'],
    },
  },
  
  // Resolve configuration
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@/types': resolve(__dirname, './src/types'),
      '@/utils': resolve(__dirname, './src/utils'),
      '@/core': resolve(__dirname, './src/core'),
      '@/scoring': resolve(__dirname, './src/scoring'),
      '@/testing': resolve(__dirname, './src/testing'),
      '@/data': resolve(__dirname, './src/data'),
      '@/web': resolve(__dirname, './src/web'),
      '@/config': resolve(__dirname, './src/config'),
    },
  },
  
  // Define configuration for different environments
  define: {
    __TEST__: 'true',
    __VERSION__: '"1.1.0"',
    __BUILD_TIME__: '"' + new Date().toISOString() + '"',
  },
  
  // Public path for assets
  publicDir: './public',
  
  // Build configuration
  build: {
    target: 'node18',
    outDir: './dist',
    emptyOutDir: true,
    sourcemap: false,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
      mangle: {
        reserved: ['Test', 'test', 'describe', 'it', 'expect', 'beforeAll', 'afterAll', 'beforeEach', 'afterEach'],
      },
    },
    rollupOptions: {
      external: [
        // Node.js built-ins
        'fs',
        'path',
        'crypto',
        'url',
        'child_process',
        'os',
        'util',
        'events',
        'stream',
        'buffer',
        // External dependencies
        'ioredis',
        'fastify',
        '@fastify/cors',
        '@fastify/static',
        '@fastify/compress',
        'pino',
        'node-fetch',
        'cheerio',
        'pdf-parse',
        'rss-parser',
        'node-cron',
        'nanoid',
        'zod',
        'date-fns',
        'lodash',
        'yaml',
        'sharp',
        'c2pa',
        '@c2pa/rs',
      ],
      output: {
        format: 'esm',
        entryFileNames: '[name].js',
        chunkFileNames: '[name]-[hash].js',
        assetFileNames: '[name]-[hash][extname]',
      },
    },
  },
  
  // Optimize dependencies
  optimizeDeps: {
    include: [
      'vitest',
      '@vitest/coverage-v8',
    ],
    exclude: [
      'ioredis',
      'sharp',
      'c2pa',
      '@c2pa/rs',
    ],
  },
  
  // Server configuration for testing
  server: {
    port: 3001,
    strictPort: true,
    host: 'localhost',
  },
});
