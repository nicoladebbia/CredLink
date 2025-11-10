/**
 * Test Assets Configuration - Phase 33 Reverse Lab
 * Public demo images with C2PA manifests for optimizer testing
 */

import type { TestAsset } from '@/types/index.js';

export const TEST_ASSETS: TestAsset[] = [
  {
    id: 'c2pa-demo-001',
    name: 'C2PA Demo Image 1 - Landscape',
    format: 'jpeg',
    size: 2048576,
    hasEmbeddedManifest: true,
    hasRemoteManifest: false,
    checksum: 'sha256:a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456',
    publicUrl: 'https://opensource.contentauthenticity.org/samples/1.jpg',
  },
  {
    id: 'c2pa-demo-002',
    name: 'C2PA Demo Image 2 - Portrait',
    format: 'jpeg',
    size: 1536000,
    hasEmbeddedManifest: true,
    hasRemoteManifest: false,
    checksum: 'sha256:b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef1234567',
    publicUrl: 'https://opensource.contentauthenticity.org/samples/2.jpg',
  },
  {
    id: 'c2pa-demo-003',
    name: 'C2PA Demo Image 3 - PNG',
    format: 'png',
    size: 3072000,
    hasEmbeddedManifest: true,
    hasRemoteManifest: false,
    checksum: 'sha256:c3d4e5f6789012345678901234567890abcdef1234567890abcdef12345678',
    publicUrl: 'https://opensource.contentauthenticity.org/samples/3.png',
  },
  {
    id: 'c2pa-demo-004',
    name: 'C2PA Demo Image 4 - WebP',
    format: 'webp',
    size: 1024000,
    hasEmbeddedManifest: true,
    hasRemoteManifest: false,
    checksum: 'sha256:d4e5f6789012345678901234567890abcdef1234567890abcdef123456789',
    publicUrl: 'https://opensource.contentauthenticity.org/samples/4.webp',
  },
  {
    id: 'c2pa-demo-005',
    name: 'C2PA Demo Image 5 - AVIF',
    format: 'avif',
    size: 819200,
    hasEmbeddedManifest: true,
    hasRemoteManifest: false,
    checksum: 'sha256:e5f6789012345678901234567890abcdef1234567890abcdef1234567890a',
    publicUrl: 'https://opensource.contentauthenticity.org/samples/5.avif',
  },
  {
    id: 'c2pa-remote-001',
    name: 'Remote Manifest Demo 1',
    format: 'jpeg',
    size: 2560000,
    hasEmbeddedManifest: false,
    hasRemoteManifest: true,
    manifestUrl: 'https://opensource.contentauthenticity.org/manifests/1.json',
    checksum: 'sha256:f6789012345678901234567890abcdef1234567890abcdef1234567890ab',
    publicUrl: 'https://opensource.contentauthenticity.org/samples/remote-1.jpg',
  },
  {
    id: 'c2pa-remote-002',
    name: 'Remote Manifest Demo 2',
    format: 'jpeg',
    size: 2048000,
    hasEmbeddedManifest: false,
    hasRemoteManifest: true,
    manifestUrl: 'https://opensource.contentauthenticity.org/manifests/2.json',
    checksum: 'sha256:789012345678901234567890abcdef1234567890abcdef1234567890abc',
    publicUrl: 'https://opensource.contentauthenticity.org/samples/remote-2.jpg',
  },
  {
    id: 'c2pa-mixed-001',
    name: 'Mixed Manifest Demo 1',
    format: 'jpeg',
    size: 3072000,
    hasEmbeddedManifest: true,
    hasRemoteManifest: true,
    manifestUrl: 'https://opensource.contentauthenticity.org/manifests/mixed-1.json',
    checksum: 'sha256:89012345678901234567890abcdef1234567890abcdef1234567890abcd',
    publicUrl: 'https://opensource.contentauthenticity.org/samples/mixed-1.jpg',
  },
  {
    id: 'c2pa-large-001',
    name: 'Large C2PA Demo Image',
    format: 'jpeg',
    size: 8192000,
    hasEmbeddedManifest: true,
    hasRemoteManifest: false,
    checksum: 'sha256:9012345678901234567890abcdef1234567890abcdef1234567890abcdef',
    publicUrl: 'https://opensource.contentauthenticity.org/samples/large-1.jpg',
  },
  {
    id: 'c2pa-small-001',
    name: 'Small C2PA Demo Image',
    format: 'jpeg',
    size: 512000,
    hasEmbeddedManifest: true,
    hasRemoteManifest: false,
    checksum: 'sha256:012345678901234567890abcdef1234567890abcdef1234567890abcdef1',
    publicUrl: 'https://opensource.contentauthenticity.org/samples/small-1.jpg',
  },
  {
    id: 'c2pa-webp-002',
    name: 'C2PA WebP Demo 2',
    format: 'webp',
    size: 768000,
    hasEmbeddedManifest: true,
    hasRemoteManifest: false,
    checksum: 'sha256:12345678901234567890abcdef1234567890abcdef1234567890abcdef12',
    publicUrl: 'https://opensource.contentauthenticity.org/samples/webp-2.webp',
  },
  {
    id: 'c2pa-avif-002',
    name: 'C2PA AVIF Demo 2',
    format: 'avif',
    size: 614400,
    hasEmbeddedManifest: true,
    hasRemoteManifest: false,
    checksum: 'sha256:2345678901234567890abcdef1234567890abcdef1234567890abcdef123',
    publicUrl: 'https://opensource.contentauthenticity.org/samples/avif-2.avif',
  },
  {
    id: 'c2pa-png-002',
    name: 'C2PA PNG Demo 2',
    format: 'png',
    size: 4096000,
    hasEmbeddedManifest: true,
    hasRemoteManifest: false,
    checksum: 'sha256:345678901234567890abcdef1234567890abcdef1234567890abcdef1234',
    publicUrl: 'https://opensource.contentauthenticity.org/samples/png-2.png',
  },
  {
    id: 'c2pa-remote-003',
    name: 'Remote Manifest Demo 3',
    format: 'webp',
    size: 1536000,
    hasEmbeddedManifest: false,
    hasRemoteManifest: true,
    manifestUrl: 'https://opensource.contentauthenticity.org/manifests/3.json',
    checksum: 'sha256:45678901234567890abcdef1234567890abcdef1234567890abcdef12345',
    publicUrl: 'https://opensource.contentauthenticity.org/samples/remote-3.webp',
  },
  {
    id: 'c2pa-remote-004',
    name: 'Remote Manifest Demo 4',
    format: 'avif',
    size: 1228800,
    hasEmbeddedManifest: false,
    hasRemoteManifest: true,
    manifestUrl: 'https://opensource.contentauthenticity.org/manifests/4.json',
    checksum: 'sha256:5678901234567890abcdef1234567890abcdef1234567890abcdef123456',
    publicUrl: 'https://opensource.contentauthenticity.org/samples/remote-4.avif',
  },
  {
    id: 'c2pa-mixed-002',
    name: 'Mixed Manifest Demo 2',
    format: 'webp',
    size: 2048000,
    hasEmbeddedManifest: true,
    hasRemoteManifest: true,
    manifestUrl: 'https://opensource.contentauthenticity.org/manifests/mixed-2.json',
    checksum: 'sha256:678901234567890abcdef1234567890abcdef1234567890abcdef1234567',
    publicUrl: 'https://opensource.contentauthenticity.org/samples/mixed-2.webp',
  },
  {
    id: 'c2pa-hdr-001',
    name: 'HDR C2PA Demo Image',
    format: 'avif',
    size: 10240000,
    hasEmbeddedManifest: true,
    hasRemoteManifest: false,
    checksum: 'sha256:78901234567890abcdef1234567890abcdef1234567890abcdef12345678',
    publicUrl: 'https://opensource.contentauthenticity.org/samples/hdr-1.avif',
  },
  {
    id: 'c2pa-thumbnail-001',
    name: 'C2PA Thumbnail Demo',
    format: 'jpeg',
    size: 256000,
    hasEmbeddedManifest: true,
    hasRemoteManifest: false,
    checksum: 'sha256:8901234567890abcdef1234567890abcdef1234567890abcdef123456789',
    publicUrl: 'https://opensource.contentauthenticity.org/samples/thumb-1.jpg',
  },
  {
    id: 'c2pa-remote-005',
    name: 'Remote Manifest Demo 5',
    format: 'png',
    size: 5120000,
    hasEmbeddedManifest: false,
    hasRemoteManifest: true,
    manifestUrl: 'https://opensource.contentauthenticity.org/manifests/5.json',
    checksum: 'sha256:901234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    publicUrl: 'https://opensource.contentauthenticity.org/samples/remote-5.png',
  },
  {
    id: 'c2pa-pro-001',
    name: 'Professional C2PA Demo',
    format: 'jpeg',
    size: 6144000,
    hasEmbeddedManifest: true,
    hasRemoteManifest: false,
    checksum: 'sha256:01234567890abcdef1234567890abcdef1234567890abcdef12345678901',
    publicUrl: 'https://opensource.contentauthenticity.org/samples/pro-1.jpg',
  },
  {
    id: 'c2pa-pro-002',
    name: 'Professional C2PA Demo 2',
    format: 'webp',
    size: 4096000,
    hasEmbeddedManifest: true,
    hasRemoteManifest: false,
    checksum: 'sha256:1234567890abcdef1234567890abcdef1234567890abcdef123456789012',
    publicUrl: 'https://opensource.contentauthenticity.org/samples/pro-2.webp',
  },
  {
    id: 'c2pa-pro-003',
    name: 'Professional C2PA Demo 3',
    format: 'avif',
    size: 3072000,
    hasEmbeddedManifest: true,
    hasRemoteManifest: false,
    checksum: 'sha256:234567890abcdef1234567890abcdef1234567890abcdef1234567890123',
    publicUrl: 'https://opensource.contentauthenticity.org/samples/pro-3.avif',
  },
  {
    id: 'c2pa-remote-006',
    name: 'Remote Manifest Demo 6',
    format: 'jpeg',
    size: 3584000,
    hasEmbeddedManifest: false,
    hasRemoteManifest: true,
    manifestUrl: 'https://opensource.contentauthenticity.org/manifests/6.json',
    checksum: 'sha256:34567890abcdef1234567890abcdef1234567890abcdef12345678901234',
    publicUrl: 'https://opensource.contentauthenticity.org/samples/remote-6.jpg',
  },
  {
    id: 'c2pa-mixed-003',
    name: 'Mixed Manifest Demo 3',
    format: 'avif',
    size: 2560000,
    hasEmbeddedManifest: true,
    hasRemoteManifest: true,
    manifestUrl: 'https://opensource.contentauthenticity.org/manifests/mixed-3.json',
    checksum: 'sha256:4567890abcdef1234567890abcdef1234567890abcdef123456789012345',
    publicUrl: 'https://opensource.contentauthenticity.org/samples/mixed-3.avif',
  },
  {
    id: 'c2pa-control-001',
    name: 'Control Image - No C2PA',
    format: 'jpeg',
    size: 1024000,
    hasEmbeddedManifest: false,
    hasRemoteManifest: false,
    checksum: 'sha256:567890abcdef1234567890abcdef1234567890abcdef1234567890123456',
    publicUrl: 'https://opensource.contentauthenticity.org/samples/control-1.jpg',
  },
  {
    id: 'c2pa-control-002',
    name: 'Control Image 2 - No C2PA',
    format: 'png',
    size: 2048000,
    hasEmbeddedManifest: false,
    hasRemoteManifest: false,
    checksum: 'sha256:67890abcdef1234567890abcdef1234567890abcdef12345678901234567',
    publicUrl: 'https://opensource.contentauthenticity.org/samples/control-2.png',
  },
];

// Asset groups for different test scenarios
export const ASSET_GROUPS = {
  all: TEST_ASSETS,
  embedded: TEST_ASSETS.filter(asset => asset.hasEmbeddedManifest),
  remote: TEST_ASSETS.filter(asset => asset.hasRemoteManifest),
  mixed: TEST_ASSETS.filter(asset => asset.hasEmbeddedManifest && asset.hasRemoteManifest),
  control: TEST_ASSETS.filter(asset => !asset.hasEmbeddedManifest && !asset.hasRemoteManifest),
  jpeg: TEST_ASSETS.filter(asset => asset.format === 'jpeg'),
  png: TEST_ASSETS.filter(asset => asset.format === 'png'),
  webp: TEST_ASSETS.filter(asset => asset.format === 'webp'),
  avif: TEST_ASSETS.filter(asset => asset.format === 'avif'),
  small: TEST_ASSETS.filter(asset => asset.size < 1000000), // < 1MB
  medium: TEST_ASSETS.filter(asset => asset.size >= 1000000 && asset.size < 5000000), // 1-5MB
  large: TEST_ASSETS.filter(asset => asset.size >= 5000000), // > 5MB
};

// Sentinel assets for critical testing
export const SENTINEL_ASSETS = [
  'c2pa-demo-001', // Standard JPEG with embedded C2PA
  'c2pa-remote-001', // JPEG with remote manifest
  'c2pa-mixed-001', // JPEG with both embedded and remote
  'c2pa-webp-002', // WebP with embedded C2PA
  'c2pa-avif-002', // AVIF with embedded C2PA
  'c2pa-control-001', // Control image without C2PA
];

export function getAssetById(id: string): TestAsset | undefined {
  return TEST_ASSETS.find(asset => asset.id === id);
}

export function getAssetsByFormat(format: string): TestAsset[] {
  return TEST_ASSETS.filter(asset => asset.format === format);
}

export function getRandomAssets(count: number, group?: keyof typeof ASSET_GROUPS): TestAsset[] {
  const pool = group ? ASSET_GROUPS[group] : TEST_ASSETS;
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, pool.length));
}

export function getSentinelAssets(): TestAsset[] {
  return SENTINEL_ASSETS.map(id => getAssetById(id)).filter(asset => asset !== undefined) as TestAsset[];
}
