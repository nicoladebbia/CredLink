/**
 * C2 Concierge Base Connector
 * Shared functionality for all CMS connectors (≤300 LOC per connector)
 * 
 * Features:
 * - Remote-only mode (default)
 * - /sign call streaming
 * - manifest_url persistence
 * - Badge render helper
 * - Header injection where possible
 * - Health telemetry to Analytics
 */

class BaseConnector {
  constructor(config = {}) {
    this.config = {
      signUrl: config.signUrl || 'https://verify.c2concierge.org/sign',
      manifestHost: config.manifestHost || 'https://manifests.c2concierge.org',
      badgeUrl: config.badgeUrl || 'https://cdn.c2concierge.org/c2-badge.js',
      analyticsUrl: config.analyticsUrl || 'https://analytics.c2concierge.org/telemetry',
      remoteOnly: config.remoteOnly !== false,
      enableTelemetry: config.enableTelemetry !== false,
      timeout: config.timeout || 30000,
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 1000,
      ...config
    };
    
    this.platform = config.platform || 'unknown';
    this.version = config.version || '1.0.0';
    this.validateConfig();
  }

  /**
   * CRITICAL: Validate configuration on initialization
   */
  validateConfig() {
    const requiredUrls = ['signUrl', 'manifestHost', 'badgeUrl', 'analyticsUrl'];
    
    for (const urlKey of requiredUrls) {
      if (!this.config[urlKey] || !this.isValidUrl(this.config[urlKey])) {
        throw new Error(`Invalid ${urlKey}: must be valid HTTPS URL`);
      }
    }
    
    if (typeof this.config.timeout !== 'number' || this.config.timeout <= 0) {
      throw new Error('Invalid timeout: must be positive number');
    }
    
    if (typeof this.config.retryAttempts !== 'number' || this.config.retryAttempts < 0) {
      throw new Error('Invalid retryAttempts: must be non-negative number');
    }
  }

  /**
   * CRITICAL: Enhanced URL validation
   */
  isValidUrl(url) {
    if (!url || typeof url !== 'string') return false;
    
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'https:' && parsed.hostname.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Stream asset to /sign endpoint and return manifest URL
   */
  async signAsset(assetData, metadata = {}) {
    let lastError;
    
    for (let attempt = 0; attempt <= this.config.retryAttempts; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);
        
        const response = await fetch(this.config.signUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-C2C-Platform': this.platform,
            'X-C2C-Version': this.version,
            'User-Agent': `C2Concierge-Connector/${this.version} (${this.platform})`
          },
          body: JSON.stringify({
            asset: assetData,
            metadata: {
              platform: this.platform,
              version: this.version,
              timestamp: new Date().toISOString(),
              remoteOnly: this.config.remoteOnly,
              attempt: attempt + 1,
              ...metadata
            }
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Signing failed: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const result = await response.json();
        
        if (!result.manifest_url) {
          throw new Error('No manifest URL returned from signing service');
        }

        if (!this.validateManifestUrl(result.manifest_url)) {
          throw new Error('Invalid manifest URL format returned from signing service');
        }

        return result;
      } catch (error) {
        lastError = error;
        
        if (attempt < this.config.retryAttempts) {
          const delay = this.config.retryDelay * Math.pow(2, attempt);
          await this.sleep(delay);
          continue;
        }
        
        break;
      }
    }

    const sanitizedError = this.sanitizeError(lastError);
    console.error('C2C Connector: Asset signing failed after retries', sanitizedError);
    throw lastError;
  }

  /**
   * Utility: Sleep for specified milliseconds
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Persist manifest URL to platform storage
   * Override in platform-specific implementations
   */
  async persistManifestUrl(assetId, manifestUrl) {
    if (!assetId || !manifestUrl) {
      throw new Error('Both assetId and manifestUrl are required');
    }
    
    console.log(`Persisting manifest ${manifestUrl} for asset ${assetId}`);
    return manifestUrl;
  }

  /**
   * Generate HTTP Link header for C2PA manifest
   */
  generateLinkHeader(manifestUrl) {
    const sanitizedUrl = this.sanitizeUrl(manifestUrl);
    if (!sanitizedUrl) {
      throw new Error('Invalid manifest URL for link header');
    }
    
    return `<${sanitizedUrl}>; rel="c2pa-manifest"`;
  }

  /**
   * Generate HTML link tag for manifest (fallback)
   */
  generateLinkTag(manifestUrl) {
    const sanitizedUrl = this.sanitizeUrl(manifestUrl);
    if (!sanitizedUrl) {
      throw new Error('Invalid manifest URL for link tag');
    }
    
    return `<link rel="c2pa-manifest" href="${sanitizedUrl}">`;
  }

  /**
   * Generate badge script with SRI integrity
   */
  generateBadgeScript(options = {}) {
    const integrity = options.integrity || 'sha384-DEFAULT_INTEGRITY_HASH';
    const shouldLoadAsync = options.async !== false;
    
    if (typeof integrity !== 'string' || !integrity.startsWith('sha384-')) {
      throw new Error('Invalid integrity hash format');
    }
    
    const sanitizedUrl = this.sanitizeUrl(this.config.badgeUrl);
    if (!sanitizedUrl) {
      throw new Error('Invalid badge URL');
    }
    
    return `<script${shouldLoadAsync ? ' async' : ''} src="${sanitizedUrl}" integrity="${integrity}" crossorigin="anonymous"></script>`;
  }

  /**
   * CRITICAL: Enhanced URL sanitization with strict validation
   */
  sanitizeUrl(url) {
    if (!url || typeof url !== 'string') {
      return '';
    }
    
    try {
      const parsed = new URL(url);
      
      if (parsed.protocol !== 'https:') {
        return '';
      }
      
      const allowedDomains = [
        'verify.c2concierge.org',
        'manifests.c2concierge.org',
        'cdn.c2concierge.org',
        'analytics.c2concierge.org'
      ];
      
      if (!allowedDomains.includes(parsed.hostname)) {
        return '';
      }
      
      parsed.hash = '';
      parsed.username = '';
      parsed.password = '';
      parsed.search = '';
      
      return parsed.toString();
    } catch {
      return '';
    }
  }

  /**
   * Complete HTML head injection (link + badge)
   */
  generateHeadInjection(manifestUrl, badgeOptions = {}) {
    try {
      return [
        this.generateLinkTag(manifestUrl),
        this.generateBadgeScript(badgeOptions)
      ].join('\n');
    } catch (error) {
      console.error('C2C Connector: Failed to generate head injection', error);
      return '';
    }
  }

  /**
   * Send health telemetry to analytics with retry logic
   */
  async sendTelemetry(event, data = {}) {
    if (!this.config.enableTelemetry) return;

    if (!event || typeof event !== 'string') {
      console.warn('C2C Connector: Invalid telemetry event');
      return;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      await fetch(this.config.analyticsUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': `C2Concierge-Connector/${this.version} (${this.platform})`
        },
        body: JSON.stringify({
          event: event.substring(0, 50),
          platform: this.platform,
          version: this.version,
          timestamp: new Date().toISOString(),
          ...data
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
    } catch (error) {
      console.warn('C2C Connector: Telemetry failed', error.message);
    }
  }

  /**
   * Enhanced health check with detailed diagnostics
   */
  async healthCheck() {
    const startTime = Date.now();
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);
      
      const response = await fetch(`${this.config.signUrl}/health`, {
        method: 'GET',
        headers: {
          'X-C2C-Platform': this.platform,
          'User-Agent': `C2Concierge-Connector/${this.version} (${this.platform})`
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      const latency = Date.now() - startTime;
      
      if (response.ok) {
        const healthData = await response.json();
        await this.sendTelemetry('health_check_success', { 
          latency, 
          service: healthData.service || 'unknown' 
        });
        
        return { 
          status: 'healthy', 
          latency,
          service: healthData.service,
          timestamp: new Date().toISOString()
        };
      } else {
        await this.sendTelemetry('health_check_failed', { 
          status: response.status,
          latency 
        });
        
        return { 
          status: 'unhealthy', 
          error: response.status,
          latency,
          timestamp: new Date().toISOString()
        };
      }
    } catch (error) {
      const latency = Date.now() - startTime;
      await this.sendTelemetry('health_check_error', { 
        error: error.message,
        latency 
      });
      
      return { 
        status: 'error', 
        error: error.message,
        latency,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * CRITICAL: Enhanced manifest URL validation
   */
  validateManifestUrl(url) {
    if (!url || typeof url !== 'string') {
      return false;
    }
    
    try {
      const parsed = new URL(url);
      
      if (parsed.protocol !== 'https:') {
        return false;
      }
      
      const allowedDomains = [
        'verify.c2concierge.org',
        'manifests.c2concierge.org',
        'cdn.c2concierge.org'
      ];
      
      if (!allowedDomains.includes(parsed.hostname)) {
        return false;
      }
      
      if (!parsed.pathname.endsWith('.c2pa')) {
        return false;
      }
      
      if (parsed.hash || parsed.username || parsed.password) {
        return false;
      }
      
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Process asset upload (sign + persist) with enhanced error handling
   */
  async processAsset(assetData, assetId, metadata = {}) {
    if (!assetData || !assetId) {
      throw new Error('Both assetData and assetId are required');
    }

    let signResult;
    try {
      signResult = await this.signAsset(assetData, metadata);
    } catch (error) {
      await this.sendTelemetry('asset_processing_failed', {
        assetId,
        error: error.message,
        stage: 'signing'
      });
      throw error;
    }

    try {
      await this.persistManifestUrl(assetId, signResult.manifest_url);
    } catch (error) {
      await this.sendTelemetry('asset_processing_failed', {
        assetId,
        error: error.message,
        stage: 'persistence'
      });
      throw error;
    }

    await this.sendTelemetry('asset_processed', {
      assetId,
      manifestUrl: signResult.manifest_url
    });

    return signResult;
  }

  /**
   * CRITICAL: Enhanced error sanitization
   */
  sanitizeError(error) {
    if (!error) return 'Unknown error';
    
    const message = error.message || error.toString();
    
    const sanitized = message
      .replace(/https?:\/\/[^\s]+/g, '[URL]')
      .replace(/\/[^\s]*\//g, '[PATH]')
      .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[IP]')
      .replace(/token[s]?[=:][^\s]+/gi, '[TOKEN]')
      .replace(/key[s]?[=:][^\s]+/gi, '[KEY]')
      .replace(/password[s]?[=:][^\s]+/gi, '[PASSWORD]')
      .replace(/secret[s]?[=:][^\s]+/gi, '[SECRET]')
      .replace(/\b[A-Za-z0-9+\/]{20,}={0,2}\b/g, '[BASE64]');
    
    return sanitized.substring(0, 200) || 'Processing error occurred';
  }

  /**
   * Get platform-specific configuration with validation
   */
  getPlatformConfig() {
    return {
      supportsHeaders: false,
      supportsWebhooks: false,
      defaultMode: 'remote',
      timeout: this.config.timeout,
      retryAttempts: this.config.retryAttempts,
      ...this.config
    };
  }
}

// Export for use in all platform connectors
if (typeof module !== 'undefined' && module.exports) {
  module.exports = BaseConnector;
} else if (typeof window !== 'undefined') {
  window.BaseConnector = BaseConnector;
}
