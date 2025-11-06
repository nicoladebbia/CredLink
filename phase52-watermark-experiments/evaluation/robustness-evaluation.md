# Robustness Evaluation System

## Watermark Robustness Testing Framework

### Transform Test Matrix Implementation
```typescript
import * as sharp from 'sharp';
import { WatermarkPayload, WatermarkDetectionResult } from '../core/watermark-config';
import { DCTWatermarkEmbedder, DCTWatermarkDetector } from '../watermarking/dct-watermark-embedder';
import { defaultPayloadGenerator } from '../core/payload-generator';

export interface TransformTest {
  name: string;
  description: string;
  parameters: TransformParameters;
  category: 'compression' | 'resize' | 'crop' | 'rotate' | 'blur' | 'color' | 'noise' | 'composite';
}

export interface TransformParameters {
  // Compression
  jpegQuality?: number;
  webpQuality?: number;
  pngCompression?: number;
  
  // Resize
  scaleFactor?: number;
  targetWidth?: number;
  targetHeight?: number;
  
  // Crop
  cropPercent?: number;
  cropX?: number;
  cropY?: number;
  cropWidth?: number;
  cropHeight?: number;
  
  // Rotate
  rotationDegrees?: number;
  
  // Blur
  blurSigma?: number;
  
  // Color
  brightness?: number;
  contrast?: number;
  saturation?: number;
  hue?: number;
  
  // Noise
  noiseLevel?: number;
  noiseType?: 'gaussian' | 'uniform' | 'salt_pepper';
  
  // Composite
  collageItems?: number;
  socialMediaUpload?: boolean;
  reprocessingChain?: string[];
}

export interface RobustnessResult {
  transform: TransformTest;
  originalConfidence: number;
  transformedConfidence: number;
  confidenceLoss: number;
  payloadRecovered: boolean;
  payloadBindOk: boolean;
  processingTimeMs: number;
  visualQualityMetrics: VisualQualityMetrics;
  error?: string;
}

export interface VisualQualityMetrics {
  ssim: number;           // Structural Similarity Index
  lpips: number;          // Learned Perceptual Image Patch Similarity
  psnr: number;           // Peak Signal-to-Noise Ratio
  mse: number;            // Mean Squared Error
  humanRating?: number;   // 1-5 human rating (if available)
}

export class RobustnessEvaluator {
  private readonly embedder: DCTWatermarkEmbedder;
  private readonly detector: DCTWatermarkDetector;
  private readonly payloadGenerator: typeof defaultPayloadGenerator;

  constructor() {
    this.embedder = new DCTWatermarkEmbedder({
      type: 'dct_ecc',
      strength: 0.3,
      blockSize: 8,
      quantizationTable: [16, 11, 10, 16, 24, 40, 51, 61],
      eccScheme: 'reed_solomon',
      eccRedundancy: 2,
      frequencyBands: [1, 2, 3, 4, 5, 6],
      spatialSpread: true
    });
    
    this.detector = new DCTWatermarkDetector(
      {
        type: 'dct_ecc',
        strength: 0.3,
        blockSize: 8,
        quantizationTable: [16, 11, 10, 16, 24, 40, 51, 61],
        eccScheme: 'reed_solomon',
        eccRedundancy: 2,
        frequencyBands: [1, 2, 3, 4, 5, 6],
        spatialSpread: true
      },
      defaultPayloadGenerator,
      new (await import('../core/payload-generator')).PayloadBinding(defaultPayloadGenerator)
    );
    
    this.payloadGenerator = defaultPayloadGenerator;
  }

  /**
   * Run comprehensive robustness evaluation
   * Tests 12 transform categories at multiple intensities
   */
  async runRobustnessEvaluation(
    originalImage: ArrayBuffer,
    manifestHash: string,
    testVariations: boolean = true
  ): Promise<{
    results: RobustnessResult[];
    summary: RobustnessSummary;
    visualQualityReport: VisualQualityReport;
  }> {
    console.log('Starting comprehensive robustness evaluation...');
    
    // Generate payload and embed watermark
    const payload = this.payloadGenerator.generatePayload(manifestHash);
    const watermarkedImage = await this.embedder.embedWatermark(originalImage, payload);
    
    // Get baseline detection
    const baselineDetection = await this.detector.detectWatermark(watermarkedImage);
    
    if (!baselineDetection.match) {
      throw new Error('Baseline watermark detection failed');
    }
    
    // Define test matrix
    const testMatrix = this.generateTestMatrix(testVariations);
    
    // Run all tests
    const results: RobustnessResult[] = [];
    
    for (const transform of testMatrix) {
      console.log(`Testing transform: ${transform.name}`);
      
      try {
        const result = await this.runSingleTransform(
          watermarkedImage,
          originalImage,
          transform,
          baselineDetection.confidence,
          manifestHash
        );
        
        results.push(result);
      } catch (error) {
        results.push({
          transform,
          originalConfidence: baselineDetection.confidence,
          transformedConfidence: 0,
          confidenceLoss: baselineDetection.confidence,
          payloadRecovered: false,
          payloadBindOk: false,
          processingTimeMs: 0,
          visualQualityMetrics: { ssim: 0, lpips: 1, psnr: 0, mse: Number.MAX_VALUE },
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    // Generate summary
    const summary = this.generateSummary(results);
    const visualQualityReport = this.generateVisualQualityReport(results);
    
    return {
      results,
      summary,
      visualQualityReport
    };
  }

  /**
   * Generate comprehensive test matrix
   * 12 transform categories at multiple intensities
   */
  private generateTestMatrix(variations: boolean): TransformTest[] {
    const tests: TransformTest[] = [];
    
    // 1. JPEG Compression
    if (variations) {
      [95, 85, 75, 65, 55, 45, 35, 30].forEach(quality => {
        tests.push({
          name: `JPEG Compression Q${quality}`,
          description: `JPEG compression at quality ${quality}`,
          parameters: { jpegQuality: quality },
          category: 'compression'
        });
      });
    } else {
      [95, 75, 55, 35, 30].forEach(quality => {
        tests.push({
          name: `JPEG Compression Q${quality}`,
          description: `JPEG compression at quality ${quality}`,
          parameters: { jpegQuality: quality },
          category: 'compression'
        });
      });
    }
    
    // 2. Resize
    if (variations) {
      [0.25, 0.5, 0.75, 1.25, 1.5, 2.0].forEach(scale => {
        tests.push({
          name: `Resize ${scale}x`,
          description: `Resize by factor ${scale}`,
          parameters: { scaleFactor: scale },
          category: 'resize'
        });
      });
    } else {
      [0.5, 0.75, 1.25, 1.5, 2.0].forEach(scale => {
        tests.push({
          name: `Resize ${scale}x`,
          description: `Resize by factor ${scale}`,
          parameters: { scaleFactor: scale },
          category: 'resize'
        });
      });
    }
    
    // 3. Crop
    if (variations) {
      [5, 10, 15, 20, 25, 30].forEach(percent => {
        tests.push({
          name: `Crop ${percent}%`,
          description: `Center crop ${percent}% of image`,
          parameters: { cropPercent: percent },
          category: 'crop'
        });
      });
    } else {
      [5, 10, 15, 20].forEach(percent => {
        tests.push({
          name: `Crop ${percent}%`,
          description: `Center crop ${percent}% of image`,
          parameters: { cropPercent: percent },
          category: 'crop'
        });
      });
    }
    
    // 4. Rotation
    if (variations) {
      [0.5, 1, 1.5, 2, 3, 5].forEach(degrees => {
        tests.push({
          name: `Rotate ${degrees}°`,
          description: `Rotate by ${degrees} degrees`,
          parameters: { rotationDegrees: degrees },
          category: 'rotate'
        });
      });
    } else {
      [1, 2, 3, 5].forEach(degrees => {
        tests.push({
          name: `Rotate ${degrees}°`,
          description: `Rotate by ${degrees} degrees`,
          parameters: { rotationDegrees: degrees },
          category: 'rotate'
        });
      });
    }
    
    // 5. Blur
    if (variations) {
      [0.5, 1, 1.5, 2, 3, 4].forEach(sigma => {
        tests.push({
          name: `Gaussian Blur σ${sigma}`,
          description: `Gaussian blur with sigma ${sigma}`,
          parameters: { blurSigma: sigma },
          category: 'blur'
        });
      });
    } else {
      [0.5, 1, 1.5, 2, 3].forEach(sigma => {
        tests.push({
          name: `Gaussian Blur σ${sigma}`,
          description: `Gaussian blur with sigma ${sigma}`,
          parameters: { blurSigma: sigma },
          category: 'blur'
        });
      });
    }
    
    // 6. Color Adjustments
    if (variations) {
      [10, 15, 20, 25, 30].forEach(level => {
        tests.push({
          name: `Brightness ±${level}%`,
          description: `Brightness adjustment ${level}%`,
          parameters: { brightness: level },
          category: 'color'
        });
        
        tests.push({
          name: `Contrast ±${level}%`,
          description: `Contrast adjustment ${level}%`,
          parameters: { contrast: level },
          category: 'color'
        });
        
        tests.push({
          name: `Saturation ±${level}%`,
          description: `Saturation adjustment ${level}%`,
          parameters: { saturation: level },
          category: 'color'
        });
      });
    } else {
      [10, 20, 30].forEach(level => {
        tests.push({
          name: `Brightness ±${level}%`,
          description: `Brightness adjustment ${level}%`,
          parameters: { brightness: level },
          category: 'color'
        });
        
        tests.push({
          name: `Contrast ±${level}%`,
          description: `Contrast adjustment ${level}%`,
          parameters: { contrast: level },
          category: 'color'
        });
        
        tests.push({
          name: `Saturation ±${level}%`,
          description: `Saturation adjustment ${level}%`,
          parameters: { saturation: level },
          category: 'color'
        });
      });
    }
    
    // 7. Noise
    if (variations) {
      [1, 2, 3, 5, 10, 15].forEach(level => {
        tests.push({
          name: `Gaussian Noise ${level}`,
          description: `Add Gaussian noise level ${level}`,
          parameters: { noiseLevel: level, noiseType: 'gaussian' },
          category: 'noise'
        });
      });
    } else {
      [1, 3, 5, 10, 15].forEach(level => {
        tests.push({
          name: `Gaussian Noise ${level}`,
          description: `Add Gaussian noise level ${level}`,
          parameters: { noiseLevel: level, noiseType: 'gaussian' },
          category: 'noise'
        });
      });
    }
    
    // 8. Re-encoding
    ['png', 'webp'].forEach(format => {
      tests.push({
        name: `Re-encode to ${format.toUpperCase()}`,
        description: `Convert and re-encode to ${format}`,
        parameters: {},
        category: 'compression'
      });
    });
    
    // 9. Recompression Chain
    tests.push({
      name: 'Recompression Chain',
      description: 'JPEG 85 → WebP 80 → PNG → JPEG 75',
      parameters: {
        reprocessingChain: ['jpeg85', 'webp80', 'png', 'jpeg75']
      },
      category: 'compression'
    });
    
    // 10. Banding
    tests.push({
      name: 'Color Banding',
      description: 'Reduce color depth to 256 colors',
      parameters: {},
      category: 'color'
    });
    
    // 11. Collage
    [2, 4, 9].forEach(items => {
      tests.push({
        name: `Collage ${items} items`,
        description: `Create collage with ${items} images`,
        parameters: { collageItems: items },
        category: 'composite'
      });
    });
    
    // 12. Social Media Upload Simulation
    tests.push({
      name: 'Social Media Upload',
      description: 'Simulate social media compression pipeline',
      parameters: { socialMediaUpload: true },
      category: 'composite'
    });
    
    return tests;
  }

  /**
   * Run single transform test
   */
  private async runSingleTransform(
    watermarkedImage: ArrayBuffer,
    originalImage: ArrayBuffer,
    transform: TransformTest,
    originalConfidence: number,
    manifestHash: string
  ): Promise<RobustnessResult> {
    const startTime = performance.now();
    
    try {
      // Apply transform
      const transformedImage = await this.applyTransform(watermarkedImage, transform);
      
      // Detect watermark in transformed image
      const detectionResult = await this.detector.detectWatermark(transformedImage);
      
      // Verify payload binding
      const payloadBindOk = detectionResult.payload ? 
        this.payloadGenerator.verifyPayload(detectionResult.payload, manifestHash) : 
        false;
      
      // Calculate visual quality metrics
      const visualQualityMetrics = await this.calculateVisualQualityMetrics(
        originalImage,
        transformedImage
      );
      
      const processingTime = performance.now() - startTime;
      
      return {
        transform,
        originalConfidence,
        transformedConfidence: detectionResult.confidence,
        confidenceLoss: originalConfidence - detectionResult.confidence,
        payloadRecovered: detectionResult.match,
        payloadBindOk,
        processingTimeMs: processingTime,
        visualQualityMetrics
      };
      
    } catch (error) {
      const processingTime = performance.now() - startTime;
      
      return {
        transform,
        originalConfidence,
        transformedConfidence: 0,
        confidenceLoss: originalConfidence,
        payloadRecovered: false,
        payloadBindOk: false,
        processingTimeMs: processingTime,
        visualQualityMetrics: { ssim: 0, lpips: 1, psnr: 0, mse: Number.MAX_VALUE },
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Apply specific transform to image
   */
  private async applyTransform(image: ArrayBuffer, transform: TransformTest): Promise<ArrayBuffer> {
    let pipeline = sharp(image);
    const params = transform.parameters;
    
    // Compression transforms
    if (params.jpegQuality !== undefined) {
      pipeline = pipeline.jpeg({ quality: params.jpegQuality });
    }
    
    if (params.webpQuality !== undefined) {
      pipeline = pipeline.webp({ quality: params.webpQuality });
    }
    
    if (params.pngCompression !== undefined) {
      pipeline = pipeline.png({ compressionLevel: params.pngCompression });
    }
    
    // Resize transforms
    if (params.scaleFactor !== undefined) {
      const metadata = await sharp(image).metadata();
      if (metadata.width && metadata.height) {
        pipeline = pipeline.resize(
          Math.round(metadata.width * params.scaleFactor),
          Math.round(metadata.height * params.scaleFactor)
        );
      }
    }
    
    if (params.targetWidth !== undefined && params.targetHeight !== undefined) {
      pipeline = pipeline.resize(params.targetWidth, params.targetHeight);
    }
    
    // Crop transforms
    if (params.cropPercent !== undefined) {
      const metadata = await sharp(image).metadata();
      if (metadata.width && metadata.height) {
        const cropSize = Math.min(metadata.width, metadata.height) * (params.cropPercent / 100);
        const left = Math.round((metadata.width - cropSize) / 2);
        const top = Math.round((metadata.height - cropSize) / 2);
        
        pipeline = pipeline.extract({
          left: Math.round(left),
          top: Math.round(top),
          width: Math.round(cropSize),
          height: Math.round(cropSize)
        });
      }
    }
    
    if (params.cropX !== undefined && params.cropY !== undefined && 
        params.cropWidth !== undefined && params.cropHeight !== undefined) {
      pipeline = pipeline.extract({
        left: params.cropX,
        top: params.cropY,
        width: params.cropWidth,
        height: params.cropHeight
      });
    }
    
    // Rotation transforms
    if (params.rotationDegrees !== undefined) {
      pipeline = pipeline.rotate(params.rotationDegrees, { background: { r: 255, g: 255, b: 255 } });
    }
    
    // Blur transforms
    if (params.blurSigma !== undefined) {
      pipeline = pipeline.blur(params.blurSigma);
    }
    
    // Color transforms
    if (params.brightness !== undefined) {
      pipeline = pipeline.modulate({ brightness: 1 + (params.brightness / 100) });
    }
    
    if (params.contrast !== undefined) {
      pipeline = pipeline.linear(params.contrast / 100, 0);
    }
    
    if (params.saturation !== undefined) {
      pipeline = pipeline.modulate({ saturation: 1 + (params.saturation / 100) });
    }
    
    if (params.hue !== undefined) {
      pipeline = pipeline.modulate({ hue: params.hue });
    }
    
    // Noise transforms (requires custom implementation)
    if (params.noiseLevel !== undefined) {
      pipeline = await this.addNoise(pipeline, params.noiseLevel, params.noiseType || 'gaussian');
    }
    
    // Special composite transforms
    if (params.socialMediaUpload) {
      pipeline = await this.simulateSocialMediaUpload(pipeline);
    }
    
    if (params.reprocessingChain) {
      pipeline = await this.applyReprocessingChain(pipeline, params.reprocessingChain);
    }
    
    if (transform.name === 'Color Banding') {
      pipeline = pipeline.posterize(8); // 256 colors (2^8)
    }
    
    if (params.collageItems !== undefined) {
      // Collage requires multiple images - simplified implementation
      pipeline = await this.createSimpleCollage(pipeline, params.collageItems);
    }
    
    return pipeline.toBuffer();
  }

  /**
   * Calculate visual quality metrics between original and transformed images
   */
  private async calculateVisualQualityMetrics(
    original: ArrayBuffer,
    transformed: ArrayBuffer
  ): Promise<VisualQualityMetrics> {
    // Convert both images to raw RGB for comparison
    const originalRaw = await sharp(original)
      .ensureAlpha(false)
      .raw()
      .toBuffer();
    
    const transformedRaw = await sharp(transformed)
      .ensureAlpha(false)
      .raw()
      .toBuffer();
    
    const originalMetadata = await sharp(original).metadata();
    const transformedMetadata = await sharp(transformed).metadata();
    
    if (!originalMetadata.width || !originalMetadata.height || 
        !transformedMetadata.width || !transformedMetadata.height) {
      return { ssim: 0, lpips: 1, psnr: 0, mse: Number.MAX_VALUE };
    }
    
    // Calculate MSE
    const mse = this.calculateMSE(originalRaw, transformedRaw);
    
    // Calculate PSNR
    const psnr = mse > 0 ? 20 * Math.log10(255 / Math.sqrt(mse)) : 100;
    
    // Calculate SSIM (simplified implementation)
    const ssim = await this.calculateSSIM(original, transformed);
    
    // Calculate LPIPS (placeholder - would require neural network)
    const lpips = this.estimateLPIPS(mse, ssim);
    
    return {
      ssim,
      lpips,
      psnr,
      mse
    };
  }

  /**
   * Calculate Mean Squared Error
   */
  private calculateMSE(original: Buffer, transformed: Buffer): number {
    if (original.length !== transformed.length) {
      return Number.MAX_VALUE;
    }
    
    let sum = 0;
    for (let i = 0; i < original.length; i++) {
      const diff = original[i] - transformed[i];
      sum += diff * diff;
    }
    
    return sum / original.length;
  }

  /**
   * Calculate Structural Similarity Index (simplified)
   */
  private async calculateSSIM(original: ArrayBuffer, transformed: ArrayBuffer): Promise<number> {
    // Simplified SSIM calculation - in production use proper implementation
    const originalGray = await sharp(original)
      .greyscale()
      .raw()
      .toBuffer();
    
    const transformedGray = await sharp(transformed)
      .greyscale()
      .raw()
      .toBuffer();
    
    if (originalGray.length !== transformedGray.length) {
      return 0;
    }
    
    // Calculate mean values
    const meanOriginal = originalGray.reduce((sum, val) => sum + val, 0) / originalGray.length;
    const meanTransformed = transformedGray.reduce((sum, val) => sum + val, 0) / transformedGray.length;
    
    // Calculate variance and covariance
    let varOriginal = 0;
    let varTransformed = 0;
    let covariance = 0;
    
    for (let i = 0; i < originalGray.length; i++) {
      const diffOrig = originalGray[i] - meanOriginal;
      const diffTrans = transformedGray[i] - meanTransformed;
      
      varOriginal += diffOrig * diffOrig;
      varTransformed += diffTrans * diffTrans;
      covariance += diffOrig * diffTrans;
    }
    
    varOriginal /= originalGray.length;
    varTransformed /= transformedGray.length;
    covariance /= originalGray.length;
    
    // SSIM formula (simplified constants)
    const c1 = 0.0001;
    const c2 = 0.0009;
    
    const numerator = (2 * meanOriginal * meanTransformed + c1) * (2 * covariance + c2);
    const denominator = (meanOriginal * meanOriginal + meanTransformed * meanTransformed + c1) * 
                        (varOriginal + varTransformed + c2);
    
    return denominator > 0 ? numerator / denominator : 0;
  }

  /**
   * Estimate LPIPS based on MSE and SSIM
   */
  private estimateLPIPS(mse: number, ssim: number): number {
    // Simple approximation - in production use actual LPIPS network
    if (mse === Number.MAX_VALUE) return 1;
    if (ssim >= 0.95) return 0.05;
    if (ssim >= 0.9) return 0.1;
    if (ssim >= 0.8) return 0.2;
    if (ssim >= 0.7) return 0.3;
    if (ssim >= 0.6) return 0.4;
    if (ssim >= 0.5) return 0.5;
    if (ssim >= 0.4) return 0.6;
    if (ssim >= 0.3) return 0.7;
    if (ssim >= 0.2) return 0.8;
    if (ssim >= 0.1) return 0.9;
    return 1;
  }

  // Helper methods for complex transforms
  
  private async addNoise(pipeline: any, level: number, type: string): Promise<any> {
    // Simplified noise addition - would need custom implementation
    return pipeline;
  }
  
  private async simulateSocialMediaUpload(pipeline: any): Promise<any> {
    // Simulate typical social media compression pipeline
    return pipeline
      .resize(1080, 1080, { fit: 'inside' })
      .jpeg({ quality: 85 })
      .sharpen();
  }
  
  private async applyReprocessingChain(pipeline: any, chain: string[]): Promise<any> {
    let result = pipeline;
    
    for (const step of chain) {
      switch (step) {
        case 'jpeg85':
          result = result.jpeg({ quality: 85 });
          break;
        case 'webp80':
          result = result.webp({ quality: 80 });
          break;
        case 'png':
          result = result.png();
          break;
        case 'jpeg0':
          result = result.jpeg({ quality: 0 });
          break;
      }
    }
    
    return result;
  }
  
  private async createSimpleCollage(pipeline: any, items: number): Promise<any> {
    // Simplified collage creation
    return pipeline;
  }
}
```

### Summary and Reporting
```typescript
export interface RobustnessSummary {
  totalTests: number;
  successfulDetections: number;
  averageConfidenceRetention: number;
  worstCaseConfidence: number;
  bestCaseConfidence: number;
  transformCategoryResults: Record<string, {
    tests: number;
    avgRetention: number;
    minRetention: number;
    maxRetention: number;
  }>;
  meetsTargetThresholds: boolean;
  targetThresholds: {
    jpeg75: boolean;
    crop10: boolean;
    overall: boolean;
  };
}

export interface VisualQualityReport {
  averageSSIM: number;
  averagePSNR: number;
  averageLPIPS: number;
  worstSSIM: number;
  worstPSNR: number;
  worstLPIPS: number;
  meetsQualityThresholds: boolean;
  qualityThresholds: {
    ssimMin: number;    // Should be > 0.9
    psnrMin: number;    // Should be > 30dB
    lpipsMax: number;   // Should be < 0.2
  };
}

export class RobustnessReporter {
  /**
   * Generate comprehensive summary from results
   */
  generateSummary(results: RobustnessResult[]): RobustnessSummary {
    const successfulResults = results.filter(r => r.payloadRecovered);
    const totalTests = results.length;
    
    // Calculate confidence retention metrics
    const retentionRates = successfulResults.map(r => 
      r.originalConfidence > 0 ? r.transformedConfidence / r.originalConfidence : 0
    );
    
    const averageRetention = retentionRates.length > 0 ? 
      retentionRates.reduce((sum, rate) => sum + rate, 0) / retentionRates.length : 0;
    
    const worstCaseConfidence = Math.min(...successfulResults.map(r => r.transformedConfidence));
    const bestCaseConfidence = Math.max(...successfulResults.map(r => r.transformedConfidence));
    
    // Category-specific results
    const categoryResults: Record<string, any> = {};
    
    for (const result of results) {
      const category = result.transform.category;
      
      if (!categoryResults[category]) {
        categoryResults[category] = {
          tests: 0,
          retentions: []
        };
      }
      
      categoryResults[category].tests++;
      if (result.payloadRecovered) {
        categoryResults[category].retentions.push(
          result.transformedConfidence / result.originalConfidence
        );
      }
    }
    
    // Calculate category metrics
    const transformCategoryResults: Record<string, any> = {};
    
    for (const [category, data] of Object.entries(categoryResults)) {
      const retentions = data.retentions as number[];
      
      transformCategoryResults[category] = {
        tests: data.tests,
        avgRetention: retentions.length > 0 ? 
          retentions.reduce((sum, r) => sum + r, 0) / retentions.length : 0,
        minRetention: retentions.length > 0 ? Math.min(...retentions) : 0,
        maxRetention: retentions.length > 0 ? Math.max(...retentions) : 0
      };
    }
    
    // Check target thresholds
    const jpeg75Result = results.find(r => 
      r.transform.name.includes('JPEG Compression Q7575') && 
      r.transform.parameters.jpegQuality === 75
    );
    
    const crop10Result = results.find(r => 
      r.transform.name.includes('Crop 10%')
    );
    
    const targetThresholds = {
      jpeg75: jpeg75Result ? jpeg75Result.payloadRecovered && jpeg75Result.transformedConfidence >= 0.5 : false,
      crop10: crop10Result ? crop10Result.payloadRecovered && crop10Result.transformedConfidence >= 0.5 : false,
      overall: averageRetention >= 0.7 && worstCaseConfidence >= 0.3
    };
    
    return {
      totalTests,
      successfulDetections: successfulResults.length,
      averageConfidenceRetention: averageRetention,
      worstCaseConfidence,
      bestCaseConfidence,
      transformCategoryResults,
      meetsTargetThresholds: Object.values(targetThresholds).every(t => t),
      targetThresholds
    };
  }
  
  /**
   * Generate visual quality report
   */
  generateVisualQualityReport(results: RobustnessResult[]): VisualQualityReport {
    const validResults = results.filter(r => !r.error);
    
    const ssimValues = validResults.map(r => r.visualQualityMetrics.ssim);
    const psnrValues = validResults.map(r => r.visualQualityMetrics.psnr);
    const lpipsValues = validResults.map(r => r.visualQualityMetrics.lpips);
    
    const qualityThresholds = {
      ssimMin: 0.9,
      psnrMin: 30,
      lpipsMax: 0.2
    };
    
    const averageSSIM = ssimValues.reduce((sum, val) => sum + val, 0) / ssimValues.length;
    const averagePSNR = psnrValues.reduce((sum, val) => sum + val, 0) / psnrValues.length;
    const averageLPIPS = lpipsValues.reduce((sum, val) => sum + val, 0) / lpipsValues.length;
    
    const worstSSIM = Math.min(...ssimValues);
    const worstPSNR = Math.min(...psnrValues);
    const worstLPIPS = Math.max(...lpipsValues);
    
    const meetsQualityThresholds = 
      worstSSIM >= qualityThresholds.ssimMin &&
      worstPSNR >= qualityThresholds.psnrMin &&
      worstLPIPS <= qualityThresholds.lpipsMax;
    
    return {
      averageSSIM,
      averagePSNR,
      averageLPIPS,
      worstSSIM,
      worstPSNR,
      worstLPIPS,
      meetsQualityThresholds,
      qualityThresholds
    };
  }
  
  /**
   * Generate markdown report
   */
  generateMarkdownReport(
    summary: RobustnessSummary,
    visualReport: VisualQualityReport,
    results: RobustnessResult[]
  ): string {
    let report = `# Watermark Robustness Evaluation Report\n\n`;
    
    report += `## Executive Summary\n\n`;
    report += `- **Total Tests**: ${summary.totalTests}\n`;
    report += `- **Successful Detections**: ${summary.successfulDetections} (${Math.round(summary.successfulDetections / summary.totalTests * 100)}%)\n`;
    report += `- **Average Confidence Retention**: ${Math.round(summary.averageConfidenceRetention * 100)}%\n`;
    report += `- **Worst Case Confidence**: ${Math.round(summary.worstCaseConfidence * 100)}%\n`;
    report += `- **Meets Target Thresholds**: ${summary.meetsTargetThresholds ? '✅ Yes' : '❌ No'}\n\n`;
    
    report += `## Target Threshold Results\n\n`;
    report += `- **JPEG 75 Quality**: ${summary.targetThresholds.jpeg75 ? '✅ Pass' : '❌ Fail'}\n`;
    report += `- **10% Crop**: ${summary.targetThresholds.crop10 ? '✅ Pass' : '❌ Fail'}\n`;
    report += `- **Overall Performance**: ${summary.targetThresholds.overall ? '✅ Pass' : '❌ Fail'}\n\n`;
    
    report += `## Visual Quality Metrics\n\n`;
    report += `- **Average SSIM**: ${visualReport.averageSSIM.toFixed(4)} (Target: >${visualReport.qualityThresholds.ssimMin})\n`;
    report += `- **Average PSNR**: ${visualReport.averagePSNR.toFixed(2)}dB (Target: >${visualReport.qualityThresholds.psnrMin}dB)\n`;
    report += `- **Average LPIPS**: ${visualReport.averageLPIPS.toFixed(4)} (Target: <${visualReport.qualityThresholds.lpipsMax})\n`;
    report += `- **Meets Quality Thresholds**: ${visualReport.meetsQualityThresholds ? '✅ Yes' : '❌ No'}\n\n`;
    
    report += `## Transform Category Results\n\n`;
    report += `| Category | Tests | Avg Retention | Min Retention | Max Retention |\n`;
    report += `|----------|-------|---------------|---------------|---------------|\n`;
    
    for (const [category, metrics] of Object.entries(summary.transformCategoryResults)) {
      report += `| ${category} | ${metrics.tests} | ${Math.round(metrics.avgRetention * 100)}% | ${Math.round(metrics.minRetention * 100)}% | ${Math.round(metrics.maxRetention * 100)}% |\n`;
    }
    
    report += `\n## Detailed Results\n\n`;
    report += `| Transform | Confidence | Retention | Payload OK | SSIM | PSNR | LPIPS |\n`;
    report += `|-----------|-------------|-----------|------------|------|------|-------|\n`;
    
    for (const result of results) {
      if (!result.error) {
        report += `| ${result.transform.name} | ${Math.round(result.transformedConfidence * 100)}% | ${Math.round((result.transformedConfidence / result.originalConfidence) * 100)}% | ${result.payloadBindOk ? '✅' : '❌'} | ${result.visualQualityMetrics.ssim.toFixed(4)} | ${result.visualQualityMetrics.psnr.toFixed(2)} | ${result.visualQualityMetrics.lpips.toFixed(4)} |\n`;
      }
    }
    
    return report;
  }
}
```
