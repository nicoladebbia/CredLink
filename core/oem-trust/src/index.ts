import { createHash } from 'crypto';
import type { DeviceGuidance, OemPin, OemProfile, OemStatus, OemTrustSnapshot } from './types.js';

const SOURCE_DOC = 'docs/oem/trust-profiles.md';

const now = () => new Date().toISOString();

const OEM_PROFILES: Record<string, OemProfile> = {
  leica: {
    oemId: 'leica',
    displayName: 'Leica Camera AG',
    status: 'stable',
    notesUrl: 'https://contentauthenticity.org/cameras/leica-m11-p',
    revocationEndpoint: null,
    updatedAt: now()
  },
  nikon: {
    oemId: 'nikon',
    displayName: 'Nikon Corporation',
    status: 'pilot',
    notesUrl: 'https://contentauthenticity.org/cameras/nikon-authenticity-service',
    revocationEndpoint: null,
    updatedAt: now()
  }
};

const OEM_PINS: OemPin[] = [
  {
    oemId: 'leica',
    subject: 'Leica Camera Production Signer 2023',
    issuer: 'Leica Camera AG Root',
    fingerprintSha256: 'C3371D91FE5F839549A12FA8E3BE0549F6F0F1A7C55F6F5D2F3F7DAB1D0E6F99',
    notBefore: '2023-10-01T00:00:00Z',
    notAfter: null,
    metadata: { device_models: ['Leica M11-P'] },
    updatedAt: now()
  },
  {
    oemId: 'nikon',
    subject: 'Nikon Authenticity Service Pilot',
    issuer: 'Nikon Corporation',
    fingerprintSha256: '9B57E37A8FD4C9F16BC6F32BD97A4F8C8CBEFA9F3A6D71DB91D0972BEEA8D3F1',
    notBefore: '2024-06-01T00:00:00Z',
    notAfter: null,
    metadata: { confidence: 'pilot', firmware: ['Z6III beta'] },
    updatedAt: now()
  }
];

const DEVICE_GUIDANCE: DeviceGuidance[] = [
  {
    deviceId: 'dev:leica:m11-p',
    oemId: 'leica',
    deviceModel: 'Leica M11-P',
    trustScore: 20,
    guidance: {
      posture: 'hardware-backed signing key',
      badge: 'Captured with Leica M11-P',
      notes: 'First production camera shipping with Content Credentials'
    },
    lastVerifiedAt: null,
    lastSeenAt: null
  },
  {
    deviceId: 'dev:nikon:z6iii',
    oemId: 'nikon',
    deviceModel: 'Nikon Z6III',
    trustScore: 10,
    guidance: {
      posture: 'pilot firmware',
      badge: 'Captured with Nikon Z6III (pilot)',
      notes: 'Treat as pilot until Nikon GA authenticity service'
    },
    lastVerifiedAt: null,
    lastSeenAt: null
  }
];

const OEM_TRUST_SNAPSHOT: OemTrustSnapshot = {
  profiles: OEM_PROFILES,
  pins: OEM_PINS,
  guidance: DEVICE_GUIDANCE,
  version: createHash('sha256')
    .update(JSON.stringify({ profiles: OEM_PROFILES, pins: OEM_PINS, guidance: DEVICE_GUIDANCE }))
    .digest('hex'),
  generatedAt: now(),
  source: SOURCE_DOC
};

export function getSnapshot(): OemTrustSnapshot {
  return OEM_TRUST_SNAPSHOT;
}

export function getOemProfile(oemId: string): OemProfile | undefined {
  return OEM_PROFILES[oemId.toLowerCase()];
}

export function listOemPins(oemId?: string): OemPin[] {
  if (!oemId) {
    return OEM_PINS;
  }
  return OEM_PINS.filter(pin => pin.oemId === oemId.toLowerCase());
}

export function isPinnedFingerprint(fingerprintSha256: string): boolean {
  const normalized = fingerprintSha256.toUpperCase();
  return OEM_PINS.some(pin => pin.fingerprintSha256 === normalized);
}

export function getDeviceGuidance(deviceId: string): DeviceGuidance | undefined {
  return DEVICE_GUIDANCE.find(device => device.deviceId === deviceId);
}

export function registerObservation(deviceId: string, oemId: string, when: Date): void {
  const entry = DEVICE_GUIDANCE.find(device => device.deviceId === deviceId);
  if (entry) {
    entry.lastSeenAt = when.toISOString();
    entry.lastVerifiedAt = entry.lastVerifiedAt ?? entry.lastSeenAt;
    return;
  }

  console.warn(
    JSON.stringify({
      event: 'oem_device_observation',
      deviceId,
      oemId,
      observedAt: when.toISOString()
    })
  );
}

export function updateOemStatus(oemId: string, status: OemStatus): void {
  const profile = OEM_PROFILES[oemId.toLowerCase()];
  if (!profile) {
    throw new Error(`Unknown OEM profile: ${oemId}`);
  }
  profile.status = status;
  profile.updatedAt = now();
}

export * from './types.js';
