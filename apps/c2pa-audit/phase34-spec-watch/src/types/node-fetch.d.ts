declare module 'node-fetch' {
  import { RequestInit, Response } from 'node-fetch';

  interface ExtendedRequestInit extends RequestInit {
    timeout?: number;
    method?: string;
    headers?: Record<string, string>;
    redirect?: string;
  }

  function fetch(url: string | Request, init?: ExtendedRequestInit): Promise<Response>;
  export = fetch;
}
