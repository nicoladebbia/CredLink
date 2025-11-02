/**
 * Phase 13 Analytics - Configuration
 * Environment-based configuration management with security hardening
 */

export interface AnalyticsConfig {
  server: {
    host: string;
    port: number;
  };
  clickhouse: {
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
  };
  alerts: {
    enabled: boolean;
    config_path?: string;
    check_interval_seconds: number;
  };
  logging: {
    level: string;
  };
  storage: {
    r2: {
      endpoint: string;
      access_key_id: string;
      secret_access_key: string;
      bucket: string;
    };
  };
  notifications: {
    email: {
      smtp_host: string;
      smtp_port: number;
      username: string;
      password: string;
      from: string;
    };
    slack: {
      bot_token: string;
      default_channel: string;
    };
  };
  enforcement: {
    fallback_api_url: string;
    service_token: string;
    auto_resolve_hours: number;
  };
  security: {
    jwt_secret: string;
    bcrypt_rounds: number;
    session_timeout: number;
    max_request_size: number;
    rate_limit_window: number;
    rate_limit_max: number;
  };
}

export const config: AnalyticsConfig = {
  server: {
    host: process.env.HOST || '0.0.0.0',
    port: parseInt(process.env.PORT || '3002')
  },
  clickhouse: {
    host: process.env.CLICKHOUSE_HOST || 'localhost',
    port: parseInt(process.env.CLICKHOUSE_PORT || '8123'),
    username: process.env.CLICKHOUSE_USER || 'default',
    password: process.env.CLICKHOUSE_PASSWORD || '',
    database: process.env.CLICKHOUSE_DATABASE || 'c2pa_analytics'
  },
  alerts: {
    enabled: process.env.ALERTS_ENABLED === 'true',
    config_path: process.env.ALERTS_CONFIG_PATH,
    check_interval_seconds: parseInt(process.env.ALERTS_CHECK_INTERVAL || '60')
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info'
  },
  storage: {
    r2: {
      endpoint: process.env.R2_ENDPOINT || 'https://r2.cloudflarestorage.com',
      access_key_id: process.env.R2_ACCESS_KEY_ID || '',
      secret_access_key: process.env.R2_SECRET_ACCESS_KEY || '',
      bucket: process.env.R2_BUCKET || 'c2pa-analytics'
    }
  },
  notifications: {
    email: {
      smtp_host: process.env.SMTP_HOST || 'localhost',
      smtp_port: parseInt(process.env.SMTP_PORT || '587'),
      username: process.env.SMTP_USER || '',
      password: process.env.SMTP_PASS || '',
      from: process.env.SMTP_FROM || 'alerts@c2pa.example.com'
    },
    slack: {
      bot_token: process.env.SLACK_BOT_TOKEN || '',
      default_channel: process.env.SLACK_DEFAULT_CHANNEL || '#alerts'
    }
  },
  enforcement: {
    fallback_api_url: process.env.FALLBACK_API_URL || 'http://localhost:3000/api/v1/routes',
    service_token: process.env.SERVICE_TOKEN || '',
    auto_resolve_hours: parseInt(process.env.AUTO_RESOLVE_HOURS || '24')
  },
  security: {
    jwt_secret: process.env.JWT_SECRET || '',
    bcrypt_rounds: parseInt(process.env.BCRYPT_ROUNDS || '12'),
    session_timeout: parseInt(process.env.SESSION_TIMEOUT || '3600'),
    max_request_size: parseInt(process.env.MAX_REQUEST_SIZE || '1048576'), // 1MB
    rate_limit_window: parseInt(process.env.RATE_LIMIT_WINDOW || '900000'), // 15 minutes
    rate_limit_max: parseInt(process.env.RATE_LIMIT_MAX || '100')
  }
};

// CRITICAL: Enhanced security validation
export function validateConfig(cfg: AnalyticsConfig): void {
  // Required for production - fail fast if missing
  const requiredProduction = [
    'CLICKHOUSE_HOST',
    'CLICKHOUSE_USER', 
    'CLICKHOUSE_PASSWORD',
    'CLICKHOUSE_DATABASE',
    'JWT_SECRET',
    'SERVICE_TOKEN'
  ];

  const requiredDev = [
    'CLICKHOUSE_HOST',
    'CLICKHOUSE_USER',
    'CLICKHOUSE_DATABASE'
  ];

  const env = process.env.NODE_ENV || 'development';
  const required = env === 'production' ? requiredProduction : requiredDev;
  
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  // CRITICAL: Security validations
  if (env === 'production') {
    // JWT secret must be strong
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
      throw new Error('JWT_SECRET must be at least 32 characters in production');
    }

    // Service token must be strong
    if (!process.env.SERVICE_TOKEN || process.env.SERVICE_TOKEN.length < 32) {
      throw new Error('SERVICE_TOKEN must be at least 32 characters in production');
    }

    // Database password cannot be empty
    if (!process.env.CLICKHOUSE_PASSWORD || process.env.CLICKHOUSE_PASSWORD.length < 16) {
      throw new Error('CLICKHOUSE_PASSWORD must be at least 16 characters in production');
    }
  }

  // Validate numeric values
  if (isNaN(cfg.server.port) || cfg.server.port < 1 || cfg.server.port > 65535) {
    throw new Error('Invalid PORT value');
  }

  if (isNaN(cfg.clickhouse.port) || cfg.clickhouse.port < 1 || cfg.clickhouse.port > 65535) {
    throw new Error('Invalid CLICKHOUSE_PORT value');
  }

  if (cfg.alerts.enabled && (isNaN(cfg.alerts.check_interval_seconds) || cfg.alerts.check_interval_seconds < 10)) {
    throw new Error('ALERTS_CHECK_INTERVAL must be at least 10 seconds');
  }

  // Security configuration validation
  if (isNaN(cfg.security.bcrypt_rounds) || cfg.security.bcrypt_rounds < 10 || cfg.security.bcrypt_rounds > 15) {
    throw new Error('BCRYPT_ROUNDS must be between 10 and 15');
  }

  if (isNaN(cfg.security.max_request_size) || cfg.security.max_request_size > 10485760) { // 10MB max
    throw new Error('MAX_REQUEST_SIZE cannot exceed 10MB');
  }

  if (isNaN(cfg.security.rate_limit_max) || cfg.security.rate_limit_max > 1000) {
    throw new Error('RATE_LIMIT_MAX cannot exceed 1000 requests per window');
  }
}

// CRITICAL: Secure environment configurations
export const environments = {
  development: {
    ...config,
    logging: { level: 'debug' },
    alerts: { ...config.alerts, enabled: false },
    security: { 
      ...config.security,
      bcrypt_rounds: 10,
      rate_limit_max: 1000 // More permissive for development
    }
  },
  
  test: {
    ...config,
    logging: { level: 'error' },
    alerts: { ...config.alerts, enabled: false },
    server: { ...config.server, port: 3003 },
    security: {
      ...config.security,
      bcrypt_rounds: 10,
      rate_limit_max: 1000
    }
  },
  
  production: {
    ...config,
    logging: { level: 'info' },
    alerts: { ...config.alerts, enabled: true },
    security: {
      ...config.security,
      bcrypt_rounds: 12,
      session_timeout: 1800, // 30 minutes
      max_request_size: 1048576, // 1MB
      rate_limit_window: 900000, // 15 minutes
      rate_limit_max: 100 // Stricter rate limiting
    }
  }
};

export function getConfig(): AnalyticsConfig {
  const env = process.env.NODE_ENV || 'development';
  
  if (env in environments) {
    return environments[env as keyof typeof environments];
  }
  
  return config;
}
