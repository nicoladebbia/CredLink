# Phase 9 - Key Custody Upsell (7-12 days)

## 🎯 Objectives
Ship an optional HSM custody tier with per-tenant key slots and explicit signing policies. Control plane maintains rotation calendar and generates Rotation Evidence Packs (REP) per tenant.

## 📋 Day 1 Progress ✅

### ✅ Completed
- **signer-hsm service scaffold** - HTTP server with backend abstraction
- **YubiHSM2 PKCS#11 backend stub** - Basic structure (implementation Day 3)
- **Vault Transit backend stub** - Basic structure (implementation Day 2)
- **keyctl control plane scaffold** - CLI + API for policy management
- **Policy schema and validation** - Complete signing policy structure
- **Database migrations** - SQLite schema for policies, rotations, incidents
- **Configuration files** - TOML configs for both services

### 🏗️ Architecture Created
```
apps/
├── signer-hsm/          # HSM/KMS signing microservice
│   ├── src/lib.rs       # Backend trait + implementations
│   ├── src/main.rs      # HTTP server (/sign, /pubkey, /health)
│   └── Cargo.toml       # Dependencies (PKCS#11, Vault, etc.)
├── keyctl/              # Control plane CLI/API
│   ├── src/lib.rs       # PolicyManager + validation
│   ├── src/main.rs      # CLI commands
│   ├── migrations/      # Database schema
│   └── Cargo.toml       # Dependencies (SQLx, PDF, etc.)
docs/custody/            # Policy examples and templates
```

## 🚀 Next Steps (Day 2)

### 📋 Day 2 - KMS Path
- [ ] Implement AWS KMS adapter end-to-end
- [ ] Implement GCP KMS adapter end-to-end  
- [ ] Generate REP v0 (no HSM attestation)
- [ ] Test cloud KMS signing with real keys

### 📋 Day 3 - HSM Path  
- [ ] Complete YubiHSM2 PKCS#11 implementation
- [ ] Implement Vault-HSM backend
- [ ] Add device attestation extraction
- [ ] End-to-end HSM signing tests

### 📋 Day 4 - Rotation Engine
- [ ] Calendar scheduling system
- [ ] CSR issuance workflow
- [ ] Cutover automation
- [ ] Canary re-signing (100 assets)

### 📋 Day 5 - Incident Drill
- [ ] Pause → rotate → re-sign automation
- [ ] Incident statement PDF generation
- [ ] Tabletop incident simulation
- [ ] Dashboard integration

## 🎯 Acceptance Criteria Progress

### ✅ Partially Complete
- **Backend abstraction** - ✅ Trait defined, stubs implemented
- **Policy schema** - ✅ Complete validation and storage
- **CLI interface** - ✅ All commands scaffolded
- **Database schema** - ✅ Complete migration system

### 🔄 In Progress  
- **HSM integration** - 🏗️ Structure complete, implementation pending
- **KMS integration** - 🏗️ Structure complete, implementation pending
- **REP generation** - 🏗️ File structure defined, generation pending

### ❌ Not Started
- **Rotation calendar** - ❌ Will be Day 4
- **Incident playbook** - ❌ Will be Day 5
- **Live tenants** - ❌ Will be Day 7-12
- **Performance testing** - ❌ Will be Day 6

## 🛠️ Technical Decisions Made

### Backend Architecture
- **Trait-based abstraction** for multiple HSM/KMS providers
- **HTTP microservice** for signing operations (digest-only)
- **Separate control plane** for policy/rotation management
- **SQLite for policy storage** with audit logging

### Security Design
- **Digest-only signing** - Private keys never leave HSM/KMS
- **Policy enforcement** in signing service
- **Deterministic audit logs** with policy hashes
- **Per-tenant isolation** in all components

### Integration Points
- **signer-hsm** integrates with existing **signer** service
- **keyctl** manages policies for **signer-hsm** backends
- **REP generation** creates compliance artifacts
- **Incident system** integrates with monitoring

## 📊 Current Status: 20% Complete

**Day 1 successfully established the foundation architecture.** All scaffolding is in place for implementing the actual HSM/KMS functionality starting Day 2.

The system now has:
- ✅ Clear separation between signing service and control plane
- ✅ Extensible backend architecture for multiple providers  
- ✅ Complete policy management system
- ✅ Database schema for audit and compliance
- ✅ CLI interface for all operations

**Ready to implement real HSM/KMS integration on Day 2.**
