package es.marea.app.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews
import es.marea.app.MainActivity
import es.marea.app.R
import es.marea.app.MareaApp
import es.marea.app.data.Rating
import es.marea.app.data.Surf
import es.marea.app.data.tr
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class SpotWidgetProvider : AppWidgetProvider() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        // goAsync: el sistema no da por terminado el aviso hasta que todas las actualizaciones acaban.
        val pending = goAsync()
        var left = appWidgetIds.size
        if (left == 0) { pending.finish(); return }
        for (appWidgetId in appWidgetIds) {
            updateWidget(context, appWidgetManager, appWidgetId) { synchronized(this) { if (--left == 0) pending.finish() } }
        }
    }

    private fun updateWidget(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int, done: () -> Unit = {}) {
        val views = RemoteViews(context.packageName, R.layout.widget_spot)
        val api = (context.applicationContext as MareaApp).state.api

        // El primer favorito de la app (mismas preferencias que AppState); si no hay, Somo.
        val favs = context.getSharedPreferences("marea", Context.MODE_PRIVATE).getStringSet("favs", null).orEmpty()
        val spot = favs.sorted().firstNotNullOfOrNull { api.spotById[it] } ?: api.spotById["somo"] ?: api.spots.firstOrNull()
        if (spot == null) { done(); return }

        views.setTextViewText(R.id.widget_spot_name, spot.name)
        views.setTextViewText(R.id.widget_spot_region, spot.region)

        // Al tocarlo se abre el spot en la app.
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse("marea://spot/${spot.id}"), context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingIntent = PendingIntent.getActivity(context, appWidgetId, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        views.setOnClickPendingIntent(R.id.widget_root, pendingIntent)
        appWidgetManager.updateAppWidget(appWidgetId, views)

        // Condiciones reales; sin ellas se muestra "–" y "Sin datos ahora", nunca valores de ejemplo.
        scope.launch {
            try {
                val res = api.spot(spot.id, force = false)
                val detail = res.data
                val n = detail.now
                val r = Rating.of(detail.score)
                val tide = detail.tide
                views.setTextViewText(R.id.widget_wave_height, Surf.fmt(n.h))
                views.setTextViewText(R.id.widget_wave_period, "· ${Surf.fmt(n.period, 0)} s")
                views.setTextViewText(R.id.widget_wind, tr(R.string.widget_wind, Surf.fmt(n.wind, 0)))
                val tideText = tide.h?.let { "${Surf.fmt(it)} m ${if (tide.rising == true) "↗" else "↘"}" } ?: "–"
                views.setTextViewText(R.id.widget_tide, tr(R.string.widget_tide, tideText))
                views.setTextViewText(R.id.widget_rating_badge, r.label)
                val badgeColor = when (r) {
                    Rating.Epic -> context.getColor(R.color.q_epic)
                    Rating.Good -> context.getColor(R.color.q_good)
                    Rating.Fair -> context.getColor(R.color.q_fair)
                    Rating.Poor -> context.getColor(R.color.q_poor)
                    Rating.Flat -> context.getColor(R.color.widget_muted)
                }
                views.setTextColor(R.id.widget_rating_badge, badgeColor)
            } catch (_: Exception) {
                views.setTextViewText(R.id.widget_wave_height, "–")
                views.setTextViewText(R.id.widget_wave_period, "")
                views.setTextViewText(R.id.widget_wind, tr(R.string.widget_noData))
                views.setTextViewText(R.id.widget_tide, "")
                views.setTextViewText(R.id.widget_rating_badge, "")
            } finally {
                appWidgetManager.updateAppWidget(appWidgetId, views)
                done()
            }
        }
    }
}
