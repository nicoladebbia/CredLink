# C2PA Spec Watch System v1.1.0

**Phase 34 - Spec Watch & Contributions**

A comprehensive system for continuously tracking C2PA core specification changes, guidance updates, security notes, JUMBF container modifications, and upstream SDK deltas that affect remote-manifest survival, discovery order, and video semantics.

## 🎯 Purpose

The Spec Watch System provides automated detection, analysis, and contribution capabilities for C2PA specification evolution:

- **Continuous Monitoring**: Track specs, guidance, security notes, and SDK changes
- **Impact Analysis**: Run hostile gauntlet tests against 24 sentinel assets
- **Evidence-Based Contributions**: Generate reproducible issues/PRs with test vectors
- **Customer Communications**: Quarterly spec watch reports with actionable insights

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Content       │    │   Gauntlet       │    │   Issue/PR      │
│   Watcher       │───▶│   Test Runner    │───▶│   Generator     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Redis         │    │   Artifact       │    │   GitHub API    │
│   Storage       │    │   Storage        │    │   Integration   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 ▼
                    ┌─────────────────┐
                    │   Quarterly     │
                    │   Reporter      │
                    └─────────────────┘
```

## 📋 What We Track

### Core Specification Sources
- **C2PA Spec v2.2+**: HTML and PDF versions with hash comparison
- **Guidance Documents**: Implementation guidance and best practices
- **Security Considerations**: Validation lifetime, crypto algorithms
- **Public Issues/PRs**: Discovery, manifest store, video, soft binding topics
- **Upstream SDKs**: c2pa-rs, c2patool, CAI Verify changelogs
- **Conformance News**: Certification infrastructure and test suites

### Focus Areas (Non-negotiable)
1. **Discovery & Remote Manifests**: Link headers, soft bindings, manifest repositories
2. **Manifest Construction**: Claims, redactions, compression affecting survival
3. **Security Considerations**: Validation lifetime, cryptographic algorithms
4. **Video Semantics**: Device/player support, labels, UX expectations
5. **JUMBF Container**: Embedding/boxing rules
6. **SDK Deltas**: API changes, behavior modifications

## 🚀 Quick Start

### Prerequisites
- Node.js 20.0.0 or higher
- Redis server
- GitHub Personal Access Token
- C2PA toolchain (c2patool, CAI Verify)

### Installation

```bash
# Clone the repository
git clone https://github.com/Nickiller04/CredLink.git
cd CredLink/apps/c2pa-audit/phase34-spec-watch

# Install dependencies
npm install

# Copy environment configuration
cp .env.example .env

# Edit configuration
nano .env
```

### Configuration

Edit `.env` with your settings:

```bash
# GitHub Configuration
GITHUB_TOKEN=ghp_your_github_personal_access_token_here
GITHUB_OWNER=c2pa-org
GITHUB_REPO=specifications

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=1

# C2PA Tool Configuration
C2PATOOL_PATH=c2patool
VERIFY_TOOL_PATH=cai-verify

# Notification Configuration
EMAIL_RECIPIENTS=admin@example.com,team@example.com
```

### Running the System

```bash
# Build the system
npm run build

# Start development server
npm run dev

# Run in production
npm start

# Run manual watch cycle
npm run run-watch

# Generate quarterly report
npm run generate-report
```

## 🔧 Configuration

### Watch Targets

Configure watched sources in `src/config/watch-job.json`:

```json
{
  "targets": [
    {
      "id": "spec-html",
      "url": "https://c2pa.org/specifications/specifications/2.2/specs/C2PA_Specification.html",
      "type": "html",
      "interval": 24,
      "enabled": true
    },
    {
      "id": "spec-pdf",
      "url": "https://spec.c2pa.org/specifications/specifications/2.2/specs/_attachments/C2PA_Specification.pdf",
      "type": "pdf",
      "interval": 24,
      "enabled": true
    }
  ]
}
```

### Gauntlet Configuration

```json
{
  "gauntlet": {
    "enabled": true,
    "sentinel_assets": [
      "c2pa-demo-image-001",
      "c2pa-demo-video-001"
    ],
    "timeout_ms": 300000,
    "parallel_jobs": 4
  }
}
```

## 📊 API Endpoints

### Health & Status
- `GET /health` - System health check
- `GET /api/v1/status` - Detailed system status

### Watch Operations
- `POST /api/v1/watch/run` - Trigger manual watch cycle
- `GET /api/v1/changes` - Get recent specification changes
- `GET /api/v1/gauntlet/results` - Get gauntlet test results

### Reports
- `POST /api/v1/reports/quarterly` - Generate quarterly report

## 🧪 Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test suite
npm test -- src/tests/phase34-acceptance.test.ts
```

## 📈 Monitoring & Metrics

### System Metrics
- Watch cycle execution time
- Change detection frequency
- Gauntlet test success rates
- GitHub contribution statistics

### Key Performance Indicators
- **Detection Latency**: Time from spec change to detection (< 24 hours)
- **Analysis Coverage**: Percentage of changes analyzed with gauntlet (100%)
- **Contribution Rate**: Accepted upstream contributions per quarter (≥ 1)
- **Report Timeliness**: Quarterly reports delivered on schedule (100%)

## 🔒 Security Features

- **SSRF Protection**: URL validation against allowlisted domains
- **Input Sanitization**: Comprehensive input validation and sanitization
- **Rate Limiting**: Per-IP and per-endpoint request throttling
- **Secure Headers**: XSS, CSRF, and clickjacking protection
- **Access Control**: Host binding restrictions and authentication

## 📋 Issue/PR Templates

### Issue Template Example

```markdown
## HIGH: Remote-manifest discovery precedence when both embedded and Link present

**Spec refs:** §15.5.3.1 "By Reference", §2.4 Durable CC, §2.5 Architecture
**Observed behavior:** embedded chosen; Link ignored
**Expected:** Clear precedence rules with test vectors

### Reproducer:
- Asset: https://example.com/asset.jpg (embedded + Link)
- Steps: curl -I <asset>; verify with CAI Verify
- Result: embedded chosen; Link ignored

### Evidence Pack:
- traces.json
- verify.txt
- headers.txt
```

### PR Template Example

```markdown
## docs: clarify manifest discovery precedence

### Changes Made:
- Updated §15.5.3.1 with clear precedence rules
- Added illustrative examples
- Included test vectors under /tests/vectors/remote_discovery/

### Validation:
- ✅ Aligns with C2PA specification v2.2
- ✅ Examples are reproducible
- ✅ Test vectors provided
- ✅ No breaking changes
```

## 📊 Quarterly Reports

### Report Structure (2 pages max)

1. **What Changed** - Bulleted deltas with spec paragraph links
2. **Impact Analysis** - Effects on embed vs remote survival, discovery order, video
3. **Our Response** - Rules/CI updates, Auto-Fallback state changes
4. **Customer Actions** - Required/recommended/optional actions with deadlines
5. **Appendix** - SDK changes, conformance news

### Delivery Schedule
- **Due Date**: Last business day of each quarter
- **Delivery**: Posted to docs site and emailed to tenants
- **Format**: Markdown and PDF versions

## 🎯 Governance & Scope

### Strict Scope Limits
- **Time Cap**: 1 day/month of founder time maximum
- **Focus Areas**: Only items with direct survival impact
- **Excluded**: Philosophical debates, cosmetic changes

### Contribution Strategy
- **Minimal Scope**: File concise, test-backed items only
- **Evidence-Based**: Always attach gauntlet evidence packs
- **Incremental**: Prefer micro-PRs (typos, links, test JSON)

## 🔄 CI/CD Integration

### Automated Gates
```bash
# Spec change detected → Open internal ticket (24h SLA)
npm run watch:check

# Run gauntlet against changes
npm run gauntlet:run

# Validate contribution readiness
npm run contribution:validate
```

### Acceptance Criteria
- ✅ Upstream drift caught within 24 hours with ticket + gauntlet run
- ✅ One accepted upstream touch per quarter (PR or WG issue)
- ✅ Internal rules updated within 5 days of survival-impacting changes
- ✅ Quarterly reports delivered on time with spec section links

## 🛠️ Development

### Project Structure
```
src/
├── watchers/           # Content monitoring
├── gauntlet/          # Test execution
├── reporters/         # Issue/PR generation
├── utils/             # Security utilities
├── types/             # TypeScript definitions
├── config/            # Configuration files
└── tests/             # Test suites
```

### Adding New Watch Targets
1. Add target to `src/config/watch-job.json`
2. Implement content processor in `src/watchers/content-watcher.ts`
3. Add validation rules in `src/utils/security.ts`
4. Update tests in `src/tests/`

### Extending Gauntlet Tests
1. Add sentinel assets to configuration
2. Implement test logic in `src/gauntlet/test-runner.ts`
3. Update analysis criteria
4. Add test cases

## 📞 Support & Contributing

### Getting Help
- **Documentation**: Check this README and inline code comments
- **Issues**: File bug reports with reproduction steps
- **Security**: Report security issues privately

### Contributing
1. Fork the repository
2. Create feature branch from `main`
3. Implement changes with tests
4. Submit pull request with description
5. Ensure CI/CD passes

### Development Workflow
```bash
# Setup development environment
npm run dev:setup

# Run with hot reload
npm run dev

# Run linting and formatting
npm run lint
npm run format

# Run full test suite
npm run test:all

# Build for production
npm run build
```

## 📄 License

MIT License - see LICENSE file for details.

## 🙏 Acknowledgments

- **C2PA Organization**: Specification and guidance documents
- **Content Authenticity Initiative**: Tool implementations and samples
- **Open Source Community**: Testing frameworks and libraries

---

**Phase 34 Spec Watch System** - Keeping C2PA implementation stability through continuous specification monitoring and evidence-based contributions.

*Generated by C2PA Audit Team v1.1.0*
