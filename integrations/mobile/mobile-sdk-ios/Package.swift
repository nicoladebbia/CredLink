// swift-tools-version: 5.9
// C2 Concierge Mobile SDK - Production-Grade Security Package

import PackageDescription

let package = Package(
    name: "CredLinkMobile",
    platforms: [
        .iOS(.v15),
        .macOS(.v12)
    ],
    products: [
        .library(
            name: "CredLinkMobile",
            type: .dynamic,
            targets: ["CredLinkMobile"]),
    ],
    dependencies: [
        .package(url: "https://github.com/apple/swift-crypto.git", exact: "3.2.0"),
    ],
    targets: [
        .binaryTarget(
            name: "CredLinkCore",
            url: "https://github.com/Nickiller04/credlink/releases/download/v0.1.0/CredLinkCore.xcframework.zip",
            checksum: "sha256-9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"
        ),
        .target(
            name: "CredLinkMobile",
            dependencies: [
                "CredLinkCore",
                .product(name: "Crypto", package: "swift-crypto")
            ],
            path: "Sources/CredLinkMobile",
            linkerSettings: [
                .linkedFramework("Security"),
                .linkedFramework("Photos"),
                .linkedFramework("UIKit", .when(platforms: [.iOS]))
            ]
        ),
        .testTarget(
            name: "CredLinkMobileTests",
            dependencies: [
                "CredLinkMobile",
                .product(name: "Crypto", package: "swift-crypto")
            ],
            path: "Tests/CredLinkMobileTests"
        ),
    ]
)
