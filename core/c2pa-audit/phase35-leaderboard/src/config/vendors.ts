/**
 * Phase 35 Leaderboard - Vendor Configuration
 * Complete vendor definitions for C2PA Content Credentials testing
 */

import { Vendor } from '@/types';

export const VENDORS: Vendor[] = [
  // CDN/Optimizers
  {
    id: 'cloudflare-images',
    name: 'Cloudflare Images',
    type: 'cdn',
    category: 'Image CDN',
    website: 'https://www.cloudflare.com/products/images/',
    docsUrl: 'https://developers.cloudflare.com/images/image-resizing/',
    logoUrl: '/assets/logos/cloudflare.svg',
    testing: {
      endpoints: [
        {
          id: 'cloudflare-cdn',
          name: 'Cloudflare CDN',
          baseUrl: 'https://imagedelivery.net/{account_hash}/{image_id}',
          defaultParams: {
            w: '800',
            h: '600',
            fit: 'cover',
            format: 'auto',
            quality: '85'
          },
          method: 'GET' as const
        }
      ],
      transforms: [
        {
          id: 'resize',
          name: 'Resize',
          params: { w: '800', h: '600', fit: 'cover' },
          description: 'Standard image resize',
          expectedBehavior: 'preserve'
        },
        {
          id: 'crop',
          name: 'Crop',
          params: { w: '400', h: '400', fit: 'crop' },
          description: 'Center crop',
          expectedBehavior: 'preserve'
        },
        {
          id: 'format-webp',
          name: 'Format WebP',
          params: { format: 'webp' },
          description: 'Convert to WebP',
          expectedBehavior: 'preserve'
        },
        {
          id: 'format-avif',
          name: 'Format AVIF',
          params: { format: 'avif' },
          description: 'Convert to AVIF',
          expectedBehavior: 'preserve'
        },
        {
          id: 'quality-85',
          name: 'Quality 85',
          params: { quality: '85' },
          description: 'High quality compression',
          expectedBehavior: 'preserve'
        },
        {
          id: 'quality-65',
          name: 'Quality 65',
          params: { quality: '65' },
          description: 'Medium quality compression',
          expectedBehavior: 'preserve'
        },
        {
          id: 'dpr-2',
          name: 'DPR 2x',
          params: { dpr: '2' },
          description: 'High DPI display',
          expectedBehavior: 'preserve'
        },
        {
          id: 'sharpen',
          name: 'Sharpen',
          params: { sharpen: '10' },
          description: 'Sharpen filter',
          expectedBehavior: 'preserve'
        },
        {
          id: 'metadata-strip',
          name: 'Strip Metadata',
          params: { metadata: 'none' },
          description: 'Remove all metadata',
          expectedBehavior: 'strip'
        },
        {
          id: 'metadata-keep',
          name: 'Keep Metadata',
          params: { metadata: 'all' },
          description: 'Preserve all metadata',
          expectedBehavior: 'preserve'
        },
        {
          id: 'preserve-credentials',
          name: 'Preserve Content Credentials',
          params: { metadata: 'all', 'preserve-credentials': 'true' },
          description: 'Enable Content Credentials preservation',
          expectedBehavior: 'preserve'
        },
        {
          id: 'combined-transform',
          name: 'Combined Transform',
          params: { 
            w: '1200', 
            h: '800', 
            fit: 'cover', 
            format: 'webp', 
            quality: '85',
            sharpen: '5',
            metadata: 'all'
          },
          description: 'Complex transformation pipeline',
          expectedBehavior: 'preserve'
        }
      ],
      preserveToggle: {
        name: 'Preserve Content Credentials',
        description: 'Enable preservation of C2PA Content Credentials during transformations',
        param: 'preserve-credentials',
        value: 'true',
        docsUrl: 'https://developers.cloudflare.com/images/image-resizing/format-and-compression/#preserve-content-credentials'
      },
      rateLimit: {
        requestsPerSecond: 10,
        burstLimit: 20,
        backoffMs: 1000
      }
    },
    scoring: {
      defaultScore: 0,
      bestPracticeScore: 0,
      dimensions: [],
      lastUpdated: new Date(),
      grade: 'red',
      improvementPath: [
        'Enable Preserve Content Credentials toggle',
        'Verify metadata preservation settings',
        'Test with various transformation combinations'
      ]
    }
  },

  {
    id: 'fastly-image-optimizer',
    name: 'Fastly Image Optimizer',
    type: 'cdn',
    category: 'Image CDN',
    website: 'https://www.fastly.com/products/image-optimizer',
    docsUrl: 'https://developer.fastly.com/reference/io/',
    logoUrl: '/assets/logos/fastly.svg',
    testing: {
      endpoints: [
        {
          id: 'fastly-io',
          name: 'Fastly IO',
          baseUrl: 'https://www.fastly.io/{image_id}',
          defaultParams: {
            w: '800',
            h: '600',
            fit: 'cover',
            format: 'auto',
            quality: '85'
          },
          method: 'GET' as const
        }
      ],
      transforms: [
        {
          id: 'resize',
          name: 'Resize',
          params: { w: '800', h: '600', fit: 'cover' },
          description: 'Standard image resize',
          expectedBehavior: 'strip'
        },
        {
          id: 'crop',
          name: 'Crop',
          params: { w: '400', h: '400', fit: 'crop' },
          description: 'Center crop',
          expectedBehavior: 'strip'
        },
        {
          id: 'format-webp',
          name: 'Format WebP',
          params: { format: 'webp' },
          description: 'Convert to WebP',
          expectedBehavior: 'strip'
        },
        {
          id: 'format-avif',
          name: 'Format AVIF',
          params: { format: 'avif' },
          description: 'Convert to AVIF',
          expectedBehavior: 'strip'
        },
        {
          id: 'quality-85',
          name: 'Quality 85',
          params: { quality: '85' },
          description: 'High quality compression',
          expectedBehavior: 'strip'
        },
        {
          id: 'quality-65',
          name: 'Quality 65',
          params: { quality: '65' },
          description: 'Medium quality compression',
          expectedBehavior: 'strip'
        },
        {
          id: 'dpr-2',
          name: 'DPR 2x',
          params: { dpr: '2' },
          description: 'High DPI display',
          expectedBehavior: 'strip'
        },
        {
          id: 'sharpen',
          name: 'Sharpen',
          params: { sharpen: '10' },
          description: 'Sharpen filter',
          expectedBehavior: 'strip'
        },
        {
          id: 'metadata-all',
          name: 'Preserve All Metadata',
          params: { metadata: 'all' },
          description: 'Preserve all metadata including C2PA',
          expectedBehavior: 'preserve'
        },
        {
          id: 'metadata-none',
          name: 'Strip Metadata',
          params: { metadata: 'none' },
          description: 'Remove all metadata',
          expectedBehavior: 'strip'
        },
        {
          id: 'metadata-exif',
          name: 'Preserve EXIF Only',
          params: { metadata: 'exif' },
          description: 'Preserve EXIF metadata only',
          expectedBehavior: 'strip'
        },
        {
          id: 'combined-transform',
          name: 'Combined Transform',
          params: { 
            w: '1200', 
            h: '800', 
            fit: 'cover', 
            format: 'webp', 
            quality: '85',
            sharpen: '5',
            metadata: 'all'
          },
          description: 'Complex transformation pipeline with metadata preservation',
          expectedBehavior: 'preserve'
        }
      ],
      preserveToggle: {
        name: 'Metadata Preservation',
        description: 'Control metadata preservation during transformations',
        param: 'metadata',
        value: 'all',
        docsUrl: 'https://developer.fastly.com/reference/io/#metadata'
      },
      rateLimit: {
        requestsPerSecond: 10,
        burstLimit: 20,
        backoffMs: 1000
      }
    },
    scoring: {
      defaultScore: 0,
      bestPracticeScore: 0,
      dimensions: [],
      lastUpdated: new Date(),
      grade: 'red',
      improvementPath: [
        'Add metadata=all to IO parameters',
        'Test metadata preservation behavior',
        'Verify C2PA Content Credentials survive transforms'
      ]
    }
  },

  {
    id: 'akamai-ivm',
    name: 'Akamai Image and Video Manager',
    type: 'cdn',
    category: 'Image CDN',
    website: 'https://www.akamai.com/products/image-and-video-manager',
    docsUrl: 'https://techdocs.akamai.com/ivm/docs',
    logoUrl: '/assets/logos/akamai.svg',
    testing: {
      endpoints: [
        {
          id: 'akamai-ivm',
          name: 'Akamai IVM',
          baseUrl: 'https://akamai.com/{image_id}',
          defaultParams: {
            w: '800',
            h: '600',
            fit: 'cover',
            format: 'auto',
            quality: '85'
          },
          method: 'GET' as const
        }
      ],
      transforms: [
        {
          id: 'resize',
          name: 'Resize',
          params: { w: '800', h: '600', fit: 'cover' },
          description: 'Standard image resize',
          expectedBehavior: 'strip'
        },
        {
          id: 'crop',
          name: 'Crop',
          params: { w: '400', h: '400', fit: 'crop' },
          description: 'Center crop',
          expectedBehavior: 'strip'
        },
        {
          id: 'format-webp',
          name: 'Format WebP',
          params: { format: 'webp' },
          description: 'Convert to WebP',
          expectedBehavior: 'strip'
        },
        {
          id: 'format-avif',
          name: 'Format AVIF',
          params: { format: 'avif' },
          description: 'Convert to AVIF',
          expectedBehavior: 'strip'
        },
        {
          id: 'quality-85',
          name: 'Quality 85',
          params: { quality: '85' },
          description: 'High quality compression',
          expectedBehavior: 'strip'
        },
        {
          id: 'quality-65',
          name: 'Quality 65',
          params: { quality: '65' },
          description: 'Medium quality compression',
          expectedBehavior: 'strip'
        },
        {
          id: 'dpr-2',
          name: 'DPR 2x',
          params: { dpr: '2' },
          description: 'High DPI display',
          expectedBehavior: 'strip'
        },
        {
          id: 'sharpen',
          name: 'Sharpen',
          params: { sharpen: '10' },
          description: 'Sharpen filter',
          expectedBehavior: 'strip'
        },
        {
          id: 'preserve-xmp-true',
          name: 'Preserve XMP True',
          params: { 'preserve-xmp': 'true' },
          description: 'Enable XMP metadata preservation',
          expectedBehavior: 'preserve'
        },
        {
          id: 'preserve-xmp-false',
          name: 'Preserve XMP False',
          params: { 'preserve-xmp': 'false' },
          description: 'Disable XMP metadata preservation',
          expectedBehavior: 'strip'
        },
        {
          id: 'iptc-filter',
          name: 'IPTC Filter',
          params: { 'iptc-filter': 'preserve' },
          description: 'Control IPTC metadata handling',
          expectedBehavior: 'preserve'
        },
        {
          id: 'combined-transform',
          name: 'Combined Transform',
          params: { 
            w: '1200', 
            h: '800', 
            fit: 'cover', 
            format: 'webp', 
            quality: '85',
            sharpen: '5',
            'preserve-xmp': 'true',
            'iptc-filter': 'preserve'
          },
          description: 'Complex transformation pipeline with XMP preservation',
          expectedBehavior: 'preserve'
        }
      ],
      preserveToggle: {
        name: 'Preserve XMP',
        description: 'Enable XMP metadata preservation in transformation policy',
        param: 'preserve-xmp',
        value: 'true',
        docsUrl: 'https://techdocs.akamai.com/ivm/docs/policy-configuration#preserve-xmp'
      },
      rateLimit: {
        requestsPerSecond: 10,
        burstLimit: 20,
        backoffMs: 1000
      }
    },
    scoring: {
      defaultScore: 0,
      bestPracticeScore: 0,
      dimensions: [],
      lastUpdated: new Date(),
      grade: 'red',
      improvementPath: [
        'Configure IVM policy with Preserve XMP = true',
        'Review IPTC filter settings',
        'Test C2PA Content Credentials preservation'
      ]
    }
  },

  {
    id: 'cloudinary',
    name: 'Cloudinary',
    type: 'cdn',
    category: 'Image CDN',
    website: 'https://cloudinary.com/products/image-optimization',
    docsUrl: 'https://cloudinary.com/documentation/image_transformations',
    logoUrl: '/assets/logos/cloudinary.svg',
    testing: {
      endpoints: [
        {
          id: 'cloudinary-resize',
          name: 'Cloudinary Transform',
          baseUrl: 'https://res.cloudinary.com/{cloud_name}/image/upload',
          defaultParams: {
            w: '800',
            h: '600',
            fit: 'cover',
            format: 'auto',
            quality: '85'
          },
          method: 'GET' as const
        }
      ],
      transforms: [
        {
          id: 'resize',
          name: 'Resize',
          params: { w: '800', h: '600', fit: 'cover' },
          description: 'Standard image resize',
          expectedBehavior: 'strip'
        },
        {
          id: 'crop',
          name: 'Crop',
          params: { w: '400', h: '400', fit: 'crop' },
          description: 'Center crop',
          expectedBehavior: 'strip'
        },
        {
          id: 'format-webp',
          name: 'Format WebP',
          params: { format: 'webp' },
          description: 'Convert to WebP',
          expectedBehavior: 'strip'
        },
        {
          id: 'format-avif',
          name: 'Format AVIF',
          params: { format: 'avif' },
          description: 'Convert to AVIF',
          expectedBehavior: 'strip'
        },
        {
          id: 'quality-85',
          name: 'Quality 85',
          params: { quality: '85' },
          description: 'High quality compression',
          expectedBehavior: 'strip'
        },
        {
          id: 'quality-65',
          name: 'Quality 65',
          params: { quality: '65' },
          description: 'Medium quality compression',
          expectedBehavior: 'strip'
        },
        {
          id: 'dpr-2',
          name: 'DPR 2x',
          params: { dpr: '2' },
          description: 'High DPI display',
          expectedBehavior: 'strip'
        },
        {
          id: 'sharpen',
          name: 'Sharpen',
          params: { sharpen: '10' },
          description: 'Sharpen filter',
          expectedBehavior: 'strip'
        },
        {
          id: 'fl-metadata-preserve',
          name: 'Preserve Metadata',
          params: { fl: 'preserve_metadata' },
          description: 'Preserve image metadata',
          expectedBehavior: 'preserve'
        },
        {
          id: 'fl-metadata-strip',
          name: 'Strip Metadata',
          params: { fl: 'strip_metadata' },
          description: 'Strip image metadata',
          expectedBehavior: 'strip'
        },
        {
          id: 'c2pa-provenance',
          name: 'C2PA Provenance',
          params: { fl: 'c2pa_provenance' },
          description: 'Enable C2PA provenance features',
          expectedBehavior: 'preserve'
        },
        {
          id: 'combined-transform',
          name: 'Combined Transform',
          params: { 
            w: '1200', 
            h: '800', 
            fit: 'cover', 
            format: 'webp', 
            quality: '85',
            sharpen: '5',
            fl: 'preserve_metadata,c2pa_provenance'
          },
          description: 'Complex transformation pipeline with C2PA features',
          expectedBehavior: 'preserve'
        }
      ],
      preserveToggle: {
        name: 'C2PA Provenance',
        description: 'Enable C2PA provenance and metadata preservation',
        param: 'fl',
        value: 'c2pa_provenance,preserve_metadata',
        docsUrl: 'https://cloudinary.com/documentation/content_authenticity_initiative'
      },
      rateLimit: {
        requestsPerSecond: 10,
        burstLimit: 20,
        backoffMs: 1000
      }
    },
    scoring: {
      defaultScore: 0,
      bestPracticeScore: 0,
      dimensions: [],
      lastUpdated: new Date(),
      grade: 'red',
      improvementPath: [
        'Join C2PA program and enable provenance features',
        'Add fl=c2pa_provenance,preserve_metadata to transforms',
        'Verify Content Credentials preservation across formats'
      ]
    }
  },

  {
    id: 'imgix',
    name: 'Imgix',
    type: 'cdn',
    category: 'Image CDN',
    website: 'https://www.imgix.com/',
    docsUrl: 'https://docs.imgix.com/',
    logoUrl: '/assets/logos/imgix.svg',
    testing: {
      endpoints: [
        {
          id: 'imgix-cdn',
          name: 'Imgix CDN',
          baseUrl: 'https://images.unsplash.com/{image_id}',
          defaultParams: {
            w: '800',
            h: '600',
            fit: 'cover',
            format: 'auto',
            quality: '85'
          },
          method: 'GET' as const
        }
      ],
      transforms: [
        {
          id: 'resize',
          name: 'Resize',
          params: { w: '800', h: '600', fit: 'cover' },
          description: 'Standard image resize',
          expectedBehavior: 'strip'
        },
        {
          id: 'crop',
          name: 'Crop',
          params: { w: '400', h: '400', fit: 'crop' },
          description: 'Center crop',
          expectedBehavior: 'strip'
        },
        {
          id: 'format-webp',
          name: 'Format WebP',
          params: { format: 'webp' },
          description: 'Convert to WebP',
          expectedBehavior: 'strip'
        },
        {
          id: 'format-avif',
          name: 'Format AVIF',
          params: { format: 'avif' },
          description: 'Convert to AVIF',
          expectedBehavior: 'strip'
        },
        {
          id: 'quality-85',
          name: 'Quality 85',
          params: { quality: '85' },
          description: 'High quality compression',
          expectedBehavior: 'strip'
        },
        {
          id: 'quality-65',
          name: 'Quality 65',
          params: { quality: '65' },
          description: 'Medium quality compression',
          expectedBehavior: 'strip'
        },
        {
          id: 'dpr-2',
          name: 'DPR 2x',
          params: { dpr: '2' },
          description: 'High DPI display',
          expectedBehavior: 'strip'
        },
        {
          id: 'sharpen',
          name: 'Sharpen',
          params: { sharpen: '10' },
          description: 'Sharpen filter',
          expectedBehavior: 'strip'
        },
        {
          id: 'metadata-all',
          name: 'Preserve Metadata',
          params: { metadata: 'all' },
          description: 'Attempt to preserve metadata',
          expectedBehavior: 'strip'
        },
        {
          id: 'copyright-keep',
          name: 'Keep Copyright',
          params: { copyright: 'keep' },
          description: 'Preserve copyright information',
          expectedBehavior: 'strip'
        },
        {
          id: 'iptc-keep',
          name: 'Keep IPTC',
          params: { iptc: 'keep' },
          description: 'Preserve IPTC metadata',
          expectedBehavior: 'strip'
        },
        {
          id: 'combined-transform',
          name: 'Combined Transform',
          params: { 
            w: '1200', 
            h: '800', 
            fit: 'cover', 
            format: 'webp', 
            quality: '85',
            sharpen: '5',
            metadata: 'all',
            copyright: 'keep',
            iptc: 'keep'
          },
          description: 'Complex transformation with metadata preservation attempts',
          expectedBehavior: 'strip'
        }
      ],
      preserveToggle: {
        name: 'Metadata Preservation',
        description: 'Limited metadata preservation - contact support for C2PA',
        param: 'metadata',
        value: 'all',
        docsUrl: 'https://docs.imgix.com/apis/url/format/metadata'
      },
      rateLimit: {
        requestsPerSecond: 10,
        burstLimit: 20,
        backoffMs: 1000
      }
    },
    scoring: {
      defaultScore: 0,
      bestPracticeScore: 0,
      dimensions: [],
      lastUpdated: new Date(),
      grade: 'red',
      improvementPath: [
        'Contact Imgix support for C2PA preservation options',
        'Implement remote-manifest approach',
        'Add C2PA badge to preserved images',
        'Consider alternative CDN with better C2PA support'
      ]
    }
  },

  // CMS Platforms
  {
    id: 'wordpress-core',
    name: 'WordPress Core',
    type: 'cms',
    category: 'Content Management System',
    website: 'https://wordpress.org/',
    docsUrl: 'https://developer.wordpress.org/',
    logoUrl: '/assets/logos/wordpress.svg',
    testing: {
      endpoints: [
        {
          id: 'wordpress-upload',
          name: 'WordPress Upload',
          baseUrl: 'https://example.com/wp-content/uploads',
          defaultParams: {},
          method: 'GET' as const
        }
      ],
      transforms: [
        {
          id: 'thumbnail-generation',
          name: 'Thumbnail Generation',
          params: { size: 'thumbnail' },
          description: 'WordPress automatic thumbnail generation',
          expectedBehavior: 'strip'
        },
        {
          id: 'medium-generation',
          name: 'Medium Size',
          params: { size: 'medium' },
          description: 'WordPress medium size generation',
          expectedBehavior: 'strip'
        },
        {
          id: 'large-generation',
          name: 'Large Size',
          params: { size: 'large' },
          description: 'WordPress large size generation',
          expectedBehavior: 'strip'
        },
        {
          id: 'custom-size',
          name: 'Custom Size',
          params: { width: '1200', height: '800' },
          description: 'Custom image size generation',
          expectedBehavior: 'strip'
        },
        {
          id: 'image-compression',
          name: 'Image Compression',
          params: { quality: '85' },
          description: 'WordPress image compression',
          expectedBehavior: 'strip'
        },
        {
          id: 'webp-generation',
          name: 'WebP Generation',
          params: { format: 'webp' },
          description: 'WordPress WebP generation',
          expectedBehavior: 'strip'
        },
        {
          id: 'avif-generation',
          name: 'AVIF Generation',
          params: { format: 'avif' },
          description: 'WordPress AVIF generation',
          expectedBehavior: 'strip'
        },
        {
          id: 'strip-meta-filter',
          name: 'Strip Meta Filter',
          params: { filter: 'image_strip_meta' },
          description: 'WordPress image_strip_meta filter',
          expectedBehavior: 'strip'
        },
        {
          id: 'preserve-meta-filter',
          name: 'Preserve Meta Filter',
          params: { filter: 'preserve_metadata' },
          description: 'Custom metadata preservation filter',
          expectedBehavior: 'preserve'
        },
        {
          id: 'vip-preserve',
          name: 'VIP Preserve',
          params: { vip: 'true', preserve: 'metadata' },
          description: 'WordPress VIP metadata preservation',
          expectedBehavior: 'preserve'
        },
        {
          id: 'remote-manifest',
          name: 'Remote Manifest',
          params: { remote_manifest: 'true' },
          description: 'Remote manifest support',
          expectedBehavior: 'preserve'
        },
        {
          id: 'combined-processing',
          name: 'Combined Processing',
          params: { 
            width: '1200', 
            height: '800', 
            quality: '85',
            format: 'webp',
            filter: 'preserve_metadata',
            remote_manifest: 'true'
          },
          description: 'Complete WordPress processing pipeline',
          expectedBehavior: 'preserve'
        }
      ],
      preserveToggle: {
        name: 'Preserve Metadata Filter',
        description: 'Disable image_strip_meta filter to preserve C2PA',
        param: 'image_strip_meta',
        value: 'false',
        docsUrl: 'https://developer.wordpress.org/reference/hooks/image_strip_meta/'
      },
      rateLimit: {
        requestsPerSecond: 5,
        burstLimit: 10,
        backoffMs: 2000
      }
    },
    scoring: {
      defaultScore: 0,
      bestPracticeScore: 0,
      dimensions: [],
      lastUpdated: new Date(),
      grade: 'red',
      improvementPath: [
        'Add add_filter("image_strip_meta", false); to functions.php',
        'Ensure remote manifest Link headers are preserved',
        'Test thumbnail regeneration with metadata preservation',
        'Verify CDN respects Link headers for remote manifests'
      ]
    }
  },

  {
    id: 'shopify-core',
    name: 'Shopify Core',
    type: 'cms',
    category: 'E-commerce Platform',
    website: 'https://www.shopify.com/',
    docsUrl: 'https://shopify.dev/docs',
    logoUrl: '/assets/logos/shopify.svg',
    testing: {
      endpoints: [
        {
          id: 'shopify-cdn',
          name: 'Shopify CDN',
          baseUrl: 'https://cdn.shopify.com/s/files',
          defaultParams: {
            width: '800',
            height: '600',
            crop: 'center'
          },
          method: 'GET' as const
        }
      ],
      transforms: [
        {
          id: 'resize',
          name: 'Resize',
          params: { width: '800', height: '600', crop: 'center' },
          description: 'Shopify image resize',
          expectedBehavior: 'strip'
        },
        {
          id: 'crop-center',
          name: 'Center Crop',
          params: { crop: 'center' },
          description: 'Center crop transformation',
          expectedBehavior: 'strip'
        },
        {
          id: 'crop-top',
          name: 'Top Crop',
          params: { crop: 'top' },
          description: 'Top crop transformation',
          expectedBehavior: 'strip'
        },
        {
          id: 'format-webp',
          name: 'Format WebP',
          params: { format: 'webp' },
          description: 'WebP format conversion',
          expectedBehavior: 'strip'
        },
        {
          id: 'format-avif',
          name: 'Format AVIF',
          params: { format: 'avif' },
          description: 'AVIF format conversion',
          expectedBehavior: 'strip'
        },
        {
          id: 'quality-85',
          name: 'Quality 85',
          params: { quality: '85' },
          description: 'High quality setting',
          expectedBehavior: 'strip'
        },
        {
          id: 'quality-65',
          name: 'Quality 65',
          params: { quality: '65' },
          description: 'Medium quality setting',
          expectedBehavior: 'strip'
        },
        {
          id: 'pad-color',
          name: 'Pad Color',
          params: { pad: '20', bg: 'ffffff' },
          description: 'Padding with background color',
          expectedBehavior: 'strip'
        },
        {
          id: 'scale-2x',
          name: 'Scale 2x',
          params: { scale: '2' },
          description: '2x scale for high DPI',
          expectedBehavior: 'strip'
        },
        {
          id: 'metadata-preserve',
          name: 'Preserve Metadata',
          params: { metadata: 'preserve' },
          description: 'Attempt metadata preservation',
          expectedBehavior: 'strip'
        },
        {
          id: 'remote-manifest',
          name: 'Remote Manifest',
          params: { remote_manifest: 'true' },
          description: 'Remote manifest support',
          expectedBehavior: 'preserve'
        },
        {
          id: 'combined-transform',
          name: 'Combined Transform',
          params: { 
            width: '1200', 
            height: '800', 
            crop: 'center', 
            format: 'webp', 
            quality: '85',
            scale: '2',
            metadata: 'preserve',
            remote_manifest: 'true'
          },
          description: 'Complete Shopify transformation pipeline',
          expectedBehavior: 'strip'
        }
      ],
      preserveToggle: {
        name: 'Metadata Preservation',
        description: 'Shopify currently strips metadata - remote manifest recommended',
        param: 'metadata',
        value: 'preserve',
        docsUrl: 'https://shopify.dev/docs/themes/assets-optimization'
      },
      rateLimit: {
        requestsPerSecond: 5,
        burstLimit: 10,
        backoffMs: 2000
      }
    },
    scoring: {
      defaultScore: 0,
      bestPracticeScore: 0,
      dimensions: [],
      lastUpdated: new Date(),
      grade: 'red',
      improvementPath: [
        'Implement remote-manifest approach for C2PA',
        'Add Link headers for remote manifest discovery',
        'Test with various Shopify image transformations',
        'Consider custom app for metadata preservation'
      ]
    }
  }
];

export const VENDOR_CATEGORIES = [
  {
    id: 'cdn',
    name: 'CDN & Image Optimizers',
    description: 'Content delivery networks and image optimization services',
    vendors: ['cloudflare-images', 'fastly-image-optimizer', 'akamai-ivm', 'cloudinary', 'imgix']
  },
  {
    id: 'cms',
    name: 'Content Management Systems',
    description: 'CMS platforms and their image processing pipelines',
    vendors: ['wordpress-core', 'shopify-core']
  }
];

export const getVendorById = (id: string): Vendor | undefined => {
  return VENDORS.find(vendor => vendor.id === id);
};

export const getVendorsByCategory = (categoryId: string): Vendor[] => {
  const category = VENDOR_CATEGORIES.find(cat => cat.id === categoryId);
  if (!category) return [];
  
  return VENDORS.filter(vendor => category.vendors.includes(vendor.id));
};

export const getVendorsByType = (type: 'cdn' | 'cms'): Vendor[] => {
  return VENDORS.filter(vendor => vendor.type === type);
};
