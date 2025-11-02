export type OemStatus = 'stable' | 'pilot' | 'unknown';

export interface OemProfile {
  oemId: string;
  displayName: string;
  status: OemStatus;
  notesUrl?: string;
  revocationEndpoint?: string | null;
  updatedAt: string;
}

export interface OemPin {
  oemId: string;
  subject: string;
  issuer: string;
  fingerprintSha256: string;
  notBefore?: string | null;
  notAfter?: string | null;
  revocationUrl?: string | null;
  metadata?: Record<string, unknown>;
  updatedAt: string;
}

export interface DeviceGuidance {
  deviceId: string;
  oemId: string;
  deviceModel?: string | null;
  deviceSerial?: string | null;
  firmwareVersion?: string | null;
  trustScore: number;
  guidance?: Record<string, unknown>;
  lastVerifiedAt?: string | null;
  lastSeenAt?: string | null;
}

export interface OemTrustSnapshot {
  profiles: Record<string, OemProfile>;
  pins: OemPin[];
  guidance: DeviceGuidance[];
  version: string;
  generatedAt: string;
  source: string;
}
