// swift-tools-version: 5.9
// C2 Concierge Mobile SDK - Production-Grade Security Package

import PackageDescription

let package = Package(
    name: "C2ConciergeMobile",
    platforms: [
        .iOS(.v15),
        .macOS(.v12)
    ],
    products: [
        .library(
            name: "C2ConciergeMobile",
            type: .dynamic,
            targets: ["C2ConciergeMobile"]),
    ],
    dependencies: [
        .package(url: "https://github.com/apple/swift-crypto.git", exact: "3.2.0"),
    ],
    targets: [
        .binaryTarget(
            name: "C2ConciergeCore",
            url: "https://github.com/Nickiller04/c2-concierge/releases/download/v0.1.0/C2ConciergeCore.xcframework.zip",
            checksum: "sha256-9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"
        ),
        .target(
            name: "C2ConciergeMobile",
            dependencies: [
                "C2ConciergeCore",
                .product(name: "Crypto", package: "swift-crypto")
            ],
            path: "Sources/C2ConciergeMobile",
            linkerSettings: [
                .linkedFramework("Security"),
                .linkedFramework("Photos"),
                .linkedFramework("UIKit", .when(platforms: [.iOS]))
            ]
        ),
        .testTarget(
            name: "C2ConciergeMobileTests",
            dependencies: [
                "C2ConciergeMobile",
                .product(name: "Crypto", package: "swift-crypto")
            ],
            path: "Tests/C2ConciergeMobileTests"
        ),
    ]
)
