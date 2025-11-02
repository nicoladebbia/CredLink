#!/usr/bin/env node

import express from 'express';
import sharp from 'sharp';
import cors from 'cors';
import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const PORT = process.env.PORT || 4101;
const app = express();

// SECURITY: Restrict CORS to localhost only in development
const isDevelopment = process.env.NODE_ENV !== 'production';
if (isDevelopment) {
  app.use(cors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:4101', 'http://127.0.0.1:4101'],
    credentials: true
  }));
} else {
  app.use(cors()); // Production CORS
}

app.use(express.json());

// SECURITY: Add rate limiting
const rateLimitMap = new Map();
const RATE_LIMIT = 100; // requests per minute
const WINDOW_MS = 60 * 1000; // 1 minute

app.use((req, res, next) => {
  const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  const windowStart = now - WINDOW_MS;
  
  if (!rateLimitMap.has(clientIP)) {
    rateLimitMap.set(clientIP, []);
  }
  
  const requests = rateLimitMap.get(clientIP).filter((timestamp: number) => timestamp > windowStart);
  
  if (requests.length >= RATE_LIMIT) {
    return res.status(429).json({ error: 'Too many requests' });
  }
  
  requests.push(now);
  rateLimitMap.set(clientIP, requests);
  next();
});

// SECURITY: Add authentication middleware for development
if (isDevelopment) {
  const DEV_API_KEY = process.env.DEV_API_KEY || 'dev-key-change-in-production';
  
  app.use((req, res, next) => {
    // Skip authentication for health check
    if (req.path === '/health') {
      return next();
    }
    
    const apiKey = req.headers['x-api-key'] as string;
    if (!apiKey || apiKey !== DEV_API_KEY) {
      return res.status(401).json({ error: 'Unauthorized - Invalid API key' });
    }
    
    next();
  });
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', sandbox: 'strip-happy', port: PORT });
});

// Serve assets with transformations
app.get('/assets/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    
    // Try to load fixture (for Phase 0, return dummy content)
    let imageBuffer: Buffer;
    
    // Create a simple test image buffer for Phase 0
    imageBuffer = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 1 }
      }
    })
    .jpeg({ quality: 90 })
    .toBuffer();

    // Apply strip-happy transformations
    const transformedImage = await sharp(imageBuffer)
      .jpeg({ quality: 75 }) // Lower quality to simulate optimizer
      .toBuffer();

    // Add manifest hash header (simulated for Phase 0)
    const manifestHash = 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456';
    res.set('X-Manifest-Hash', manifestHash);
    res.set('X-C2-Policy', 'remote-only');
    res.set('Cache-Control', 'public, max-age=3600');
    res.set('Content-Type', 'image/jpeg');
    
    res.send(transformedImage);
  } catch (error) {
    console.error('Error serving asset:', error);
    res.status(500).json({ error: 'Failed to process asset' });
  }
});

// Serve manifests (static)
app.get('/manifests/:hash.c2pa', (req, res) => {
  try {
    const { hash } = req.params;
    
    // For Phase 0, return a dummy manifest
    const manifest = {
      '@context': ['https://w3id.org/c2pa/1.0'],
      claim: {
        signature: 'dummy-signature',
        assertion_data: 'dummy-assertion-data'
      }
    };
    
    res.set('Content-Type', 'application/c2pa');
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.set('Content-Disposition', `inline; filename="${hash}.c2pa"`);
    
    res.json(manifest);
  } catch (error) {
    console.error('Error serving manifest:', error);
    res.status(500).json({ error: 'Failed to serve manifest' });
  }
});

// Simulate proxy transformations
app.post('/transform/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const { buffer, args } = req.body;
    
    let transformedBuffer = Buffer.from(buffer, 'base64');
    
    switch (type) {
      case 'recompress':
        const quality = args.quality || 80;
        transformedBuffer = await sharp(transformedBuffer)
          .jpeg({ quality })
          .toBuffer() as Buffer;
        break;
        
      case 'strip':
        transformedBuffer = await sharp(transformedBuffer)
          .toBuffer() as Buffer;
        break;
        
      case 'resize':
        const size = args.size || '80%';
        transformedBuffer = await sharp(transformedBuffer)
          .resize(size)
          .toBuffer() as Buffer;
        break;
        
      default:
        throw new Error(`Unknown transform type: ${type}`);
    }
    
    res.json({
      buffer: transformedBuffer.toString('base64'),
      size: transformedBuffer.length
    });
  } catch (error) {
    console.error('Error applying transform:', error);
    res.status(500).json({ error: 'Failed to apply transform' });
  }
});

const server = createServer(app);
server.listen(PORT, () => {
  console.log(`Strip-happy sandbox running on port ${PORT}`);
  console.log(`Health check: http://127.0.0.1:${PORT}/health`);
});
