#!/usr/bin/env node

const express = require('express');
const sharp = require('sharp');
const cors = require('cors');
const http = require('http');
const crypto = require('crypto');

const PORT = process.env.PORT || 4103;
const app = express();

// SECURITY: Restrict CORS to localhost only in development
const isDevelopment = process.env.NODE_ENV !== 'production';
if (isDevelopment) {
  app.use(cors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:4103', 'http://127.0.0.1:4103'],
    credentials: true
  }));
} else {
  app.use(cors()); // Production CORS
}

app.use(express.json());

// Security: Rate limiting middleware
const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// SECURITY: Add authentication middleware for development
if (isDevelopment) {
  const DEV_API_KEY = process.env.DEV_API_KEY || 'dev-key-change-in-production';
  
  app.use((req, res, next) => {
    // Skip authentication for health check
    if (req.path === '/health') {
      return next();
    }
    
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== DEV_API_KEY) {
      return res.status(401).json({ error: 'Unauthorized - Invalid API key' });
    }
    
    next();
  });
}

// Security: Input validation middleware
function validateFilename(req, res, next) {
  const { filename } = req.params;
  
  // Security: Prevent path traversal attacks
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  
  // Security: Only allow alphanumeric, dots, hyphens, and underscores
  if (!/^[a-zA-Z0-9._-]+$/.test(filename)) {
    return res.status(400).json({ error: 'Invalid filename format' });
  }
  
  // Security: Limit filename length
  if (filename.length > 100) {
    return res.status(400).json({ error: 'Filename too long' });
  }
  
  next();
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', sandbox: 'remote-only', port: PORT });
});

// Serve assets with remote-only policy
app.get('/assets/:filename', validateFilename, async (req, res) => {
  try {
    const { filename } = req.params;
    
    // Create a clean image without any embedded claims
    const imageBuffer = await sharp({
      create: {
        width: 150,
        height: 150,
        channels: 4,
        background: { r: 0, g: 0, b: 255, alpha: 1 }
      }
    })
    .jpeg({ quality: 85 })
    .toBuffer();

    // Security: Generate deterministic manifest hash based on filename and content
    const manifestHash = crypto
      .createHash('sha256')
      .update(`remote-only-${filename}-${imageBuffer.length}`)
      .digest('hex');
    
    res.set('X-Manifest-Hash', manifestHash);
    res.set('X-C2-Policy', 'remote-only');
    res.set('Link', `</manifests/${manifestHash}.c2pa>; rel="c2pa-manifest"`);
    
    // CSP headers to block embed extraction
    res.set('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; frame-ancestors 'none'");
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Cache-Control', 'public, max-age=3600');
    res.set('Content-Type', 'image/jpeg');
    
    res.send(imageBuffer);
  } catch (error) {
    console.error('Error serving asset:', error);
    res.status(500).json({ error: 'Failed to process asset' });
  }
});

// Serve manifests (static)
app.get('/manifests/:hash.c2pa', (req, res) => {
  try {
    const { hash } = req.params;
    
    // Security: Validate hash format
    if (!/^[a-fA-F0-9]{64}$/.test(hash)) {
      return res.status(400).json({ error: 'Invalid manifest hash format' });
    }
    
    // Return a remote-only manifest
    const manifest = {
      '@context': ['https://w3id.org/c2pa/1.0'],
      claim: {
        signature: crypto.createHash('sha256').update(`remote-only-${hash}`).digest('hex'),
        assertion_data: {
          'c2pa.assertions': [
            {
              'label': 'c2pa.actions',
              'data': {
                'actions': [
                  {
                    'action': 'c2pa.created',
                    'when': new Date().toISOString(),
                    'softwareAgent': 'C2-Concierge-Remote-Only'
                  }
                ]
              }
            }
          ]
        }
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

// Block attempts to access embedded content
app.get('/embed/:filename', validateFilename, (req, res) => {
  res.status(403).json({
    error: 'Embedded content access blocked by remote-only policy',
    policy: 'remote-only'
  });
});

const server = http.createServer(app);
server.listen(PORT, () => {
  console.log(`Remote-only sandbox running on port ${PORT}`);
  console.log(`Health check: http://127.0.0.1:${PORT}/health`);
});
