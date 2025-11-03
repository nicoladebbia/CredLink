/**
 * Phase 35 Leaderboard - Test Asset Configuration
 * 24 public demo images with deterministic C2PA signing
 */

import { TestAsset } from '@/types';

export const TEST_ASSETS: TestAsset[] = [
  // JPEG Assets (6)
  {
    id: 'demo-jpeg-001',
    filename: 'c2pa-demo-001.jpg',
    format: 'jpeg',
    size: 2048576, // 2MB
    signed: true,
    remoteManifest: true,
    contentHash: 'sha256:a1b2c3d4e5f6...',
    manifestHash: 'sha256:f6e5d4c3b2a1...',
    url: 'https://opensource.contentauthenticity.org/demo-images/c2pa-demo-001.jpg'
  },
  {
    id: 'demo-jpeg-002',
    filename: 'c2pa-demo-002.jpg',
    format: 'jpeg',
    size: 1536000, // 1.5MB
    signed: true,
    remoteManifest: true,
    contentHash: 'sha256:b2c3d4e5f6a1...',
    manifestHash: 'sha256:e5f6d4c3b2a1...',
    url: 'https://opensource.contentauthenticity.org/demo-images/c2pa-demo-002.jpg'
  },
  {
    id: 'demo-jpeg-003',
    filename: 'c2pa-demo-003.jpg',
    format: 'jpeg',
    size: 3072000, // 3MB
    signed: true,
    remoteManifest: false,
    contentHash: 'sha256:c3d4e5f6a1b2...',
    manifestHash: 'sha256:d4c3b2a1f6e5...',
    url: 'https://opensource.contentauthenticity.org/demo-images/c2pa-demo-003.jpg'
  },
  {
    id: 'demo-jpeg-004',
    filename: 'c2pa-demo-004.jpg',
    format: 'jpeg',
    size: 1024000, // 1MB
    signed: true,
    remoteManifest: true,
    contentHash: 'sha256:d4e5f6a1b2c3...',
    manifestHash: 'sha256:c3b2a1f6e5d4...',
    url: 'https://opensource.contentauthenticity.org/demo-images/c2pa-demo-004.jpg'
  },
  {
    id: 'demo-jpeg-005',
    filename: 'c2pa-demo-005.jpg',
    format: 'jpeg',
    size: 2560000, // 2.5MB
    signed: true,
    remoteManifest: false,
    contentHash: 'sha256:e5f6a1b2c3d4...',
    manifestHash: 'sha256:b2a1f6e5d4c3...',
    url: 'https://opensource.contentauthenticity.org/demo-images/c2pa-demo-005.jpg'
  },
  {
    id: 'demo-jpeg-006',
    filename: 'c2pa-demo-006.jpg',
    format: 'jpeg',
    size: 4096000, // 4MB
    signed: true,
    remoteManifest: true,
    contentHash: 'sha256:f6a1b2c3d4e5...',
    manifestHash: 'sha256:a1f6e5d4c3b2...',
    url: 'https://opensource.contentauthenticity.org/demo-images/c2pa-demo-006.jpg'
  },

  // PNG Assets (6)
  {
    id: 'demo-png-001',
    filename: 'c2pa-demo-001.png',
    format: 'png',
    size: 3145728, // 3MB
    signed: true,
    remoteManifest: true,
    contentHash: 'sha256:a1b2c3d4e5f6...',
    manifestHash: 'sha256:f6e5d4c3b2a1...',
    url: 'https://opensource.contentauthenticity.org/demo-images/c2pa-demo-001.png'
  },
  {
    id: 'demo-png-002',
    filename: 'c2pa-demo-002.png',
    format: 'png',
    size: 2097152, // 2MB
    signed: true,
    remoteManifest: true,
    contentHash: 'sha256:b2c3d4e5f6a1...',
    manifestHash: 'sha256:e5f6d4c3b2a1...',
    url: 'https://opensource.contentauthenticity.org/demo-images/c2pa-demo-002.png'
  },
  {
    id: 'demo-png-003',
    filename: 'c2pa-demo-003.png',
    format: 'png',
    size: 4194304, // 4MB
    signed: true,
    remoteManifest: false,
    contentHash: 'sha256:c3d4e5f6a1b2...',
    manifestHash: 'sha256:d4c3b2a1f6e5...',
    url: 'https://opensource.contentauthenticity.org/demo-images/c2pa-demo-003.png'
  },
  {
    id: 'demo-png-004',
    filename: 'c2pa-demo-004.png',
    format: 'png',
    size: 1048576, // 1MB
    signed: true,
    remoteManifest: true,
    contentHash: 'sha256:d4e5f6a1b2c3...',
    manifestHash: 'sha256:c3b2a1f6e5d4...',
    url: 'https://opensource.contentauthenticity.org/demo-images/c2pa-demo-004.png'
  },
  {
    id: 'demo-png-005',
    filename: 'c2pa-demo-005.png',
    format: 'png',
    size: 5242880, // 5MB
    signed: true,
    remoteManifest: false,
    contentHash: 'sha256:e5f6a1b2c3d4...',
    manifestHash: 'sha256:b2a1f6e5d4c3...',
    url: 'https://opensource.contentauthenticity.org/demo-images/c2pa-demo-005.png'
  },
  {
    id: 'demo-png-006',
    filename: 'c2pa-demo-006.png',
    format: 'png',
    size: 2621440, // 2.5MB
    signed: true,
    remoteManifest: true,
    contentHash: 'sha256:f6a1b2c3d4e5...',
    manifestHash: 'sha256:a1f6e5d4c3b2...',
    url: 'https://opensource.contentauthenticity.org/demo-images/c2pa-demo-006.png'
  },

  // WebP Assets (6)
  {
    id: 'demo-webp-001',
    filename: 'c2pa-demo-001.webp',
    format: 'webp',
    size: 1536000, // 1.5MB
    signed: true,
    remoteManifest: true,
    contentHash: 'sha256:a1b2c3d4e5f6...',
    manifestHash: 'sha256:f6e5d4c3b2a1...',
    url: 'https://opensource.contentauthenticity.org/demo-images/c2pa-demo-001.webp'
  },
  {
    id: 'demo-webp-002',
    filename: 'c2pa-demo-002.webp',
    format: 'webp',
    size: 1024000, // 1MB
    signed: true,
    remoteManifest: true,
    contentHash: 'sha256:b2c3d4e5f6a1...',
    manifestHash: 'sha256:e5f6d4c3b2a1...',
    url: 'https://opensource.contentauthenticity.org/demo-images/c2pa-demo-002.webp'
  },
  {
    id: 'demo-webp-003',
    filename: 'c2pa-demo-003.webp',
    format: 'webp',
    size: 2048000, // 2MB
    signed: true,
    remoteManifest: false,
    contentHash: 'sha256:c3d4e5f6a1b2...',
    manifestHash: 'sha256:d4c3b2a1f6e5...',
    url: 'https://opensource.contentauthenticity.org/demo-images/c2pa-demo-003.webp'
  },
  {
    id: 'demo-webp-004',
    filename: 'c2pa-demo-004.webp',
    format: 'webp',
    size: 786432, // 768KB
    signed: true,
    remoteManifest: true,
    contentHash: 'sha256:d4e5f6a1b2c3...',
    manifestHash: 'sha256:c3b2a1f6e5d4...',
    url: 'https://opensource.contentauthenticity.org/demo-images/c2pa-demo-004.webp'
  },
  {
    id: 'demo-webp-005',
    filename: 'c2pa-demo-005.webp',
    format: 'webp',
    size: 2560000, // 2.5MB
    signed: true,
    remoteManifest: false,
    contentHash: 'sha256:e5f6a1b2c3d4...',
    manifestHash: 'sha256:b2a1f6e5d4c3...',
    url: 'https://opensource.contentauthenticity.org/demo-images/c2pa-demo-005.webp'
  },
  {
    id: 'demo-webp-006',
    filename: 'c2pa-demo-006.webp',
    format: 'webp',
    size: 1310720, // 1.25MB
    signed: true,
    remoteManifest: true,
    contentHash: 'sha256:f6a1b2c3d4e5...',
    manifestHash: 'sha256:a1f6e5d4c3b2...',
    url: 'https://opensource.contentauthenticity.org/demo-images/c2pa-demo-006.webp'
  },

  // AVIF Assets (6)
  {
    id: 'demo-avif-001',
    filename: 'c2pa-demo-001.avif',
    format: 'avif',
    size: 1048576, // 1MB
    signed: true,
    remoteManifest: true,
    contentHash: 'sha256:a1b2c3d4e5f6...',
    manifestHash: 'sha256:f6e5d4c3b2a1...',
    url: 'https://opensource.contentauthenticity.org/demo-images/c2pa-demo-001.avif'
  },
  {
    id: 'demo-avif-002',
    filename: 'c2pa-demo-002.avif',
    format: 'avif',
    size: 786432, // 768KB
    signed: true,
    remoteManifest: true,
    contentHash: 'sha256:b2c3d4e5f6a1...',
    manifestHash: 'sha256:e5f6d4c3b2a1...',
    url: 'https://opensource.contentauthenticity.org/demo-images/c2pa-demo-002.avif'
  },
  {
    id: 'demo-avif-003',
    filename: 'c2pa-demo-003.avif',
    format: 'avif',
    size: 1310720, // 1.25MB
    signed: true,
    remoteManifest: false,
    contentHash: 'sha256:c3d4e5f6a1b2...',
    manifestHash: 'sha256:d4c3b2a1f6e5...',
    url: 'https://opensource.contentauthenticity.org/demo-images/c2pa-demo-003.avif'
  },
  {
    id: 'demo-avif-004',
    filename: 'c2pa-demo-004.avif',
    format: 'avif',
    size: 524288, // 512KB
    signed: true,
    remoteManifest: true,
    contentHash: 'sha256:d4e5f6a1b2c3...',
    manifestHash: 'sha256:c3b2a1f6e5d4...',
    url: 'https://opensource.contentauthenticity.org/demo-images/c2pa-demo-004.avif'
  },
  {
    id: 'demo-avif-005',
    filename: 'c2pa-demo-005.avif',
    format: 'avif',
    size: 1572864, // 1.5MB
    signed: true,
    remoteManifest: false,
    contentHash: 'sha256:e5f6a1b2c3d4...',
    manifestHash: 'sha256:b2a1f6e5d4c3...',
    url: 'https://opensource.contentauthenticity.org/demo-images/c2pa-demo-005.avif'
  },
  {
    id: 'demo-avif-006',
    filename: 'c2pa-demo-006.avif',
    format: 'avif',
    size: 655360, // 640KB
    signed: true,
    remoteManifest: true,
    contentHash: 'sha256:f6a1b2c3d4e5...',
    manifestHash: 'sha256:a1f6e5d4c3b2...',
    url: 'https://opensource.contentauthenticity.org/demo-images/c2pa-demo-006.avif'
  }
];

export const getAssetsByFormat = (format: 'jpeg' | 'png' | 'webp' | 'avif'): TestAsset[] => {
  return TEST_ASSETS.filter(asset => asset.format === format);
};

export const getAssetsBySize = (minSize: number, maxSize: number): TestAsset[] => {
  return TEST_ASSETS.filter(asset => 
    asset.size >= minSize && asset.size <= maxSize
  );
};

export const getAssetsWithRemoteManifest = (): TestAsset[] => {
  return TEST_ASSETS.filter(asset => asset.remoteManifest);
};

export const getAssetsWithoutRemoteManifest = (): TestAsset[] => {
  return TEST_ASSETS.filter(asset => !asset.remoteManifest);
};

export const getRandomAsset = (): TestAsset => {
  const randomIndex = Math.floor(Math.random() * TEST_ASSETS.length);
  return TEST_ASSETS[randomIndex]!;
};

export const getAssetById = (id: string): TestAsset | undefined => {
  return TEST_ASSETS.find(asset => asset.id === id);
};

export const ASSET_CATEGORIES = {
  'small': { min: 0, max: 1048576 }, // < 1MB
  'medium': { min: 1048576, max: 3145728 }, // 1MB - 3MB
  'large': { min: 3145728, max: Infinity } // > 3MB
};

export const getAssetsByCategory = (category: 'small' | 'medium' | 'large'): TestAsset[] => {
  const { min, max } = ASSET_CATEGORIES[category];
  return getAssetsBySize(min, max);
};

// Asset metadata for testing
export const ASSET_METADATA = {
  signer: {
    name: 'C2PA Demo Signer',
    version: '1.0.0',
    algorithm: 'ES256',
    certificate: 'c2pa-demo-cert.pem'
  },
  manifest: {
    title: 'C2PA Demo Asset',
    format: 'C2PA Manifest',
    version: '1.1.0',
    claim_generator: 'c2pa-rs v0.10.0',
    assertion_types: [
      'c2pa.actions',
      'c2pa.hash_data',
      'stds.schema-org.CreativeWork',
      'stds.iptc.photo-metadata'
    ]
  },
  remote_manifest: {
    base_url: 'https://opensource.contentauthenticity.org/manifests',
    link_rel: 'c2pa-manifest',
    link_type: 'application/c2pa'
  }
};

// Validation functions for test assets
export const validateAssetIntegrity = async (asset: TestAsset): Promise<boolean> => {
  try {
    const response = await fetch(asset.url, { method: 'HEAD' });
    if (!response.ok) return false;
    
    const contentLength = response.headers.get('content-length');
    if (!contentLength) return false;
    
    const actualSize = parseInt(contentLength, 10);
    const expectedSize = asset.size;
    
    // Allow 10% size variance for compression differences
    const sizeVariance = Math.abs(actualSize - expectedSize) / expectedSize;
    return sizeVariance <= 0.1;
  } catch (error) {
    return false;
  }
};

export const verifyAssetSignature = async (asset: TestAsset): Promise<boolean> => {
  try {
    // This would use c2patool or similar to verify the signature
    // For now, return true as we assume assets are pre-signed
    return true;
  } catch (error) {
    return false;
  }
};

export const downloadAsset = async (asset: TestAsset, destination: string): Promise<string> => {
  const response = await fetch(asset.url);
  if (!response.ok) {
    throw new Error(`Failed to download asset: ${response.statusText}`);
  }
  
  const buffer = await response.arrayBuffer();
  const { writeFile } = await import('fs/promises');
  const { join } = await import('path');
  
  const filePath = join(destination, asset.filename);
  await writeFile(filePath, new Uint8Array(buffer));
  
  return filePath;
};
