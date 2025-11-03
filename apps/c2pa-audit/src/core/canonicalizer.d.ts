/**
 * JSON Canonicalizer
 * Implements RFC 8785 JSON Canonicalization Scheme for C2PA
 * Enhanced with strict validation and security controls
 */
export declare class JSONCanonicalizer {
    private static readonly MAX_NESTING_DEPTH;
    private static readonly MAX_STRING_LENGTH;
    private static readonly MAX_ARRAY_LENGTH;
    private static readonly MAX_OBJECT_KEYS;
    /**
     * Canonicalize a JSON object according to RFC 8785
     * @param obj - The JSON object to canonicalize
     * @returns Canonicalized JSON string
     */
    static canonicalize(obj: unknown): string;
    /**
     * Hash canonicalized data
     * @param data - Data to hash
     * @param algorithm - Hash algorithm to use
     * @returns Hex-encoded hash
     */
    static hash(data: string, algorithm: 'sha256' | 'sha384' | 'sha512'): string;
    /**
     * Canonicalize a value based on its type
     */
    private static canonicalizeValue;
    /**
     * Canonicalize a number according to RFC 8785
     */
    private static canonicalizeNumber;
    /**
     * Convert scientific notation to decimal
     */
    private static convertScientificToDecimal;
    /**
     * Canonicalize a string according to RFC 8785
     */
    private static canonicalizeString;
    /**
     * Canonicalize an array according to RFC 8785
     */
    private static canonicalizeArray;
    /**
     * Canonicalize an object according to RFC 8785
     */
    private static canonicalizeObject;
    /**
     * Validate that a string is properly canonicalized
     */
    static validateCanonicalized(original: unknown, canonicalized: string): boolean;
    /**
     * Generate hash URI for canonicalized data
     */
    static generateHashURI(data: unknown, algorithm?: 'sha256' | 'sha384' | 'sha512'): string;
    /**
     * Compare two canonicalized strings
     */
    static compareCanonicalized(a: string, b: string): number;
    /**
     * Check if a value is canonicalizable
     */
    static isCanonicalizable(value: unknown): boolean;
    /**
     * Get the size of canonicalized data in bytes
     */
    static getCanonicalizedSize(value: unknown): number;
    /**
     * Create a deep clone of an object and canonicalize it
     */
    static deepCloneAndCanonicalize(value: unknown): unknown;
}
//# sourceMappingURL=canonicalizer.d.ts.map