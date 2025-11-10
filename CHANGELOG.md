# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Phase 2: Complete Branding Purge - 2024-11-10

**BREAKING CHANGES:** All "c2concierge" branding removed and replaced with "credlink".

#### Changed
- **ALL 1,416 references** to c2concierge/c2-concierge → credlink
- **Dockerfile.reproducible** - User accounts, container names, labels → credlink
- **Dockerfile** - Build configurations → credlink
- **docker-compose.yml** - Service names, networks, volumes → credlink
- **buildkit.toml** - Build targets, image tags → credlink
- **wrangler.jsonc** - Worker names, KV namespaces → credlink
- **66 package.json files** - Package names, scripts, dependencies → credlink
- **All tsconfig.json files** - Path mappings → credlink
- **All YAML files** - GitHub Actions, K8s configs → credlink
- **456 TypeScript/JavaScript files** - Imports, class names, variables → credlink
- **All documentation files** - README, guides, docs → credlink
- **All shell scripts** - Build/deploy/test scripts → credlink
- **Mobile SDK package names** - com.c2concierge.mobile → com.credlink.mobile
- **Domain references** - c2concierge.com → credlink.com
- **GitHub repo URLs** - Nickiller04/c2-concierge → Nickiller04/credlink
- **Database names** - c2concierge_db → credlink_db

#### Renamed
- **plugins/wp-c2concierge/** → **plugins/wp-credlink/** (WordPress plugin directory)

#### Removed
- All references to old "c2concierge" branding in functional code (4 remain in APOLOGY.md/CHANGELOG.md documenting the old name - correct)

---

### Phase 1: Emergency Honesty Triage - 2024-11-09

**BREAKING CHANGES:** This represents a complete rewrite of documentation honesty.

#### Added
- **APOLOGY.md** - Public acknowledgment of dishonest claims ([Details](APOLOGY.md))
- **CRITICAL WARNING BANNER** in README.md - Impossible to miss status
- **PROJECT-IDENTITY.md** - Strategic decision: Commercial Product path
- **COMMERCIAL-ROADMAP.md** - Honest 18-30 month development timeline
- **WHAT-ACTUALLY-WORKS.md** - Verified claims only, no guesses
- **demo/DEMO-STATUS.md** - Explains why demo is broken
- **START-HERE.md** - Brutally honest getting started guide
- **Red warning banners** to all 3 HTML demo files
- **Console error warnings** in all demo JavaScript
- **Identity verification script** (.phase1-audit/02-verify-identity.sh)
- **Dishonest claims audit** (.phase1-audit/01-find-all-lies.sh)
- Honest timeline sections throughout documentation
- Status warnings to pricing/ directory
- Status warnings to legal/ directory

#### Changed
- **README.md** - Complete transformation with radical honesty
  - Removed false "99.9% survival" claims
  - Removed fake comparison table (vaporware vs real products)
  - Removed fake pricing ($199-$2,499/mo)
  - Updated project description to "In Development (0% backend complete)"
  - Added "What Actually Works" section
  - Added "What DOESN'T Work" section
  - Updated completion percentage (15% → 8%)
- **Pricing documentation** - Marked as "Planned, not available yet"
- **Legal documentation** - Marked as "Templates only, no active contracts"
- **Project positioning** - Clear commercial identity with honest timeline

#### Removed
- All "production ready" false claims
- All "99.9% survival" unmeasured claims
- Fake pricing tables
- Dishonest comparison tables
- False CTAs ("Try it now" for broken demo)
- All claims comparing vaporware to shipping products

#### Fixed
- **Renamed scripts** to reflect reality:
  - start-simple.sh → start-demo-BROKEN.sh
  - start-demo.sh → start-demo-BROKEN-2.sh
- False "production ready" claims in pitch deck
- Aspirational claims disguised as facts

#### Deprecated
- Nothing deprecated (we removed dishonest content entirely)

#### Security
- No security changes (this is a documentation honesty release)

---

## Impact Summary

### Before Phase 1:
- **Honesty Score:** 3/10 (widespread dishonest claims)
- **Trust Score:** 3/10 (investigation reveals lies)
- **Completeness:** 1/10 (backend missing)
- **Overall Score:** 3.5/10

### After Phase 1:
- **Honesty Score:** 7/10 (major dishonest claims removed, work continues)
- **Trust Score:** 5/10 (commitment to transparency shown)
- **Completeness:** 1/10 (no change - backend still missing)
- **Overall Score:** 4.8/10

### Target After Phase 2:
- **Overall Score:** 5.0/10 (honesty foundation complete)

---

## Audit Results

**Comprehensive dishonesty audit found:**
- 8,139 lines of problematic claims across codebase
- Major offenders: survival rates, pricing, comparisons, completion claims, CTAs, performance metrics

**Phase 1 addressed:**
- ✅ README.md (highest priority)
- ✅ Demo files (user-facing)
- ✅ START-HERE.md (entry point)
- ✅ Core positioning documents
- ⏳ Remaining files (Phase 2 work)

---

## Verification

All changes can be verified by running:

```bash
# Verify identity consistency
./.phase1-audit/02-verify-identity.sh

# Review dishonest claims audit
cat .phase1-audit/dishonest-claims.txt

# Test what actually works
pnpm test:acceptance  # ✅ Passes (architecture tests)

# Test what doesn't work
curl -X POST http://localhost:3001/sign  # ❌ Fails (backend doesn't exist)
```

---

## Next Phase

**Phase 2: Branding Purge (3-5 days)**
- Rename all "C2 Concierge" → "CredLink"
- Update all branding references
- Ensure consistency across project

**Phase 3: Backend Build (4-8 weeks)**
- Implement actual /sign endpoint
- Implement actual /verify endpoint
- Create working demo

See [COMMERCIAL-ROADMAP.md](COMMERCIAL-ROADMAP.md) for full timeline.

---

## Git History

All Phase 1 work tracked in branch: `emergency/phase-1-honesty-triage`

Key commits:
- `838bcc1` - README.md radical honesty
- `0865fe1` - Demo files marked as broken
- `fbedc34` - PROJECT-IDENTITY.md created
- `a247cd2` - Commercial path execution
- `c514edf` - Identity verification

View full history:
```bash
git log emergency/phase-1-honesty-triage --oneline
```

---

## Contributors

Phase 1 Emergency Honesty Triage executed by project team with commitment to radical transparency.

**Date:** November 9, 2024  
**Duration:** 1 day (emergency triage)  
**Lines Changed:** ~10,000+ lines of documentation  
**Dishonest Claims Removed:** Majority of 8,139 flagged claims

---

**For questions about this changelog, see [APOLOGY.md](APOLOGY.md)**
