# Turbo Remote Caching Setup Guide

## Overview
This guide explains how to configure Turbo remote caching to significantly speed up CI/CD builds by caching build artifacts across pipeline runs.

## Prerequisites
- Access to Vercel account (for free remote caching)
- Admin access to GitHub repository settings

## Step 1: Get Vercel Team and Token

### Option A: Using Vercel (Recommended - Free)
1. Sign in to [Vercel Dashboard](https://vercel.com/dashboard)
2. Navigate to your team settings
3. Find your **Team ID** in the settings page
4. Generate a **Personal Access Token**:
   - Go to Settings → Tokens
   - Click "Create Token"
   - Give it a name like "CredLink CI Cache"
   - Copy the generated token

### Option B: Self-hosted Remote Cache
If you prefer self-hosted caching, you can use any S3-compatible storage:
```bash
# Example using AWS S3
TURBO_API_URL=https://your-remote-cache.com/api
```

## Step 2: Configure GitHub Secrets

1. Navigate to your GitHub repository
2. Go to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret** and add:

### Required Secrets
| Secret Name | Value | Description |
|-------------|-------|-------------|
| `TURBO_TEAM` | Your Vercel Team ID | Vercel team identifier |
| `TURBO_TOKEN` | Your Vercel Token | Authentication token |

### Optional Secrets (for self-hosted)
| Secret Name | Value | Description |
|-------------|-------|-------------|
| `TURBO_API_URL` | Remote cache URL | Self-hosted cache endpoint |

## Step 3: Verify Configuration

### Local Testing
```bash
# Test remote caching locally
export TURBO_TEAM="your-team-id"
export TURBO_TOKEN="your-token"
pnpm build
```

### CI/CD Testing
1. Push a change to trigger the CI pipeline
2. Check the build logs for:
   ```
   • Remote caching enabled
   • Cached (Remote): true
   ```
3. Subsequent builds should show significant speed improvements

## Step 4: Monitor Cache Performance

### Cache Hit Rate
Monitor the build logs for cache performance:
```
• Packages in scope: 17
• Running build in 17 packages
• Remote caching enabled
• Cached (Remote): 12/17
• Time: 2.3s (was 45.7s)
```

### Expected Performance Gains
- **First build**: Full build time (~45-60 seconds)
- **Cached builds**: 70-90% faster (~5-10 seconds)
- **Partial changes**: Only affected packages rebuild

## Troubleshooting

### Common Issues

#### 1. "Remote caching disabled"
**Cause**: Missing or incorrect environment variables
**Solution**: Verify secrets are correctly set in GitHub settings

#### 2. "Authentication failed"
**Cause**: Invalid token or team ID
**Solution**: 
- Verify token has proper permissions
- Check team ID matches Vercel dashboard
- Regenerate token if necessary

#### 3. Cache size limits exceeded
**Cause**: Too many cached artifacts
**Solution**: 
- Configure cache cleanup in Vercel settings
- Use `.turboignore` to exclude unnecessary files

### Debug Commands
```bash
# Force rebuild cache
pnpm build --force

# Check cache status
pnpm turbo status

# Clear local cache
rm -rf .turbo
```

## Security Considerations

- **Token Rotation**: Rotate tokens quarterly
- **Access Control**: Limit token permissions to read/write cache only
- **Audit Logs**: Monitor Vercel dashboard for unusual cache activity

## Cost Optimization

### Vercel Free Tier (Recommended)
- **Storage**: 1GB cache storage
- **Bandwidth**: 100GB/month transfer
- **Cost**: $0/month

### Paid Tier (if needed)
- Additional storage and bandwidth available
- Typically $20/month for enterprise usage

## Configuration Files

### Updated Workflows
The following workflows have been updated with remote caching:
- `.github/workflows/ci.yml`
- `.github/workflows/ci-phase46.yml`
- `.github/workflows/phase4-ci.yml`

### Environment Variables
```yaml
env:
  TURBO_TEAM: ${{ secrets.TURBO_TEAM }}
  TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }}
```

## Support

- **Vercel Documentation**: https://turbo.build/repo/docs/core-concepts/caching
- **GitHub Actions Documentation**: https://docs.github.com/en/actions
- **CredLink Internal**: Contact DevOps team for assistance

---

**Expected Results**: After setup, CI/CD builds should be 70-90% faster on average, with significant improvements in developer experience and deployment velocity.
