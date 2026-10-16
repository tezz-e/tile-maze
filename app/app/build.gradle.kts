import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

android {
    namespace = "com.tiltmaze"
    compileSdk = 35

    val nothingKey: String = run {
        // 1. Gradle property: -PNOTHING_API_KEY=... or ~/.gradle/gradle.properties
        val gradleProp = findProperty("NOTHING_API_KEY") as? String
        if (!gradleProp.isNullOrBlank()) return@run gradleProp

        // 2. local.properties file
        val localPropsFile = rootProject.file("local.properties").takeIf { it.exists() }
            ?: project.file("local.properties").takeIf { it.exists() }
            ?: rootProject.file("../local.properties").takeIf { it.exists() }
        if (localPropsFile != null) {
            val properties = Properties()
            localPropsFile.inputStream().use { properties.load(it) }
            val prop = properties.getProperty("NOTHING_API_KEY")
            if (!prop.isNullOrBlank()) return@run prop
        }

        // 3. Fallback to Nothing debug key
        "test"
    }

    defaultConfig {
        applicationId = "com.tiltmaze"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        manifestPlaceholders["nothingKey"] = nothingKey
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        compose = true
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.ui)
    implementation(libs.androidx.ui.graphics)
    implementation(libs.androidx.ui.tooling.preview)
    implementation(libs.androidx.material3)

    // Networking: OkHttp for high-speed WebSockets and binary streaming
    implementation(libs.okhttp)

    // Local libs: Nothing Glyph Matrix SDK AAR
    implementation(fileTree(mapOf("dir" to "libs", "include" to listOf("*.aar", "*.jar"))))

    // QR Code scanner: Google Code Scanner (zero-permission Google Play services API)
    implementation(libs.play.services.code.scanner)

    debugImplementation(libs.androidx.ui.tooling)
}
