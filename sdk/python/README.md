# CredLink SDK - Python v1.3.0

[![PyPI version](https://badge.fury.io/py/credlink.svg)](https://badge.fury.io/py/credlink)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python 3.8+](https://img.shields.io/badge/python-3.8+-blue.svg)](https://www.python.org/downloads/)

A comprehensive Python SDK for cryptographic provenance verification and signing with the CredLink API.

## ✨ Features

- 🚀 **HTTP API wrapper** with automatic retries and exponential backoff
- 🔒 **Comprehensive error handling** with actionable hints and search-friendly messages
- ⚡ **Circuit breaker** for resilience against service outages
- 📊 **Optional OpenTelemetry telemetry** for observability
- 🎯 **Full type hints** with Pydantic models generated from OpenAPI
- 🔄 **Idempotency support** for safe retry mechanisms
- 📦 **Async/await support** for streaming responses
- 🛡️ **Security hardening** with timeout enforcement and input validation

## 📦 Installation

```bash
pip install credlink
```

For development with optional dependencies:

```bash
pip install credlink[dev,otel]
```

## 🚀 Quick Start

```python
import asyncio
from credlink import Client

async def main():
    # Initialize client
    client = Client(api_key="your-api-key")
    
    # Verify an asset
    result = await client.verify_asset(
        "https://example.com/image.jpg",
        {"policy_id": "default"}
    )
    
    print(f"Asset verified: {result.data.verified}")
    
    # Verify page assets during build
    async for asset in client.verify_page("https://site.example/article"):
        if not asset.verified:
            raise Exception(f"Verification failed: {asset.error}")

asyncio.run(main())
```

## 📖 API Reference

### Client Configuration

```python
from credlink import Client, ClientConfig, RetryConfig, TelemetryConfig

config = ClientConfig(
    api_key="your-api-key",
    base_url="https://api.credlink.com/v1",     # Optional
    timeout_ms=30000,                              # Optional
    telemetry=TelemetryConfig(                     # Optional
        enabled=True,
        otel={
            "service_name": "my-app",
            "service_version": "1.0.0"
        }
    ),
    retries=RetryConfig(                           # Optional
        max_attempts=5,
        base_ms=250,
        max_ms=5000,
        jitter=True
    )
)

client = Client(config)
```

### Asset Verification

```python
# Verify by URL
result = await client.verify_asset(
    "https://example.com/image.jpg",
    {
        "policy_id": "default",
        "timeout": 5000,
        "cached_etag": '"abc123def456"',
        "enable_delta": True
    }
)

# Verify by content
result = await client.verify_asset(
    "base64-encoded-content",
    {
        "policy_id": "default",
        "content_type": "image/jpeg"
    }
)
```

### Page Verification

```python
# Verify all assets on a page
async for asset in client.verify_page(
    "https://example.com/article",
    {
        "follow_links": True,
        "max_depth": 2,
        "policy_id": "default"
    }
):
    status = "✅" if asset.verified else "❌"
    print(f"{status} {asset.url}")
```

### Batch Verification

```python
# Verify multiple assets
assets = [
    "https://example.com/image1.jpg",
    "https://example.com/image2.png",
    "https://example.com/video.mp4"
]

async for result in client.batch_verify(
    assets,
    {
        "parallel": True,
        "timeout_per_asset": 5000
    }
):
    if result.result and result.result.verified:
        print(f"✅ {result.asset.url}")
    else:
        print(f"❌ {result.asset.url}: {result.error.get('message')}")
```

### Link Injection

```python
# Inject C2PA manifest links into HTML
modified_html = await client.inject_link(
    html_content,
    {
        "manifest_url": "https://manifests.example.com/{sha256}.c2pa",
        "strategy": "sha256_path",
        "selector": "img[src], video[src]"
    }
)
```

### Folder Signing

```python
# Sign a folder with RFC-3161 timestamps
job = await client.sign_folder(
    "./public/images",
    {
        "profile_id": "newsroom-default",
        "tsa": True,
        "recursive": True,
        "file_patterns": ["*.jpg", "*.png", "*.mp4"]
    }
)

# Monitor job progress
status = await client.get_job_status(job.data["job_id"])
print(f"Job status: {status.status}")
```

### Manifest Operations

```python
# Get manifest with conditional request
manifest = await client.get_manifest(
    hash,
    {
        "cached_etag": '"abc123def456"',
        "format": "json"
    }
)

# Store manifest with idempotency
result = await client.put_manifest(
    hash,
    manifest_content,
    {
        "content_type": "application/c2pa",
        "idempotency_key": "unique-key-for-this-manifest"
    }
)
```

## 🔧 Error Handling

The SDK provides comprehensive error handling with actionable hints:

```python
import asyncio
from credlink import Client
from credlink.types import (
    C2ConciergeError,
    RateLimitError,
    ValidationError,
    AuthError
)

async def main():
    client = Client(api_key="your-api-key")
    
    try:
        await client.verify_asset(
            "https://example.com/image.jpg",
            {"policy_id": "default"}
        )
    except RateLimitError as e:
        print(e.get_summary())  # "C2C RateLimitError: 429 (Retry-After=60s) - Rate limit exceeded"
        print(e.retry_after)    # 60
        print(e.get_next_steps())  # ["Implement exponential backoff with jitter", ...]
    except ValidationError as e:
        print(e.hint)  # "Check required fields and data formats"
    except C2ConciergeError as e:
        print(e.request_id)  # Request ID for debugging
        print(e.docs_url)    # Link to documentation

asyncio.run(main())
```

## 📊 Telemetry

Enable OpenTelemetry for observability:

```python
from credlink import Client, ClientConfig, TelemetryConfig

config = ClientConfig(
    api_key="your-api-key",
    telemetry=TelemetryConfig(
        enabled=True,
        otel={
            "service_name": "my-app",
            "service_version": "1.0.0"
        }
    )
)

client = Client(config)
```

Install the optional telemetry packages:

```bash
pip install credlink[otel]
```

## 🔄 Retries and Backoff

The SDK automatically handles retries with exponential backoff:

- **Default attempts**: 5 (1 initial + 4 retries)
- **Base delay**: 250ms
- **Maximum delay**: 5s
- **Jitter**: Full jitter enabled
- **Retry conditions**: 429, 408, 409 (with same idempotency key), 5xx, network errors

Configure custom retry behavior:

```python
from credlink import Client, ClientConfig, RetryConfig

config = ClientConfig(
    api_key="your-api-key",
    retries=RetryConfig(
        max_attempts=3,
        base_ms=500,
        max_ms=10000,
        jitter=True
    )
)

client = Client(config)
```

## 🛡️ Security Best Practices

### API Key Management

```python
import os
from credlink import Client

# Never hardcode API keys
client = Client(api_key=os.getenv("C2_API_KEY"))

# Use environment variables or secret management
```

### Content Security

```python
# Always validate content type when using buffers
await client.verify_asset(
    base64_content,
    {
        "policy_id": "default",
        "content_type": "image/jpeg"  # Required for buffer verification
    }
)
```

### Idempotency

```python
# Use idempotency keys for safe retries
result = await client.sign_folder(
    "./images",
    {
        "profile_id": "default",
        "idempotency_key": "unique-operation-id"
    }
)
```

## 📝 Examples

### Build Integration

```python
# verify_build.py - Verify assets during build process
import asyncio
import sys
from credlink import Client

async def verify_build_assets(page_urls):
    client = Client(api_key=os.getenv("C2_API_KEY"))
    
    for url in page_urls:
        verified_count = 0
        total_count = 0
        
        async for asset in client.verify_page(url):
            total_count += 1
            if asset.verified:
                verified_count += 1
            else:
                print(f"❌ {asset.url}: {asset.error}")
                sys.exit(1)
        
        print(f"✅ {url}: {verified_count}/{total_count} assets verified")

if __name__ == "__main__":
    asyncio.run(verify_build_assets([
        "https://mysite.com/home",
        "https://mysite.com/about",
        "https://mysite.com/contact"
    ]))
```

### Batch Processing

```python
# batch_verify.py - Process RSS feeds or asset lists
import asyncio
from credlink import Client

async def batch_verify_from_feed(feed_url):
    client = Client(api_key=os.getenv("C2_API_KEY"))
    
    # Extract URLs from RSS feed
    asset_urls = await extract_urls_from_feed(feed_url)
    
    results = []
    async for result in client.batch_verify(asset_urls):
        results.append({
            "url": result.asset.url,
            "verified": result.result.verified if result.result else False,
            "error": result.error.get("message") if result.error else None
        })
    
    # Generate report
    verified = sum(1 for r in results if r["verified"])
    print(f"Batch verification complete: {verified}/{len(results)} verified")
    
    return results

async def extract_urls_from_feed(feed_url):
    # Implementation to extract URLs from RSS feed
    pass
```

### Context Manager Usage

```python
# Using client as context manager for proper cleanup
async def main():
    config = ClientConfig(api_key="your-api-key")
    
    async with Client(config) as client:
        result = await client.verify_asset(
            "https://example.com/image.jpg",
            {"policy_id": "default"}
        )
        print(f"Verified: {result.data.verified}")
    # Client automatically closed here

asyncio.run(main())
```

## 🔧 Development

```bash
# Install development dependencies
pip install -e .[dev]

# Run tests
pytest

# Run tests with coverage
pytest --cov=credlink --cov-report=html

# Run linting
black src/
isort src/
flake8 src/
mypy src/

# Build package
python -m build
```

## 🧪 Testing

The SDK includes comprehensive tests:

```bash
# Run all tests
pytest

# Run specific test categories
pytest -m unit
pytest -m integration
pytest -m slow

# Run with coverage
pytest --cov=credlink --cov-report=term-missing
```

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🔗 Links

- [Documentation](https://docs.credlink.com)
- [API Reference](https://docs.credlink.com/api)
- [Examples](../../examples/)
- [GitHub Repository](https://github.com/Nickiller04/CredLink)
- [Bug Reports](https://github.com/Nickiller04/CredLink/issues)
- [Security Policy](../../SECURITY.md)

## 🤝 Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](../../CONTRIBUTING.md) for details.

## 📋 Changelog

See [CHANGELOG.md](CHANGELOG.md) for a detailed history of changes.
