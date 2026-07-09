# Keep WebView JavaScript interface methods
-keepclassmembers class com.fotify.** {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep NSD service info
-keep class android.net.nsd.** { *; }
