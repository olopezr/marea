package es.marea.app.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// Respuestas de la API de Marea (server/conditions.js). Los números que pueden faltar son nulos,
// igual que en el cliente web, que los muestra como "–". Las horas son milisegundos desde epoch.

@Serializable
data class Spot(
    val id: String,
    val name: String,
    val region: String,
    val lat: Double,
    val lon: Double,
    val facing: Double,
    val tide: String,
    val tz: String,
    val webcam: String? = null,
)

@Serializable
data class WindType(val key: String, val label: String)

@Serializable
data class Now(
    val h: Double? = null,
    @SerialName("T") val period: Double? = null,
    val dir: Double? = null,
    val sh: Double? = null,
    @SerialName("sT") val swellPeriod: Double? = null,
    val sDir: Double? = null,
    val wind: Double? = null,
    val windDir: Double? = null,
    val gust: Double? = null,
    val windType: WindType = WindType("na", "–"),
    val air: Double? = null,
    val water: Double? = null,
)

@Serializable
data class Port(val name: String, val distKm: Double)

@Serializable
data class TideExtreme(val t: Double, val h: Double, val type: String, val coef: Int? = null) {
    val word: String get() = tr(if (type == "high") es.marea.app.R.string.tide_high else es.marea.app.R.string.tide_low)
}

@Serializable
data class TideNow(
    val source: String? = null,
    /** Con marea del modelo: "no-port" (el IHM no cubre la zona) o "down" (el IHM no responde). */
    val reason: String? = null,
    val port: Port? = null,
    val h: Double? = null,
    val rising: Boolean? = null,
    val next: TideExtreme? = null,
    val coef: Int? = null,
)

@Serializable
data class SpotSummary(
    val id: String,
    val name: String,
    val region: String,
    val tz: String,
    val lat: Double,
    val lon: Double,
    val score: Double,
    val now: Now,
    val tide: TideNow,
)

@Serializable
data class Overview(val updatedAt: Double, val forecastSource: String? = null, val spots: List<SpotSummary>)

/** Punto de una serie [t, valor]. */
data class SeriesPoint(val t: Double, val v: Double)

// Las series llegan como [[t, v], ...] con valores que pueden ser nulos; se descartan.
private fun List<List<Double?>>.toSeries() = mapNotNull { p ->
    val t = p.getOrNull(0); val v = p.getOrNull(1)
    if (t != null && v != null) SeriesPoint(t, v) else null
}

@Serializable
data class Surge(val beach: String = "", val points: List<List<Double?>> = emptyList()) {
    val series by lazy { points.toSeries() }
}

@Serializable
data class Observed(
    val gauge: String,
    val distKm: Double? = null,
    val samePort: Boolean? = null,
    val points: List<List<Double?>> = emptyList(),
) {
    val series by lazy { points.toSeries() }
}

@Serializable
data class TideDay(
    val from: Double,
    val to: Double,
    val ext: List<TideExtreme> = emptyList(),
    val points: List<List<Double?>> = emptyList(),
    val surge: Surge? = null,
    val observed: Observed? = null,
) {
    val series by lazy { points.toSeries() }
}

@Serializable
data class Sun(val rise: Double, val set: Double, val dawn: Double? = null, val dusk: Double? = null)

/** Índice UV de hoy: el de la hora en curso y el máximo del día con su hora. */
@Serializable
data class UVToday(val now: Double? = null, val max: Double, val maxT: Double)

@Serializable
data class ClosestBuoy(val name: String, val distKm: Double)

@Serializable
data class BuoyMeta(
    val name: String,
    val lat: Double? = null,
    val lon: Double? = null,
    val distKm: Double,
    val deep: Boolean? = null,
    val far: Boolean? = null,
    val fallback: Boolean? = null,
    val closest: ClosestBuoy? = null,
)

@Serializable
data class BuoyPrediction(val h: Double, @SerialName("Tp") val tp: Double? = null, val dir: Double? = null)

/** Tendencia del oleaje medido: "up", "down" o "steady", con el cambio en metros en `hours` horas. */
@Serializable
data class BuoyTrend(val key: String, val delta: Double, val hours: Double)

/** Desviación de la previsión frente a la boya en las últimas 24 h (`bias` > 0: la boya mide más). */
@Serializable
data class ForecastFit(val bias: Double, val mae: Double, val n: Int)

@Serializable
data class BuoyReading(
    val buoy: BuoyMeta,
    val t: Double,
    val h: Double,
    @SerialName("Tp") val tp: Double? = null,
    val dir: Double? = null,
    val water: Double? = null,
    val predicted: BuoyPrediction? = null,
    val trend: BuoyTrend? = null,
    /** Últimas 48 h medidas y previsión en la posición de la boya (de −48 h a +24 h). Solo en el detalle. */
    val history: List<List<Double?>> = emptyList(),
    val model: List<List<Double?>> = emptyList(),
    val fit: ForecastFit? = null,
) {
    val historySeries by lazy { history.toSeries() }
    val modelSeries by lazy { model.toSeries() }
}

@Serializable
data class BuoyResponse(val buoy: BuoyReading? = null)

@Serializable
data class Station(val name: String, val distKm: Double)

@Serializable
data class MeteoWind(val wind: Double? = null, val windDir: Double? = null, val gust: Double? = null, val t: Double, val station: Station)

@Serializable
data class MeteoAir(val air: Double? = null, val t: Double, val station: Station)

@Serializable
data class MeteoPressure(val pressure: Double? = null, val t: Double, val station: Station)

@Serializable
data class Meteo(val wind: MeteoWind? = null, val air: MeteoAir? = null, val pressure: MeteoPressure? = null)

@Serializable
data class Hour(
    val t: Double,
    val h: Double? = null,
    @SerialName("T") val period: Double? = null,
    val dir: Double? = null,
    val wind: Double? = null,
    val windDir: Double? = null,
    val score: Double,
)

@Serializable
data class DayCell(val t: Double, val score: Double)

@Serializable
data class BestHour(
    val t: Double,
    val score: Double,
    val h: Double? = null,
    val T: Double? = null,
    val wind: Double? = null,
    val windType: String? = null,
)

@Serializable
data class Day(
    val key: String,
    val label: String,
    val rise: Double,
    val set: Double,
    val cells: List<DayCell>,
    val maxH: Double? = null,
    val best: BestHour,
)

@Serializable
data class SpotDetail(
    val id: String,
    val name: String,
    val region: String,
    val tz: String,
    val lat: Double,
    val lon: Double,
    val score: Double,
    val now: Now,
    val tide: TideNow,
    val facing: Double,
    val tidePref: String,
    val updatedAt: Double,
    val forecastSource: String? = null,
    val sun: Sun? = null,
    val uv: UVToday? = null,
    val buoy: BuoyReading? = null,
    val meteo: Meteo? = null,
    val tideDay: TideDay,
    val hours: List<Hour>,
    val days: List<Day>,
)

/** Ajustes de avisos de un spot (equivale a `prefs` de la API): calidad mínima propia, solo con terral y franja horaria. */
@Serializable
data class AlertPref(val min: Int? = null, val offshore: Boolean? = null, val from: Int? = null, val to: Int? = null) {
    /** Sin ajustes propios: se usan los valores generales. */
    val isDefault get() = min == null && offshore != true && from == null && to == null

    /** Lo que se envía al servidor: sin valores por defecto, y la franja solo si es válida y distinta de 7-22. */
    val normalized: AlertPref
        get() {
            val validHours = from != null && to != null && from >= DEFAULT_FROM && to <= DEFAULT_TO && from < to &&
                !(from == DEFAULT_FROM && to == DEFAULT_TO)
            return AlertPref(
                min = min?.takeIf { it in 2..4 },
                offshore = if (offshore == true) true else null,
                from = if (validHours) from else null,
                to = if (validHours) to else null,
            )
        }

    companion object {
        const val DEFAULT_FROM = 7
        const val DEFAULT_TO = 22
    }
}

@Serializable
data class AlertState(
    val subscribed: Boolean = false,
    val spots: List<String> = emptyList(),
    val minScore: Double = 3.0,
    /** `null`: un servidor anterior a los ajustes por spot no envía `prefs` y entonces no se ofrecen en la pantalla. */
    val prefs: Map<String, AlertPref>? = null,
)
