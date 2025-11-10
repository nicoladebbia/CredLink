export interface PolicyConfig {
  remote_only: boolean;
  preserve_paths: string[];
  drop_if_link_missing: boolean;
  break_glass_hosts: string[];
}

export const DEFAULT_POLICY: PolicyConfig = {
  remote_only: true,
  preserve_paths: ['/media/preserve/'],
  drop_if_link_missing: false,
  break_glass_hosts: []
};

export interface EnvironmentConfig {
  REMOTE_ONLY?: string;
  PRESERVE_PATHS?: string;
  DROP_IF_LINK_MISSING?: string;
  BREAK_GLASS_HOSTS?: string;
}

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) {
    return defaultValue;
  }

  return value === '1';
}

function parseList(value: string | undefined, defaultValue: string[]): string[] {
  if (value === undefined) {
    return defaultValue;
  }

  return value
    .split(',')
    .map(entry => entry.trim())
    .filter(entry => entry.length > 0);
}

export function policyFromEnvironment(env: EnvironmentConfig): PolicyConfig {
  const remoteOnlyEnv = env.REMOTE_ONLY;
  const preservePathsEnv = env.PRESERVE_PATHS;
  const dropIfLinkMissingEnv = env.DROP_IF_LINK_MISSING;
  const breakGlassHostsEnv = env.BREAK_GLASS_HOSTS;

  return {
    remote_only: parseBoolean(remoteOnlyEnv, DEFAULT_POLICY.remote_only),
    preserve_paths: parseList(preservePathsEnv, DEFAULT_POLICY.preserve_paths),
    drop_if_link_missing: parseBoolean(dropIfLinkMissingEnv, DEFAULT_POLICY.drop_if_link_missing),
    break_glass_hosts: parseList(breakGlassHostsEnv, DEFAULT_POLICY.break_glass_hosts)
  };
}

export function validatePolicy(policy: PolicyConfig): string[] {
  const errors: string[] = [];
  
  if (typeof policy.remote_only !== 'boolean') {
    errors.push('remote_only must be a boolean');
  }
  
  if (!Array.isArray(policy.preserve_paths)) {
    errors.push('preserve_paths must be an array');
  } else if (!policy.preserve_paths.every(path => typeof path === 'string' && path.startsWith('/'))) {
    errors.push('preserve_paths must be strings starting with "/"');
  }
  
  if (typeof policy.drop_if_link_missing !== 'boolean') {
    errors.push('drop_if_link_missing must be a boolean');
  }
  
  if (!Array.isArray(policy.break_glass_hosts)) {
    errors.push('break_glass_hosts must be an array');
  }
  
  return errors;
}
