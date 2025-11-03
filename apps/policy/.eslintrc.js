/**
 * Phase 20: Policy Engine & Assertions Builder - ESLint Configuration
 * Code quality and style enforcement
 * SECURITY: Comprehensive linting rules for security and quality
 */

module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module'
  },
  plugins: ['@typescript-eslint'],
  root: true,
  env: {
    node: true,
    jest: true,
    es2022: true
  },
  rules: {
    // General rules
    'no-console': 'warn',
    'no-debugger': 'error',
    'prefer-const': 'error',
    'no-var': 'error',
    'object-shorthand': 'error',
    'prefer-template': 'error',
    
    // Code quality
    'complexity': ['warn', 10],
    'max-lines-per-function': ['warn', 50],
    'max-depth': ['warn', 4],
    'max-params': ['warn', 5],
    
    // SECURITY: Additional security rules
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',
    'no-script-url': 'error',
    'no-void': 'error',
    'require-await': 'error',
    'no-return-await': 'error'
  },
  overrides: [
    {
      files: ['**/*.test.ts', '**/*.spec.ts'],
      rules: {
        'max-lines-per-function': 'off'
      }
    },
    {
      files: ['**/cli.ts'],
      rules: {
        'no-console': 'off'
      }
    }
  ],
  ignorePatterns: [
    'dist/',
    'node_modules/',
    'coverage/',
    '*.js'
  ]
};
