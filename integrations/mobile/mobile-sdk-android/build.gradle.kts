plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
    id("maven-publish")
    id("org.jetbrains.kotlin.plugin.serialization") version "1.9.10"
}

android {
    namespace = "com.credlink.mobile"
    compileSdk = 34
    buildConfig = true

    defaultConfig {
        minSdk = 24
        targetSdk = 34
        
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        consumerProguardFiles("consumer-rules.pro")
        
        // Configure build variants
        buildConfigField("String", "VERSION_NAME", "\"0.1.0\"")
        buildConfigField("int", "VERSION_CODE", "1")
        
        // Security configurations
        buildConfigField("boolean", "ENABLE_STRICT_SECURITY", "true")
        buildConfigField("int", "MAX_URL_LENGTH", "2048")
        buildConfigField("long", "MAX_CACHE_SIZE", "104857600L") // 100MB
    }

    buildTypes {
        release {
            minifyEnabled = true
            shrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            buildConfigField("boolean", "DEBUG_MODE", "false")
        }
        debug {
            debuggable = true
            testCoverageEnabled = true
            buildConfigField("boolean", "DEBUG_MODE", "true")
        }
    }
    
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
    
    kotlinOptions {
        jvmTarget = "1.8"
        freeCompilerArgs += listOf(
            "-opt-in=kotlinx.coroutines.ExperimentalCoroutinesApi",
            "-Xexplicit-api=strict",
            "-Xopt-in=kotlin.RequiresOptIn"
        )
    }
    
    publishing {
        singleVariant("release") {
            withSourcesJar()
            withJavadocJar()
        }
    }
}

dependencies {
    // Core Android dependencies - EXACT versions for security
    implementation("androidx.core:core-ktx:1.12.0")
    implementation("androidx.appcompat:appcompat:1.6.1")
    implementation("androidx.work:work-runtime-ktx:2.9.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.7.0")
    
    // Networking - EXACT versions for security
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")
    
    // Coroutines - EXACT versions for security
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")
    
    // JSON parsing - EXACT versions for security
    implementation("com.squareup.moshi:moshi:1.15.0")
    implementation("com.squareup.moshi:moshi-kotlin:1.15.0")
    
    // Security and validation
    implementation("androidx.security:security-crypto:1.1.0-alpha06")
    
    // Testing - EXACT versions for security
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.mockito:mockito-core:5.7.0")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.7.3")
    testImplementation("androidx.arch.core:core-testing:2.2.0")
    
    androidTestImplementation("androidx.test.ext:junit:1.1.5")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.1")
    androidTestImplementation("androidx.work:work-testing:2.9.0")
    
    // Native libraries (JNI) - restricted access
    implementation(fileTree(mapOf("dir" to "src/main/jniLibs", "include" to listOf("*.so"))))
}

// Publishing configuration
afterEvaluate {
    publishing {
        publications {
            create<MavenPublication>("release") {
                from(components["release"])
                
                groupId = "com.credlink"
                artifactId = "mobile"
                version = "0.1.0"
                
                pom {
                    name.set("C2 Concierge Mobile SDK")
                    description.set("Android SDK for C2PA content credentials verification")
                    url.set("https://github.com/Nickiller04/credlink")
                    
                    licenses {
                        license {
                            name.set("MIT License")
                            url.set("https://opensource.org/licenses/MIT")
                        }
                    }
                    
                    developers {
                        developer {
                            id.set("credlink")
                            name.set("C2 Concierge Team")
                            email.set("team@credlink.org")
                        }
                    }
                    
                    scm {
                        connection.set("scm:git:github.com:Nickiller04/credlink.git")
                        developerConnection.set("scm:git:ssh://github.com:Nickiller04/credlink.git")
                        url.set("https://github.com/Nickiller04/credlink/tree/main")
                    }
                }
            }
        }
    }
}
