#!/usr/bin/env node

/**
 * C2C Hostile CDN Gauntlet - URL Builder
 * Generates provider-specific URLs for testing C2PA Content Credentials survival
 */

import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';

interface Transform {
  id: string;
  description: string;
  params: Record<string, any>;
}

interface Route {
  id: string;
  description: string;
  expect_embed: boolean;
  expect_remote: boolean;
}

interface Asset {
  id: string;
  filename: string;
  type: string;
  description: string;
  has_c2pa: boolean;
}

interface ProviderConfig {
  provider: string;
  name: string;
  products: string[];
  base_url: string;
  routes: Array<{
    id: string;
    description: string;
    url_pattern: string;
    default_params: Record<string, any>;
    transform_mappings: Record<string, Record<string, any>>;
    special_config: any;
  }>;
  headers: any;
  probes: any;
}

interface MatrixConfig {
  version: number;
  date: string;
  providers: string[];
  routes: Route[];
  transforms: Transform[];
  assets: Asset[];
  expected_total_tests: number;
  success_criteria: any;
  reporting: any;
}

interface TestUrl {
  provider: string;
  route: string;
  transform: string;
  asset: string;
  asset_url: string;
  manifest_url: string;
  expected_embed: boolean;
  expected_remote: boolean;
  provider_notes: string;
}

class URLBuilder {
  private matrixConfig!: MatrixConfig;
  private providerConfigs: Map<string, ProviderConfig> = new Map();
  private originBaseUrl: string = 'https://origin.survival.test/gauntlet/corpus';

  constructor() {
    this.loadConfigs();
  }

  private loadConfigs(): void {
    // Load matrix configuration
    const matrixPath = path.join(__dirname, '../matrix.yaml');
    const matrixContent = fs.readFileSync(matrixPath, 'utf8');
    this.matrixConfig = yaml.load(matrixContent) as MatrixConfig;

    // Load provider configurations
    const providersDir = path.join(__dirname, '../providers');
    const providerFiles = fs.readdirSync(providersDir);
    
    for (const file of providerFiles) {
      if (file.endsWith('.yaml')) {
        const providerPath = path.join(providersDir, file);
        const providerContent = fs.readFileSync(providerPath, 'utf8');
        const providerConfig = yaml.load(providerContent) as ProviderConfig;
        this.providerConfigs.set(providerConfig.provider, providerConfig);
      }
    }
  }

  private buildOriginUrl(asset: Asset): string {
    return `${this.originBaseUrl}/images/${asset.filename}`;
  }

  private buildManifestUrl(asset: Asset): string {
    // Generate SHA256-based manifest URL
    const assetPath = `images/${asset.filename}`;
    const manifestHash = this.generateMockHash(assetPath); // In real implementation, compute actual hash
    return `https://manifests.survival.test/${manifestHash}.c2pa`;
  }

  private generateMockHash(input: string): string {
    // Mock hash generation - replace with actual SHA256 in production
    return Buffer.from(input).toString('base64').substring(0, 32).toLowerCase();
  }

  private buildCloudflareUrl(
    config: ProviderConfig,
    route: any,
    transform: Transform,
    _asset: Asset,
    originUrl: string
  ): string {
    const routeConfig = config.routes.find(r => r.id === route.id);
    if (!routeConfig) throw new Error(`Route ${route.id} not found for Cloudflare`);

    const transformConfig = routeConfig.transform_mappings[transform.id];
    if (!transformConfig) throw new Error(`Transform ${transform.id} not mapped for Cloudflare`);

    // Build transform options string
    const options = new URLSearchParams();
    
    // Add default params
    Object.entries(routeConfig.default_params).forEach(([key, value]) => {
      options.append(key, value as string);
    });

    // Add transform-specific params
    Object.entries(transformConfig).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        options.append(key, value as string);
      }
    });

    const optionsString = options.toString();
    return `${config.base_url}/cdn-cgi/image/${optionsString}/${originUrl}`;
  }

  private buildImgixUrl(
    config: ProviderConfig,
    route: any,
    transform: Transform,
    _asset: Asset,
    originUrl: string
  ): string {
    const routeConfig = config.routes.find(r => r.id === route.id);
    if (!routeConfig) throw new Error(`Route ${route.id} not found for Imgix`);

    const transformConfig = routeConfig.transform_mappings[transform.id];
    if (!transformConfig) throw new Error(`Transform ${transform.id} not mapped for Imgix`);

    // Build query parameters
    const params = new URLSearchParams();
    
    // Add default params
    Object.entries(routeConfig.default_params).forEach(([key, value]) => {
      params.append(key, value as string);
    });

    // Add transform-specific params
    Object.entries(transformConfig).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.append(key, value as string);
      }
    });

    const originPath = new URL(originUrl).pathname;
    return `${config.base_url}${originPath}?${params.toString()}`;
  }

  private buildCloudinaryUrl(
    config: ProviderConfig,
    route: any,
    transform: Transform,
    _asset: Asset,
    originUrl: string
  ): string {
    const routeConfig = config.routes.find(r => r.id === route.id);
    if (!routeConfig) throw new Error(`Route ${route.id} not found for Cloudinary`);

    const transformConfig = routeConfig.transform_mappings[transform.id];
    if (!transformConfig) throw new Error(`Transform ${transform.id} not mapped for Cloudinary`);

    // Build Cloudinary transform string
    const transformParts: string[] = [];
    
    // Add transform-specific params in Cloudinary format
    Object.entries(transformConfig).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        switch (key) {
          case 'w':
            transformParts.push(`w_${value}`);
            break;
          case 'h':
            transformParts.push(`h_${value}`);
            break;
          case 'q':
            transformParts.push(`q_${value}`);
            break;
          case 'f':
            transformParts.push(`f_${value}`);
            break;
          case 'c':
            transformParts.push(`c_${value}`);
            break;
          case 'g':
            transformParts.push(`g_${value}`);
            break;
          case 'a':
            transformParts.push(`a_${value}`);
            break;
          case 'dpr':
            transformParts.push(`dpr_${value}`);
            break;
          case 'fl_keep_iptc':
            transformParts.push('fl_keep_iptc');
            break;
          case 'e':
            if (Array.isArray(value)) {
              value.forEach(v => transformParts.push(`e_${v}`));
            } else {
              transformParts.push(`e_${value}`);
            }
            break;
        }
      }
    });

    const transformString = transformParts.join(',');
    return `${config.base_url}/${transformString}/${originUrl}`;
  }

  private buildFastlyUrl(
    config: ProviderConfig,
    route: any,
    transform: Transform,
    _asset: Asset,
    originUrl: string
  ): string {
    const routeConfig = config.routes.find(r => r.id === route.id);
    if (!routeConfig) throw new Error(`Route ${route.id} not found for Fastly`);

    const transformConfig = routeConfig.transform_mappings[transform.id];
    if (!transformConfig) throw new Error(`Transform ${transform.id} not mapped for Fastly`);

    // Build query parameters
    const params = new URLSearchParams();
    
    // Add default params
    Object.entries(routeConfig.default_params).forEach(([key, value]) => {
      params.append(key, value as string);
    });

    // Add transform-specific params
    Object.entries(transformConfig).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.append(key, value as string);
      }
    });

    const originPath = new URL(originUrl).pathname;
    return `${config.base_url}${originPath}?${params.toString()}`;
  }

  private buildAkamaiUrl(
    config: ProviderConfig,
    route: any,
    transform: Transform,
    _asset: Asset,
    originUrl: string
  ): string {
    const routeConfig = config.routes.find(r => r.id === route.id);
    if (!routeConfig) throw new Error(`Route ${route.id} not found for Akamai`);

    const transformConfig = routeConfig.transform_mappings[transform.id];
    if (!transformConfig) throw new Error(`Transform ${transform.id} not mapped for Akamai`);

    // Build Akamai im parameters
    const imParams: string[] = [];
    
    // Add transform-specific params
    Object.entries(transformConfig).forEach(([key, value]) => {
      if (value !== undefined && value !== null && key.startsWith('im:')) {
        imParams.push(value as string);
      }
    });

    const params = new URLSearchParams();
    imParams.forEach(param => params.append('im', param));

    const originPath = new URL(originUrl).pathname;
    return `${config.base_url}${originPath}?${params.toString()}`;
  }

  private buildProviderUrl(
    provider: string,
    route: any,
    transform: Transform,
    _asset: Asset,
    originUrl: string
  ): string {
    const config = this.providerConfigs.get(provider);
    if (!config) throw new Error(`Provider ${provider} not configured`);

    switch (provider) {
      case 'cloudflare':
        return this.buildCloudflareUrl(config, route, transform, _asset, originUrl);
      case 'imgix':
        return this.buildImgixUrl(config, route, transform, _asset, originUrl);
      case 'cloudinary':
        return this.buildCloudinaryUrl(config, route, transform, _asset, originUrl);
      case 'fastly':
        return this.buildFastlyUrl(config, route, transform, _asset, originUrl);
      case 'akamai':
        return this.buildAkamaiUrl(config, route, transform, _asset, originUrl);
      default:
        throw new Error(`Provider ${provider} not supported`);
    }
  }

  public generateTestUrls(): TestUrl[] {
    const testUrls: TestUrl[] = [];

    for (const providerId of this.matrixConfig.providers) {
      const providerConfig = this.providerConfigs.get(providerId);
      if (!providerConfig) continue;

      for (const route of this.matrixConfig.routes) {
        for (const transform of this.matrixConfig.transforms) {
          for (const asset of this.matrixConfig.assets) {
            const originUrl = this.buildOriginUrl(asset);
            const manifestUrl = this.buildManifestUrl(asset);
            
            try {
              const assetUrl = this.buildProviderUrl(providerId, route, transform, asset, originUrl);
              
              const routeConfig = providerConfig.routes.find(r => r.id === route.id);
              const providerNotes = routeConfig?.special_config?.expected_behavior?.reason || '';

              testUrls.push({
                provider: providerId,
                route: route.id,
                transform: transform.id,
                asset: asset.id,
                asset_url: assetUrl,
                manifest_url: manifestUrl,
                expected_embed: route.expect_embed,
                expected_remote: route.expect_remote,
                provider_notes: providerNotes
              });
            } catch (error) {
              console.error(`Error building URL for ${providerId}/${route.id}/${transform.id}/${asset.id}:`, error);
            }
          }
        }
      }
    }

    return testUrls;
  }

  public saveTestUrls(outputPath: string): void {
    const testUrls = this.generateTestUrls();
    
    console.log(`Generated ${testUrls.length} test URLs`);
    console.log(`Expected: ${this.matrixConfig.expected_total_tests}`);
    
    if (testUrls.length !== this.matrixConfig.expected_total_tests) {
      console.warn(`Warning: Generated ${testUrls.length} URLs, expected ${this.matrixConfig.expected_total_tests}`);
    }

    // Save as JSON
    const jsonPath = path.join(outputPath, 'test-urls.json');
    fs.writeFileSync(jsonPath, JSON.stringify(testUrls, null, 2));

    // Save as YAML for readability
    const yamlPath = path.join(outputPath, 'test-urls.yaml');
    fs.writeFileSync(yamlPath, yaml.dump(testUrls, { indent: 2 }));

    console.log(`Test URLs saved to:`);
    console.log(`  JSON: ${jsonPath}`);
    console.log(`  YAML: ${yamlPath}`);

    // Generate summary statistics
    const summary = this.generateSummary(testUrls);
    const summaryPath = path.join(outputPath, 'test-summary.json');
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    console.log(`  Summary: ${summaryPath}`);
  }

  private generateSummary(testUrls: TestUrl[]): any {
    const summary = {
      generated_at: new Date().toISOString(),
      total_urls: testUrls.length,
      providers: {} as any,
      routes: {} as any,
      transforms: {} as any
    };

    // Provider statistics
    for (const providerId of this.matrixConfig.providers) {
      summary.providers[providerId] = testUrls.filter(url => url.provider === providerId).length;
    }

    // Route statistics
    for (const route of this.matrixConfig.routes) {
      summary.routes[route.id] = testUrls.filter(url => url.route === route.id).length;
    }

    // Transform statistics
    for (const transform of this.matrixConfig.transforms) {
      summary.transforms[transform.id] = testUrls.filter(url => url.transform === transform.id).length;
    }

    return summary;
  }
}

// CLI interface
if (require.main === module) {
  const outputPath = process.argv[2] || path.join(__dirname, '../output');
  
  // Ensure output directory exists
  if (!fs.existsSync(outputPath)) {
    fs.mkdirSync(outputPath, { recursive: true });
  }

  const builder = new URLBuilder();
  builder.saveTestUrls(outputPath);
}

export { URLBuilder, TestUrl };
