/**
 * Centralized Version Configuration Utility
 * Implements build-time version injection from package.json
 */

import { readFileSync } from 'fs';
import { join } from 'path';

export class VersionConfig {
  private static _instance: VersionConfig;
  private _appVersion: string;
  private _buildNumber: string;
  private _gitCommit: string;
  private _buildTimestamp: string;

  private constructor() {
    // Read version from package.json at build time
    try {
      const packageJsonPath = join(process.cwd(), 'package.json');
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
      this._appVersion = packageJson.version || '0.1.0';
    } catch (error) {
      console.warn('Failed to read version from package.json, using default');
      this._appVersion = '0.1.0';
    }

    // Build-time environment variables
    this._buildNumber = process.env.BUILD_NUMBER || 'local';
    this._gitCommit = process.env.GIT_COMMIT || 'unknown';
    this._buildTimestamp = process.env.BUILD_TIMESTAMP || new Date().toISOString();
  }

  public static getInstance(): VersionConfig {
    if (!VersionConfig._instance) {
      VersionConfig._instance = new VersionConfig();
    }
    return VersionConfig._instance;
  }

  /**
   * Get the application version from package.json
   */
  public get appVersion(): string {
    return this._appVersion;
  }

  /**
   * Get the full version string with build info
   */
  public get fullVersion(): string {
    if (this._buildNumber === 'local') {
      return `${this._appVersion}-dev`;
    }
    return `${this._appVersion}+${this._buildNumber}`;
  }

  /**
   * Get the version for API responses
   */
  public get apiVersion(): string {
    return this._appVersion;
  }

  /**
   * Get the Docker image version
   */
  public get dockerVersion(): string {
    return this.fullVersion.replace(/\+/g, '-'); // Docker tags can't contain +
  }

  /**
   * Get the SDK version
   */
  public get sdkVersion(): string {
    return this._appVersion;
  }

  /**
   * Get the build information
   */
  public get buildInfo(): {
    buildNumber: string;
    gitCommit: string;
    buildTimestamp: string;
  } {
    return {
      buildNumber: this._buildNumber,
      gitCommit: this._gitCommit,
      buildTimestamp: this._buildTimestamp
    };
  }

  /**
   * Get the manifest version for C2PA
   */
  public get manifestVersion(): string {
    return this._appVersion;
  }

  /**
   * Get the user agent string
   */
  public get userAgent(): string {
    return `CredLink/${this._appVersion}`;
  }

  /**
   * Get the version for health checks
   */
  public get healthVersion(): string {
    return this.fullVersion;
  }

  /**
   * Get all version information as an object
   */
  public getAllVersions(): {
    app: string;
    full: string;
    api: string;
    docker: string;
    sdk: string;
    manifest: string;
    userAgent: string;
    health: string;
    build: {
      buildNumber: string;
      gitCommit: string;
      buildTimestamp: string;
    };
  } {
    return {
      app: this._appVersion,
      full: this.fullVersion,
      api: this.apiVersion,
      docker: this.dockerVersion,
      sdk: this.sdkVersion,
      manifest: this.manifestVersion,
      userAgent: this.userAgent,
      health: this.healthVersion,
      build: this.buildInfo
    };
  }

  /**
   * Validate version format (semantic versioning)
   */
  public validateVersion(version: string): boolean {
    const semverRegex = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
    return semverRegex.test(version);
  }

  /**
   * Get version for specific environments
   */
  public getEnvironmentVersion(): string {
    const nodeEnv = process.env.NODE_ENV || 'development';
    
    switch (nodeEnv) {
      case 'production':
        return this.fullVersion;
      case 'staging':
        return `${this._appVersion}-staging`;
      case 'development':
      default:
        return `${this._appVersion}-dev`;
    }
  }
}

/**
 * Export singleton instance for easy access
 */
export const versionConfig = VersionConfig.getInstance();

/**
 * Convenience exports for common use cases
 */
export const APP_VERSION = versionConfig.appVersion;
export const API_VERSION = versionConfig.apiVersion;
export const DOCKER_VERSION = versionConfig.dockerVersion;
export const SDK_VERSION = versionConfig.sdkVersion;
export const MANIFEST_VERSION = versionConfig.manifestVersion;
export const USER_AGENT = versionConfig.userAgent;
