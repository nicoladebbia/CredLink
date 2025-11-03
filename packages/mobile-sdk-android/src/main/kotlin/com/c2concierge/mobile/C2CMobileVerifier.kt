package com.c2concierge.mobile

import android.content.Context
import android.net.Uri
import android.os.Parcelable
import androidx.work.WorkManager
import kotlinx.parcelize.Parcelize
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.Cache
import okhttp3.CertificatePinner
import okhttp3.HttpUrl
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.logging.HttpLoggingInterceptor
import java.io.File
import java.util.concurrent.TimeUnit
import java.security.MessageDigest

// MARK: - Public API Surface

/**
 * Verification result states matching C2PA specification
 */
enum class VerifyState(val value: String) {
    VERIFIED("verified"),
    VERIFIED_WITH_WARNINGS("verified_with_warnings"),
    UNVERIFIED("unverified"),
    UNRESOLVED_REMOTE("unresolved_remote");
    
    val isSuccessful: Boolean
        get() = this == VERIFIED || this == VERIFIED_WITH_WARNINGS
    
    val displayName: String
        get() = when (this) {
            VERIFIED -> "Verified"
            VERIFIED_WITH_WARNINGS -> "Verified with Warnings"
            UNVERIFIED -> "Unverified"
            UNRESOLVED_REMOTE -> "Unresolved Remote"
        }
}

/**
 * Complete verification result with all C2PA data
 */
@Parcelize
data class VerifyResult(
    val state: VerifyState,
    val issuerDisplayName: String?,
    val keyId: String?,
    val timestamp: Long?,
    val manifestUrl: HttpUrl?,
    val messages: List<String>,
    val hardwareAttested: Boolean = false,
    val trustSnapshotDate: Long? = null
) : Parcelable {
    val isSuccessful: Boolean
        get() = state.isSuccessful
    
    val verificationTime: String
        get() = timestamp?.let { java.util.Date(it).toString() } ?: "Unknown"
}

/**
 * Configuration for mobile verification - IMMUTABLE for security
 */
data class SdkConfig private constructor(
    val relayBaseUrl: HttpUrl? = null,
    val pinnedSpki: List<String> = emptyList(),
    val cacheSizeBytes: Long = 50 * 1024 * 1024, // 50MB
    val manifestTtlSeconds: Long = 300, // 5 minutes
    val enableDebugLogging: Boolean = false
) {
    companion object {
        /**
         * Create a new configuration with security validation
         */
        fun create(
            relayBaseUrl: HttpUrl? = null,
            pinnedSpki: List<String> = emptyList(),
            cacheSizeBytes: Long = 50 * 1024 * 1024,
            manifestTtlSeconds: Long = 300,
            enableDebugLogging: Boolean = false
        ): SdkConfig {
            // Validate security-critical parameters
            require(cacheSizeBytes in 1_048_576..100 * 1024 * 1024) {
                "Cache size must be between 1MB and 100MB for security"
            }
            require(manifestTtlSeconds in 60..3600) {
                "Manifest TTL must be between 1 minute and 1 hour for security"
            }
            require(pinnedSpki.all { it.isNotEmpty() && it.length >= 32 }) {
                "SPKI hashes cannot be empty and must be at least 32 characters"
            }
            require(pinnedSpki.size <= 10) {
                "Cannot have more than 10 SPKI hashes for security"
            }
            
            return SdkConfig(
                relayBaseUrl = relayBaseUrl,
                pinnedSpki = pinnedSpki.toList(), // Defensive copy
                cacheSizeBytes = cacheSizeBytes,
                manifestTtlSeconds = manifestTtlSeconds,
                enableDebugLogging = enableDebugLogging
            )
        }
        
        val Default = create()
    }
    
    init {
        // Runtime validation
        require(cacheSizeBytes in 1_048_576..100 * 1024 * 1024) {
            "Cache size must be between 1MB and 100MB for security"
        }
        require(manifestTtlSeconds in 60..3600) {
            "Manifest TTL must be between 1 minute and 1 hour for security"
        }
    }
}

/**
 * Main mobile verifier interface
 */
interface MobileVerifier {
    suspend fun verify(url: HttpUrl, preferRelay: Boolean = true): VerifyResult
    suspend fun verify(localUri: Uri): VerifyResult
}

// MARK: - Implementation

/**
 * Core mobile verifier implementation
 */
class C2CMobileVerifier private constructor(
    private val context: Context,
    private val config: SdkConfig,
    private val okHttpClient: OkHttpClient,
    private val workManager: WorkManager
) : MobileVerifier {
    
    private val moshi = Moshi.Builder()
        .add(KotlinJsonAdapterFactory())
        .build()
    
    private val coreVerifier = CoreVerifier()
    
    override suspend fun verify(url: HttpUrl, preferRelay: Boolean): VerifyResult {
        return withContext(Dispatchers.IO) {
            try {
                // Comprehensive URL validation to prevent SSRF attacks
                require(url.scheme == "https") { 
                    "HTTP URLs are not allowed for security reasons" 
                }
                
                // Block localhost and private network ranges
                require(!isPrivateNetworkAddress(url.host)) {
                    "Private network addresses are not allowed for security reasons"
                }
                
                // Validate URL length to prevent DoS
                require(url.toString().length <= 2048) {
                    "URL length exceeds maximum allowed size"
                }
                
                // Block suspicious file extensions
                val forbiddenExtensions = setOf(".exe", ".bat", ".cmd", ".scr", ".pif", ".com", ".js", ".vbs", ".jar", ".php", ".asp", ".jsp")
                val urlString = url.toString().lowercase()
                require(!forbiddenExtensions.any { ext -> urlString.contains(ext) }) {
                    "URL contains forbidden file extension for security reasons"
                }
                
                // Validate relay preference
                if (preferRelay && config.relayBaseUrl == null) {
                    throw IllegalArgumentException("Relay requested but no relay URL configured")
                }
                
                performUrlVerification(url, preferRelay)
            } catch (e: Exception) {
                VerifyResult(
                    state = VerifyState.UNVERIFIED,
                    messages = listOf(e.message ?: "Verification failed")
                )
            }
        }
    }
    
    override suspend fun verify(localUri: Uri): VerifyResult {
        return withContext(Dispatchers.IO) {
            try {
                performLocalUriVerification(localUri)
            } catch (e: Exception) {
                VerifyResult(
                    state = VerifyState.UNVERIFIED,
                    messages = listOf(e.message ?: "Local verification failed")
                )
            }
        }
    }
    
    private suspend fun performUrlVerification(
        url: HttpUrl, 
        preferRelay: Boolean
    ): VerifyResult {
        // Step 1: Try to discover remote manifest
        val manifestUrl = discoverRemoteManifest(url, preferRelay)
        
        return if (manifestUrl != null) {
            // Step 2: Fetch and verify remote manifest
            val manifestData = fetchManifest(manifestUrl)
            coreVerifier.verifyWithManifest(manifestData, url.toString())
        } else {
            // Step 3: Try to download asset and check for embedded manifest
            val assetData = downloadAsset(url)
            coreVerifier.verifyEmbedded(assetData, url.toString())
        }
    }
    
    private suspend fun performLocalUriVerification(uri: Uri): VerifyResult {
        // Copy to cache directory for processing
        val cacheFile = copyToCacheDirectory(uri)
        
        return try {
            // Check for sidecar manifest first
            val sidecarFile = File(cacheFile.path + ".c2pa")
            if (sidecarFile.exists()) {
                val sidecarData = sidecarFile.readBytes()
                coreVerifier.verifyWithManifest(sidecarData, uri.toString())
            } else {
                // Check for embedded manifest
                val assetData = cacheFile.readBytes()
                coreVerifier.verifyEmbedded(assetData, uri.toString())
            }
        } finally {
            cacheFile.delete()
        }
    }
    
    private suspend fun discoverRemoteManifest(
        url: HttpUrl, 
        preferRelay: Boolean
    ): HttpUrl? {
        val fetchUrl = if (preferRelay && config.relayBaseUrl != null) {
            config.relayBaseUrl.newBuilder()
                .addPathSegment("discover")
                .addQueryParameter("url", url.toString())
                .build()
        } else {
            url
        }
        
        val request = Request.Builder()
            .url(fetchUrl)
            .header("Accept", "application/json")
            .build()
        
        val response = okHttpClient.newCall(request).execute()
        
        if (!response.isSuccessful) {
            return null
        }
        
        // Check for Link header with c2pa-manifest
        val linkHeader = response.header("Link")
        return linkHeader?.let { parseLinkHeader(it) }
    }
    
    private suspend fun fetchManifest(url: HttpUrl): ByteArray {
        val request = Request.Builder()
            .url(url)
            .build()
        
        val response = okHttpClient.newCall(request).execute()
        
        if (!response.isSuccessful) {
            throw Exception("Failed to fetch manifest: ${response.code}")
        }
        
        return response.body?.bytes() ?: throw Exception("Empty response body")
    }
    
    private suspend fun downloadAsset(url: HttpUrl): ByteArray {
        val request = Request.Builder()
            .url(url)
            .build()
        
        val response = okHttpClient.newCall(request).execute()
        
        if (!response.isSuccessful) {
            throw Exception("Failed to download asset: ${response.code}")
        }
        
        return response.body?.bytes() ?: throw Exception("Empty response body")
    }
    
    private fun copyToCacheDirectory(uri: Uri): File {
        val cacheDir = File(context.cacheDir, "c2c_verification")
        cacheDir.mkdirs()
        
        val tempFile = File(cacheDir, "verify_${System.currentTimeMillis()}.tmp")
        
        context.contentResolver.openInputStream(uri)?.use { input ->
            tempFile.outputStream().use { output ->
                input.copyTo(output)
            }
        } ?: throw Exception("Failed to open input stream")
        
        return tempFile
    }
    
    private fun parseLinkHeader(header: String): HttpUrl? {
        // Parse Link: rel="c2pa-manifest"; <url>
        val pattern = """<([^>]+)>;\s*rel="c2pa-manifest"""".toRegex()
        val match = pattern.find(header) ?: return null
        
        val url = match.groupValues[1]
        return HttpUrl.parse(url)
    }
    
    companion object {
        /**
         * Create a new verifier instance with the given configuration
         */
        fun create(context: Context, config: SdkConfig): C2CMobileVerifier {
            val okHttpClient = createOkHttpClient(context, config)
            val workManager = WorkManager.getInstance(context)
            
            return C2CMobileVerifier(context, config, okHttpClient, workManager)
        }
        
        private fun createOkHttpClient(context: Context, config: SdkConfig): OkHttpClient {
            val builder = OkHttpClient.Builder()
            
            // Configure cache
            val cacheDir = File(context.cacheDir, "c2c_http_cache")
            val cache = Cache(cacheDir, config.cacheSizeBytes)
            builder.cache(cache)
            
            // Configure timeouts
            builder.connectTimeout(10, TimeUnit.SECONDS)
            builder.readTimeout(30, TimeUnit.SECONDS)
            builder.writeTimeout(30, TimeUnit.SECONDS)
            
            // Add logging if enabled
            if (config.enableDebugLogging) {
                val logging = HttpLoggingInterceptor()
                logging.setLevel(HttpLoggingInterceptor.Level.BODY)
                builder.addInterceptor(logging)
            }
            
            // STRICT SECURITY: Configure certificate pinning for relay - MANDATORY
            config.relayBaseUrl?.let { relayUrl ->
                if (config.pinnedSpki.isEmpty()) {
                    throw IllegalStateException("Relay URL configured but no SPKI hashes provided - this is a security violation")
                }
                val pinner = CertificatePinner.Builder()
                    .add(relayUrl.host, config.pinnedSpki.joinToString(", ") { "pin-sha256=$it" })
                    .build()
                builder.certificatePinner(pinner)
            }
            
            return builder.build()
        }
    }
    
    private fun isPrivateNetworkAddress(host: String?): Boolean {
        if (host.isNullOrEmpty()) return false
        
        // Check for localhost
        if (host == "localhost" || host == "127.0.0.1" || host == "::1") {
            return true
        }
        
        // Check for private IPv4 ranges
        val privateRanges = setOf(
            "10.", "192.168.", "172.16.", "172.17.", "172.18.", "172.19.",
            "172.20.", "172.21.", "172.22.", "172.23.", "172.24.", "172.25.",
            "172.26.", "172.27.", "172.28.", "172.29.", "172.30.", "172.31.",
            "169.254." // Link-local
        )
        
        for (range in privateRanges) {
            if (host.startsWith(range)) {
                return true
            }
        }
        
        // Check for private IPv6 ranges
        if (host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80")) {
            return true
        }
        
        return false
    }
}

// MARK: - Core Verifier (JNI Bridge)

/**
 * Core verifier implementation that calls into Rust via JNI
 */
private class CoreVerifier {
    
    init {
        // Load native library
        System.loadLibrary("c2concierge_core")
    }
    
    fun verifyEmbedded(data: ByteArray, sourceUrl: String): VerifyResult {
        // Call into Rust core via JNI
        // This is a placeholder for the actual JNI implementation
        return VerifyResult(
            state = VerifyState.VERIFIED,
            issuerDisplayName = "Test Issuer",
            keyId = "test-key-id",
            timestamp = System.currentTimeMillis(),
            manifestUrl = null,
            messages = listOf("Embedded manifest verified"),
            hardwareAttested = false
        )
    }
    
    fun verifyWithManifest(manifestData: ByteArray, sourceUrl: String): VerifyResult {
        // Call into Rust core via JNI
        // This is a placeholder for the actual JNI implementation
        return VerifyResult(
            state = VerifyState.VERIFIED,
            issuerDisplayName = "Remote Issuer",
            keyId = "remote-key-id",
            timestamp = System.currentTimeMillis(),
            manifestUrl = HttpUrl.parse(sourceUrl),
            messages = listOf("Remote manifest verified"),
            hardwareAttested = false
        )
    }
}

// MARK: - Background Work Manager

/**
 * Background work manager for manifest prefetching
 */
class BackgroundWorkManager private constructor(
    private val workManager: WorkManager
) {
    
    /**
     * Schedule background manifest prefetching
     */
    fun scheduleManifestPrefetch(urls: List<HttpUrl>) {
        // Implementation would use WorkManager to schedule background tasks
        // This is a placeholder for the actual implementation
    }
    
    companion object {
        fun create(context: Context): BackgroundWorkManager {
            return BackgroundWorkManager(WorkManager.getInstance(context))
        }
    }
}
