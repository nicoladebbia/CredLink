/**
 * Security Alert Providers
 * Implements external alerting for security events
 */

import nodeFetch from 'node-fetch';

export interface SecurityAlert {
    severity: 'low' | 'medium' | 'high' | 'critical';
    type: string;
    message: string;
    details: Record<string, any>;
    timestamp: Date;
    source: string;
    correlationId?: string;
}

export interface AlertProvider {
    send(alert: SecurityAlert): Promise<void>;
    isHealthy(): Promise<boolean>;
}

export class SentryAlertProvider implements AlertProvider {
    private sentry: any;

    constructor(dsn: string) {
        this.sentry = require('@sentry/node');
        this.sentry.init({ dsn });
    }

    async send(alert: SecurityAlert): Promise<void> {
        this.sentry.captureMessage(alert.message, {
            level: this.mapSeverity(alert.severity),
            tags: {
                security: 'true',
                alertType: alert.type,
                source: alert.source
            },
            extra: alert.details,
            fingerprint: [alert.type, alert.source]
        });
    }

    async isHealthy(): Promise<boolean> {
        try {
            // Test Sentry connectivity
            await this.sentry.captureMessage('Health check', { level: 'info' });
            return true;
        } catch {
            return false;
        }
    }

    private mapSeverity(severity: string): string {
        switch (severity) {
            case 'critical': return 'fatal';
            case 'high': return 'error';
            case 'medium': return 'warning';
            case 'low': return 'info';
            default: return 'info';
        }
    }
}

export class PagerDutyAlertProvider implements AlertProvider {
    private apiKey: string;
    private integrationKey: string;

    constructor(apiKey: string, integrationKey: string) {
        this.apiKey = apiKey; // Fixed typo from entityKey
        this.integrationKey = integrationKey;
    }

    async send(alert: SecurityAlert): Promise<void> {
        if (alert.severity !== 'critical') {
            return; // Only send critical alerts to PagerDuty
        }

        const payload = {
            routing_key: this.integrationKey,
            event_action: 'trigger',
            payload: {
                summary: alert.message,
                source: alert.source,
                severity: 'critical',
                timestamp: alert.timestamp.toISOString(),
                custom_details: alert.details
            }
        };

        try {
            const response = await nodeFetch('https://events.pagerduty.com/v2/enqueue', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Token token=${this.apiKey}`
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`PagerDuty API error: ${response.status}`);
            }
        } catch (error) {
            console.error('Failed to send PagerDuty alert:', error);
            throw error;
        }
    }

    async isHealthy(): Promise<boolean> {
        try {
            // Test PagerDuty connectivity with a minimal payload
            const testPayload = {
                routing_key: this.integrationKey,
                event_action: 'trigger',
                payload: {
                    summary: 'Health Check',
                    source: 'security-monitor',
                    severity: 'info',
                    custom_details: { test: true }
                }
            };

            const response = await nodeFetch('https://events.pagerduty.com/v2/enqueue', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Token token=${this.apiKey}`
                },
                body: JSON.stringify(testPayload)
            });

            return response.ok;
        } catch {
            return false;
        }
    }
}

export class ConsoleFallbackProvider implements AlertProvider {
    async send(alert: SecurityAlert): Promise<void> {
        console.error('🚨 SECURITY ALERT (FALLBACK):', {
            alertType: alert.type,
            severity: alert.severity,
            source: alert.source,
            message: alert.message,
            details: alert.details,
            timestamp: alert.timestamp.toISOString(),
            correlationId: alert.correlationId
        });
    }

    async isHealthy(): Promise<boolean> {
        return true; // Console is always available
    }
}
