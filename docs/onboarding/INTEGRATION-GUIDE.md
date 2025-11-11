# CredLink Integration Guide

Complete guide for integrating CredLink API into your application.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Authentication](#authentication)
3. [Sign Images](#sign-images)
4. [Verify Images](#verify-images)
5. [Code Examples](#code-examples)
6. [Best Practices](#best-practices)
7. [Troubleshooting](#troubleshooting)

---

## Quick Start

### 1. Get Your API Key

You should have received an email with your API key. It looks like:
```
cl_beta_a1b2c3d4e5f6...
```

**Keep it secret!** Never commit it to version control or expose it client-side.

### 2. Make Your First Request

**Sign an image:**
```bash
curl -X POST https://api.credlink.com/v1/sign \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "image": "base64_encoded_image_data",
    "metadata": {
      "creator": "Your Company",
      "timestamp": "2025-01-01T00:00:00Z"
    }
  }'
```

**Response:**
```json
{
  "signedImage": "base64_encoded_signed_image",
  "proofUrl": "https://proofs.credlink.com/abc123",
  "manifestId": "abc123"
}
```

### 3. Verify an image

```bash
curl -X POST https://api.credlink.com/v1/verify \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "image": "base64_encoded_image_data"
  }'
```

**Response:**
```json
{
  "valid": true,
  "creator": "Your Company",
  "timestamp": "2025-01-01T00:00:00Z",
  "manifestId": "abc123"
}
```

---

## Authentication

### API Key Header

Include your API key in every request:
```
X-API-Key: cl_beta_a1b2c3d4e5f6...
```

### Environment Variables

**Never hardcode your API key.** Use environment variables:

```bash
# .env
CREDLINK_API_KEY=cl_beta_a1b2c3d4e5f6...
```

```javascript
// Load from environment
const apiKey = process.env.CREDLINK_API_KEY;
```

### Security Best Practices

✅ **Do:**
- Store API key in environment variables
- Use server-side only (never client-side)
- Rotate keys periodically
- Use different keys for dev/prod

❌ **Don't:**
- Commit API keys to git
- Expose keys in client-side code
- Share keys publicly
- Log API keys

---

## Sign Images

### Endpoint

```
POST https://api.credlink.com/v1/sign
```

### Request

**Headers:**
```
X-API-Key: YOUR_API_KEY
Content-Type: application/json
```

**Body:**
```json
{
  "image": "base64_encoded_image_data",
  "metadata": {
    "creator": "Your Company",
    "timestamp": "2025-01-01T00:00:00Z",
    "location": "New York, NY",
    "description": "Product photo"
  }
}
```

**Parameters:**
- `image` (required): Base64-encoded image data
- `metadata` (required): Object with metadata
  - `creator` (required): Creator name
  - `timestamp` (required): ISO 8601 timestamp
  - `location` (optional): Location string
  - `description` (optional): Description

### Response

**Success (200):**
```json
{
  "signedImage": "base64_encoded_signed_image",
  "proofUrl": "https://proofs.credlink.com/abc123",
  "manifestId": "abc123",
  "size": 1234567,
  "format": "image/jpeg"
}
```

**Error (400):**
```json
{
  "error": "Invalid request",
  "message": "Image data is required"
}
```

**Error (401):**
```json
{
  "error": "Unauthorized",
  "message": "Invalid API key"
}
```

### Image Formats

Supported formats:
- JPEG (.jpg, .jpeg)
- PNG (.png)
- WebP (.webp)

Max size: 10MB

---

## Verify Images

### Endpoint

```
POST https://api.credlink.com/v1/verify
```

### Request

**Headers:**
```
X-API-Key: YOUR_API_KEY
Content-Type: application/json
```

**Body:**
```json
{
  "image": "base64_encoded_image_data"
}
```

**Parameters:**
- `image` (required): Base64-encoded image data

### Response

**Success - Valid (200):**
```json
{
  "valid": true,
  "creator": "Your Company",
  "timestamp": "2025-01-01T00:00:00Z",
  "location": "New York, NY",
  "description": "Product photo",
  "manifestId": "abc123",
  "proofUrl": "https://proofs.credlink.com/abc123"
}
```

**Success - Invalid (200):**
```json
{
  "valid": false,
  "message": "No C2PA manifest found"
}
```

**Error (400):**
```json
{
  "error": "Invalid request",
  "message": "Image data is required"
}
```

---

## Code Examples

### cURL

**Sign:**
```bash
#!/bin/bash

API_KEY="cl_beta_your_key_here"
IMAGE_FILE="photo.jpg"

# Convert image to base64
IMAGE_BASE64=$(base64 -i "$IMAGE_FILE")

# Sign image
curl -X POST https://api.credlink.com/v1/sign \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"image\": \"$IMAGE_BASE64\",
    \"metadata\": {
      \"creator\": \"My Company\",
      \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
    }
  }" | jq .
```

**Verify:**
```bash
#!/bin/bash

API_KEY="cl_beta_your_key_here"
IMAGE_FILE="signed_photo.jpg"

# Convert image to base64
IMAGE_BASE64=$(base64 -i "$IMAGE_FILE")

# Verify image
curl -X POST https://api.credlink.com/v1/verify \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"image\": \"$IMAGE_BASE64\"
  }" | jq .
```

---

### JavaScript (Node.js)

**Install:**
```bash
npm install axios
```

**Sign:**
```javascript
const axios = require('axios');
const fs = require('fs');

const API_KEY = process.env.CREDLINK_API_KEY;
const API_URL = 'https://api.credlink.com/v1';

async function signImage(imagePath) {
  // Read and encode image
  const imageBuffer = fs.readFileSync(imagePath);
  const imageBase64 = imageBuffer.toString('base64');

  // Sign image
  const response = await axios.post(`${API_URL}/sign`, {
    image: imageBase64,
    metadata: {
      creator: 'My Company',
      timestamp: new Date().toISOString()
    }
  }, {
    headers: {
      'X-API-Key': API_KEY,
      'Content-Type': 'application/json'
    }
  });

  // Save signed image
  const signedBuffer = Buffer.from(response.data.signedImage, 'base64');
  fs.writeFileSync('signed_image.jpg', signedBuffer);

  console.log('Signed image saved!');
  console.log('Proof URL:', response.data.proofUrl);
  console.log('Manifest ID:', response.data.manifestId);
}

signImage('photo.jpg').catch(console.error);
```

**Verify:**
```javascript
const axios = require('axios');
const fs = require('fs');

const API_KEY = process.env.CREDLINK_API_KEY;
const API_URL = 'https://api.credlink.com/v1';

async function verifyImage(imagePath) {
  // Read and encode image
  const imageBuffer = fs.readFileSync(imagePath);
  const imageBase64 = imageBuffer.toString('base64');

  // Verify image
  const response = await axios.post(`${API_URL}/verify`, {
    image: imageBase64
  }, {
    headers: {
      'X-API-Key': API_KEY,
      'Content-Type': 'application/json'
    }
  });

  if (response.data.valid) {
    console.log('✅ Image is authentic!');
    console.log('Creator:', response.data.creator);
    console.log('Timestamp:', response.data.timestamp);
  } else {
    console.log('❌ Image is not authentic');
  }
}

verifyImage('signed_image.jpg').catch(console.error);
```

---

### Python

**Install:**
```bash
pip install requests
```

**Sign:**
```python
import requests
import base64
import os
from datetime import datetime

API_KEY = os.getenv('CREDLINK_API_KEY')
API_URL = 'https://api.credlink.com/v1'

def sign_image(image_path):
    # Read and encode image
    with open(image_path, 'rb') as f:
        image_data = base64.b64encode(f.read()).decode('utf-8')
    
    # Sign image
    response = requests.post(
        f'{API_URL}/sign',
        headers={
            'X-API-Key': API_KEY,
            'Content-Type': 'application/json'
        },
        json={
            'image': image_data,
            'metadata': {
                'creator': 'My Company',
                'timestamp': datetime.utcnow().isoformat() + 'Z'
            }
        }
    )
    
    response.raise_for_status()
    data = response.json()
    
    # Save signed image
    signed_data = base64.b64decode(data['signedImage'])
    with open('signed_image.jpg', 'wb') as f:
        f.write(signed_data)
    
    print('Signed image saved!')
    print(f"Proof URL: {data['proofUrl']}")
    print(f"Manifest ID: {data['manifestId']}")

sign_image('photo.jpg')
```

**Verify:**
```python
import requests
import base64
import os

API_KEY = os.getenv('CREDLINK_API_KEY')
API_URL = 'https://api.credlink.com/v1'

def verify_image(image_path):
    # Read and encode image
    with open(image_path, 'rb') as f:
        image_data = base64.b64encode(f.read()).decode('utf-8')
    
    # Verify image
    response = requests.post(
        f'{API_URL}/verify',
        headers={
            'X-API-Key': API_KEY,
            'Content-Type': 'application/json'
        },
        json={'image': image_data}
    )
    
    response.raise_for_status()
    data = response.json()
    
    if data['valid']:
        print('✅ Image is authentic!')
        print(f"Creator: {data['creator']}")
        print(f"Timestamp: {data['timestamp']}")
    else:
        print('❌ Image is not authentic')

verify_image('signed_image.jpg')
```

---

## Best Practices

### 1. Error Handling

Always handle errors gracefully:

```javascript
try {
  const response = await signImage(imagePath);
  console.log('Success:', response.data);
} catch (error) {
  if (error.response) {
    // API error
    console.error('API Error:', error.response.data.message);
  } else if (error.request) {
    // Network error
    console.error('Network Error:', error.message);
  } else {
    // Other error
    console.error('Error:', error.message);
  }
}
```

### 2. Retry Logic

Implement exponential backoff for transient failures:

```javascript
async function signWithRetry(imagePath, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await signImage(imagePath);
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      
      // Exponential backoff
      const delay = Math.pow(2, i) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

### 3. Caching

Cache verification results to reduce API calls:

```javascript
const verificationCache = new Map();

async function verifyWithCache(imageHash) {
  // Check cache
  if (verificationCache.has(imageHash)) {
    return verificationCache.get(imageHash);
  }
  
  // Verify
  const result = await verifyImage(imageHash);
  
  // Cache for 1 hour
  verificationCache.set(imageHash, result);
  setTimeout(() => verificationCache.delete(imageHash), 3600000);
  
  return result;
}
```

### 4. Batch Processing

Process multiple images efficiently:

```javascript
async function signBatch(imagePaths) {
  const promises = imagePaths.map(path => signImage(path));
  return await Promise.all(promises);
}
```

### 5. Monitoring

Track API usage and errors:

```javascript
let apiCalls = 0;
let apiErrors = 0;

async function signWithMonitoring(imagePath) {
  apiCalls++;
  try {
    return await signImage(imagePath);
  } catch (error) {
    apiErrors++;
    throw error;
  }
}

// Log stats periodically
setInterval(() => {
  console.log(`API Calls: ${apiCalls}, Errors: ${apiErrors}`);
}, 60000);
```

---

## Troubleshooting

### Common Errors

**401 Unauthorized**
```
Error: Invalid API key
```
**Solution:** Check your API key is correct and not expired.

---

**400 Bad Request**
```
Error: Image data is required
```
**Solution:** Ensure image is properly base64-encoded.

---

**413 Payload Too Large**
```
Error: Image size exceeds 10MB limit
```
**Solution:** Compress image before signing.

---

**429 Too Many Requests**
```
Error: Rate limit exceeded
```
**Solution:** Implement exponential backoff and reduce request rate.

---

**500 Internal Server Error**
```
Error: Server error
```
**Solution:** Retry request. If persists, contact support.

---

### Debug Mode

Enable debug logging:

```javascript
axios.interceptors.request.use(request => {
  console.log('Request:', request);
  return request;
});

axios.interceptors.response.use(response => {
  console.log('Response:', response);
  return response;
});
```

### Test Your Integration

Use our test endpoint:

```bash
curl -X POST https://api.credlink.com/v1/test \
  -H "X-API-Key: YOUR_API_KEY"
```

Expected response:
```json
{
  "status": "ok",
  "message": "API key is valid"
}
```

---

## Support

### Getting Help

- **Email:** support@credlink.com
- **Slack:** #beta-customers (if invited)
- **Documentation:** https://docs.credlink.com

### Response Times

- Email: Within 24 hours
- Slack: Within 4 hours (business days)
- Critical issues: Within 1 hour

---

## Rate Limits

### Beta Program

- **Requests per day:** 10,000
- **Requests per month:** 300,000
- **Concurrent requests:** 10

These limits are generous for beta testing. Contact us if you need higher limits.

---

## Next Steps

1. ✅ Get your API key
2. ✅ Make your first request
3. ✅ Integrate into your app
4. 📧 Share feedback with us

**Questions?** Email support@credlink.com

---

**Last Updated:** November 2025  
**Version:** 1.0.0 (Beta)
