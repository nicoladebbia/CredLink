/**
 * Secure Error Handler
 * Centralized error handling with security-focused sanitization
 */
export declare enum ErrorType {
    VALIDATION = "validation",
    SECURITY = "security",
    NETWORK = "network",
    SYSTEM = "system",
    CRYPTOGRAPHIC = "cryptographic",
    BUSINESS = "business"
}
export interface SecureError extends Error {
    type: ErrorType;
    code: string;
    details?: Record<string, unknown> | undefined;
    timestamp: string;
    sanitized: boolean;
}
export interface ErrorContext {
    requestId?: string;
    userId?: string;
    ip?: string;
    userAgent?: string;
    endpoint?: string;
    method?: string;
}
/**
 * Security-focused error handler with sanitization
 */
export declare class SecureErrorHandler {
    private static readonly MAX_ERROR_MESSAGE_LENGTH;
    private static readonly SENSITIVE_PATTERNS;
    /**
     * Create a secure error instance
     */
    createSecureError(message: string, type: ErrorType, code: string, details?: Record<string, unknown>): SecureError;
    /**
     * Handle and process errors securely
     */
    handleError(error: unknown, context?: ErrorContext): SecureError;
    /**
     * Setup global error handlers
     */
    setupGlobalErrorHandler(): void;
    /**
     * Normalize various error types to SecureError
     */
    private normalizeError;
    /**
     * Check if error is already a SecureError
     */
    private isSecureError;
    /**
     * Determine error type from error characteristics
     */
    private getErrorType;
    /**
     * Generate error code from error
     */
    private getErrorCode;
    /**
     * Sanitize error message to prevent information disclosure
     */
    private sanitizeErrorMessage;
    /**
     * Sanitize error details to remove sensitive information
     */
    private sanitizeErrorDetails;
    /**
     * Log error securely
     */
    private logError;
    /**
     * Sanitize context information
     */
    private sanitizeContext;
    /**
     * Create validation error
     */
    createValidationError(message: string, field?: string): SecureError;
    /**
     * Create security error
     */
    createSecurityError(message: string, details?: Record<string, unknown>): SecureError;
    /**
     * Create network error
     */
    createNetworkError(message: string, statusCode?: number): SecureError;
    /**
     * Create cryptographic error
     */
    createCryptographicError(message: string, operation?: string): SecureError;
}
//# sourceMappingURL=error-handler.d.ts.map