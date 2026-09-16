# R8 rules for the release build.
#
# Most of what this app runs is JavaScript, so there is very little Java to shrink - the
# win is the libraries, and a mapping file that makes a Play crash report readable instead
# of a wall of a.b.c().
#
# React Native, Firebase, RevenueCat and the rest ship their own consumer rules inside
# their AARs, so they are not repeated here. What follows is only what those do not cover.

# Keep stack traces readable. Without these a crash in Play Console names obfuscated
# classes and no line numbers, which is the opposite of why the mapping file is uploaded.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Annotations the RN bridge and JSON libraries read at runtime.
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod,Exceptions

# Anything the native bridge reaches by name rather than by call site. R8 cannot see a
# reflective lookup, so a module that is only ever addressed from JavaScript looks unused.
-keepclassmembers class * {
    @com.facebook.react.bridge.ReactMethod <methods>;
    @com.facebook.proguard.annotations.DoNotStrip *;
    @com.facebook.common.internal.DoNotStrip *;
}
-keep @com.facebook.proguard.annotations.DoNotStrip class *
-keep class com.facebook.react.turbomodule.** { *; }
-keep class com.facebook.jni.** { *; }

# Our own entry points, which the system instantiates by name from the manifest.
-keep class com.formbae.MainActivity { *; }
-keep class com.formbae.MainApplication { *; }

# Hermes.
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jsi.** { *; }

# Enum valueOf is reached by name from serialisation.
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

# Parcelable CREATOR fields are found reflectively.
-keepclassmembers class * implements android.os.Parcelable {
    public static final ** CREATOR;
}

# Quieten warnings for optional dependencies that are never on the runtime path.
-dontwarn javax.annotation.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**
