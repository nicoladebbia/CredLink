/**
 * Phase 13 Analytics - Jest Configuration
 * Comprehensive testing setup for acceptance criteria
 */

module.exports = {
  // Test environment
  testEnvironment: 'node',
  
  // Roots
  roots: ['<rootDir>/src'],
  
  // Test patterns
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/?(*.)+(spec|test).ts'
  ],
  
  // Transform
  transform: {
    '^.+\\.ts$': 'ts-jest'
  },
  
  // Module file extensions
  moduleFileExtensions: ['ts', 'js', 'json'],
  
  // Coverage
  collectCoverage: true,
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/tests/**',
    '!src/index.ts'  // Entry point, not business logic
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json-summary'],
  coverageThresholds: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    },
    // Critical files need higher coverage
    'src/services/analytics-service.ts': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    },
    'src/alerts/alert-service.ts': {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85
    }
  },
  
  // Setup files
  setupFilesAfterEnv: ['<rootDir>/src/tests/setup.ts'],
  
  // Test timeout (acceptance tests need more time)
  testTimeout: 30000,
  
  // Verbose output
  verbose: true,
  
  // Clear mocks between tests
  clearMocks: true,
  
  // Restore mocks after each test
  restoreMocks: true,
  
  // Projects for different test types
  projects: [
    {
      displayName: 'Unit Tests',
      testMatch: ['<rootDir>/src/tests/unit/**/*.test.ts'],
      testTimeout: 10000
    },
    {
      displayName: 'Integration Tests',
      testMatch: ['<rootDir>/src/tests/integration/**/*.test.ts'],
      testTimeout: 20000,
      setupFilesAfterEnv: ['<rootDir>/src/tests/integration-setup.ts']
    },
    {
      displayName: 'Acceptance Tests',
      testMatch: ['<rootDir>/src/tests/acceptance/**/*.test.ts'],
      testTimeout: 60000,
      setupFilesAfterEnv: ['<rootDir>/src/tests/acceptance-setup.ts']
    }
  ],
  
  // Global variables
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.json'
    }
  },
  
  // Module name mapping (for absolute imports)
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@/config/(.*)$': '<rootDir>/src/config/$1',
    '^@/services/(.*)$': '<rootDir>/src/services/$1',
    '^@/utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@/types/(.*)$': '<rootDir>/src/types/$1'
  },
  
  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/coverage/'
  ],
  
  // Error handling
  errorOnDeprecated: true,
  
  // Reporter for CI/CD
  reporters: [
    'default',
    ['jest-junit', {
      outputDirectory: 'test-results',
      outputName: 'junit.xml',
      classNameTemplate: '{classname}',
      titleTemplate: '{title}',
      ancestorSeparator: ' › ',
      usePathForSuiteName: true
    }]
  ],
  
  // Performance monitoring
  detectOpenHandles: true,
  forceExit: false,
  
  // Mock patterns
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
  
  // Environment variables for tests
  testEnvironmentOptions: {
    NODE_ENV: 'test'
  }
};
