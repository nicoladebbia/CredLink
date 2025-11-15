import { performance } from 'perf_hooks';
import { ManifestStore } from './manifest-store.js';
import type { ManifestStoreConfig } from './types.js';

interface BenchmarkResult {
  operation: string;
  iterations: number;
  totalTime: number;
  averageTime: number;
  p95Time: number;
  p99Time: number;
  minTime: number;
  maxTime: number;
  throughput: number;
}

export class ManifestStoreBenchmarks {
  private store: ManifestStore;
  private config: ManifestStoreConfig;

  constructor(config: ManifestStoreConfig) {
    this.config = config;
    this.store = new ManifestStore(config);
  }

  async runFullBenchmark(): Promise<BenchmarkResult[]> {
    const results: BenchmarkResult[] = [];

    console.log('🚀 Starting Manifest Store Performance Benchmarks...\n');

    // Benchmark 1: Signed URL Generation
    results.push(await this.benchmarkSignedUrlGeneration());

    // Benchmark 2: Manifest Storage
    results.push(await this.benchmarkManifestStorage());

    // Benchmark 3: Manifest Retrieval (GET)
    results.push(await this.benchmarkManifestRetrieval());

    // Benchmark 4: Manifest Retrieval (HEAD)
    results.push(await this.benchmarkManifestHead());

    // Benchmark 5: Integrity Checking
    results.push(await this.benchmarkIntegrityChecking());

    // Benchmark 6: Object Listing
    results.push(await this.benchmarkObjectListing());

    // Benchmark 7: Audit Log Querying
    results.push(await this.benchmarkAuditLogQuerying());

    // Benchmark 8: Metrics Calculation
    results.push(await this.benchmarkMetricsCalculation());

    this.printResults(results);
    return results;
  }

  private async benchmarkSignedUrlGeneration(): Promise<BenchmarkResult> {
    const iterations = 1000;
    const times: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const startTime = performance.now();
      
      await this.store.generateSignedUrl({
        objectKey: 'a'.repeat(60) + i.toString().padStart(4, '0') + '.c2pa',
        contentType: 'application/c2pa',
        contentLength: 1024,
        tenantId: 'benchmark-tenant',
        author: 'benchmark-author',
        signature: 'benchmark-signature'
      });

      const endTime = performance.now();
      times.push(endTime - startTime);
    }

    return this.calculateMetrics('Signed URL Generation', times, iterations);
  }

  private async benchmarkManifestStorage(): Promise<BenchmarkResult> {
    const iterations = 500;
    const times: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const objectKey = 'b'.repeat(60) + i.toString().padStart(4, '0') + '.c2pa';
      const content = Buffer.from(`benchmark manifest content ${i}`, 'utf8');
      
      const startTime = performance.now();
      
      await this.store.storeManifest(objectKey, content, {
        hash: 'b'.repeat(60) + i.toString().padStart(4, '0'),
        contentType: 'application/c2pa',
        contentLength: content.length,
        etag: `"benchmark-etag-${i}"`,
        lastModified: new Date().toUTCString(),
        tenantId: 'benchmark-tenant',
        author: 'benchmark-author',
        signature: 'benchmark-signature',
        checksum: `benchmark-checksum-${i}`
      });

      const endTime = performance.now();
      times.push(endTime - startTime);
    }

    return this.calculateMetrics('Manifest Storage', times, iterations);
  }

  private async benchmarkManifestRetrieval(): Promise<BenchmarkResult> {
    const iterations = 1000;
    const times: number[] = [];

    // Pre-populate with test data
    for (let i = 0; i < 100; i++) {
      const objectKey = 'c'.repeat(60) + i.toString().padStart(4, '0') + '.c2pa';
      const content = Buffer.from(`test content ${i}`, 'utf8');
      await this.store.storeManifest(objectKey, content, {
        hash: 'c'.repeat(60) + i.toString().padStart(4, '0'),
        contentType: 'application/c2pa',
        contentLength: content.length,
        etag: `"test-etag-${i}"`,
        lastModified: new Date().toUTCString(),
        tenantId: 'benchmark-tenant',
        author: 'benchmark-author',
        signature: 'benchmark-signature',
        checksum: `test-checksum-${i}`
      });
    }

    for (let i = 0; i < iterations; i++) {
      const objectKey = 'c'.repeat(60) + (i % 100).toString().padStart(4, '0') + '.c2pa';
      
      const startTime = performance.now();
      await this.store.getManifest(objectKey);
      const endTime = performance.now();
      
      times.push(endTime - startTime);
    }

    return this.calculateMetrics('Manifest Retrieval (GET)', times, iterations);
  }

  private async benchmarkManifestHead(): Promise<BenchmarkResult> {
    const iterations = 1000;
    const times: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const objectKey = 'c'.repeat(60) + (i % 100).toString().padStart(4, '0') + '.c2pa';
      
      const startTime = performance.now();
      await this.store.getManifest(objectKey);
      const endTime = performance.now();
      
      times.push(endTime - startTime);
    }

    return this.calculateMetrics('Manifest Retrieval (HEAD)', times, iterations);
  }

  private async benchmarkIntegrityChecking(): Promise<BenchmarkResult> {
    const iterations = 500;
    const times: number[] = [];

    // Pre-populate with test data
    const testObjects: string[] = [];
    for (let i = 0; i < 50; i++) {
      const objectKey = 'd'.repeat(60) + i.toString().padStart(4, '0') + '.c2pa';
      const content = Buffer.from(`integrity test content ${i}`, 'utf8');
      await this.store.storeManifest(objectKey, content, {
        hash: 'd'.repeat(60) + i.toString().padStart(4, '0'),
        contentType: 'application/c2pa',
        contentLength: content.length,
        etag: `"integrity-etag-${i}"`,
        lastModified: new Date().toUTCString(),
        tenantId: 'benchmark-tenant',
        author: 'benchmark-author',
        signature: 'benchmark-signature',
        checksum: `integrity-checksum-${i}`
      });
      testObjects.push(objectKey);
    }

    for (let i = 0; i < iterations; i++) {
      const objectKey = testObjects[i % testObjects.length];
      const content = Buffer.from(`integrity test content ${i % 50}`, 'utf8');
      
      const startTime = performance.now();
      await this.store.checkIntegrity(objectKey, content);
      const endTime = performance.now();
      
      times.push(endTime - startTime);
    }

    return this.calculateMetrics('Integrity Checking', times, iterations);
  }

  private async benchmarkObjectListing(): Promise<BenchmarkResult> {
    const iterations = 100;
    const times: number[] = [];

    // Pre-populate with lots of test data
    for (let i = 0; i < 1000; i++) {
      const objectKey = 'e'.repeat(60) + i.toString().padStart(4, '0') + '.c2pa';
      const content = Buffer.from(`listing test content ${i}`, 'utf8');
      await this.store.storeManifest(objectKey, content, {
        hash: 'e'.repeat(60) + i.toString().padStart(4, '0'),
        contentType: 'application/c2pa',
        contentLength: content.length,
        etag: `"listing-etag-${i}"`,
        lastModified: new Date().toUTCString(),
        tenantId: `tenant-${i % 10}`,
        author: 'benchmark-author',
        signature: 'benchmark-signature',
        checksum: `listing-checksum-${i}`
      });
    }

    for (let i = 0; i < iterations; i++) {
      const startTime = performance.now();
      
      await this.store.listObjects({
        limit: 100,
        tenantId: `tenant-${i % 10}`
      });
      
      const endTime = performance.now();
      times.push(endTime - startTime);
    }

    return this.calculateMetrics('Object Listing', times, iterations);
  }

  private async benchmarkAuditLogQuerying(): Promise<BenchmarkResult> {
    const iterations = 200;
    const times: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const startTime = performance.now();
      
      await this.store.getAuditRecords({
        limit: 50,
        tenantId: 'benchmark-tenant',
        operation: i % 2 === 0 ? 'create' : 'access'
      });
      
      const endTime = performance.now();
      times.push(endTime - startTime);
    }

    return this.calculateMetrics('Audit Log Querying', times, iterations);
  }

  private async benchmarkMetricsCalculation(): Promise<BenchmarkResult> {
    const iterations = 50;
    const times: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const startTime = performance.now();
      await this.store.getMetrics();
      const endTime = performance.now();
      times.push(endTime - startTime);
    }

    return this.calculateMetrics('Metrics Calculation', times, iterations);
  }

  private calculateMetrics(operation: string, times: number[], iterations: number): BenchmarkResult {
    const sortedTimes = times.sort((a, b) => a - b);
    const totalTime = times.reduce((sum, time) => sum + time, 0);
    const averageTime = totalTime / iterations;
    const p95Index = Math.floor(iterations * 0.95);
    const p99Index = Math.floor(iterations * 0.99);
    const p95Time = sortedTimes[p95Index];
    const p99Time = sortedTimes[p99Index];
    const minTime = sortedTimes[0];
    const maxTime = sortedTimes[sortedTimes.length - 1];
    const throughput = 1000 / averageTime; // operations per second

    return {
      operation,
      iterations,
      totalTime,
      averageTime,
      p95Time,
      p99Time,
      minTime,
      maxTime,
      throughput
    };
  }

  private printResults(results: BenchmarkResult[]): void {
    console.log('\n📊 BENCHMARK RESULTS');
    console.log('='.repeat(80));

    results.forEach(result => {
      console.log(`\n🔹 ${result.operation}`);
      console.log(`   Iterations: ${result.iterations.toLocaleString()}`);
      console.log(`   Average: ${result.averageTime.toFixed(2)}ms`);
      console.log(`   P95: ${result.p95Time.toFixed(2)}ms`);
      console.log(`   P99: ${result.p99Time.toFixed(2)}ms`);
      console.log(`   Min: ${result.minTime.toFixed(2)}ms`);
      console.log(`   Max: ${result.maxTime.toFixed(2)}ms`);
      console.log(`   Throughput: ${result.throughput.toFixed(0)} ops/sec`);
      
      // Check against performance targets
      if (result.operation.includes('Retrieval')) {
        if (result.p95Time < 150) {
          console.log(`   ✅ P95 < 150ms target met`);
        } else {
          console.log(`   ❌ P95 < 150ms target missed (${result.p95Time.toFixed(2)}ms)`);
        }
      }
    });

    console.log('\n' + '='.repeat(80));
    console.log('🎯 PERFORMANCE TARGETS SUMMARY');
    
    const retrievalResults = results.filter(r => r.operation.includes('Retrieval'));
    const allTargetsMet = retrievalResults.every(r => r.p95Time < 150);
    
    if (allTargetsMet) {
      console.log('✅ All P95 < 150ms targets met for retrieval operations');
    } else {
      console.log('❌ Some P95 < 150ms targets missed');
    }

    console.log('\n📈 THROUGHPUT SUMMARY');
    results.forEach(result => {
      console.log(`   ${result.operation}: ${result.throughput.toFixed(0)} ops/sec`);
    });
  }

  async runScalabilityTest(): Promise<void> {
    console.log('\n🧪 SCALABILITY TEST: 100k Objects');
    console.log('='.repeat(50));

    const startTime = performance.now();
    const objectCount = 100000;
    const batchSize = 1000;
    const tenantCount = 10;

    console.log(`Creating ${objectCount.toLocaleString()} objects...`);

    for (let batch = 0; batch < objectCount / batchSize; batch++) {
      const batchStart = performance.now();
      
      for (let i = 0; i < batchSize; i++) {
        const index = batch * batchSize + i;
        const hash = 's'.repeat(60) + index.toString().padStart(6, '0');
        const objectKey = hash + '.c2pa';
        const content = Buffer.from(`scalability test content ${index}`, 'utf8');
        
        await this.store.storeManifest(objectKey, content, {
          hash,
          contentType: 'application/c2pa',
          contentLength: content.length,
          etag: `"scalability-etag-${index}"`,
          lastModified: new Date().toUTCString(),
          tenantId: `tenant-${index % tenantCount}`,
          author: 'scalability-test-author',
          signature: 'scalability-signature',
          checksum: `scalability-checksum-${index}`
        });
      }
      
      const batchTime = performance.now() - batchStart;
      const progress = ((batch + 1) * batchSize / objectCount) * 100;
      console.log(`Progress: ${progress.toFixed(1)}% | Batch time: ${batchTime.toFixed(0)}ms`);
    }

    const creationTime = performance.now() - startTime;
    console.log(`✅ Created ${objectCount.toLocaleString()} objects in ${creationTime.toFixed(0)}ms`);
    console.log(`   Average creation time: ${(creationTime / objectCount).toFixed(2)}ms per object`);

    // Test listing performance
    console.log('\nTesting listing performance...');
    const listStart = performance.now();
    const listResult = await this.store.listObjects({ limit: 1000 });
    const listTime = performance.now() - listStart;
    
    console.log(`✅ Listed 1000 objects in ${listTime.toFixed(2)}ms`);
    console.log(`   Total objects in store: ${listResult.totalCount.toLocaleString()}`);

    // Test metrics calculation
    console.log('\nTesting metrics calculation...');
    const metricsStart = performance.now();
    const metrics = await this.store.getMetrics();
    const metricsTime = performance.now() - metricsStart;
    
    console.log(`✅ Calculated metrics in ${metricsTime.toFixed(2)}ms`);
    console.log(`   Total objects: ${metrics.totalObjects.toLocaleString()}`);
    console.log(`   Total size: ${(metrics.totalSize / 1024 / 1024).toFixed(2)}MB`);
    console.log(`   Average object size: ${(metrics.averageObjectSize / 1024).toFixed(2)}KB`);

    console.log('\n🎯 SCALABILITY TEST COMPLETE');
  }
}
