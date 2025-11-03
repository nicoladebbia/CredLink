/**
 * JSON Canonicalizer
 * Implements RFC 8785 JSON Canonicalization Scheme for C2PA
 */

export class JSONCanonicalizer {
  /**
   * Canonicalize a JSON object according to RFC 8785
   * @param obj - The JSON object to canonicalize
   * @returns Canonicalized JSON string
   */
  static canonicalize(obj: unknown): string {
    return this.canonicalizeValue(obj);
  }

  /**
   * Hash canonicalized data
   * @param data - Data to hash
   * @param algorithm - Hash algorithm to use
   * @returns Hex-encoded hash
   */
  static hash(data: string, algorithm: 'sha256' | 'sha384' | 'sha512'): string {
    const crypto = require('crypto');
    return crypto.createHash(algorithm).update(data, 'utf8').digest('hex');
  }

  /**
   * Canonicalize a value based on its type
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

    if (typeof value === 'object') {
      return this.canonicalizeObject(value as Record<string, unknown>);
    }

    throw new Error(`Unsupported type: ${typeof value}`);
  }

  /**
   * Canonicalize a number according to RFC 8785
   */
  private static canonicalizeNumber(num: number): string {
    if (!isFinite(num)) {
      throw new Error('Numbers must be finite');
    }

    // Handle integer and floating point numbers
    if (Number.isInteger(num)) {
      return num.toString();
    }

    // For floating point numbers, ensure consistent formatting
    const str = num.toString();
    
    // Check if the number is in scientific notation
    if (str.includes('e')) {
      // Convert to decimal representation
      return this.convertScientificToDecimal(str);
    }

    return str;
  }

  /**
   * Convert scientific notation to decimal
   */
  private static convertScientificToDecimal(scientific: string): string {
    const parts = scientific.toLowerCase().split('e');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      return scientific;
    }

    const mantissa = parts[0];
    const exponentStr = parts[1];
    const exponent = parseInt(exponentStr, 10);

    if (exponent === 0) {
      return mantissa;
    }

    const mantissaParts = mantissa.split('.');
    const integerPart = mantissaParts[0] || '';
    const fractionalPart = mantissaParts[1] || '';

    if (exponent > 0) {
      // Move decimal point to the right
      const totalDigits = integerPart.length + fractionalPart.length;
      const targetLength = integerPart.length + exponent;

      if (targetLength <= totalDigits) {
        // Move decimal point within existing digits
        const newIntegerPart = integerPart + fractionalPart.substring(0, exponent);
        const newFractionalPart = fractionalPart.substring(exponent);
        return newFractionalPart ? `${newIntegerPart}.${newFractionalPart}` : newIntegerPart;
      } else {
        // Need to add zeros
        const zerosToAdd = targetLength - totalDigits;
        const newIntegerPart = integerPart + fractionalPart + '0'.repeat(zerosToAdd);
        return newIntegerPart;
      }
    } else {
      // Move decimal point to the left
      const absExponent = Math.abs(exponent);
      const zerosNeeded = absExponent - integerPart.length;

      if (zerosNeeded > 0) {
        // Need to add zeros before the integer part
        const newIntegerPart = '0';
        const newFractionalPart = '0'.repeat(zerosNeeded - 1) + integerPart + fractionalPart;
        return `${newIntegerPart}.${newFractionalPart}`;
      } else {
        // Move decimal point within integer part
        const splitPos = integerPart.length - absExponent;
        const newIntegerPart = integerPart.substring(0, splitPos);
        const newFractionalPart = integerPart.substring(splitPos) + fractionalPart;
        return `${newIntegerPart}.${newFractionalPart}`;
      }
    }
  }

  /**
   * Canonicalize a string according to RFC 8785
   */
  private static canonicalizeString(str: string): string {
    // Escape special characters
    let escaped = '';
    for (let i = 0; i < str.length; i++) {
      const char = str[i];
      const codePoint = char ? char.codePointAt(0) : 0;

      if (!codePoint || codePoint < 0x20) {
        // Control characters must be escaped
        escaped += `\\u${(codePoint || 0).toString(16).padStart(4, '0')}`;
      } else if (codePoint === 0x22) {
        escaped += '\\"';
      } else if (codePoint === 0x5C) {
        escaped += '\\\\';
      } else {
        escaped += char;
      }
    }

    return `"${escaped}"`;
  }

  /**
   * Canonicalize an array according to RFC 8785
   */
  private static canonicalizeArray(arr: unknown[]): string {
    const elements = arr.map(item => this.canonicalizeValue(item));
    return `[${elements.join(',')}]`;
  }

  /**
   * Canonicalize an object according to RFC 8785
   */
  private static canonicalizeObject(obj: Record<string, unknown>): string {
    // Get all keys and sort them lexicographically by code point
    const keys = Object.keys(obj).sort((a, b) => {
      // Compare strings by their UTF-16 code units
      const lenA = a.length;
      const lenB = b.length;
      const minLen = Math.min(lenA, lenB);

      for (let i = 0; i < minLen; i++) {
        const codeA = a.charCodeAt(i);
        const codeB = b.charCodeAt(i);
        
        if (codeA !== codeB) {
          return codeA - codeB;
        }
      }

      return lenA - lenB;
    });

    // Canonicalize each key-value pair
    const pairs = keys.map(key => {
      const canonicalKey = this.canonicalizeString(key);
      const canonicalValue = this.canonicalizeValue(obj[key]);
      return `${canonicalKey}:${canonicalValue}`;
    });

    return `{${pairs.join(',')}}`;
  }

  /**
   * Validate that a string is properly canonicalized
   */
  static validateCanonicalized(original: unknown, canonicalized: string): boolean {
    try {
      const reCanonicalized = this.canonicalize(original);
      return reCanonicalized === canonicalized;
    } catch (error) {
      return false;
    }
  }

  /**
   * Generate hash URI for canonicalized data
   */
  static generateHashURI(data: unknown, algorithm: 'sha256' | 'sha384' | 'sha512' = 'sha256'): string {
    const canonicalized = this.canonicalize(data);
    const hash = this.hash(canonicalized, algorithm);
    return `hash://${algorithm}/${hash}`;
  }

  /**
   * Compare two canonicalized strings
   */
  static compareCanonicalized(a: string, b: string): number {
    if (a === b) return 0;
    return a < b ? -1 : 1;
  }

  /**
   * Check if a value is canonicalizable
   */
  static isCanonicalizable(value: unknown): boolean {
    if (value === null || typeof value === 'boolean' || typeof value === 'string') {
      return true;
    }

    if (typeof value === 'number') {
      return isFinite(value);
    }

    if (Array.isArray(value)) {
      return value.every(item => this.isCanonicalizable(item));
    }

    if (typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      const keys = Object.keys(obj);
      
      // Check that all keys are strings
      if (!keys.every(key => typeof key === 'string')) {
        return false;
      }

      // Check that all values are canonicalizable
      return Object.values(obj).every(val => this.isCanonicalizable(val));
    }

    return false;
  }

  /**
   * Get the size of canonicalized data in bytes
   */
  static getCanonicalizedSize(value: unknown): number {
    const canonicalized = this.canonicalize(value);
    return Buffer.byteLength(canonicalized, 'utf8');
  }

  /**
   * Create a deep clone of an object and canonicalize it
   */
  static deepCloneAndCanonicalize(value: unknown): unknown {
    if (value === null || typeof value !== 'object') {
      return value;
    }

    if (Array.isArray(value)) {
      return value.map(item => this.deepCloneAndCanonicalize(item));
    }

    const obj = value as Record<string, unknown>;
    const cloned: Record<string, unknown> = {};
    
    for (const [key, val] of Object.entries(obj)) {
      cloned[key] = this.deepCloneAndCanonicalize(val);
    }

    return cloned;
  }
}
