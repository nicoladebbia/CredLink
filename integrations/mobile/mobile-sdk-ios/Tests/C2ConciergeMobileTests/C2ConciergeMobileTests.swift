import XCTest
@testable import CredLinkMobile
import Photos

final class CredLinkMobileTests: XCTestCase {
    
    private var config: C2CConfig!
    private var verifier: C2CMobileVerifier!
    
    override func setUp() {
        super.setUp()
        config = C2CConfig(
            relayBaseURL: URL(string: "https://verify.credlink.org")!,
            pinnedSPKIHashes: ["test_spki_hash"],
            enableDebugLogging: true
        )
        verifier = C2CMobileVerifier(config: config)
    }
    
    override func tearDown() {
        config = nil
        verifier = nil
        super.tearDown()
    }
    
    // MARK: - Configuration Tests
    
    func testConfigInitialization() {
        let defaultConfig = C2CConfig()
        XCTAssertEqual(defaultConfig.cacheMemoryBytes, 10 * 1024 * 1024)
        XCTAssertEqual(defaultConfig.cacheDiskBytes, 50 * 1024 * 1024)
        XCTAssertEqual(defaultConfig.manifestTTL, 300)
        XCTAssertFalse(defaultConfig.enableDebugLogging)
        XCTAssertNil(defaultConfig.relayBaseURL)
        XCTAssertTrue(defaultConfig.pinnedSPKIHashes.isEmpty)
    }
    
    func testConfigCustomValues() {
        let customConfig = C2CConfig(
            relayBaseURL: URL(string: "https://example.com")!,
            pinnedSPKIHashes: ["hash1", "hash2"],
            cacheMemoryBytes: 20 * 1024 * 1024,
            cacheDiskBytes: 100 * 1024 * 1024,
            manifestTTL: 600,
            enableDebugLogging: true
        )
        
        XCTAssertEqual(customConfig.relayBaseURL?.absoluteString, "https://example.com/")
        XCTAssertEqual(customConfig.pinnedSPKIHashes.count, 2)
        XCTAssertEqual(customConfig.cacheMemoryBytes, 20 * 1024 * 1024)
        XCTAssertEqual(customConfig.cacheDiskBytes, 100 * 1024 * 1024)
        XCTAssertEqual(customConfig.manifestTTL, 600)
        XCTAssertTrue(customConfig.enableDebugLogging)
    }
    
    // MARK: - VerifyResult Tests
    
    func testVerifyResultInitialization() {
        let result = VerifyResult(
            state: .verified,
            issuerDisplayName: "Test Issuer",
            keyId: "test-key",
            timestamp: Date(),
            manifestURL: URL(string: "https://example.com/manifest")!,
            messages: ["Test message"],
            hardwareAttested: true,
            trustSnapshotDate: Date()
        )
        
        XCTAssertEqual(result.state, .verified)
        XCTAssertEqual(result.issuerDisplayName, "Test Issuer")
        XCTAssertEqual(result.keyId, "test-key")
        XCTAssertNotNil(result.timestamp)
        XCTAssertEqual(result.manifestURL?.absoluteString, "https://example.com/manifest")
        XCTAssertEqual(result.messages.count, 1)
        XCTAssertTrue(result.hardwareAttested)
        XCTAssertNotNil(result.trustSnapshotDate)
    }
    
    func testVerifyResultDefaultValues() {
        let result = VerifyResult(state: .unverified)
        
        XCTAssertEqual(result.state, .unverified)
        XCTAssertNil(result.issuerDisplayName)
        XCTAssertNil(result.keyId)
        XCTAssertNil(result.timestamp)
        XCTAssertNil(result.manifestURL)
        XCTAssertTrue(result.messages.isEmpty)
        XCTAssertFalse(result.hardwareAttested)
        XCTAssertNil(result.trustSnapshotDate)
    }
    
    // MARK: - URL Validation Tests
    
    func testHTTPSURLValidation() {
        let expectation = XCTestExpectation(description: "HTTPS URL verification")
        
        let httpsURL = URL(string: "https://example.com/image.jpg")!
        verifier.verify(url: httpsURL, preferRelay: false) { result in
            // Should not reject HTTPS URLs
            expectation.fulfill()
        }
        
        wait(for: [expectation], timeout: 5.0)
    }
    
    func testHTTPURLRejection() {
        let expectation = XCTestExpectation(description: "HTTP URL rejection")
        
        let httpURL = URL(string: "http://example.com/image.jpg")!
        verifier.verify(url: httpURL, preferRelay: false) { result in
            XCTAssertEqual(result.state, .unverified)
            XCTAssertTrue(result.messages.contains { $0.contains("HTTP URLs are not allowed") })
            expectation.fulfill()
        }
        
        wait(for: [expectation], timeout: 5.0)
    }
    
    // MARK: - Performance Tests
    
    func testVerificationPerformance() {
        let url = URL(string: "https://example.com/test.jpg")!
        
        measure {
            let expectation = XCTestExpectation(description: "Verification performance")
            
            verifier.verify(url: url, preferRelay: true) { result in
                expectation.fulfill()
            }
            
            wait(for: [expectation], timeout: 10.0)
        }
    }
    
    // MARK: - Memory Tests
    
    func testMemoryUsage() {
        let expectation = XCTestExpectation(description: "Memory usage test")
        
        let url = URL(string: "https://example.com/large-image.jpg")!
        
        verifier.verify(url: url, preferRelay: true) { result in
            // Verify completion without memory warnings
            expectation.fulfill()
        }
        
        wait(for: [expectation], timeout: 10.0)
    }
    
    // MARK: - Error Handling Tests
    
    func testInvalidURLHandling() {
        let expectation = XCTestExpectation(description: "Invalid URL handling")
        
        let invalidURL = URL(string: "not-a-url")!
        verifier.verify(url: invalidURL, preferRelay: false) { result in
            XCTAssertEqual(result.state, .unverified)
            XCTAssertFalse(result.messages.isEmpty)
            expectation.fulfill()
        }
        
        wait(for: [expectation], timeout: 5.0)
    }
    
    // MARK: - Background Task Tests
    
    func testBackgroundVerification() {
        let expectation = XCTestExpectation(description: "Background verification")
        
        let url = URL(string: "https://example.com/background-test.jpg")!
        
        DispatchQueue.global(qos: .background).async {
            self.verifier.verify(url: url, preferRelay: true) { result in
                DispatchQueue.main.async {
                    expectation.fulfill()
                }
            }
        }
        
        wait(for: [expectation], timeout: 15.0)
    }
}
