# Core Directory Guide

The `/core/` directory contains 27 service packages. This guide categorizes them by importance and implementation status.

---

## 🎯 MVP-Critical (Build These First)

These 3 services are essential for basic functionality:

### 1. **verify** (`core/verify/`)
- **Purpose**: Verification API endpoint
- **Status**: ⚠️ Structure exists, needs implementation
- **Priority**: HIGHEST
- **What it needs**: Build `/verify` endpoint, manifest retrieval, signature validation

### 2. **manifest-store** (`core/manifest-store/`)
- **Purpose**: Stores C2PA manifests
- **Status**: ⚠️ Partial implementation
- **Priority**: HIGHEST
- **What it needs**: Connect to R2 storage, implement CRUD operations

### 3. **api-gw** (`core/api-gw/`)
- **Purpose**: API Gateway for routing requests
- **Status**: ⚠️ Basic structure
- **Priority**: HIGH
- **What it needs**: Route to signing/verify endpoints, add authentication

---

## 🔧 Supporting Infrastructure (Build These Second)

These 5 services support core functionality:

### 4. **utils** (`core/utils/`)
- **Status**: ✅ Complete
- **Purpose**: Shared utilities (logging, HTTP helpers)
- **Used by**: All other services

### 5. **edge-relay** (`core/edge-relay/`)
- **Purpose**: Cloudflare Worker for manifest delivery
- **Status**: ⚠️ Needs deployment
- **Priority**: HIGH
- **What it needs**: Deploy to Cloudflare Workers

### 6. **edge-worker** (`core/edge-worker/`)
- **Purpose**: Edge processing and optimization
- **Status**: ⚠️ Basic structure
- **Priority**: MEDIUM

### 7. **audit** (`core/audit/`)
- **Purpose**: Audit logging for compliance
- **Status**: ⚠️ Partial
- **Priority**: MEDIUM

### 8. **c2pa-audit** (`core/c2pa-audit/`)
- **Purpose**: C2PA compliance verification
- **Status**: ⚠️ Extensive but needs production deployment
- **Priority**: MEDIUM

---

## 🏢 Enterprise Features (Build These Third)

These 10 services are for enterprise customers (not MVP):

### Identity & Access
- **idp** (`core/idp/`) - Identity Provider
- **oidc-saml** (`core/oidc-saml/`) - SSO integration
- **rbac** (`core/rbac/`) - Role-based access control
- **scim** (`core/scim/`) - User provisioning
- **scim-core** (`core/scim-core/`) - SCIM protocol implementation

### Policy & Compliance
- **policy** (`core/policy/`) - Policy storage
- **policy-engine** (`core/policy-engine/`) - Policy evaluation
- **compliance** (`core/compliance/`) - Regulatory compliance (GDPR, etc.)

### Trust & Verification
- **oem-bridge** (`core/oem-bridge/`) - OEM hardware integration
- **oem-trust** (`core/oem-trust/`) - OEM trust profiles

**Status**: ❌ Not started  
**Priority**: LOW (defer until after MVP)

---

## ⚙️ Advanced Features (Build These Last)

These 9 services are for advanced use cases:

### Operational
- **evidence** (`core/evidence/`) - Evidence storage for disputes
- **reportgen** (`core/reportgen/`) - Report generation
- **tsa-service** (`core/tsa-service/`) - Timestamp Authority

### Infrastructure
- **flags** (`core/flags/`) - Feature flags (basic)
- **feature-flags** (`core/feature-flags/`) - Advanced feature flags
- **sw-relay** (`core/sw-relay/`) - Service Worker relay
- **edge-signer** (`core/edge-signer/`) - Edge signing capability

### Advanced Features
- **merkle-core** (`core/merkle-core/`) - Merkle tree for batching
- **variant-linking** (`core/variant-linking/`) - Link image variants

**Status**: ❌ Not started  
**Priority**: LOWEST (phase 3+)

---

## 📊 Quick Reference Table

| Service | Status | Priority | Effort | Blocks MVP? |
|---------|--------|----------|--------|-------------|
| **verify** | ⚠️ Needs work | 🔴 CRITICAL | 1-2 weeks | YES |
| **manifest-store** | ⚠️ Partial | 🔴 CRITICAL | 1 week | YES |
| **api-gw** | ⚠️ Basic | 🔴 HIGH | 3-5 days | YES |
| **edge-relay** | ⚠️ Needs deploy | 🟡 HIGH | 2-3 days | YES |
| **utils** | ✅ Complete | 🟢 - | - | NO |
| **audit** | ⚠️ Partial | 🟡 MEDIUM | 1 week | NO |
| **c2pa-audit** | ⚠️ Extensive | 🟡 MEDIUM | 1 week | NO |
| **edge-worker** | ⚠️ Basic | 🟡 MEDIUM | 1 week | NO |
| *All enterprise* | ❌ Not started | 🟢 LOW | 4-8 weeks | NO |
| *All advanced* | ❌ Not started | 🟢 LOWEST | 6-12 weeks | NO |

---

## 🚀 Recommended Build Order

### **Phase 1: MVP (4 weeks)**
1. Build `/sign` endpoint (new, not in core/)
2. Build `verify` service → `/verify` endpoint (1-2 weeks)
3. Complete `manifest-store` → R2 integration (1 week)
4. Deploy `edge-relay` → Cloudflare Workers (2-3 days)
5. Wire up `api-gw` → route requests (3 days)

**Result**: Working sign + verify flow

### **Phase 2: Production Hardening (2 weeks)**
1. Complete `audit` logging
2. Deploy `c2pa-audit` compliance checks
3. Add authentication to `api-gw`
4. Monitoring + alerting

**Result**: Production-ready system

### **Phase 3: Enterprise (2-3 months)**
1. Build identity services (idp, oidc-saml, rbac, scim)
2. Build policy engine
3. Build compliance reporting
4. OEM integrations

**Result**: Enterprise-grade platform

### **Phase 4: Advanced Features (3-6 months)**
1. Evidence storage
2. Timestamp authority
3. Merkle batching
4. Advanced feature flags

**Result**: Full-featured platform

---

## 🗂️ Why Not Reorganize /core/ Now?

**Reason**: Moving 27 directories would require:
- ✅ Update 100+ import statements
- ✅ Update all package.json path references
- ✅ Update TypeScript project references
- ✅ Update build scripts
- ✅ Update documentation
- ✅ Test everything still works

**Cost**: 2-3 hours of risky refactoring  
**Benefit**: Slightly clearer folder names  
**Verdict**: **Not worth it right now**

---

## 📝 Recommendation

**Don't reorganize the folders.**

Instead:
1. ✅ Use this guide to understand what's important
2. ✅ Focus on building the 3 MVP services
3. ✅ Ignore everything else until MVP ships

**You can reorganize later when:**
- MVP is deployed and working
- You have time for non-critical refactoring
- The structure is actually causing problems

---

## 🎯 Focus This Week

Build these 3 things:
1. **Signing API** - `POST /sign` endpoint (not in core/ yet)
2. **Verify API** - Complete `core/verify/`
3. **Manifest Storage** - Complete `core/manifest-store/`

Everything else can wait.

---

**Bottom Line**: The /core/ directory is fine as-is. Focus on implementation, not organization.
