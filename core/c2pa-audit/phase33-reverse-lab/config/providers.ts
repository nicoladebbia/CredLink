/**
 * Provider Configuration - Phase 33 Reverse Lab
 * Optimizer Behavior Fingerprinting and Tracking
 */

import type { Provider, Transform } from '@/types/index.js';

export const PROVIDERS: Record<string, Provider> = {
  'cloudflare-images': {
    id: 'cloudflare-images',
    name: 'Cloudflare Images',
    baseUrl: 'https://images.cloudflare.com',
    docs: {
      reference: 'https://developers.cloudflare.com/images/image-resizing/format-and-quality/',
      blog: 'https://blog.cloudflare.com/announcing-support-for-c2pa-content-credentials/',
      changelog: 'https://developers.cloudflare.com/images/changelog/',
    },
    headers: {
      'User-Agent': 'C2PA-Reverse-Lab/1.1.0 (+https://github.com/Nickiller04/c2-concierge)',
      'Accept': 'image/*,*/*;q=0.8',
    },
    rateLimit: {
      rps: 5,
      concurrency: 1,
      backoffMs: 5000,
    },
    transforms: [
      'resize_1200',
      'webp_q80',
      'avif_q50',
      'crop_1x1',
      'strip_default',
      'metadata_keep',
      'metadata_copyright',
      'preserve_content_credentials_on',
      'preserve_content_credentials_off',
    ],
  },
  'fastly-io': {
    id: 'fastly-io',
    name: 'Fastly Image Optimizer',
    baseUrl: 'https://io.fastly.com',
    docs: {
      reference: 'https://www.fastly.com/documentation/reference/io/',
      changelog: 'https://www.fastly.com/documentation/changelog/',
    },
    headers: {
      'User-Agent': 'C2PA-Reverse-Lab/1.1.0 (+https://github.com/Nickiller04/c2-concierge)',
      'Accept': 'image/*,*/*;q=0.8',
    },
    rateLimit: {
      rps: 10,
      concurrency: 2,
      backoffMs: 3000,
    },
    transforms: [
      'resize_1200',
      'webp_q80',
      'avif_q50',
      'crop_1x1',
      'strip_default',
      'metadata_all',
      'metadata_none',
      'metadata_icc',
    ],
  },
  'akamai-ivm': {
    id: 'akamai-ivm',
    name: 'Akamai Image and Video Manager',
    baseUrl: 'https://akamai.com',
    docs: {
      reference: 'https://techdocs.akamai.com/ivm/docs',
      changelog: 'https://techdocs.akamai.com/ivm/docs/release-notes',
    },
    headers: {
      'User-Agent': 'C2PA-Reverse-Lab/1.1.0 (+https://github.com/Nickiller04/c2-concierge)',
      'Accept': 'image/*,*/*;q=0.8',
    },
    rateLimit: {
      rps: 8,
      concurrency: 2,
      backoffMs: 4000,
    },
    transforms: [
      'resize_1200',
      'webp_q80',
      'avif_q50',
      'crop_1x1',
      'strip_default',
      'xmp_preserve_on',
      'xmp_preserve_off',
    ],
  },
  'cloudinary': {
    id: 'cloudinary',
    name: 'Cloudinary',
    baseUrl: 'https://res.cloudinary.com',
    docs: {
      reference: 'https://cloudinary.com/documentation/image_transformation_reference',
      blog: 'https://cloudinary.com/blog/content-authenticity-initiative-c2pa-support',
      changelog: 'https://cloudinary.com/documentation/changelog',
    },
    headers: {
      'User-Agent': 'C2PA-Reverse-Lab/1.1.0 (+https://github.com/Nickiller04/c2-concierge)',
      'Accept': 'image/*,*/*;q=0.8',
    },
    rateLimit: {
      rps: 15,
      concurrency: 3,
      backoffMs: 2000,
    },
    transforms: [
      'resize_1200',
      'webp_q80',
      'avif_q50',
      'crop_1x1',
      'strip_default',
      'metadata_keep',
      'metadata_strip',
      'c2pa_preserve',
    ],
  },
  'imgix': {
    id: 'imgix',
    name: 'Imgix',
    baseUrl: 'https://images.imgix.net',
    docs: {
      reference: 'https://docs.imgix.com/apis/url/format/format',
      changelog: 'https://docs.imgix.com/changelog',
    },
    headers: {
      'User-Agent': 'C2PA-Reverse-Lab/1.1.0 (+https://github.com/Nickiller04/c2-concierge)',
      'Accept': 'image/*,*/*;q=0.8',
    },
    rateLimit: {
      rps: 12,
      concurrency: 2,
      backoffMs: 3000,
    },
    transforms: [
      'resize_1200',
      'webp_q80',
      'avif_q50',
      'crop_1x1',
      'strip_default',
      'metadata_keep',
      'metadata_strip',
    ],
  },
};

export const TRANSFORMS: Record<string, Transform> = {
  // Generic transforms
  'resize_1200': {
    id: 'resize_1200',
    name: 'Resize to 1200px width',
    description: 'Resize image to 1200 pixels width maintaining aspect ratio',
    params: { w: 1200 },
    expectedBehavior: {
      preservesC2PA: true, // Most providers preserve on resize
      preservesEXIF: true,
      preservesXMP: true,
      remoteManifestSupported: true,
    },
  },
  'webp_q80': {
    id: 'webp_q80',
    name: 'Convert to WebP at 80% quality',
    description: 'Convert image to WebP format with 80% quality',
    params: { format: 'webp', quality: 80 },
    expectedBehavior: {
      preservesC2PA: false, // Format conversion often strips C2PA
      preservesEXIF: false,
      preservesXMP: false,
      remoteManifestSupported: true,
    },
  },
  'avif_q50': {
    id: 'avif_q50',
    name: 'Convert to AVIF at 50% quality',
    description: 'Convert image to AVIF format with 50% quality',
    params: { format: 'avif', quality: 50 },
    expectedBehavior: {
      preservesC2PA: false, // Format conversion often strips C2PA
      preservesEXIF: false,
      preservesXMP: false,
      remoteManifestSupported: true,
    },
  },
  'crop_1x1': {
    id: 'crop_1x1',
    name: 'Crop to 1:1 aspect ratio',
    description: 'Crop image to square aspect ratio',
    params: { ar: '1:1', crop: 'entropy' },
    expectedBehavior: {
      preservesC2PA: true, // Cropping typically preserves
      preservesEXIF: true,
      preservesXMP: true,
      remoteManifestSupported: true,
    },
  },
  'strip_default': {
    id: 'strip_default',
    name: 'Default metadata stripping',
    description: 'Apply default metadata stripping behavior',
    params: {},
    expectedBehavior: {
      preservesC2PA: false, // Default behavior varies by provider
      preservesEXIF: false,
      preservesXMP: false,
      remoteManifestSupported: true,
    },
  },
  'metadata_keep': {
    id: 'metadata_keep',
    name: 'Keep all metadata',
    description: 'Explicitly preserve all metadata',
    params: { metadata: 'keep' },
    expectedBehavior: {
      preservesC2PA: true, // Explicit preserve should work
      preservesEXIF: true,
      preservesXMP: true,
      remoteManifestSupported: true,
    },
  },
  'metadata_strip': {
    id: 'metadata_strip',
    name: 'Strip all metadata',
    description: 'Explicitly strip all metadata',
    params: { metadata: 'strip' },
    expectedBehavior: {
      preservesC2PA: false, // Explicit strip should remove C2PA
      preservesEXIF: false,
      preservesXMP: false,
      remoteManifestSupported: false,
    },
  },

  // Provider-specific transforms
  'metadata_copyright': {
    id: 'metadata_copyright',
    name: 'Keep copyright metadata only',
    description: 'Preserve copyright metadata while stripping others',
    params: { metadata: 'copyright' },
    expectedBehavior: {
      preservesC2PA: true, // Copyright setting often preserves C2PA
      preservesEXIF: false,
      preservesXMP: false,
      remoteManifestSupported: true,
    },
  },
  'preserve_content_credentials_on': {
    id: 'preserve_content_credentials_on',
    name: 'Cloudflare: Preserve Content Credentials ON',
    description: 'Enable Cloudflare Content Credentials preservation',
    params: { 'preserve-content-credentials': 'true' },
    expectedBehavior: {
      preservesC2PA: true, // Explicit C2PA preservation
      preservesEXIF: true,
      preservesXMP: true,
      remoteManifestSupported: true,
    },
  },
  'preserve_content_credentials_off': {
    id: 'preserve_content_credentials_off',
    name: 'Cloudflare: Preserve Content Credentials OFF',
    description: 'Disable Cloudflare Content Credentials preservation',
    params: { 'preserve-content-credentials': 'false' },
    expectedBehavior: {
      preservesC2PA: false, // Explicit C2PA removal
      preservesEXIF: false,
      preservesXMP: false,
      remoteManifestSupported: true,
    },
  },
  'metadata_all': {
    id: 'metadata_all',
    name: 'Fastly: Keep all metadata',
    description: 'Fastly IO metadata=all parameter',
    params: { metadata: 'all' },
    expectedBehavior: {
      preservesC2PA: true, // Should preserve C2PA
      preservesEXIF: true,
      preservesXMP: true,
      remoteManifestSupported: true,
    },
  },
  'metadata_none': {
    id: 'metadata_none',
    name: 'Fastly: Strip all metadata',
    description: 'Fastly IO metadata=none parameter',
    params: { metadata: 'none' },
    expectedBehavior: {
      preservesC2PA: false, // Should strip C2PA
      preservesEXIF: false,
      preservesXMP: false,
      remoteManifestSupported: false,
    },
  },
  'metadata_icc': {
    id: 'metadata_icc',
    name: 'Fastly: Keep ICC profile only',
    description: 'Fastly IO metadata=icc parameter',
    params: { metadata: 'icc' },
    expectedBehavior: {
      preservesC2PA: false, // ICC only strips C2PA
      preservesEXIF: false,
      preservesXMP: false,
      remoteManifestSupported: false,
    },
  },
  'xmp_preserve_on': {
    id: 'xmp_preserve_on',
    name: 'Akamai: Preserve XMP metadata',
    description: 'Akamai IVM XMP preservation enabled',
    params: { 'xmp-policy': 'preserve' },
    expectedBehavior: {
      preservesC2PA: true, // XMP preservation should include C2PA
      preservesEXIF: false,
      preservesXMP: true,
      remoteManifestSupported: true,
    },
  },
  'xmp_preserve_off': {
    id: 'xmp_preserve_off',
    name: 'Akamai: Strip XMP metadata',
    description: 'Akamai IVM XMP preservation disabled',
    params: { 'xmp-policy': 'strip' },
    expectedBehavior: {
      preservesC2PA: false, // XMP stripping removes C2PA
      preservesEXIF: false,
      preservesXMP: false,
      remoteManifestSupported: false,
    },
  },
  'c2pa_preserve': {
    id: 'c2pa_preserve',
    name: 'Cloudinary: Preserve C2PA',
    description: 'Cloudinary C2PA preservation setting',
    params: { c2pa: 'preserve' },
    expectedBehavior: {
      preservesC2PA: true, // Explicit C2PA preservation
      preservesEXIF: true,
      preservesXMP: true,
      remoteManifestSupported: true,
    },
  },
};
