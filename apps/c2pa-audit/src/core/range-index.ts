/**
 * Range Index Generator
 * Generates and manages range indices for C2PA manifest components
 */

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
  private indices: Map<string, RangeIndex[]> = new Map();
  private content: string;

  constructor(content: string) {
    this.content = content;
    this.generateAllIndices();
  }

  /**
   * Generate range index for a specific component
   */
  generateIndex(component: string, pattern: RegExp): RangeIndex[] {
    const componentIndices: RangeIndex[] = [];
    let match;

    while ((match = pattern.exec(this.content)) !== null) {
      const startIndex = match.index;
      const endIndex = startIndex + match[0].length;

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
    return this.indices.get(component) || [];
  }

  /**
   * Get all range indices
   */
  getAllIndices(): RangeIndexMap {
    const result: RangeIndexMap = {};
    
    this.indices.forEach((indices, component) => {
      result[component] = indices;
    });

    return result;
  }

  /**
   * Find component at position
   */
  findComponentAtPosition(position: number): { component: string; index: RangeIndex } | null {
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
    const text = this.content.substring(0, bytePosition);
    return text.split('\n').length;
  }

  /**
   * Extract content for a range index
   */
  extractContent(index: RangeIndex): string {
    return this.content.substring(index.start, index.end);
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

      const merged: RangeIndex[] = [];
      const firstIndex = indices[0];
      if (!firstIndex) {
        mergedIndices.set(component, []);
        return;
      }

      let current: RangeIndex = {
        start: firstIndex.start,
        end: firstIndex.end,
        type: firstIndex.type,
        component: firstIndex.component,
        ...(firstIndex.metadata && { metadata: firstIndex.metadata })
      };

      for (let i = 1; i < indices.length; i++) {
        const next = indices[i];
        if (!next) continue;

        if (next.start <= current.end) {
          // Overlapping or adjacent - merge them
          current.end = Math.max(current.end, next.end);
        } else {
          // No overlap - add current and start new
          merged.push(current);
          current = {
            start: next.start,
            end: next.end,
            type: next.type,
            component: next.component,
            ...(next.metadata && { metadata: next.metadata })
          };
        }
      }

      merged.push(current);
      mergedIndices.set(component, merged);
    });
    
    this.indices = mergedIndices;
  }

  /**
   * Filter indices by type
   */
  filterByType(type: 'byte' | 'character' | 'line'): RangeIndexMap {
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
    const data = JSON.parse(json);
    const generator = new RangeIndexGenerator('');
    
    // Clear existing indices
    generator.indices.clear();

    // Import indices from data
    for (const [component, indices] of Object.entries(data)) {
      generator.indices.set(component, indices as RangeIndex[]);
    }

    return generator;
  }

  /**
   * Validate timestamp format in range indices
   */
  static validateTimestamp(timestamp: string): boolean {
    const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
    return iso8601Regex.test(timestamp);
  }

  /**
   * Generate hash for range index content
   */
  generateHashForIndex(index: RangeIndex, algorithm: 'sha256' | 'sha384' | 'sha512' = 'sha256'): string {
    const content = this.extractContent(index);
    const crypto = require('crypto');
    return crypto.createHash(algorithm).update(content, 'utf8').digest('hex');
  }
}
