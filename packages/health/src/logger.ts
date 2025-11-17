// Simple logger for health package to avoid circular dependencies
export interface Logger {
  error(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
}

export const logger: Logger = {
  error: (message: string, ...args: any[]) => {
    console.error(`[HEALTH] ${message}`, ...args);
  },
  info: (message: string, ...args: any[]) => {
    console.info(`[HEALTH] ${message}`, ...args);
  },
  warn: (message: string, ...args: any[]) => {
    console.warn(`[HEALTH] ${message}`, ...args);
  }
};
