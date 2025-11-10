/**
 * Range Index Generator
 * Generates and manages range indices for C2PA manifest components
 * Enhanced with strict validation and security controls
 */

import { createHash } from 'crypto';

export interface RangeIndex {
  /** Start index */
  start: number;
  /** End index */
  end: number;
  /** Index type */
  type: 'byte' | 'character' | 'line';
  /** Component identifier */
  component: string;
  /** Metadata */
  metadata?: Record<string, unknown>;
}

export interface RangeIndexMap {
  /** Map of component names to their ranges */
  [component: string]: RangeIndex[];
}

/**
 * Generates range indices for manifest components
 */
export class RangeIndexGenerator {
  private static readonly MAX_CONTENT_LENGTH = 10000000; // 10MB
  private static readonly MAX_INDICES_PER_COMPONENT = 10000;
  private static readonly MAX_COMPONENTS = 1000;
  
  private indices: Map<string, RangeIndex[]> = new Map();
  private content: string;

  constructor(content: string) {
    if (typeof content !== 'string') {
      throw new Error('Content must be a string');
    }
    
    if (content.length > RangeIndexGenerator.MAX_CONTENT_LENGTH) {
      throw new Error('Content too large for indexing');
    }
    
    this.content = content;
    this.generateAllIndices();
  }

  /**
   * Generate range index for a specific component
   */
  generateIndex(component: string, pattern: RegExp): RangeIndex[] {
    if (!component || typeof component !== 'string') {
      throw new Error('Component name must be a non-empty string');
    }
    
    if (!(pattern instanceof RegExp)) {
      throw new Error('Pattern must be a RegExp');
    }
    
    if (this.indices.size >= RangeIndexGenerator.MAX_COMPONENTS) {
      throw new Error('Maximum number of components exceeded');
    }

    const componentIndices: RangeIndex[] = [];
    let match;

    // Reset regex lastIndex to ensure consistent behavior
    pattern.lastIndex = 0;

    while ((match = pattern.exec(this.content)) !== null) {
      if (componentIndices.length >= RangeIndexGenerator.MAX_INDICES_PER_COMPONENT) {
        break;
      }
      
      const startIndex = match.index;
      if (startIndex === undefined) continue;
      
      const endIndex = startIndex + match[0].length;

      // Validate indices are within bounds
      if (startIndex < 0 || endIndex > this.content.length || startIndex > endIndex) {
        continue;
      }

      componentIndices.push({
        start: startIndex,
        end: endIndex,
        type: 'byte',
        component,
        metadata: {
          match: match[0],
          groups: match.slice(1)
        }
      });
    }

    this.indices.set(component, componentIndices);
    return componentIndices;
  }

  /**
   * Get range indices for a component
   */
  getIndices(component: string): RangeIndex[] {
    if (!component || typeof component !== 'string') {
      throw new Error('Component name must be a non-empty string');
    }
    
    return this.indices.get(component) || [];
  }

  /**
   * Get all range indices
   */
  getAllIndices(): RangeIndexMap {
    const result: RangeIndexMap = {};
    
    this.indices.forEach((indices, component) => {
      result[component] = [...indices]; // Return copy to prevent mutation
    });

    return result;
  }

  /**
   * Find component at position
   */
  findComponentAtPosition(position: number): { component: string; index: RangeIndex } | null {
    if (typeof position !== 'number' || position < 0 || position > this.content.length) {
      throw new Error('Position must be a valid number within content bounds');
    }
    
    let result: { component: string; index: RangeIndex } | null = null;
    
    this.indices.forEach((indices, component) => {
      if (result) return; // Already found
      
      for (const index of indices) {
        if (position >= index.start && position <= index.end) {
          result = { component, index };
          return;
        }
      }
    });

    return result;
  }

  /**
   * Validate range indices
   */
  validateIndices(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const contentLength = this.content.length;

    this.indices.forEach((indices, component) => {
      for (let i = 0; i < indices.length; i++) {
        const index = indices[i];
        if (!index) continue;

        // Check bounds
        if (index.start < 0 || index.end > contentLength) {
          errors.push(`${component}[${i}]: Index out of bounds (${index.start}-${index.end}, content length: ${contentLength})`);
        }

        // Check start <= end
        if (index.start > index.end) {
          errors.push(`${component}[${i}]: Start index (${index.start}) greater than end index (${index.end})`);
        }

        // Check for overlaps with previous indices
        if (i > 0) {
          const prevIndex = indices[i - 1];
          if (prevIndex && index.start < prevIndex.end) {
            errors.push(`${component}[${i}]: Overlaps with previous index (${prevIndex.start}-${prevIndex.end})`);
          }
        }

        // Validate component name
        if (index.component !== component) {
          errors.push(`${component}[${i}]: Component mismatch (${index.component} vs ${component})`);
        }
      }
    });

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Generate indices for all common C2PA components
   */
  private generateAllIndices(): void {
    // Generate indices for manifest components
    this.generateIndex('manifest_hash', /"manifest_hash":\s*"([^"]+)"/g);
    this.generateIndex('claim_generator', /"claim_generator":\s*"([^"]+)"/g);
    this.generateIndex('timestamp', /"timestamp":\s*"([^"]+)"/g);
    this.generateIndex('assertions', /"assertions":\s*\[/g);
    this.generateIndex('ingredients', /"ingredients":\s*\[/g);
    this.generateIndex('redactions', /"redactions":\s*\[/g);
    
    // Generate indices for signature components
    this.generateIndex('signature', /"signature":\s*"([^"]+)"/g);
    this.generateIndex('algorithm', /"alg":\s*"([^"]+)"/g);
    this.generateIndex('certificate_chain', /"certificate_chain":\s*\[/g);
    
    // Generate indices for assertion types
    this.generateIndex('c2pa_actions', /"label":\s*"c2pa\.actions"/g);
    this.generateIndex('c2pa_hashed_uri', /"hashed_uri":\s*"([^"]+)"/g);
    this.generateIndex('c2pa_data', /"data":\s*\{/g);
  }

  /**
   * Convert byte indices to character indices
   */
  convertToCharacterIndices(): void {
    const charIndices: Map<string, RangeIndex[]> = new Map();

    this.indices.forEach((indices, component) => {
      const convertedIndices: RangeIndex[] = [];

      for (const index of indices) {
        const startChar = this.content.substring(0, index.start).length;
        const endChar = this.content.substring(0, index.end).length;

        convertedIndices.push({
          ...index,
          start: startChar,
          end: endChar,
          type: 'character'
        });
      }

      charIndices.set(component, convertedIndices);
    });

    this.indices = charIndices;
  }

  /**
   * Convert byte indices to line indices
   */
  convertToLineIndices(): void {
    const lineIndices: Map<string, RangeIndex[]> = new Map();

    this.indices.forEach((indices, component) => {
      const convertedIndices: RangeIndex[] = [];

      for (const index of indices) {
        const startLine = this.getLineNumber(index.start);
        const endLine = this.getLineNumber(index.end);

        convertedIndices.push({
          ...index,
          start: startLine,
          end: endLine,
          type: 'line'
        });
      }

      lineIndices.set(component, convertedIndices);
    });

    this.indices = lineIndices;
  }

  /**
   * Get line number for byte position
   */
  private getLineNumber(bytePosition: number): number {
    if (bytePosition < 0 || bytePosition > this.content.length) {
      throw new Error('Byte position out of bounds');
    }
    
    const text = this.content.substring(0, bytePosition);
    return text.split('\n').length;
  }

  /**
   * Extract content for a range index
   */
  extractContent(index: RangeIndex): string {
    this.validateRangeIndex(index);
    return this.content.substring(index.start, index.end);
  }

  /**
   * Validate a single range index
   */
  private validateRangeIndex(index: RangeIndex): void {
    if (!index || typeof index !== 'object') {
      throw new Error('Invalid range index: must be an object');
    }
    
    if (typeof index.start !== 'number' || typeof index.end !== 'number') {
      throw new Error('Invalid range index: start and end must be numbers');
    }
    
    if (index.start < 0 || index.end > this.content.length || index.start > index.end) {
      throw new Error('Invalid range index: out of bounds or invalid range');
    }
    
    if (!['byte', 'character', 'line'].includes(index.type)) {
      throw new Error('Invalid range index: invalid type');
    }
    
    if (!index.component || typeof index.component !== 'string') {
      throw new Error('Invalid range index: component must be a non-empty string');
    }
  }

  /**
   * Merge overlapping indices
   */
  mergeOverlappingIndices(): void {
    const mergedIndices: Map<string, RangeIndex[]> = new Map();
    
    this.indices.forEach((indices, component) => {
      if (indices.length === 0) {
        mergedIndices.set(component, []);
        return;
      }

      const sortedIndices = [...indices].sort((a, b) => a.start - b.start);
      const merged: RangeIndex[] = [];
      
      for (const index of sortedIndices) {
        if (merged.length === 0) {
          merged.push({ ...index });
          continue;
        }
        
        const last = merged[merged.length - 1];
        if (!last) continue;
        
        if (index.start <= last.end) {
          // Overlapping or adjacent - merge them
          last.end = Math.max(last.end, index.end);
        } else {
          // No overlap - add new index
          merged.push({ ...index });
        }
      }
      
      mergedIndices.set(component, merged);
    });
    
    this.indices = mergedIndices;
  }

  /**
   * Filter indices by type
   */
  filterByType(type: 'byte' | 'character' | 'line'): RangeIndexMap {
    if (!['byte', 'character', 'line'].includes(type)) {
      throw new Error('Invalid index type');
    }
    
    const result: RangeIndexMap = {};

    this.indices.forEach((indices, component) => {
      const filtered = indices.filter(index => index.type === type);
      if (filtered.length > 0) {
        result[component] = filtered;
      }
    });

    return result;
  }

  /**
   * Get statistics about the indices
   */
  getStatistics(): {
    totalIndices: number;
    componentsIndexed: number;
    averageIndicesPerComponent: number;
    largestComponent: string;
    indexTypes: Record<string, number>;
  } {
    let totalIndices = 0;
    let largestComponent = '';
    let maxIndices = 0;
    const indexTypes: Record<string, number> = {};

    this.indices.forEach((indices, component) => {
      totalIndices += indices.length;
      
      if (indices.length > maxIndices) {
        maxIndices = indices.length;
        largestComponent = component;
      }

      // Count index types
      for (const index of indices) {
        indexTypes[index.type] = (indexTypes[index.type] || 0) + 1;
      }
    });

    return {
      totalIndices,
      componentsIndexed: this.indices.size,
      averageIndicesPerComponent: this.indices.size > 0 ? totalIndices / this.indices.size : 0,
      largestComponent,
      indexTypes
    };
  }

  /**
   * Export indices to JSON
   */
  exportToJSON(): string {
    const data = this.getAllIndices();
    return JSON.stringify(data, null, 2);
  }

  /**
   * Import indices from JSON
   */
  static importFromJSON(json: string): RangeIndexGenerator {
    if (!json || typeof json !== 'string') {
      throw new Error('JSON must be a non-empty string');
    }
    
    let data: RangeIndexMap;
    try {
      data = JSON.parse(json);
    } catch (error) {
      throw new Error('Invalid JSON format');
    }
    
    const generator = new RangeIndexGenerator('');
    
    // Clear existing indices
    generator.indices.clear();

    // Import indices from data
    for (const [component, indices] of Object.entries(data)) {
      if (!Array.isArray(indices)) {
        throw new Error(`Invalid indices for component ${component}: must be an array`);
      }
      generator.indices.set(component, indices);
    }

    return generator;
  }

  /**
   * Validate timestamp format in range indices
   */
  static validateTimestamp(timestamp: string): boolean {
    if (!timestamp || typeof timestamp !== 'string') {
      return false;
    }
    
    const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
    return iso8601Regex.test(timestamp);
  }

  /**
   * Generate hash for range index content
   */
  generateHashForIndex(index: RangeIndex, algorithm: 'sha256' | 'sha384' | 'sha512' = 'sha256'): string {
    this.validateRangeIndex(index);
    
    if (!['sha256', 'sha384', 'sha512'].includes(algorithm)) {
      throw new Error('Invalid hash algorithm');
    }
    
    const content = this.extractContent(index);
    return createHash(algorithm).update(content, 'utf8').digest('hex');
  }
}
