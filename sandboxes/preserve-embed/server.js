#!/usr/bin/env node

const express = require('express');
const sharp = require('sharp');
const cors = require('cors');
const http = require('http');
const crypto = require('crypto');

const PORT = process.env.PORT || 4102;
const app = express();

// In-memory storage for hash-to-manifest mapping
const manifestStore = new Map();

// SECURITY: Restrict CORS to localhost only in development
const isDevelopment = process.env.NODE_ENV !== 'production';
if (isDevelopment) {
  app.use(cors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:4102', 'http://127.0.0.1:4102'],
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
  max: 1000 // limit each IP to 1000 requests per windowMs (increased for testing)
});
app.use(limiter);

// SECURITY: Add authentication middleware for development
if (isDevelopment && false) { // Disabled for testing
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
  res.json({ status: 'healthy', sandbox: 'preserve-embed', port: PORT });
});

// Serve assets without stripping (preserve embeds)
app.get('/assets/:filename', validateFilename, async (req, res) => {
  try {
    const { filename } = req.params;
    
    // Create a test image that preserves metadata (simulating embedded C2PA)
    let imageBuffer;
    
    // For Phase 0, create an image with metadata that would preserve embeds
    imageBuffer = await sharp({
      create: {
        width: 200,
        height: 200,
        channels: 4,
        background: { r: 0, g: 255, b: 0, alpha: 1 }
      }
    })
    .jpeg({ quality: 95 })
    .withMetadata({
      exif: {
        IFD0: {
          Software: 'C2-Concierge-Preserve-Embed',
          Copyright: 'Test embedded C2PA claim'
        }
      }
    })
    .toBuffer();

    // Create a manifest structure that includes the filename for uniqueness
    const manifestContent = {
      '@context': ['https://w3id.org/c2pa/1.0'],
      claim: {
        signature: filename, // Use filename for uniqueness
        assertion_data: {
          'c2pa.assertions': [
            {
              'label': 'c2pa.actions',
              'data': {
                'actions': [
                  {
                    'action': 'c2pa.created',
                    'when': '2025-01-01T00:00:00.000Z',
                    'softwareAgent': 'C2-Concierge-Preserve-Embed'
                  }
                ]
              }
            }
          ]
        }
      }
    };
    
    // Generate hash of this exact structure
    const manifestHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(manifestContent))
      .digest('hex');
    
    // Store the manifest content for later retrieval
    manifestStore.set(manifestHash, manifestContent);
    
    res.set('X-Manifest-Hash', manifestHash);
    res.set('X-C2-Policy', 'preserve-allowed');
    res.set('Cache-Control', 'public, max-age=3600');
    res.set('Content-Type', 'image/jpeg');
    res.set('Link', `</manifests/${manifestHash}.c2pa>; rel="c2pa-manifest"`);
    
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
    
    // Retrieve the stored manifest content that matches this hash
    const manifest = manifestStore.get(hash);
    
    if (!manifest) {
      return res.status(404).json({ error: 'Manifest not found' });
    }
    
    res.set('Content-Type', 'application/c2pa');
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.set('Content-Disposition', `inline; filename="${hash}.c2pa"`);
    
    res.json(manifest);
  } catch (error) {
    console.error('Error serving manifest:', error);
    res.status(500).json({ error: 'Failed to serve manifest' });
  }
});

// HTML fallback with link tag
app.get('/assets-with-fallback/:filename', validateFilename, async (req, res) => {
  try {
    const { filename } = req.params;
    // Security: Generate deterministic manifest hash based on filename
    const manifestHash = crypto
      .createHash('sha256')
      .update(`preserve-embed-${filename}`)
      .digest('hex');
    
    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>C2 Concierge Asset</title>
  <link rel="c2pa-manifest" href="/manifests/${manifestHash}.c2pa">
</head>
<body>
  <h1>Asset: ${filename}</h1>
  <p>This asset includes C2PA provenance information.</p>
</body>
</html>`;
    
    res.set('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    console.error('Error serving HTML fallback:', error);
    res.status(500).json({ error: 'Failed to serve HTML fallback' });
  }
});

const server = http.createServer(app);
server.listen(PORT, () => {
  console.log(`Preserve-embed sandbox running on port ${PORT}`);
  console.log(`Health check: http://127.0.0.1:${PORT}/health`);
});
