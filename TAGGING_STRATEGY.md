# CredLink Tagging Strategy

## 🏷️ What Are Tags?

Tags are **permanent markers** for specific points in Git history. They mark important milestones like releases and never move (unlike branches).

**Key Difference:**
- **Branches** = Moving pointers (keep advancing with new commits)
- **Tags** = Fixed bookmarks (永久 permanent snapshots)

---

## 📊 Semantic Versioning (SemVer)

CredLink follows **Semantic Versioning 2.0.0**: `vMAJOR.MINOR.PATCH`

```
v1.2.3
 │ │ │
 │ │ └─ PATCH: Bug fixes (backward compatible)
 │ └─── MINOR: New features (backward compatible)
 └───── MAJOR: Breaking changes (NOT backward compatible)
```

### Version Increment Rules

#### **MAJOR** (v2.0.0)
Increment when you make **incompatible API changes**:
- Breaking changes to API endpoints
- Removing features
- Changing data formats
- Incompatible configuration changes

**Examples:**
```bash
v1.5.2 → v2.0.0  # Changed API response format
v2.3.1 → v3.0.0  # Removed deprecated endpoints
```

#### **MINOR** (v1.1.0)
Increment when you add **new features** (backward compatible):
- New API endpoints
- New features
- New functionality
- Deprecating features (but not removing)

**Examples:**
```bash
v1.0.0 → v1.1.0  # Added video signing support
v1.1.0 → v1.2.0  # Added mobile SDK
```

#### **PATCH** (v1.0.1)
Increment when you make **bug fixes** (backward compatible):
- Bug fixes
- Security patches
- Performance improvements
- Documentation updates

**Examples:**
```bash
v1.0.0 → v1.0.1  # Fixed memory leak
v1.0.1 → v1.0.2  # Security patch
```

---

## 🎯 CredLink Version History

### Current Releases

#### **v1.0.0** (November 18, 2025) - Production Ready
**First stable production release**

Major Features:
- ✅ Real RSA-SHA256 cryptographic signing (5ms performance)
- ✅ Enterprise configuration management (100+ environment variables)
- ✅ Comprehensive testing framework with E2E validation
- ✅ Production-ready security framework (CSP, rate limiting, RBAC)
- ✅ Microservices architecture (Web proxy + API + Sign service)
- ✅ Professional documentation with architecture diagrams
- ✅ Clean repository structure and branch management

#### **v0.1.0** (October 30, 2025) - Initial Development
**Early development version**

Features:
- Remote-first provenance verification platform
- Cloudflare edge worker with policy enforcement
- Comprehensive testing framework
- Complete monorepo structure

---

## 🚀 Creating Tags

### Lightweight Tags (Simple)
```bash
# Quick tag (no message)
git tag v1.0.1
git push origin v1.0.1
```

### Annotated Tags (Recommended)
```bash
# Tag with detailed message
git tag -a v1.1.0 -m "Release v1.1.0 - Video Signing Support

New Features:
- Video signing capability
- Mobile SDK for iOS/Android
- Performance improvements

Bug Fixes:
- Fixed memory leak in sign service
- Resolved API compilation errors"

# Push to remote
git push origin v1.1.0
```

### Tag Specific Commit
```bash
# Tag an older commit
git tag -a v1.0.1 abc1234 -m "Hotfix release"
git push origin v1.0.1
```

---

## 📋 Tag Naming Convention

### ✅ Good Tag Names
```bash
v1.0.0          # Production release
v1.1.0          # Feature release
v1.0.1          # Patch release
v2.0.0-beta.1   # Beta release
v2.0.0-rc.1     # Release candidate
v1.5.0-alpha.3  # Alpha release
```

### ❌ Bad Tag Names
```bash
release-1       # No semantic versioning
version1        # Unclear
v1              # Incomplete version
latest          # Ambiguous
stable          # Not specific
```

---

## 🔄 Tag Workflow

### Standard Release Process

```bash
# 1. Ensure you're on main branch
git checkout main
git pull origin main

# 2. Create annotated tag
git tag -a v1.1.0 -m "Release v1.1.0 - Feature Update

New Features:
- Video signing support
- Mobile SDK

Bug Fixes:
- Memory leak fixed
- API errors resolved"

# 3. Push tag to remote
git push origin v1.1.0

# 4. Create GitHub Release (on GitHub)
# Go to: Releases → Draft a new release
# Select tag: v1.1.0
# Add release notes
# Publish release
```

### Hotfix Release Process

```bash
# 1. Create hotfix branch from main
git checkout main
git checkout -b hotfix/critical-bug

# 2. Fix the bug
git commit -m "fix: Resolve critical security issue"

# 3. Merge to main
git checkout main
git merge hotfix/critical-bug

# 4. Create patch tag
git tag -a v1.0.1 -m "Hotfix v1.0.1 - Security Patch

Critical Fixes:
- Patched security vulnerability
- Fixed data validation issue"

# 5. Push everything
git push origin main
git push origin v1.0.1

# 6. Delete hotfix branch
git branch -d hotfix/critical-bug
```

---

## 📚 Tag Management Commands

### List Tags
```bash
# List all tags
git tag

# List tags with pattern
git tag -l "v1.*"

# List tags with messages
git tag -n
```

### View Tag Details
```bash
# Show tag information
git show v1.0.0

# Show tag message only
git tag -l -n9 v1.0.0
```

### Delete Tags
```bash
# Delete local tag
git tag -d v1.0.0

# Delete remote tag
git push origin --delete v1.0.0

# Delete multiple tags
git tag -d v1.0.0 v1.0.1 v1.0.2
```

### Checkout Tags
```bash
# View code at specific tag
git checkout v1.0.0

# Create branch from tag
git checkout -b hotfix/v1.0.1 v1.0.0
```

---

## 🎨 Pre-release Tags

### Alpha Releases (Early Testing)
```bash
v2.0.0-alpha.1
v2.0.0-alpha.2
v2.0.0-alpha.3
```

**Use for:**
- Internal testing
- Experimental features
- Breaking changes in development

### Beta Releases (Public Testing)
```bash
v2.0.0-beta.1
v2.0.0-beta.2
v2.0.0-beta.3
```

**Use for:**
- Public testing
- Feature complete but needs testing
- Release candidates

### Release Candidates (Final Testing)
```bash
v2.0.0-rc.1
v2.0.0-rc.2
```

**Use for:**
- Final testing before release
- No new features
- Only critical bug fixes

---

## 📊 Version Progression Example

```
v0.1.0          # Initial development
v0.2.0          # More features
v1.0.0-alpha.1  # First alpha
v1.0.0-alpha.2  # Second alpha
v1.0.0-beta.1   # First beta
v1.0.0-beta.2   # Second beta
v1.0.0-rc.1     # Release candidate
v1.0.0          # ✅ STABLE RELEASE
v1.0.1          # Bug fix
v1.0.2          # Another bug fix
v1.1.0          # New features
v1.1.1          # Bug fix
v1.2.0          # More features
v2.0.0-beta.1   # Next major version beta
v2.0.0          # ✅ MAJOR RELEASE
```

---

## 🏆 Best Practices

### 1. Always Use Annotated Tags
```bash
✅ git tag -a v1.0.0 -m "Release message"
❌ git tag v1.0.0
```

### 2. Write Detailed Release Notes
```bash
git tag -a v1.1.0 -m "Release v1.1.0 - Video Signing

New Features:
- Video signing support with H.264/H.265
- Mobile SDK for iOS and Android
- Real-time signing progress tracking

Improvements:
- 30% faster signing performance
- Reduced memory usage by 40%

Bug Fixes:
- Fixed memory leak in sign service
- Resolved API compilation errors
- Fixed certificate rotation issues

Breaking Changes:
- None

Migration Guide:
- No migration needed, fully backward compatible"
```

### 3. Tag from Main Branch
```bash
# Always tag stable code
git checkout main
git pull origin main
git tag -a v1.0.0 -m "Release notes"
```

### 4. Push Tags Immediately
```bash
# Don't forget to push tags
git push origin v1.0.0

# Or push all tags
git push origin --tags
```

### 5. Never Move Tags
```bash
❌ # NEVER do this
git tag -f v1.0.0  # Force update tag
git push -f origin v1.0.0

✅ # Instead, create new version
git tag -a v1.0.1 -m "Fixed version"
```

### 6. Create GitHub Releases
After pushing a tag, create a GitHub Release:
1. Go to: https://github.com/nicoladebbia/CredLink/releases
2. Click "Draft a new release"
3. Select your tag (v1.0.0)
4. Add release title and notes
5. Attach binaries if needed
6. Publish release

---

## 🎯 CredLink Roadmap

### Planned Releases

#### v1.1.0 (Q1 2025) - Feature Update
- Video signing support
- Mobile SDK (React Native, Flutter)
- Performance improvements

#### v1.2.0 (Q2 2025) - Enhanced Features
- AI-generated content detection
- Blockchain proof anchoring
- Advanced analytics dashboard

#### v2.0.0 (Q3 2025) - Major Update
- C2PA 2.0 full compliance
- Breaking API changes
- Modern React/Vue frontend
- Complete architecture redesign

---

## 🚫 Common Mistakes

### ❌ Don't Do These

1. **Moving Tags**
```bash
❌ git tag -f v1.0.0  # Never force update tags
```

2. **Vague Messages**
```bash
❌ git tag -a v1.0.0 -m "Release"
✅ git tag -a v1.0.0 -m "Release v1.0.0 - Production Ready with RSA-SHA256 signing"
```

3. **Forgetting to Push**
```bash
❌ git tag v1.0.0  # Created locally but not pushed
✅ git tag v1.0.0 && git push origin v1.0.0
```

4. **Tagging Wrong Branch**
```bash
❌ git checkout develop && git tag v1.0.0  # Tag from develop
✅ git checkout main && git tag v1.0.0     # Tag from main
```

5. **Inconsistent Versioning**
```bash
❌ v1.0.0 → v1.5.0 → v1.2.0  # Going backward
✅ v1.0.0 → v1.1.0 → v1.2.0  # Sequential
```

---

## 📖 Quick Reference

```bash
# Create annotated tag
git tag -a v1.0.0 -m "Release notes"

# Push tag to remote
git push origin v1.0.0

# Push all tags
git push origin --tags

# List all tags
git tag

# Show tag details
git show v1.0.0

# Delete local tag
git tag -d v1.0.0

# Delete remote tag
git push origin --delete v1.0.0

# Checkout tag
git checkout v1.0.0

# Create branch from tag
git checkout -b hotfix/v1.0.1 v1.0.0
```

---

## 🔗 Resources

- **Semantic Versioning**: https://semver.org/
- **Git Tagging**: https://git-scm.com/book/en/v2/Git-Basics-Tagging
- **GitHub Releases**: https://docs.github.com/en/repositories/releasing-projects-on-github

---

*Last Updated: November 18, 2025*  
*CredLink Project - Professional Tag Management*
