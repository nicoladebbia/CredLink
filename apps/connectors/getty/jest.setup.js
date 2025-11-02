/**
 * Jest setup for Getty adapter tests
 */

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Mock Headers API
global.Headers = class Headers {
  private headers: Record<string, string> = {};
  
  constructor(init?: Record<string, string>) {
    if (init) {
      this.headers = { ...init };
    }
  }
  
  get(name: string): string | null {
    return this.headers[name.toLowerCase()] || null;
  }
  
  set(name: string, value: string): void {
    this.headers[name.toLowerCase()] = value;
  }
  
  has(name: string): boolean {
    return name.toLowerCase() in this.headers;
  }
  
  delete(name: string): void {
    delete this.headers[name.toLowerCase()];
  }
  
  entries(): Array<[string, string]> {
    return Object.entries(this.headers);
  }
};
