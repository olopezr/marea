plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
}

// Firebase Cloud Messaging necesita app/google-services.json (Firebase > Configuración del proyecto).
// Sin él la app compila igual y los avisos quedan desactivados.
val hasFirebase = file("google-services.json").exists()
if (hasFirebase) apply(plugin = "com.google.gms.google-services")

android {
    namespace = "es.marea.app"
    compileSdk = 37

    defaultConfig {
        applicationId = "es.marea.app"
        minSdk = 26
        targetSdk = 37
        versionCode = 1
        versionName = "1.0.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        buildConfigField("boolean", "HAS_FIREBASE", hasFirebase.toString())
    }

    signingConfigs {
        create("release") {
            val keystoreFile = project.findProperty("mareaKeystoreFile") as? String ?: System.getenv("KEYSTORE_FILE")
            if (keystoreFile != null && file(keystoreFile).exists()) {
                storeFile = file(keystoreFile)
                storePassword = project.findProperty("mareaKeystorePassword") as? String ?: System.getenv("KEYSTORE_PASSWORD") ?: ""
                keyAlias = project.findProperty("mareaKeyAlias") as? String ?: System.getenv("KEY_ALIAS") ?: ""
                keyPassword = project.findProperty("mareaKeyPassword") as? String ?: System.getenv("KEY_PASSWORD") ?: ""
            } else {
                initWith(getByName("debug"))
            }
        }
    }

    buildTypes {
        debug {
            buildConfigField("String", "API_BASE", "\"${property("mareaApiBaseDebug")}\"")
        }
        release {
            signingConfig = signingConfigs.getByName("release")
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            buildConfigField("String", "API_BASE", "\"${property("mareaApiBaseRelease")}\"")
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    testOptions.unitTests.isReturnDefaultValues = true
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2026.09.00")
    implementation(composeBom)
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.ui:ui-tooling-preview")
    debugImplementation("androidx.compose.ui:ui-tooling")
    implementation("androidx.core:core-ktx:1.19.1")
    implementation("androidx.activity:activity-compose:1.13.0")
    implementation("androidx.navigation:navigation-compose:2.10.2")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.11.0")
    implementation("androidx.browser:browser:1.10.0")
    // Mapa de la ubicación con teselas de OpenStreetMap (no necesita clave de Google).
    // Mapas: MapLibre con el estilo de OpenFreeMap (libre, sin claves, uso comercial permitido).
    implementation("org.maplibre.gl:android-sdk:11.11.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.11.0")
    implementation(platform("com.google.firebase:firebase-bom:34.19.0"))
    implementation("com.google.firebase:firebase-messaging")

    testImplementation("junit:junit:4.13.2")
}
