declare module 'node-cron' {
  export function schedule(expression: string, callback: () => void): void;
  export function cron(expression: string, callback: () => void): void;
}

declare module 'rss-parser' {
  interface CustomFieldOptions {
    item?: string[];
  }
  
  interface ParserOptions {
    timeout?: number;
    customFields?: CustomFieldOptions;
  }
  
  export default class RSSParser {
    constructor(options?: ParserOptions);
    parseString(xml: string): Promise<any>;
    parseURL(url: string): Promise<any>;
  }
}
