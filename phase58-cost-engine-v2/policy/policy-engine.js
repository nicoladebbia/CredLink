/**
 * Policy Engine
 * Recommends or auto-applies remediation actions with approval workflows
 *
 * Action types:
 * - force_remote_only: Stop embed-chasing costs
 * - move_manifest_origin: Migrate to R2 for zero egress
 * - add_cache_ttl: Improve cache hit rate
 * - batch_timestamps: Reduce TSA token count
 * - reduce_frequency: Lower timestamp frequency for low-risk assertions
 */

import { createLogger } from '../src/utils/logger.js';
import pg from 'pg';
import axios from 'axios';

const logger = createLogger('PolicyEngine');
const { Pool } = pg;

export class PolicyEngine {
  constructor() {
    // Security: Validate database configuration
    const dbHost = process.env.DB_HOST || 'localhost';
    const dbPort = parseInt(process.env.DB_PORT) || 5432;
    const dbName = process.env.DB_NAME || 'cost_engine';
    const dbUser = process.env.DB_USER || 'postgres';
    const dbPassword = process.env.DB_PASSWORD;

    // Security: Validate hostname to prevent injection
    if (!/^[a-zA-Z0-9.-]+$/.test(dbHost)) {
      throw new Error('Invalid database hostname');
    }

    // Security: Validate port range
    if (dbPort < 1 || dbPort > 65535) {
      throw new Error('Invalid database port');
    }

    // Security: Validate database name format
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(dbName)) {
      throw new Error('Invalid database name format');
    }

    // Security: Validate username format
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(dbUser)) {
      throw new Error('Invalid database username format');
    }

    if (!dbPassword) {
      throw new Error('DB_PASSWORD environment variable is required');
    }

    this.pool = new Pool({
      host: dbHost,
      port: dbPort,
      database: dbName,
      user: dbUser,
      password: dbPassword,
      ssl: process.env.DB_SSL === 'true',
      max: 10,
      // Security: Additional connection security
      connectionTimeoutMillis: 5000,
      query_timeout: 30000
    });

    // Policy configuration
    this.autoActionEnabled = process.env.AUTO_ACTION_ENABLED === 'true';
    this.autoConfidenceThreshold = parseFloat(process.env.AUTO_ACTION_CONFIDENCE_THRESHOLD) || 0.85;
    this.autoImpactThreshold = parseFloat(process.env.AUTO_ACTION_IMPACT_THRESHOLD) || 100.0;
    this.approvalRequired = process.env.APPROVAL_REQUIRED !== 'false';
    this.cooldownHours = parseInt(process.env.COOLDOWN_HOURS) || 24;
    this.eventModeTenants = (process.env.EVENT_MODE_TENANTS || '').split(',').filter(t => t);

    // Alert configuration
    this.webhookUrl = process.env.ALERT_WEBHOOK_URL;
    this.snsTopicArn = process.env.ALERT_SNS_TOPIC_ARN;

    // Security: Validate webhook URL if provided
    if (this.webhookUrl) {
      try {
        new URL(this.webhookUrl);
        // Security: Only allow HTTPS for webhooks
        if (!this.webhookUrl.startsWith('https://')) {
          throw new Error('Webhook URL must use HTTPS');
        }
      } catch (e) {
        throw new Error('Invalid webhook URL format');
      }
    }

    // Security: Validate SNS topic ARN if provided
    if (this.snsTopicArn) {
      if (!/^arn:aws:sns:.*$/.test(this.snsTopicArn)) {
        throw new Error('Invalid SNS topic ARN format');
      }
    }
  }

  /**
   * Initialize policy engine
   */
  async initialize() {
    logger.info('Initializing policy engine');

    try {
      await this.createTables();
      logger.info('Policy engine initialized');
    } catch (error) {
      logger.error('Failed to initialize policy engine', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Create database tables
   */
  async createTables() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS actions (
        id SERIAL PRIMARY KEY,
        anomaly_id INT NOT NULL,
        action_type VARCHAR(50) NOT NULL,
        tenant_id VARCHAR(100) NOT NULL,
        route VARCHAR(255),
        status VARCHAR(50) DEFAULT 'recommended',
        confidence DECIMAL(3, 2) NOT NULL,
        impact_usd_day DECIMAL(12, 6) NOT NULL,
        details JSONB NOT NULL,
        applied_at TIMESTAMP,
        rolled_back_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY (anomaly_id) REFERENCES anomalies(id)
      );

      CREATE INDEX IF NOT EXISTS idx_actions_status ON actions(status);
      CREATE INDEX IF NOT EXISTS idx_actions_tenant ON actions(tenant_id);
    `);
  }

  /**
   * Process anomalies and generate/apply actions
   */
  async processAnomalies(anomalies) {
    logger.info('Processing anomalies', { count: anomalies.length });

    const actions = [];

    for (const anomaly of anomalies) {
      // Check if tenant is in event mode (allow legitimate spikes)
      if (this.eventModeTenants.includes(anomaly.tenant_id)) {
        logger.info('Tenant in event mode, skipping action', {
          tenant: anomaly.tenant_id
        });
        continue;
      }

      // Check cooldown period
      const inCooldown = await this.isInCooldown(anomaly.tenant_id, anomaly.kind);
      if (inCooldown) {
        logger.info('Action in cooldown period, skipping', {
          tenant: anomaly.tenant_id,
          kind: anomaly.kind
        });
        continue;
      }

      // Generate actions from proposed fixes
      for (const proposed of anomaly.proposed || []) {
        const action = {
          anomaly_id: anomaly.id,
          action_type: proposed.action,
          tenant_id: anomaly.tenant_id,
          route: anomaly.route,
          confidence: anomaly.confidence,
          impact_usd_day: anomaly.impact_usd_day,
          details: {
            why: proposed.why,
            to: proposed.to,
            anomaly: anomaly
          },
          status: 'recommended'
        };

        // Determine if auto-apply
        if (this.shouldAutoApply(action)) {
          action.status = 'applied';
          action.applied_at = new Date();
          await this.applyAction(action);

          logger.info('Action auto-applied', {
            action: action.action_type,
            tenant: action.tenant_id
          });
        } else if (this.approvalRequired) {
          action.status = 'pending_approval';

          // Send alert for approval
          await this.sendAlert(action);

          logger.info('Action pending approval', {
            action: action.action_type,
            tenant: action.tenant_id
          });
        }

        actions.push(action);
      }
    }

    // Save actions
    if (actions.length > 0) {
      await this.saveActions(actions);
    }

    return actions;
  }

  /**
   * Check if action should be auto-applied
   */
  shouldAutoApply(action) {
    return (
      this.autoActionEnabled &&
      action.confidence >= this.autoConfidenceThreshold &&
      action.impact_usd_day >= this.autoImpactThreshold
    );
  }

  /**
   * Check if action is in cooldown period
   */
  async isInCooldown(tenantId, kind) {
    try {
      // Security: Validate and escape cooldownHours to prevent SQL injection
      const hours = parseInt(this.cooldownHours);
      if (isNaN(hours) || hours < 0 || hours > 8760) {
        // Max 1 year
        throw new Error('Invalid cooldown hours value');
      }

      const result = await this.pool.query(
        `
        SELECT COUNT(*) as count
        FROM actions a
        JOIN anomalies an ON a.anomaly_id = an.id
        WHERE a.tenant_id = $1
          AND an.kind = $2
          AND a.status = 'applied'
          AND a.applied_at >= NOW() - INTERVAL '${hours} hours'
      `,
        [tenantId, kind]
      );

      return parseInt(result.rows[0].count) > 0;
    } catch (error) {
      logger.error('Failed to check cooldown', {
        error: error.message
      });
      return false;
    }
  }

  /**
   * Apply action (mock implementation)
   * In production, this would make API calls to modify routes, configs, etc.
   */
  async applyAction(action) {
    logger.info('Applying action', {
      type: action.action_type,
      tenant: action.tenant_id
    });

    // Mock implementation - would integrate with actual infrastructure APIs
    switch (action.action_type) {
      case 'force_remote_only':
        logger.info('Would set route to remote-only', {
          route: action.route
        });
        break;

      case 'move_manifest_origin':
        logger.info('Would migrate manifest origin to R2', {
          destination: action.details.to
        });
        break;

      case 'add_cache_ttl':
        logger.info('Would add cache TTL header', {
          route: action.route
        });
        break;

      case 'batch_timestamps':
        logger.info('Would enable timestamp batching', {
          tenant: action.tenant_id
        });
        break;

      case 'reduce_frequency':
        logger.info('Would reduce timestamp frequency', {
          tenant: action.tenant_id
        });
        break;

      default:
        logger.warn('Unknown action type', {
          type: action.action_type
        });
    }
  }

  /**
   * Rollback action
   */
  async rollbackAction(actionId) {
    logger.info('Rolling back action', { id: actionId });

    try {
      const result = await this.pool.query(
        `
        UPDATE actions
        SET status = 'rolled_back',
            rolled_back_at = NOW()
        WHERE id = $1
        RETURNING *
      `,
        [actionId]
      );

      if (result.rows.length === 0) {
        throw new Error('Action not found');
      }

      const action = result.rows[0];

      // Perform rollback (mock)
      logger.info('Action rolled back successfully', {
        id: actionId,
        type: action.action_type
      });

      return action;
    } catch (error) {
      logger.error('Failed to rollback action', {
        id: actionId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Send alert (webhook or SNS)
   */
  async sendAlert(action) {
    const alert = {
      tenant: action.tenant_id,
      kind: action.details.anomaly.kind,
      route: action.route,
      delta_pct: action.details.anomaly.delta_pct,
      impact_usd_day: action.impact_usd_day,
      confidence: action.confidence,
      evidence: action.details.anomaly.evidence,
      proposed: [
        {
          action: action.action_type,
          why: action.details.why
        }
      ]
    };

    // Send to webhook
    if (this.webhookUrl) {
      try {
        await axios.post(this.webhookUrl, alert, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 5000
        });
        logger.info('Alert sent to webhook', {
          url: this.webhookUrl
        });
      } catch (error) {
        logger.error('Failed to send webhook alert', {
          error: error.message
        });
      }
    }

    // Send to SNS (mock)
    if (this.snsTopicArn) {
      logger.info('Would send alert to SNS', {
        topic: this.snsTopicArn
      });
    }
  }

  /**
   * Save actions to database
   */
  async saveActions(actions) {
    for (const action of actions) {
      await this.pool.query(
        `
        INSERT INTO actions (
          anomaly_id, action_type, tenant_id, route,
          status, confidence, impact_usd_day, details, applied_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
        [
          action.anomaly_id,
          action.action_type,
          action.tenant_id,
          action.route,
          action.status,
          action.confidence,
          action.impact_usd_day,
          JSON.stringify(action.details),
          action.applied_at || null
        ]
      );
    }

    logger.info('Actions saved', { count: actions.length });
  }

  async close() {
    await this.pool.end();
  }
}

export default PolicyEngine;
