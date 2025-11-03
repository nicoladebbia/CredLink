/**
 * Phase 30 Variant Linking Engine
 * Implements spec-true rendition vs derivative decision logic
 * Follows C2PA 2.2 specification for parent/child relationships
 */

import { 
  VariantAction, 
  VariantLinkingMode, 
  DerivativeManifestRequest,
  VariantPolicy,
  C2PAError,
  VariantLinkingError
} from '@/types';
import { JSONCanonicalizer } from './canonicalizer';

/**
 * Transformation types for variant linking decisions
 */
export type TransformationType = 
  | 'resize' 
  | 'crop' 
  | 'format_change' 
  | 'heavy_compression' 
  | 'aesthetic_filter'
  | 'caption_overlay'
  | 'watermark'
  | 'sprite_sheet'
  | 'thumbnail';

/**
 * Transformation parameters for decision logic
 */
export interface TransformationParameters {
  /** Type of transformation */
  type: TransformationType;
  /** Original dimensions */
  original_width: number;
  /** Original height */
  original_height: number;
  /** New dimensions */
  new_width: number;
  /** New height */
  new_height: number;
  /** Format change if any */
  from_format?: string;
  /** To format */
  to_format?: string;
  /** Quality setting */
  quality?: number;
  /** Crop geometry if applicable */
  crop_left?: number;
  /** Crop top */
  crop_top?: number;
  /** Whether aesthetic filters applied */
  has_filters?: boolean;
  /** Whether overlays added */
  has_overlays?: boolean;
  /** Whether this is a sprite/thumbnail */
  is_sprite?: boolean;
}

/**
 * Decision result for variant linking
 */
export interface VariantDecision {
  /** Linking mode */
  mode: 'rendition' | 'derivative';
  /** Actions to record (for derivatives) */
  actions: VariantAction[];
  /** Rationale for decision */
  rationale: string;
  /** Spec reference */
  spec_reference: string;
}

/**
 * Phase 30 Variant Linker - Implements decision table logic
 */
export class VariantLinker {
  /**
   * Decide between rendition and derivative based on transformation
   * @param transformation - Transformation parameters
   * @returns Decision with mode and actions
   */
  static decideVariantMode(transformation: TransformationParameters): VariantDecision {
    if (!this.validateTransformation(transformation)) {
      throw new VariantLinkingError(
        'Invalid transformation parameters',
        'decision_logic',
        'https://spec.c2pa.org/specification-2.1/#variant-linking'
      );
    }

    const decision = this.evaluateTransformation(transformation);
    
    return {
      mode: decision.mode,
      actions: decision.actions,
      rationale: decision.rationale,
      spec_reference: decision.spec_reference
    };
  }

  /**
   * Create derivative manifest request from transformation
   * @param parentManifest - Parent manifest URL
   * @param assetUrl - Asset URL for derivative
   * @param transformation - Transformation parameters
   * @returns Derivative manifest request
   */
  static createDerivativeRequest(
    parentManifest: string,
    assetUrl: string,
    transformation: TransformationParameters
  ): DerivativeManifestRequest {
    const decision = this.decideVariantMode(transformation);
    
    if (decision.mode === 'rendition') {
      throw new VariantLinkingError(
        'Cannot create derivative request for rendition transformation',
        'derivative_request',
        'https://spec.c2pa.org/specification-2.1/#renditions'
      );
    }

    return {
      parent_manifest: parentManifest,
      asset_url: assetUrl,
      relationship: 'parentOf',
      actions: decision.actions
    };
  }

  /**
   * Generate Link header for HTTP responses
   * @param manifestUrl - Manifest URL
   * @param mode - Linking mode
   * @returns Formatted Link header
   */
  static generateLinkHeader(manifestUrl: string, mode: 'rendition' | 'derivative'): string {
    if (!this.isValidURL(manifestUrl)) {
      throw new VariantLinkingError(
        'Invalid manifest URL for Link header',
        'link_header',
        'https://spec.c2pa.org/specification-2.1/#remote-discovery'
      );
    }

    return `Link: <${manifestUrl}>; rel="c2pa-manifest"`;
  }

  /**
   * Validate transformation parameters
   * @param transformation - Parameters to validate
   * @returns True if valid
   */
  private static validateTransformation(transformation: TransformationParameters): boolean {
    if (!transformation || !transformation.type) {
      return false;
    }

    // Validate dimensions are positive
    if (transformation.original_width <= 0 || transformation.original_height <= 0 ||
        transformation.new_width <= 0 || transformation.new_height <= 0) {
      return false;
    }

    // Validate quality if provided
    if (transformation.quality !== undefined && 
        (transformation.quality < 0 || transformation.quality > 100)) {
      return false;
    }

    return true;
  }

  /**
   * Evaluate transformation according to decision table
   * @param transformation - Transformation to evaluate
   * @returns Decision with mode and actions
   */
  private static evaluateTransformation(transformation: TransformationParameters): {
    mode: 'rendition' | 'derivative';
    actions: VariantAction[];
    rationale: string;
    spec_reference: string;
  } {
    switch (transformation.type) {
      case 'resize':
        return this.evaluateResize(transformation);
      
      case 'format_change':
        return this.evaluateFormatChange(transformation);
      
      case 'crop':
        return this.evaluateCrop(transformation);
      
      case 'heavy_compression':
        return this.evaluateHeavyCompression(transformation);
      
      case 'aesthetic_filter':
        return this.evaluateAestheticFilter(transformation);
      
      case 'caption_overlay':
      case 'watermark':
        return this.evaluateOverlay(transformation);
      
      case 'sprite_sheet':
      case 'thumbnail':
        return this.evaluateSprite(transformation);
      
      default:
        throw new VariantLinkingError(
          `Unknown transformation type: ${transformation.type}`,
          'unknown_transformation',
          'https://spec.c2pa.org/specification-2.1/#variant-linking'
        );
    }
  }

  /**
   * Evaluate resize transformation
   * Decision: Prefer same manifest via Link for pure resize
   */
  private static evaluateResize(transformation: TransformationParameters): {
    mode: 'rendition' | 'derivative';
    actions: VariantAction[];
    rationale: string;
    spec_reference: string;
  } {
    const aspectRatioChanged = 
      (transformation.original_width / transformation.original_height) !== 
      (transformation.new_width / transformation.new_height);

    if (aspectRatioChanged) {
      // Aspect change = crop = derivative
      return {
        mode: 'derivative',
        actions: [
          {
            type: 'c2pa.cropped',
            parameters: {
              original_width: transformation.original_width,
              original_height: transformation.original_height,
              new_width: transformation.new_width,
              new_height: transformation.new_height
            }
          }
        ],
        rationale: 'Resize with aspect ratio change requires derivative manifest',
        spec_reference: 'https://spec.c2pa.org/specification-2.1/#c2pa.cropped'
      };
    }

    // Pure resize = rendition
    return {
      mode: 'rendition',
      actions: [],
      rationale: 'Pure resize without aspect change is a rendition',
      spec_reference: 'https://spec.c2pa.org/specification-2.1/#renditions'
    };
  }

  /**
   * Evaluate format change transformation
   * Decision: Remote Link for visually same intent
   */
  private static evaluateFormatChange(transformation: TransformationParameters): {
    mode: 'rendition' | 'derivative';
    actions: VariantAction[];
    rationale: string;
    spec_reference: string;
  } {
    const isVisuallyLossless = this.isVisuallyLosslessFormatChange(
      transformation.from_format,
      transformation.to_format
    );

    if (isVisuallyLossless) {
      // Visually lossless = rendition (remote Link)
      return {
        mode: 'rendition',
        actions: [],
        rationale: 'Visually lossless format change is a rendition',
        spec_reference: 'https://spec.c2pa.org/specification-2.1/#renditions'
      };
    }

    // Material format change = derivative
    return {
      mode: 'derivative',
      actions: [
        {
          type: 'c2pa.transcoded',
          parameters: {
            from: transformation.from_format,
            to: transformation.to_format,
            quality: transformation.quality
          }
        }
      ],
      rationale: 'Material format change requires derivative manifest',
      spec_reference: 'https://spec.c2pa.org/specification-2.1/#c2pa.transcoded'
    };
  }

  /**
   * Evaluate crop transformation
   * Decision: Always derivative with geometry
   */
  private static evaluateCrop(transformation: TransformationParameters): {
    mode: 'rendition' | 'derivative';
    actions: VariantAction[];
    rationale: string;
    spec_reference: string;
  } {
    return {
      mode: 'derivative',
      actions: [
        {
          type: 'c2pa.cropped',
          parameters: {
            left: transformation.crop_left || 0,
            top: transformation.crop_top || 0,
            width: transformation.new_width,
            height: transformation.new_height,
            original_width: transformation.original_width,
            original_height: transformation.original_height
          }
        }
      ],
      rationale: 'Crop changes editorial meaning - requires derivative manifest',
      spec_reference: 'https://spec.c2pa.org/specification-2.1/#c2pa.cropped'
    };
  }

  /**
   * Evaluate heavy compression transformation
   * Decision: Derivative with description
   */
  private static evaluateHeavyCompression(transformation: TransformationParameters): {
    mode: 'rendition' | 'derivative';
    actions: VariantAction[];
    rationale: string;
    spec_reference: string;
  } {
    return {
      mode: 'derivative',
      actions: [
        {
          type: 'c2pa.edited',
          parameters: {
            description: 'Heavy compression applied',
            quality: transformation.quality,
            from_format: transformation.from_format,
            to_format: transformation.to_format
          }
        }
      ],
      rationale: 'Heavy compression materially alters content - requires derivative',
      spec_reference: 'https://spec.c2pa.org/specification-2.1/#c2pa.edited'
    };
  }

  /**
   * Evaluate aesthetic filter transformation
   * Decision: Derivative with parameters
   */
  private static evaluateAestheticFilter(transformation: TransformationParameters): {
    mode: 'rendition' | 'derivative';
    actions: VariantAction[];
    rationale: string;
    spec_reference: string;
  } {
    return {
      mode: 'derivative',
      actions: [
        {
          type: 'c2pa.edited',
          parameters: {
            description: 'Aesthetic filters applied',
            has_filters: transformation.has_filters
          }
        }
      ],
      rationale: 'Aesthetic filters materially alter content - requires derivative',
      spec_reference: 'https://spec.c2pa.org/specification-2.1/#c2pa.edited'
    };
  }

  /**
   * Evaluate overlay transformation (caption/watermark)
   * Decision: Derivative with placed action
   */
  private static evaluateOverlay(transformation: TransformationParameters): {
    mode: 'rendition' | 'derivative';
    actions: VariantAction[];
    rationale: string;
    spec_reference: string;
  } {
    return {
      mode: 'derivative',
      actions: [
        {
          type: 'c2pa.placed',
          parameters: {
            description: 'Overlay added to content',
            has_overlays: transformation.has_overlays
          }
        }
      ],
      rationale: 'Overlays materially alter content - requires derivative with componentOf',
      spec_reference: 'https://spec.c2pa.org/specification-2.1/#c2pa.placed'
    };
  }

  /**
   * Evaluate sprite/thumbnail transformation
   * Decision: Derivative with multiple actions
   */
  private static evaluateSprite(transformation: TransformationParameters): {
    mode: 'rendition' | 'derivative';
    actions: VariantAction[];
    rationale: string;
    spec_reference: string;
  } {
    const actions: VariantAction[] = [
      {
        type: 'c2pa.transcoded',
        parameters: {
          description: 'Sprite/thumbnail generation',
          is_sprite: transformation.is_sprite
        }
      }
    ];

    // Add crop if dimensions changed
    if (transformation.crop_left !== undefined || transformation.crop_top !== undefined) {
      actions.push({
        type: 'c2pa.cropped',
        parameters: {
          left: transformation.crop_left || 0,
          top: transformation.crop_top || 0,
          width: transformation.new_width,
          height: transformation.new_height
        }
      });
    }

    return {
      mode: 'derivative',
      actions,
      rationale: 'Sprite/thumbnail generation requires derivative with crop/transcode',
      spec_reference: 'https://spec.c2pa.org/specification-2.1/#c2pa.transcoded'
    };
  }

  /**
   * Check if format change is visually lossless
   * @param fromFormat - Source format
   * @param toFormat - Target format
   * @returns True if visually lossless
   */
  private static isVisuallyLosslessFormatChange(
    fromFormat?: string, 
    toFormat?: string
  ): boolean {
    if (!fromFormat || !toFormat) {
      return false;
    }

    // Define visually lossless format pairs
    const losslessPairs = new Map([
      ['image/jpeg', 'image/webp'],
      ['image/png', 'image/webp'],
      ['image/jpeg', 'image/avif'],
      ['image/webp', 'image/avif']
    ]);

    return losslessPairs.has(`${fromFormat},${toFormat}`) || 
           losslessPairs.has(`${toFormat},${fromFormat}`);
  }

  /**
   * Validate URL format
   * @param url - URL to validate
   * @returns True if valid
   */
  private static isValidURL(url: string): boolean {
    try {
      const parsed = new URL(url);
      return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  }
}
