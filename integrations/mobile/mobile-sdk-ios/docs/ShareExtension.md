# iOS Share Extension Template

## Overview
This share extension allows users to verify content credentials from any app that supports sharing images, videos, or URLs.

## Integration Steps

### 1. Add Share Extension Target
1. In Xcode, go to File → New → Target
2. Choose "Share Extension"
3. Name it "CredLinkShare"
4. Ensure it's embedded in your main app

### 2. Configure Info.plist
```xml
<key>NSExtension</key>
<dict>
    <key>NSExtensionAttributes</key>
    <dict>
        <key>NSExtensionActivationRule</key>
        <string>SUBQUERY (
            extensionItems,
            $extensionItem,
            SUBQUERY (
                $extensionItem.attachments,
                $attachment,
                ANY $attachment.registeredTypeIdentifiers UTI-CONFORMS-TO "public.image" ||
                ANY $attachment.registeredTypeIdentifiers UTI-CONFORMS-TO "public.video" ||
                ANY $attachment.registeredTypeIdentifiers UTI-CONFORMS-TO "public.url"
            ).@count == 1
        )</string>
    </dict>
    <key>NSExtensionMainStoryboard</key>
    <string>MainInterface</string>
    <key>NSExtensionPointIdentifier</key>
    <string>com.apple.share-services</string>
</dict>
```

### 3. Memory Management
- Keep memory usage below 90MB steady-state
- Stream large files to disk instead of loading into memory
- Use NSData instead of UIImage for processing
- Implement proper cleanup in deinit

### 4. Sample Implementation
```swift
import UIKit
import Social
import Photos
import CredLinkMobile

class ShareViewController: SLComposeServiceViewController {
    
    private let config = C2CConfig(
        relayBaseURL: URL(string: "https://verify.credlink.org")!,
        enableDebugLogging: false
    )
    
    private lazy var shareHandler = ShareExtensionHandler(config: config)
    
    override func isContentValid() -> Bool {
        // Do basic validation
        return true
    }
    
    override func didSelectPost() {
        // Handle the shared content
        if let items = self.extensionContext?.inputItems as? [NSExtensionItem] {
            shareHandler.handleSharedItems(items) { resultsVC in
                if let resultsVC = resultsVC {
                    self.present(resultsVC, animated: true) {
                        // Dismiss the share extension after showing results
                        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
                            self.extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
                        }
                    }
                } else {
                    self.extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
                }
            }
        }
    }
    
    override func configurationItems() -> [Any]! {
        // Add any configuration items if needed
        return []
    }
}
```

### 5. Build Settings
- Set "iOS Deployment Target" to 15.0+
- Enable "Memory Management" warnings
- Set "Compiler Optimization Level" to "Fast, Whole Module Optimization"

### 6. Entitlements
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.application-groups</key>
    <array>
        <string>group.com.credlink.mobile</string>
    </array>
</dict>
</plist>
```

## Performance Guidelines
- Initialize SDK once and reuse
- Use background queues for heavy processing
- Implement proper error handling
- Test with large files (>50MB)
- Monitor memory usage with Instruments

## Testing
1. Test with various image formats (JPEG, PNG, HEIC)
2. Test with video files
3. Test with URL sharing from Safari
4. Test memory usage under load
5. Test network connectivity scenarios
