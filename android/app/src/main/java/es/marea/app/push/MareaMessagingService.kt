package es.marea.app.push

import android.Manifest
import android.app.PendingIntent
import android.content.pm.PackageManager
import android.os.Build
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import es.marea.app.MainActivity
import es.marea.app.MareaApp
import es.marea.app.R
import kotlinx.coroutines.launch

// Avisos de Firebase Cloud Messaging. Con la app en segundo plano el sistema muestra el aviso
// y al tocarlo abre MainActivity con el campo "url" en los extras; aquí se cubre la app abierta.
class MareaMessagingService : FirebaseMessagingService() {
    private val state get() = (application as MareaApp).state

    override fun onNewToken(token: String) {
        state.scope.launch { state.alerts.onNewToken(token) }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val n = message.notification ?: return
        val url = message.data["url"] ?: "/"
        val tag = message.data["tag"].takeUnless { it.isNullOrEmpty() }
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("url", url)
        }
        val pending = PendingIntent.getActivity(this, url.hashCode(), intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val notification = NotificationCompat.Builder(this, MareaApp.CHANNEL)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(getColor(R.color.accent))
            .setContentTitle(n.title)
            .setContentText(n.body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(n.body))
            .setAutoCancel(true)
            .setContentIntent(pending)
            .build()
        // Sin permiso de notificaciones (Android 13+) no se muestra nada.
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        NotificationManagerCompat.from(this).notify(tag, 0, notification)
    }
}
