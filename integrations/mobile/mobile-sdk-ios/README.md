# CredLink Mobile SDKs - Phase 25

## Package Structure
```
packages/
├── mobile-sdk-ios/          # Swift Package with XCFramework
│   ├── Sources/CredLinkMobile/
│   ├── CredLinkMobile.xcframework/
│   ├── Package.swift
│   └── Tests/
└── mobile-sdk-android/      # Android AAR
    ├── src/main/kotlin/
    ├── src/main/jniLibs/
    ├── build.gradle.kts
    └── src/test/
```

## Core Architecture
- **Rust Core**: c2pa-rs FFI binding for verification
- **Swift Facade**: Minimal iOS API with native types
- **Kotlin Facade**: Minimal Android API with coroutines
- **Discovery Order**: Embedded → Sidecar → Remote (via relay)
- **Security**: ATS/NSC enforcement, TLS pinning for relay
- **Performance**: < 2.5MB iOS, < 2.0MB Android, < 400ms cached verify
