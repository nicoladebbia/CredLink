# C2PA Integration Notes

## Status: MOCK IMPLEMENTATION

**⚠️ CRITICAL:** This is a simplified mock implementation for structure demonstration.

## Real C2PA Libraries to Evaluate:

1. **c2pa-node** (Adobe/ContentAuth)
   - Official C2PA implementation
   - Requires native binaries
   - Most complete implementation
   - URL: https://github.com/contentauth/c2pa-node

2. **c2pa-js** (Web Assembly)
   - Browser-compatible
   - Lighter weight
   - May have limitations

3. **Manual Implementation**
   - Use crypto libraries directly
   - Follow C2PA spec: https://c2pa.org/specifications/
   - More control but more complex

## Current Mock Implementation

The current `c2pa-service.ts` provides:
- ✅ Structure for signing workflow
- ✅ Type definitions
- ✅ Mock manifest generation
- ⚠️ Placeholder for actual C2PA signing

## Next Steps for Production:

1. Install c2pa-node: `pnpm add c2pa-node`
2. Generate or obtain signing certificates
3. Replace mock functions with real C2PA calls
4. Test with actual C2PA verification tools
5. Measure real survival rates

## Why Mock for Now:

- C2PA libraries require native dependencies
- Need proper key management setup
- Allows testing full application flow
- Can be swapped with real implementation later

**Timeline:** Replace mock with real C2PA in Week 2-3 of implementation.
