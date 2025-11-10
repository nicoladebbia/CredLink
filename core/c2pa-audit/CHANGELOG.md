# Changelog

All notable changes to the C2PA Audit Tool will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2024-01-01

### Added
- **Core Functionality**
  - Semantic diff engine with spec-aware field comparison
  - RFC 6902 JSON Patch generation
  - RFC 7386 JSON Merge Patch generation
  - Recursive lineage reconstruction with validation
  - Evidence pack export for audit trails
  - Raw manifest extraction and viewing

- **Validation Engine**
  - Spec-compliant validation codes from C2PA 2.2
  - Signature validation with certificate chain verification
  - RFC 3161 timestamp validation
  - Assertion validation with redaction handling
  - Ingredient validation with recursive checks
  - Deep spec links for all validation codes

- **Security Features**
  - Comprehensive input validation and sanitization
  - SSRF protection with URL validation and IP blocking
  - XSS prevention with HTML sanitization and CSP
  - DoS protection with rate limiting and size limits
  - Path traversal protection
  - Request timeout controls
  - Security headers (CSP, HSTS, X-Frame-Options, etc.)
  - Secure file upload handling
  - Memory safety with bounded data structures

- **API Server**
  - Fastify-based HTTP API
  - CORS support with configurable origins
  - Multipart file upload support
  - Static file serving for UI
  - Comprehensive error handling
  - Security middleware integration
  - Rate limiting per IP
  - Request validation

- **CLI Interface**
  - Diff command for manifest comparison
  - Lineage command for graph analysis
  - Validate command for single manifest validation
  - Info command for manifest information
  - Open-raw command for manifest extraction
  - Colored output with chalk
  - Progress indicators with ora
  - File size validation
  - Format validation

- **Web UI**
  - Modern, responsive interface
  - Dual input modes (URL and file upload)
  - Real-time diff visualization
  - Interactive lineage graph
  - Tabbed interface for multiple formats
  - Error handling with detailed messages
  - Loading states and progress indicators
  - Security controls (XSS prevention, input validation)
  - CSP enforcement with nonce-based scripts

- **Testing**
  - Unit tests for all core modules
  - Acceptance tests for critical scenarios
  - Security tests for vulnerability detection
  - Integration tests for API endpoints
  - Coverage reporting with Vitest

- **Documentation**
  - Comprehensive README with examples
  - API reference documentation
  - Security policy (SECURITY.md)
  - Configuration examples (.env.example)
  - Code quality standards (.eslintrc, .prettierrc)

- **Development Tools**
  - TypeScript with strict mode
  - ESLint with security rules
  - Prettier for code formatting
  - Build script with validation
  - Security audit script
  - Git hooks for pre-commit checks

### Security
- **CRITICAL**: Added SSRF protection with private IP blocking
- **CRITICAL**: Added XSS prevention with HTML sanitization
- **CRITICAL**: Added DoS protection with rate limiting
- **CRITICAL**: Added path traversal protection
- **CRITICAL**: Added request timeout controls
- **CRITICAL**: Added file size validation (100MB limit)
- **CRITICAL**: Added input validation for all user inputs
- **CRITICAL**: Added security headers (CSP, HSTS, etc.)
- **CRITICAL**: Added nonce-based CSP for script execution
- **CRITICAL**: Added URL validation to prevent malicious requests

### Performance
- JCS canonicalization for stable hashing
- Efficient diff algorithms
- Parallel validation of assertions
- Memory-efficient data structures
- Lazy loading of non-critical data
- Caching of canonicalized manifests

### Changed
- Removed vulnerable `mime-types` dependency
- Implemented internal MIME type detection
- Enhanced error messages with context
- Improved TypeScript type safety
- Optimized build process

### Fixed
- ArrayBuffer handling in parser
- Buffer to ArrayBuffer conversion
- Null/undefined handling in validators
- Error propagation in async functions
- Memory leaks in recursive operations

## [Unreleased]

### Planned
- JUMBF parsing implementation
- Certificate revocation checking (OCSP/CRL)
- Advanced lineage visualization (DOT, Mermaid)
- Batch processing support
- WebSocket support for real-time updates
- Database integration for caching
- Metrics and monitoring integration
- Docker containerization
- Kubernetes deployment manifests

---

For security vulnerabilities, please see [SECURITY.md](./SECURITY.md) for reporting instructions.
