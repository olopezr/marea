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
import es.marea.app.data.AlertPref
import es.marea.app.data.AlertState
import es.marea.app.data.Api
import es.marea.app.data.ApiException
import es.marea.app.data.DiaryEntry
import es.marea.app.data.DiarySnap
import es.marea.app.data.DiaryStorage
import es.marea.app.data.DiaryStore
import es.marea.app.data.tr
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.coroutines.resume
import kotlin.random.Random

enum class ListFilter(private val labelRes: Int) {
    All(R.string.filter_all), Fav(R.string.filter_fav), Near(R.string.filter_near);
    val label: String get() = tr(labelRes)
}

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

    // Diario de sesiones: solo en este dispositivo, en la clave `diary` de las preferencias.
    val diary = DiaryStore(object : DiaryStorage {
        override fun read() = prefs.getString("diary", null)
        override fun write(text: String) = prefs.edit { putString("diary", text) }
    })
    /** Las entradas como estado de Compose: la pantalla se recompone al añadir o borrar. */
    var diaryEntries by mutableStateOf(diary.entries)
        private set

    fun addDiary(spotId: String, date: String, rating: Int, notes: String, snap: DiarySnap?): DiaryEntry? =
        diary.add(spotId, date, rating, notes, snap).also { diaryEntries = diary.entries }

    fun removeDiary(id: String) {
        diary.remove(id)
        diaryEntries = diary.entries
    }

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
        if (changed && state.spots.isNotEmpty()) runCatching { save(state.spots, prefs = state.prefs.orEmpty()) }
    }

    private suspend fun ensureToken(): String {
        if (!notificationsAllowed()) throw ApiException(tr(R.string.err_permissionAndroid))
        val t = if (BuildConfig.HAS_FIREBASE && FirebaseApp.getApps(context).isNotEmpty()) {
            runCatching { fcmToken() }.getOrNull()
                ?: throw ApiException(tr(R.string.err_pushFailedAndroid))
        } else if (BuildConfig.DEBUG) {
            // Compilación de desarrollo sin google-services.json: token de prueba para probar
            // la pantalla de avisos contra un servidor local.
            token ?: ("debug-" + (1..40).map { "0123456789abcdef"[Random.nextInt(16)] }.joinToString(""))
        } else {
            throw ApiException(tr(R.string.err_alertsUnavailable))
        }
        if (t != token) { token = t; prefs.edit { putString("fcmToken", t) } }
        return t
    }

    private suspend fun fcmToken(): String? = suspendCancellableCoroutine { cont ->
        FirebaseMessaging.getInstance().token.addOnCompleteListener { task -> cont.resume(if (task.isSuccessful) task.result else null) }
    }

    suspend fun save(spots: List<String>, minScore: Double? = null, prefs: Map<String, AlertPref>? = null) {
        if (spots.isEmpty()) return disableAll()
        val t = ensureToken()
        // Solo los ajustes de los spots que siguen activos, sin valores por defecto.
        val keep = (prefs ?: state.prefs.orEmpty()).filterKeys { it in spots }.mapValues { it.value.normalized }.filterValues { !it.isDefault }
        state = api.subscribe(t, spots, minScore ?: state.minScore, keep)
    }

    /** Ajustes de un spot activo (calidad propia, solo con terral, franja horaria). */
    suspend fun setPref(id: String, pref: AlertPref) {
        if (id !in state.spots) return
        save(state.spots, prefs = state.prefs.orEmpty() + (id to pref))
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
        if (t == null || state.spots.isEmpty()) throw ApiException(tr(R.string.err_noSpots))
        api.sendTest(t)
    }
}
