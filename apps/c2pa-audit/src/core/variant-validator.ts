/**
 * Phase 30 Validation Rules - Strict, Spec-Aligned
 * Implements comprehensive validation for variant linking per C2PA 2.2 spec
 * Enforces parent/child relationships, action validation, and chain integrity
 */

import { 
  C2PAManifest,
  Ingredient,
  Assertion,
  ValidationCode,
  VariantAction,
  VariantLinkingError
} from '@/types';
import { ManifestValidator } from './validator';
import { JSONCanonicalizer } from './canonicalizer';

/**
 * Validation result for variant linking
 */
export interface VariantValidationResult {
  /** Overall validity */
  valid: boolean;
  /** Validation codes */
  codes: ValidationCode[];
  /** Detailed validation steps */
  steps: ValidationStep[];
  /** Spec references */
  spec_references: string[];
}

/**
 * Individual validation step
 */
export interface ValidationStep {
  /** Step name */
  name: string;
  /** Step result */
  result: boolean;
  /** Validation code */
  code: ValidationCode;
  /** Error message if failed */
  error?: string;
  /** Spec reference */
  spec_reference: string;
}

/**
 * Phase 30 Variant Validator - Strict spec-aligned validation
 */
export class VariantValidator {
  /**
   * Validate variant manifest for spec compliance
   * @param manifest - Manifest to validate
   * @param parentManifest - Optional parent manifest for derivative validation
   * @returns Comprehensive validation result
   */
  static async validateVariantManifest(
    manifest: C2PAManifest,
    parentManifest?: C2PAManifest
  ): Promise<VariantValidationResult> {
    const steps: ValidationStep[] = [];
    const codes: ValidationCode[] = [];
    const specReferences: string[] = [];

    try {
      // Step 1: Basic manifest structure validation
      const structureStep = await this.validateManifestStructure(manifest);
      steps.push(structureStep);
      if (!structureStep.result) codes.push(structureStep.code);
      specReferences.push(structureStep.spec_reference);

      // Step 2: Validate ingredients (critical for variant linking)
      const ingredientStep = await this.validateIngredients(manifest, parentManifest);
      steps.push(ingredientStep);
      if (!ingredientStep.result) codes.push(ingredientStep.code);
      specReferences.push(ingredientStep.spec_reference);

      // Step 3: Validate actions assertion
      const actionsStep = await this.validateActions(manifest);
      steps.push(actionsStep);
      if (!actionsStep.result) codes.push(actionsStep.code);
      specReferences.push(actionsStep.spec_reference);

      // Step 4: Validate parent/child relationships
      const relationshipStep = await this.validateRelationships(manifest, parentManifest);
      steps.push(relationshipStep);
      if (!relationshipStep.result) codes.push(relationshipStep.code);
      specReferences.push(relationshipStep.spec_reference);

      // Step 5: Validate hashed URIs
      const hashedUriStep = await this.validateHashedUris(manifest);
      steps.push(hashedUriStep);
      if (!hashedUriStep.result) codes.push(hashedUriStep.code);
      specReferences.push(hashedUriStep.spec_reference);

      // Step 6: Validate rendition consistency
      const renditionStep = await this.validateRenditionConsistency(manifest);
      steps.push(renditionStep);
      if (!renditionStep.result) codes.push(renditionStep.code);
      specReferences.push(renditionStep.spec_reference);

      return {
        valid: codes.length === 0,
        codes,
        steps,
        spec_references: [...new Set(specReferences)]
      };

    } catch (error) {
      return {
        valid: false,
        codes: ['manifest.structureInvalid'],
        steps: [{
          name: 'General Validation',
          result: false,
          code: 'manifest.structureInvalid',
          error: error instanceof Error ? error.message : 'Unknown error',
          spec_reference: 'https://spec.c2pa.org/specification-2.1/#manifest-structure'
        }],
        spec_references: ['https://spec.c2pa.org/specification-2.1/#manifest-structure']
      };
    }
  }

  /**
   * Validate basic manifest structure
   * @param manifest - Manifest to validate
   * @returns Validation step result
   */
  private static async validateManifestStructure(manifest: C2PAManifest): Promise<ValidationStep> {
    try {
      if (!manifest) {
        return {
          name: 'Manifest Structure',
          result: false,
          code: 'manifest.structureInvalid',
          error: 'Manifest is null or undefined',
          spec_reference: 'https://spec.c2pa.org/specification-2.1/#manifest-structure'
        };
      }

      const requiredFields = ['manifest_hash', 'claim_generator', 'timestamp', 'claim_signature', 'assertions'];
      for (const field of requiredFields) {
        if (!(field in manifest)) {
          return {
            name: 'Manifest Structure',
            result: false,
            code: 'manifest.structureInvalid',
            error: `Missing required field: ${field}`,
            spec_reference: 'https://spec.c2pa.org/specification-2.1/#manifest-structure'
          };
        }
      }

      if (!Array.isArray(manifest.assertions)) {
        return {
          name: 'Manifest Structure',
          result: false,
          code: 'manifest.structureInvalid',
          error: 'Assertions must be an array',
          spec_reference: 'https://spec.c2pa.org/specification-2.1/#assertions'
        };
      }

      return {
        name: 'Manifest Structure',
        result: true,
        code: 'manifest.structureValid',
        spec_reference: 'https://spec.c2pa.org/specification-2.1/#manifest-structure'
      };

    } catch (error) {
      return {
        name: 'Manifest Structure',
        result: false,
        code: 'manifest.structureInvalid',
        error: error instanceof Error ? error.message : 'Unknown error',
        spec_reference: 'https://spec.c2pa.org/specification-2.1/#manifest-structure'
      };
    }
  }

  /**
   * Validate ingredients for variant linking
   * @param manifest - Manifest to validate
   * @param parentManifest - Optional parent manifest
   * @returns Validation step result
   */
  private static async validateIngredients(
    manifest: C2PAManifest, 
    parentManifest?: C2PAManifest
  ): Promise<ValidationStep> {
    try {
      if (!manifest.ingredients || manifest.ingredients.length === 0) {
        // No ingredients is valid for root manifests
        return {
          name: 'Ingredient Validation',
          result: true,
          code: 'ingredient.validationPassed',
          spec_reference: 'https://spec.c2pa.org/specification-2.1/#ingredients'
        };
      }

      // Check for exactly one parentOf ingredient in derivatives
      const parentOfIngredients = manifest.ingredients.filter(i => i.relationship === 'parentOf');
      
      if (parentOfIngredients.length > 1) {
        return {
          name: 'Ingredient Validation',
          result: false,
          code: 'ingredient.multipleParents',
          error: 'Derivative manifests must have exactly one parentOf ingredient',
          spec_reference: 'https://spec.c2pa.org/specification-2.1/#parentOf'
        };
      }

      // Validate parentOf ingredient if present
      if (parentOfIngredients.length === 1) {
        const parentIngredient = parentOfIngredients[0];
        
        // Check hashed URI exists
        if (!parentIngredient.hashed_uri) {
          return {
            name: 'Ingredient Validation',
            result: false,
            code: 'ingredient.missingHashedUri',
            error: 'parentOf ingredient must include hashed_uri',
            spec_reference: 'https://spec.c2pa.org/specification-2.1/#hashed-uri'
          };
        }

        // Validate hashed URI format
        if (!this.isValidHashedUri(parentIngredient.hashed_uri)) {
          return {
            name: 'Ingredient Validation',
            result: false,
            code: 'ingredient.invalidHashedUri',
            error: 'Invalid hashed_uri format',
            spec_reference: 'https://spec.c2pa.org/specification-2.1/#hashed-uri'
          };
        }

        // If parent manifest provided, verify parent-child relationship
        if (parentManifest) {
          const parentValidation = await this.validateParentChildRelationship(
            parentIngredient,
            parentManifest
          );
          if (!parentValidation.result) {
            return parentValidation;
          }
        }
      }

      // Validate componentOf ingredients
      const componentOfIngredients = manifest.ingredients.filter(i => i.relationship === 'componentOf');
      for (const component of componentOfIngredients) {
        if (!component.hashed_uri) {
          return {
            name: 'Ingredient Validation',
            result: false,
            code: 'ingredient.componentMissingHashedUri',
            error: 'componentOf ingredient must include hashed_uri',
            spec_reference: 'https://spec.c2pa.org/specification-2.1/#componentOf'
          };
        }
      }

      return {
        name: 'Ingredient Validation',
        result: true,
        code: 'ingredient.validationPassed',
        spec_reference: 'https://spec.c2pa.org/specification-2.1/#ingredients'
      };

    } catch (error) {
      return {
        name: 'Ingredient Validation',
        result: false,
        code: 'ingredient.validationFailed',
        error: error instanceof Error ? error.message : 'Unknown error',
        spec_reference: 'https://spec.c2pa.org/specification-2.1/#ingredients'
      };
    }
  }

  /**
   * Validate actions assertion
   * @param manifest - Manifest to validate
   * @returns Validation step result
   */
  private static async validateActions(manifest: C2PAManifest): Promise<ValidationStep> {
    try {
      const actionsAssertion = manifest.assertions.find(a => a.label === 'c2pa.actions');
      
      if (!actionsAssertion) {
        // Actions assertion is optional for renditions
        return {
          name: 'Actions Validation',
          result: true,
          code: 'assertion.actions.optional',
          spec_reference: 'https://spec.c2pa.org/specification-2.1/#c2pa.actions'
        };
      }

      if (!actionsAssertion.data || !Array.isArray(actionsAssertion.data.actions)) {
        return {
          name: 'Actions Validation',
          result: false,
          code: 'assertion.actions.invalidStructure',
          error: 'c2pa.actions assertion must contain actions array',
          spec_reference: 'https://spec.c2pa.org/specification-2.1/#c2pa.actions'
        };
      }

      // Validate each action
      const validActionTypes = [
        'c2pa.transcoded', 
        'c2pa.cropped', 
        'c2pa.edited', 
        'c2pa.placed', 
        'c2pa.repackaged'
      ];

      for (const action of actionsAssertion.data.actions) {
        if (!action.type || typeof action.type !== 'string') {
          return {
            name: 'Actions Validation',
            result: false,
            code: 'assertion.actions.missingType',
            error: 'Each action must have a type field',
            spec_reference: 'https://spec.c2pa.org/specification-2.1/#c2pa.actions'
          };
        }

        if (!validActionTypes.includes(action.type)) {
          return {
            name: 'Actions Validation',
            result: false,
            code: 'assertion.actions.invalidType',
            error: `Invalid action type: ${action.type}`,
            spec_reference: 'https://spec.c2pa.org/specification-2.1/#c2pa.actions'
          };
        }

        if (!action.parameters || typeof action.parameters !== 'object') {
          return {
            name: 'Actions Validation',
            result: false,
            code: 'assertion.actions.missingParameters',
            error: 'Each action must have parameters object',
            spec_reference: 'https://spec.c2pa.org/specification-2.1/#c2pa.actions'
          };
        }

        // Validate specific action parameters
        const actionValidation = this.validateActionParameters(action);
        if (!actionValidation.result) {
          return actionValidation;
        }
      }

      return {
        name: 'Actions Validation',
        result: true,
        code: 'assertion.actions.valid',
        spec_reference: 'https://spec.c2pa.org/specification-2.1/#c2pa.actions'
      };

    } catch (error) {
      return {
        name: 'Actions Validation',
        result: false,
        code: 'assertion.actions.validationFailed',
        error: error instanceof Error ? error.message : 'Unknown error',
        spec_reference: 'https://spec.c2pa.org/specification-2.1/#c2pa.actions'
      };
    }
  }

  /**
   * Validate parent/child relationships
   * @param manifest - Manifest to validate
   * @param parentManifest - Optional parent manifest
   * @returns Validation step result
   */
  private static async validateRelationships(
    manifest: C2PAManifest,
    parentManifest?: C2PAManifest
  ): Promise<ValidationStep> {
    try {
      if (!parentManifest) {
        // No parent to validate against
        return {
          name: 'Relationship Validation',
          result: true,
          code: 'relationship.noParent',
          spec_reference: 'https://spec.c2pa.org/specification-2.1/#relationships'
        };
      }

      // Check for parentOf ingredient
      const parentOfIngredient = manifest.ingredients?.find(i => i.relationship === 'parentOf');
      
      if (!parentOfIngredient) {
        return {
          name: 'Relationship Validation',
          result: false,
          code: 'relationship.missingParentOf',
          error: 'Derivative manifest must have exactly one parentOf ingredient',
          spec_reference: 'https://spec.c2pa.org/specification-2.1/#parentOf'
        };
      }

      // Validate parent-child hash relationship
      if (parentOfIngredient.active_manifest !== parentManifest.manifest_hash) {
        return {
          name: 'Relationship Validation',
          result: false,
          code: 'relationship.parentHashMismatch',
          error: 'Parent active_manifest hash does not match parent manifest hash',
          spec_reference: 'https://spec.c2pa.org/specification-2.1/#parentOf'
        };
      }

      return {
        name: 'Relationship Validation',
        result: true,
        code: 'relationship.valid',
        spec_reference: 'https://spec.c2pa.org/specification-2.1/#relationships'
      };

    } catch (error) {
      return {
        name: 'Relationship Validation',
        result: false,
        code: 'relationship.validationFailed',
        error: error instanceof Error ? error.message : 'Unknown error',
        spec_reference: 'https://spec.c2pa.org/specification-2.1/#relationships'
      };
    }
  }

  /**
   * Validate hashed URIs
   * @param manifest - Manifest to validate
   * @returns Validation step result
   */
  private static async validateHashedUris(manifest: C2PAManifest): Promise<ValidationStep> {
    try {
      // Validate manifest hash
      if (!manifest.manifest_hash || typeof manifest.manifest_hash !== 'string') {
        return {
          name: 'Hashed URI Validation',
          result: false,
          code: 'hashedUri.invalidManifestHash',
          error: 'Manifest hash is required and must be a string',
          spec_reference: 'https://spec.c2pa.org/specification-2.1/#hashed-uri'
        };
      }

      // Validate assertion hashed URIs
      for (const assertion of manifest.assertions) {
        if (!assertion.hashed_uri || typeof assertion.hashed_uri !== 'string') {
          return {
            name: 'Hashed URI Validation',
            result: false,
            code: 'hashedUri.invalidAssertionUri',
            error: 'Assertion hashed_uri is required and must be a string',
            spec_reference: 'https://spec.c2pa.org/specification-2.1/#hashed-uri'
          };
        }

        if (!this.isValidHashedUri(assertion.hashed_uri)) {
          return {
            name: 'Hashed URI Validation',
            result: false,
            code: 'hashedUri.invalidAssertionFormat',
            error: 'Invalid assertion hashed_uri format',
            spec_reference: 'https://spec.c2pa.org/specification-2.1/#hashed-uri'
          };
        }
      }

      // Validate ingredient hashed URIs
      if (manifest.ingredients) {
        for (const ingredient of manifest.ingredients) {
          if (ingredient.hashed_uri && !this.isValidHashedUri(ingredient.hashed_uri)) {
            return {
              name: 'Hashed URI Validation',
              result: false,
              code: 'hashedUri.invalidIngredientFormat',
              error: 'Invalid ingredient hashed_uri format',
              spec_reference: 'https://spec.c2pa.org/specification-2.1/#hashed-uri'
            };
          }
        }
      }

      return {
        name: 'Hashed URI Validation',
        result: true,
        code: 'hashedUri.valid',
        spec_reference: 'https://spec.c2pa.org/specification-2.1/#hashed-uri'
      };

    } catch (error) {
      return {
        name: 'Hashed URI Validation',
        result: false,
        code: 'hashedUri.validationFailed',
        error: error instanceof Error ? error.message : 'Unknown error',
        spec_reference: 'https://spec.c2pa.org/specification-2.1/#hashed-uri'
      };
    }
  }

  /**
   * Validate rendition consistency
   * @param manifest - Manifest to validate
   * @returns Validation step result
   */
  private static async validateRenditionConsistency(manifest: C2PAManifest): Promise<ValidationStep> {
    try {
      // Check if this is a rendition (no parentOf ingredients)
      const hasParentOf = manifest.ingredients?.some(i => i.relationship === 'parentOf');
      
      if (!hasParentOf) {
        // Rendition - should not have actions that imply material changes
        const actionsAssertion = manifest.assertions.find(a => a.label === 'c2pa.actions');
        
        if (actionsAssertion && actionsAssertion.data?.actions) {
          const materialActions = actionsAssertion.data.actions.filter((action: any) => 
            ['c2pa.cropped', 'c2pa.edited', 'c2pa.placed'].includes(action.type)
          );
          
          if (materialActions.length > 0) {
            return {
              name: 'Rendition Consistency',
              result: false,
              code: 'assertion.action.ingredientMismatch',
              error: 'Rendition cannot contain material change actions (crop, edit, place)',
              spec_reference: 'https://spec.c2pa.org/specification-2.1/#renditions'
            };
          }
        }
      }

      return {
        name: 'Rendition Consistency',
        result: true,
        code: 'rendition.consistent',
        spec_reference: 'https://spec.c2pa.org/specification-2.1/#renditions'
      };

    } catch (error) {
      return {
        name: 'Rendition Consistency',
        result: false,
        code: 'rendition.validationFailed',
        error: error instanceof Error ? error.message : 'Unknown error',
        spec_reference: 'https://spec.c2pa.org/specification-2.1/#renditions'
      };
    }
  }

  /**
   * Validate parent-child relationship
   * @param parentIngredient - Parent ingredient from child manifest
   * @param parentManifest - Parent manifest
   * @returns Validation step result
   */
  private static async validateParentChildRelationship(
    parentIngredient: Ingredient,
    parentManifest: C2PAManifest
  ): Promise<ValidationStep> {
    try {
      // Verify parent ingredient references correct parent
      if (parentIngredient.active_manifest !== parentManifest.manifest_hash) {
        return {
          name: 'Parent-Child Relationship',
          result: false,
          code: 'ingredient.activeManifestMismatch',
          error: 'Parent ingredient active_manifest does not match parent manifest hash',
          spec_reference: 'https://spec.c2pa.org/specification-2.1/#parentOf'
        };
      }

      // Verify claim signature matches
      if (parentIngredient.claim_signature !== parentManifest.claim_signature.signature) {
        return {
          name: 'Parent-Child Relationship',
          result: false,
          code: 'ingredient.claimSignatureMismatch',
          error: 'Parent ingredient claim_signature does not match parent manifest signature',
          spec_reference: 'https://spec.c2pa.org/specification-2.1/#parentOf'
        };
      }

      return {
        name: 'Parent-Child Relationship',
        result: true,
        code: 'ingredient.parentChildValid',
        spec_reference: 'https://spec.c2pa.org/specification-2.1/#parentOf'
      };

    } catch (error) {
      return {
        name: 'Parent-Child Relationship',
        result: false,
        code: 'ingredient.parentChildValidationFailed',
        error: error instanceof Error ? error.message : 'Unknown error',
        spec_reference: 'https://spec.c2pa.org/specification-2.1/#parentOf'
      };
    }
  }

  /**
   * Validate specific action parameters
   * @param action - Action to validate
   * @returns Validation step result
   */
  private static validateActionParameters(action: any): ValidationStep {
    try {
      switch (action.type) {
        case 'c2pa.cropped':
          if (!action.parameters.width || !action.parameters.height) {
            return {
              name: 'Action Parameters',
              result: false,
              code: 'assertion.actions.missingCropDimensions',
              error: 'c2pa.cropped action must include width and height parameters',
              spec_reference: 'https://spec.c2pa.org/specification-2.1/#c2pa.cropped'
            };
          }
          break;

        case 'c2pa.transcoded':
          if (!action.parameters.from || !action.parameters.to) {
            return {
              name: 'Action Parameters',
              result: false,
              code: 'assertion.actions.missingTranscodeFormats',
              error: 'c2pa.transcoded action must include from and to parameters',
              spec_reference: 'https://spec.c2pa.org/specification-2.1/#c2pa.transcoded'
            };
          }
          break;

        case 'c2pa.placed':
          if (!action.parameters.description) {
            return {
              name: 'Action Parameters',
              result: false,
              code: 'assertion.actions.missingPlaceDescription',
              error: 'c2pa.placed action must include description parameter',
              spec_reference: 'https://spec.c2pa.org/specification-2.1/#c2pa.placed'
            };
          }
          break;
      }

      return {
        name: 'Action Parameters',
        result: true,
        code: 'assertion.actions.parametersValid',
        spec_reference: 'https://spec.c2pa.org/specification-2.1/#c2pa.actions'
      };

    } catch (error) {
      return {
        name: 'Action Parameters',
        result: false,
        code: 'assertion.actions.parametersValidationFailed',
        error: error instanceof Error ? error.message : 'Unknown error',
        spec_reference: 'https://spec.c2pa.org/specification-2.1/#c2pa.actions'
      };
    }
  }

  /**
   * Check if hashed URI format is valid
   * @param hashedUri - Hashed URI to validate
   * @returns True if valid
   */
  private static isValidHashedUri(hashedUri: string): boolean {
    if (typeof hashedUri !== 'string') {
      return false;
    }

    // Check for ni:///sha-256;... format
    const sha256Pattern = /^ni:\/\/\/sha-256;[a-fA-F0-9]{64}$/;
    if (sha256Pattern.test(hashedUri)) {
      return true;
    }

    // Check for hashed-uri:...#... format
    const hashedUriPattern = /^hashed-uri:.*#.*$/;
    return hashedUriPattern.test(hashedUri);
  }
}
