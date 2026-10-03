# Modelos de la API (kotlinx.serialization).
-keepattributes *Annotation*, InnerClasses
-keepclassmembers class es.marea.app.data.** { *** Companion; }
-keepclasseswithmembers class es.marea.app.data.** { kotlinx.serialization.KSerializer serializer(...); }
