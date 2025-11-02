/**
 * Security Configuration
 * Production-ready security settings and policies
 */

export interface SecurityConfig {
  // JWT Configuration
  jwt: {
    secret: string;
    issuer: string;
    audience: string;
    expiresIn: string;
    refreshExpiresIn: string;
    algorithm: string;
  };
  
  // Rate Limiting
  rateLimit: {
    enabled: boolean;
    redisUrl?: string;
    windowMs: number;
    maxRequests: number;
    skipSuccessfulRequests: boolean;
    skipFailedRequests: boolean;
  };
  
  // CORS Configuration
  cors: {
    enabled: boolean;
    origins: string[];
    methods: string[];
    allowedHeaders: string[];
    credentials: boolean;
    maxAge: number;
  };
  
  // Security Headers
  headers: {
    contentSecurityPolicy: string;
    xFrameOptions: string;
    xContentTypeOptions: string;
    xXSSProtection: string;
    referrerPolicy: string;
    permissionsPolicy: string;
    strictTransportSecurity: string;
  };
  
  // Authentication
  auth: {
    required: boolean;
    sessionTimeout: number;
    maxLoginAttempts: number;
    lockoutDuration: number;
    passwordPolicy: {
      minLength: number;
      requireUppercase: boolean;
      requireLowercase: boolean;
      requireNumbers: boolean;
      requireSymbols: boolean;
      preventReuse: number;
    };
  };
  
  // Audit Configuration
  audit: {
    enabled: boolean;
    retentionDays: number;
    logLevel: string;
    includeRequestBody: boolean;
    includeResponseBody: boolean;
    sensitiveFields: string[];
  };
  
  // Monitoring
  monitoring: {
    enabled: boolean;
    alertWebhookUrl?: string;
    slackWebhookUrl?: string;
    emailRecipients: string[];
    thresholds: {
      errorRate: number;
      responseTime: number;
      memoryUsage: number;
      cpuUsage: number;
    };
  };
  
  // Data Protection
  dataProtection: {
    encryptionAtRest: boolean;
    encryptionInTransit: boolean;
    dataMasking: boolean;
    piiFields: string[];
    gdprCompliance: boolean;
  };
}

/**
 * Default security configuration for development
 */
export const defaultSecurityConfig: SecurityConfig = {
  jwt: {
    secret: process.env.JWT_SECRET || 'development-secret-change-in-production',
    issuer: process.env.JWT_ISSUER || 'c2pa-api',
    audience: process.env.JWT_AUDIENCE || 'c2pa-client',
    expiresIn: '1h',
    refreshExpiresIn: '7d',
    algorithm: 'HS256'
  },
  
  rateLimit: {
    enabled: true,
    redisUrl: process.env.REDIS_URL,
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100,
    skipSuccessfulRequests: false,
    skipFailedRequests: false
  },
  
  cors: {
    enabled: true,
    origins: [
      'http://localhost:3000',
      'http://localhost:3001',
      'https://demo.c2pa.example.com'
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Requested-With'],
    credentials: true,
    maxAge: 86400 // 24 hours
  },
  
  headers: {
    contentSecurityPolicy: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'", // Remove unsafe-inline in production
      "style-src 'self' 'unsafe-inline'", // Remove unsafe-inline in production
      "img-src 'self' data: https:",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'"
    ].join('; '),
    
    xFrameOptions: 'DENY',
    xContentTypeOptions: 'nosniff',
    xXSSProtection: '1; mode=block',
    referrerPolicy: 'strict-origin-when-cross-origin',
    permissionsPolicy: 'camera=(), microphone=(), geolocation=()',
    strictTransportSecurity: 'max-age=31536000; includeSubDomains; preload'
  },
  
  auth: {
    required: process.env.NODE_ENV === 'production',
    sessionTimeout: 30 * 60, // 30 minutes
    maxLoginAttempts: 5,
    lockoutDuration: 15 * 60, // 15 minutes
    passwordPolicy: {
      minLength: 12,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSymbols: true,
      preventReuse: 5
    }
  },
  
  audit: {
    enabled: true,
    retentionDays: 365,
    logLevel: 'info',
    includeRequestBody: false,
    includeResponseBody: false,
    sensitiveFields: [
      'password',
      'token',
      'secret',
      'key',
      'authorization',
      'cookie',
      'session'
    ]
  },
  
  monitoring: {
    enabled: true,
    alertWebhookUrl: process.env.ALERT_WEBHOOK_URL,
    slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
    emailRecipients: [],
    thresholds: {
      errorRate: 0.05, // 5%
      responseTime: 2000, // 2 seconds
      memoryUsage: 0.8, // 80%
      cpuUsage: 0.8 // 80%
    }
  },
  
  dataProtection: {
    encryptionAtRest: process.env.NODE_ENV === 'production',
    encryptionInTransit: true,
    dataMasking: true,
    piiFields: [
      'email',
      'phone',
      'ssn',
      'credit_card',
      'bank_account',
      'address',
      'name'
    ],
    gdprCompliance: true
  }
};

/**
 * Production security configuration
 */
export const productionSecurityConfig: SecurityConfig = {
  ...defaultSecurityConfig,
  
  jwt: {
    ...defaultSecurityConfig.jwt,
    secret: process.env.JWT_SECRET || (() => {
      throw new Error('JWT_SECRET must be set in production');
    })(),
    expiresIn: '15m', // Shorter expiration in production
    refreshExpiresIn: '7d'
  },
  
  rateLimit: {
    ...defaultSecurityConfig.rateLimit,
    redisUrl: process.env.REDIS_URL || (() => {
      throw new Error('REDIS_URL must be set in production');
    })(),
    windowMs: 60 * 1000,
    maxRequests: 60 // Stricter limits in production
  },
  
  cors: {
    ...defaultSecurityConfig.cors,
    origins: process.env.ALLOWED_ORIGINS 
      ? process.env.ALLOWED_ORIGINS.split(',')
      : ['https://c2pa.example.com']
  },
  
  headers: {
    ...defaultSecurityConfig.headers,
    contentSecurityPolicy: [
      "default-src 'self'",
      "script-src 'self'", // No unsafe-inline in production
      "style-src 'self'", // No unsafe-inline in production
      "img-src 'self' data: https:",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'"
    ].join('; ')
  },
  
  auth: {
    ...defaultSecurityConfig.auth,
    required: true,
    sessionTimeout: 15 * 60, // Shorter session in production
    maxLoginAttempts: 3,
    lockoutDuration: 30 * 60 // Longer lockout in production
  },
  
  monitoring: {
    ...defaultSecurityConfig.monitoring,
    emailRecipients: process.env.ALERT_EMAILS 
      ? process.env.ALERT_EMAILS.split(',')
      : ['security@c2pa.example.com'],
    thresholds: {
      errorRate: 0.01, // 1% - stricter in production
      responseTime: 1000, // 1 second
      memoryUsage: 0.7, // 70%
      cpuUsage: 0.7 // 70%
    }
  }
};

/**
 * Get security configuration based on environment
 */
export function getSecurityConfig(): SecurityConfig {
  const nodeEnv = process.env.NODE_ENV || 'development';
  
  switch (nodeEnv) {
    case 'production':
      return productionSecurityConfig;
    case 'test':
      return {
        ...defaultSecurityConfig,
        auth: { ...defaultSecurityConfig.auth, required: false },
        audit: { ...defaultSecurityConfig.audit, enabled: false },
        monitoring: { ...defaultSecurityConfig.monitoring, enabled: false }
      };
    default:
      return defaultSecurityConfig;
  }
}

/**
 * Validate security configuration
 */
export function validateSecurityConfig(config: SecurityConfig): void {
  const errors: string[] = [];
  
  // Validate JWT configuration
  if (!config.jwt.secret || config.jwt.secret.length < 32) {
    errors.push('JWT secret must be at least 32 characters long');
  }
  
  if (config.jwt.secret === 'development-secret-change-in-production' && process.env.NODE_ENV === 'production') {
    errors.push('JWT secret must be changed in production');
  }
  
  // Validate CORS origins
  if (config.cors.enabled && config.cors.origins.length === 0) {
    errors.push('CORS is enabled but no origins are specified');
  }
  
  // Validate rate limiting
  if (config.rateLimit.enabled && config.rateLimit.maxRequests <= 0) {
    errors.push('Rate limit max requests must be greater than 0');
  }
  
  // Validate monitoring configuration
  if (config.monitoring.enabled && config.monitoring.emailRecipients.length === 0) {
    errors.push('Monitoring is enabled but no email recipients are specified');
  }
  
  if (errors.length > 0) {
    throw new Error(`Security configuration validation failed:\n${errors.join('\n')}`);
  }
}

/**
 * Security environment variables schema
 */
export const securityEnvSchema = {
  JWT_SECRET: {
    type: 'string',
    required: true,
    minLength: 32
  },
  JWT_ISSUER: {
    type: 'string',
    required: false,
    default: 'c2pa-api'
  },
  JWT_AUDIENCE: {
    type: 'string',
    required: false,
    default: 'c2pa-client'
  },
  REDIS_URL: {
    type: 'string',
    required: process.env.NODE_ENV === 'production'
  },
  ALLOWED_ORIGINS: {
    type: 'string',
    required: false,
    pattern: '^https?://[^,]+(,https?://[^,]+)*$'
  },
  ALERT_WEBHOOK_URL: {
    type: 'string',
    required: false,
    pattern: '^https?://.+'
  },
  SLACK_WEBHOOK_URL: {
    type: 'string',
    required: false,
    pattern: '^https://hooks.slack.com/.+$'
  },
  ALERT_EMAILS: {
    type: 'string',
    required: false,
    pattern: '^[^@]+@[^@]+\.[^@]+(,[^@]+@[^@]+\.[^@]+)*$'
  }
};

/**
 * Export security configuration
 */
export const securityConfig = getSecurityConfig();

// Validate configuration on startup
try {
  validateSecurityConfig(securityConfig);
  console.log('✅ Security configuration validated');
} catch (error) {
  console.error('❌ Security configuration validation failed:', error);
  process.exit(1);
}
