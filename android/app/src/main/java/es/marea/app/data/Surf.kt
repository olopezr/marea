package es.marea.app.data

import java.math.BigDecimal
import java.math.RoundingMode
import java.text.Normalizer
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.concurrent.ConcurrentHashMap
import kotlin.math.abs
import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.roundToInt
import kotlin.math.roundToLong
import kotlin.math.sin
import kotlin.math.sqrt

// Utilidades de presentación portadas de public/js/surf.js y tidechart.js.
// La valoración la calcula el servidor; aquí solo se formatea.

enum class Rating(val label: String, val min: Double) {
    Flat("Plato", 0.0), Poor("Pobre", 1.0), Fair("Aceptable", 2.0), Good("Bueno", 3.0), Epic("Muy bueno", 4.0);

    companion object {
        fun of(score: Double) = entries.reversed().firstOrNull { score >= it.min } ?: Flat
    }
}

object Surf {
    private val cardinals = listOf("N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO")

    fun cardinal(deg: Double?): String {
        if (deg == null) return "–"
        val norm = ((deg % 360) + 360) % 360
        return cardinals[(norm / 22.5).roundHalfUp().toInt() % 16]
    }

    private fun Double.roundHalfUp() = kotlin.math.floor(this + 0.5)

    /** Número con coma decimal, redondeado como toFixed de JavaScript; "–" si falta. */
    fun fmt(n: Double?, digits: Int = 1): String {
        if (n == null || n.isNaN()) return "–"
        return BigDecimal(n).setScale(digits, RoundingMode.HALF_UP).toPlainString().replace('.', ',')
    }

    fun km(aLat: Double, aLon: Double, bLat: Double, bLon: Double): Double {
        val r = 6371.0
        fun rad(x: Double) = x * Math.PI / 180
        val dLat = rad(bLat - aLat); val dLon = rad(bLon - aLon)
        val h = sin(dLat / 2).pow(2) + cos(rad(aLat)) * cos(rad(bLat)) * sin(dLon / 2).pow(2)
        return 2 * r * asin(sqrt(h))
    }

    private val formatters = ConcurrentHashMap<String, DateTimeFormatter>()

    /** Hora "HH:mm" en la zona horaria del spot. */
    fun hhmm(ms: Double, tz: String): String =
        formatters.getOrPut(tz) { DateTimeFormatter.ofPattern("HH:mm").withZone(ZoneId.of(tz)) }.format(Instant.ofEpochMilli(ms.roundToLong()))

    fun hour(ms: Double, tz: String) = hhmm(ms, tz).take(2)

    fun ago(ms: Double, now: Double = System.currentTimeMillis().toDouble()): String {
        val m = ((now - ms) / 60_000).roundToInt()
        return when {
            m < 1 -> "ahora mismo"
            m < 60 -> "hace $m min"
            else -> "hace ${(m / 60.0).roundToInt()} h"
        }
    }

    fun windPhrase(wt: WindType, kn: Double?) =
        if (wt.key == "calm") "sin apenas viento" else "viento ${wt.label.lowercase()} de ${fmt(kn, 0)} kn"

    fun wetsuit(c: Double?) = when {
        c == null -> ""
        c < 15 -> "Neopreno 5/4 y escarpines"
        c < 17 -> "Neopreno 4/3"
        c < 20 -> "Neopreno 3/2"
        else -> "Neopreno corto"
    }

    // ---------- Índice UV (escala de la OMS) ----------

    fun uvLabel(uv: Double) = when (uv.roundToInt()) {
        in Int.MIN_VALUE..2 -> "Bajo"
        in 3..5 -> "Moderado"
        in 6..7 -> "Alto"
        in 8..10 -> "Muy alto"
        else -> "Extremo"
    }

    fun uvAdvice(uv: Double) = uv.roundToInt().let { if (it < 3) "sin protección especial" else if (it < 8) "crema solar y gorra" else "evita el sol de mediodía" }

    /**
     * Cuándo llega la próxima marea favorable para el spot: "Próxima bajamar a las 03:28".
     * `dayEnd` es el final del día local: lo que cae después se indica como "mañana".
     */
    fun idealTideText(pref: String, ext: List<TideExtreme>, now: Double, dayEnd: Double, tz: String): String {
        if (pref == "all") return "Funciona con cualquier marea"
        fun tomorrow(t: Double) = if (t >= dayEnd) "mañana " else ""
        if (pref == "mid") {
            val t = ext.zipWithNext { a, b -> (a.t + b.t) / 2 }.firstOrNull { it > now } ?: return "Sin datos de marea suficientes"
            return "Próxima media marea ${tomorrow(t)}hacia las ${hhmm(t, tz)}"
        }
        val type = if (pref == "low") "low" else "high"
        val e = ext.firstOrNull { it.type == type && it.t > now } ?: return "Sin datos de marea suficientes"
        return "Próxima ${if (type == "low") "bajamar" else "pleamar"} ${tomorrow(e.t)}a las ${hhmm(e.t, tz)}"
    }

    /** Coordenadas legibles: "43,4590° N · 3,7350° O". */
    fun coords(lat: Double, lon: Double) =
        "${fmt(abs(lat), 4)}° ${if (lat >= 0) "N" else "S"} · ${fmt(abs(lon), 4)}° ${if (lon >= 0) "E" else "O"}"

    fun tidePrefLabel(p: String) = mapOf("low" to "baja", "mid" to "media", "high" to "alta").getOrDefault(p, "cualquiera")

    fun coefLabel(c: Int?) = when {
        c == null -> ""
        c >= 95 -> "vivas fuertes"
        c >= 70 -> "mareas vivas"
        c >= 45 -> "marea media"
        else -> "mareas muertas"
    }

    /** Búsqueda sin mayúsculas ni tildes; cada palabra debe aparecer. */
    fun normalize(s: String) = Normalizer.normalize(s, Normalizer.Form.NFD).replace(Regex("\\p{M}+"), "").lowercase()

    fun matches(name: String, region: String, query: String): Boolean {
        val hay = normalize("$name $region")
        return normalize(query).split(Regex("\\s+")).filter { it.isNotEmpty() }.all { hay.contains(it) }
    }

    // ---------- Marea ----------

    data class TideAt(val h: Double, val rising: Boolean)

    fun tideAt(points: List<SeriesPoint>, t: Double): TideAt? {
        for (i in 0 until points.size - 1) {
            val a = points[i]; val b = points[i + 1]
            if (t >= a.t && t <= b.t) {
                val f = (t - a.t) / (b.t - a.t)
                return TideAt(a.v + (b.v - a.v) * f, b.v > a.v)
            }
        }
        return null
    }

    /** Valor interpolado de una serie; null si cae en un hueco mayor que maxGap. */
    fun valueAt(points: List<SeriesPoint>?, t: Double, maxGap: Double = 2 * 3_600_000.0): Double? {
        if (points == null) return null
        for (i in 0 until points.size - 1) {
            val a = points[i]; val b = points[i + 1]
            if (t >= a.t && t <= b.t) return if (b.t - a.t > maxGap) null else a.v + (b.v - a.v) * (t - a.t) / (b.t - a.t)
        }
        return null
    }

    /** Coeficiente de la marea en curso: el de la pleamar más cercana. */
    fun coefficientAt(ext: List<TideExtreme>, t: Double) = ext.filter { it.coef != null }.minByOrNull { abs(it.t - t) }?.coef

    fun duration(ms: Double): String {
        val m = (ms / 60_000).roundToInt(); val h = m / 60
        return if (h > 0) "$h h ${"%02d".format(m % 60)} min" else "$m min"
    }

    /** Cuánto suben o bajan el mar el viento y la presión (residuo meteorológico de Puertos del Estado). */
    fun surgeText(m: Double?): String {
        if (m == null) return "Viento y presión: sin dato a esta hora"
        val cm = abs((m * 100).roundToInt())
        if (cm < 3) return "Viento y presión: sin efecto apreciable"
        return "Viento y presión: ${if (m > 0) "suben" else "bajan"} el mar $cm cm"
    }
}
