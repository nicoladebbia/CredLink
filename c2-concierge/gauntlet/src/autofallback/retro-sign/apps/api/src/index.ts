/**
 * C2PA Verification API Server
 * Main entry point for the verification service
 */

import Fastify, { FastifyInstance } from 'fastify';
import { verifyRoutes } from './routes/verify';

async function createServer(): Promise<FastifyInstance> {
  const server = Fastify({
    logger: true,
    trustProxy: true
  });

  // Enable CORS
  server.register(require('@fastify/cors'), {
    origin: true,
    credentials: true
  });

  // Register routes
  server.register(verifyRoutes, { prefix: '/api/v1' });

  // Health check endpoint
  server.get('/health', async (request, reply) => {
    return { 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    };
  });

  // Root endpoint
  server.get('/', async (request, reply) => {
    return { 
      service: 'C2PA Verification API',
      version: '1.0.0',
      endpoints: {
        video: '/api/v1/verify/video',
        audio: '/api/v1/verify/audio',
        mediaMap: '/api/v1/media-map',
        health: '/health'
      }
    };
  });

  // Error handler
  server.setErrorHandler((error, request, reply) => {
    server.log.error(error);
    
    reply.status(500).send({
      error: 'Internal Server Error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  });

  // 404 handler
  server.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      error: 'Not Found',
      message: 'Endpoint not found',
      timestamp: new Date().toISOString()
    });
  });

  return server;
}

async function start() {
  try {
    const server = await createServer();
    
    const port = parseInt(process.env.PORT || '3001');
    const host = process.env.HOST || '0.0.0.0';
    
    await server.listen({ port, host });
    
    console.log(`🚀 C2PA API Server running on http://${host}:${port}`);
    console.log(`📊 Health check: http://${host}:${port}/health`);
    console.log(`📖 API docs: http://${host}:${port}/`);
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Start server if this file is run directly
if (require.main === module) {
  start();
}

export { createServer, start };
