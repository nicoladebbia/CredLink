/**
 * Transform Configuration - Phase 33 Reverse Lab
 * Optimizer behavior transformation matrix
 */

import type { Transform, TestAsset } from '@/types/index.js';
import { TEST_ASSETS, SENTINEL_ASSETS, getAssetById } from './assets.js';

export const TRANSFORMS: Record<string, Transform> = {
  'resize_1200': {
    id: 'resize_1200',
    name: 'Resize to 1200px width',
    description: 'Resize image to 1200px width maintaining aspect ratio',
    params: {
      width: 1200,
      fit: 'scale',
    },
    expectedBehavior: {
      preservesC2PA: true,
      preservesEXIF: true,
      preservesXMP: true,
      remoteManifestSupported: true,
    },
  },
  'webp_q80': {
    id: 'webp_q80',
    name: 'Convert to WebP at 80% quality',
    description: 'Convert image to WebP format with 80% quality',
    params: {
      format: 'webp',
      quality: 80,
    },
    expectedBehavior: {
      preservesC2PA: false,
      preservesEXIF: false,
      preservesXMP: false,
      remoteManifestSupported: true,
    },
  },
  'avif_q50': {
    id: 'avif_q50',
    name: 'Convert to AVIF at 50% quality',
    description: 'Convert image to AVIF format with 50% quality',
    params: {
      format: 'avif',
      quality: 50,
    },
    expectedBehavior: {
      preservesC2PA: false,
      preservesEXIF: false,
      preservesXMP: false,
      remoteManifestSupported: true,
    },
  },
  'crop_1x1': {
    id: 'crop_1x1',
    name: 'Crop to 1:1 aspect ratio',
    description: 'Crop image to square (1:1) aspect ratio',
    params: {
      crop: '1:1',
    },
    expectedBehavior: {
      preservesC2PA: true,
      preservesEXIF: true,
      preservesXMP: true,
      remoteManifestSupported: true,
    },
  },
  'strip_default': {
    id: 'strip_default',
    name: 'Strip metadata (default)',
    description: 'Remove all metadata from image',
    params: {
      strip: true,
    },
    expectedBehavior: {
      preservesC2PA: false,
      preservesEXIF: false,
      preservesXMP: false,
      remoteManifestSupported: false,
    },
  },
  'metadata_keep': {
    id: 'metadata_keep',
    name: 'Keep metadata',
    description: 'Preserve all metadata during transformation',
    params: {
      metadata: 'keep',
    },
    expectedBehavior: {
      preservesC2PA: true,
      preservesEXIF: true,
      preservesXMP: true,
      remoteManifestSupported: true,
    },
  },
  'metadata_copyright': {
    id: 'metadata_copyright',
    name: 'Keep copyright metadata only',
    description: 'Preserve only copyright-related metadata',
    params: {
      metadata: 'copyright',
    },
    expectedBehavior: {
      preservesC2PA: true,
      preservesEXIF: false,
      preservesXMP: true,
      remoteManifestSupported: true,
    },
  },
  'preserve_content_credentials_on': {
    id: 'preserve_content_credentials_on',
    name: 'Preserve Content Credentials (enabled)',
    description: 'Enable C2PA Content Credentials preservation',
    params: {
      preserve_content_credentials: true,
    },
    expectedBehavior: {
      preservesC2PA: true,
      preservesEXIF: true,
      preservesXMP: true,
      remoteManifestSupported: true,
    },
  },
  'preserve_content_credentials_off': {
    id: 'preserve_content_credentials_off',
    name: 'Preserve Content Credentials (disabled)',
    description: 'Disable C2PA Content Credentials preservation',
    params: {
      preserve_content_credentials: false,
    },
    expectedBehavior: {
      preservesC2PA: false,
      preservesEXIF: false,
      preservesXMP: false,
      remoteManifestSupported: true,
    },
  },
  'dpr_2': {
    id: 'dpr_2',
    name: 'Device Pixel Ratio 2x',
    description: 'Optimize for 2x device pixel ratio',
    params: {
      dpr: 2,
    },
    expectedBehavior: {
      preservesC2PA: true,
      preservesEXIF: true,
      preservesXMP: true,
      remoteManifestSupported: true,
    },
  },
  'sharpen_medium': {
    id: 'sharpen_medium',
    name: 'Medium sharpening',
    description: 'Apply medium sharpening filter',
    params: {
      sharpen: 'medium',
    },
    expectedBehavior: {
      preservesC2PA: true,
      preservesEXIF: true,
      preservesXMP: true,
      remoteManifestSupported: true,
    },
  },
  'auto_format': {
    id: 'auto_format',
    name: 'Auto format selection',
    description: 'Automatically select optimal format based on browser support',
    params: {
      format: 'auto',
    },
    expectedBehavior: {
      preservesC2PA: true,
      preservesEXIF: true,
      preservesXMP: true,
      remoteManifestSupported: true,
    },
  },
};

// Helper functions for transform management
export function getTransform(id: string): Transform | undefined {
  return TRANSFORMS[id];
}

export function getAllTransforms(): Transform[] {
  return Object.values(TRANSFORMS);
}

export function getTransformsByIds(ids: string[]): Transform[] {
  return ids.map(id => getTransform(id)).filter(Boolean) as Transform[];
}

export function getSentinelAssets(): TestAsset[] {
  return SENTINEL_ASSETS.map(id => getAssetById(id)).filter(asset => asset !== undefined) as TestAsset[];
}

// Sentinel transforms for change detection (critical for monitoring)
export const SENTINEL_TRANSFORMS = [
  'resize_1200',
  'webp_q80',
  'strip_default',
  'metadata_keep',
  'preserve_content_credentials_on',
];

// Provider-specific transform mappings
export const PROVIDER_TRANSFORMS = {
  'cloudflare-images': [
    'resize_1200',
    'webp_q80',
    'avif_q50',
    'crop_1x1',
    'metadata_keep',
    'metadata_copyright',
    'preserve_content_credentials_on',
    'preserve_content_credentials_off',
  ],
  'fastly-io': [
    'resize_1200',
    'webp_q80',
    'avif_q50',
    'crop_1x1',
    'strip_default',
    'metadata_keep',
    'dpr_2',
    'sharpen_medium',
  ],
  'akamai-ivm': [
    'resize_1200',
    'webp_q80',
    'avif_q50',
    'crop_1x1',
    'metadata_keep',
    'metadata_copyright',
    'auto_format',
  ],
  'cloudinary': [
    'resize_1200',
    'webp_q80',
    'avif_q50',
    'crop_1x1',
    'strip_default',
    'metadata_keep',
    'dpr_2',
    'sharpen_medium',
  ],
  'imgix': [
    'resize_1200',
    'webp_q80',
    'avif_q50',
    'crop_1x1',
    'strip_default',
    'metadata_keep',
    'auto_format',
  ],
};
