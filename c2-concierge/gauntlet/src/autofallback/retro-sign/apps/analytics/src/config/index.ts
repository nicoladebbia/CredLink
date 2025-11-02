/**
 * Phase 13 Analytics - Configuration
 * Environment-based configuration management
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
  }
};

// Configuration validation
export function validateConfig(cfg: AnalyticsConfig): void {
  const required = [
    'CLICKHOUSE_HOST',
    'CLICKHOUSE_USER',
    'CLICKHOUSE_DATABASE'
  ];

  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
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
}

// Configuration for different environments
export const environments = {
  development: {
    ...config,
    logging: { level: 'debug' },
    alerts: { ...config.alerts, enabled: false }
  },
  
  test: {
    ...config,
    logging: { level: 'error' },
    alerts: { ...config.alerts, enabled: false },
    server: { ...config.server, port: 3003 }
  },
  
  production: {
    ...config,
    logging: { level: 'info' },
    alerts: { ...config.alerts, enabled: true }
  }
};

export function getConfig(): AnalyticsConfig {
  const env = process.env.NODE_ENV || 'development';
  
  if (env in environments) {
    return environments[env as keyof typeof environments];
  }
  
  return config;
}
