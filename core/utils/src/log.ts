import { createHash, createHmac } from 'crypto';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

export interface DeterministicLog {
  ts: string;
  tenant_id: string;
  asset_id: string;          // sha256 of asset bytes (post-transform)
  manifest_hash: string;      // expected manifest sha256 (from URL path)
  scenario_id: string;
  sandbox: string;
  policy: 'remote-only' | 'preserve-allowed';
  headers_snapshot: {
    'content-type': string;
    'cache-control': string;
    'etag': string;
    'link': string;
  };
  probes: {
    link_header_present: boolean;
    html_link_fallback: boolean;
    manifest_fetch_status: number;
  };
  verdict: { 
    remote_survives: boolean; 
    embed_survives: boolean; 
  };
  timings_ms: {
    edge_worker: number;
    origin: number;
    manifest_fetch: number;
  };
  hash_alignment: boolean;
  sig: string;
}

export class DeterministicLogger {
  private secretKey: string;
  private logDir: string;

  constructor(secretKey: string, logDir: string = '.artifacts/logs') {
    this.secretKey = secretKey;
    this.logDir = logDir;
    mkdirSync(logDir, { recursive: true });
  }

  createLogEntry(data: Omit<DeterministicLog, 'ts' | 'sig'>): DeterministicLog {
    const timestamp = new Date().toISOString();
    
    const logEntry: Omit<DeterministicLog, 'sig'> = {
      ts: timestamp,
      ...data
    };

    // Create signature
    const signature = this.signLogEntry(logEntry);
    
    return {
      ...logEntry,
      sig: signature
    };
  }

  private signLogEntry(entry: Omit<DeterministicLog, 'sig'>): string {
    // Create canonical string representation
    const canonical = JSON.stringify(entry, Object.keys(entry).sort());
    
    // Sign with HMAC
    const hmac = createHmac('sha256', this.secretKey);
    hmac.update(canonical);
    return hmac.digest('hex');
  }

  writeLog(log: DeterministicLog): void {
    const logFile = join(this.logDir, `deterministic-${Date.now()}.ndjson`);
    const logLine = JSON.stringify(log) + '\n';
    writeFileSync(logFile, logLine, { flag: 'a' });
  }

  verifyLogSignature(log: DeterministicLog): boolean {
    const { sig, ...logData } = log;
    const expectedSig = this.signLogEntry(logData);
    return sig === expectedSig;
  }
}

export function createSha256Hash(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}
