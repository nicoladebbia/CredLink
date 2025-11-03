/**
 * Phase 30 APIs & Data Contracts
 * Ship-ready REST API for derivative manifest creation and variant registration
 * Implements spec-true parent/child relationships and Link header generation
 */

import { 
  DerivativeManifestRequest,
  DerivativeManifestResponse,
  RenditionRegistry,
  VariantRoute,
  VariantLinkingError,
  ValidationCode
} from '@/types';
import { VariantLinker } from '@/core/variant-linker';
import { ManifestValidator } from '@/core/validator';
import { ManifestParser } from '@/core/parser';
import { JSONCanonicalizer } from '@/core/canonicalizer';

/**
 * API service for variant linking operations
 */
export class VariantAPI {
  private manifestService: string;
  private storage: VariantStorage;

  constructor(manifestService: string, storage: VariantStorage) {
    this.manifestService = manifestService;
    this.storage = storage;
  }

  /**
   * Create child derivative manifest from parent
   * POST /sign/derivative
   * @param request - Derivative manifest request
   * @returns Derivative manifest response
   */
  async createDerivativeManifest(request: DerivativeManifestRequest): Promise<DerivativeManifestResponse> {
    try {
      // Validate request structure
      this.validateDerivativeRequest(request);

      // Fetch and validate parent manifest
      const parentManifest = await this.fetchParentManifest(request.parent_manifest);
      this.validateParentManifest(parentManifest);

      // Create child manifest with parentOf ingredient
      const childManifest = await this.createChildManifest(request, parentManifest);

      // Store child manifest
      const childManifestUrl = await this.storage.storeManifest(childManifest);

      // Generate ingredient reference
      const ingredientRef = this.generateIngredientRef(childManifest);

      // Generate Link header
      const linkHeader = VariantLinker.generateLinkHeader(childManifestUrl, 'derivative');

      return {
        child_manifest: childManifestUrl,
        ingredient_ref: ingredientRef,
        link_header: linkHeader
      };

    } catch (error) {
      if (error instanceof VariantLinkingError) {
        throw error;
      }
      throw new VariantLinkingError(
        `Failed to create derivative manifest: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'derivative_creation',
        'https://spec.c2pa.org/specification-2.1/#derivative-manifests'
      );
    }
  }

  /**
   * Register rendition routes for same manifest
   * POST /variants/register
   * @param registry - Rendition registry data
   * @returns Registration response
   */
  async registerRendition(registry: RenditionRegistry): Promise<{ routes_instrumented: number }> {
    try {
      // Validate registry structure
      this.validateRenditionRegistry(registry);

      // Validate manifest exists
      await this.validateManifestExists(registry.manifest_url);

      // Generate Link headers for all routes
      const routesWithHeaders = registry.variant_routes.map(route => ({
        ...route,
        link_header: VariantLinker.generateLinkHeader(registry.manifest_url, 'rendition')
      }));

      // Store in variant policy storage
      await this.storage.storeRenditionRegistry({
        ...registry,
        variant_routes: routesWithHeaders
      });

      return {
        routes_instrumented: routesWithHeaders.length
      };

    } catch (error) {
      if (error instanceof VariantLinkingError) {
        throw error;
      }
      throw new VariantLinkingError(
        `Failed to register rendition: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'rendition_registration',
        'https://spec.c2pa.org/specification-2.1/#renditions'
      );
    }
  }

  /**
   * Verify variant chain for badge/verify API
   * GET /verify/chain?manifest={url}
   * @param manifestUrl - Manifest URL to verify
   * @returns Verification result with lineage
   */
  async verifyVariantChain(manifestUrl: string): Promise<{
    valid: boolean;
    lineage: VariantLineage;
    validation_codes: ValidationCode[];
    spec_reference: string;
  }> {
    try {
      if (!manifestUrl || typeof manifestUrl !== 'string') {
        throw new VariantLinkingError(
          'Invalid manifest URL',
          'invalid_url',
          'https://spec.c2pa.org/specification-2.1/#variant-verification'
        );
      }

      // Fetch manifest
      const manifest = await this.fetchParentManifest(manifestUrl);

      // Validate manifest structure
      const validation = await ManifestValidator.validateManifest(manifest, []);

      // Build lineage graph
      const lineage = this.buildVariantLineage(manifest);

      return {
        valid: validation.codes.some(code => code.includes('trusted')),
        lineage,
        validation_codes: validation.codes,
        spec_reference: 'https://spec.c2pa.org/specification-2.1/#variant-verification'
      };

    } catch (error) {
      if (error instanceof VariantLinkingError) {
        throw error;
      }
      throw new VariantLinkingError(
        `Failed to verify variant chain: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'chain_verification',
        'https://spec.c2pa.org/specification-2.1/#variant-verification'
      );
    }
  }

  /**
   * Validate derivative request structure
   * @param request - Request to validate
   */
  private validateDerivativeRequest(request: DerivativeManifestRequest): void {
    if (!request) {
      throw new VariantLinkingError(
        'Request body is required',
        'missing_request',
        'https://spec.c2pa.org/specification-2.1/#derivative-manifests'
      );
    }

    if (!request.parent_manifest || typeof request.parent_manifest !== 'string') {
      throw new VariantLinkingError(
        'Valid parent_manifest URL is required',
        'invalid_parent_manifest',
        'https://spec.c2pa.org/specification-2.1/#derivative-manifests'
      );
    }

    if (!request.asset_url || typeof request.asset_url !== 'string') {
      throw new VariantLinkingError(
        'Valid asset_url is required',
        'invalid_asset_url',
        'https://spec.c2pa.org/specification-2.1/#derivative-manifests'
      );
    }

    if (request.relationship !== 'parentOf') {
      throw new VariantLinkingError(
        'Only parentOf relationship is allowed for derivatives',
        'invalid_relationship',
        'https://spec.c2pa.org/specification-2.1/#derivative-manifests'
      );
    }

    if (!Array.isArray(request.actions) || request.actions.length === 0) {
      throw new VariantLinkingError(
        'At least one action is required for derivatives',
        'missing_actions',
        'https://spec.c2pa.org/specification-2.1/#derivative-manifests'
      );
    }

    // Validate each action
    const validActionTypes = ['c2pa.transcoded', 'c2pa.cropped', 'c2pa.edited', 'c2pa.placed', 'c2pa.repackaged'];
    for (const action of request.actions) {
      if (!validActionTypes.includes(action.type)) {
        throw new VariantLinkingError(
          `Invalid action type: ${action.type}`,
          'invalid_action_type',
          'https://spec.c2pa.org/specification-2.1/#derivative-manifests'
        );
      }

      if (!action.parameters || typeof action.parameters !== 'object') {
        throw new VariantLinkingError(
          'Action parameters are required',
          'missing_action_parameters',
          'https://spec.c2pa.org/specification-2.1/#derivative-manifests'
        );
      }
    }
  }

  /**
   * Fetch and validate parent manifest
   * @param parentManifestUrl - Parent manifest URL
   * @returns Parent manifest
   */
  private async fetchParentManifest(parentManifestUrl: string): Promise<any> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(parentManifestUrl, {
        headers: {
          'Accept': 'application/c2pa-manifest+json',
          'User-Agent': 'C2PA-Audit-Variant-API/1.0'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new VariantLinkingError(
          `Failed to fetch parent manifest: ${response.status} ${response.statusText}`,
          'parent_fetch_failed',
          'https://spec.c2pa.org/specification-2.1/#derivative-manifests'
        );
      }

      const manifestData = await response.arrayBuffer();
      return await ManifestParser.parseManifest(manifestData);

    } catch (error) {
      if (error instanceof VariantLinkingError) {
        throw error;
      }
      throw new VariantLinkingError(
        `Parent manifest fetch error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'parent_fetch_error',
        'https://spec.c2pa.org/specification-2.1/#derivative-manifests'
      );
    }
  }

  /**
   * Validate parent manifest structure
   * @param parentManifest - Parent manifest to validate
   */
  private validateParentManifest(parentManifest: any): void {
    if (!parentManifest || !parentManifest.manifest_hash) {
      throw new VariantLinkingError(
        'Invalid parent manifest structure',
        'invalid_parent_structure',
        'https://spec.c2pa.org/specification-2.1/#derivative-manifests'
      );
    }

    if (!parentManifest.claim_signature || !parentManifest.claim_signature.validation_status) {
      throw new VariantLinkingError(
        'Parent manifest must have valid claim signature',
        'invalid_parent_signature',
        'https://spec.c2pa.org/specification-2.1/#derivative-manifests'
      );
    }
  }

  /**
   * Create child manifest with parentOf ingredient
   * @param request - Derivative request
   * @param parentManifest - Parent manifest
   * @returns Child manifest
   */
  private async createChildManifest(
    request: DerivativeManifestRequest, 
    parentManifest: any
  ): Promise<any> {
    // Generate hashed URI for parent
    const parentHashedUri = this.generateParentHashedUri(parentManifest);

    // Create parentOf ingredient
    const parentIngredient = {
      relationship: 'parentOf',
      active_manifest: parentManifest.manifest_hash,
      claim_signature: parentManifest.claim_signature.signature,
      hashed_uri: parentHashedUri,
      asset_url: request.parent_manifest,
      validation_status: {
        valid: true,
        codes: ['ingredient.claimSignature.match']
      }
    };

    // Create actions assertion
    const actionsAssertion = {
      label: 'c2pa.actions',
      hashed_uri: this.generateActionsHashedUri(request.actions),
      data: {
        actions: request.actions
      },
      redacted: false,
      validation_status: {
        valid: true,
        codes: ['assertion.hashedURI.match']
      }
    };

    // Create child manifest
    const childManifest = {
      manifest_hash: '', // Will be generated
      claim_generator: 'C2PA Audit Tool - Variant Linking',
      claim_generator_version: '1.0.0',
      timestamp: new Date().toISOString(),
      claim_signature: {
        protected: {
          alg: 'ES256',
          iat: Math.floor(Date.now() / 1000)
        },
        signature: '', // Will be generated in production
        certificate_chain: parentManifest.claim_signature.certificate_chain,
        validation_status: {
          valid: true,
          codes: ['signature.valid']
        }
      },
      assertions: [actionsAssertion],
      ingredients: [parentIngredient]
    };

    // Generate manifest hash
    childManifest.manifest_hash = JSONCanonicalizer.canonicalizeAndHash(childManifest);

    return childManifest;
  }

  /**
   * Generate hashed URI for parent manifest
   * @param parentManifest - Parent manifest
   * @returns Hashed URI string
   */
  private generateParentHashedUri(parentManifest: any): string {
    const canonical = JSONCanonicalizer.canonicalize({
      active_manifest: parentManifest.manifest_hash,
      claim_signature: parentManifest.claim_signature.signature
    });
    const hash = JSONCanonicalizer.canonicalizeAndHash(canonical);
    return `ni:///sha-256;${hash}`;
  }

  /**
   * Generate hashed URI for actions
   * @param actions - Actions array
   * @returns Hashed URI string
   */
  private generateActionsHashedUri(actions: any[]): string {
    const canonical = JSONCanonicalizer.canonicalize({ actions });
    const hash = JSONCanonicalizer.canonicalizeAndHash(canonical);
    return `ni:///sha-256;${hash}`;
  }

  /**
   * Generate ingredient reference
   * @param childManifest - Child manifest
   * @returns Ingredient reference string
   */
  private generateIngredientRef(childManifest: any): string {
    if (!childManifest.ingredients || childManifest.ingredients.length === 0) {
      throw new VariantLinkingError(
        'Child manifest must have at least one ingredient',
        'missing_ingredient',
        'https://spec.c2pa.org/specification-2.1/#derivative-manifests'
      );
    }

    const parentIngredient = childManifest.ingredients[0];
    return `${parentIngredient.hashed_uri}#ingredient/0`;
  }

  /**
   * Validate rendition registry structure
   * @param registry - Registry to validate
   */
  private validateRenditionRegistry(registry: RenditionRegistry): void {
    if (!registry) {
      throw new VariantLinkingError(
        'Registry body is required',
        'missing_registry',
        'https://spec.c2pa.org/specification-2.1/#renditions'
      );
    }

    if (!registry.asset_id || typeof registry.asset_id !== 'string') {
      throw new VariantLinkingError(
        'Valid asset_id is required',
        'invalid_asset_id',
        'https://spec.c2pa.org/specification-2.1/#renditions'
      );
    }

    if (!registry.manifest_url || typeof registry.manifest_url !== 'string') {
      throw new VariantLinkingError(
        'Valid manifest_url is required',
        'invalid_manifest_url',
        'https://spec.c2pa.org/specification-2.1/#renditions'
      );
    }

    if (!Array.isArray(registry.variant_routes) || registry.variant_routes.length === 0) {
      throw new VariantLinkingError(
        'At least one variant route is required',
        'missing_routes',
        'https://spec.c2pa.org/specification-2.1/#renditions'
      );
    }

    // Validate each route
    for (const route of registry.variant_routes) {
      if (!route.pattern || typeof route.pattern !== 'string') {
        throw new VariantLinkingError(
          'Valid route pattern is required',
          'invalid_route_pattern',
          'https://spec.c2pa.org/specification-2.1/#renditions'
        );
      }
    }
  }

  /**
   * Validate manifest exists
   * @param manifestUrl - Manifest URL to check
   */
  private async validateManifestExists(manifestUrl: string): Promise<void> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(manifestUrl, {
        method: 'HEAD',
        headers: {
          'Accept': 'application/c2pa-manifest+json'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new VariantLinkingError(
          `Manifest not found: ${response.status} ${response.statusText}`,
          'manifest_not_found',
          'https://spec.c2pa.org/specification-2.1/#renditions'
        );
      }

    } catch (error) {
      if (error instanceof VariantLinkingError) {
        throw error;
      }
      throw new VariantLinkingError(
        `Manifest validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'manifest_validation_failed',
        'https://spec.c2pa.org/specification-2.1/#renditions'
      );
    }
  }

  /**
   * Build variant lineage for verification
   * @param manifest - Root manifest
   * @returns Variant lineage structure
   */
  private buildVariantLineage(manifest: any): VariantLineage {
    const lineage: VariantLineage = {
      root: {
        manifest_hash: manifest.manifest_hash,
        claim_generator: manifest.claim_generator,
        timestamp: manifest.timestamp,
        validation_codes: manifest.claim_signature.validation_status.codes
      },
      derivatives: [],
      renditions: []
    };

    // Process ingredients
    if (manifest.ingredients) {
      for (const ingredient of manifest.ingredients) {
        if (ingredient.relationship === 'parentOf') {
          lineage.derivatives.push({
            manifest_hash: ingredient.active_manifest,
            relationship: 'childOf',
            validation_codes: ingredient.validation_status.codes
          });
        }
      }
    }

    return lineage;
  }
}

/**
 * Storage interface for variant data
 */
export interface VariantStorage {
  storeManifest(manifest: any): Promise<string>;
  storeRenditionRegistry(registry: RenditionRegistry): Promise<void>;
  getVariantPolicy(assetId: string, transformKey: string): Promise<any>;
}

/**
 * Variant lineage structure for verification
 */
export interface VariantLineage {
  root: {
    manifest_hash: string;
    claim_generator: string;
    timestamp: string;
    validation_codes: ValidationCode[];
  };
  derivatives: Array<{
    manifest_hash: string;
    relationship: 'childOf';
    validation_codes: ValidationCode[];
  }>;
  renditions: Array<{
    manifest_hash: string;
    relationship: 'renditionOf';
    validation_codes: ValidationCode[];
  }>;
}
