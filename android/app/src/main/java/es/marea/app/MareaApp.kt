package es.marea.app

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import es.marea.app.data.Api

class MareaApp : Application() {
    lateinit var state: AppState
        private set

    override fun onCreate() {
        super.onCreate()
        // OpenStreetMap pide identificar la app que descarga sus teselas.
        org.osmdroid.config.Configuration.getInstance().userAgentValue = "$packageName/${BuildConfig.VERSION_NAME}"
        state = AppState(this, Api(this))
        getSystemService(NotificationManager::class.java).createNotificationChannel(
            NotificationChannel(CHANNEL, "Avisos de spots", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Cuando un spot elegido se pone bueno"
            },
        )
    }

    companion object {
        const val CHANNEL = "avisos"
    }
}
