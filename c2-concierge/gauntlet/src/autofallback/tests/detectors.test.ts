/**
 * Phase 6 - Optimizer Auto-Fallback: Detector Tests
 * Unit tests for signal detection and routing logic
 */

import { describe, it, expect } from 'vitest';
import { detectSignals, contentTypeDrift, canonicalTypeFromExt, routeFrom, isPreservePath } from '../detectors';

describe('Signal Detection', () => {
  it('should detect Cloudflare Polish signals', () => {
    const url = new URL('https://cdn.example.com/image.jpg');
    const headers = new Headers({
      'cf-polished': 'webp',
      'content-type': 'image/webp'
    });
    
    const signals = detectSignals(url, headers);
    expect(signals).toContainEqual({ id: 'HDR_CF_POLISH', weight: 35 });
  });

  it('should detect Imgix signals', () => {
    const url = new URL('https://cdn.example.com/image.jpg?ixlib=rb-4.0');
    const headers = new Headers();
    
    const signals = detectSignals(url, headers);
    expect(signals).toContainEqual({ id: 'HDR_IMGIX', weight: 35 });
  });

  it('should detect Cloudinary signals', () => {
    const url = new URL('https://res.cloudinary.com/demo/image/fetch/w_100/sample.jpg');
    const headers = new Headers();
    
    const signals = detectSignals(url, headers);
    expect(signals).toContainEqual({ id: 'HDR_CLOUDINARY', weight: 35 });
  });

  it('should detect Fastly IO signals', () => {
    const url = new URL('https://cdn.example.com/image.jpg?fastlyio=width=100');
    const headers = new Headers({
      'fastly-io-info': 'width=100,height=100'
    });
    
    const signals = detectSignals(url, headers);
    expect(signals).toContainEqual({ id: 'HDR_FASTLY_IO', weight: 35 });
  });

  it('should detect MIME drift', () => {
    const url = new URL('https://cdn.example.com/image.jpg');
    const headers = new Headers({
      'content-type': 'image/webp'
    });
    
    const signals = detectSignals(url, headers);
    expect(signals).toContainEqual({ id: 'MIME_DRIFT', weight: 20 });
  });

  it('should not detect MIME drift for acceptable transforms', () => {
    const url = new URL('https://cdn.example.com/image.jpg');
    const headers = new Headers({
      'content-type': 'image/webp'
    });
    
    const hasDrift = contentTypeDrift(url, headers);
    expect(hasDrift).toBe(false); // JPEG to WebP is acceptable
  });

  it('should detect size anomaly for small images', () => {
    const url = new URL('https://cdn.example.com/image.jpg');
    const headers = new Headers({
      'content-length': '512'
    });
    
    const signals = detectSignals(url, headers);
    expect(signals).toContainEqual({ id: 'SIZE_ANOMALY', weight: 15 });
  });

  it('should detect ETag mutation', () => {
    const url = new URL('https://cdn.example.com/image.jpg');
    const headers = new Headers({
      'etag': '"very-long-etag-that-indicates-constant-rewriting-and-cache-poisoning-risk-1234567890abcdef"'
    });
    
    const signals = detectSignals(url, headers);
    expect(signals).toContainEqual({ id: 'ETAG_MUTATE', weight: 10 });
  });
});

describe('Content Type Detection', () => {
  it('should return correct canonical types', () => {
    expect(canonicalTypeFromExt('image.jpg')).toBe('image/jpeg');
    expect(canonicalTypeFromExt('image.png')).toBe('image/png');
    expect(canonicalTypeFromExt('image.gif')).toBe('image/gif');
    expect(canonicalTypeFromExt('unknown.xyz')).toBeNull();
  });

  it('should detect MIME drift correctly', () => {
    const url = new URL('https://cdn.example.com/image.jpg');
    
    // Acceptable transforms
    expect(contentTypeDrift(url, new Headers({ 'content-type': 'image/jpeg' }))).toBe(false);
    expect(contentTypeDrift(url, new Headers({ 'content-type': 'image/webp' }))).toBe(false);
    
    // Unacceptable transforms
    expect(contentTypeDrift(url, new Headers({ 'content-type': 'text/html' }))).toBe(true);
    expect(contentTypeDrift(url, new Headers({ 'content-type': 'application/pdf' }))).toBe(true);
  });
});

describe('Route Detection', () => {
  it('should extract route key correctly', () => {
    expect(routeFrom(new URL('https://cdn.example.com/images/photo.jpg'))).toBe('cdn.example.com:/images/');
    expect(routeFrom(new URL('https://cdn.example.com/assets/banners/header.jpg'))).toBe('cdn.example.com:/assets/');
    expect(routeFrom(new URL('https://cdn.example.com/root.jpg'))).toBe('cdn.example.com:/');
  });
});

describe('Preserve Path Detection', () => {
  it('should identify preserve paths', () => {
    expect(isPreservePath('/original/photo.jpg')).toBe(true);
    expect(isPreservePath('/preserve/image.png')).toBe(true);
    expect(isPreservePath('/source/raw.gif')).toBe(true);
    expect(isPreservePath('/raw/document.pdf')).toBe(true);
  });

  it('should identify transform paths', () => {
    expect(isPreservePath('/transform/photo.jpg')).toBe(false);
    expect(isPreservePath('/optimize/image.png')).toBe(false);
    expect(isPreservePath('/resize/header.gif')).toBe(false);
    expect(isPreservePath('/format/webp')).toBe(false);
  });

  it('should default to preserve for unknown paths', () => {
    expect(isPreservePath('/unknown/path.jpg')).toBe(true);
    expect(isPreservePath('/random/file.png')).toBe(true);
  });
});

describe('Signal Weight Calculations', () => {
  it('should calculate correct total score', () => {
    const url = new URL('https://cdn.example.com/image.jpg?ixlib=rb-4.0');
    const headers = new Headers({
      'cf-polished': 'webp',
      'content-type': 'image/svg+xml', // MIME drift
      'etag': '"very-long-etag-that-indicates-constant-rewriting-and-cache-poisoning-risk-1234567890abcdef"'
    });
    
    const signals = detectSignals(url, headers);
    const totalWeight = signals.reduce((sum, signal) => sum + signal.weight, 0);
    
    expect(totalWeight).toBe(35 + 35 + 20 + 10); // IMGIX + CF_POLISH + MIME_DRIFT + ETAG_MUTATE
  });

  it('should require multiple signals to exceed threshold', () => {
    const url = new URL('https://cdn.example.com/image.jpg');
    const headers = new Headers({
      'cf-polished': 'webp'
    });
    
    const signals = detectSignals(url, headers);
    const totalWeight = signals.reduce((sum, signal) => sum + signal.weight, 0);
    
    expect(totalWeight).toBeLessThan(100); // Single signal shouldn't trigger flip
  });
});
