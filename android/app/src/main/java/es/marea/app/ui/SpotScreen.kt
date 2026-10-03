package es.marea.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.wrapContentWidth
import androidx.compose.ui.draw.alpha
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsBottomHeight
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.TextAutoSize
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import es.marea.app.AppState
import es.marea.app.data.Cached
import es.marea.app.data.Day
import es.marea.app.data.Hour
import es.marea.app.data.Rating
import es.marea.app.data.SpotDetail
import es.marea.app.data.Surf
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

// Detalle de un spot (renderSpot en public/js/app.js).
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SpotScreen(app: AppState, id: String, onBack: () -> Unit) {
    val c = LocalColors.current
    val meta = app.api.spotById[id]
    val scope = rememberCoroutineScope()
    var result by remember { mutableStateOf<Cached<SpotDetail>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(false) }

    suspend fun load(force: Boolean) {
        loading = true
        try {
            result = app.api.spot(id, force); error = null
        } catch (e: Exception) {
            if (result == null) error = e.message ?: "Error"
        } finally {
            loading = false
        }
    }
    LaunchedEffect(id) {
        load(false)
        while (true) { delay(600_000); load(true) }
    }

    Column(Modifier.fillMaxSize().background(c.bg)) {
        Row(Modifier.statusBarsPadding().padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            IconCircleButton(Icons.back, "Volver a la lista", onClick = onBack)
            Column(Modifier.weight(1f).semantics(mergeDescendants = true) { heading() }) {
                Text(meta?.name ?: "", style = Type.heading(21.sp), color = c.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text("${meta?.region ?: ""} · playa orientada al ${Surf.cardinal(meta?.facing)}", style = Type.body(13.sp), color = c.muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            FavButton(id in app.favs) { app.toggleFav(id) }
        }
        PullToRefreshBox(isRefreshing = loading && result != null, onRefresh = { scope.launch { load(true) } }, modifier = Modifier.weight(1f)) {
            LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                val res = result
                when {
                    res != null -> detail(app, id, res)
                    error != null -> item { ErrorBox(error!!) }
                    else -> items(2) { SkeletonCard() }
                }
                item { Spacer(Modifier.windowInsetsBottomHeight(WindowInsets.navigationBars)) }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
private fun androidx.compose.foundation.lazy.LazyListScope.detail(app: AppState, id: String, res: Cached<SpotDetail>) {
    val s = res.data; val tz = s.tz; val n = s.now; val t = s.tide
    val water = s.buoy?.water ?: n.water
    item { DataBanners(res.ts, res.stale, res.offline, s.forecastSource) }
    item { Hero(s) }
    item { AlertButton(app, id) }
    item { BuoyPanel(s) }
    item {
        val tiles: List<@Composable () -> Unit> = listOf(
            { Tile("Mar de fondo", "${Surf.fmt(n.sh)} m · ${Surf.fmt(n.swellPeriod, 0)} s") { DirArrow(n.sDir, 13.dp); SubText(Surf.cardinal(n.sDir)) } },
            { Tile("Viento", "${Surf.fmt(n.wind, 0)} kn", n.windDir) { SubText("${n.gust?.let { "Rachas ${Surf.fmt(it, 0)} kn · " } ?: ""}${Surf.cardinal(n.windDir)}") } },
            { Tile("Marea", t.h?.let { "${Surf.fmt(it)} m ${if (t.rising == true) "↗" else "↘"}" } ?: "–") { SubText("${t.next?.let { "${it.word} ${Surf.hhmm(it.t, tz)}" } ?: ""}${t.coef?.let { " · Coef. $it" } ?: ""}") } },
            { Tile("Marea ideal", Surf.tidePrefLabel(s.tidePref).replaceFirstChar { it.uppercase() }) { SubText(Surf.idealTideText(s.tidePref, s.tideDay.ext, System.currentTimeMillis().toDouble(), s.tideDay.to, tz)) } },
            { Tile("Agua", "${Surf.fmt(water)} °C") { SubText(Surf.wetsuit(water)) } },
            { Tile("Aire", "${Surf.fmt(s.meteo?.air?.air ?: n.air, 0)} °C") { SubText(if (s.meteo?.air != null) "Medida en una estación cercana" else "Previsión") } },
            { Tile("Índice UV", s.uv?.now?.let { "${it.roundToInt()} · ${Surf.uvLabel(it)}" } ?: "–") {
                SubText(s.uv?.let { "Máx. ${it.max.roundToInt()} a las ${Surf.hour(it.maxT, tz)}h · ${Surf.uvAdvice(it.max)}" } ?: "Sin previsión ahora mismo")
            } },
            { Tile("Primera luz", s.sun?.let { Surf.hhmm(it.rise, tz) } ?: "–") { SubText(s.sun?.let { "Puesta ${Surf.hhmm(it.set, tz)}" } ?: "") } },
        )
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            tiles.chunked(2).forEach { pair ->
                // Misma altura para las dos fichas de cada fila.
                Row(Modifier.height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(10.dp)) { pair.forEach { Box(Modifier.weight(1f).fillMaxHeight()) { it() } } }
            }
        }
    }
    item {
        Panel {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.weight(1f)) { PanelTitle("Marea de hoy") }
                Text("Desliza sobre la curva", style = Type.body(12.sp), color = LocalColors.current.muted)
            }
            if (s.tideDay.series.size >= 4) TideChart(s.tideDay, s.sun, tz)
            else Text("Sin datos de marea para hoy.", color = LocalColors.current.muted)
            Text(tideNote(s), style = Type.body(13.sp), color = LocalColors.current.muted)
        }
    }
    item {
        Panel {
            PanelTitle("Próximas 24 horas")
            LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.semantics { contentDescription = "Previsión por horas" }) {
                items(s.hours, key = { it.t }) { HourCell(it, tz) }
            }
        }
    }
    item {
        val c = LocalColors.current
        Panel {
            PanelTitle("${s.days.size} días")
            Text("Cada bloque es una hora de luz, coloreado según la calidad. Las horas que ya han pasado hoy aparecen atenuadas. A la derecha, la ola máxima del día y su mejor hora.", style = Type.body(13.sp), color = c.muted)
            WeekChart(s.days, tz, s.tideDay.from)
            // En una sola línea repartida a lo ancho: a 12 sp cabe incluso en un móvil de 360 dp.
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Rating.entries.forEach { r ->
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                        QualityCell(r.min, Modifier.size(10.dp)); Text(r.label, style = Type.body(12.sp), color = c.muted, maxLines = 1, softWrap = false)
                    }
                }
            }
        }
    }
    item { LocationPanel(s.name, s.lat, s.lon) }
    item {
        Text("Actualizado ${Surf.ago(s.updatedAt)}.", style = Type.body(13.sp), color = LocalColors.current.muted, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
    }
    item { Footer(app.api::legalUrl) }
}

private fun tideNote(s: SpotDetail): String {
    if (s.tide.reason == "no-port") return "El Instituto Hidrográfico de la Marina no publica mareas de esta zona (en el Mediterráneo la marea es de pocos centímetros). Es una estimación del modelo de Open-Meteo."
    val port = s.tide.port
    if (s.tide.source != "ihm" || port == null) return "Estimación del modelo de Open-Meteo: el servicio oficial de mareas no responde ahora mismo y puede desviarse."
    val sb = StringBuilder("Predicción oficial del Instituto Hidrográfico de la Marina para ${port.name} (a ${port.distKm.toInt()} km), alturas sobre el cero hidrográfico del puerto.")
    s.tideDay.surge?.let { sb.append(" Efecto del viento y la presión en el nivel del mar: previsión de Puertos del Estado para ${it.beach}.") }
    s.tideDay.observed?.let { o ->
        sb.append(" Nivel medido por el mareógrafo de ${o.gauge}")
        if (o.samePort != true) sb.append(", en un puerto vecino a ${(o.distKm ?: 0.0).toInt()} km (la marea es prácticamente la misma)")
        sb.append(".")
    }
    return sb.append(" El coeficiente es una estimación a partir de la carrera de cada marea.").toString()
}

@Composable
private fun SubText(text: String) = Text(text, style = Type.body(13.sp), color = LocalColors.current.muted)

@Composable
private fun Hero(s: SpotDetail) {
    val c = LocalColors.current
    val n = s.now; val r = Rating.of(s.score); val q = c.q(r)
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(c.ink).padding(18.dp).semantics(mergeDescendants = true) {},
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Eyebrow("Previsión ahora · ${Surf.hhmm(System.currentTimeMillis().toDouble(), s.tz)}", mix(c.bg, 0.65f, c.ink))
        Row(verticalAlignment = Alignment.Bottom) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                // Mismo tamaño para todas las valoraciones: 26 sp es lo que cabe con "Muy bueno", la más larga,
                // en un móvil de 360 dp. Solo si aun así no cabe (olas de dos cifras) se reduce.
                val labelColor = mix(q, c.heroMix, c.bg)
                BasicText(
                    r.label, style = Type.display(26.sp), color = { labelColor }, maxLines = 1, softWrap = false,
                    autoSize = TextAutoSize.StepBased(minFontSize = 21.sp, maxFontSize = 26.sp),
                )
                ScoreBar(s.score, track = mix(c.bg, 0.22f, c.ink))
            }
            Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(Surf.fmt(n.h), style = Type.display(58.sp).copy(letterSpacing = (-2).sp), color = c.bg)
                Text("m", style = Type.body(16.sp), color = c.bg.copy(alpha = 0.7f), modifier = Modifier.padding(bottom = 8.dp))
            }
        }
        Text("${Surf.fmt(n.period, 0)} s del ${Surf.cardinal(n.dir)} · ${Surf.windPhrase(n.windType, n.wind)}", style = Type.body(15.sp), color = mix(c.bg, 0.8f, c.ink))
    }
}

@Composable
private fun AlertButton(app: AppState, id: String) {
    val c = LocalColors.current
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    val on = id in app.alerts.state.spots
    val permission = rememberNotificationPermission()
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(c.surface)
            .border(1.5.dp, if (on) c.accent else c.line, RoundedCornerShape(14.dp))
            .clickable(enabled = !busy) {
                busy = true
                permission {
                    scope.launch {
                        try {
                            app.alerts.toggle(id)
                            app.show(if (id in app.alerts.state.spots) "Te avisaremos cuando tus spots estén en buenas condiciones" else "Avisos desactivados para este spot")
                        } catch (e: Exception) {
                            app.show(e.message ?: "Error")
                        }
                        busy = false
                    }
                }
            }
            .padding(vertical = 13.dp, horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        val color = (if (on) c.accentText else c.ink).copy(alpha = if (busy) 0.6f else 1f)
        Icon(if (on) Icons.bellOn else Icons.bell, null, tint = color, modifier = Modifier.size(20.dp))
        Text(if (on) "Avisos activados" else "Activar avisos", style = Type.bodySemibold(), color = color)
    }
}

@Composable
private fun Tile(label: String, value: String, arrow: Double? = null, sub: @Composable () -> Unit) {
    val c = LocalColors.current
    Column(
        Modifier.fillMaxWidth().fillMaxHeight().heightIn(min = 86.dp).clip(RoundedCornerShape(16.dp)).background(c.surface).padding(horizontal = 14.dp, vertical = 12.dp)
            .semantics(mergeDescendants = true) {},
        verticalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        Eyebrow(label)
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(value, style = Type.mono(17.sp), color = c.ink, maxLines = 1)
            DirArrow(arrow)
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) { sub() }
    }
}

@Composable
private fun HourCell(h: Hour, tz: String) {
    val c = LocalColors.current
    val r = Rating.of(h.score)
    Column(
        Modifier.width(52.dp).clip(RoundedCornerShape(12.dp)).background(c.bg).padding(vertical = 8.dp, horizontal = 4.dp)
            .clearAndSetSemantics { contentDescription = "${Surf.hhmm(h.t, tz)}: ${r.label}, ${Surf.fmt(h.h)} metros, ${Surf.fmt(h.period, 0)} segundos, viento ${Surf.fmt(h.wind, 0)} nudos" },
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        Text("${Surf.hour(h.t, tz)}h", style = Type.body(12.5.sp), color = c.muted)
        QualityCell(h.score, Modifier.fillMaxWidth().height(6.dp))
        Text(Surf.fmt(h.h), style = Type.mono(15.sp), color = c.ink)
        Text("${Surf.fmt(h.period, 0)} s", style = Type.body(12.5.sp), color = c.ink)
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(2.dp)) {
            DirArrow(h.windDir, 12.dp); Text(Surf.fmt(h.wind, 0), style = Type.body(12.5.sp), color = c.ink)
        }
    }
}

/**
 * Tabla de días: todas las filas comparten las mismas columnas horarias (la misma hora queda en la
 * misma columna cada día), con las horas encima y cabeceras para la ola máxima y la mejor hora.
 */
@Composable
private fun WeekChart(days: List<Day>, tz: String, todayFrom: Double) {
    val c = LocalColors.current
    val now = System.currentTimeMillis().toDouble()
    val hours = days.flatMap { d -> d.cells.map { Surf.hour(it.t, tz).toInt() } }
    val cols = if (hours.isEmpty()) emptyList() else (hours.min()..hours.max()).toList()
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        // Cabecera: una hora sí y otra no, centrada sobre su columna.
        Row(Modifier.clearAndSetSemantics {}, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Spacer(Modifier.width(52.dp))
            Row(Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                cols.forEach { h ->
                    Box(Modifier.weight(1f), contentAlignment = Alignment.Center) {
                        if ((h - cols.first()) % 2 == 0) Text("%02dh".format(h), style = Type.mono(10.sp), color = c.muted, maxLines = 1, softWrap = false, modifier = Modifier.wrapContentWidth(unbounded = true))
                    }
                }
            }
            Text("Ola máx.", style = Type.body(11.sp), color = c.muted, modifier = Modifier.width(52.dp))
            Text("Mejor", style = Type.body(11.sp), color = c.muted, textAlign = TextAlign.End, modifier = Modifier.width(30.dp))
        }
        days.forEachIndexed { i, d -> WeekRow(d, i == 0 && d.rise < todayFrom + 86_400_000, tz, cols, now) }
    }
}

@Composable
private fun WeekRow(d: Day, isToday: Boolean, tz: String, cols: List<Int>, now: Double) {
    val c = LocalColors.current
    val name = if (isToday) "Hoy" else d.label
    Row(
        Modifier.clearAndSetSemantics { contentDescription = "$name: ola máxima ${Surf.fmt(d.maxH)} metros${if (d.best.score >= 1) ", mejor hora ${Surf.hhmm(d.best.t, tz)}" else ""}" },
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(name, style = Type.bodySemibold(14.sp), color = c.ink, modifier = Modifier.width(52.dp))
        Row(Modifier.weight(1f).height(20.dp), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
            cols.forEach { h ->
                val cell = d.cells.firstOrNull { Surf.hour(it.t, tz).toInt() == h }
                if (cell != null) QualityCell(cell.score, Modifier.weight(1f).fillMaxSize().alpha(if (isToday && cell.t + 3_600_000 <= now) 0.35f else 1f))
                else Spacer(Modifier.weight(1f))
            }
        }
        Text("${Surf.fmt(d.maxH)} m", style = Type.monoBold(13.sp), color = c.ink, modifier = Modifier.width(52.dp))
        Text(if (d.best.score >= 1) "${Surf.hour(d.best.t, tz)}h" else "–", style = Type.body(13.sp), color = c.muted, textAlign = TextAlign.End, modifier = Modifier.width(30.dp))
    }
}

// ---------- Medido en el mar ----------

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun BuoyPanel(s: SpotDetail) {
    val c = LocalColors.current
    val b = s.buoy; val m = s.meteo
    Panel {
        if (b == null && m == null) {
            PanelTitle("Medido en el mar")
            Text("No hay boyas ni estaciones de Puertos del Estado operativas cerca de este spot. Se muestra solo la previsión.", style = Type.body(13.sp), color = c.muted)
            return@Panel
        }
        val latest = listOfNotNull(b?.t, m?.wind?.t, m?.air?.t, m?.pressure?.t).maxOrNull() ?: 0.0
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f)) { PanelTitle("Medido en el mar") }
            LiveDot(b?.buoy?.fallback == true)
            Text("  ${Surf.hhmm(latest, s.tz)}", style = Type.mono(12.sp), color = c.muted)
        }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp), maxItemsInEachRow = 3) {
            val cell = Modifier.weight(1f)
            if (b != null) {
                Measure("Ola", cell) { Big("${Surf.fmt(b.h)} m") }
                Measure("Periodo pico", cell) { Big("${Surf.fmt(b.tp, 0)} s") }
                Measure("Dirección", cell) {
                    if (b.dir != null) { DirArrow(b.dir); Big(Surf.cardinal(b.dir)) }
                    else Box(Modifier.semantics { contentDescription = "Esta boya no mide dirección" }) { Big("-") }
                }
                b.water?.let { w -> Measure("Agua", cell) { Big("${Surf.fmt(w)} °C") } }
            }
            m?.wind?.let { w -> Measure("Viento", cell, w.gust?.let { "Rachas ${Surf.fmt(it, 0)} kn" }) { Big("${Surf.fmt(w.wind, 0)} kn"); DirArrow(w.windDir) } }
            m?.air?.let { a -> Measure("Aire", cell) { Big("${Surf.fmt(a.air)} °C") } }
            m?.pressure?.let { p -> Measure("Presión", cell) { Big("${Surf.fmt(p.pressure, 0)} hPa") } }
        }
        if (b != null && b.buoy.far == true) {
            Note("No hay ninguna boya a menos de 100 km. Esta es la de aguas profundas más cercana, a ${b.buoy.distKm.toInt()} km: indica el mar de fondo que llega a la zona, no el oleaje en la playa.")
        } else if (b != null && b.buoy.fallback == true) {
            val closest = b.buoy.closest?.let { "La boya más cercana a esta playa, ${it.name} (a ${it.distKm.toInt()} km), no envía datos ahora." }
                ?: "La boya más cercana a esta playa no envía datos ahora."
            Note("$closest Se muestra la siguiente, ${b.buoy.name} (a ${b.buoy.distKm.toInt()} km): puede no reflejar bien las condiciones de esta playa.")
        }
        val parts = mutableListOf<String>()
        b?.let { parts += "boya ${it.buoy.name} (${it.buoy.distKm.toInt()} km)" }
        val st = m?.air?.station ?: m?.pressure?.station
        if (m?.wind != null) parts += "viento en ${m.wind.station.name} (${m.wind.station.distKm.toInt()} km)"
        else if (st != null) parts += "estación ${st.name} (${st.distKm.toInt()} km)"
        var sources = "Datos de Puertos del Estado: ${parts.joinToString(", ")}."
        if (b?.buoy?.deep == true && b.buoy.far != true) sources += " La boya está en aguas profundas: en la orilla las olas suelen llegar más pequeñas."
        Text(sources, style = Type.body(13.sp), color = c.muted)
        if (b != null) {
            HorizontalDivider(color = c.line)
            val p = b.predicted
            if (p != null) {
                val diff = b.h - p.h
                Text(
                    if (kotlin.math.abs(diff) < 0.2) "La boya mide lo mismo que preveía el modelo (${Surf.fmt(p.h)} m)."
                    else "La boya mide ${Surf.fmt(kotlin.math.abs(diff))} m ${if (diff > 0) "más" else "menos"} de lo que preveía el modelo (${Surf.fmt(p.h)} m).",
                    style = Type.bodySemibold(13.sp), color = c.ink,
                )
            } else {
                Text("Puertos del Estado no publica predicción para esta boya.", style = Type.body(13.sp), color = c.muted)
            }
        }
    }
}

@Composable
private fun Big(text: String) = Text(text, style = Type.mono(17.sp), color = LocalColors.current.ink)

@Composable
private fun Measure(label: String, modifier: Modifier, sub: String? = null, value: @Composable () -> Unit) {
    Column(modifier.semantics(mergeDescendants = true) {}, verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Eyebrow(label)
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) { value() }
        sub?.let { Text(it, style = Type.body(13.sp), color = LocalColors.current.muted) }
    }
}

@Composable
private fun Note(text: String) {
    val c = LocalColors.current
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(mix(c.qFair, 0.16f, c.surface)).padding(horizontal = 10.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Box(Modifier.padding(top = 6.dp)) { LiveDot(off = true) }
        Text(text, style = Type.body(13.sp), color = c.ink)
    }
}
