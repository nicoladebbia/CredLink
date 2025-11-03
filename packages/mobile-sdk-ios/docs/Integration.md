# iOS Integration Guide

## Quick Start (< 60 minutes)

### 1. Add Swift Package
1. In Xcode, go to File → Add Package Dependencies
2. Enter URL: `https://github.com/Nickiller04/c2-concierge`
3. Select "C2ConciergeMobile" package
4. Add to your target

### 2. Import and Initialize
```swift
import C2ConciergeMobile

class ViewController: UIViewController {
    private let config = C2CConfig(
        relayBaseURL: URL(string: "https://verify.c2concierge.org")!,
        pinnedSPKIHashes: ["relay_spki_hash_here"],
        enableDebugLogging: true
    )
    
    private lazy var verifier = C2CMobileVerifier(config: config)
}
```

### 3. Basic Verification
```swift
// Verify URL
func verifyImage(url: URL) {
    verifier.verify(url: url, preferRelay: true) { result in
        DispatchQueue.main.async {
            // Show results modal
            let resultsVC = ResultsViewController(result: result)
            self.present(resultsVC, animated: true)
        }
    }
}

// Verify from Photos
func verifyPhoto(_ asset: PHAsset) {
    verifier.verify(localAsset: asset) { result in
        DispatchQueue.main.async {
            let resultsVC = ResultsViewController(result: result)
            self.present(resultsVC, animated: true)
        }
    }
}
```

## Share Extension Integration

### 1. Create Share Extension
See `docs/ShareExtension.md` for detailed steps

### 2. Handle Shared Content
```swift
import C2ConciergeMobile

class ShareViewController: SLComposeServiceViewController {
    private let config = C2CConfig()
    private lazy var shareHandler = ShareExtensionHandler(config: config)
    
    override func didSelectPost() {
        if let items = self.extensionContext?.inputItems as? [NSExtensionItem] {
            shareHandler.handleSharedItems(items) { resultsVC in
                if let resultsVC = resultsVC {
                    self.present(resultsVC, animated: true) {
                        self.extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
                    }
                }
            }
        }
    }
}
```

## Photos Integration

### 1. Add Photo Library Usage
Add to `Info.plist`:
```xml
<key>NSPhotoLibraryUsageDescription</key>
<string>This app needs access to your photo library to verify content credentials.</string>
```

### 2. Photo Picker Implementation
```swift
import PhotosUI

struct ContentView: View {
    @State private var selectedItems: [PhotosPickerItem] = []
    @EnvironmentObject private var verifier: C2CMobileVerifier
    
    var body: some View {
        PhotosPicker(
            selection: $selectedItems,
            maxSelectionCount: 1,
            matching: .images
        ) {
            Text("Select Photo to Verify")
        }
        .onChange(of: selectedItems) { items in
            Task {
                if let item = items.first {
                    if let data = try? await item.loadTransferable(type: Data.self) {
                        // Process and verify
                    }
                }
            }
        }
    }
}
```

## Advanced Configuration

### TLS Pinning
```swift
let config = C2CConfig(
    relayBaseURL: URL(string: "https://verify.c2concierge.org")!,
    pinnedSPKIHashes: [
        "base64_encoded_spki_hash_1",
        "base64_encoded_spki_hash_2"
    ]
)
```

### Cache Configuration
```swift
let config = C2CConfig(
    cacheMemoryBytes: 20 * 1024 * 1024, // 20MB
    cacheDiskBytes: 100 * 1024 * 1024,   // 100MB
    manifestTTL: 600 // 10 minutes
)
```

### Background Processing
```swift
import BackgroundTasks

func scheduleBackgroundVerification() {
    let request = BGProcessingTaskRequest(identifier: "com.c2concierge.verification")
    request.requiresNetworkConnectivity = true
    request.requiresExternalPower = false
    
    try? BGTaskScheduler.shared.submit(request)
}
```

## Memory Management

### Share Extension Guidelines
- Keep memory usage below 90MB steady-state
- Stream files to disk instead of loading into memory
- Use `Data` instead of `UIImage` for processing
- Implement proper cleanup

```swift
class ShareExtensionHandler {
    func processSharedItem(_ item: NSExtensionItem) {
        // Stream to temp file
        let tempURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
        
        // Process without loading full image into memory
        // ...
        
        // Cleanup
        try? FileManager.default.removeItem(at: tempURL)
    }
}
```

## Performance Optimization

### 1. Asynchronous Processing
```swift
func verifyAsync(url: URL) async {
    do {
        let result = try await withCheckedThrowingContinuation { continuation in
            verifier.verify(url: url, preferRelay: true) { result in
                continuation.resume(returning: result)
            }
        }
        
        await MainActor.run {
            showResults(result)
        }
    } catch {
        await MainActor.run {
            showError(error)
        }
    }
}
```

### 2. Caching Strategy
```swift
let config = C2CConfig(
    cacheMemoryBytes: 10 * 1024 * 1024,  // 10MB memory cache
    cacheDiskBytes: 50 * 1024 * 1024,    // 50MB disk cache
    manifestTTL: 300                      // 5 minutes TTL
)
```

## Testing

### Unit Tests
```swift
import XCTest
@testable import C2ConciergeMobile

class MobileSDKTests: XCTestCase {
    func testVerification() {
        let config = C2CConfig(enableDebugLogging: true)
        let verifier = C2CMobileVerifier(config: config)
        
        let expectation = XCTestExpectation(description: "Verification completes")
        
        let url = URL(string: "https://example.com/test.jpg")!
        verifier.verify(url: url, preferRelay: true) { result in
            XCTAssertNotNil(result)
            expectation.fulfill()
        }
        
        wait(for: [expectation], timeout: 10.0)
    }
}
```

### UI Tests
```swift
func testResultsModal() {
    let result = VerifyResult(
        state: .verified,
        issuerDisplayName: "Test Issuer"
    )
    
    let resultsVC = ResultsViewController(result: result)
    XCTAssertNotNil(resultsVC)
}
```

## Troubleshooting

### Common Issues
1. **Share extension crashes**: Monitor memory usage, keep < 90MB
2. **Network errors**: Check ATS configuration and TLS pinning
3. **Photos access**: Add usage description to Info.plist
4. **Performance**: Use background queues, implement caching

### Debug Logging
```swift
let config = C2CConfig(
    enableDebugLogging: true
)
```

### Error Handling
```swift
verifier.verify(url: url, preferRelay: true) { result in
    switch result.state {
    case .verified:
        // Handle success
    case .unverified:
        // Handle failure
    case .unresolvedRemote:
        // Handle network issues
    case .verifiedWithWarnings:
        // Handle warnings
    }
}
```
