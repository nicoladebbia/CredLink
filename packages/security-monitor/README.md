# @credlink/security-monitor

Comprehensive security monitoring and threat detection system for CredLink.

## Features

- Real-time threat detection
- Security event logging
- Integration with Sentry
- Performance monitoring
- Alert system
- TypeScript support

## Usage

```typescript
import { SecurityMonitor } from '@credlink/security-monitor';

const monitor = new SecurityMonitor({
  sentryDsn: process.env.SENTRY_DSN,
  enableRealTimeMonitoring: true
});

// Log security event
monitor.logSecurityEvent({
  type: 'authentication_failure',
  userId: 'user-123',
  ip: '192.168.1.100',
  severity: 'high'
});

// Check for threats
const threats = await monitor.scanForThreats();
console.log(threats);
```

## Security Events

### Authentication Events
- `authentication_success`
- `authentication_failure`
- `account_locked`
- `password_reset`

### Authorization Events
- `access_denied`
- `permission_violation`
- `privilege_escalation`

### Data Events
- `data_access`
- `data_modification`
- `data_export`
- `suspicious_activity`

## Threat Detection

### Pattern Matching
- Brute force attacks
- SQL injection attempts
- XSS attack patterns
- Anomalous access patterns

### Behavioral Analysis
- Unusual login times
- Geographic anomalies
- Access pattern deviations
- Resource consumption spikes

## API

### `logSecurityEvent(event: SecurityEvent): void`
Log a security event for monitoring.

### `scanForThreats(): Promise<Threat[]>`
Scan for active threats and vulnerabilities.

### `getSecurityReport(timeRange: TimeRange): Promise<SecurityReport>`
Generate comprehensive security report.

### `configureAlerts(config: AlertConfig): void`
Configure security alerts and notifications.

## Configuration

Environment variables:
- `SENTRY_DSN`: Sentry error tracking DSN
- `SECURITY_MONITOR_ENABLED`: Enable/disable monitoring
- `THREAT_DETECTION_LEVEL`: Detection sensitivity (low/medium/high)
- `ALERT_WEBHOOK_URL`: Webhook for security alerts

## Integration

### Sentry Integration
```typescript
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  integrations: [
    new SecurityMonitorIntegration()
  ]
});
```

### Custom Monitoring
```typescript
monitor.addCustomDetector({
  name: 'custom-threat',
  detector: async (data) => {
    // Custom threat detection logic
    return isThreat(data);
  }
});
```

## Alert Types

- **Critical**: Immediate action required
- **High**: Investigate within 1 hour
- **Medium**: Investigate within 24 hours
- **Low**: Log for future analysis
