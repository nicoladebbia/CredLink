# Security Policy

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

The CredLink team takes security vulnerabilities seriously. We appreciate your efforts to responsibly disclose your findings.

If you discover a security vulnerability, please report it to us privately **before** disclosing it publicly.

### How to Report

- **Email**: security@credlink.com
- **PGP Key**: Available on request
- **Response Time**: We aim to respond within 48 hours

### What to Include

Please include the following information in your report:

- Type of vulnerability (e.g., XSS, RCE, SQL Injection, etc.)
- Steps to reproduce the vulnerability
- Potential impact of the vulnerability
- Any proof-of-concept code or screenshots (if applicable)

## Security Features

### Input Validation
- All user inputs are validated and sanitized
- Path traversal protection on file operations
- Command injection prevention in transform operations

### Authentication & Authorization
- HMAC-based signature verification for break-glass protocol
- Timing-safe comparison to prevent timing attacks
- Role-based access controls

### Network Security
- SSRF protection with hostname validation
- Request timeouts to prevent DoS attacks
- Rate limiting on all endpoints

### Data Protection
- Deterministic cryptographic hash generation
- Secure manifest handling with validation
- Content Security Policy headers

### Infrastructure Security
- Non-root container execution
- Security headers on all responses
- Regular dependency updates and vulnerability scanning

## Security Best Practices

### Development
- All code undergoes security review
- Automated security testing in CI/CD
- Dependency vulnerability scanning
- Static code analysis

### Deployment
- Container security scanning
- Minimal attack surface
- Secure configuration management
- Regular security updates

### Monitoring
- Security event logging
- Anomaly detection
- Performance monitoring for DoS protection
- Regular security audits

## Threat Model

### High-Risk Components
1. **Sandbox Servers** - Handle untrusted image transformations
2. **Edge Worker** - Processes external requests
3. **Acceptance Tests** - Execute external commands

### Mitigation Strategies
- Input validation and sanitization
- Sandboxing and isolation
- Rate limiting and timeouts
- Comprehensive error handling

### Trust Boundaries
- External network requests
- User-provided image files
- Transform operation arguments
- Environment variables and secrets

## Responsible Disclosure Program

We follow a responsible disclosure policy:

1. **Acknowledgment**: We'll acknowledge receipt of your report within 48 hours
2. **Assessment**: We'll assess and validate the vulnerability
3. **Remediation**: We'll work to fix the vulnerability in a timely manner
4. **Disclosure**: We'll coordinate public disclosure with you

### Recognition

Security researchers who responsibly disclose vulnerabilities will be:
- Recognized in our Hall of Fame
- Eligible for monetary rewards (based on severity)
- Invited to participate in our security beta program

## Security Contacts

- **Security Team**: security@credlink.com
- **Engineering Team**: engineering@credlink.com
- **PGP Key**: Available upon request

## License

This security policy is licensed under the Creative Commons Attribution 4.0 International License.
