package es.marea.app.ui

import androidx.compose.ui.text.style.TextOverflow

import es.marea.app.R

import es.marea.app.data.tr

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.windowInsetsBottomHeight
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
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
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import es.marea.app.AppState
import es.marea.app.ListFilter
import es.marea.app.data.BuoyReading
import es.marea.app.data.Cached
import es.marea.app.data.Overview
import es.marea.app.data.Rating
import es.marea.app.data.SpotSummary
import es.marea.app.data.Surf
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

// Lista de spots: filtro, búsqueda, frase destacada y tarjetas (renderHome en public/js/app.js).
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ListScreen(app: AppState, openSpot: (String) -> Unit, openAlerts: () -> Unit, openMap: () -> Unit) {
    val c = LocalColors.current
    val scope = rememberCoroutineScope()
    var result by remember { mutableStateOf<Cached<Overview>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(false) }

    suspend fun load(force: Boolean) {
        if (app.filter == ListFilter.Near) app.locate()
        loading = true
        try {
            result = app.api.overview(force)
            error = null
        } catch (e: Exception) {
            if (result == null) error = e.message ?: tr(R.string.error_connect)
        } finally {
            loading = false
        }
    }

    val locationPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) scope.launch { app.locate() }
    }

    LaunchedEffect(Unit) {
        load(false)
        // Refresco automático cada 10 minutos mientras la pantalla está visible.
        while (true) { delay(600_000); load(true) }
    }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { scope.launch { load(false) } }

    data class Row(val s: SpotSummary, val dist: Double?)
    val pos = app.position
    val rows = result?.data?.spots.orEmpty().map { s -> Row(s, pos?.let { Surf.km(it.latitude, it.longitude, s.lat, s.lon) }) }
    val q = app.query.trim()
    val shown = rows
        .filter { app.filter != ListFilter.Fav || it.s.id in app.favs }
        .filter { q.isEmpty() || Surf.matches(it.s.name, it.s.region, q) }
        .let { list -> if (app.filter == ListFilter.Near && pos != null) list.sortedBy { it.dist } else list.sortedByDescending { it.s.score } }

    Column(Modifier.fillMaxSize().background(c.bg)) {
        // ---------- Cabecera ----------
        Column(Modifier.background(c.bg).statusBarsPadding().padding(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Logo()
                // El nombre nunca se parte; lo que se recorta es la hora de actualización.
                Text("Marea", style = Type.display(21.sp), color = c.ink, maxLines = 1, softWrap = false)
                Text(
                    result?.let { Surf.ago(it.data.updatedAt).replaceFirstChar { ch -> ch.uppercase() } } ?: tr(R.string.loading),
                    style = Type.body(12.5.sp), color = c.muted, maxLines = 1, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.End,
                    modifier = Modifier.weight(1f),
                )
                IconCircleButton(Icons.map, tr(R.string.map_title), onClick = openMap)
                IconCircleButton(if (app.alerts.state.spots.isEmpty()) Icons.bell else Icons.bellOn, tr(R.string.alerts), on = app.alerts.state.spots.isNotEmpty(), onClick = openAlerts)
                val spin = rememberInfiniteTransition(label = "spin").animateFloat(0f, 360f, infiniteRepeatable(tween(800, easing = LinearEasing), RepeatMode.Restart), label = "r")
                Box(Modifier.rotate(if (loading) spin.value else 0f)) {
                    IconCircleButton(Icons.refresh, tr(R.string.refresh)) { scope.launch { load(true) } }
                }
            }
            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                ListFilter.entries.forEachIndexed { i, f ->
                    SegmentedButton(
                        selected = app.filter == f,
                        onClick = {
                            app.chooseFilter(f)
                            if (f == ListFilter.Near) {
                                if (app.hasLocationPermission()) scope.launch { app.locate() }
                                else locationPermission.launch(Manifest.permission.ACCESS_COARSE_LOCATION)
                            }
                        },
                        shape = SegmentedButtonDefaults.itemShape(i, ListFilter.entries.size),
                        icon = {},
                        colors = SegmentedButtonDefaults.colors(
                            activeContainerColor = c.surface, activeContentColor = c.ink, inactiveContainerColor = c.surface2,
                            inactiveContentColor = c.muted, activeBorderColor = c.line, inactiveBorderColor = c.line,
                        ),
                    ) { Text(f.label, style = Type.bodySemibold(13.5.sp)) }
                }
            }
            SearchField(app.query, { app.query = it })
        }

        // ---------- Contenido ----------
        PullToRefreshBox(isRefreshing = loading && result != null, onRefresh = { scope.launch { load(true) } }, modifier = Modifier.weight(1f)) {
            LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                val res = result
                if (res != null) {
                    item { DataBanners(res.ts, res.stale, res.offline, res.data.forecastSource) }
                    val best = rows.maxByOrNull { it.s.score }?.s
                    if (app.filter == ListFilter.All && q.isEmpty() && best != null) item {
                        Text(
                            buildAnnotatedString {
                                append(tr(R.string.list_bestPrefix))
                                withStyle(SpanStyle(color = c.ink, fontWeight = FontWeight.SemiBold, textDecoration = TextDecoration.Underline)) { append(best.name) }
                                append(tr(R.string.list_bestSuffix, Surf.fmt(best.now.h), Surf.fmt(best.now.period, 0), Surf.windPhrase(best.now.windType, best.now.wind)))
                            },
                            style = Type.body(15.sp), color = c.muted, modifier = Modifier.clickable { openSpot(best.id) }.padding(horizontal = 2.dp),
                        )
                    }
                    if (q.isNotEmpty() && shown.isNotEmpty()) item {
                        Text(tr(if (shown.size == 1) R.string.list_results_one else R.string.list_results_other, shown.size, q), style = Type.body(15.sp), color = c.muted)
                    }
                    if (app.filter == ListFilter.Near && pos == null) item { Banner(tr(R.string.list_locationNeeded)) }
                    if (shown.isEmpty()) item {
                        EmptyState(q, if (app.filter == ListFilter.Fav) rows.count { Surf.matches(it.s.name, it.s.region, q) } else 0) { app.chooseFilter(ListFilter.All) }
                    }
                    items(shown, key = { it.s.id }) { row -> SpotCard(app, row.s, row.dist) { openSpot(row.s.id) } }
                } else if (error != null) {
                    item { ErrorBox(error!!) }
                } else {
                    items(4) { SkeletonCard() }
                }
                item { Footer(app.api::legalUrl) }
                item { Spacer(Modifier.windowInsetsBottomHeight(WindowInsets.navigationBars)) }
            }
        }
    }
}

@Composable
private fun SearchField(value: String, onChange: (String) -> Unit) {
    val c = LocalColors.current
    var focused by remember { mutableStateOf(false) }
    val focus = remember { FocusRequester() }
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(c.surface)
            .border(1.5.dp, if (focused) c.ink else c.line, RoundedCornerShape(12.dp))
            // Toda la caja activa el buscador, no solo la línea de texto.
            .clickable(indication = null, interactionSource = null) { focus.requestFocus() },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.search, null, tint = c.muted, modifier = Modifier.padding(start = 12.dp).size(18.dp))
        Box(Modifier.weight(1f).padding(horizontal = 10.dp, vertical = 12.dp)) {
            if (value.isEmpty()) Text(tr(R.string.search_placeholder), style = Type.body(), color = c.muted)
            BasicTextField(
                value, onChange, singleLine = true, textStyle = Type.body().copy(color = c.ink), cursorBrush = SolidColor(c.ink),
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.None, autoCorrectEnabled = false, imeAction = ImeAction.Search),
                modifier = Modifier.fillMaxWidth().focusRequester(focus).onFocusChanged { focused = it.isFocused }.semantics { contentDescription = tr(R.string.search_placeholder) },
            )
        }
        if (value.isNotEmpty()) {
            Box(Modifier.size(48.dp).clip(RoundedCornerShape(24.dp)).clickable(role = Role.Button) { onChange("") }.semantics { contentDescription = tr(R.string.search_clear) }, contentAlignment = Alignment.Center) {
                Icon(Icons.clear, null, tint = c.muted, modifier = Modifier.size(18.dp))
            }
        }
    }
}

@Composable
private fun EmptyState(q: String, elsewhere: Int, showAll: () -> Unit) {
    val c = LocalColors.current
    Column(Modifier.fillMaxWidth().padding(vertical = 48.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (q.isEmpty()) {
            Text(tr(R.string.empty_favs), style = Type.body(), color = c.ink)
            Text(tr(R.string.empty_favsHint), style = Type.body(13.sp), color = c.muted)
        } else {
            Text(tr(R.string.empty_noMatch, q), style = Type.body(), color = c.ink, textAlign = TextAlign.Center)
            if (elsewhere > 0) GhostButton(tr(if (elsewhere == 1) R.string.empty_seeAll_one else R.string.empty_seeAll_other, elsewhere), onClick = showAll)
            else Text(tr(R.string.empty_hint), style = Type.body(13.sp), color = c.muted, textAlign = TextAlign.Center)
        }
    }
}

// ---------- Tarjeta ----------

@Composable
private fun SpotCard(app: AppState, s: SpotSummary, dist: Double?, onOpen: () -> Unit) {
    val c = LocalColors.current
    val n = s.now; val t = s.tide
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(c.surface).clickable(onClickLabel = tr(R.string.card_open, s.name), onClick = onOpen).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(verticalAlignment = Alignment.Top) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(s.name, style = Type.heading(22.sp), color = c.ink)
                Text(s.region + (dist?.let { " · ${it.roundToInt()} km" } ?: ""), style = Type.body(13.sp), color = c.muted)
            }
            Box(Modifier.offset(x = 12.dp, y = (-12).dp)) { FavButton(s.id in app.favs) { app.toggleFav(s.id) } }
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) { RatingChip(Rating.of(s.score)); ScoreBar(s.score) }
        Row {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Metric(tr(R.string.metric_wave)) { Num(n.h); UnitText("m") }
                Metric(tr(R.string.metric_wind)) { Num(n.wind, 0); UnitText("kn"); WindTypePill(n.windType.key, Surf.windLabel(n.windType.key)) }
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Metric(tr(R.string.metric_period)) { Num(n.period, 0); UnitText("s"); DirArrow(n.dir) }
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Eyebrow(tr(R.string.metric_tide))
                    Text(when (t.rising) { null -> "–"; true -> tr(R.string.tide_rising); false -> tr(R.string.tide_falling) }, style = Type.body(15.sp), color = c.ink)
                    t.next?.let { Text("${it.word} ${Surf.hhmm(it.t, s.tz)}", style = Type.body(13.sp), color = c.muted) }
                }
            }
        }
        HorizontalDivider(color = c.line)
        BuoyLine(app, s.id, s.tz)
    }
}

@Composable
private fun Metric(label: String, value: @Composable () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Eyebrow(label)
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) { value() }
    }
}

@Composable
private fun Num(v: Double?, d: Int = 1) = Text(Surf.fmt(v, d), style = Type.mono(18.5.sp), color = LocalColors.current.ink)

@Composable
private fun UnitText(u: String) = Text(u, style = Type.body(15.sp), color = LocalColors.current.ink)

// Línea de la boya: se pide cuando la tarjeta aparece (LazyColumn) y como mucho 3 a la vez.
@Composable
private fun BuoyLine(app: AppState, spotId: String, tz: String) {
    val c = LocalColors.current
    var state by remember(spotId) { mutableStateOf<Any?>("loading") }
    LaunchedEffect(spotId) {
        state = try { app.api.buoy(spotId).data.buoy ?: "none" } catch (e: Exception) { "failed" }
    }
    when (val s = state) {
        is BuoyReading -> {
            val off = s.buoy.fallback == true
            Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Box(Modifier.padding(top = 6.dp)) { LiveDot(off) }
                Text(
                    buildAnnotatedString {
                        withStyle(SpanStyle(color = c.ink)) { append(tr(R.string.buoyline_name, s.buoy.name) + (if (off) tr(R.string.buoyline_away, s.buoy.distKm.toInt()) else "") + ": ") }
                        withStyle(SpanStyle(color = c.ink, fontFamily = Fonts.monoBold)) { append("${Surf.fmt(s.h)} m") }
                        withStyle(SpanStyle(color = c.ink)) {
                            if (s.tp != null) append(" · ${Surf.fmt(s.tp, 0)} s")
                            if (s.dir != null) append(" ${Surf.cardinal(s.dir)}")
                        }
                        s.trend?.let { tr0 ->
                            withStyle(SpanStyle(color = trendColor(tr0.key))) { append(" · ${Surf.trendArrow(tr0.key)} ${Surf.trendLabel(tr0.key)}") }
                        }
                        withStyle(SpanStyle(color = c.muted)) {
                            if (s.predicted != null) append(" · " + tr(R.string.buoyline_pred, Surf.fmt(s.predicted.h)))
                            append(" · ${Surf.hhmm(s.t, tz)}")
                        }
                    },
                    style = Type.body(13.sp),
                )
            }
        }
        "none" -> Text(tr(R.string.buoyline_none), style = Type.body(13.sp), color = c.muted)
        "failed" -> Text(tr(R.string.buoyline_failed), style = Type.body(13.sp), color = c.muted)
        else -> Text(tr(R.string.buoyline_loading), style = Type.body(13.sp), color = c.muted)
    }
}
