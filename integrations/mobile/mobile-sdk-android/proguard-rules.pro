# SECURITY-HARDENED ProGuard rules for C2 Concierge Mobile SDK
# MINIMAL exposure to prevent reverse engineering

# Keep ONLY essential native library methods - RESTRICTED
-keep class com.c2concierge.mobile.CoreVerifier {
    public boolean verifyEmbedded(byte[], java.lang.String);
    public boolean verifyWithManifest(byte[], java.lang.String);
}

# Keep ONLY JNI methods that are absolutely required
-keepclasseswithmembernames class * {
    native <methods>;
}

# Keep MINIMAL public API surface - NO internal exposure
-keep public class com.c2concierge.mobile.VerifyResult {
    public <init>(...);
    public com.c2concierge.mobile.VerifyState getState();
    public java.lang.String getIssuerDisplayName();
    public java.lang.String getKeyId();
    public java.lang.Long getTimestamp();
    public java.util.List getMessages();
    public boolean isHardwareAttested();
    public boolean isSuccessful();
    public java.lang.String getVerificationTime();
}

-keep public class com.c2concierge.mobile.VerifyState { *; }

-keep public class com.c2concierge.mobile.SdkConfig {
    public static com.c2concierge.mobile.SdkConfig create(...);
    public static com.c2concierge.mobile.SdkConfig Default;
}

-keep public interface com.c2concierge.mobile.MobileVerifier {
    public com.c2concierge.mobile.VerifyResult verify(...);
}

# Keep ONLY public constructor for main class
-keep public class com.c2concierge.mobile.C2CMobileVerifier {
    public static com.c2concierge.mobile.C2CMobileVerifier create(...);
}

# RESTRICTED UI class keeping - MINIMAL
-keep public class com.c2concierge.mobile.ui.ResultsModalFragment {
    public static com.c2concierge.mobile.ui.ResultsModalFragment create(...);
}

-keep public class com.c2concierge.mobile.share.ShareActivity {
    public void onCreate(...);
}

# STRICT: Do NOT keep all data classes - only public API
-keep class com.c2concierge.mobile.VerifyResult { *; }
-keep class com.c2concierge.mobile.SdkConfig { *; }

# OkHttp classes - they handle their own obfuscation
-keep class okhttp3.** { *; }
-keep interface okhttp3.** { *; }
-dontwarn okhttp3.**

# Moshi classes for JSON parsing - RESTRICTED
-keep class com.squareup.moshi.** { *; }
-dontwarn com.squareup.moshi.**

# WorkManager classes - RESTRICTED
-keep class androidx.work.** { *; }
-dontwarn androidx.work.**

# Coroutine classes - MINIMAL exposure
-keepnames class kotlinx.coroutines.internal.MainDispatcherFactory {}
-keepnames class kotlinx.coroutines.CoroutineExceptionHandler {}
-keepclassmembernames class kotlinx.** {
    volatile <fields>;
}

# AGGRESSIVE optimization for security
-optimizations !code/simplification/arithmetic,!code/simplification/cast,!field/*,!class/merging/*
-optimizationpasses 7
-allowaccessmodification
-dontpreverify

# REMOVE line numbers in production for security
-keepattributes SourceFile,LineNumberTable

# Keep ONLY essential annotations
-keepattributes *Annotation*

# Keep enum methods - MINIMAL
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

# SECURITY: Remove debug information
-assumenosideeffects class android.util.Log {
    public static boolean isLoggable(java.lang.String, int);
    public static int v(...);
    public static int i(...);
    public static int w(...);
    public static int d(...);
    public static int e(...);
}

# SECURITY: Obfuscate string constants
-adaptclassstrings
-adaptresourcefilenames
-adaptresourcefilecontents

# NO reflection to prevent injection attacks
-keepattributes Signature
-dontnote **

# STRICT: Remove all unused code
-shrink
-dontshrink
