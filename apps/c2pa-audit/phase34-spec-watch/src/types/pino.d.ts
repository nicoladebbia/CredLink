declare module 'pino' {
  interface TransportOptions {
    target: string;
  }
  
  interface LoggerOptions {
    level: string;
    transport?: TransportOptions;
  }
  
  interface Logger {
    info(message: string, ...args: any[]): void;
    info(obj: any, message: string): void;
    error(message: string, ...args: any[]): void;
    error(obj: any, message: string): void;
    warn(message: string, ...args: any[]): void;
    warn(obj: any, message: string): void;
    debug(message: string, ...args: any[]): void;
    debug(obj: any, message: string): void;
  }
  
  export const pino: (options: LoggerOptions) => Logger;
}
