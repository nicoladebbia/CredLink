# Contributing to C2PA Audit Tool

Thank you for your interest in contributing to the C2PA Audit Tool! This document provides guidelines and instructions for contributing.

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment for all contributors.

## Getting Started

### Prerequisites

- Node.js 20.0.0 or higher
- pnpm (recommended) or npm
- Git
- TypeScript knowledge
- Familiarity with C2PA specification

### Development Setup

```bash
# Clone the repository
git clone https://github.com/Nickiller04/credlink.git
cd credlink/apps/c2pa-audit

# Install dependencies
pnpm install

# Run in development mode
pnpm dev

# Run tests
pnpm test

# Run linter
pnpm lint

# Format code
pnpm format
```

## Development Workflow

### 1. Create a Branch

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/your-bug-fix
```

### 2. Make Changes

- Write clean, readable code
- Follow TypeScript best practices
- Add tests for new functionality
- Update documentation as needed
- Follow existing code style

### 3. Test Your Changes

```bash
# Run all tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Run security tests
pnpm test:security

# Run linter
pnpm lint

# Type check
pnpm typecheck
```

### 4. Commit Your Changes

We use conventional commits for clear commit messages:

```bash
# Feature
git commit -m "feat: add new validation code support"

# Bug fix
git commit -m "fix: correct timestamp validation logic"

# Documentation
git commit -m "docs: update API reference"

# Security fix
git commit -m "security: patch XSS vulnerability in input handler"

# Performance improvement
git commit -m "perf: optimize canonicalization caching"

# Refactoring
git commit -m "refactor: simplify diff algorithm"

# Tests
git commit -m "test: add acceptance tests for redaction"
```

### 5. Push and Create Pull Request

```bash
git push origin feature/your-feature-name
```

Then create a pull request on GitHub with:
- Clear description of changes
- Reference to related issues
- Test results
- Screenshots (if UI changes)

## Code Standards

### TypeScript

- Use strict mode
- Avoid `any` type (use `unknown` instead)
- Provide explicit return types for functions
- Use interfaces for object shapes
- Document complex types

```typescript
// Good
interface ManifestDiff {
  base: ManifestInfo;
  target: ManifestInfo;
  changes: DiffChange[];
}

function generateDiff(base: C2PAManifest, target: C2PAManifest): ManifestDiff {
  // Implementation
}

// Avoid
function generateDiff(base: any, target: any): any {
  // Implementation
}
```

### Error Handling

- Always handle errors explicitly
- Provide meaningful error messages
- Use custom error types
- Include context in errors

```typescript
// Good
try {
  const manifest = await parseManifest(data);
} catch (error) {
  throw new ParsingError(
    `Failed to parse manifest: ${error instanceof Error ? error.message : 'Unknown error'}`,
    'manifest_parse_failed'
  );
}

// Avoid
try {
  const manifest = await parseManifest(data);
} catch (error) {
  throw error;
}
```

### Security

- Validate all user inputs
- Sanitize outputs
- Use parameterized queries
- Avoid dynamic code execution
- Implement rate limiting
- Add timeout controls
- Check file sizes
- Validate URLs

```typescript
// Good
function validateInput(input: string): boolean {
  if (!input || input.length > MAX_LENGTH) {
    return false;
  }
  if (containsMaliciousPatterns(input)) {
    return false;
  }
  return true;
}

// Avoid
function processInput(input: string): void {
  eval(input); // NEVER DO THIS
}
```

### Testing

- Write tests for all new features
- Maintain >80% code coverage
- Include edge cases
- Test error conditions
- Use descriptive test names

```typescript
// Good
describe('ManifestValidator', () => {
  describe('validateManifest', () => {
    it('should validate a well-formed manifest', async () => {
      const manifest = createValidManifest();
      const result = await ManifestValidator.validateManifest(manifest);
      expect(result.valid).toBe(true);
    });

    it('should reject manifest with invalid signature', async () => {
      const manifest = createInvalidSignatureManifest();
      const result = await ManifestValidator.validateManifest(manifest);
      expect(result.valid).toBe(false);
      expect(result.codes).toContain('signature.invalid');
    });
  });
});
```

### Documentation

- Document all public APIs
- Include JSDoc comments
- Provide usage examples
- Update README for new features
- Document breaking changes

```typescript
/**
 * Generate semantic diff between two C2PA manifests
 * 
 * @param base - Base manifest for comparison
 * @param target - Target manifest for comparison
 * @returns Semantic diff with spec-aware changes
 * @throws {Error} If manifests are invalid
 * 
 * @example
 * ```typescript
 * const diff = ManifestDiffer.generateSemanticDiff(baseManifest, targetManifest);
 * console.log(diff.assertions_added);
 * ```
 */
static generateSemanticDiff(base: C2PAManifest, target: C2PAManifest): SemanticDiff {
  // Implementation
}
```

## Pull Request Guidelines

### Before Submitting

- [ ] All tests pass
- [ ] Code is linted and formatted
- [ ] Documentation is updated
- [ ] Commit messages follow conventions
- [ ] No merge conflicts
- [ ] Security audit passes (for security changes)

### PR Description Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update
- [ ] Security fix

## Testing
Describe testing performed

## Checklist
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] No breaking changes (or documented)
- [ ] Security considerations addressed
```

## Security Vulnerabilities

**DO NOT** open public issues for security vulnerabilities.

Instead, please email security@c2pa-audit.tool with:
- Description of vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

See [SECURITY.md](./SECURITY.md) for full details.

## Feature Requests

For feature requests:
1. Check existing issues first
2. Open a new issue with "Feature Request" label
3. Describe the feature and use case
4. Discuss implementation approach

## Bug Reports

For bug reports:
1. Check existing issues first
2. Provide minimal reproduction
3. Include error messages
4. Specify environment details
5. Add steps to reproduce

## Questions

For questions:
- Check documentation first
- Search existing discussions
- Open a discussion (not an issue)
- Be specific and provide context

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

## Recognition

Contributors will be recognized in:
- CHANGELOG.md
- GitHub contributors page
- Release notes

Thank you for contributing to the C2PA Audit Tool!
