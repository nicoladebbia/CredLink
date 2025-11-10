# What Actually Works (Verified)

**Last Updated:** 2024-11-09
**Verification:** Manual testing

## ✅ Confirmed Working:

### 1. Policy Engine Tests
```bash
pnpm test:acceptance
```
**Status:** PASSING  
**What it tests:** Policy engine architecture (no backend required)  
**Evidence:** CI/CD shows green tests

### 2. Frontend UI Rendering
```bash
cd demo && open gallery.html
```
**Status:** WORKS (visual only)  
**What it shows:** UI mockup, layout, styling  
**Limitation:** Buttons don't work (no backend)

### 3. Project Structure
**Status:** GOOD  
**Evidence:** Well-organized directories, clear separation of concerns

### 4. Documentation
**Status:** Being fixed (Phase 1)  
**Before:** Dishonest claims  
**After:** Radically honest

## ❌ Confirmed NOT Working:

### 1. Backend Signing
```bash
curl -X POST http://localhost:3001/sign -F "image=@test.jpg"
```
**Status:** FAILS (404 or connection refused)  
**Reason:** Endpoint not implemented

### 2. Backend Verification  
```bash
curl -X POST http://localhost:3001/verify -F "image=@signed.jpg"
```
**Status:** FAILS (404 or connection refused)  
**Reason:** Endpoint not implemented

### 3. Demo Functionality
**Status:** BROKEN  
**Evidence:** Click "Sign Image" → 404 error in console

### 4. CLI Commands
```bash
./cli/bin/credlink sign test.jpg
```
**Status:** FAILS (cannot connect to backend)  
**Reason:** No backend to connect to

## 📊 Verification Method:

All claims above verified by:
1. Manual testing on 2024-11-09
2. Running actual commands
3. Checking error logs
4. No assumptions, only tested facts

## 🎯 When Will More Work?

See [docs/roadmap/ROADMAP-OVERVIEW.md](docs/roadmap/ROADMAP-OVERVIEW.md) for timeline.

**Next working feature:** Backend signing (Phase 3, 8-12 weeks)
