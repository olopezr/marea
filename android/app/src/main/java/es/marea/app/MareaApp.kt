package es.marea.app

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.res.Configuration
import es.marea.app.data.Api
import es.marea.app.data.L10n

class MareaApp : Application() {
    lateinit var state: AppState
        private set

    override fun onCreate() {
        super.onCreate()
        L10n.init(resources)
        state = AppState(this, Api(this))
        getSystemService(NotificationManager::class.java).createNotificationChannel(
            NotificationChannel(CHANNEL, getString(R.string.notif_channel), NotificationManager.IMPORTANCE_HIGH).apply {
                description = getString(R.string.notif_channelDesc)
            },
        )
    }

    // Si se cambia el idioma del móvil con la app abierta, los textos y formatos se actualizan.
    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        L10n.init(resources)
    }

    companion object {
        const val CHANNEL = "avisos"
    }
}
