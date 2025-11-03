/**
 * Main Application - Phase 33 Reverse Lab
 * Optimizer Behavior Fingerprinting and Tracking System
 */

import { Orchestrator } from '@/orchestrator/index.js';
import { DocumentationAdapter } from '@/adapters/doc-adapter.js';
import { registerApiRoutes } from '@/api/routes.js';
import { validateEnvironmentVariables, validateNumber } from '@/utils/security.js';

export interface AppConfig {
  orchestrator: {
    port: number;
    host: string;
    redis: {
      host: string;
      port: number;
      password?: string;
      db: number;
    };
    rateLimit: {
      global: number;
      perProvider: number;
    };
    scheduling: {
      weeklyJob: string;
      dailyCheck: string;
    };
    timeouts: {
      job: number;
      request: number;
      verification: number;
    };
  };
  logging: {
    level: string;
    pretty: boolean;
  };
  features: {
    documentationScraping: boolean;
    changeDetection: boolean;
    autoRulesUpdate: boolean;
    weeklyReports: boolean;
  };
}

function loadConfig(): AppConfig {
  // Validate environment variables first
  validateEnvironmentVariables();
  
  // Load configuration from environment variables with secure defaults
  return {
    orchestrator: {
      port: validateNumber(process.env.PORT || '3000', 'PORT', 1, 65535),
      host: process.env.HOST === 'localhost' ? 'localhost' : '127.0.0.1', // Never bind to 0.0.0.0
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: validateNumber(process.env.REDIS_PORT || '6379', 'REDIS_PORT', 1, 65535),
        password: process.env.REDIS_PASSWORD,
        db: validateNumber(process.env.REDIS_DB || '0', 'REDIS_DB', 0, 15),
      },
      rateLimit: {
        global: validateNumber(process.env.GLOBAL_RATE_LIMIT || '100', 'GLOBAL_RATE_LIMIT', 1, 1000),
        perProvider: validateNumber(process.env.PROVIDER_RATE_LIMIT || '10', 'PROVIDER_RATE_LIMIT', 1, 100),
      },
      scheduling: {
        weeklyJob: process.env.WEEKLY_JOB_CRON || '0 2 * * 1', // Monday 2 AM
        dailyCheck: process.env.DAILY_CHECK_CRON || '0 6 * * *', // Daily 6 AM
      },
      timeouts: {
        job: validateNumber(process.env.JOB_TIMEOUT || '3600000', 'JOB_TIMEOUT', 60000, 3600000),
        request: validateNumber(process.env.REQUEST_TIMEOUT || '30000', 'REQUEST_TIMEOUT', 5000, 300000),
        verification: validateNumber(process.env.VERIFICATION_TIMEOUT || '15000', 'VERIFICATION_TIMEOUT', 1000, 60000),
      },
    },
    logging: {
      level: process.env.LOG_LEVEL === 'debug' ? 'debug' : process.env.LOG_LEVEL === 'warn' ? 'warn' : process.env.LOG_LEVEL === 'error' ? 'error' : 'info',
      pretty: process.env.LOG_PRETTY !== 'false',
    },
    features: {
      documentationScraping: process.env['FEATURE_DOCS'] !== 'false',
      changeDetection: process.env['FEATURE_CHANGE_DETECTION'] !== 'false',
      autoRulesUpdate: process.env['FEATURE_AUTO_RULES'] !== 'false',
      weeklyReports: process.env['FEATURE_WEEKLY_REPORTS'] !== 'false',
    },
  };
}

async function main(): Promise<void> {
  const config = loadConfig();
  
  console.log('🚀 Starting C2PA Reverse Lab v1.1.0');
  console.log(`📊 Port: ${config.orchestrator.port}`);
  console.log(`🔴 Redis: ${config.orchestrator.redis.host}:${config.orchestrator.redis.port}`);
  console.log(`📝 Log Level: ${config.logging.level}`);
  
  try {
    // Initialize documentation adapter
    const docAdapter = new DocumentationAdapter();
    
    // Initialize orchestrator
    const orchestrator = new Orchestrator(config.orchestrator);
    
    // Register API routes
    const server = orchestrator.getServer();
    await registerApiRoutes(server, orchestrator, docAdapter);
    
    // Add global error handlers
    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });
    
    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
      process.exit(1);
    });
    
    // Graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
      
      try {
        await orchestrator.stop();
        console.log('✅ Orchestrator stopped successfully');
        process.exit(0);
      } catch (error) {
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
      }
    };
    
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    
    // Start the server
    await orchestrator.start();
    
    console.log('🎯 Reverse Lab is ready!');
    console.log(`📖 API Documentation: http://${config.orchestrator.host}:${config.orchestrator.port}/docs`);
    console.log(`💚 Health Check: http://${config.orchestrator.host}:${config.orchestrator.port}/health`);
    console.log(`📊 System Status: http://${config.orchestrator.host}:${config.orchestrator.port}/api/v1/system/status`);
    
    // Log feature status (without exposing sensitive details)
    console.log('\n⚙️  Features:');
    console.log(`   📚 Documentation Scraping: ${config.features.documentationScraping ? '✅' : '❌'}`);
    console.log(`   🔍 Change Detection: ${config.features.changeDetection ? '✅' : '❌'}`);
    console.log(`   🤖 Auto Rules Update: ${config.features.autoRulesUpdate ? '✅' : '❌'}`);
    console.log(`   📊 Weekly Reports: ${config.features.weeklyReports ? '✅' : '❌'}`);
    
  } catch (error) {
    console.error('❌ Failed to start Reverse Lab:', error);
    process.exit(1);
  }
}

// Run the application
if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Application failed:', error);
    process.exit(1);
  });
}

export { main, loadConfig };
