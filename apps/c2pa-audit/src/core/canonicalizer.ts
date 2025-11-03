/**
 * JSON Canonicalization (JCS - RFC 8785)
 * Implements RFC 8785 for stable JSON hashing and comparison
 */

import { createHash } from 'crypto';

/**
 * Canonicalizes JSON according to RFC 8785 (JSON Canonicalization Scheme)
 * This ensures consistent serialization for hashing and diff operations
 */
export class JSONCanonicalizer {
  /**
   * Canonicalize a JSON value and return the canonical string
   * @param value - JSON value to canonicalize
   * @returns Canonical JSON string
   */
  static canonicalize(value: unknown): string {
    if (value === undefined) {
      throw new Error('Cannot canonicalize undefined value');
    }
    
    try {
      return this.canonicalizeValue(value);
    } catch (error) {
      throw new Error(`Canonicalization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Canonicalize and hash a JSON value
   * @param value - JSON value to canonicalize and hash
   * @param algorithm - Hash algorithm (default: sha256)
   * @returns Hex-encoded hash of canonical JSON
   */
  static canonicalizeAndHash(value: unknown, algorithm: string = 'sha256'): string {
    const validAlgorithms = ['sha256', 'sha384', 'sha512'];
    if (!validAlgorithms.includes(algorithm)) {
      throw new Error(`Invalid hash algorithm: ${algorithm}. Must be one of: ${validAlgorithms.join(', ')}`);
    }

    try {
      const canonical = this.canonicalize(value);
      return createHash(algorithm).update(canonical, 'utf8').digest('hex');
    } catch (error) {
      throw new Error(`Hash generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Canonicalize a JSON value recursively
   * @param value - JSON value to canonicalize
   * @returns Canonical JSON string representation
   */
  private static canonicalizeValue(value: unknown): string {
    if (value === null) {
      return 'null';
    }

    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }

    if (typeof value === 'number') {
      return this.canonicalizeNumber(value);
    }

    if (typeof value === 'string') {
      return this.canonicalizeString(value);
    }

    if (Array.isArray(value)) {
      return this.canonicalizeArray(value);
    }

    if (typeof value === 'object' && value !== null) {
      return this.canonicalizeObject(value as Record<string, unknown>);
    }

    throw new Error(`Cannot canonicalize value of type ${typeof value}`);
  }

  /**
   * Canonicalize a number according to RFC 8785
   * @param num - Number to canonicalize
   * @returns Canonical number string
   */
  private static canonicalizeNumber(num: number): string {
    // Handle special cases
    if (!isFinite(num)) {
      throw new Error('Cannot canonicalize non-finite numbers');
    }

    // Convert to string and validate format
    const str = num.toString();
    
    // RFC 8785 requires numbers to be in the shortest possible form
    // JavaScript's toString() already produces the shortest form
    return str;
  }

  /**
   * Canonicalize a string according to RFC 8785
   * @param str - String to canonicalize
   * @returns Canonical string with proper escaping
   */
  private static canonicalizeString(str: string): string {
    // Escape the string according to JSON rules
    let escaped = '"';
    
    for (let i = 0; i < str.length; i++) {
      const char = str[i];
      const code = char.charCodeAt(0);
      
      switch (char) {
        case '"':
          escaped += '\\"';
          break;
        case '\\':
          escaped += '\\\\';
          break;
        case '\b':
          escaped += '\\b';
          break;
        case '\f':
          escaped += '\\f';
          break;
        case '\n':
          escaped += '\\n';
          break;
        case '\r':
          escaped += '\\r';
          break;
        case '\t':
          escaped += '\\t';
          break;
        default:
          if (code < 0x20) {
            // Control characters must be escaped
            escaped += '\\u' + code.toString(16).padStart(4, '0');
          } else {
            escaped += char;
          }
      }
    }
    
    escaped += '"';
    return escaped;
  }

  /**
   * Canonicalize an array according to RFC 8785
   * @param arr - Array to canonicalize
   * @returns Canonical array string
   */
  private static canonicalizeArray(arr: unknown[]): string {
    const elements = arr.map(item => this.canonicalizeValue(item));
    return '[' + elements.join(',') + ']';
  }

  /**
   * Canonicalize an object according to RFC 8785
   * @param obj - Object to canonicalize
   * @returns Canonical object string
   */
  private static canonicalizeObject(obj: Record<string, unknown>): string {
    // Get all keys and sort them lexicographically
    const keys = Object.keys(obj).sort();
    
    if (keys.length === 0) {
      return '{}';
    }

    const members = keys.map(key => {
      const canonicalKey = this.canonicalizeString(key);
      const canonicalValue = this.canonicalizeValue(obj[key]);
      return canonicalKey + ':' + canonicalValue;
    });

    return '{' + members.join(',') + '}';
  }

  /**
   * Compare two JSON values for deep equality using canonicalization
   * @param a - First JSON value
   * @param b - Second JSON value
   * @returns True if values are deeply equal
   */
  static deepEqual(a: unknown, b: unknown): boolean {
    const canonicalA = this.canonicalize(a);
    const canonicalB = this.canonicalize(b);
    return canonicalA === canonicalB;
  }

  /**
   * Generate a deterministic hash for a JSON value
   * @param value - JSON value to hash
   * @param algorithm - Hash algorithm
   * @returns Hex-encoded hash
   */
  static hash(value: unknown, algorithm: string = 'sha256'): string {
    return this.canonicalizeAndHash(value, algorithm);
  }

  /**
   * Parse JSON string and canonicalize in one step
   * @param jsonString - JSON string to parse and canonicalize
   * @returns Canonical JSON string
   */
  static parseAndCanonicalize(jsonString: string): string {
    try {
      const parsed = JSON.parse(jsonString);
      return this.canonicalize(parsed);
    } catch (error) {
      throw new Error(`Invalid JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate that a string is properly canonicalized JSON
   * @param canonicalString - String to validate
   * @returns True if string is properly canonicalized
   */
  static validateCanonical(canonicalString: string): boolean {
    try {
      // Parse the canonical string
      const parsed = JSON.parse(canonicalString);
      
      // Re-canonicalize and compare
      const recanonicalized = this.canonicalize(parsed);
      
      return canonicalString === recanonicalized;
    } catch {
      return false;
    }
  }

  /**
   * Format a canonical string with pretty printing (for debugging)
   * Note: This is NOT canonical JSON, just for display purposes
   * @param canonicalString - Canonical JSON string
   * @param indent - Indentation spaces
   * @returns Pretty-printed JSON
   */
  static prettyPrint(canonicalString: string, indent: number = 2): string {
    try {
      const parsed = JSON.parse(canonicalString);
      return JSON.stringify(parsed, null, indent);
    } catch (error) {
      throw new Error(`Invalid JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
