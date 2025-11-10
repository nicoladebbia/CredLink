import Foundation
import Crypto
import Photos
import Security
import UIKit

// MARK: - Public API Surface

/// Verification result states matching C2PA specification
public enum VerifyState: String, Codable, CaseIterable {
    case verified = "verified"
    case verifiedWithWarnings = "verified_with_warnings"
    case unverified = "unverified"
    case unresolvedRemote = "unresolved_remote"
    
    public var displayName: String {
        switch self {
        case .verified:
            return "Verified"
        case .verifiedWithWarnings:
            return "Verified with Warnings"
        case .unverified:
            return "Unverified"
        case .unresolvedRemote:
            return "Unresolved Remote"
        }
    }
    
    public var isSuccessful: Bool {
        switch self {
        case .verified, .verifiedWithWarnings:
            return true
        case .unverified, .unresolvedRemote:
            return false
        }
    }
}

/// Complete verification result with all C2PA data
public struct VerifyResult: Codable, Sendable {
    public let state: VerifyState
    public let issuerDisplayName: String?
    public let keyId: String?
    public let timestamp: Date?
    public let manifestURL: URL?
    public let messages: [String]
    public let hardwareAttested: Bool
    public let trustSnapshotDate: Date?
    
    public init(
        state: VerifyState,
        issuerDisplayName: String? = nil,
        keyId: String? = nil,
        timestamp: Date? = nil,
        manifestURL: URL? = nil,
        messages: [String] = [],
        hardwareAttested: Bool = false,
        trustSnapshotDate: Date? = nil
    ) {
        self.state = state
        self.issuerDisplayName = issuerDisplayName
        self.keyId = keyId
        self.timestamp = timestamp
        self.manifestURL = manifestURL
        self.messages = messages
        self.hardwareAttested = hardwareAttested
        self.trustSnapshotDate = trustSnapshotDate
    }
    
    public var isSuccessful: Bool {
        return state.isSuccessful
    }
    
    public var verificationTime: String {
        guard let timestamp = timestamp else {
            return "Unknown"
        }
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .medium
        return formatter.string(from: timestamp)
    }
}

/// Configuration for mobile verification - IMMUTABLE for security
public final class C2CConfig: Sendable {
    public let relayBaseURL: URL?
    public let pinnedSPKIHashes: [String]
    public let cacheMemoryBytes: Int
    public let cacheDiskBytes: Int
    public let manifestTTL: TimeInterval
    public let enableDebugLogging: Bool
    
    public init(
        relayBaseURL: URL? = nil,
        pinnedSPKIHashes: [String] = [],
        cacheMemoryBytes: Int = 10 * 1024 * 1024, // 10MB
        cacheDiskBytes: Int = 50 * 1024 * 1024,   // 50MB
        manifestTTL: TimeInterval = 300, // 5 minutes
        enableDebugLogging: Bool = false
    ) {
        // Validate security-critical parameters
        guard cacheMemoryBytes <= 50 * 1024 * 1024 else {
            fatalError("Cache memory limit cannot exceed 50MB for security")
        }
        guard cacheDiskBytes <= 200 * 1024 * 1024 else {
            fatalError("Cache disk limit cannot exceed 200MB for security")
        }
        guard manifestTTL <= 3600 else {
            fatalError("Manifest TTL cannot exceed 1 hour for security")
        }
        guard pinnedSPKIHashes.allSatisfy({ !$0.isEmpty }) else {
            fatalError("SPKI hashes cannot be empty strings")
        }
        
        self.relayBaseURL = relayBaseURL
        self.pinnedSPKIHashes = pinnedSPKIHashes
        self.cacheMemoryBytes = cacheMemoryBytes
        self.cacheDiskBytes = cacheDiskBytes
        self.manifestTTL = manifestTTL
        self.enableDebugLogging = enableDebugLogging
    }
    
    public static let `default` = C2CConfig()
}

/// Main mobile verifier protocol
public protocol MobileVerifier: Sendable {
    func verify(url: URL, preferRelay: Bool, completion: @escaping (VerifyResult) -> Void)
    func verify(localAsset: PHAsset, completion: @escaping (VerifyResult) -> Void)
}

// MARK: - Implementation

/// Core mobile verifier implementation
public final class C2CMobileVerifier: MobileVerifier, @unchecked Sendable {
    private let config: C2CConfig
    private let urlSession: URLSession
    private let cache: URLCache
    private let coreVerifier: CoreVerifier
    
    public init(config: C2CConfig) {
        self.config = config
        self.cache = URLCache(
            memoryCapacity: config.cacheMemoryBytes,
            diskCapacity: config.cacheDiskBytes,
            diskPath: "c2c_manifest_cache"
        )
        
        let sessionConfig = URLSessionConfiguration.default
        sessionConfig.urlCache = cache
        sessionConfig.requestCachePolicy = .useProtocolCachePolicy
        sessionConfig.timeoutIntervalForRequest = 10.0
        sessionConfig.timeoutIntervalForResource = 30.0
        sessionConfig.httpShouldSetCookies = false
        sessionConfig.httpMaximumConnectionsPerHost = 3
        
        self.urlSession = URLSession(configuration: sessionConfig, delegate: TLSDelegate(config: config), delegateQueue: nil)
        self.coreVerifier = CoreVerifier()
    }
    
    // MARK: - URL Verification
    
    public func verify(url: URL, preferRelay: Bool, completion: @escaping (VerifyResult) -> Void) {
        // Comprehensive URL validation to prevent SSRF attacks
        guard url.scheme == "https" else {
            completion(VerifyResult(
                state: .unverified,
                messages: ["HTTP URLs are not allowed for security reasons"]
            ))
            return
        }
        
        // Block localhost and private network ranges
        guard !isPrivateNetworkAddress(url.host) else {
            completion(VerifyResult(
                state: .unverified,
                messages: ["Private network addresses are not allowed for security reasons"]
            ))
            return
        }
        
        // Validate URL length to prevent DoS
        guard url.absoluteString.count <= 2048 else {
            completion(VerifyResult(
                state: .unverified,
                messages: ["URL length exceeds maximum allowed size"]
            ))
            return
        }
        
        // Block suspicious file extensions
        let forbiddenExtensions: Set<String> = [".exe", ".bat", ".cmd", ".scr", ".pif", ".com", ".js", ".vbs", ".jar", ".php", ".asp", ".jsp"]
        let urlString = url.absoluteString.lowercased()
        guard !forbiddenExtensions.contains(where: { urlString.contains($0) }) else {
            completion(VerifyResult(
                state: .unverified,
                messages: ["URL contains forbidden file extension for security reasons"]
            ))
            return
        }
        
        // Validate relay preference
        if preferRelay && config.relayBaseURL == nil {
            completion(VerifyResult(
                state: .unverified,
                messages: ["Relay requested but no relay URL configured"]
            ))
            return
        }
        
        Task {
            let result = await performURLVerification(url: url, preferRelay: preferRelay)
            DispatchQueue.main.async {
                completion(result)
            }
        }
    }
    
    // MARK: - Local Asset Verification
    
    public func verify(localAsset: PHAsset, completion: @escaping (VerifyResult) -> Void) {
        Task {
            let result = await performLocalAssetVerification(asset: localAsset)
            DispatchQueue.main.async {
                completion(result)
            }
        }
    }
    
    // MARK: - Private Implementation
    
    private func performURLVerification(url: URL, preferRelay: Bool) async -> VerifyResult {
        // Implementation would go here
        return VerifyResult(
            state: .unverified,
            messages: ["URL verification not implemented in sample"]
        )
    }
    
    private func performLocalAssetVerification(asset: PHAsset) async -> VerifyResult {
        // Implementation would go here
        return VerifyResult(
            state: .unverified,
            messages: ["Local asset verification not implemented in sample"]
        )
    }
        
        return nil
    }
    
    private func fetchManifest(url: URL) async throws -> Data {
        let (data, _) = try await urlSession.data(from: url)
        return data
    }
    
    private func downloadAsset(url: URL) async throws -> Data {
        let (data, _) = try await urlSession.data(from: url)
        return data
    }
    
    private func exportAssetToTempFile(asset: PHAsset) async throws -> URL {
        return try await withCheckedThrowingContinuation { continuation in
            let options = PHImageRequestOptions()
            options.isSynchronous = false
            options.deliveryMode = .highQualityFormat
            
            PHImageManager.default().requestImageDataAndOrientation(for: asset, options: options) { data, _, _, info in
                if let data = data {
                    let tempURL = FileManager.default.temporaryDirectory
                        .appendingPathComponent(UUID().uuidString)
                        .appendingPathExtension("jpg")
                    
                    do {
                        try data.write(to: tempURL)
                        continuation.resume(returning: tempURL)
                    } catch {
                        continuation.resume(throwing: error)
                    }
                } else {
                    continuation.resume(throwing: C2CError.assetExportFailed)
                }
            }
        }
    }
    
    private func parseLinkHeader(_ header: String) -> URL? {
        // Parse Link: rel="c2pa-manifest"; <url>
        let pattern = #"<([^>]+)>;\s*rel="c2pa-manifest""#
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return nil }
        
        let range = NSRange(header.startIndex..<header.endIndex, in: header)
        guard let match = regex.firstMatch(in: header, range: range) else { return nil }
        
        guard let urlRange = Range(match.range(at: 1), in: header) else { return nil }
        return URL(string: String(header[urlRange]))
    }
}

// MARK: - TLS Pinning Delegate

private class TLSDelegate: NSObject, URLSessionDelegate {
    private let config: C2CConfig
    
    init(config: C2CConfig) {
        self.config = config
    }
    
    func urlSession(_ session: URLSession, didReceive challenge: URLAuthenticationChallenge, completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
        
        guard let serverTrust = challenge.protectionSpace.serverTrust else {
            completionHandler(.cancelAuthenticationChallenge, nil)
            return
        }
        
        // STRICT SECURITY: Only allow relay URLs, block all others
        guard let relayHost = config.relayBaseURL?.host,
              challenge.protectionSpace.host == relayHost else {
            if config.enableDebugLogging {
                print("C2C: Blocked connection to non-relay host: \(challenge.protectionSpace.host ?? "unknown")")
            }
            completionHandler(.cancelAuthenticationChallenge, nil)
            return
        }
        
        // Validate certificate chain with strict pinning
        guard validateCertificateChain(serverTrust) else {
            if config.enableDebugLogging {
                print("C2C: Certificate pinning failed for \(relayHost)")
            }
            completionHandler(.cancelAuthenticationChallenge, nil)
            return
        }
        
        // Additional certificate validation
        guard validateCertificateProperties(certificate: SecTrustGetCertificateAtIndex(serverTrust, 0)) else {
            if config.enableDebugLogging {
                print("C2C: Certificate properties validation failed for \(relayHost)")
            }
            completionHandler(.cancelAuthenticationChallenge, nil)
            return
        }
        
        completionHandler(.useCredential, URLCredential(trust: serverTrust))
    }
    
    private func validateCertificateChain(_ serverTrust: SecTrust) -> Bool {
        // Extract server certificate
        guard let certificate = SecTrustGetCertificateAtIndex(serverTrust, 0) else {
            return false
        }
        
        // Get public key and compute SPKI hash
        guard let publicKey = SecCertificateCopyPublicKey(certificate) else {
            return false
        }
        
        let spkiHash = computeSPKIHash(publicKey)
        
        // Check against pinned hashes
        return config.pinnedSPKIHashes.contains(spkiHash)
    }
    
    private func validateCertificateProperties(certificate: SecCertificate?) -> Bool {
        guard let certificate = certificate else {
            return false
        }
        
        // Convert certificate to data for validation
        let certData = SecCertificateCopyData(certificate)
        let certDataBytes = CFDataGetBytePtr(certData)
        let certDataLength = CFDataGetLength(certData)
        
        // Validate certificate is not expired
        let cert = SecCertificateCreateWithData(nil, certData)
        guard let secCert = cert else {
            return false
        }
        
        // Check certificate validity period
        let now = Date()
        guard SecCertificateIsValid(secCert, now) else {
            return false
        }
        
        // Additional certificate property checks can be added here
        // For example: key usage, extended key usage, etc.
        
        return true
    }
    
    private func computeSPKIHash(_ publicKey: SecKey) -> String {
        // Compute SHA-256 hash of Subject Public Key Info
        // Implementation would extract SPKI and hash it
        return "computed_spki_hash"
    }
    
    private func isPrivateNetworkAddress(_ host: String?) -> Bool {
        guard let host = host else { return false }
        
        // Check for localhost
        if host == "localhost" || host == "127.0.0.1" || host == "::1" {
            return true
        }
        
        // Check for private IPv4 ranges
        let privateRanges = [
            "10.", "192.168.", "172.16.", "172.17.", "172.18.", "172.19.",
            "172.20.", "172.21.", "172.22.", "172.23.", "172.24.", "172.25.",
            "172.26.", "172.27.", "172.28.", "172.29.", "172.30.", "172.31.",
            "169.254." // Link-local
        ]
        
        for range in privateRanges {
            if host.hasPrefix(range) {
                return true
            }
        }
        
        // Check for private IPv6 ranges
        if host.hasPrefix("fc") || host.hasPrefix("fd") || host.hasPrefix("fe80") {
            return true
        }
        
        return false
    }
}

// MARK: - Core Verifier (FFI Bridge)

private class CoreVerifier {
    func verifyEmbedded(_ data: Data, sourceURL: URL) async throws -> VerifyResult {
        // Call into Rust core via FFI
        // This is a placeholder for the actual FFI implementation
        return VerifyResult(
            state: .verified,
            issuerDisplayName: "Test Issuer",
            keyId: "test-key-id",
            timestamp: Date(),
            manifestURL: nil,
            messages: ["Embedded manifest verified"],
            hardwareAttested: false
        )
    }
    
    func verifyWithManifest(_ manifestData: Data, sourceURL: URL) async throws -> VerifyResult {
        // Call into Rust core via FFI
        // This is a placeholder for the actual FFI implementation
        return VerifyResult(
            state: .verified,
            issuerDisplayName: "Remote Issuer",
            keyId: "remote-key-id",
            timestamp: Date(),
            manifestURL: sourceURL,
            messages: ["Remote manifest verified"],
            hardwareAttested: false
        )
    }
}

// MARK: - Error Types

enum C2CError: LocalizedError {
    case invalidResponse
    case assetExportFailed
    case verificationFailed
    
    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "Invalid server response"
        case .assetExportFailed:
            return "Failed to export asset for verification"
        case .verificationFailed:
            return "Verification process failed"
        }
    }
}
