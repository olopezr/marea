package es.marea.app.ui

import es.marea.app.data.Sun

import androidx.compose.ui.text.withStyle

import androidx.compose.ui.text.buildAnnotatedString

import androidx.compose.ui.text.SpanStyle

import androidx.compose.ui.geometry.CornerRadius

import androidx.compose.ui.geometry.Size

import androidx.compose.ui.geometry.Offset

import androidx.compose.foundation.Canvas

import androidx.compose.foundation.layout.offset

import es.marea.app.R

import es.marea.app.data.tr

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
import es.marea.app.data.WindType
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
            if (result == null) error = e.message ?: tr(R.string.error_connect)
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
            IconCircleButton(Icons.back, tr(R.string.back), onClick = onBack)
            Column(Modifier.weight(1f).semantics(mergeDescendants = true) { heading() }) {
                Text(meta?.name ?: "", style = Type.heading(21.sp), color = c.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(tr(R.string.detail_facing, meta?.region ?: "", Surf.cardinal(meta?.facing)), style = Type.body(13.sp), color = c.muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            val context = androidx.compose.ui.platform.LocalContext.current
            IconCircleButton(Icons.share, tr(R.string.detail_share), onClick = { shareSpot(context, result, meta, id) })
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
    item {
        val meta = app.api.spotById[id]
        val context = androidx.compose.ui.platform.LocalContext.current
        val c = LocalColors.current
        val webcam = meta?.webcam
        if (webcam != null) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Box(Modifier.weight(1f)) { AlertButton(app, id) }
                Row(
                    Modifier.weight(1f).height(48.dp).clip(RoundedCornerShape(14.dp))
                        .background(c.surface)
                        .border(1.5.dp, c.line, RoundedCornerShape(14.dp))
                        .clickable {
                            val intent = android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(webcam))
                            context.startActivity(intent)
                        }
                        .padding(horizontal = 16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally)
                ) {
                    Icon(Icons.video, tr(R.string.detail_webcamAria, meta.name), tint = c.ink, modifier = Modifier.size(18.dp))
                    Text(tr(R.string.detail_webcam), style = Type.bodySemibold(), color = c.ink)
                }
            }
        } else {
            AlertButton(app, id)
        }
    }
    item { BuoyPanel(s) }
    item {
        val meta = app.api.spotById[id]
        val p = Surf.power(n.h, n.period)
        val moon = Surf.moonPhase(System.currentTimeMillis().toDouble())
        val bs = Surf.bestSession(s, facing = meta?.facing ?: 0.0)
        val tiles: List<@Composable () -> Unit> = listOf(
            { Tile(tr(R.string.tile_swell), "${Surf.fmt(n.sh)} m · ${Surf.fmt(n.swellPeriod, 0)} s", help = "swell") { DirArrow(n.sDir, 13.dp); SubText(Surf.cardinal(n.sDir)) } },
            { Tile(tr(R.string.tile_wind), "${Surf.fmt(n.wind, 0)} kn", n.windDir, help = "wind") { SubText("${n.gust?.let { tr(R.string.gusts, Surf.fmt(it, 0)) + " · " } ?: ""}${Surf.cardinal(n.windDir)}") } },
            { Tile(tr(R.string.tile_tide), t.h?.let { "${Surf.fmt(it)} m ${if (t.rising == true) "↗" else "↘"}" } ?: "–", help = "tide") { SubText("${t.next?.let { "${it.word} ${Surf.hhmm(it.t, tz)}" } ?: ""}${t.coef?.let { " · " + tr(R.string.coef, it) } ?: ""}") } },
            { Tile(tr(R.string.tile_idealTide), Surf.tidePrefLabel(s.tidePref)) { SubText(Surf.idealTideText(s.tidePref, s.tideDay.ext, System.currentTimeMillis().toDouble(), s.tideDay.to, tz)) } },
            { Tile(tr(R.string.tile_energy), p?.let { "${Surf.fmt(it, if (it < 10) 1 else 0)} kW/m" } ?: "–", help = "energy") { SubText(p?.let(Surf::powerLabel) ?: "") } },
            { Tile(tr(R.string.tile_moon), "${moon.emoji} ${tr(moon.nameRes)}") { SubText("${moon.illumination}% · ${t.coef?.let { Surf.coefLabel(it).replaceFirstChar { c -> c.uppercase() } } ?: tr(moon.tideTypeRes)}") } },
            { Tile(tr(R.string.tile_water), "${Surf.fmt(water)} °C") { SubText(Surf.wetsuit(water)) } },
            { Tile(tr(R.string.tile_air), "${Surf.fmt(s.meteo?.air?.air ?: n.air, 0)} °C") { SubText(tr(if (s.meteo?.air != null) R.string.air_measured else R.string.air_forecast)) } },
            { Tile(tr(R.string.tile_uv), s.uv?.now?.let { "${it.roundToInt()} · ${Surf.uvLabel(it)}" } ?: "–") {
                SubText(s.uv?.let { tr(R.string.uv_max, it.max.roundToInt(), Surf.hour(it.maxT, tz), Surf.uvAdvice(it.max)) } ?: tr(R.string.uv_none))
            } },
            { Tile(tr(R.string.tile_bestSession), bs?.let { "${if (it.isTomorrow) "${tr(R.string.tomorrow)} " else ""}${Surf.hhmm(it.t, tz)} · ${Rating.of(it.score).label}" } ?: "–") {
                SubText(bs?.let { b ->
                    val wt = b.windType ?: "na"
                    "${Surf.fmt(b.h)} m · ${Surf.fmt(b.T, 0)} s · ${Surf.windPhrase(WindType(wt, ""), b.wind)}"
                } ?: "")
            } },
        )
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            tiles.chunked(2).forEach { pair ->
                // Misma altura para las dos fichas de cada fila.
                Row(Modifier.height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(10.dp)) { pair.forEach { Box(Modifier.weight(1f).fillMaxHeight()) { it() } } }
            }
            DaylightTile(s.sun, s.tideDay.from, s.tideDay.to, tz)
        }
    }
    item {
        Panel {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.weight(1f)) { PanelTitle(tr(R.string.tide_today)) }
                Text(tr(R.string.tide_slide), style = Type.body(12.sp), color = LocalColors.current.muted)
            }
            if (s.tideDay.series.size >= 4) TideChart(s.tideDay, s.sun, tz)
            else Text(tr(R.string.tide_none), color = LocalColors.current.muted)
            Text(tideNote(s), style = Type.body(13.sp), color = LocalColors.current.muted)
        }
    }
    s.buoy?.let { b -> if (b.historySeries.size >= 6 || b.modelSeries.isNotEmpty()) item { HistoryPanel(b) } }
    item {
        Panel {
            PanelTitle(tr(R.string.hours_title))
            val aria = tr(R.string.hours_aria)
            LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.semantics { contentDescription = aria }) {
                items(s.hours, key = { it.t }) { HourCell(it, tz) }
            }
        }
    }
    item {
        val c = LocalColors.current
        Panel {
            PanelTitle(tr(R.string.week_title, s.days.size))
            Text(tr(R.string.week_help), style = Type.body(13.sp), color = c.muted)
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
    item { Glossary() }
    item { LocationPanel(s.name, s.lat, s.lon) }
    item {
        Text(tr(R.string.updated, Surf.ago(s.updatedAt)), style = Type.body(13.sp), color = LocalColors.current.muted, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
    }
    item { Footer(app.api::legalUrl) }
}

private fun tideNote(s: SpotDetail): String {
    if (s.tide.reason == "no-port") return tr(R.string.tide_note_noPort)
    val port = s.tide.port
    if (s.tide.source != "ihm" || port == null) return tr(R.string.tide_note_down)
    val sb = StringBuilder(tr(R.string.tide_note_ihm, port.name, port.distKm.toInt()))
    s.tideDay.surge?.let { sb.append(tr(R.string.tide_note_surge, it.beach)) }
    s.tideDay.observed?.let { o ->
        sb.append(tr(R.string.tide_note_gauge, o.gauge))
        if (o.samePort != true) sb.append(tr(R.string.tide_note_neighbour, (o.distKm ?: 0.0).toInt()))
        sb.append(".")
    }
    return sb.append(tr(R.string.tide_note_coef)).toString()
}

@Composable
private fun SubText(text: String) = Text(text, style = Type.body(13.sp), color = LocalColors.current.muted)

@Composable
private fun Hero(s: SpotDetail) {
    val c = LocalColors.current
    val n = s.now; val r = Rating.of(s.score); val q = c.q(r)
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(c.ink).padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Eyebrow(tr(R.string.hero_now, Surf.hhmm(System.currentTimeMillis().toDouble(), s.tz)), mix(c.bg, 0.65f, c.ink))
        Row(verticalAlignment = Alignment.Bottom) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                // Mismo tamaño para todas las valoraciones: 26 sp es lo que cabe con "Muy bueno", la más larga,
                // en un móvil de 360 dp. Solo si aun así no cabe (olas de dos cifras) se reduce.
                val labelColor = mix(q, c.heroMix, c.bg)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    BasicText(
                        r.label, style = Type.display(26.sp), color = { labelColor }, maxLines = 1, softWrap = false,
                        autoSize = TextAutoSize.StepBased(minFontSize = 21.sp, maxFontSize = 26.sp),
                        modifier = Modifier.weight(1f, fill = false),
                    )
                    HelpButton("rating", c.bg)
                }
                ScoreBar(s.score, track = mix(c.bg, 0.22f, c.ink))
            }
            Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(Surf.fmt(n.h), style = Type.display(58.sp).copy(letterSpacing = (-2).sp), color = c.bg)
                Text("m", style = Type.body(16.sp), color = c.bg.copy(alpha = 0.7f), modifier = Modifier.padding(bottom = 8.dp))
            }
        }
        Text(tr(R.string.hero_line, Surf.fmt(n.period, 0), Surf.cardinal(n.dir), Surf.windPhrase(n.windType, n.wind)), style = Type.body(15.sp), color = mix(c.bg, 0.8f, c.ink))
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
                            app.show(tr(if (id in app.alerts.state.spots) R.string.toast_alertOn else R.string.toast_alertOffSpot))
                        } catch (e: Exception) {
                            app.show(e.message ?: tr(R.string.error_connect))
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
        Text(tr(if (on) R.string.alert_on else R.string.alert_off), style = Type.bodySemibold(), color = color)
    }
}

@Composable
private fun Tile(label: String, value: String, arrow: Double? = null, help: String? = null, sub: @Composable () -> Unit) {
    val c = LocalColors.current
    Column(
        Modifier.fillMaxWidth().fillMaxHeight().heightIn(min = 86.dp).clip(RoundedCornerShape(16.dp)).background(c.surface).padding(horizontal = 14.dp, vertical = 12.dp)
            .semantics(mergeDescendants = help == null) {},
        verticalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        // Misma altura con o sin botón de ayuda.
        Row(Modifier.height(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f)) { Eyebrow(label) }
            if (help != null) Box(Modifier.offset(x = 12.dp)) { HelpButton(help) }
        }
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
            .clearAndSetSemantics { contentDescription = tr(R.string.hour_a11y, Surf.hhmm(h.t, tz), r.label, Surf.fmt(h.h), Surf.fmt(h.period, 0), Surf.fmt(h.wind, 0)) },
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
            Text(tr(R.string.week_max), style = Type.body(11.sp), color = c.muted, maxLines = 1, modifier = Modifier.width(52.dp))
            Text(tr(R.string.week_best), maxLines = 1, style = Type.body(11.sp), color = c.muted, textAlign = TextAlign.End, modifier = Modifier.width(30.dp))
        }
        days.forEachIndexed { i, d -> WeekRow(d, i == 0 && d.rise < todayFrom + 86_400_000, tz, cols, now) }
    }
}

@Composable
private fun WeekRow(d: Day, isToday: Boolean, tz: String, cols: List<Int>, now: Double) {
    val c = LocalColors.current
    val name = if (isToday) tr(R.string.today) else Surf.dayLabel(d.rise, tz)
    Row(
        Modifier.clearAndSetSemantics { contentDescription = tr(R.string.week_a11y, name, Surf.fmt(d.maxH)) + (if (d.best.score >= 1) tr(R.string.week_a11yBest, Surf.hhmm(d.best.t, tz)) else "") },
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
            PanelTitle(tr(R.string.buoy_title))
            Text(tr(R.string.buoy_none), style = Type.body(13.sp), color = c.muted)
            return@Panel
        }
        val latest = listOfNotNull(b?.t, m?.wind?.t, m?.air?.t, m?.pressure?.t).maxOrNull() ?: 0.0
        Row(verticalAlignment = Alignment.CenterVertically) {
            Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) { PanelTitle(tr(R.string.buoy_title)); HelpButton("buoy") }
            LiveDot(b?.buoy?.fallback == true)
            Text("  ${Surf.hhmm(latest, s.tz)}", style = Type.mono(12.sp), color = c.muted)
        }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp), maxItemsInEachRow = 3) {
            val cell = Modifier.weight(1f)
            if (b != null) {
                Measure(tr(R.string.buoy_wave), cell) { Big("${Surf.fmt(b.h)} m") }
                Measure(tr(R.string.buoy_peak), cell) { Big("${Surf.fmt(b.tp, 0)} s") }
                Measure(tr(R.string.buoy_dir), cell) {
                    if (b.dir != null) { DirArrow(b.dir); Big(Surf.cardinal(b.dir)) }
                    else { val noDir = tr(R.string.buoy_noDir); Box(Modifier.semantics { contentDescription = noDir }) { Big("-") } }
                }
                b.trend?.let { tr0 ->
                    Measure(tr(R.string.buoy_trend), cell, tr(R.string.trend_detail, Surf.signed(tr0.delta), tr0.hours.toInt())) {
                        Text("${Surf.trendArrow(tr0.key)} ${Surf.trendLabel(tr0.key)}", style = Type.mono(17.sp), color = trendColor(tr0.key), maxLines = 1)
                    }
                }
                b.water?.let { w -> Measure(tr(R.string.buoy_water), cell) { Big("${Surf.fmt(w)} °C") } }
            }
            m?.wind?.let { w -> Measure(tr(R.string.buoy_wind), cell, w.gust?.let { tr(R.string.gusts, Surf.fmt(it, 0)) }) { Big("${Surf.fmt(w.wind, 0)} kn"); DirArrow(w.windDir) } }
            m?.air?.let { a -> Measure(tr(R.string.buoy_air), cell) { Big("${Surf.fmt(a.air)} °C") } }
            m?.pressure?.let { p -> Measure(tr(R.string.buoy_pressure), cell) { Big("${Surf.fmt(p.pressure, 0)} hPa") } }
        }
        if (b != null && b.buoy.far == true) {
            Note(tr(R.string.buoy_far, b.buoy.distKm.toInt()))
        } else if (b != null && b.buoy.fallback == true) {
            val closest = b.buoy.closest?.let { tr(R.string.buoy_closestDown, it.name, it.distKm.toInt()) } ?: tr(R.string.buoy_closestDownAnon)
            Note(closest + tr(R.string.buoy_next, b.buoy.name, b.buoy.distKm.toInt()))
        }
        val parts = mutableListOf<String>()
        b?.let { parts += tr(R.string.buoy_src_buoy, it.buoy.name, it.buoy.distKm.toInt()) }
        val st = m?.air?.station ?: m?.pressure?.station
        if (m?.wind != null) parts += tr(R.string.buoy_src_wind, m.wind.station.name, m.wind.station.distKm.toInt())
        else if (st != null) parts += tr(R.string.buoy_src_station, st.name, st.distKm.toInt())
        var sources = tr(R.string.buoy_sources, parts.joinToString(", "))
        if (b?.buoy?.deep == true && b.buoy.far != true) sources += tr(R.string.buoy_deep)
        Text(sources, style = Type.body(13.sp), color = c.muted)
        if (b != null) {
            HorizontalDivider(color = c.line)
            val p = b.predicted
            if (p != null) {
                val diff = b.h - p.h
                Text(
                    if (kotlin.math.abs(diff) < 0.2) tr(R.string.buoy_same, Surf.fmt(p.h))
                    else tr(if (diff > 0) R.string.buoy_more else R.string.buoy_less, Surf.fmt(kotlin.math.abs(diff)), Surf.fmt(p.h)),
                    style = Type.bodySemibold(13.sp), color = c.ink,
                )
            } else {
                Text(tr(R.string.buoy_noPred), style = Type.body(13.sp), color = c.muted)
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

/** Ficha "Luz solar": barra de 0 a 24 h con la noche, el día entre el amanecer y el atardecer y la hora actual. */
@Composable
private fun DaylightTile(sun: Sun?, from: Double, to: Double, tz: String) {
    val c = LocalColors.current
    val now = System.currentTimeMillis().toDouble()
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(c.surface).padding(horizontal = 14.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Eyebrow(tr(R.string.tile_firstLight))
        if (sun == null) { Text("–", style = Type.mono(17.sp), color = c.ink); return@Column }
        val len = Surf.daylight(sun.set - sun.rise)
        val aria = tr(R.string.sun_aria, Surf.hhmm(sun.rise, tz), Surf.hhmm(sun.set, tz), len)
        Column(Modifier.clearAndSetSemantics { contentDescription = aria }, verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Canvas(Modifier.fillMaxWidth().height(16.dp)) {
                fun x(t: Double) = (((t - from) / (to - from)).coerceIn(0.0, 1.0) * size.width).toFloat()
                val top = 2.dp.toPx(); val bar = 12.dp.toPx()
                drawRoundRect(c.surface2, Offset(0f, top), Size(size.width, bar), CornerRadius(bar / 2))
                drawRect(c.qFair.copy(alpha = 0.8f), Offset(x(sun.rise), top), Size(x(sun.set) - x(sun.rise), bar))
                listOf(sun.rise, sun.set).forEach { drawLine(c.qFair, Offset(x(it), 0f), Offset(x(it), size.height), strokeWidth = 2.dp.toPx()) }
                if (now >= from && now < to) {
                    drawCircle(c.surface, 6.dp.toPx(), Offset(x(now), top + bar / 2))
                    drawCircle(c.accent, 4.dp.toPx(), Offset(x(now), top + bar / 2))
                }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                listOf(0, 6, 12, 18, 24).forEach { Text("%02dh".format(it), style = Type.mono(10.sp), color = c.muted) }
            }
            // Hora arriba y "Amanecer" / "Atardecer" debajo.
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Column {
                    Text(Surf.hhmm(sun.rise, tz), style = Type.monoBold(15.sp), color = c.ink)
                    Text(tr(R.string.sun_rise), style = Type.body(13.sp), color = c.muted)
                    if (sun.dawn != null) {
                        Text("${tr(R.string.sun_dawn)}: ${Surf.hhmm(sun.dawn, tz)}", style = Type.mono(10.sp), color = c.muted)
                    }
                }
                Text(tr(R.string.sun_daylight, len), style = Type.body(13.sp), color = c.muted, textAlign = TextAlign.Center, modifier = Modifier.weight(1f))
                Column(horizontalAlignment = Alignment.End) {
                    Text(Surf.hhmm(sun.set, tz), style = Type.monoBold(15.sp), color = c.ink)
                    Text(tr(R.string.sun_set), style = Type.body(13.sp), color = c.muted)
                    if (sun.dusk != null) {
                        Text("${tr(R.string.sun_dusk)}: ${Surf.hhmm(sun.dusk, tz)}", style = Type.mono(10.sp), color = c.muted)
                    }
                }
            }
        }
    }
}

// Comparte el texto con el enlace y, si hay datos, la tarjeta de condiciones como imagen.
private fun shareSpot(context: android.content.Context, result: Cached<SpotDetail>?, meta: es.marea.app.data.Spot?, id: String) {
    val intent = android.content.Intent(android.content.Intent.ACTION_SEND).apply {
        putExtra(android.content.Intent.EXTRA_TITLE, tr(R.string.share_title, meta?.name ?: ""))
        putExtra(android.content.Intent.EXTRA_TEXT, shareText(result, meta, "https://marea.onrender.com/#/spot/$id"))
        type = "text/plain"
    }
    if (result != null && meta != null) runCatching {
        val uri = ShareCard.save(context, ShareCard.render(context, ShareCard.model(result.data, meta)), meta.id)
        intent.type = "image/png"
        intent.putExtra(android.content.Intent.EXTRA_STREAM, uri)
        intent.clipData = android.content.ClipData.newRawUri("", uri)
        intent.addFlags(android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION)
    } // si la tarjeta falla, se comparte solo el texto
    context.startActivity(android.content.Intent.createChooser(intent, tr(R.string.detail_share)))
}

private fun shareText(res: Cached<SpotDetail>?, meta: es.marea.app.data.Spot?, url: String): String {
    if (res == null || meta == null) return "${meta?.name ?: "Marea"} · Marea\n$url"
    val s = res.data; val n = s.now; val t = s.tide; val r = Rating.of(s.score)
    val tideStr = t.h?.let { "${Surf.fmt(it)} m ${if (t.rising == true) "↗" else "↘"}" } ?: "–"
    return tr(
        R.string.share_text,
        meta.name,
        Surf.fmt(n.h),
        Surf.fmt(n.period, 0),
        Surf.cardinal(n.dir),
        Surf.windPhrase(n.windType, n.wind),
        tideStr,
        r.label,
        url
    )
}
