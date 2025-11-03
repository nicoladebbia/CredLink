#!/usr/bin/env node

const express = require('express');
const sharp = require('sharp');
const cors = require('cors');
const http = require('http');
const crypto = require('crypto');

const PORT = process.env.PORT || 4101;
const app = express();

app.use(cors());
app.use(express.json());

// Security: Rate limiting middleware
const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

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
  res.json({ status: 'healthy', sandbox: 'strip-happy', port: PORT });
});

// Serve assets with transformations
app.get('/assets/:filename', validateFilename, async (req, res) => {
  try {
    const { filename } = req.params;
    
    // Create a simple test image buffer for Phase 0
    const imageBuffer = await sharp({
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

    // Security: Generate deterministic manifest hash based on filename and content
    const manifestHash = crypto
      .createHash('sha256')
      .update(`strip-happy-${filename}-${imageBuffer.length}`)
      .digest('hex');
    
    res.set('X-Manifest-Hash', manifestHash);
    res.set('X-C2-Policy', 'remote-only');
    res.set('Cache-Control', 'public, max-age=3600');
    res.set('Content-Type', 'image/jpeg');
    res.set('Link', `</manifests/${manifestHash}.c2pa>; rel="c2pa-manifest"`);
    
    // Security: Add anti-CSRF and security headers
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('X-Frame-Options', 'DENY');
    res.set('X-XSS-Protection', '1; mode=block');
    res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    
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
    
    // Security: Validate hash format
    if (!/^[a-fA-F0-9]{64}$/.test(hash)) {
      return res.status(400).json({ error: 'Invalid manifest hash format' });
    }
    
    // For Phase 0, return a deterministic manifest based on hash
    const manifest = {
      '@context': ['https://w3id.org/c2pa/1.0'],
      claim: {
        signature: crypto.createHash('sha256').update(`strip-happy-${hash}`).digest('hex'),
        assertion_data: {
          'c2pa.assertions': [
            {
              'label': 'c2pa.actions',
              'data': {
                'actions': [
                  {
                    'action': 'c2pa.created',
                    'when': new Date().toISOString(),
                    'softwareAgent': 'C2-Concierge-Strip-Happy'
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

const server = http.createServer(app);
server.listen(PORT, () => {
  console.log(`Strip-happy sandbox running on port ${PORT}`);
  console.log(`Health check: http://127.0.0.1:${PORT}/health`);
});
