# JS bridge: the WebView calls these by name via reflection.
-keepclassmembers class com.mohdshayan.umbra.MainActivity$Native { public *; }
-keep class com.mohdshayan.umbra.MainActivity$Native { *; }
