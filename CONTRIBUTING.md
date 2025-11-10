# Contributing to CredLink

Thank you for your interest in contributing to CredLink! This document provides guidelines and information for contributors.

## 🎯 Honesty Principles (READ FIRST)

**We are committed to radical transparency. Every contribution must follow these principles:**

### 1. Never Make Unmeasured Claims
- ❌ Don't claim "99.9% survival" without measurement
- ❌ Don't claim "fast" without benchmarks
- ❌ Don't claim "production ready" without deployment
- ✅ Use "target", "goal", or "planned" for future features
- ✅ Mark all claims with evidence or "unmeasured"

### 2. Be Honest About What Doesn't Work
- ❌ Don't hide broken features
- ❌ Don't write docs as if features exist when they don't
- ✅ Add warnings to broken features
- ✅ Clearly separate "works" from "planned"

### 3. No Vaporware Comparisons
- ❌ Don't compare our architecture to competitors' shipping products
- ❌ Don't claim we're "better" without proof
- ✅ Wait until we ship to make comparisons
- ✅ Compare fairly with measured data only

### 4. Report Dishonest Claims
If you find a dishonest claim:
1. Open an issue using `.github/ISSUE_TEMPLATE/honesty-report.md`
2. We'll fix it within 48 hours
3. See [APOLOGY.md](APOLOGY.md) for our commitment

---

## Getting Started

### Prerequisites

- Node.js 20+ 
- pnpm 9+
- ImageMagick (for sandbox operations)
- Git

### Setup

1. **Fork and Clone**
   ```bash
   git clone https://github.com/your-username/CredLink.git
   cd CredLink
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
CredLink/
├── core/               # Core services
│   ├── api-gw/         # API Gateway
│   ├── manifest-store/ # Manifest storage
│   ├── verify/         # Verification service
│   └── utils/          # Shared utilities
├── integrations/       # External integrations
│   ├── cms/            # CMS connectors
│   └── browser-extension/ # Browser extension
├── ui/                 # User interfaces
│   ├── admin/          # Admin dashboard
│   └── badge/          # Verification badge
├── tests/              # Test suites
│   ├── acceptance/     # Acceptance tests
│   └── gauntlet/       # CDN survival tests
├── sdk/                # SDKs
│   ├── python/         # Python SDK
│   ├── go/             # Go SDK
│   └── js/             # JavaScript SDK
├── cli/                # Command-line tool
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
2. Email security@credlink.com
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
- **Email**: engineering@credlink.com

## License

By contributing, you agree that your contributions will be licensed under the same license as the project.

---

Thank you for contributing to CredLink! Your help makes this project better for everyone.
