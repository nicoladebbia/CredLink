# Week 1: Foundation Sprint - BRUTAL DETAIL GUIDE
## 40-60 Hours of Pain, But You'll Have a Foundation

**Timeline:** 7 days  
**Difficulty:** 🔥🔥🔥🔥 (High)  
**Pain Level:** Maximum (everything breaks)  
**Reward:** Clean foundation to build on

---

## 🎯 Week 1 Success Metrics (Non-Negotiable)

By end of Week 1, you MUST have:

### ✅ Metric 1: Rebranding Complete
- [ ] ZERO references to "CredLink" in codebase (grep returns 0)
- [ ] ZERO references to "@c2/" package scope
- [ ] CLI binary renamed: `c2c` → `credlink`
- [ ] GitHub repository renamed
- [ ] All imports updated and working
- [ ] `pnpm build` succeeds with ZERO errors
- [ ] Go modules updated (if using Go)

**Verification Command:**
```bash
# This should return 0:
grep -r "CredLink\|credlink\|@c2/" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=archive | wc -l
```

### ✅ Metric 2: Folder Structure Reorganized
- [ ] Old `apps/` folder removed or empty
- [ ] Old `packages/` folder removed or empty
- [ ] All phase-numbered folders moved to `archive/`
- [ ] New structure in place: `core/`, `integrations/`, `ui/`, etc.
- [ ] All imports updated to new paths
- [ ] Workspace dependencies resolve
- [ ] `pnpm build` succeeds

**Verification Command:**
```bash
# Should see clean structure:
ls -la
# Should NOT see: apps/, packages/, phase51-*, phase52-*, etc.
# SHOULD see: core/, integrations/, ui/, sdk/, tests/
```

### ✅ Metric 3: Cloudflare Infrastructure Live
- [ ] Cloudflare account created with payment method
- [ ] R2 bucket `credlink-manifests` created
- [ ] Worker deployed to staging
- [ ] Can upload file to R2 via CLI
- [ ] Can fetch file from R2 via Worker
- [ ] Domain configured (or .workers.dev URL working)
- [ ] API tokens stored in `.env`

**Verification Command:**
```bash
# Upload test file
echo "test" > test.txt
wrangler r2 object put credlink-manifests/test.txt --file test.txt

# Fetch via Worker
curl https://your-worker.workers.dev/manifests/test.txt
# Should return: test

# Cleanup
wrangler r2 object delete credlink-manifests/test.txt
```

### ✅ Metric 4: ONE Service Implemented
- [ ] Signer OR Verify service has 1 working endpoint
- [ ] Endpoint deployed to Cloudflare staging
- [ ] Endpoint responds to curl request
- [ ] Response contains real data (not "Hello World")
- [ ] Can demo to a friend

**Verification Command:**
```bash
# For Signer:
curl -X POST https://api-staging.credlink.com/sign \
  -H "Content-Type: application/json" \
  -d '{"assetUrl":"https://example.com/image.jpg","creator":"test@example.com"}'

# Should return:
# {"manifestUrl":"https://manifests.credlink.com/sha256:...","manifestHash":"..."}
```

---

## 📅 Day-by-Day Breakdown

### **Day 1 (Monday): Rebranding - Part 1** 
**Time:** 4-6 hours  
**Difficulty:** Medium  
**Can Break Everything:** Yes

#### Morning (8am-12pm): Preparation & Automated Rename

```bash
# 1. BEFORE ANYTHING: Commit and backup
cd /Users/nicoladebbia/Code_Ideas/CredLink
git status
git add -A
git commit -m "checkpoint: pre-week-1 state"
git tag week-0-final
git push origin week-0-final

# 2. Create backup
cd ..
tar -czf CredLink-backup-$(date +%Y%m%d).tar.gz CredLink/
cd CredLink

# 3. Make scripts executable
chmod +x scripts/*.sh

# 4. Run rebranding script
bash scripts/rename-branding.sh

# OUTPUT:
# ✅ Updated 42 package.json files
# ✅ Updated 350 TypeScript files
# ✅ Updated 18 Markdown files
# ✅ Updated 5 Go files
# ✅ Renamed CLI binary
# ⚠️  Manual steps needed (see below)
```

#### Afternoon (1pm-5pm): Fix Broken Imports

**HARSH REALITY:** The script changed names, but imports are broken.

```bash
# Try to build (WILL FAIL)
pnpm build

# You'll see 100+ errors like:
# Error: Cannot find module '@c2/utils'
# Error: Cannot find module '@c2/policy'
# etc.
```

**Fix Strategy:**

1. **Update root package.json:**
```json
{
  "name": "credlink",
  "version": "1.0.0",
  "workspaces": [
    "core/*",
    "ui/*",
    "integrations/*",
    "sdk/*",
    "tests/*"
  ]
}
```

2. **Fix imports package-by-package:**
```bash
# Start with utils (fewest dependencies)
cd packages/utils  # or core/utils if moved
find src -name "*.ts" | xargs grep -l "@c2/"

# For each file, change:
# FROM: import { X } from '@c2/something';
# TO:   import { X } from '@credlink/something';

# Update package.json name:
{
  "name": "@credlink/utils",  // was @c2/utils
  ...
}

# Build to test
pnpm build

# If successful, move to next package
cd ../policy
# Repeat process
```

**Time estimate:** 30 min per package × 20 packages = **10 hours**

**End of Day 1 Target:**
- [ ] Rebranding script run
- [ ] At least 5 packages renamed and building
- [ ] Understand the scope of import fixes needed

---

### **Day 2 (Tuesday): Rebranding - Part 2**
**Time:** 6-8 hours  
**Difficulty:** High  
**Tedious:** Maximum

#### All Day: Finish Import Fixes

Continue fixing imports for remaining packages.

**Efficiency tip:**
```bash
# Search and replace in bulk (carefully!)
find core -name "*.ts" -type f -exec sed -i '' 's/@c2\//@credlink\//g' {} \;

# But CHECK each change:
git diff core/

# If something looks wrong, revert and fix manually:
git checkout core/specific-file.ts
```

**Common issues you'll hit:**

1. **Circular dependencies:**
```typescript
// utils imports policy
// policy imports utils
// Build fails!

// Solution: Refactor to break cycle
// Move shared types to a new package: @credlink/types
```

2. **Path imports broken:**
```typescript
// This breaks after reorganization:
import { X } from '../../packages/utils';

// Fix:
import { X } from '@credlink/utils';
```

3. **Go module paths:**
```bash
cd cli
# Update go.mod:
module github.com/credlink/cli  // was github.com/credlink/cli

# Update all Go files:
find . -name "*.go" -exec sed -i '' 's/credlink/credlink/g' {} \;

# Tidy dependencies:
go mod tidy

# Test build:
go build -o bin/credlink main.go
./bin/credlink --version
# Should output: credlink version 1.0.0
```

**End of Day 2 Target:**
- [ ] ALL packages renamed
- [ ] ALL imports fixed
- [ ] `pnpm build` succeeds (may have warnings, but no errors)
- [ ] Go CLI compiles and runs
- [ ] GitHub repo renamed

**Commit:**
```bash
git add -A
git commit -m "rebrand: complete rename from CredLink to CredLink

- Updated all package names to @credlink/* scope  
- Fixed all import paths
- Renamed CLI binary c2c → credlink
- Updated Go module paths
- Build succeeds with zero errors

Breaking changes:
- All package names changed
- Import paths updated throughout codebase"

git push origin main
```

---

### **Day 3 (Wednesday): Folder Reorganization - Part 1**
**Time:** 4-6 hours  
**Difficulty:** Medium  
**Risk:** High (easy to lose files)

#### Morning: Create Structure & Move Core Services

```bash
# 1. Clean build artifacts first
pnpm clean
find . -name "dist" -o -name "build" -type d -exec rm -rf {} +

# 2. Create new structure
mkdir -p core/{signer,verify,manifest-store,policy-engine}
mkdir -p integrations/{cms,browser-extension,mobile}
mkdir -p ui/{badge,admin,landing}
mkdir -p sdk/{javascript,python,go}
mkdir -p tests/{acceptance,integration,e2e,fixtures}
mkdir -p docs/{api,guides,compliance,assets}
mkdir -p archive/{experiments,phase-drafts,old-docs}

# 3. Move core services (carefully!)
# Only move if directory exists:
[ -d "apps/verify-api" ] && git mv apps/verify-api core/verify
[ -d "packages/manifest-store" ] && git mv packages/manifest-store core/manifest-store
[ -d "apps/policy" ] && git mv apps/policy core/policy-engine

# 4. Move UI components
[ -d "packages/c2-badge" ] && git mv packages/c2-badge ui/badge
[ -d "ui/admin" ] && echo "Admin already in place" || \
  [ -d "packages/admin" ] && git mv packages/admin ui/admin

# 5. Verify moves
ls -la core/
ls -la ui/
```

#### Afternoon: Archive Phase Folders

```bash
# Move ALL experimental phase folders
for dir in phase5{1..9}-*/ phase60-*/; do
  [ -d "$dir" ] && git mv "$dir" archive/experiments/
done

# Move phase completion docs
git mv PHASE-*-COMPLETE.md archive/old-docs/ 2>/dev/null || true

# Move temp folders
[ -d "temp-verification" ] && git mv temp-verification archive/experiments/

# Delete truly empty/useless folders
find apps packages -type d -empty -delete
```

**End of Day 3 Target:**
- [ ] New folder structure created
- [ ] Core services moved to `core/`
- [ ] UI components moved to `ui/`
- [ ] Phase folders archived
- [ ] Old structure mostly gone

---

### **Day 4 (Thursday): Folder Reorganization - Part 2**
**Time:** 6-8 hours  
**Difficulty:** Very High  
**Most Painful Day:** Yes

#### All Day: Fix Import Paths After Reorganization

**THE WORST PART OF WEEK 1.** Every moved file has broken imports.

```bash
# 1. Update workspace config
# package.json:
{
  "workspaces": [
    "core/*",
    "ui/*",
    "integrations/cms/*",
    "sdk/*",
    "tests/acceptance"
  ]
}

# 2. Reinstall dependencies
rm -rf node_modules pnpm-lock.yaml
pnpm install

# 3. Try to build (WILL FAIL MASSIVELY)
pnpm build

# You'll see errors like:
# core/verify/src/index.ts:5:23 - error TS2307: Cannot find module '../../../packages/utils'
# ui/badge/src/badge.ts:2:25 - error TS2307: Cannot find module '@credlink/policy'
```

**Fix each package one-by-one:**

```typescript
// Example: core/verify/src/index.ts

// BEFORE (broken):
import { log } from '../../../packages/utils';
import { Policy } from '../../apps/policy/types';

// AFTER (fixed):
import { log } from '@credlink/utils';  // If utils is a workspace package
import { Policy } from '@credlink/policy-engine';  // Updated path
```

**Process:**
1. `cd core/verify`
2. `pnpm build` (see errors)
3. Fix all imports in that package
4. `pnpm build` (repeat until clean)
5. Move to next package

**Time:** 45 min per package × 15 packages = **11 hours**

**End of Day 4 Target:**
- [ ] At least 50% of packages building successfully
- [ ] Understand all import path changes needed
- [ ] No more "cannot find module" errors in fixed packages

---

### **Day 5 (Friday): Finish Reorganization & Cloudflare Setup**
**Time:** 6-8 hours  
**Difficulty:** Medium

#### Morning: Finish Import Fixes

Continue from Day 4 until ALL packages build.

```bash
# Final verification:
pnpm build

# Should see:
# ✓ Built @credlink/utils
# ✓ Built @credlink/policy-engine
# ✓ Built @credlink/verify
# ✓ Built @credlink/badge
# ... (all packages)

# Run tests (some will fail - that's OK)
pnpm test
```

**Commit reorganization:**
```bash
git add -A
git commit -m "refactor: reorganize to production folder structure

- Moved core services to core/
- Moved UI to ui/
- Archived experimental phase folders
- Fixed all import paths
- Updated workspace configuration
- Build succeeds with zero errors

BREAKING CHANGE: All import paths updated"

git push origin main
```

#### Afternoon: Cloudflare Setup

```bash
# 1. Install Wrangler
pnpm add -g wrangler

# 2. Login
wrangler login

# 3. Create R2 bucket
wrangler r2 bucket create credlink-manifests

# 4. Test upload/download
echo "test content" > test.txt
wrangler r2 object put credlink-manifests/test.txt --file test.txt
wrangler r2 object get credlink-manifests/test.txt
rm test.txt

# 5. Initialize Worker
cd core/manifest-store
wrangler init

# 6. Configure wrangler.toml
cat > wrangler.toml << 'EOF'
name = "credlink-manifest-store"
main = "src/index.ts"
compatibility_date = "2025-11-07"

[[r2_buckets]]
binding = "MANIFESTS"
bucket_name = "credlink-manifests"
EOF

# 7. Create basic Worker
cat > src/index.ts << 'EOF'
export interface Env {
  MANIFESTS: R2Bucket;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const hash = url.pathname.split('/').pop();
    
    if (!hash) {
      return new Response('Not found', { status: 404 });
    }
    
    const object = await env.MANIFESTS.get(`${hash}.c2pa`);
    
    if (!object) {
      return new Response('Not found', { status: 404 });
    }
    
    return new Response(object.body, {
      headers: {
        'Content-Type': 'application/cbor',
        'Cache-Control': 'public, max-age=31536000, immutable'
      }
    });
  }
};
EOF

# 8. Deploy
wrangler deploy

# 9. Test deployed Worker
curl https://credlink-manifest-store.your-subdomain.workers.dev/test
# Should return 404 (expected)
```

**End of Day 5 Target:**
- [ ] Full codebase builds successfully
- [ ] Cloudflare account created
- [ ] R2 bucket created and tested
- [ ] Worker deployed and responding
- [ ] Can upload/download from R2

---

### **Days 6-7 (Weekend): Implement ONE Service**
**Time:** 12-16 hours  
**Difficulty:** Very High  
**This is the Real Work:** Yes

#### Choose: Signer OR Verify

**Recommendation: Build Signer**
- You need signed content before you can verify
- Signer is the core value proposition
- More complex = more learning

#### Signer Implementation (Full Weekend)

**Saturday Morning: Setup & Dependencies**
```bash
cd core/signer
pnpm add c2pa-node      # C2PA library
pnpm add nanoid         # Request IDs
pnpm add zod            # Validation
pnpm add @aws-sdk/client-s3  # For R2 upload

pnpm add -D vitest tsx  # Testing
```

**Saturday Afternoon: Core Signing Logic**

Create `core/signer/src/sign.ts`:

```typescript
import { c2pa } from 'c2pa-node';
import crypto from 'crypto';

export async function signAsset(params: {
  assetBuffer: Buffer;
  creator: string;
}) {
  // 1. Validate
  if (!params.assetBuffer || params.assetBuffer.length === 0) {
    throw new Error('Empty asset');
  }

  // 2. Hash content
  const hash = crypto.createHash('sha256')
    .update(params.assetBuffer)
    .digest('hex');

  // 3. Create manifest
  const manifest = {
    assertions: [{
      label: 'c2pa.actions',
      data: {
        actions: [{
          action: 'c2pa.created',
          when: new Date().toISOString()
        }]
      }
    }]
  };

  // 4. Sign (this is simplified - actual C2PA is complex)
  const signed = await c2pa.sign({
    asset: params.assetBuffer,
    manifest,
    privateKey: process.env.SIGNING_KEY
  });

  return { hash, signed };
}
```

**Saturday Evening: R2 Upload**

Create `core/signer/src/upload.ts`:

```typescript
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY!,
    secretAccessKey: process.env.R2_SECRET!
  }
});

export async function uploadToR2(
  manifest: Buffer,
  hash: string
): Promise<string> {
  await s3.send(new PutObjectCommand({
    Bucket: 'credlink-manifests',
    Key: `${hash}.c2pa`,
    Body: manifest,
    ContentType: 'application/cbor'
  }));

  return `https://manifests.credlink.com/${hash}.c2pa`;
}
```

**Sunday Morning: API Endpoint**

Create `core/signer/src/api.ts`:

```typescript
import { Hono } from 'hono';
import { signAsset } from './sign';
import { uploadToR2 } from './upload';

const app = new Hono();

app.post('/sign', async (c) => {
  const { assetUrl, creator } = await c.req.json();

  // Fetch asset
  const response = await fetch(assetUrl);
  const buffer = Buffer.from(await response.arrayBuffer());

  // Sign
  const { hash, signed } = await signAsset({
    assetBuffer: buffer,
    creator
  });

  // Upload
  const manifestUrl = await uploadToR2(signed, hash);

  return c.json({
    manifestUrl,
    manifestHash: hash,
    signedAt: new Date().toISOString()
  });
});

export default app;
```

**Sunday Afternoon: Deploy & Test**

```bash
# Deploy to Cloudflare
cd core/signer
wrangler deploy

# Test
curl -X POST https://credlink-signer.your-subdomain.workers.dev/sign \
  -H "Content-Type: application/json" \
  -d '{
    "assetUrl": "https://picsum.photos/400/300",
    "creator": "test@example.com"
  }'

# Should return:
# {
#   "manifestUrl": "https://manifests.credlink.com/sha256:...",
#   "manifestHash": "abc123...",
#   "signedAt": "2025-11-08T..."
# }
```

**End of Weekend Target:**
- [ ] Signer service implemented
- [ ] Deployed to Cloudflare
- [ ] Can sign a real image
- [ ] Manifest uploaded to R2
- [ ] Can fetch manifest from R2
- [ ] Entire flow works end-to-end

---

## 🎯 Week 1 Final Checklist

Run these commands to verify everything works:

```bash
# 1. Branding check (should return 0)
grep -r "CredLink\|@c2/" --exclude-dir=node_modules --exclude-dir=.git | wc -l

# 2. Structure check
ls -la
# Should see: core/, ui/, integrations/, sdk/, tests/, docs/
# Should NOT see: apps/, packages/, phase51-*, etc.

# 3. Build check
pnpm build
# Should complete with zero errors

# 4. Cloudflare check
wrangler r2 bucket list | grep credlink-manifests

# 5. Service check (Signer example)
curl -X POST https://your-signer.workers.dev/sign \
  -H "Content-Type: application/json" \
  -d '{"assetUrl":"https://picsum.photos/200","creator":"test@example.com"}'
# Should return valid JSON with manifestUrl
```

---

## 💰 Week 1 Costs

- **Cloudflare:** $5/month (Workers + R2)
- **Domain:** $0-12 (optional, can use .workers.dev)
- **Tools:** $0 (all free tier)
- **Total:** ~$5

---

## 📊 Time Investment Reality Check

**Minimum (expert):** 40 hours  
**Realistic (solo dev):** 60 hours  
**With debugging:** 80 hours

**If working:**
- **Full-time (40h/week):** 1 week
- **Part-time (20h/week):** 2 weeks
- **Evenings (10h/week):** 4 weeks

---

## 🚨 When Things Go Wrong

### "Build fails with 100+ errors"
```bash
# Start over from last good commit
git reset --hard pre-reorganize
# Or restore from backup
```

### "Imports are completely broken"
```bash
# Nuclear option: Delete and reinstall
rm -rf node_modules pnpm-lock.yaml
pnpm install
pnpm build
```

### "Wrangler deploy fails"
```bash
# Check credentials
wrangler whoami

# Re-login
wrangler logout
wrangler login
```

### "C2PA library won't work"
```bash
# Fallback: Skip real signing for Week 1
# Just create mock manifests
# Get real signing working in Week 2
```

---

## ✅ Week 1 Success = You Can Ship Week 2

If you finish Week 1 with:
- Clean codebase (renamed & reorganized)
- Cloudflare infrastructure working
- ONE service deployed and responding

Then Week 2-4 is just "more of the same":
- Week 2: Build the other services
- Week 3: Build the badge
- Week 4: Polish and launch

**Week 1 is the hardest. After this, it's just execution.**

---

**NOW GO. START DAY 1. NO MORE PLANNING.**
