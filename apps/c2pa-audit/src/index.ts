/**
 * C2PA Audit Tool - Main Entry Point
 * Forensic-grade C2PA manifest diff and lineage analysis
 */

import { AuditAPIServer } from '@/api/server';
import { C2PAAuditCLI } from '@/cli';

/**
 * Main application class
 */
class C2PAAuditApp {
  private server: AuditAPIServer;
  private cli: C2PAAuditCLI;

  constructor() {
    this.server = new AuditAPIServer();
    this.cli = new C2PAAuditCLI();
  }

  /**
   * Start the application in server mode
   */
  async startServer(port: number = 3000, host: string = '0.0.0.0'): Promise<void> {
    try {
      await this.server.start(port, host);
      console.log(`🚀 C2PA Audit Tool API server started on ${host}:${port}`);
      console.log(`📊 Web UI available at http://${host}:${port}/ui/`);
      console.log(`📚 API documentation at http://${host}:${port}/health`);
    } catch (error) {
      console.error('❌ Failed to start server:', error);
      process.exit(1);
    }
  }

  /**
   * Run the application in CLI mode
   */
  async runCLI(argv: string[]): Promise<void> {
    try {
      await this.cli.run(argv);
    } catch (error) {
      console.error('❌ CLI execution failed:', error);
      process.exit(1);
    }
  }

  /**
   * Stop the application
   */
  async stop(): Promise<void> {
    try {
      await this.server.stop();
      console.log('🛑 C2PA Audit Tool stopped');
    } catch (error) {
      console.error('❌ Failed to stop application:', error);
    }
  }
}

// Determine execution mode based on command line arguments
const args = process.argv.slice(2);

if (args.includes('--server') || args.includes('-s')) {
  // Server mode
  const port = parseInt(args.find(arg => arg.startsWith('--port='))?.split('=')[1] || '3000');
  const host = args.find(arg => arg.startsWith('--host='))?.split('=')[1] || '0.0.0.0';
  
  const app = new C2PAAuditApp();
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\\n🛑 Received SIGINT, shutting down gracefully...');
    await app.stop();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    console.log('\\n🛑 Received SIGTERM, shutting down gracefully...');
    await app.stop();
    process.exit(0);
  });
  
  app.startServer(port, host).catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
  
} else {
  // CLI mode (default)
  const app = new C2PAAuditApp();
  app.runCLI(process.argv).catch((error) => {
    console.error('Failed to run CLI:', error);
    process.exit(1);
  });
}

export { C2PAAuditApp };
