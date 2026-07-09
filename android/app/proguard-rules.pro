# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# react-native-reanimated
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# Add any project specific keep options here:

# NEARNOW release keep rules
# Keep rules for R8/Proguard release builds (minifyEnabled true). React Native +
# Hermes + Expo rely heavily on reflection/JNI, so keep their cores.
-keep,includedescriptorclasses class com.facebook.react.bridge.** { *; }
-keep,includedescriptorclasses class com.facebook.react.turbomodule.core.** { *; }
-keep class com.facebook.react.** { *; }
-keep class com.facebook.jni.** { *; }
-keepclassmembers class * { @com.facebook.react.bridge.ReactMethod <methods>; }
-keepclassmembers class * { @com.facebook.proguard.annotations.DoNotStrip *; }
-keepclassmembers class * { @com.facebook.common.internal.DoNotStrip *; }
-keep @com.facebook.proguard.annotations.DoNotStrip class *
-keep @com.facebook.common.internal.DoNotStrip class *

# Hermes / JavaScriptCore engines
-keep class com.facebook.hermes.** { *; }
-dontwarn com.facebook.hermes.**
-dontwarn com.facebook.jni.**

# Native modules discovered via reflection
-keep class * extends com.facebook.react.bridge.NativeModule { *; }
-keep class * implements com.facebook.react.bridge.NativeModule { *; }
-keep class * extends com.facebook.react.bridge.JavaScriptModule { *; }

# Expo modules (autolinked, resolved via reflection)
-keep class expo.modules.** { *; }
-keep class versioned.host.exp.exponent.** { *; }
-dontwarn expo.modules.**

# OkHttp / Okio networking stack
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn javax.annotation.**
-keepnames class okhttp3.internal.publicsuffix.PublicSuffixDatabase

# Kotlin metadata / coroutines
-keepclassmembers class kotlin.Metadata { *; }
-dontwarn kotlinx.**
