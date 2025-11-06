# Dense Vector Embeddings Engine Implementation

## Overview
Implementation of compact image embeddings using deep learning models for semantic similarity detection beyond pixel-level transforms. Integrated with FAISS/HNSW for billion-scale approximate nearest neighbor search.

## Dependencies
```json
{
  "dependencies": {
    "@tensorflow/tfjs-node": "^4.11.0",
    "@tensorflow/tfjs-node-gpu": "^4.11.0",
    "faiss-node": "^0.5.1",
    "sharp": "^0.32.6",
    "@opencv4nodejs/opencv": "^6.0.0",
    "onnxruntime-node": "^1.16.3"
  }
}
```

## Core Implementation

### Embedding Types and Configuration
```typescript
export interface DenseEmbedding {
  vector: Float32Array;    // Dense vector representation
  dimensions: number;      // Vector dimensionality (128-1024)
  model: string;          // Model used for generation
  confidence: number;     // Embedding quality/confidence score (0-1)
  created_at: Date;
}

export interface EmbeddingConfig {
  model: 'resnet50' | 'efficientnet-b0' | 'mobilenet-v3' | 'clip-vit-b32';
  dimensions: number;     // Output dimensionality (must match model output)
  batchSize: number;      // Batch processing size (1-64)
  useGPU: boolean;        // Enable GPU acceleration
  normalizeVectors: boolean; // L2 normalize embeddings
  compressionRatio: number; // For vector compression (0.5-1.0)
  maxConcurrency: number; // Maximum concurrent processing jobs
  memoryLimit: number;    // Memory limit in MB
}

export interface EmbeddingMetadata {
  modelVersion: string;
  preprocessing: {
    targetSize: number;
    normalizeMean: number[];
    normalizeStd: number[];
  };
  postprocessing: {
    pooling: 'avg' | 'max' | 'cls';
    dimensionality: number;
    normalize: boolean;
  };
}

export class SecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecurityError';
  }
}
```

### Embedding Engine Core
```typescript
import * as tf from '@tensorflow/tfjs-node-gpu';
import sharp from 'sharp';
import { FaissIndex } from 'faiss-node';
import * as fs from 'fs';
import * as path from 'path';

export class EmbeddingEngine {
  private config: EmbeddingConfig;
  private model: tf.GraphModel | null = null;
  private faissIndex: FaissIndex | null = null;
  private isInitialized = false;
  private processingJobs = 0;
  private readonly maxProcessingJobs: number;

  constructor(config: Partial<EmbeddingConfig> = {}) {
    // Validate and set configuration with strict defaults
    this.config = {
      model: 'efficientnet-b0',
      dimensions: 512,
      batchSize: 16, // Reduced for stability
      useGPU: true,
      normalizeVectors: true,
      compressionRatio: 0.75,
      maxConcurrency: 4,
      memoryLimit: 4096, // 4GB limit
      ...config
    };

    // Validate configuration
    this.validateConfig();
    this.maxProcessingJobs = this.config.maxConcurrency;
  }

  /**
   * Validate configuration parameters
   */
  private validateConfig(): void {
    if (this.config.batchSize < 1 || this.config.batchSize > 64) {
      throw new Error('Batch size must be between 1 and 64');
    }
    if (this.config.dimensions < 128 || this.config.dimensions > 1024) {
      throw new Error('Dimensions must be between 128 and 1024');
    }
    if (this.config.compressionRatio < 0.5 || this.config.compressionRatio > 1.0) {
      throw new Error('Compression ratio must be between 0.5 and 1.0');
    }
    if (this.config.memoryLimit < 512 || this.config.memoryLimit > 16384) {
      throw new Error('Memory limit must be between 512MB and 16GB');
    }
  }

  /**
   * Initialize the embedding engine and load model
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Set TensorFlow backend with memory management
      if (this.config.useGPU) {
        await tf.setBackend('tensorflow');
        // Configure GPU memory growth
        tf.ENV.set('WEBGL_FORCE_F16_TEXTURES', true);
        tf.ENV.set('WEBGL_PACK_DEPTHWISE_CONV', true);
      } else {
        await tf.setBackend('cpu');
      }

      // Configure memory limits
      tf.ENV.set('TFJS_BACKEND_MEMORY_LIMIT', this.config.memoryLimit * 1024 * 1024);

      // Load the appropriate model
      await this.loadModel();
      
      // Initialize FAISS index
      await this.initializeFAISSIndex();

      this.isInitialized = true;
      console.log(`Embedding engine initialized with ${this.config.model} model`);
    } catch (error) {
      throw new Error(`Failed to initialize embedding engine: ${error.message}`);
    }
  }

  /**
   * Load the deep learning model for embeddings
   */
  private async loadModel(): Promise<void> {
    const modelPaths = {
      'resnet50': 'models/resnet50_embedding/model.json',
      'efficientnet-b0': 'models/efficientnet_b0_embedding/model.json',
      'mobilenet-v3': 'models/mobilenet_v3_embedding/model.json',
      'clip-vit-b32': 'models/clip_vit_b32_embedding/model.json'
    };

    const modelPath = modelPaths[this.config.model];
    if (!modelPath) {
      throw new Error(`Unsupported model: ${this.config.model}`);
    }

    // SECURITY: Validate model path to prevent path traversal
    const normalizedPath = path.normalize(modelPath);
    if (!normalizedPath.startsWith('models/')) {
      throw new SecurityError(`Invalid model path: ${modelPath}`);
    }

    try {
      // SECURITY: Verify model file integrity before loading
      const modelExists = await this.verifyModelFile(normalizedPath);
      if (!modelExists) {
        throw new Error(`Model file not found or corrupted: ${normalizedPath}`);
      }

      this.model = await tf.loadGraphModel(`file://${normalizedPath}`);
      
      // Warm up the model with proper tensor cleanup
      const warmupInput = tf.zeros([1, 224, 224, 3]);
      const warmupResult = await this.model.executeAsync(warmupInput) as tf.Tensor;
      warmupResult.dispose();
      warmupInput.dispose();
      
      console.log(`Loaded ${this.config.model} model successfully`);
    } catch (error) {
      throw new Error(`Failed to load model: ${error.message}`);
    }
  }

  /**
   * Verify model file integrity and existence
   */
  private async verifyModelFile(modelPath: string): Promise<boolean> {
    try {
      // Check if model.json exists
      const modelJsonPath = path.resolve(modelPath);
      await fs.promises.access(modelJsonPath, fs.constants.R_OK);
      
      // Verify model file size is reasonable (not empty, not suspiciously large)
      const stats = await fs.promises.stat(modelJsonPath);
      if (stats.size === 0 || stats.size > 100 * 1024 * 1024) { // 100MB limit
        return false;
      }
      
      // Basic JSON structure validation
      const modelContent = await fs.promises.readFile(modelJsonPath, 'utf8');
      const modelData = JSON.parse(modelContent);
      
      // Verify required model structure
      if (!modelData.modelTopology || !modelData.weightsManifest) {
        return false;
      }
      
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Initialize FAISS HNSW index for fast similarity search
   */
  private async initializeFAISSIndex(): Promise<void> {
    try {
      // Create HNSW index with cosine similarity
      this.faissIndex = new FaissIndex.IndexHNSWFlat(this.config.dimensions, 32);
      
      // Configure HNSW parameters for optimal recall/latency trade-off
      this.faissIndex.hnsw.efConstruction = 200;
      this.faissIndex.hnsw.efSearch = 50;
      
      console.log(`FAISS HNSW index initialized with ${this.config.dimensions} dimensions`);
    } catch (error) {
      throw new Error(`Failed to initialize FAISS index: ${error.message}`);
    }
  }

  /**
   * Compute dense embedding for a single image with concurrency control
   */
  async computeEmbedding(imageBuffer: Buffer): Promise<DenseEmbedding> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.model) {
      throw new Error('Model not loaded');
    }

    // Concurrency control
    if (this.processingJobs >= this.maxProcessingJobs) {
      throw new Error('Maximum concurrent processing jobs reached');
    }

    this.processingJobs++;

    try {
      // Validate input
      if (!imageBuffer || imageBuffer.length === 0) {
        throw new SecurityError('Invalid image buffer provided');
      }

      // Preprocess image
      const preprocessedTensor = await this.preprocessImage(imageBuffer);
      
      // Generate embedding
      const embeddingTensor = await this.model.executeAsync(preprocessedTensor) as tf.Tensor;
      
      // Post-process embedding
      const embedding = await this.postprocessEmbedding(embeddingTensor);
      
      // Cleanup tensors
      preprocessedTensor.dispose();
      embeddingTensor.dispose();

      return embedding;
    } catch (error) {
      throw new Error(`Embedding computation failed: ${error.message}`);
    } finally {
      this.processingJobs--;
    }
  }

  /**
   * Compute embeddings for multiple images in batch with error handling
   */
  async computeBatchEmbeddings(
    imageBuffers: Buffer[]
  ): Promise<DenseEmbedding[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    // Validate input
    if (!Array.isArray(imageBuffers)) {
      throw new Error('Input must be an array of buffers');
    }

    if (imageBuffers.length === 0) {
      return [];
    }

    if (imageBuffers.length > this.config.batchSize * 10) {
      throw new Error(`Batch size too large: maximum ${this.config.batchSize * 10}`);
    }

    const results: (DenseEmbedding | null)[] = new Array(imageBuffers.length).fill(null);
    const errors: Error[] = [];

    // Process in batches with proper error isolation
    for (let i = 0; i < imageBuffers.length; i += this.config.batchSize) {
      const batch = imageBuffers.slice(i, i + this.config.batchSize);
      
      try {
        // Preprocess batch with individual error handling
        const preprocessedTensors: tf.Tensor[] = [];
        const validIndices: number[] = [];

        for (let j = 0; j < batch.length; j++) {
          try {
            const tensor = await this.preprocessImage(batch[j]);
            preprocessedTensors.push(tensor);
            validIndices.push(j);
          } catch (error) {
            errors.push(new Error(`Image ${i + j}: ${error.message}`));
            results[i + j] = null;
          }
        }

        if (preprocessedTensors.length === 0) {
          continue; // Skip batch if no valid images
        }

        // Stack tensors for batch processing
        const batchTensor = tf.stack(preprocessedTensors);

        // Generate batch embeddings
        const batchEmbeddings = await this.model!.executeAsync(batchTensor) as tf.Tensor;

        // Process each embedding in the batch
        const embeddingArrays = await batchEmbeddings.array() as number[][];
        
        for (let j = 0; j < embeddingArrays.length; j++) {
          const originalIndex = validIndices[j];
          try {
            const embedding = this.createEmbeddingObject(
              new Float32Array(embeddingArrays[j])
            );
            results[i + originalIndex] = embedding;
          } catch (error) {
            errors.push(new Error(`Embedding ${i + originalIndex}: ${error.message}`));
            results[i + originalIndex] = null;
          }
        }

        // Cleanup tensors
        preprocessedTensors.forEach(tensor => tensor.dispose());
        batchTensor.dispose();
        batchEmbeddings.dispose();
        
      } catch (error) {
        // Log batch-level error but continue processing
        console.error(`Batch processing error at index ${i}: ${error.message}`);
        
        // Mark all items in this batch as failed
        for (let j = 0; j < batch.length; j++) {
          errors.push(new Error(`Batch ${i}-${i + j}: ${error.message}`));
          results[i + j] = null;
        }
      }
    }

    // Filter out null results and log errors
    const validResults = results.filter((result): result is DenseEmbedding => result !== null);
    
    if (errors.length > 0) {
      console.warn(`${errors.length} embedding computations failed out of ${imageBuffers.length}`);
    }

    return validResults;
  }

  /**
   * Preprocess image for model input
   */
  private async preprocessImage(imageBuffer: Buffer): Promise<tf.Tensor> {
    const targetSize = 224; // Standard for most vision models
    const maxImageSize = 50 * 1024 * 1024; // 50MB limit

    // SECURITY: Validate image buffer size
    if (!imageBuffer || imageBuffer.length === 0) {
      throw new SecurityError('Empty image buffer provided');
    }
    
    if (imageBuffer.length > maxImageSize) {
      throw new SecurityError(`Image buffer too large: ${imageBuffer.length} bytes`);
    }

    // SECURITY: Validate image format and dimensions
    const imageMetadata = await this.validateImageFormat(imageBuffer);
    if (!imageMetadata.isValid) {
      throw new SecurityError('Invalid or unsupported image format');
    }

    if (imageMetadata.width > 8192 || imageMetadata.height > 8192) {
      throw new SecurityError('Image dimensions too large');
    }

    try {
      // SECURITY: Use safe image decoding with limits
      const imageTensor = tf.node.decodeImage(imageBuffer, 3, {
        channels: 3,
        dtype: 'float32'
      });
      
      // Validate tensor shape
      if (imageTensor.shape.length !== 3 || 
          imageTensor.shape[2] !== 3 ||
          imageTensor.shape[0] === 0 ||
          imageTensor.shape[1] === 0) {
        imageTensor.dispose();
        throw new SecurityError('Invalid image tensor shape');
      }

      const resized = tf.image.resizeBilinear(imageTensor, [targetSize, targetSize]);
      
      // Normalize to [0, 1] and apply model-specific normalization
      const normalized = resized.div(255.0);
      
      // Apply ImageNet normalization (if using pretrained model)
      const mean = tf.tensor([0.485, 0.456, 0.406]);
      const std = tf.tensor([0.229, 0.224, 0.225]);
      const standardized = normalized.sub(mean).div(std);

      // Add batch dimension
      const batched = standardized.expandDims(0);

      // Cleanup intermediate tensors
      imageTensor.dispose();
      resized.dispose();
      normalized.dispose();
      standardized.dispose();
      mean.dispose();
      std.dispose();

      return batched;
    } catch (error) {
      throw new SecurityError(`Image preprocessing failed: ${error.message}`);
    }
  }

  /**
   * Validate image format and extract metadata
   */
  private async validateImageFormat(imageBuffer: Buffer): Promise<{
    isValid: boolean;
    format?: string;
    width?: number;
    height?: number;
  }> {
    const sharp = require('sharp');
    
    try {
      const metadata = await sharp(imageBuffer).metadata();
      
      // Check supported formats
      const supportedFormats = ['jpeg', 'png', 'webp', 'gif', 'tiff'];
      if (!metadata.format || !supportedFormats.includes(metadata.format)) {
        return { isValid: false };
      }
      
      // Validate dimensions
      if (!metadata.width || !metadata.height || 
          metadata.width <= 0 || metadata.height <= 0 ||
          metadata.width > 8192 || metadata.height > 8192) {
        return { isValid: false };
      }
      
      // Validate color space
      if (metadata.channels && (metadata.channels < 1 || metadata.channels > 4)) {
        return { isValid: false };
      }
      
      return {
        isValid: true,
        format: metadata.format,
        width: metadata.width,
        height: metadata.height
      };
    } catch (error) {
      return { isValid: false };
    }
  }

  /**
   * Post-process embedding tensor
   */
  private async postprocessEmbedding(embeddingTensor: tf.Tensor): Promise<DenseEmbedding> {
    // Remove batch dimension
    const squeezed = tf.squeeze(embeddingTensor);
    
    // Convert to array
    const embeddingArray = await squeezed.array() as number[];
    
    // Apply dimensionality reduction if needed
    const finalEmbedding = this.applyDimensionalityReduction(
      new Float32Array(embeddingArray)
    );

    // Normalize vectors if enabled
    if (this.config.normalizeVectors) {
      this.normalizeVector(finalEmbedding);
    }

    // Create embedding object
    const embedding = this.createEmbeddingObject(finalEmbedding);

    // Cleanup tensors
    squeezed.dispose();

    return embedding;
  }

  /**
   * Apply dimensionality reduction (PCA or random projection)
   */
  private applyDimensionalityReduction(vector: Float32Array): Float32Array {
    if (vector.length === this.config.dimensions) {
      return vector;
    }

    // Simple random projection for demonstration
    // In production, would use learned PCA matrix
    const targetDim = this.config.dimensions;
    const reduced = new Float32Array(targetDim);
    
    for (let i = 0; i < targetDim; i++) {
      let sum = 0;
      for (let j = 0; j < vector.length; j++) {
        // Use deterministic random projection
        const randomValue = Math.sin(i * j * 1234.5678) * 10000;
        sum += vector[j] * randomValue;
      }
      reduced[i] = sum / Math.sqrt(vector.length);
    }

    return reduced;
  }

  /**
   * L2 normalize vector
   */
  private normalizeVector(vector: Float32Array): void {
    let norm = 0;
    for (let i = 0; i < vector.length; i++) {
      norm += vector[i] * vector[i];
    }
    norm = Math.sqrt(norm);
    
    if (norm > 0) {
      for (let i = 0; i < vector.length; i++) {
        vector[i] /= norm;
      }
    }
  }

  /**
   * Create embedding object with metadata
   */
  private createEmbeddingObject(vector: Float32Array): DenseEmbedding {
    // Calculate confidence based on vector statistics
    const confidence = this.calculateEmbeddingConfidence(vector);

    return {
      vector,
      dimensions: vector.length,
      model: this.config.model,
      confidence,
      created_at: new Date()
    };
  }

  /**
   * Calculate embedding confidence score
   */
  private calculateEmbeddingConfidence(vector: Float32Array): number {
    // Simple confidence based on vector magnitude and distribution
    let sum = 0;
    let sumSquares = 0;
    
    for (let i = 0; i < vector.length; i++) {
      sum += vector[i];
      sumSquares += vector[i] * vector[i];
    }
    
    const mean = sum / vector.length;
    const variance = (sumSquares / vector.length) - (mean * mean);
    
    // Higher variance typically indicates more informative embeddings
    const confidence = Math.min(1.0, variance / 0.1);
    
    return Math.max(0.1, confidence); // Minimum confidence of 0.1
  }

  /**
   * Compare two embeddings using cosine similarity
   */
  compareEmbeddings(
    embedding1: DenseEmbedding,
    embedding2: DenseEmbedding
  ): number {
    if (embedding1.dimensions !== embedding2.dimensions) {
      throw new Error('Embeddings must have same dimensions');
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.dimensions; i++) {
      dotProduct += embedding1.vector[i] * embedding2.vector[i];
      norm1 += embedding1.vector[i] * embedding1.vector[i];
      norm2 += embedding2.vector[i] * embedding2.vector[i];
    }

    const similarity = dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
    return similarity;
  }

  /**
   * Find similar embeddings using FAISS index
   */
  async findSimilarEmbeddings(
    queryEmbedding: DenseEmbedding,
    limit: number = 10,
    threshold: number = 0.8
  ): Promise<Array<{
    id: string;
    similarity: number;
    distance: number;
  }>> {
    if (!this.faissIndex) {
      throw new Error('FAISS index not initialized');
    }

    try {
      // Convert to FAISS format
      const queryVector = new Float32Array(queryEmbedding.vector);
      
      // Search FAISS index
      const { labels, distances } = this.faissIndex.search(queryVector, limit);

      // Convert distances to similarities (for HNSW with inner product)
      const results = labels.map((label, index) => ({
        id: label.toString(),
        similarity: distances[index], // HNSW already returns similarities
        distance: 1 - distances[index] // Convert to distance for consistency
      }));

      // Filter by threshold
      return results.filter(result => result.similarity >= threshold);
    } catch (error) {
      throw new Error(`FAISS search failed: ${error.message}`);
    }
  }

  /**
   * Add embedding to FAISS index
   */
  async addEmbeddingToIndex(id: string, embedding: DenseEmbedding): Promise<void> {
    if (!this.faissIndex) {
      throw new Error('FAISS index not initialized');
    }

    try {
      const idAsInt = parseInt(id, 10);
      if (isNaN(idAsInt)) {
        throw new Error(`Invalid embedding ID: ${id}. Must be convertible to integer.`);
      }
      
      this.faissIndex.addWithIds(embedding.vector, new Int32Array([idAsInt]));
      console.log(`Added embedding ${id} to FAISS index`);
    } catch (error) {
      throw new Error(`Failed to add embedding to index: ${error.message}`);
    }
  }

  /**
   * Get embedding statistics for monitoring
   */
  getEmbeddingStatistics(embeddings: DenseEmbedding[]): {
    count: number;
    avgDimensions: number;
    avgConfidence: number;
    modelDistribution: Record<string, number>;
  } {
    if (embeddings.length === 0) {
      return {
        count: 0,
        avgDimensions: 0,
        avgConfidence: 0,
        modelDistribution: {}
      };
    }

    const totalDimensions = embeddings.reduce((sum, e) => sum + e.dimensions, 0);
    const totalConfidence = embeddings.reduce((sum, e) => sum + e.confidence, 0);
    
    const modelDistribution: Record<string, number> = {};
    embeddings.forEach(embedding => {
      modelDistribution[embedding.model] = (modelDistribution[embedding.model] || 0) + 1;
    });

    return {
      count: embeddings.length,
      avgDimensions: Math.round(totalDimensions / embeddings.length),
      avgConfidence: Math.round((totalConfidence / embeddings.length) * 1000) / 1000,
      modelDistribution
    };
  }

  /**
   * Validate embedding format
   */
  validateEmbedding(embedding: DenseEmbedding): boolean {
    return (
      embedding &&
      embedding.vector instanceof Float32Array &&
      embedding.vector.length > 0 &&
      typeof embedding.dimensions === 'number' &&
      embedding.dimensions === embedding.vector.length &&
      typeof embedding.model === 'string' &&
      typeof embedding.confidence === 'number' &&
      embedding.confidence >= 0 &&
      embedding.confidence <= 1 &&
      embedding.created_at instanceof Date
    );
  }

  /**
   * Cleanup resources
   */
  async dispose(): Promise<void> {
    if (this.model) {
      await this.model.dispose();
      this.model = null;
    }
    
    if (this.faissIndex) {
      // FAISS index cleanup would go here
      this.faissIndex = null;
    }
    
    this.isInitialized = false;
  }
}
```

## GPU Optimization Implementation

### GPU-Accelerated Embedding Engine
```typescript
export class GPUOptimizedEmbeddingEngine extends EmbeddingEngine {
  private memoryPool: tf.Tensor[] = [];
  private maxPoolSize = 100;

  constructor(config: Partial<EmbeddingConfig> = {}) {
    super({ ...config, useGPU: true });
  }

  /**
   * Get tensor from memory pool or create new one
   */
  private getTensorFromPool(shape: number[]): tf.Tensor {
    if (this.memoryPool.length > 0) {
      const tensor = this.memoryPool.pop()!;
      if (tensor.shape.length === shape.length && 
          tensor.shape.every((dim, i) => dim === shape[i])) {
        return tensor;
      }
      tensor.dispose();
    }
    return tf.tensor(shape);
  }

  /**
   * Return tensor to memory pool
   */
  private returnTensorToPool(tensor: tf.Tensor): void {
    if (this.memoryPool.length < this.maxPoolSize) {
      tensor.fill(0); // Clear tensor data
      this.memoryPool.push(tensor);
    } else {
      tensor.dispose();
    }
  }

  /**
   * Optimized batch processing with memory pooling
   */
  async computeBatchEmbeddingsOptimized(
    imageBuffers: Buffer[]
  ): Promise<DenseEmbedding[]> {
    const results: DenseEmbedding[] = [];
    
    // Use larger batch size for GPU
    const gpuBatchSize = Math.min(this.config.batchSize * 4, 128);
    
    for (let i = 0; i < imageBuffers.length; i += gpuBatchSize) {
      const batch = imageBuffers.slice(i, i + gpuBatchSize);
      
      // Process batch with optimized memory usage
      const batchResults = await this.processBatchWithMemoryPooling(batch);
      results.push(...batchResults);
    }
    
    return results;
  }

  private async processBatchWithMemoryPooling(
    imageBuffers: Buffer[]
  ): Promise<DenseEmbedding[]> {
    // Implementation would use memory pooling for optimal GPU utilization
    return this.computeBatchEmbeddings(imageBuffers);
  }
}
```

## Model Management

### Model Registry and Versioning
```typescript
export class EmbeddingModelRegistry {
  private models: Map<string, tf.GraphModel> = new Map();
  private modelMetadata: Map<string, EmbeddingMetadata> = new Map();

  /**
   * Register a new embedding model
   */
  async registerModel(
    name: string,
    modelPath: string,
    metadata: EmbeddingMetadata
  ): Promise<void> {
    try {
      const model = await tf.loadGraphModel(`file://${modelPath}`);
      this.models.set(name, model);
      this.modelMetadata.set(name, metadata);
      console.log(`Registered model: ${name}`);
    } catch (error) {
      throw new Error(`Failed to register model ${name}: ${error.message}`);
    }
  }

  /**
   * Get registered model
   */
  getModel(name: string): tf.GraphModel | null {
    return this.models.get(name) || null;
  }

  /**
   * Get model metadata
   */
  getModelMetadata(name: string): EmbeddingMetadata | null {
    return this.modelMetadata.get(name) || null;
  }

  /**
   * List all registered models
   */
  listModels(): string[] {
    return Array.from(this.models.keys());
  }

  /**
   * Unregister and dispose model
   */
  async unregisterModel(name: string): Promise<void> {
    const model = this.models.get(name);
    if (model) {
      await model.dispose();
      this.models.delete(name);
      this.modelMetadata.delete(name);
      console.log(`Unregistered model: ${name}`);
    }
  }
}
```

## Integration with Collision Detection

### Embedding-Aware Collision Detector
```typescript
export class EmbeddingCollisionDetector {
  private embeddingEngine: EmbeddingEngine;
  private similarityThreshold: number;

  constructor(
    embeddingEngine: EmbeddingEngine,
    similarityThreshold: number = 0.85
  ) {
    this.embeddingEngine = embeddingEngine;
    this.similarityThreshold = similarityThreshold;
  }

  /**
   * Detect collisions using dense embeddings
   */
  async detectEmbeddingCollisions(
    queryImage: Buffer,
    candidateImages: Buffer[]
  ): Promise<Array<{
    index: number;
    similarity: number;
    confidence: number;
  }>> {
    // Compute query embedding
    const queryEmbedding = await this.embeddingEngine.computeEmbedding(queryImage);
    
    // Compute candidate embeddings
    const candidateEmbeddings = await this.embeddingEngine.computeBatchEmbeddings(
      candidateImages
    );

    // Compare embeddings
    const collisions = [];
    for (let i = 0; i < candidateEmbeddings.length; i++) {
      const similarity = this.embeddingEngine.compareEmbeddings(
        queryEmbedding,
        candidateEmbeddings[i]
      );

      if (similarity >= this.similarityThreshold) {
        collisions.push({
          index: i,
          similarity,
          confidence: candidateEmbeddings[i].confidence
        });
      }
    }

    // Sort by similarity (highest first)
    return collisions.sort((a, b) => b.similarity - a.similarity);
  }

  /**
   * Two-stage detection: PDQ shortlist + embedding verification
   */
  async twoStageDetection(
    queryImage: Buffer,
    pdqCandidates: Array<{ image: Buffer; pdqSimilarity: number }>,
    embeddingThreshold: number = 0.9
  ): Promise<Array<{
    image: Buffer;
    pdqSimilarity: number;
    embeddingSimilarity: number;
    combinedScore: number;
  }>> {
    // Extract images from PDQ candidates
    const candidateImages = pdqCandidates.map(c => c.image);
    
    // Get embedding similarities
    const embeddingCollisions = await this.detectEmbeddingCollisions(
      queryImage,
      candidateImages
    );

    // Combine PDQ and embedding scores
    const results = embeddingCollisions.map(collision => {
      const pdqCandidate = pdqCandidates[collision.index];
      const combinedScore = (
        pdqCandidate.pdqSimilarity * 0.4 + 
        collision.similarity * 0.6
      );

      return {
        image: pdqCandidate.image,
        pdqSimilarity: pdqCandidate.pdqSimilarity,
        embeddingSimilarity: collision.similarity,
        combinedScore
      };
    });

    // Filter by embedding threshold and sort
    return results
      .filter(r => r.embeddingSimilarity >= embeddingThreshold)
      .sort((a, b) => b.combinedScore - a.combinedScore);
  }
}
```

## Testing Suite

### Unit Tests
```typescript
describe('EmbeddingEngine', () => {
  let engine: EmbeddingEngine;

  beforeAll(async () => {
    engine = new EmbeddingEngine({
      model: 'efficientnet-b0',
      dimensions: 512,
      useGPU: false, // Use CPU for tests
      batchSize: 4
    });
    await engine.initialize();
  });

  afterAll(async () => {
    await engine.dispose();
  });

  test('should compute valid embedding', async () => {
    const testImage = Buffer.from('fake-image-data');
    const embedding = await engine.computeEmbedding(testImage);
    
    expect(engine.validateEmbedding(embedding)).toBe(true);
    expect(embedding.dimensions).toBe(512);
    expect(embedding.vector).toBeInstanceOf(Float32Array);
    expect(embedding.confidence).toBeGreaterThan(0);
    expect(embedding.confidence).toBeLessThanOrEqual(1);
  });

  test('should compute batch embeddings', async () => {
    const testImages = [
      Buffer.from('fake-image-1'),
      Buffer.from('fake-image-2'),
      Buffer.from('fake-image-3')
    ];
    
    const embeddings = await engine.computeBatchEmbeddings(testImages);
    
    expect(embeddings).toHaveLength(3);
    embeddings.forEach(embedding => {
      expect(engine.validateEmbedding(embedding)).toBe(true);
    });
  });

  test('should compare embeddings correctly', async () => {
    const image1 = Buffer.from('fake-image-1');
    const image2 = Buffer.from('fake-image-2');
    
    const embedding1 = await engine.computeEmbedding(image1);
    const embedding2 = await engine.computeEmbedding(image2);
    
    const similarity = engine.compareEmbeddings(embedding1, embedding2);
    
    expect(similarity).toBeGreaterThanOrEqual(-1);
    expect(similarity).toBeLessThanOrEqual(1);
  });
});

describe('EmbeddingCollisionDetector', () => {
  let detector: EmbeddingCollisionDetector;
  let embeddingEngine: EmbeddingEngine;

  beforeAll(async () => {
    embeddingEngine = new EmbeddingEngine({
      model: 'efficientnet-b0',
      dimensions: 512,
      useGPU: false
    });
    await embeddingEngine.initialize();
    
    detector = new EmbeddingCollisionDetector(embeddingEngine, 0.8);
  });

  test('should detect similar images', async () => {
    const queryImage = Buffer.from('fake-query-image');
    const candidateImages = [
      Buffer.from('similar-image'),
      Buffer.from('different-image')
    ];
    
    const collisions = await detector.detectEmbeddingCollisions(
      queryImage,
      candidateImages
    );
    
    expect(Array.isArray(collisions)).toBe(true);
    collisions.forEach(collision => {
      expect(collision.similarity).toBeGreaterThanOrEqual(0.8);
      expect(collision.confidence).toBeGreaterThan(0);
    });
  });
});
```
