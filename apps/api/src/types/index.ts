export interface SignMetadata {
  issuer?: string;
  softwareAgent?: string;
  customAssertions?: Record<string, any>;
}

export interface SignedImage {
  imageBuffer: Buffer;
  manifest: C2PAManifest;
  manifestHash: string;
}

export interface C2PAManifest {
  claim_generator: string;
  assertions: Assertion[];
  signature_info: SignatureInfo;
  timestamp?: string;
}

export interface Assertion {
  label: string;
  data: Record<string, any>;
}

export interface SignatureInfo {
  alg: string;
  issuer: string;
  certificate?: string;
}

export interface VerificationResult {
  valid: boolean;
  confidence: number;
  timestamp: number;
  processingTime: number;
  details: {
    signature: boolean;
    certificate: boolean;
    proofUri: string | null;
    proofFound: boolean;
    proofMatches: boolean;
    manifestTimestamp?: string;
    // 🔥 STEP 11: Add validation metadata fields
    imageFormat?: string;
    imageDimensions?: {
      width: number;
      height: number;
    };
  };
}

export interface ProofRecord {
  manifest: string; // compressed
  imageHash: string;
  created: number;
  ttl: number;
  accessCount: number;
}
