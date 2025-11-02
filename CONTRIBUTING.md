# Contributing to C2 Concierge

Thank you for your interest in contributing to C2 Concierge! This document provides guidelines and information for contributors.

## Getting Started

### Prerequisites

- Node.js 20+ 
- pnpm 9+
- ImageMagick (for sandbox operations)
- Git

### Setup

1. **Fork and Clone**
   ```bash
   git clone https://github.com/your-username/c2-concierge.git
   cd c2-concierge
   ```

2. **Install Dependencies**
   ```bash
   pnpm install
   ```

3. **Bootstrap Project**
   ```bash
   pnpm bootstrap
   ```

4. **Start Development**
   ```bash
   pnpm dev
   ```

## Development Workflow

### Branch Strategy

- `main` - Production-ready code
- `develop` - Integration branch
- `feature/*` - New features
- `fix/*` - Bug fixes
- `security/*` - Security fixes

### Commit Messages

Follow conventional commits:

```
type(scope): description

feat(acceptance): add new transform support
fix(sandbox): resolve memory leak in image processing
security(edge): add input validation for hostname
docs(readme): update installation instructions
```

### Code Standards

#### TypeScript
- Use strict TypeScript configuration
- Provide proper type annotations
- Avoid `any` types
- Use interfaces for object shapes

#### Security
- All inputs must be validated
- No hardcoded secrets
- Use parameterized queries
- Implement proper error handling

#### Testing
- Unit tests for all functions
- Integration tests for workflows
- Security tests for vulnerabilities
- Performance tests for critical paths

## Project Structure

```
c2-concierge/
├── packages/           # Shared libraries
│   ├── acceptance/     # Test harness
│   ├── policy/         # Policy engine
│   └── utils/          # Utilities
├── apps/               # Applications
│   ├── edge-worker/    # Cloudflare Worker
│   └── reportgen/      # Report generator
├── sandboxes/          # Test sandboxes
│   ├── strip-happy/    # Stripping CDN
│   ├── preserve-embed/ # Preserving CDN
│   └── remote-only/    # Remote-only CDN
├── scripts/            # Build/deployment scripts
├── docs/               # Documentation
└── .github/            # GitHub workflows
```

## Development Guidelines

### Security Requirements

1. **Input Validation**
   ```typescript
   // ✅ Good
   if (!isValidUrl(url)) {
     throw new Error('Invalid URL');
   }
   
   // ❌ Bad
   fetch(url); // No validation
   ```

2. **Error Handling**
   ```typescript
   // ✅ Good
   try {
     const result = await riskyOperation();
     return result;
   } catch (error) {
     console.error('Operation failed:', error);
     throw new Error('Safe error message');
   }
   ```

3. **Dependencies**
   - Always use specific versions
   - Regular security updates
   - Audit dependencies regularly

### Performance Requirements

- Request timeouts: 30 seconds max
- Memory limits: 512MB per process
- Response times: < 1 second for API calls
- Concurrent connections: 100 max

### Testing Requirements

```bash
# Run all tests
pnpm test

# Run acceptance tests
pnpm test:acceptance

# Run with coverage
pnpm test --coverage

# Security audit
pnpm audit
```

## Submitting Changes

### Pull Request Process

1. **Create Branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make Changes**
   - Follow coding standards
   - Add tests
   - Update documentation

3. **Test Changes**
   ```bash
   pnpm lint
   pnpm typecheck
   pnpm test
   ```

4. **Submit PR**
   - Clear title and description
   - Link to relevant issues
   - Include testing instructions

### Review Process

- Automated checks must pass
- Security review for sensitive changes
- Performance review for optimization changes
- Documentation review for API changes

## Security Contributions

### Vulnerability Disclosure

If you discover a security vulnerability:

1. **Do not** open a public issue
2. Email security@c2concierge.com
3. Include detailed reproduction steps
4. Allow time for remediation

### Security Features

When adding security features:

- Follow defense-in-depth principles
- Implement proper logging
- Add security tests
- Document threat model assumptions

## Community Guidelines

### Code of Conduct

- Be respectful and inclusive
- Welcome newcomers and help them learn
- Focus on constructive feedback
- Assume good intentions

### Communication

- Use GitHub issues for bugs and features
- Use discussions for questions and ideas
- Join our Discord for real-time chat
- Follow our security disclosure process

## Recognition

Contributors are recognized in:

- README.md contributors section
- Release notes
- Annual security report
- Conference presentations

## Getting Help

- **Documentation**: Check `/docs` folder
- **Issues**: Search existing GitHub issues
- **Discussions**: Ask questions in GitHub Discussions
- **Discord**: Join our community server
- **Email**: engineering@c2concierge.com

## License

By contributing, you agree that your contributions will be licensed under the same license as the project.

---

Thank you for contributing to C2 Concierge! Your help makes this project better for everyone.
