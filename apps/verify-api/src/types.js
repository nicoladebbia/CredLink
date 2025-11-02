/**
 * Verification API Types
 * Defines the core data structures for C2PA verification
 */
export class VerificationError extends Error {
    code;
    details;
    constructor(code, message, details) {
        super(message);
        this.code = code;
        this.details = details;
        this.name = 'VerificationError';
    }
}
//# sourceMappingURL=types.js.map