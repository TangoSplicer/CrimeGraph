# CrimeGraph production shrinker policy.
# Capacitor discovers native plugins and plugin methods by annotation/reflection.
# Preserve the bridge contract while allowing R8 to optimize the rest of the app.
-keepattributes RuntimeVisibleAnnotations,RuntimeInvisibleAnnotations,AnnotationDefault
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keepclassmembers class * {
    @com.getcapacitor.PluginMethod <methods>;
}
-keep class * extends com.getcapacitor.Plugin { *; }

# Retain Cordova plugin entry points registered through the generated bridge.
-keep class org.apache.cordova.** { *; }

# Tink references optional JSR-305 annotations that are not packaged in Android.
# These annotations are not required at runtime and are safe for R8 to ignore.
-dontwarn javax.annotation.Nullable
-dontwarn javax.annotation.concurrent.GuardedBy
