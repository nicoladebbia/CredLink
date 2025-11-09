# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2025-01-01

### Added
- Initial release of CredLink SDK for Go v2
- Full type safety with structs generated from OpenAPI specification
- Context-aware operations with proper timeout handling
- HTTP client with automatic retries and exponential backoff
- Circuit breaker implementation for resilience
- Comprehensive error handling with actionable hints
- Telemetry integration framework
- Streaming responses using Go channels
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
- Go 1.21+ support
- Comprehensive test suite with testify
- Standard library only for HTTP client
- Full documentation and examples
- Go idioms and best practices

### Security
- Input validation and bounds checking
- Secure API key handling
- Context-based timeout enforcement
- HTTPS-only communication
- Hash format validation

### Breaking Changes from v1
- Module path updated to `github.com/c2concierge/sdk-go/v2`
- Context parameter added to all client methods
- Error handling updated with structured error types
- Configuration options restructured for better type safety

## [Unreleased]

### Planned
- Additional language SDKs (Rust, Java, .NET)
- Advanced caching strategies
- GraphQL query support
- WebSocket streaming for real-time updates
