export interface HealthCheckResult {
  component: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime?: number;
  errorMessage?: string;
  details?: Record<string, any>;
  lastChecked: Date;
}

export interface ServiceHealth {
  service: string;
  overallStatus: 'healthy' | 'degraded' | 'unhealthy';
  checks: HealthCheckResult[];
  uptime: number;
  version: string;
  timestamp: Date;
}

export interface HealthAlert {
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  details: ServiceHealth;
}

export interface AlertThresholds {
  responseTime: number;
  consecutiveFailures: number;
  degradedThreshold: number;
}
