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
import es.marea.app.R

// Utilidades de presentación portadas de public/js/surf.js y tidechart.js.
// La valoración la calcula el servidor; aquí solo se formatea.

enum class Rating(private val labelRes: Int, val min: Double) {
    Flat(R.string.rating_flat, 0.0), Poor(R.string.rating_poor, 1.0), Fair(R.string.rating_fair, 2.0), Good(R.string.rating_good, 3.0), Epic(R.string.rating_epic, 4.0);

    val label: String get() = tr(labelRes)

    companion object {
        fun of(score: Double) = entries.reversed().firstOrNull { score >= it.min } ?: Flat
    }
}

object Surf {
    private val cardinals = listOf("N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO")

    fun cardinal(deg: Double?): String {
        if (deg == null) return "–"
        val norm = ((deg % 360) + 360) % 360
        val c = cardinals[(norm / 22.5).roundHalfUp().toInt() % 16]
        return if (L10n.english) c.replace('O', 'W') else c
    }

    private fun Double.roundHalfUp() = kotlin.math.floor(this + 0.5)

    /** Número con coma decimal (punto en inglés), redondeado como toFixed de JavaScript; "–" si falta. */
    fun fmt(n: Double?, digits: Int = 1): String {
        if (n == null || n.isNaN()) return "–"
        val out = BigDecimal(n).setScale(digits, RoundingMode.HALF_UP).toPlainString()
        return if (L10n.english) out else out.replace('.', ',')
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
            m < 1 -> tr(R.string.ago_now)
            m < 60 -> tr(R.string.ago_min, m)
            else -> tr(R.string.ago_h, (m / 60.0).roundToInt())
        }
    }

    fun windLabel(key: String) = tr(when (key) { "off" -> R.string.wind_off; "cross" -> R.string.wind_cross; "on" -> R.string.wind_on; else -> R.string.wind_calm })

    fun windPhrase(wt: WindType, kn: Double?) =
        if (wt.key == "calm") tr(R.string.windPhrase_calm) else tr(R.string.windPhrase, windLabel(wt.key).lowercase(), fmt(kn, 0))

    fun wetsuit(c: Double?) = when {
        c == null -> ""
        c < 15 -> tr(R.string.wetsuit_54)
        c < 17 -> tr(R.string.wetsuit_43)
        c < 20 -> tr(R.string.wetsuit_32)
        else -> tr(R.string.wetsuit_short)
    }

    // ---------- Índice UV (escala de la OMS) ----------

    fun uvLabel(uv: Double) = when (uv.roundToInt()) {
        in Int.MIN_VALUE..2 -> tr(R.string.uv_low)
        in 3..5 -> tr(R.string.uv_moderate)
        in 6..7 -> tr(R.string.uv_high)
        in 8..10 -> tr(R.string.uv_veryHigh)
        else -> tr(R.string.uv_extreme)
    }

    fun uvAdvice(uv: Double) = uv.roundToInt().let { tr(if (it < 3) R.string.uv_adviceLow else if (it < 8) R.string.uv_adviceMid else R.string.uv_adviceHigh) }

    /**
     * Cuándo llega la próxima marea favorable para el spot: "Próxima bajamar a las 03:28".
     * `dayEnd` es el final del día local: lo que cae después se indica como "mañana".
     */
    fun idealTideText(pref: String, ext: List<TideExtreme>, now: Double, dayEnd: Double, tz: String): String {
        if (pref == "all") return tr(R.string.ideal_all)
        fun tomorrow(t: Double) = if (t >= dayEnd) tr(R.string.ideal_tomorrow) else ""
        if (pref == "mid") {
            val t = ext.zipWithNext { a, b -> (a.t + b.t) / 2 }.firstOrNull { it > now } ?: return tr(R.string.ideal_noData)
            return tr(R.string.ideal_mid, tomorrow(t), hhmm(t, tz))
        }
        val type = if (pref == "low") "low" else "high"
        val e = ext.firstOrNull { it.type == type && it.t > now } ?: return tr(R.string.ideal_noData)
        return tr(if (type == "low") R.string.ideal_low else R.string.ideal_high, tomorrow(e.t), hhmm(e.t, tz))
    }

    /** Coordenadas legibles: "43,4590° N · 3,7350° O". */
    fun coords(lat: Double, lon: Double) =
        "${fmt(abs(lat), 4)}° ${if (lat >= 0) "N" else "S"} · ${fmt(abs(lon), 4)}° ${if (lon >= 0) "E" else if (L10n.english) "W" else "O"}"

    fun tidePrefLabel(p: String) = tr(when (p) { "low" -> R.string.tidePref_low; "mid" -> R.string.tidePref_mid; "high" -> R.string.tidePref_high; else -> R.string.tidePref_all })

    fun coefLabel(c: Int?) = when {
        c == null -> ""
        c >= 95 -> tr(R.string.coef_springStrong)
        c >= 70 -> tr(R.string.coef_spring)
        c >= 45 -> tr(R.string.coef_mean)
        else -> tr(R.string.coef_neap)
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
        return if (h > 0) tr(R.string.duration_hm, h, "%02d".format(m % 60)) else tr(R.string.duration_m, m)
    }

    /** Cuánto suben o bajan el mar el viento y la presión (residuo meteorológico de Puertos del Estado). */
    fun surgeText(m: Double?): String {
        if (m == null) return tr(R.string.surge_none)
        val cm = abs((m * 100).roundToInt())
        if (cm < 3) return tr(R.string.surge_flat)
        return tr(if (m > 0) R.string.surge_up else R.string.surge_down, cm)
    }

    /** Día abreviado en el idioma de la app: "Lun 5" / "Mon 5". */
    fun dayLabel(ms: Double, tz: String): String {
        val f = DateTimeFormatter.ofPattern("EEE d", if (L10n.english) java.util.Locale.UK else java.util.Locale.forLanguageTag("es-ES")).withZone(ZoneId.of(tz))
        val s = f.format(Instant.ofEpochMilli(ms.roundToLong())).replace(".", "").replace(",", "")
        return s.replaceFirstChar { it.uppercase() }
    }

    /** Duración de las horas de luz: "11 h 35 min". */
    fun daylight(ms: Double): String {
        val m = (ms / 60_000).roundToInt()
        return tr(R.string.duration_hm, m / 60, "%02d".format(m % 60))
    }

    /** Potencia del oleaje en aguas profundas (kW por metro de frente de ola): 0,49 · H² · T. */
    fun power(h: Double?, period: Double?) = if (h == null || period == null) null else 0.49 * h * h * period

    fun powerLabel(p: Double) = tr(if (p < 5) R.string.energy_low else if (p < 15) R.string.energy_moderate else if (p < 40) R.string.energy_strong else R.string.energy_veryStrong)

    fun trendArrow(key: String) = mapOf("up" to "↗", "down" to "↘", "steady" to "→")[key] ?: ""

    fun trendLabel(key: String) = tr(when (key) { "up" -> R.string.trend_up; "down" -> R.string.trend_down; else -> R.string.trend_steady })

    /** Cambio con signo: "+0,4", "−0,2", "0,0". */
    fun signed(x: Double): String {
        val r = (x * 10).roundToInt() / 10.0
        return (if (r > 0) "+" else if (r < 0) "−" else "") + fmt(abs(r))
    }

    /** Cuánto se ha desviado la previsión de lo medido por la boya en las últimas 24 h. */
    fun fitText(f: ForecastFit) = when {
        f.bias >= 0.15 -> tr(R.string.hist_fitLow, fmt(f.bias))
        f.bias <= -0.15 -> tr(R.string.hist_fitHigh, fmt(-f.bias))
        f.mae < 0.25 -> tr(R.string.hist_fitGood, fmt(f.mae))
        else -> tr(R.string.hist_fitMixed, fmt(f.mae))
    }
}
