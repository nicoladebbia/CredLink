/**
 * @credlink/types
 * 
 * Shared TypeScript types and interfaces
 */

export interface C2PAManifest {
  '@context': string;
  claim_generator: string;
  claim_generator_info?: Array<{ name: string; version: string }>;
  assertions: C2PAAssertion[];
  signature?: string;
  alg?: string;
}

export interface C2PAAssertion {
  label: string;
  data: any;
}

export interface SigningOptions {
  creator?: string;
  title?: string;
  description?: string;
  useRealC2PA?: boolean;
}

export interface SigningResult {
  signedBuffer: Buffer;
  proofUri: string;
  manifestStore: string;
}

export interface VerificationResult {
  valid: boolean;
  confidence: number;
  timestamp: number;
  processingTime: number;
  details: {
    signature: boolean;
    certificate: boolean;
    proofUri?: string;
    proofFound: boolean;
    proofMatches: boolean;
    manifestTimestamp?: string;
  };
}

export interface ProofRecord {
  proofId: string;
  proofUri: string;
  imageHash: string;
  manifest: C2PAManifest;
  timestamp: string;
  signature: string;
  expiresAt: number;
}

export interface StorageProvider {
  get(key: string): Promise<any | null>;
  set(key: string, value: any): Promise<void>;
  delete(key: string): Promise<boolean>;
  list(prefix?: string): Promise<string[]>;
}
