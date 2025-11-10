# CredLink SDK - Go v2

[![GoDoc](https://pkg.go.dev/badge/github.com/credlink/sdk-go/v2)](https://pkg.go.dev/github.com/credlink/sdk-go/v2)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Go Version](https://img.shields.io/badge/go-1.21+-blue.svg)](https://golang.org/dl/)

A comprehensive Go SDK for cryptographic provenance verification and signing with the CredLink API.

## ✨ Features

- 🚀 **HTTP API wrapper** with automatic retries and exponential backoff
- 🔒 **Comprehensive error handling** with actionable hints and search-friendly messages
- ⚡ **Circuit breaker** for resilience against service outages
- 📊 **Optional telemetry** for observability
- 🎯 **Full type safety** with structs generated from OpenAPI
- 🔄 **Idempotency support** for safe retry mechanisms
- 📦 **Streaming responses** using Go channels
- 🛡️ **Security hardening** with timeout enforcement and input validation

## 📦 Installation

```bash
go get github.com/credlink/sdk-go/v2
```

## 🚀 Quick Start

```go
package main

import (
    "context"
    "fmt"
    "log"
    
    "github.com/credlink/sdk-go/v2/credlink"
)

func main() {
    // Initialize client
    client := credlink.NewClientWithAPIKey("your-api-key")
    defer client.Close()
    
    // Verify an asset
    result, err := client.VerifyAsset(context.Background(), 
        "https://example.com/image.jpg", 
        credlink.VerifyAssetOptions{PolicyID: "default"})
    if err != nil {
        log.Fatal(err)
    }
    
    fmt.Printf("Asset verified: %v\n", result.Data.Verified)
    
    // Verify page assets during build
    resultCh, err := client.VerifyPage(context.Background(), 
        "https://site.example/article", 
        credlink.VerifyPageOptions{})
    if err != nil {
        log.Fatal(err)
    }
    
    for asset := range resultCh {
        if !asset.Verified {
            log.Fatalf("Verification failed: %s", *asset.Error)
        }
    }
}
```

## 📖 API Reference

### Client Configuration

```go
import (
    "time"
    "github.com/credlink/sdk-go/v2/credlink"
)

config := &credlink.Config{
    APIKey:    "your-api-key",
    BaseURL:   "https://api.credlink.com/v1", // Optional
    TimeoutMs: 30 * time.Second,                 // Optional
    Telemetry: &credlink.TelemetryConfig{             // Optional
        Enabled: true,
        OTel: map[string]string{
            "service_name":    "my-app",
            "service_version": "1.0.0",
        },
    },
    Retries: &credlink.RetryConfig{ // Optional
        MaxAttempts: 5,
        BaseMs:      250 * time.Millisecond,
        MaxMs:       5 * time.Second,
        Jitter:      true,
    },
}

client := credlink.NewClient(config)
```

### Asset Verification

```go
// Verify by URL
result, err := client.VerifyAsset(context.Background(), 
    "https://example.com/image.jpg", 
    credlink.VerifyAssetOptions{
        PolicyID:    "default",
        Timeout:     credlink.Ptr(5 * time.Second),
        CachedETag:  credlink.Ptr(`"abc123def456"`),
        EnableDelta: credlink.Ptr(true),
    })

// Verify by content (base64 encoded)
result, err := client.VerifyAsset(context.Background(), 
    "base64-encoded-content", 
    credlink.VerifyAssetOptions{
        PolicyID:    "default",
        ContentType: credlink.Ptr("image/jpeg"),
    })
```

### Page Verification

```go
// Verify all assets on a page
resultCh, err := client.VerifyPage(context.Background(), 
    "https://example.com/article", 
    credlink.VerifyPageOptions{
        FollowLinks: credlink.Ptr(true),
        MaxDepth:    credlink.Ptr(2),
        PolicyID:    credlink.Ptr("default"),
    })

for asset := range resultCh {
    status := "✅"
    if !asset.Verified {
        status = "❌"
    }
    fmt.Printf("%s %s\n", status, *asset.URL)
}
```

### Batch Verification

```go
// Verify multiple assets
assets := []string{
    "https://example.com/image1.jpg",
    "https://example.com/image2.png",
    "https://example.com/video.mp4",
}

resultCh, err := client.BatchVerify(context.Background(), 
    assets, 
    credlink.BatchVerifyOptions{
        Parallel:       credlink.Ptr(true),
        TimeoutPerAsset: credlink.Ptr(5 * time.Second),
    })

for result := range resultCh {
    if result.Result != nil && result.Result.Verified {
        fmt.Printf("✅ %s\n", result.Asset.URL)
    } else {
        fmt.Printf("❌ %s: %v\n", result.Asset.URL, result.Error)
    }
}
```

### Link Injection

```go
// Inject C2PA manifest links into HTML
modifiedHTML, err := client.InjectLink(context.Background(), 
    htmlContent, 
    credlink.InjectLinkOptions{
        ManifestURL: "https://manifests.example.com/{sha256}.c2pa",
        Strategy:    credlink.Ptr("sha256_path"),
        Selector:    credlink.Ptr("img[src], video[src]"),
    })
```

### Folder Signing

```go
// Sign a folder with RFC-3161 timestamps
job, err := client.SignFolder(context.Background(), 
    "./public/images", 
    credlink.SignFolderOptions{
        ProfileID:  "newsroom-default",
        TSA:        credlink.Ptr(true),
        Recursive:  credlink.Ptr(true),
        FilePatterns: []string{"*.jpg", "*.png", "*.mp4"},
    })

// Monitor job progress
status, err := client.GetJobStatus(context.Background(), job.Data["job_id"].(string))
fmt.Printf("Job status: %s\n", status.Status)
```

### Manifest Operations

```go
// Get manifest with conditional request
manifest, err := client.GetManifest(context.Background(), 
    hash, 
    credlink.GetManifestOptions{
        CachedETag: credlink.Ptr(`"abc123def456"`),
        Format:     credlink.Ptr("json"),
    })

// Store manifest with idempotency
result, err := client.PutManifest(context.Background(), 
    hash, 
    manifestContent, 
    credlink.PutManifestOptions{
        ContentType:     credlink.Ptr("application/c2pa"),
        IdempotencyKey: credlink.Ptr("unique-key-for-this-manifest"),
    })
```

## 🔧 Error Handling

The SDK provides comprehensive error handling with actionable hints:

```go
import (
    "fmt"
    "log"
    "github.com/credlink/sdk-go/v2/credlink"
)

func main() {
    client := credlink.NewClientWithAPIKey("your-api-key")
    
    result, err := client.VerifyAsset(context.Background(), 
        "https://example.com/image.jpg", 
        credlink.VerifyAssetOptions{PolicyID: "default"})
    
    if err != nil {
        switch e := err.(type) {
        case *credlink.RateLimitError:
            fmt.Println(e.Summary()) // "C2C RateLimitError: 429 (Retry-After=60s) - Rate limit exceeded"
            if e.RetryAfter != nil {
                fmt.Printf("Retry after: %d seconds\n", *e.RetryAfter)
            }
            for _, step := range e.NextSteps() {
                fmt.Printf("- %s\n", step)
            }
        case *credlink.ValidationError:
            fmt.Printf("Validation error: %s\n", e.Hint)
        case *credlink.CredLinkError:
            fmt.Printf("Request ID: %s\n", e.RequestID())
            fmt.Printf("Documentation: %s\n", e.DocsURL())
        default:
            log.Fatal(err)
        }
    }
    
    fmt.Printf("Verified: %v\n", result.Data.Verified)
}
```

## 📊 Telemetry

Enable telemetry for observability:

```go
config := &credlink.Config{
    APIKey: "your-api-key",
    Telemetry: &credlink.TelemetryConfig{
        Enabled: true,
        OTel: map[string]string{
            "service_name":    "my-app",
            "service_version": "1.0.0",
        },
    },
}

client := credlink.NewClient(config)
```

## 🔄 Retries and Backoff

The SDK automatically handles retries with exponential backoff:

- **Default attempts**: 5 (1 initial + 4 retries)
- **Base delay**: 250ms
- **Maximum delay**: 5s
- **Jitter**: Full jitter enabled
- **Retry conditions**: 429, 408, 409 (with same idempotency key), 5xx, network errors

Configure custom retry behavior:

```go
config := &credlink.Config{
    APIKey: "your-api-key",
    Retries: &credlink.RetryConfig{
        MaxAttempts: 3,
        BaseMs:      500 * time.Millisecond,
        MaxMs:       10 * time.Second,
        Jitter:      true,
    },
}

client := credlink.NewClient(config)
```

## 🛡️ Security Best Practices

### API Key Management

```go
import "os"

// Never hardcode API keys
apiKey := os.Getenv("C2_API_KEY")
client := credlink.NewClientWithAPIKey(apiKey)

// Use environment variables or secret management
```

### Content Security

```go
// Always validate content type when using buffers
result, err := client.VerifyAsset(context.Background(), 
    base64Content, 
    credlink.VerifyAssetOptions{
        PolicyID:    "default",
        ContentType: credlink.Ptr("image/jpeg"), // Required for buffer verification
    })
```

### Idempotency

```go
// Use idempotency keys for safe retries
idempotencyKey := "unique-operation-id"
result, err := client.SignFolder(context.Background(), 
    "./images", 
    credlink.SignFolderOptions{
        ProfileID:      "default",
        IdempotencyKey: &idempotencyKey,
    })
```

## 📝 Examples

### Build Integration

```go
// main.go - Verify assets during build process
package main

import (
    "context"
    "fmt"
    "log"
    "os"
    
    "github.com/credlink/sdk-go/v2/credlink"
)

func main() {
    apiKey := os.Getenv("C2_API_KEY")
    if apiKey == "" {
        log.Fatal("C2_API_KEY environment variable is required")
    }
    
    client := credlink.NewClientWithAPIKey(apiKey)
    defer client.Close()
    
    pageUrls := []string{
        "https://mysite.com/home",
        "https://mysite.com/about",
        "https://mysite.com/contact",
    }
    
    for _, url := range pageUrls {
        if err := verifyPageAssets(context.Background(), client, url); err != nil {
            log.Fatalf("Failed to verify %s: %v", url, err)
        }
    }
}

func verifyPageAssets(ctx context.Context, client *credlink.Client, url string) error {
    resultCh, err := client.VerifyPage(ctx, url, credlink.VerifyPageOptions{})
    if err != nil {
        return err
    }
    
    verifiedCount := 0
    totalCount := 0
    
    for asset := range resultCh {
        totalCount++
        if asset.Verified {
            verifiedCount++
        } else {
            fmt.Printf("❌ %s: %s\n", *asset.URL, *asset.Error)
            return fmt.Errorf("verification failed for %s", *asset.URL)
        }
    }
    
    fmt.Printf("✅ %s: %d/%d assets verified\n", url, verifiedCount, totalCount)
    return nil
}
```

### Batch Processing

```go
// batch_verify.go - Process RSS feeds or asset lists
package main

import (
    "context"
    "fmt"
    "log"
    "os"
    
    "github.com/credlink/sdk-go/v2/credlink"
)

func main() {
    apiKey := os.Getenv("C2_API_KEY")
    client := credlink.NewClientWithAPIKey(apiKey)
    defer client.Close()
    
    // Extract URLs from RSS feed
    assetUrls, err := extractUrlsFromFeed("https://example.com/feed.rss")
    if err != nil {
        log.Fatal(err)
    }
    
    results, err := batchVerifyAssets(context.Background(), client, assetUrls)
    if err != nil {
        log.Fatal(err)
    }
    
    // Generate report
    verified := 0
    for _, result := range results {
        if result.Verified {
            verified++
        }
    }
    
    fmt.Printf("Batch verification complete: %d/%d verified\n", verified, len(results))
}

func batchVerifyAssets(ctx context.Context, client *credlink.Client, urls []string) ([]BatchResult, error) {
    resultCh, err := client.BatchVerify(ctx, urls, credlink.BatchVerifyOptions{})
    if err != nil {
        return nil, err
    }
    
    var results []BatchResult
    for result := range resultCh {
        verified := false
        if result.Result != nil {
            verified = result.Result.Verified
        }
        
        results = append(results, BatchResult{
            URL:      result.Asset.URL,
            Verified: verified,
            Error:    result.Error,
        })
    }
    
    return results, nil
}

type BatchResult struct {
    URL      string
    Verified bool
    Error    map[string]interface{}
}

func extractUrlsFromFeed(feedURL string) ([]string, error) {
    // Implementation to extract URLs from RSS feed
    return []string{}, nil
}
```

### Context with Timeout

```go
// Using context with timeout for request control
package main

import (
    "context"
    "fmt"
    "time"
    
    "github.com/credlink/sdk-go/v2/credlink"
)

func main() {
    client := credlink.NewClientWithAPIKey("your-api-key")
    defer client.Close()
    
    // Create context with 10-second timeout
    ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
    defer cancel()
    
    result, err := client.VerifyAsset(ctx, 
        "https://example.com/image.jpg", 
        credlink.VerifyAssetOptions{PolicyID: "default"})
    
    if err != nil {
        if ctx.Err() == context.DeadlineExceeded {
            fmt.Println("Request timed out")
        } else {
            fmt.Printf("Error: %v\n", err)
        }
        return
    }
    
    fmt.Printf("Verified: %v\n", result.Data.Verified)
}
```

## 🔧 Development

```bash
# Download dependencies
go mod download

# Run tests
go test -v ./...

# Run tests with coverage
go test -v -race -coverprofile=coverage.out ./...

# Run vet
go vet ./...

# Format code
go fmt ./...

# Build package
go build -v ./...
```

## 🧪 Testing

The SDK includes comprehensive tests:

```bash
# Run all tests
go test -v ./...

# Run tests with race detection
go test -race ./...

# Run tests with coverage
go test -coverprofile=coverage.out ./...

# Run benchmark tests
go test -bench=. ./...

# Run specific test
go test -v -run TestVerifyAsset ./...
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
