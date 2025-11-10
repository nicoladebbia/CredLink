# Android Integration Guide

## Quick Start (< 60 minutes)

### 1. Add Dependency
Add to your app's `build.gradle`:
```gradle
dependencies {
    implementation 'com.c2concierge:mobile:0.1.0'
}
```

### 2. Configure Network Security
Add to `src/main/res/xml/network_security_config.xml`:
```xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="false">
        <trust-anchors>
            <certificates src="system"/>
        </trust-anchors>
    </base-config>
</network-security-config>
```

### 3. Add to AndroidManifest.xml
```xml
<application
    android:networkSecurityConfig="@xml/network_security_config">
    ...
</application>

<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
```

### 4. Basic Usage
```kotlin
import com.c2concierge.mobile.*

class MainActivity : AppCompatActivity() {
    private lateinit var verifier: C2CMobileVerifier
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Initialize SDK
        val config = SdkConfig(
            relayBaseUrl = HttpUrl.parse("https://verify.c2concierge.org"),
            enableDebugLogging = BuildConfig.DEBUG
        )
        verifier = C2CMobileVerifier.create(this, config)
    }
    
    private suspend fun verifyImage(url: String) {
        try {
            val httpUrl = HttpUrl.parse(url) ?: return
            val result = verifier.verify(httpUrl, preferRelay = true)
            
            // Show results
            ResultsModal.show(this, result)
        } catch (e: Exception) {
            // Handle error
        }
    }
    
    private suspend fun verifyLocalFile(uri: Uri) {
        try {
            val result = verifier.verify(uri)
            ResultsModal.show(this, result)
        } catch (e: Exception) {
            // Handle error
        }
    }
}
```

## Share Sheet Integration

### 1. Add Share Activity
```kotlin
class ShareActivity : AppCompatActivity() {
    // Use the provided ShareActivity as a template
    // or implement your own handling
}
```

### 2. Add Intent Filters
```xml
<activity android:name=".share.ShareActivity">
    <intent-filter>
        <action android:name="android.intent.action.SEND" />
        <category android:name="android.intent.category.DEFAULT" />
        <data android:mimeType="image/*" />
    </intent-filter>
    <intent-filter>
        <action android:name="android.intent.action.SEND" />
        <category android:name="android.intent.category.DEFAULT" />
        <data android:mimeType="video/*" />
    </intent-filter>
    <intent-filter>
        <action android:name="android.intent.action.SEND" />
        <category android:name="android.intent.category.DEFAULT" />
        <data android:mimeType="text/plain" />
    </intent-filter>
</activity>
```

## Advanced Configuration

### TLS Pinning
```kotlin
val config = SdkConfig(
    relayBaseUrl = HttpUrl.parse("https://verify.c2concierge.org"),
    pinnedSpki = listOf(
        "base64_encoded_spki_hash_1",
        "base64_encoded_spki_hash_2"
    )
)
```

### Cache Configuration
```kotlin
val config = SdkConfig(
    cacheSizeBytes = 100 * 1024 * 1024, // 100MB
    manifestTtlSeconds = 600 // 10 minutes
)
```

### Background Processing
```kotlin
// Schedule manifest prefetching
val backgroundWorkManager = BackgroundWorkManager.create(context)
val urls = listOf(
    HttpUrl.parse("https://example.com/1.jpg")!!,
    HttpUrl.parse("https://example.com/2.jpg")!!
)
backgroundWorkManager.scheduleManifestPrefetch(urls)
```

## ProGuard/R8 Rules
Add to `proguard-rules.pro`:
```proguard
-keep public class com.c2concierge.mobile.** { *; }
-keepclassmembers class * {
    native <methods>;
}
```

## Performance Tips
1. Use coroutines for async operations
2. Implement proper error handling
3. Monitor memory usage with profiler
4. Use WorkManager for background tasks
5. Configure appropriate cache sizes

## Testing
```kotlin
@Test
fun testUrlVerification() = runBlocking {
    val config = SdkConfig(enableDebugLogging = true)
    val verifier = C2CMobileVerifier.create(context, config)
    
    val result = verifier.verify(
        HttpUrl.parse("https://example.com/test.jpg")!!
    )
    
    assertNotNull(result)
    assertTrue(result.messages.isNotEmpty())
}
```

## Troubleshooting
- **Network errors**: Check network security config
- **Memory issues**: Reduce cache size, stream large files
- **TLS errors**: Update pinned certificates
- **Share extension crashes**: Monitor memory usage < 90MB
