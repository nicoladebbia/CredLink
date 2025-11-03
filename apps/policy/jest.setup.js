/**
 * Phase 20: Policy Engine & Assertions Builder - Jest Setup
 * Global test configuration and mocks
 */

// Set test environment
process.env.NODE_ENV = 'test';

// Mock console methods in tests to keep output clean
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Add custom matchers for better assertions
expect.extend({
  toBeValidPolicy(received) {
    const pass = received && 
                typeof received.policy_id === 'string' &&
                typeof received.version === 'number' &&
                received.applies_to &&
                received.disclosure &&
                received.editing &&
                received.license &&
                received.display &&
                received.controls &&
                received.lock;
    
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid policy`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid policy with all required fields`,
        pass: false,
      };
    }
  },

  toBeValidC2PAAssertions(received) {
    const pass = received &&
                received.actions &&
                received.actions.label === 'c2pa.actions' &&
                received.actions.data &&
                received.actions.data.actions &&
                Array.isArray(received.actions.data.actions) &&
                received.policy &&
                received.policy.label === 'com.c2c.policy.v1' &&
                received.policy.data &&
                received.policy.data.policy_id &&
                received.policy.data.version &&
                received.policy.data.hash;
    
    if (pass) {
      return {
        message: () => `expected ${received} not to be valid C2PA assertions`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be valid C2PA assertions with required structure`,
        pass: false,
      };
    }
  },

  toHaveValidActionsAssertion(received) {
    if (!received || !received.actions || !received.actions.data.actions) {
      return {
        message: () => `expected ${received} to have an actions assertion`,
        pass: false,
      };
    }

    const actions = received.actions.data.actions;
    const firstAction = actions[0];
    const pass = firstAction && 
                ['c2pa.created', 'c2pa.opened'].includes(firstAction.action) &&
                firstAction.softwareAgent === 'C2 Concierge Signer 1.1';
    
    if (pass) {
      return {
        message: () => `expected ${received} not to have a valid actions assertion`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to have a valid actions assertion with c2pa.created/opened as first action`,
        pass: false,
      };
    }
  },

  toHaveValidPolicyHash(received) {
    if (!received || !received.policy || !received.policy.data.hash) {
      return {
        message: () => `expected ${received} to have a policy hash`,
        pass: false,
      };
    }

    const hash = received.policy.data.hash;
    const pass = /^[a-f0-9]{64}$/.test(hash);
    
    if (pass) {
      return {
        message: () => `expected ${hash} not to be a valid SHA-256 hash`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${hash} to be a valid SHA-256 hash (64 hex characters)`,
        pass: false,
      };
    }
  }
});

// Global test utilities
global.testUtils = {
  createMockPolicy: (overrides = {}) => ({
    policy_id: 'test-policy',
    version: 1,
    applies_to: {
      kinds: ['image'],
      audience_regions: ['global']
    },
    disclosure: {
      creation_mode: 'created',
      digital_source_type: 'auto',
      ai: {
        used: false,
        prompt_disclosure: 'minimal'
      }
    },
    editing: {
      steps: []
    },
    license: {
      provider: 'custom',
      terms_url: 'https://example.com/terms'
    },
    display: {
      badge_copy: 'concise',
      link_manifest: 'remote'
    },
    controls: {
      redact_personal_fields: false,
      allow_ingredients: true,
      retain_assertions: ['thumbnail', 'ingredient']
    },
    lock: {
      enforce_version: true
    },
    ...overrides
  }),

  createMockSubject: (overrides = {}) => ({
    user_id: 'test-user',
    org_id: 'test-org',
    roles: ['user'],
    permissions: ['read'],
    ...overrides
  }),

  createMockContext: (overrides = {}) => ({
    timestamp: new Date(),
    request_id: 'test-request',
    user_agent: 'test-agent',
    client_ip: '127.0.0.1',
    ...overrides
  })
};
