/**
 * CRITICAL: Memory Security and Corruption Prevention
 *
 * This module prevents memory corruption vulnerabilities including:
 * - Buffer overflow attacks
 * - Heap spraying techniques
 * - Use-after-free vulnerabilities
 * - Memory exhaustion DoS attacks
 * - Type confusion attacks
 */
interface MemoryLimits {
    maxBufferSize: number;
    maxArraySize: number;
    maxStringSize: number;
    maxConcurrentBuffers: number;
}
declare class MemorySecurityManager {
    private static readonly LIMITS;
    private static activeBuffers;
    private static cleanupInterval;
    static initialize(): void;
    /**
     * CRITICAL: Validate buffer size to prevent overflow attacks
     */
    static validateBufferSize(buffer: Buffer | Uint8Array, source: string): void;
    /**
     * CRITICAL: Safe buffer creation with size limits
     */
    static createSafeBuffer(size: number, source: string): Buffer;
    /**
     * CRITICAL: Prevent array-based attacks
     */
    static validateArraySize<T>(array: T[], source: string): void;
    /**
     * CRITICAL: String length validation to prevent memory exhaustion
     */
    static validateStringLength(str: string, source: string): void;
    /**
     * CRITICAL: Safe JSON parsing with memory limits
     */
    static safeJsonParse(json: string, source: string): any;
    /**
     * CRITICAL: Prevent deep object attacks
     */
    private static validateObjectDepth;
    /**
     * CRITICAL: Heap spraying protection
     */
    static detectHeapSpraying(): void;
    /**
     * CRITICAL: Memory usage monitoring
     */
    static monitorMemoryUsage(): void;
    /**
     * CRITICAL: Safe buffer operations
     */
    static safeBufferCopy(dest: Buffer | Uint8Array, src: Buffer | Uint8Array, source: string): void;
    /**
     * CRITICAL: Prevent use-after-free with buffer tracking
     */
    static trackBuffer(buffer: Buffer | Uint8Array, source: string): void;
    /**
     * CRITICAL: Safe buffer cleanup
     */
    static releaseBuffer(buffer: Buffer | Uint8Array): void;
    /**
     * CRITICAL: Memory pressure detection
     */
    static checkMemoryPressure(): boolean;
    /**
     * CRITICAL: Create memory-safe manifest processor
     */
    static createManifestProcessor(): {
        process: (data: Uint8Array, source: string) => {
            hash: string;
            size: number;
            processed: Uint8Array<ArrayBuffer>;
        };
    };
    /**
     * Cleanup resources
     */
    static shutdown(): void;
}
export { MemorySecurityManager };
export type { MemoryLimits };
//# sourceMappingURL=memory-security.d.ts.map