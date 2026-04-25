# ─── React Native / Hermes ────────────────────────────────────────────────────
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }
-dontwarn com.facebook.react.**
-dontwarn com.facebook.hermes.**

# ─── React Native New Architecture ───────────────────────────────────────────
-keep class com.facebook.react.turbomodule.** { *; }
-keep class com.facebook.react.fabric.** { *; }
-keep class com.facebook.react.uimanager.** { *; }
-keep class com.facebook.react.bridge.** { *; }

# ─── Reanimated ──────────────────────────────────────────────────────────────
-keep class com.swmansion.reanimated.** { *; }
-keep class com.swmansion.gesturehandler.** { *; }

# ─── Expo modules ────────────────────────────────────────────────────────────
-keep class expo.modules.** { *; }
-dontwarn expo.modules.**

# ─── OkHttp / Networking ─────────────────────────────────────────────────────
-dontwarn okhttp3.**
-dontwarn okio.**
-keep class okhttp3.** { *; }
-keep interface okhttp3.** { *; }

# ─── Kotlin ──────────────────────────────────────────────────────────────────
-keep class kotlin.** { *; }
-dontwarn kotlin.**

# ─── Fresco (image loading) ───────────────────────────────────────────────────
-keep class com.facebook.fresco.** { *; }
-dontwarn com.facebook.fresco.**

# ─── Coil 3 (expo-image / transitive dependency) ─────────────────────────────
-keep class coil3.** { *; }
-dontwarn coil3.**
-dontwarn coil3.PlatformContext

# ─── Google Maps ──────────────────────────────────────────────────────────────
-keep class com.google.android.gms.maps.** { *; }
-keep interface com.google.android.gms.maps.** { *; }

# ─── Supabase / Ktor / Ktor-Android ──────────────────────────────────────────
-keep class io.ktor.** { *; }
-dontwarn io.ktor.**

# ─── Keep JS bundle entry points ─────────────────────────────────────────────
-keep class com.nearandnow.shopkeeper.** { *; }

# ─── Serialization ───────────────────────────────────────────────────────────
-keepclassmembers class * {
    @com.google.gson.annotations.SerializedName <fields>;
}
-keep class * implements java.io.Serializable { *; }

# ─── Strip console.log in JS (handled by Metro/Hermes, not ProGuard) ─────────
# JS log stripping is in metro.config.js or via --minify flag. ProGuard operates
# on Kotlin/Java only. No action needed here for JS logs.

# ─── General Android safety rules ────────────────────────────────────────────
-keepattributes *Annotation*
-keepattributes Signature
-keepattributes Exceptions
-keepattributes InnerClasses
-keepattributes EnclosingMethod
-dontwarn javax.annotation.**
-dontwarn sun.misc.**
