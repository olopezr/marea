package es.marea.app.data

import es.marea.app.R

import android.content.Context
import es.marea.app.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.File
import java.io.IOException
import java.net.ConnectException
import java.net.HttpURLConnection
import java.net.SocketTimeoutException
import java.net.URL
import java.net.UnknownHostException

// Cliente de la API de Marea (equivale a public/js/api.js). Guarda la última respuesta
// en disco para poder abrir sin conexión.

data class Cached<T>(val ts: Double, val data: T, val stale: Boolean = false, val offline: Boolean = false)

class ApiException(message: String) : Exception(message)

val json = Json { ignoreUnknownKeys = true; explicitNulls = false; encodeDefaults = true }

class Api(context: Context, private val base: String = BuildConfig.API_BASE) {
    // Sube la versión cuando cambien las respuestas de la API (v4: índice UV) para no mostrar
    // datos guardados que no traen los campos nuevos. Las cachés anteriores se borran.
    private val cacheDir = File(context.cacheDir, CACHE_VERSION).apply {
        context.cacheDir.listFiles { f -> f.name.startsWith("api-v") && f.name != CACHE_VERSION }?.forEach { it.deleteRecursively() }
        mkdirs()
    }
    private val freshMs = 5 * 60_000.0

    // La lista pide la boya de cada tarjeta al aparecer, como mucho 3 a la vez.
    val buoyLimiter = Semaphore(3)

    val spots: List<Spot> by lazy {
        context.assets.open("spots.json").bufferedReader().use { json.decodeFromString(ListSerializer(Spot.serializer()), it.readText()) }
    }
    val spotById by lazy { spots.associateBy { it.id } }

    suspend fun overview(force: Boolean = false) = cachedGet("/api/spots", Overview.serializer(), force)
    suspend fun spot(id: String, force: Boolean = false) = cachedGet("/api/spots/$id", SpotDetail.serializer(), force)
    suspend fun buoy(id: String) = buoyLimiter.withPermit { cachedGet("/api/spots/$id/boya", BuoyResponse.serializer(), false) }

    @Serializable
    private data class Entry(val ts: Double, val data: kotlinx.serialization.json.JsonElement)

    private suspend fun <T> cachedGet(path: String, serializer: KSerializer<T>, force: Boolean): Cached<T> = withContext(Dispatchers.IO) {
        val file = File(cacheDir, path.replace('/', '_') + ".json")
        val hit = runCatching {
            val e = json.decodeFromString(Entry.serializer(), file.readText())
            Cached(e.ts, json.decodeFromJsonElement(serializer, e.data))
        }.getOrNull()
        val now = System.currentTimeMillis().toDouble()
        if (!force && hit != null && now - hit.ts < freshMs) return@withContext hit
        try {
            val body = request(path)
            val data = json.decodeFromString(serializer, body)
            runCatching { file.writeText(json.encodeToString(Entry.serializer(), Entry(now, json.parseToJsonElement(body)))) }
            Cached(now, data)
        } catch (e: Exception) {
            hit?.copy(stale = true, offline = isOffline(e)) ?: throw e
        }
    }

    private fun isOffline(e: Throwable) = e is UnknownHostException || e is ConnectException

    private fun request(path: String, method: String = "GET", body: String? = null): String {
        val conn = (URL(base + path).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 15_000
            readTimeout = 60_000
            useCaches = false
            setRequestProperty("Accept", "application/json")
            // Los mensajes de error del servidor llegan en el idioma de la app.
            setRequestProperty("Accept-Language", L10n.lang)
            if (body != null) {
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
            }
        }
        try {
            if (body != null) conn.outputStream.use { it.write(body.toByteArray()) }
            val status = conn.responseCode
            val text = (if (status in 200..299) conn.inputStream else conn.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""
            if (status !in 200..299) {
                val msg = runCatching { json.parseToJsonElement(text).let { (it as JsonObject)["error"]?.jsonPrimitive?.content } }.getOrNull()
                throw ApiException(msg ?: tr(R.string.error_status, status))
            }
            return text
        } catch (e: UnknownHostException) {
            throw e
        } catch (e: ConnectException) {
            throw e
        } catch (e: SocketTimeoutException) {
            throw ApiException(tr(R.string.error_timeout))
        } catch (e: IOException) {
            throw ApiException(tr(R.string.error_connect))
        } finally {
            conn.disconnect()
        }
    }

    // ---------- Avisos ----------

    @Serializable private data class Device(val platform: String = "android", val token: String)
    @Serializable private data class Subscribe(val device: Device, val spots: List<String>, val minScore: Double, val lang: String = L10n.lang)
    @Serializable private data class Endpoint(val endpoint: String)

    private fun endpoint(token: String) = json.encodeToString(Endpoint.serializer(), Endpoint("fcm:$token"))

    suspend fun subscribe(token: String, spots: List<String>, minScore: Double): AlertState = withContext(Dispatchers.IO) {
        val body = json.encodeToString(Subscribe.serializer(), Subscribe(Device(token = token), spots, minScore))
        json.decodeFromString(AlertState.serializer(), request("/api/push/subscribe", "POST", body))
    }

    suspend fun status(token: String): AlertState = withContext(Dispatchers.IO) {
        json.decodeFromString(AlertState.serializer(), request("/api/push/status", "POST", endpoint(token)))
    }

    suspend fun unsubscribe(token: String) = withContext(Dispatchers.IO) { request("/api/push/unsubscribe", "POST", endpoint(token)); Unit }

    suspend fun sendTest(token: String) = withContext(Dispatchers.IO) { request("/api/push/test", "POST", endpoint(token)); Unit }

    fun legalUrl(path: String) = base + path

    private companion object {
        const val CACHE_VERSION = "api-v5"
    }
}
