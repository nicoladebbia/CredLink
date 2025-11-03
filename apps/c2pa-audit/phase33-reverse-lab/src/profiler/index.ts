/**
 * Provider Profiler - Phase 33 Reverse Lab
 * Generates and analyzes provider behavior profiles with change detection
 */

import { createHash } from 'crypto';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import Redis from 'ioredis';
import pino from 'pino';

import type { 
  ProviderProfile, 
  ChangeEvent, 
  Provider, 
  Transform, 
  TestAsset,
  RequestRecipe,
  ResponseResult,
  VerificationResult 
} from '@/types/index.js';
import { Fetcher } from '@/fetcher/index.js';
import { Verifier } from '@/verifier/index.js';

export interface ProfilerConfig {
  outputDir: string;
  redis: Redis;
  logger: pino.Logger;
  changeThreshold: number; // Minimum percentage change to trigger event
  minSentinelFlips: number; // Minimum sentinel transforms to flip
}

export interface ProfileGenerationSpec {
  provider: Provider;
  transforms: string[];
  assets: string[];
  runs: number;
  cacheBust: boolean;
  jobId: string;
}

export class Profiler {
  private config: ProfilerConfig;
  private fetcher: Fetcher;
  private verifier: Verifier;
  private profileCache = new Map<string, ProviderProfile>();

  constructor(config: ProfilerConfig) {
    this.config = config;
    this.fetcher = new Fetcher({
      timeout: 30000,
      maxConcurrency: 5,
      respectRobots: true,
      defaultHeaders: {
        'User-Agent': 'C2PA-Reverse-Lab/1.1.0 (+https://github.com/Nickiller04/c2-concierge)',
      },
      maxRedirects: 5,
      maxResponseSize: 50 * 1024 * 1024, // 50MB
    });

    this.verifier = new Verifier({
      timeout: 15000,
      cacheResults: true,
      strictMode: true,
      maxManifestSize: 10 * 1024 * 1024, // 10MB
      allowedAlgorithms: ['ES256', 'ES384', 'ES512', 'RS256', 'RS384', 'RS512'],
    });

    // Ensure output directory exists
    if (!existsSync(this.config.outputDir)) {
      mkdirSync(this.config.outputDir, { recursive: true });
    }
  }

  async generateProfile(spec: ProfileGenerationSpec): Promise<ProviderProfile> {
    const startTime = Date.now();
    
    this.config.logger.info({ 
      providerId: spec.provider.id, 
      jobId: spec.jobId,
      transformsCount: spec.transforms.length,
      assetsCount: spec.assets.length,
      runs: spec.runs 
    }, 'Generating provider profile');

    const profile: ProviderProfile = {
      provider: spec.provider.id,
      versionHint: {
        serverHeader: '',
        docUrl: spec.provider.docs?.reference,
        observedAt: new Date().toISOString(),
        profileVersion: this.generateProfileVersion(),
      },
      matrix: [],
      policy: {
        recommendation: 'embed',
        autoFallback: false,
        evidence: [],
        confidence: 0,
      },
      metadata: {
        totalCases: 0,
        successRate: 0,
        generatedAt: new Date().toISOString(),
        jobId: spec.jobId,
      },
    };

    try {
      // Generate test matrix
      const testMatrix = this.generateTestMatrix(spec);
      profile.metadata.totalCases = testMatrix.length;
      
      let successCount = 0;
      let embedSurvivalCount = 0;
      let remoteSurvivalCount = 0;

      // Execute test matrix
      for (const testCase of testMatrix) {
        try {
          const result = await this.executeTestCase(testCase);
          profile.matrix.push(result);
          
          if (result.verify.embeddedManifest.present || result.verify.remoteManifest.valid) {
            successCount++;
          }
          
          if (result.verify.embeddedManifest.present) {
            embedSurvivalCount++;
          }
          
          if (result.verify.remoteManifest.valid) {
            remoteSurvivalCount++;
          }
          
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.config.logger.error({ 
            testCase, 
            error: errorMessage 
          }, 'Test case failed');
          
          // Add failed result
          profile.matrix.push({
            transform: testCase.transform.id,
            request: testCase.request,
            response: {
              status: 0,
              headers: {},
              bytes: { size: 0, hash: '' },
              timing: { connectMs: 0, firstByteMs: 0, totalMs: 0 },
            },
            verify: {
              embeddedManifest: { present: false, valid: false },
              remoteManifest: { linked: false, accessible: false, valid: false },
              integrity: { hashValid: false, signatureValid: false, certificateChainValid: false, timestampValid: false },
              metadata: { exifPreserved: false, xmpPreserved: false, iptcPreserved: false, otherPreserved: false },
            },
            notes: `Failed: ${errorMessage}`,
          });
        }
      }

      // Calculate success rate
      profile.metadata.successRate = successCount / profile.metadata.totalCases;
      
      // Determine policy recommendation
      const embedSurvivalRate = embedSurvivalCount / profile.metadata.totalCases;
      const remoteSurvivalRate = remoteSurvivalCount / profile.metadata.totalCases;
      
      if (embedSurvivalRate >= 0.95) {
        profile.policy.recommendation = 'embed';
        profile.policy.confidence = embedSurvivalRate;
      } else if (remoteSurvivalRate >= 0.95) {
        profile.policy.recommendation = 'remote-only';
        profile.policy.confidence = remoteSurvivalRate;
        profile.policy.autoFallback = true;
      } else {
        profile.policy.recommendation = 'force-remote';
        profile.policy.confidence = Math.max(embedSurvivalRate, remoteSurvivalRate);
        profile.policy.autoFallback = true;
      }

      // Extract server header from first successful response
      const firstSuccessful = profile.matrix.find(m => m.response.status === 200);
      if (firstSuccessful) {
        profile.versionHint.serverHeader = firstSuccessful.response.serverHeader || '';
      }

      // Generate evidence
      profile.policy.evidence = this.generateEvidence(profile);

      // Save profile
      await this.saveProfile(profile);
      
      this.config.logger.info({ 
        providerId: spec.provider.id,
        profileVersion: profile.versionHint.profileVersion,
        successRate: profile.metadata.successRate,
        recommendation: profile.policy.recommendation,
        duration: Date.now() - startTime 
      }, 'Profile generation completed');

      return profile;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.config.logger.error({ 
        providerId: spec.provider.id, 
        error: errorMessage 
      }, 'Profile generation failed');
      throw error;
    }
  }

  private generateTestMatrix(spec: ProfileGenerationSpec): Array<{
    transform: Transform;
    asset: TestAsset;
    request: RequestRecipe;
    runNumber: number;
  }> {
    const matrix: Array<{
      transform: Transform;
      asset: TestAsset;
      request: RequestRecipe;
      runNumber: number;
    }> = [];

    // Get transforms (use all if not specified)
    const transforms = spec.transforms.length > 0 
      ? spec.transforms.map(id => this.getTransformById(id))
      .filter(t => t !== undefined)
      : Object.values(this.getAllTransforms());

    // Get assets (use sentinel assets if not specified)
    const assets = spec.assets.length > 0
      ? spec.assets.map(id => this.getAssetById(id))
      .filter(a => a !== undefined)
      : this.getSentinelAssets();

    for (const transform of transforms) {
      for (const asset of assets) {
        for (let run = 1; run <= spec.runs; run++) {
          const request = this.buildRequest(spec.provider, transform, asset, spec.cacheBust, run);
          
          matrix.push({
            transform,
            asset,
            request,
            runNumber: run,
          });
        }
      }
    }

    return matrix;
  }

  private async executeTestCase(testCase: {
    transform: Transform;
    asset: TestAsset;
    request: RequestRecipe;
    runNumber: number;
  }): Promise<{
    transform: string;
    request: RequestRecipe;
    response: ResponseResult;
    verify: VerificationResult;
    notes?: string;
  }> {
    // Execute HTTP request
    const response = await this.fetcher.fetch(
      {
        providerId: 'test',
        transformId: testCase.transform.id,
        assetId: testCase.asset.id,
        runNumber: testCase.runNumber,
      },
      testCase.request
    );

    // Download image data for verification
    const imageResponse = await fetch(testCase.request.url, {
      headers: testCase.request.headers,
      signal: AbortSignal.timeout(30000),
    });

    if (!imageResponse.ok) {
      throw new Error(`Failed to download image: ${imageResponse.status}`);
    }

    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

    // Verify C2PA manifest
    const verify = await this.verifier.verify(
      {
        imageUrl: testCase.request.url,
        imageHash: response.bytes.hash,
        expectedManifestUrl: testCase.asset.manifestUrl || undefined,
        providerId: 'test',
        transformId: testCase.transform.id,
      },
      imageBuffer,
      response.headers
    );

    return {
      transform: testCase.transform.id,
      request: testCase.request,
      response,
      verify,
      notes: this.generateTestNotes(testCase, response, verify),
    };
  }

  private buildRequest(provider: Provider, transform: Transform, asset: TestAsset, cacheBust: boolean, runNumber: number): RequestRecipe {
    const url = this.buildTransformUrl(provider, transform, asset, cacheBust, runNumber);
    
    return {
      url,
      method: 'GET',
      headers: {
        ...provider.headers,
        'Accept': 'image/*,*/*;q=0.8',
        'User-Agent': `C2PA-Reverse-Lab/1.1.0 (run-${runNumber})`,
      },
      params: {
        ...transform.params,
        cacheBust,
        run: runNumber,
      },
      timestamp: new Date().toISOString(),
    };
  }

  private buildTransformUrl(provider: Provider, transform: Transform, asset: TestAsset, cacheBust: boolean, runNumber: number): string {
    // This would build provider-specific transform URLs
    // Simplified implementation for demonstration
    
    const baseUrl = provider.baseUrl;
    const params = new URLSearchParams();
    
    // Add transform parameters
    Object.entries(transform.params).forEach(([key, value]) => {
      params.append(key, String(value));
    });
    
    // Add cache busting if requested
    if (cacheBust) {
      params.append('_cb', Date.now().toString());
      params.append('_run', runNumber.toString());
    }
    
    // Build URL based on provider patterns
    switch (provider.id) {
      case 'cloudflare-images':
        return `${baseUrl}/cdn-cgi/image/${params.toString()}/${asset.publicUrl}`;
      
      case 'fastly-io':
        return `${baseUrl}?url=${encodeURIComponent(asset.publicUrl)}&${params.toString()}`;
      
      case 'akamai-ivm':
        return `${baseUrl}/image-transform?src=${encodeURIComponent(asset.publicUrl)}&${params.toString()}`;
      
      case 'cloudinary':
        return `${baseUrl}/image/fetch/${params.toString()}/${asset.publicUrl}`;
      
      case 'imgix':
        return `${baseUrl}/${asset.publicUrl}?${params.toString()}`;
      
      default:
        return `${baseUrl}?${params.toString()}`;
    }
  }

  private generateTestNotes(testCase: any, response: ResponseResult, verify: VerificationResult): string {
    const notes: string[] = [];
    
    if (response.status !== 200) {
      notes.push(`HTTP ${response.status}`);
    }
    
    if (verify.embeddedManifest.present && !verify.embeddedManifest.valid) {
      notes.push('Embedded present but invalid');
    }
    
    if (verify.remoteManifest.linked && !verify.remoteManifest.accessible) {
      notes.push('Remote linked but inaccessible');
    }
    
    if (verify.embeddedManifest.present !== testCase.transform.expectedBehavior.preservesC2PA) {
      notes.push(`C2PA preservation mismatch: expected ${testCase.transform.expectedBehavior.preservesC2PA}`);
    }
    
    return notes.join('; ') || 'OK';
  }

  private generateEvidence(profile: ProviderProfile): string[] {
    const evidence: string[] = [];
    
    // Add server header evidence
    if (profile.versionHint.serverHeader) {
      evidence.push(`server: ${profile.versionHint.serverHeader}`);
    }
    
    // Add success rate evidence
    evidence.push(`success_rate: ${(profile.metadata.successRate * 100).toFixed(1)}%`);
    
    // Add transform-specific evidence
    const embedCases = profile.matrix.filter(m => m.verify.embeddedManifest.present);
    const remoteCases = profile.matrix.filter(m => m.verify.remoteManifest.valid);
    
    evidence.push(`embed_survival: ${embedCases.length}/${profile.matrix.length}`);
    evidence.push(`remote_survival: ${remoteCases.length}/${profile.matrix.length}`);
    
    return evidence;
  }

  private generateProfileVersion(): string {
    const now = new Date();
    const year = now.getFullYear();
    const week = this.getWeekNumber(now);
    return `${year}.${week}`;
  }

  private getWeekNumber(date: Date): number {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  }

  async saveProfile(profile: ProviderProfile): Promise<void> {
    // Save to filesystem
    const providerDir = join(this.config.outputDir, profile.provider);
    if (!existsSync(providerDir)) {
      mkdirSync(providerDir, { recursive: true });
    }
    
    const filename = `${profile.versionHint.profileVersion}.json`;
    const filepath = join(providerDir, filename);
    
    writeFileSync(filepath, JSON.stringify(profile, null, 2));
    
    // Save to Redis for quick access
    const redisKey = `profile:${profile.provider}:${profile.versionHint.profileVersion}`;
    await this.config.redis.setex(redisKey, 86400 * 7, JSON.stringify(profile)); // 7 days TTL
    
    // Cache in memory
    this.profileCache.set(`${profile.provider}:${profile.versionHint.profileVersion}`, profile);
    
    this.config.logger.debug({ 
      provider: profile.provider, 
      version: profile.versionHint.profileVersion,
      filepath 
    }, 'Profile saved');
  }

  async detectChanges(providerId: string, newProfile: ProviderProfile): Promise<ChangeEvent[]> {
    const changes: ChangeEvent[] = [];
    
    // Get previous profile
    const previousProfile = await this.getLatestProfile(providerId);
    
    if (!previousProfile) {
      // No previous profile, this is baseline
      return changes;
    }
    
    // Compare profiles
    const oldHash = this.calculateProfileHash(previousProfile);
    const newHash = this.calculateProfileHash(newProfile);
    
    if (oldHash === newHash) {
      // No changes detected
      return changes;
    }
    
    // Analyze specific changes
    const embedSurvivalChange = this.calculateEmbedSurvivalChange(previousProfile, newProfile);
    const remoteSurvivalChange = this.calculateRemoteSurvivalChange(previousProfile, newProfile);
    const headerDrift = this.detectHeaderDrift(previousProfile, newProfile);
    
    // Determine change type and severity
    let changeType: 'behavior_flip' | 'header_drift' | 'manifest_loss' | 'manifest_gain';
    let severity: 'info' | 'warning' | 'critical';
    
    if (Math.abs(embedSurvivalChange) >= this.config.changeThreshold) {
      changeType = embedSurvivalChange < 0 ? 'manifest_loss' : 'manifest_gain';
      severity = Math.abs(embedSurvivalChange) >= 0.5 ? 'critical' : 'warning';
    } else if (headerDrift) {
      changeType = 'header_drift';
      severity = 'info';
    } else {
      changeType = 'behavior_flip';
      severity = 'warning';
    }
    
    // Create change event
    const event: ChangeEvent = {
      id: `change-${providerId}-${Date.now()}`,
      providerId,
      detectedAt: new Date().toISOString(),
      changeType,
      severity,
      oldProfileHash: oldHash,
      newProfileHash: newHash,
      affectedTransforms: this.getAffectedTransforms(previousProfile, newProfile),
      evidence: [
        `embed_survival_change: ${(embedSurvivalChange * 100).toFixed(1)}%`,
        `remote_survival_change: ${(remoteSurvivalChange * 100).toFixed(1)}%`,
        headerDrift ? `header_drift: ${headerDrift}` : '',
      ].filter(Boolean),
      proposedRuleDiff: this.generateRuleDiff(providerId, newProfile),
      impact: {
        affectedTenants: 0, // Would be calculated from tenant data
        embedSurvivalDrop: Math.max(0, -embedSurvivalChange),
        remoteSurvivalAffected: Math.abs(remoteSurvivalChange) > 0.1,
      },
    };
    
    changes.push(event);
    
    // Save change event
    await this.saveChangeEvent(event);
    
    this.config.logger.info({ 
      providerId, 
      changeType, 
      severity,
      embedSurvivalChange,
      remoteSurvivalChange 
    }, 'Change detected');
    
    return changes;
  }

  private calculateProfileHash(profile: ProviderProfile): string {
    const data = JSON.stringify({
      provider: profile.provider,
      matrix: profile.matrix.map(m => ({
        transform: m.transform,
        verify: {
          embeddedManifest: { present: m.verify.embeddedManifest.present },
          remoteManifest: { valid: m.verify.remoteManifest.valid },
        },
      })),
    });
    
    return createHash('sha256').update(data).digest('hex').substring(0, 16);
  }

  private calculateEmbedSurvivalChange(oldProfile: ProviderProfile, newProfile: ProviderProfile): number {
    const oldEmbedRate = oldProfile.matrix.filter(m => m.verify.embeddedManifest.present).length / oldProfile.matrix.length;
    const newEmbedRate = newProfile.matrix.filter(m => m.verify.embeddedManifest.present).length / newProfile.matrix.length;
    
    return newEmbedRate - oldEmbedRate;
  }

  private calculateRemoteSurvivalChange(oldProfile: ProviderProfile, newProfile: ProviderProfile): number {
    const oldRemoteRate = oldProfile.matrix.filter(m => m.verify.remoteManifest.valid).length / oldProfile.matrix.length;
    const newRemoteRate = newProfile.matrix.filter(m => m.verify.remoteManifest.valid).length / newProfile.matrix.length;
    
    return newRemoteRate - oldRemoteRate;
  }

  private detectHeaderDrift(oldProfile: ProviderProfile, newProfile: ProviderProfile): string | null {
    const oldServer = oldProfile.versionHint.serverHeader;
    const newServer = newProfile.versionHint.serverHeader;
    
    if (oldServer && newServer && oldServer !== newServer) {
      return `${oldServer} -> ${newServer}`;
    }
    
    return null;
  }

  private getAffectedTransforms(oldProfile: ProviderProfile, newProfile: ProviderProfile): string[] {
    const affected: string[] = [];
    
    for (const newResult of newProfile.matrix) {
      const oldResult = oldProfile.matrix.find(m => m.transform === newResult.transform);
      
      if (!oldResult) continue;
      
      const oldEmbedded = oldResult.verify.embeddedManifest.present;
      const newEmbedded = newResult.verify.embeddedManifest.present;
      
      if (oldEmbedded !== newEmbedded) {
        affected.push(newResult.transform);
      }
    }
    
    return affected;
  }

  private generateRuleDiff(providerId: string, profile: ProviderProfile): Record<string, any> {
    const embedSurvivalRate = profile.matrix.filter(m => m.verify.embeddedManifest.present).length / profile.matrix.length;
    const remoteSurvivalRate = profile.matrix.filter(m => m.verify.remoteManifest.valid).length / profile.matrix.length;
    
    return {
      [providerId]: {
        embedSurvival: embedSurvivalRate >= 0.95,
        remoteSurvival: remoteSurvivalRate >= 0.95,
        enforceRemote: profile.policy.recommendation === 'remote-only' || profile.policy.recommendation === 'force-remote',
        gauntletProfile: profile.versionHint.profileVersion,
        recommendation: profile.policy.recommendation,
        evidence: profile.policy.evidence,
        lastChecked: profile.metadata.generatedAt,
      },
    };
  }

  async saveChangeEvent(event: ChangeEvent): Promise<void> {
    const redisKey = `change:${event.providerId}:${event.id}`;
    await this.config.redis.setex(redisKey, 86400 * 30, JSON.stringify(event)); // 30 days TTL
  }

  async getLatestProfile(providerId: string): Promise<ProviderProfile | null> {
    const cacheKey = `latest:${providerId}`;
    
    if (this.profileCache.has(cacheKey)) {
      return this.profileCache.get(cacheKey)!;
    }
    
    // Try Redis first
    const redisKey = `latest:${providerId}`;
    const cached = await this.config.redis.get(redisKey);
    
    if (cached) {
      const profile = JSON.parse(cached) as ProviderProfile;
      this.profileCache.set(cacheKey, profile);
      return profile;
    }
    
    // Load from filesystem
    const providerDir = join(this.config.outputDir, providerId);
    if (!existsSync(providerDir)) {
      return null;
    }
    
    const files = require('fs').readdirSync(providerDir)
      .filter((f: string) => f.endsWith('.json'))
      .sort()
      .reverse();
    
    if (files.length === 0) {
      return null;
    }
    
    const filepath = join(providerDir, files[0]);
    const profileData = require('fs').readFileSync(filepath, 'utf8');
    const profile = JSON.parse(profileData) as ProviderProfile;
    
    // Cache and return
    this.profileCache.set(cacheKey, profile);
    await this.config.redis.setex(redisKey, 86400 * 7, JSON.stringify(profile));
    
    return profile;
  }

  async listProfiles(providerId?: string, limit = 20, offset = 0): Promise<ProviderProfile[]> {
    // Implementation would list profiles from filesystem/Redis
    return [];
  }

  async countProfiles(providerId?: string): Promise<number> {
    // Implementation would count profiles
    return 0;
  }

  async listChangeEvents(providerId?: string, severity?: string, limit = 20, offset = 0): Promise<ChangeEvent[]> {
    // Implementation would list change events from Redis
    return [];
  }

  async countChangeEvents(providerId?: string, severity?: string): Promise<number> {
    // Implementation would count change events
    return 0;
  }

  async getJobProfiles(jobId: string): Promise<ProviderProfile[]> {
    // Implementation would get all profiles for a specific job
    return [];
  }

  // Helper methods (would be implemented with actual data)
  private getTransformById(id: string): Transform | undefined {
    return undefined;
  }

  private getAllTransforms(): Record<string, Transform> {
    return {};
  }

  private getAssetById(id: string): TestAsset | undefined {
    return undefined;
  }

  private getSentinelAssets(): TestAsset[] {
    return [];
  }
}
