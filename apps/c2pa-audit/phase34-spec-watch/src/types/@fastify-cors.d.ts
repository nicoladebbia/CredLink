declare module '@fastify/cors' {
  import { FastifyPlugin } from 'fastify';
  
  interface CorsOptions {
    origin?: boolean | string | string[];
    credentials?: boolean;
  }
  
  const cors: FastifyPlugin<CorsOptions>;
  export default cors;
}
