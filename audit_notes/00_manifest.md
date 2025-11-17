# Repository Manifest - CredLink

## Repository Type
**Monorepo** - Detected via pnpm-workspace.yaml, apps/, packages/ structure

## Top-Level Directory Tree & Purpose

```
CredLink/
├── apps/                    # Application entrypoints (142 items)
├── packages/                # Shared libraries and packages (146 items)
├── infra/                   # Infrastructure as code (123 items)
├── tests/                   # Test suites (30 items)
├── docs/                    # Documentation (8 items)
├── scripts/                 # Build/deployment scripts (14 items)
├── sdk/                     # SDK components (31 items)
├── ui/                      # UI components (9 items)
├── tools/                   # Development tools (5 items)
├── security/                # Security configurations (5 items)
├── ops/                     # Operations files (3 items)
├── sandboxes/               # Development sandboxes (7 items)
├── fixtures/                # Test fixtures (2 items)
├── legal/                   # Legal documentation (15 items)
├── runbooks/                # Operational runbooks (1 items)
├── .github/                 # GitHub workflows (16 items)
├── .artifacts/              # Build artifacts (0 items)
├── .claude/                 # Claude config (0 items)
├── .husky/                  # Git hooks (0 items)
├── .turbo/                  # Turbo build cache (0 items)
├── .vscode/                 # VS Code config (0 items)
├── .windsurf/               # Windsurf config (0 items)
└── Noise Files:
    ├── node_modules/        # Dependencies (0 items - likely excluded)
    ├── pnpm-lock.yaml       # Lock file (398KB)
    ├── Dockerfile.*         # Multiple Docker variants
    ├── docker-compose.*     # Docker compose files
    ├── .env.*               # Environment templates
    └── Various config files (.eslintrc, .prettierrc, etc.)
```

## File Count Analysis
- **Total significant items**: ~600+ files/directories
- **Core application code**: apps/ + packages/ = 288 items
- **Infrastructure**: infra/ = 123 items
- **Tests**: tests/ = 30 items
- **Configuration/Tooling**: ~100+ items

## Noise Identification
**Build artifacts & caches**:
- `.artifacts/`, `.turbo/`, `node_modules/` (excluded from git)

**Lock files & dependencies**:
- `pnpm-lock.yaml` (398KB), package.json files

**Docker & deployment**:
- Multiple Dockerfile variants, docker-compose files

**Environment configs**:
- `.env.example`, `.env.production`, `.env.security.example`

**IDE/editor configs**:
- `.vscode/`, `.windsurf/`, `.eslintrc.json`, `.prettierrc`

## Per-Phase Strategy
Given the monorepo structure and context limits:

**Phase 1 (Codemaps)**: Focus on
1. apps/ - Main application entrypoints
2. packages/ - Core shared libraries
3. infra/ - Infrastructure configuration

**Phase 2 (File summaries)**: Prioritize
1. apps/ - API handlers, main services
2. packages/ - Domain logic, utilities
3. infra/ - Security-critical configs
4. Skip: node_modules, build artifacts, lock files

**Phase 3 (Cross-cutting)**: Focus on
1. Authentication flows across apps/packages
2. Data layer patterns
3. Infrastructure security
4. External integrations

## Internal Checklist
- [ ] apps/ directory audit
- [ ] packages/ directory audit  
- [ ] infra/ directory audit
- [ ] tests/ directory audit
- [ ] scripts/ directory audit
- [ ] sdk/ directory audit
- [ ] ui/ directory audit
- [ ] security/ directory audit
- [ ] CI/CD (.github/) audit
- [ ] Root configuration files audit
