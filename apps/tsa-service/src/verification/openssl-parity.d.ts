/**
 * OpenSSL ts -verify Parity Tests
 * Ensures our validator matches OpenSSL behavior exactly
 * Note: This is designed for Node.js environments during testing
 */
import { TSAVerificationResult } from '../types/rfc3161.js';
export interface ParityTestCase {
    name: string;
    tokenData: string;
    imprintData: string;
    expectedStatus: 'valid' | 'invalid';
    expectedReason?: string;
    trustAnchor: string;
}
export interface ParityTestResult {
    testCase: string;
    ourResult: TSAVerificationResult;
    opensslResult: {
        valid: boolean;
        output: string;
        error?: string;
    };
    parity: boolean;
    differences: string[];
}
export declare class OpenSSLParityTester {
    private validator;
    private tempDir;
    constructor();
    /**
     * Run full parity test suite
     */
    runParityTests(): Promise<ParityTestResult[]>;
    /**
     * Run single parity test comparing our validator with OpenSSL
     * Note: Browser-compatible version without file system operations
     */
    runSingleParityTest(testCase: ParityTestCase): Promise<ParityTestResult>;
    /**
     * Run our RFC 3161 validator
     */
    private runOurValidator;
    /**
     * Mock OpenSSL validator for browser environment
     */
    private runOpenSSLValidatorMock;
    /**
     * Run OpenSSL ts -verify command (Node.js only)
     */
    private runOpenSSLValidator;
    /**
     * Compare our validator result with OpenSSL result
     */
    private compareResults;
    /**
     * Extract meaningful error from OpenSSL output
     */
    private extractOpenSSLError;
    /**
     * Check if error reasons are semantically equivalent
     */
    private errorReasonsMatch;
    /**
     * Generate comprehensive test cases
     */
    private generateTestCases;
    /**
     * Generate valid test token (mock implementation)
     */
    private generateValidToken;
    /**
     * Generate token with wrong policy
     */
    private generateTokenWithWrongPolicy;
    /**
     * Generate token without EKU
     */
    private generateTokenWithoutEKU;
    /**
     * Generate token with expired certificate
     */
    private generateTokenWithExpiredCert;
    /**
     * Get test trust anchor
     */
    private getTestTrustAnchor;
    /**
     * Cleanup temporary files (Node.js only - not used in browser version)
     */
    private cleanupFiles;
    /**
     * Generate parity test report
     */
    generateReport(results: ParityTestResult[]): {
        summary: {
            total: number;
            passed: number;
            failed: number;
            parity_rate: number;
        };
        failures: ParityTestResult[];
        recommendations: string[];
    };
}
//# sourceMappingURL=openssl-parity.d.ts.map