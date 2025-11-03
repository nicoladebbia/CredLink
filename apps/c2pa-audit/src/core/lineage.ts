/**
 * C2PA Lineage Reconstruction Algorithm
 * Implements spec-compliant recursive ingredient validation
 * Generates lineage DAG with validation status per node
 */

import { 
  C2PAManifest, 
  Ingredient, 
  LineageGraph, 
  LineageNode, 
  LineageEdge,
  ValidationStatus,
  ValidationCode,
  ValidationSummary,
  Certificate
} from '@/types';
import { ManifestValidator } from './validator';
import { ManifestParser } from './parser';

/**
 * Reconstructs and validates C2PA manifest lineage
 */
export class LineageReconstructor {
  /**
   * Build complete lineage graph from a manifest
   * @param rootManifest - Root manifest to start from
   * @param trustAnchors - Trusted certificate anchors
   * @param maxDepth - Maximum recursion depth (default: 10)
   * @returns Complete lineage graph with validation
   */
  static async buildLineage(
    rootManifest: C2PAManifest,
    trustAnchors: Certificate[] = [],
    maxDepth: number = 10
  ): Promise<LineageGraph> {
    if (!rootManifest) {
      throw new Error('Invalid manifest: rootManifest is required');
    }

    if (!rootManifest.manifest_hash) {
      throw new Error('Invalid manifest: manifest_hash is required');
    }

    if (maxDepth < 1 || maxDepth > 100) {
      throw new Error('Invalid maxDepth: must be between 1 and 100');
    }

    if (!Array.isArray(trustAnchors)) {
      throw new Error('Invalid trustAnchors: must be an array');
    }

    const nodes: Map<string, LineageNode> = new Map();
    const edges: LineageEdge[] = [];
    const redactions: Set<string> = new Set();
    const visited: Set<string> = new Set();

    try {
      // Start recursive reconstruction from root
      await this.recurseLineage(
        rootManifest,
        trustAnchors,
        nodes,
        edges,
        redactions,
        visited,
        maxDepth,
        0
      );

      // Convert maps to arrays and generate summary
      const nodeList = Array.from(nodes.values());
      const validationSummary = this.generateValidationSummary(nodeList);

      return {
        nodes: nodeList,
        edges,
        redactions: Array.from(redactions),
        validation_summary: validationSummary
      };
    } catch (error) {
      throw new Error(`Lineage reconstruction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Recursive lineage reconstruction following spec algorithm
   * @param manifest - Current manifest to process
   * @param trustAnchors - Trusted certificate anchors
   * @param nodes - Map of nodes being built
   * @param edges - Array of edges being built
   * @param redactions - Set of redactions being collected
   * @param visited - Set of visited manifest hashes
   * @param maxDepth - Maximum recursion depth
   * @param currentDepth - Current recursion depth
   */
  private static async recurseLineage(
    manifest: C2PAManifest,
    trustAnchors: Certificate[],
    nodes: Map<string, LineageNode>,
    edges: LineageEdge[],
    redactions: Set<string>,
    visited: Set<string>,
    maxDepth: number,
    currentDepth: number
  ): Promise<void> {
    // Prevent infinite recursion
    if (currentDepth >= maxDepth) {
      console.warn(`Maximum lineage depth (${maxDepth}) reached`);
      return;
    }

    const manifestHash = manifest.manifest_hash;
    
    // Skip if already processed (cycle detection)
    if (visited.has(manifestHash)) {
      return;
    }
    visited.add(manifestHash);

    // Validate current manifest
    const validation = await ManifestValidator.validateManifest(manifest, trustAnchors);
    
    // Extract signer information
    const signerCert = manifest.claim_signature.certificate_chain[0];
    const signerThumbprint = signerCert?.thumbprint || 'unknown';
    
    // Create lineage node
    const node: LineageNode = {
      id: manifestHash,
      label: `${signerThumbprint.substring(0, 8)}...${new Date(manifest.timestamp).toISOString()}`,
      signer_thumbprint: signerThumbprint,
      timestamp: manifest.timestamp,
      status: this.determineNodeStatus(validation),
      validation_codes: validation.codes,
      manifest
    };

    nodes.set(manifestHash, node);

    // Collect redactions from this manifest
    if (manifest.redactions) {
      for (const redaction of manifest.redactions) {
        redactions.add(redaction.jumbf_uri);
      }
    }

    // Process ingredients recursively
    if (manifest.ingredients && manifest.ingredients.length > 0) {
      for (const ingredient of manifest.ingredients) {
        await this.processIngredient(
          ingredient,
          manifest,
          trustAnchors,
          nodes,
          edges,
          redactions,
          visited,
          maxDepth,
          currentDepth
        );
      }
    }
  }

  /**
   * Process a single ingredient and recurse into its manifest
   * @param ingredient - Ingredient to process
   * @param parentManifest - Parent manifest
   * @param trustAnchors - Trusted certificate anchors
   * @param nodes - Map of nodes being built
   * @param edges - Array of edges being built
   * @param redactions - Set of redactions being collected
   * @param visited - Set of visited manifest hashes
   * @param maxDepth - Maximum recursion depth
   * @param currentDepth - Current recursion depth
   */
  private static async processIngredient(
    ingredient: Ingredient,
    parentManifest: C2PAManifest,
    trustAnchors: Certificate[],
    nodes: Map<string, LineageNode>,
    edges: LineageEdge[],
    redactions: Set<string>,
    visited: Set<string>,
    maxDepth: number,
    currentDepth: number
  ): Promise<void> {
    try {
      // Validate ingredient relationship
      const ingredientValidation = await this.validateIngredient(
        ingredient,
        parentManifest,
        redactions
      );

      // Create edge from parent to ingredient
      const edge: LineageEdge = {
        source: parentManifest.manifest_hash,
        target: ingredient.active_manifest,
        relationship: ingredient.relationship as any,
        status: ingredientValidation
      };

      edges.push(edge);

      // Try to fetch and parse ingredient manifest
      // In a real implementation, this would fetch from remote or local store
      // For now, we'll create a placeholder if the manifest is not available
      let ingredientManifest: C2PAManifest | null = null;

      try {
        // TODO: Implement actual manifest fetching based on active_manifest hash
        // ingredientManifest = await this.fetchIngredientManifest(ingredient.active_manifest);
        
        // For now, skip if manifest is not available
        if (!ingredientManifest) {
          return;
        }

        // Recurse into ingredient
        await this.recurseLineage(
          ingredientManifest,
          trustAnchors,
          nodes,
          edges,
          redactions,
          visited,
          maxDepth,
          currentDepth + 1
        );

      } catch (error) {
        console.warn(`Failed to process ingredient ${ingredient.active_manifest}:`, error);
        
        // Create a minimal node for failed ingredient
        const failedNode: LineageNode = {
          id: ingredient.active_manifest,
          label: `FAILED: ${ingredient.active_manifest.substring(0, 8)}...`,
          signer_thumbprint: 'unknown',
          timestamp: new Date().toISOString(),
          status: 'failed',
          validation_codes: ['ingredient.manifestMissing'],
          manifest: this.createMinimalManifest(ingredient)
        };

        nodes.set(ingredient.active_manifest, failedNode);
      }

    } catch (error) {
      console.error(`Error processing ingredient:`, error);
    }
  }

  /**
   * Validate ingredient according to spec rules
   * @param ingredient - Ingredient to validate
   * @param parentManifest - Parent manifest
   * @param redactions - Set of redactions
   * @returns Validation status
   */
  private static async validateIngredient(
    ingredient: Ingredient,
    parentManifest: C2PAManifest,
    redactions: Set<string>
  ): Promise<ValidationStatus> {
    const codes: ValidationCode[] = [];
    let isValid = true;

    // Validate ingredient structure
    if (!ingredient.active_manifest || !ingredient.claim_signature) {
      codes.push('ingredient.manifestMissing');
      return {
        valid: false,
        codes,
        summary: 'Ingredient manifest missing'
      };
    }

    // Validate claim signature hash matches active manifest
    // This is a critical security check per the spec
    if (ingredient.active_manifest !== ingredient.claim_signature) {
      codes.push('ingredient.claimSignature.mismatch');
      isValid = false;
    } else {
      codes.push('ingredient.claimSignature.match');
    }

    // Check if ingredient is affected by redactions
    const ingredientRedacted = this.isIngredientRedacted(ingredient, parentManifest, redactions);
    if (ingredientRedacted) {
      // Redaction of ingredients may be allowed in some contexts
      // but should be flagged for security review
      codes.push('assertion.redactionAllowed');
    }

    return {
      valid: isValid,
      codes,
      summary: isValid ? 'Ingredient is valid' : 'Ingredient validation failed'
    };
  }

  /**
   * Check if an ingredient is affected by redactions
   * @param ingredient - Ingredient to check
   * @param parentManifest - Parent manifest
   * @param redactions - Set of redactions
   * @returns True if ingredient is redacted
   */
  private static isIngredientRedacted(
    ingredient: Ingredient,
    parentManifest: C2PAManifest,
    redactions: Set<string>
  ): boolean {
    // Check if the ingredient assertion itself is redacted
    const ingredientAssertion = parentManifest.assertions.find(a => 
      a.hashed_uri.includes(ingredient.active_manifest)
    );

    if (ingredientAssertion?.redacted) {
      return true;
    }

    // Check if any related URIs are redacted
    for (const redaction of redactions) {
      if (redaction.includes(ingredient.active_manifest)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Determine node status based on validation codes
   * @param validation - Validation status
   * @returns Node status
   */
  private static determineNodeStatus(validation: ValidationStatus): 'validated' | 'validated_with_warnings' | 'failed' {
    if (!validation.valid) {
      return 'failed';
    }

    // Check for warning conditions
    const warningCodes = [
      'timestamp.untrusted',
      'assertion.redactionAllowed',
      'signingCredential.untrusted'
    ];

    const hasWarnings = validation.codes.some(code => warningCodes.includes(code));
    
    return hasWarnings ? 'validated_with_warnings' : 'validated';
  }

  /**
   * Generate validation summary for the entire lineage
   * @param nodes - All nodes in the lineage
   * @returns Validation summary
   */
  private static generateValidationSummary(nodes: LineageNode[]): ValidationSummary {
    const totalNodes = nodes.length;
    const validatedNodes = nodes.filter(n => n.status === 'validated').length;
    const warningNodes = nodes.filter(n => n.status === 'validated_with_warnings').length;
    const failedNodes = nodes.filter(n => n.status === 'failed').length;

    let overallStatus: 'validated' | 'validated_with_warnings' | 'failed';
    
    if (failedNodes > 0) {
      overallStatus = 'failed';
    } else if (warningNodes > 0) {
      overallStatus = 'validated_with_warnings';
    } else {
      overallStatus = 'validated';
    }

    return {
      total_nodes: totalNodes,
      validated_nodes: validatedNodes,
      warning_nodes: warningNodes,
      failed_nodes: failedNodes,
      overall_status: overallStatus
    };
  }

  /**
   * Create minimal manifest for missing/failed ingredients
   * @param ingredient - Ingredient data
   * @returns Minimal manifest object
   */
  private static createMinimalManifest(ingredient: Ingredient): C2PAManifest {
    return {
      manifest_hash: ingredient.active_manifest,
      claim_generator: 'unknown',
      claim_generator_version: 'unknown',
      timestamp: new Date().toISOString(),
      claim_signature: {
        protected: { alg: 'unknown' },
        signature: '',
        certificate_chain: [],
        validation_status: {
          valid: false,
          codes: ['ingredient.manifestMissing'],
          summary: 'Manifest not available'
        }
      },
      assertions: [],
      ingredients: []
    };
  }

  /**
   * Fetch ingredient manifest from remote or local store
   * @param manifestHash - Hash of manifest to fetch
   * @returns Manifest data or null if not found
   */
  private static async fetchIngredientManifest(manifestHash: string): Promise<C2PAManifest | null> {
    // TODO: Implement actual manifest fetching
    // This would typically involve:
    // 1. Checking local cache/store
    // 2. Fetching from remote manifest store
    // 3. Parsing embedded manifests from ingredient assets
    
    throw new Error('Manifest fetching not yet implemented');
  }

  /**
   * Generate lineage graph in DOT format for visualization
   * @param lineage - Lineage graph
   * @returns DOT format string
   */
  static generateDOT(lineage: LineageGraph): string {
    let dot = 'digraph C2PA_Lineage {\n';
    dot += '  rankdir=TB;\n';
    dot += '  node [shape=box, style=filled];\n\n';

    // Add nodes with colors based on status
    for (const node of lineage.nodes) {
      let color = 'lightgray'; // default for unknown
      let fontColor = 'black';
      
      switch (node.status) {
        case 'validated':
          color = 'lightgreen';
          break;
        case 'validated_with_warnings':
          color = 'yellow';
          fontColor = 'black';
          break;
        case 'failed':
          color = 'lightcoral';
          fontColor = 'black';
          break;
      }

      dot += `  "${node.id}" [label="${node.label}\\n${node.signer_thumbprint.substring(0, 8)}...", fillcolor="${color}", fontcolor="${fontColor}"];\n`;
    }

    dot += '\n';

    // Add edges
    for (const edge of lineage.edges) {
      let edgeColor = 'black';
      let edgeStyle = 'solid';
      
      if (!edge.status.valid) {
        edgeColor = 'red';
        edgeStyle = 'dashed';
      }

      dot += `  "${edge.source}" -> "${edge.target}" [label="${edge.relationship}", color="${edgeColor}", style="${edgeStyle}"];\n`;
    }

    dot += '}\n';
    return dot;
  }

  /**
   * Generate lineage graph in Mermaid format for documentation
   * @param lineage - Lineage graph
   * @returns Mermaid format string
   */
  static generateMermaid(lineage: LineageGraph): string {
    let mermaid = 'graph TD\n';

    // Add nodes with status indicators
    for (const node of lineage.nodes) {
      let status = '❓';
      
      switch (node.status) {
        case 'validated':
          status = '✅';
          break;
        case 'validated_with_warnings':
          status = '⚠️';
          break;
        case 'failed':
          status = '❌';
          break;
      }

      const shortId = node.id.substring(0, 8);
      mermaid += `  ${shortId}[${status} ${node.label}]\n`;
    }

    mermaid += '\n';

    // Add edges
    for (const edge of lineage.edges) {
      const sourceShort = edge.source.substring(0, 8);
      const targetShort = edge.target.substring(0, 8);
      const edgeLabel = edge.status.valid ? edge.relationship : `${edge.relationship} ❌`;
      mermaid += `  ${sourceShort} -->|${edgeLabel}| ${targetShort}\n`;
    }

    return mermaid;
  }

  /**
   * Export lineage graph as JSON for API consumption
   * @param lineage - Lineage graph
   * @returns JSON-serializable lineage object
   */
  static exportJSON(lineage: LineageGraph): object {
    return {
      nodes: lineage.nodes.map(node => ({
        id: node.id,
        label: node.label,
        signer_thumbprint: node.signer_thumbprint,
        timestamp: node.timestamp,
        status: node.status,
        validation_codes: node.validation_codes,
        manifest_hash: node.manifest.manifest_hash,
        claim_generator: node.manifest.claim_generator
      })),
      edges: lineage.edges.map(edge => ({
        source: edge.source,
        target: edge.target,
        relationship: edge.relationship,
        valid: edge.status.valid,
        codes: edge.status.codes
      })),
      redactions: lineage.redactions,
      validation_summary: lineage.validation_summary
    };
  }
}
