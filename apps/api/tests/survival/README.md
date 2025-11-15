# Survival Rate Testing Framework

## Purpose

Measures how well C2PA manifests survive through various image transformations and platform uploads.

## Current Status: MOCK IMPLEMENTATION

⚠️ **IMPORTANT:** The current implementation uses mock transformations that simply return the original buffer. This is intentional to:

1. Demonstrate the testing structure
2. Allow tests to run without external dependencies
3. Provide a framework for real testing
4. Document the methodology

**Real survival rates can only be measured with:**
- Real C2PA implementation (not mock)
- Actual image processing libraries (Sharp, ImageMagick)
- Actual platform APIs (Twitter, Instagram, etc.)

## Test Scenarios

The framework tests survival through 10 common transformations:

1. **ImageOptim Compression** - Lossy compression optimization
2. **TinyPNG Compression** - PNG compression service
3. **Cloudflare Optimization** - CDN image optimization
4. **Twitter Upload** - Twitter's compression algorithm
5. **Instagram Filter** - Instagram filters and compression
6. **WhatsApp Compression** - WhatsApp's aggressive compression
7. **Format Conversion** - JPEG → PNG → JPEG
8. **50% Downscale** - Image size reduction
9. **Center Crop** - Cropping transformation
10. **90° Rotation** - Rotation transformation

## Running Tests

### Mock Tests (Current)

```bash
# Run survival tests with small iteration count
cd apps/sign-service
pnpm test survival-rates.test.ts

# Run with custom iteration count
# (edit the test file to change iterations)
```

**Expected Results (Mock):**
- Survival rate: 0% (because mock implementation doesn't embed manifests)
- All tests pass (testing structure, not actual survival)

### Production Tests (Future)

```bash
# After implementing real C2PA:

# 1. Install dependencies
pnpm add sharp imagemagick tinify

# 2. Set up API keys
export TINYPNG_API_KEY=your_key_here
export TWITTER_API_KEY=your_key_here

# 3. Prepare test images
mkdir -p fixtures/survival-test-images
# Add diverse test images (different sizes, formats, content)

# 4. Run with production iteration count
node dist/tests/survival/run-survival-tests.js --iterations=1000

# 5. View report
cat survival-reports/survival-*.json
```

## Interpreting Results

### Survival Rate Calculation

```typescript
survivalRate = (manifestsRecovered / totalIterations) * 100
```

### Expected Ranges (Production)

Based on C2PA specification and industry experience:

- **Excellent (90-100%):** Rotation, lossless transforms
- **Good (70-89%):** Mild compression, resizing
- **Fair (50-69%):** Heavy compression, format conversion
- **Poor (0-49%):** Aggressive compression, extreme transformations

### Important Notes

1. **Honest Reporting:** Only report actually measured rates
2. **Sample Size:** Use 1,000+ iterations per scenario
3. **Test Images:** Use diverse, realistic images
4. **Platform Changes:** Platforms update compression algorithms
5. **Re-testing:** Re-measure quarterly for accuracy

## Report Structure

```json
{
  "totalScenarios": 10,
  "totalIterations": 10000,
  "overallSurvivalRate": 85.4,
  "results": [
    {
      "scenario": "ImageOptim Compression",
      "iterations": 1000,
      "survived": 950,
      "failed": 50,
      "survivalRate": 95.0,
      "averageProcessingTime": 234,
      "timestamp": "2024-11-10T12:00:00Z"
    }
  ],
  "timestamp": "2024-11-10T12:00:00Z",
  "implementation": "real"
}
```

## Production Implementation Checklist

### Phase 1: Real Image Processing
- [ ] Install Sharp library
- [ ] Implement real resize/crop/rotate
- [ ] Implement format conversion
- [ ] Test basic transformations

### Phase 2: Compression Services
- [ ] Set up TinyPNG API
- [ ] Implement ImageOptim simulation
- [ ] Implement Cloudflare simulation
- [ ] Measure compression survival

### Phase 3: Platform Testing
- [ ] Twitter API integration (if possible)
- [ ] Instagram simulation
- [ ] WhatsApp algorithm matching
- [ ] Measure platform survival

### Phase 4: Real C2PA Integration
- [ ] Replace mock C2PA with c2pa-node
- [ ] Implement real manifest embedding
- [ ] Implement real manifest extraction
- [ ] Verify end-to-end survival

### Phase 5: Production Testing
- [ ] Create diverse test image set
- [ ] Run 1,000+ iterations per scenario
- [ ] Collect and analyze results
- [ ] Document actual survival rates

### Phase 6: Documentation
- [ ] Update README with real rates
- [ ] Create survival rate dashboard
- [ ] Add methodology documentation
- [ ] Schedule quarterly re-testing

## Code Structure

```
survival/
├── README.md                    # This file
├── survival-rate-tester.ts      # Core testing framework
├── survival-rates.test.ts       # Jest tests
└── run-survival-tests.ts        # CLI tool (future)
```

## Example Usage (Production)

```typescript
import { measureSurvivalRates, saveSurvivalReport } from './survival-rate-tester';

// Load test images
const testImages = await loadTestImages('./fixtures/survival-test-images/');

// Run complete test suite with 1,000 iterations per scenario
const report = await measureSurvivalRates(1000, testImages);

console.log(`Overall Survival Rate: ${report.overallSurvivalRate.toFixed(2)}%`);

// Show detailed results
report.results.forEach(result => {
  console.log(`${result.scenario}: ${result.survivalRate.toFixed(2)}%`);
});

// Save report
saveSurvivalReport(report, `survival-${Date.now()}.json`);

// Update documentation
await updateDocumentationWithRealRates(report);
```

## Honest Measurement Principles

1. **Never Claim Unmeasured Rates:** Don't say "99.9% survival" unless measured
2. **Document Methodology:** Explain how tests were conducted
3. **Specify Sample Size:** Always report iteration count
4. **Note Implementation:** Clearly mark mock vs real
5. **Regular Updates:** Re-test quarterly as platforms change
6. **Realistic Expectations:** Some scenarios will have low survival
7. **Failure Analysis:** Document why certain scenarios fail

## Common Pitfalls to Avoid

❌ Claiming theoretical survival rates  
❌ Using small sample sizes (<100 iterations)  
❌ Testing with mock implementation only  
❌ Not re-testing after platform changes  
❌ Exaggerating results in marketing  
❌ Ignoring failure scenarios  
❌ Not documenting test methodology  

✅ Measure with real C2PA  
✅ Use 1,000+ iterations  
✅ Test diverse images  
✅ Report actual results  
✅ Re-test regularly  
✅ Be honest about limitations  
✅ Document everything  

## Timeline for Production

**Week 1: Real Image Processing**
- Implement Sharp transformations
- Basic survival tests

**Week 2: Compression Services**
- TinyPNG, ImageOptim
- Measure compression survival

**Week 3: Platform Simulation**
- Twitter, Instagram algorithms
- Measure platform survival

**Week 4: Real C2PA + Testing**
- Integrate c2pa-node
- Run production tests (1,000+ iterations)
- Generate real survival report

**Week 5: Documentation**
- Update all docs with real rates
- Create survival rate dashboard
- Write methodology documentation

## Support

For questions about survival rate testing:
1. See [C2PA Specification](https://c2pa.org/specifications/)
2. Check `apps/sign-service/README.md`
3. Review test results in `survival-reports/`
4. Open an issue on GitHub

---

**Remember:** Only claim survival rates that have been actually measured with real C2PA implementation and real image transformations. Honesty is paramount.
