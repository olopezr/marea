package es.marea.app.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import java.time.Instant
import java.time.ZoneId
import java.util.UUID
import kotlin.math.floor

// Diario de sesiones (equivale a public/js/diary.js y ios/Marea/Core/Diary.swift): solo en este dispositivo.

@Serializable
data class DiaryTide(val h: Double, val rising: Boolean = false, val coef: Int? = null)

/** Condiciones del momento de guardar la sesión: PORTUS solo conserva 48 h de histórico. */
@Serializable
data class DiarySnap(
    val h: Double? = null,
    @SerialName("Tp") val tp: Double? = null,
    val dir: Double? = null,
    val water: Double? = null,
    val wind: Double? = null,
    val windDir: Double? = null,
    val gust: Double? = null,
    val tide: DiaryTide? = null,
    val score: Double? = null,
)

@Serializable
data class DiaryEntry(
    val id: String,
    val spotId: String,
    /** Fecha local del dispositivo, yyyy-mm-dd. */
    val date: String,
    val rating: Int,
    val notes: String = "",
    val snap: DiarySnap? = null,
)

data class DiaryStat(val avg: Double, val min: Double, val max: Double)

/** Lo que te funciona en un spot: media y rango de las sesiones puntuadas con 4-5. */
data class DiaryInsights(val count: Int, val h: DiaryStat?, val tp: DiaryStat?, val wind: DiaryStat?, val windDir: String?)

/** Dónde se guarda el texto del diario: SharedPreferences en la app, memoria en las pruebas. */
interface DiaryStorage {
    fun read(): String?
    fun write(text: String)
}

class DiaryStore(private val storage: DiaryStorage) {
    var entries: List<DiaryEntry> = load()
        private set

    // Una entrada rota se descarta sin perder las demás; datos ilegibles equivalen a un diario vacío.
    private fun load(): List<DiaryEntry> {
        val text = storage.read() ?: return emptyList()
        val array = runCatching { json.parseToJsonElement(text) as? JsonArray }.getOrNull() ?: return emptyList()
        return array.mapNotNull { decode(it) }.filter { it.spotId.isNotEmpty() && isoDate(it.date) }
    }

    private fun decode(e: JsonElement) = runCatching { json.decodeFromJsonElement(DiaryEntry.serializer(), e) }.getOrNull()

    private fun save() {
        runCatching { storage.write(json.encodeToString(kotlinx.serialization.builtins.ListSerializer(DiaryEntry.serializer()), entries)) }
    }

    fun add(spotId: String, date: String, rating: Int, notes: String, snap: DiarySnap? = null): DiaryEntry? {
        if (spotId.isEmpty() || !isoDate(date)) return null
        val entry = DiaryEntry(UUID.randomUUID().toString(), spotId, date, rating.coerceIn(1, 5), notes.trim().take(MAX_NOTES), snap)
        entries = (entries + entry).takeLast(MAX_ENTRIES)
        save()
        return entry
    }

    fun remove(id: String) {
        entries = entries.filter { it.id != id }
        save()
    }

    /** Más reciente primero: por fecha y, a igual fecha, la última añadida. */
    val newestFirst: List<DiaryEntry>
        get() = entries.withIndex().sortedWith(compareByDescending<IndexedValue<DiaryEntry>> { it.value.date }.thenByDescending { it.index }).map { it.value }

    fun insights(spotId: String): DiaryInsights? {
        val good = entries.filter { it.spotId == spotId && it.rating >= 4 && it.snap != null }
        if (good.size < MIN_INSIGHT_SESSIONS) return null
        val snaps = good.mapNotNull { it.snap }
        // La dirección más frecuente; a igual número gana la que apareció antes.
        val counts = linkedMapOf<String, Int>()
        for (d in snaps.mapNotNull { it.windDir }) Surf.cardinal(d).let { counts[it] = (counts[it] ?: 0) + 1 }
        val top = counts.entries.fold(null as Map.Entry<String, Int>?) { best, e -> if (best == null || e.value > best.value) e else best }
        return DiaryInsights(good.size, stat(snaps.mapNotNull { it.h }), stat(snaps.mapNotNull { it.tp }), stat(snaps.mapNotNull { it.wind }), top?.key)
    }

    companion object {
        const val MAX_ENTRIES = 500
        const val MAX_NOTES = 500
        const val MIN_INSIGHT_SESSIONS = 2
        private val ISO = Regex("""^\d{4}-\d{2}-\d{2}$""")

        fun isoDate(s: String) = ISO.matches(s)

        /** Fecha local del dispositivo (yyyy-mm-dd). */
        fun todayISO(now: Long = System.currentTimeMillis()): String =
            Instant.ofEpochMilli(now).atZone(ZoneId.systemDefault()).toLocalDate().toString()

        /** Condiciones del detalle: la boya si hay lectura y, si no, la previsión; el viento medido si hay estación. */
        fun snapshot(s: SpotDetail): DiarySnap {
            val n = s.now; val b = s.buoy; val w = s.meteo?.wind
            return DiarySnap(
                h = b?.h ?: n.h,
                tp = b?.tp ?: n.period,
                dir = b?.dir ?: n.dir,
                water = b?.water ?: n.water,
                wind = w?.wind ?: n.wind,
                windDir = w?.windDir ?: n.windDir,
                gust = w?.gust ?: n.gust,
                tide = s.tide.h?.let { DiaryTide(it, s.tide.rising == true, s.tide.coef) },
                score = s.score,
            )
        }

        /** Solo se toma la instantánea si la sesión es de hoy: no hay datos medidos de días anteriores. */
        fun snapshot(s: SpotDetail, date: String, now: Long = System.currentTimeMillis()): DiarySnap? =
            if (date == todayISO(now)) snapshot(s) else null

        private fun stat(vals: List<Double>): DiaryStat? {
            val v = vals.filter { it.isFinite() }
            if (v.isEmpty()) return null
            fun r(x: Double) = floor(x * 10 + 0.5) / 10
            return DiaryStat(r(v.sum() / v.size), r(v.min()), r(v.max()))
        }
    }
}
