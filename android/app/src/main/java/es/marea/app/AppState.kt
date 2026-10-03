package es.marea.app

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.content.ContextCompat
import androidx.core.content.edit
import androidx.core.location.LocationManagerCompat
import androidx.core.os.CancellationSignal
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import es.marea.app.data.AlertState
import es.marea.app.data.Api
import es.marea.app.data.ApiException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.coroutines.resume
import kotlin.random.Random

enum class ListFilter(val label: String) { All("Todos"), Fav("Favoritos"), Near("Cerca de mí") }

// Preferencias y estado compartido (equivale al estado global de public/js/app.js).
class AppState(private val context: Context, val api: Api) {
    private val prefs = context.getSharedPreferences("marea", Context.MODE_PRIVATE)
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    var favs by mutableStateOf(prefs.getStringSet("favs", emptySet())!!.toSet())
        private set
    var filter by mutableStateOf(runCatching { ListFilter.valueOf(prefs.getString("filter", "All")!!) }.getOrDefault(ListFilter.All))
        private set
    var query by mutableStateOf("")
    var position by mutableStateOf<Location?>(null)
        private set
    var toast by mutableStateOf<String?>(null)
        private set
    /** Spot que hay que abrir (al tocar un aviso). */
    var pendingSpot by mutableStateOf<String?>(null)

    val alerts = AlertsModel(context, api, prefs)

    fun toggleFav(id: String) {
        favs = if (id in favs) favs - id else favs + id
        prefs.edit { putStringSet("favs", favs) }
    }

    fun chooseFilter(f: ListFilter) {
        filter = f
        prefs.edit { putString("filter", f.name) }
    }

    private var toastSeq = 0
    fun show(message: String) {
        toast = message
        val seq = ++toastSeq
        scope.launch { delay(3500); if (seq == toastSeq) toast = null }
    }

    /** Abre la ruta de un aviso ("/#/spot/<id>"). */
    fun open(url: String?) {
        val id = url?.substringAfter("#/spot/", "")?.takeIf { it.isNotEmpty() } ?: return
        if (api.spotById.containsKey(id)) pendingSpot = id
    }

    fun hasLocationPermission() =
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

    /** Pide la ubicación una vez (con el permiso ya concedido); vuelve sin ella si tarda. */
    @SuppressLint("MissingPermission")
    suspend fun locate() {
        if (position != null || !hasLocationPermission()) return
        val lm = context.getSystemService(LocationManager::class.java) ?: return
        val provider = listOf(LocationManager.NETWORK_PROVIDER, LocationManager.GPS_PROVIDER).firstOrNull { lm.isProviderEnabled(it) } ?: return
        position = withTimeoutOrNull(8_000) {
            suspendCancellableCoroutine { cont ->
                val signal = CancellationSignal()
                cont.invokeOnCancellation { signal.cancel() }
                LocationManagerCompat.getCurrentLocation(lm, provider, signal, ContextCompat.getMainExecutor(context)) { cont.resume(it) }
            }
        } ?: lm.getLastKnownLocation(provider)
    }
}

// ---------- Avisos push (equivale a public/js/alerts.js) ----------

class AlertsModel(private val context: Context, private val api: Api, private val prefs: android.content.SharedPreferences) {
    var state by mutableStateOf(AlertState())
        private set
    private var token: String? = prefs.getString("fcmToken", null)

    val available get() = BuildConfig.HAS_FIREBASE || BuildConfig.DEBUG

    fun notificationsAllowed() = androidx.core.app.NotificationManagerCompat.from(context).areNotificationsEnabled()

    suspend fun load() {
        val t = token ?: return run { state = AlertState(minScore = state.minScore) }
        runCatching { api.status(t) }.onSuccess { state = it }
    }

    /** Firebase renovó el token: se vuelve a suscribir con los mismos spots. */
    suspend fun onNewToken(newToken: String) {
        val changed = token != null && token != newToken
        token = newToken
        prefs.edit { putString("fcmToken", newToken) }
        if (changed && state.spots.isNotEmpty()) runCatching { save(state.spots) }
    }

    private suspend fun ensureToken(): String {
        if (!notificationsAllowed()) throw ApiException("Para recibir avisos, permite las notificaciones de Marea en los ajustes del móvil.")
        val t = if (BuildConfig.HAS_FIREBASE && FirebaseApp.getApps(context).isNotEmpty()) {
            runCatching { fcmToken() }.getOrNull()
                ?: throw ApiException("No se pudieron activar las notificaciones. Comprueba la conexión e inténtalo de nuevo.")
        } else if (BuildConfig.DEBUG) {
            // Compilación de desarrollo sin google-services.json: token de prueba para probar
            // la pantalla de avisos contra un servidor local.
            token ?: ("debug-" + (1..40).map { "0123456789abcdef"[Random.nextInt(16)] }.joinToString(""))
        } else {
            throw ApiException("Los avisos no están disponibles en esta versión de la app.")
        }
        if (t != token) { token = t; prefs.edit { putString("fcmToken", t) } }
        return t
    }

    private suspend fun fcmToken(): String? = suspendCancellableCoroutine { cont ->
        FirebaseMessaging.getInstance().token.addOnCompleteListener { task -> cont.resume(if (task.isSuccessful) task.result else null) }
    }

    suspend fun save(spots: List<String>, minScore: Double? = null) {
        if (spots.isEmpty()) return disableAll()
        val t = ensureToken()
        state = api.subscribe(t, spots, minScore ?: state.minScore)
    }

    // Sin spots activos el umbral se guarda en memoria y se envía con la primera suscripción.
    suspend fun setMinScore(v: Double) {
        if (state.spots.isEmpty()) state = state.copy(minScore = v) else save(state.spots, v)
    }

    suspend fun toggle(id: String) = save(if (id in state.spots) state.spots - id else state.spots + id)

    suspend fun disableAll() {
        token?.let { runCatching { api.unsubscribe(it) } }
        state = AlertState()
    }

    suspend fun sendTest() {
        val t = token
        if (t == null || state.spots.isEmpty()) throw ApiException("Activa antes los avisos de algún spot.")
        api.sendTest(t)
    }
}
