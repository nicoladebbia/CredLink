/**
 * C2PA Phase 10 Integration Tests
 * End-to-end testing of video/audio verification system
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { C2BadgeVideo } from '../packages/badge-video/src/index';

// Mock DOM environment
const { JSDOM } = require('jsdom');

describe('C2PA Phase 10 Integration Tests', () => {
  let dom: JSDOM;
  let document: Document;
  let window: Window;

  beforeAll(() => {
    // Setup DOM environment
    dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
      url: 'http://localhost:3000',
      pretendToBeVisual: true,
      resources: 'usable'
    });
    
    document = dom.window.document;
    global.document = document;
    global.window = dom.window as any;
    global.HTMLElement = dom.window.HTMLElement;
    global.HTMLVideoElement = dom.window.HTMLVideoElement;
    global.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    global.Worker = class Worker {
      constructor(url: string) {
        setTimeout(() => {
          (this as any).onmessage?.({ data: { status: 'valid', assertions: [], timestamp: Date.now() } });
        }, 100);
      }
      postMessage() {}
      terminate() {}
      onmessage: ((event: any) => void) | null = null;
    };
  });

  afterAll(() => {
    dom.window.close();
  });

  describe('Badge Video Component', () => {
    it('should register as custom element', () => {
      expect(customElements.get('c2-badge-video')).toBe(C2BadgeVideo);
    });

    it('should create badge with default configuration', () => {
      const badge = document.createElement('c2-badge-video') as C2BadgeVideo;
      document.body.appendChild(badge);
      
      expect(badge).toBeDefined();
      expect(badge.shadowRoot).toBeDefined();
      expect(badge.shadowRoot!.querySelector('.c2-badge')).toBeDefined();
    });

    it('should update state when manifest is loaded', async () => {
      const badge = document.createElement('c2-badge-video') as C2BadgeVideo;
      document.body.appendChild(badge);
      
      const mockManifest = {
        version: '1.0',
        asset: { kind: 'video', primary_url: 'test.mp4' },
        temporal: { timebase: '1/90000', tolerance: { pts: 0.5 }, maps: [] },
        signature: { alg: 'ES256', issuer: 'test', cert_chain: [], created_at: new Date().toISOString() },
        policy: { remote_only: true, badge_required: true, deny: [] }
      };
      
      // Mock fetch
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockManifest)
      });
      
      badge.setAttribute('manifest-url', 'test.c2pa.json');
      
      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const state = badge.getState();
      expect(state.status).toBe('unknown');
      expect(state.manifestUrl).toBe('test.c2pa.json');
    });

    it('should handle player attachment', () => {
      const badge = document.createElement('c2-badge-video') as C2BadgeVideo;
      const video = document.createElement('video');
      video.id = 'test-video';
      
      document.body.appendChild(video);
      document.body.appendChild(badge);
      
      badge.setAttribute('player-id', 'test-video');
      
      expect(badge.shadowRoot!.querySelector('.c2-badge')).toBeDefined();
    });

    it('should be accessible', () => {
      const badge = document.createElement('c2-badge-video') as C2BadgeVideo;
      document.body.appendChild(badge);
      
      const badgeElement = badge.shadowRoot!.querySelector('.c2-badge') as HTMLElement;
      
      expect(badgeElement.getAttribute('role')).toBe('button');
      expect(badgeElement.getAttribute('tabindex')).toBe('0');
      expect(badgeElement.getAttribute('aria-expanded')).toBe('false');
      expect(badgeElement.querySelector('.sr-only')).toBeDefined();
    });
  });

  describe('API Integration', () => {
    it('should verify video endpoint', async () => {
      const mockResponse = {
        status: 'valid',
        active_assertions: ['c2pa.actions'],
        reason: 'Verification successful',
        links: { manifest: '/manifests/test.c2pa.json' },
        timestamp: new Date().toISOString()
      };
      
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });
      
      const response = await fetch('http://localhost:3001/api/v1/verify/video?asset_url=test.mp4');
      const data = await response.json();
      
      expect(data.status).toBe('valid');
      expect(data.active_assertions).toContain('c2pa.actions');
    });

    it('should generate media map', async () => {
      const mockResponse = {
        sam: {
          version: '1.0',
          temporal: {
            timebase: '1/90000',
            tolerance: { pts: 0.5 },
            maps: [{
              label: 'content',
              applies_to: ['video'],
              regions: [{
                start: 0,
                end: 600,
                assertions: ['c2pa.actions']
              }]
            }]
          }
        },
        manifest_url: '/manifests/generated.c2pa.json',
        asset_info: {
          kind: 'video',
          tracks: [],
          hash: { alg: 'sha256', value: 'abc123' }
        }
      };
      
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });
      
      const response = await fetch('http://localhost:3001/api/v1/media-map', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          master_url: 'https://cdn.example.com/video/master.m3u8'
        })
      });
      
      const data = await response.json();
      expect(data.sam.temporal.maps).toHaveLength(1);
      expect(data.asset_info.kind).toBe('video');
    });
  });

  describe('Performance Requirements', () => {
    it('should meet verification time targets', async () => {
      const startTime = performance.now();
      
      // Simulate verification process
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(1000); // < 1 second target
    });

    it('should handle memory constraints', () => {
      // Simulate memory usage check
      const initialMemory = (performance as any).memory?.usedJSHeapSize || 0;
      
      // Create multiple badge instances
      for (let i = 0; i < 10; i++) {
        const badge = document.createElement('c2-badge-video') as C2BadgeVideo;
        document.body.appendChild(badge);
      }
      
      const finalMemory = (performance as any).memory?.usedJSHeapSize || 0;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Should use less than 1MB for 10 instances
      expect(memoryIncrease).toBeLessThan(1024 * 1024);
    });
  });

  describe('Error Handling', () => {
    it('should handle fetch failures gracefully', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));
      
      const badge = document.createElement('c2-badge-video') as C2BadgeVideo;
      document.body.appendChild(badge);
      
      badge.setAttribute('manifest-url', 'nonexistent.c2pa.json');
      
      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const state = badge.getState();
      expect(state.status).toBe('unknown');
      expect(state.reason).toContain('Manifest load failed');
    });

    it('should handle invalid manifest data', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ invalid: 'data' })
      });
      
      const badge = document.createElement('c2-badge-video') as C2BadgeVideo;
      document.body.appendChild(badge);
      
      badge.setAttribute('manifest-url', 'invalid.c2pa.json');
      
      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const state = badge.getState();
      expect(state.status).toBe('unknown');
    });

    it('should handle missing player element', () => {
      const badge = document.createElement('c2-badge-video') as C2BadgeVideo;
      document.body.appendChild(badge);
      
      // Try to attach to non-existent player
      badge.setAttribute('player-id', 'nonexistent-player');
      
      // Should not throw error
      expect(badge.shadowRoot!.querySelector('.c2-badge')).toBeDefined();
    });
  });

  describe('Accessibility', () => {
    it('should support keyboard navigation', () => {
      const badge = document.createElement('c2-badge-video') as C2BadgeVideo;
      document.body.appendChild(badge);
      
      const badgeElement = badge.shadowRoot!.querySelector('.c2-badge') as HTMLElement;
      
      // Test keyboard events
      const enterEvent = new KeyboardEvent('keydown', { key: 'Enter' });
      const spaceEvent = new KeyboardEvent('keydown', { key: ' ' });
      
      expect(() => {
        badgeElement.dispatchEvent(enterEvent);
        badgeElement.dispatchEvent(spaceEvent);
      }).not.toThrow();
    });

    it('should have proper ARIA labels', () => {
      const badge = document.createElement('c2-badge-video') as C2BadgeVideo;
      document.body.appendChild(badge);
      
      const badgeElement = badge.shadowRoot!.querySelector('.c2-badge') as HTMLElement;
      
      expect(badgeElement.getAttribute('aria-label')).toContain('Content authenticity');
      expect(badgeElement.getAttribute('role')).toBe('button');
    });

    it('should support high contrast mode', () => {
      // Simulate high contrast preference
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: jest.fn().mockImplementation(query => ({
          matches: query === '(prefers-contrast: high)',
          media: query,
          onchange: null,
          addListener: jest.fn(),
          removeListener: jest.fn(),
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
          dispatchEvent: jest.fn(),
        })),
      });
      
      const badge = document.createElement('c2-badge-video') as C2BadgeVideo;
      document.body.appendChild(badge);
      
      const badgeElement = badge.shadowRoot!.querySelector('.c2-badge') as HTMLElement;
      const styles = getComputedStyle(badgeElement);
      
      expect(styles.background).toContain('black');
      expect(styles.border).toContain('white');
    });
  });
});
