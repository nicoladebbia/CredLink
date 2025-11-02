import { strict as assert } from 'node:assert';
import { DEFAULT_POLICY, policyFromEnvironment } from './schema.js';

type Env = Parameters<typeof policyFromEnvironment>[0];

type TestCase = {
  name: string;
  env: Env;
  expected: Partial<ReturnType<typeof policyFromEnvironment>>;
};

const cases: TestCase[] = [
  {
    name: 'falls back to default policy when environment is empty',
    env: {},
    expected: DEFAULT_POLICY
  },
  {
    name: 'honors explicit boolean overrides',
    env: {
      REMOTE_ONLY: '0',
      DROP_IF_LINK_MISSING: '1'
    },
    expected: {
      remote_only: false,
      drop_if_link_missing: true
    }
  },
  {
    name: 'parses comma-delimited lists and trims whitespace',
    env: {
      PRESERVE_PATHS: '/keep/one/, /keep/two/',
      BREAK_GLASS_HOSTS: 'critical.example.com,  emergency.example.com  ,'
    },
    expected: {
      preserve_paths: ['/keep/one/', '/keep/two/'],
      break_glass_hosts: ['critical.example.com', 'emergency.example.com']
    }
  }
];

for (const testCase of cases) {
  const { name, env, expected } = testCase;
  const result = policyFromEnvironment(env);

  for (const [key, value] of Object.entries(expected) as [keyof typeof result, unknown][]) {
    const actual = result[key];

    assert.deepEqual(
      actual,
      value,
      `${name}: expected ${String(key)} to equal ${JSON.stringify(value)} but received ${JSON.stringify(actual)}`
    );
  }
}

console.log('policyFromEnvironment tests passed');
