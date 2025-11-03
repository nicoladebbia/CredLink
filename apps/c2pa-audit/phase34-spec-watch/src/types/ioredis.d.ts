declare module 'ioredis' {
  interface RedisOptions {
    host: string;
    port: number;
    password?: string | undefined;
    db: number;
    maxRetriesPerRequest?: number;
  }
  
  export class Redis {
    constructor(options: RedisOptions);
    ping(): Promise<string>;
    info(section?: string): Promise<string>;
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<string>;
    quit(): Promise<void>;
  }
}
