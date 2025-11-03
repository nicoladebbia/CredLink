/**
 * Range Index Generator
 * Generates and manages range indices for C2PA manifest components
 * Enhanced with strict validation and security controls
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
export declare class RangeIndexGenerator {
    private static readonly MAX_CONTENT_LENGTH;
    private static readonly MAX_INDICES_PER_COMPONENT;
    private static readonly MAX_COMPONENTS;
    private indices;
    private content;
    constructor(content: string);
    /**
     * Generate range index for a specific component
     */
    generateIndex(component: string, pattern: RegExp): RangeIndex[];
    /**
     * Get range indices for a component
     */
    getIndices(component: string): RangeIndex[];
    /**
     * Get all range indices
     */
    getAllIndices(): RangeIndexMap;
    /**
     * Find component at position
     */
    findComponentAtPosition(position: number): {
        component: string;
        index: RangeIndex;
    } | null;
    /**
     * Validate range indices
     */
    validateIndices(): {
        valid: boolean;
        errors: string[];
    };
    /**
     * Generate indices for all common C2PA components
     */
    private generateAllIndices;
    /**
     * Convert byte indices to character indices
     */
    convertToCharacterIndices(): void;
    /**
     * Convert byte indices to line indices
     */
    convertToLineIndices(): void;
    /**
     * Get line number for byte position
     */
    private getLineNumber;
    /**
     * Extract content for a range index
     */
    extractContent(index: RangeIndex): string;
    /**
     * Validate a single range index
     */
    private validateRangeIndex;
    /**
     * Merge overlapping indices
     */
    mergeOverlappingIndices(): void;
    /**
     * Filter indices by type
     */
    filterByType(type: 'byte' | 'character' | 'line'): RangeIndexMap;
    /**
     * Get statistics about the indices
     */
    getStatistics(): {
        totalIndices: number;
        componentsIndexed: number;
        averageIndicesPerComponent: number;
        largestComponent: string;
        indexTypes: Record<string, number>;
    };
    /**
     * Export indices to JSON
     */
    exportToJSON(): string;
    /**
     * Import indices from JSON
     */
    static importFromJSON(json: string): RangeIndexGenerator;
    /**
     * Validate timestamp format in range indices
     */
    static validateTimestamp(timestamp: string): boolean;
    /**
     * Generate hash for range index content
     */
    generateHashForIndex(index: RangeIndex, algorithm?: 'sha256' | 'sha384' | 'sha512'): string;
}
//# sourceMappingURL=range-index.d.ts.map