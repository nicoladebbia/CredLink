# ⚠️ THE DEMO DOES NOT WORK - START HERE

**CRITICAL:** Backend signing service is NOT implemented. The demo WILL FAIL.

## What Actually Works Right Now:

✅ **Policy Engine Tests:**
```bash
pnpm install
pnpm test:acceptance
```
These pass because they're testing architecture, not actual signing.

✅ **Frontend UI (Visual Only):**
```bash
cd demo
open gallery.html  # Open in browser
```
You'll see a UI. It's a MOCKUP. Clicking "Sign Image" returns 404.

✅ **Documentation:**
- Architecture docs in `/docs/`
- Roadmap in `/docs/roadmap/`
- Code structure is sound

## What DOESN'T Work:

❌ **POST /sign endpoint** - Returns 404 (not implemented)  
❌ **POST /verify endpoint** - Returns 404 (not implemented)  
❌ **Image signing** - Backend doesn't exist  
❌ **Signature verification** - Backend doesn't exist  
❌ **Demo functionality** - Will fail when you click buttons  
❌ **CLI commands** - No backend to connect to  
❌ **Production deployment** - Nothing to deploy

## Honest Timeline:

- **Phase 1 (Honesty Audit):** 2-3 days ← YOU ARE HERE
- **Phase 2 (Rebrand Cleanup):** 3-5 days
- **Phase 3 (Backend Build):** 4-8 weeks  
- **Phase 4 (Infrastructure):** 4-8 weeks
- **Phase 5 (Customer Validation):** 12-16 weeks

**Earliest working demo:** 2-3 months from now (after Phase 3)
**Production ready:** 6-12 months from now

## How to Contribute:

1. **Phase 1-2:** Help fix dishonest docs and rebranding
2. **Phase 3:** Backend engineering (TypeScript/Node.js)
3. **Phase 4:** Infrastructure/DevOps
4. **Phase 5:** Customer development/sales

See [docs/roadmap/ROADMAP-OVERVIEW.md](docs/roadmap/ROADMAP-OVERVIEW.md).

---

**Questions?** Open an issue. Be patient. We're rebuilding with honesty.
