# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.0] - 2025-01-01

### Added
- Initial release of CredLink SDK for JavaScript/TypeScript
- Full TypeScript support with generated types from OpenAPI specification
- HTTP client with automatic retries and exponential backoff
- Circuit breaker implementation for resilience
- Comprehensive error handling with actionable hints
- Optional OpenTelemetry telemetry integration
- Streaming support for batch operations
- Idempotency key support for safe retries
- Complete API coverage for all CredLink endpoints

### Features
- Asset verification by URL or direct content
- Page verification with asset discovery
- Batch verification with parallel processing
- Link injection for HTML manifest discovery
- Folder signing with RFC-3161 timestamps
- Manifest storage and retrieval
- Job status monitoring

### Development
- Rollup-based build system with CommonJS and ES modules
- Comprehensive test suite with Jest
- ESLint and Prettier configuration
- TypeScript strict mode enabled
- Full documentation and examples

### Security
- Input validation and sanitization
- Secure API key handling
- Timeout enforcement
- HTTPS-only communication

## [Unreleased]

### Planned
- Additional language SDKs (Rust, Java, .NET)
- Advanced caching strategies
- GraphQL query support
- WebSocket streaming for real-time updates
