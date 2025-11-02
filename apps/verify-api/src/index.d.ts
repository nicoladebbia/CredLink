/**
 * C2PA Verification API Server
 * Main Fastify server for provenance verification
 */
/**
 * Create and configure Fastify server
 */
declare function createServer(): Promise<import("fastify").FastifyInstance<import("http").Server<typeof import("http").IncomingMessage, typeof import("http").ServerResponse>, import("http").IncomingMessage, import("http").ServerResponse<import("http").IncomingMessage>, import("fastify").FastifyBaseLogger, import("fastify").FastifyTypeProviderDefault>>;
/**
 * Start the server
 */
declare function start(): Promise<void>;
export { createServer, start };
//# sourceMappingURL=index.d.ts.map