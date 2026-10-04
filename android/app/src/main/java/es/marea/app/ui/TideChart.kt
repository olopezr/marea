package es.marea.app.ui

import es.marea.app.R

import es.marea.app.data.tr

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.setProgress
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import es.marea.app.data.SeriesPoint
import es.marea.app.data.Sun
import es.marea.app.data.Surf
import es.marea.app.data.TideDay
import kotlin.math.abs

// Curva "Marea de hoy" con cursor deslizable (public/js/tidechart.js): al arrastrar muestra la hora,
// la altura, si sube o baja, el coeficiente, el efecto del viento y la presión y el nivel medido.
private const val W = 340f
private const val H = 176f
private const val TOP = 26f
private const val BOTTOM = 40f
private const val STEP = 15 * 60_000.0

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun TideChart(day: TideDay, sun: Sun?, tz: String, now: Double = System.currentTimeMillis().toDouble()) {
    val c = LocalColors.current
    val haptics = LocalHapticFeedback.current
    val measurer = rememberTextMeasurer()
    fun clamp(t: Double) = t.coerceIn(day.from, day.to - 60_000)
    val inDay = now >= day.from && now < day.to
    var current by remember(day) { mutableDoubleStateOf(clamp(if (inDay) now else day.from + 12 * 3_600_000)) }
    fun move(t: Double) {
        val next = clamp(t)
        if ((next / STEP).toInt() != (current / STEP).toInt()) haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
        current = next
    }

    val pts = day.series
    val obs = day.observed?.series.orEmpty()
    val vals = pts.map { it.v } + obs.map { it.v }
    val min = (vals.minOrNull() ?: 0.0) - 0.2
    val max = (vals.maxOrNull() ?: 1.0) + 0.2
    fun x(t: Double) = ((t - day.from) / (day.to - day.from) * W).toFloat()
    fun y(v: Double) = (TOP + (1 - (v - min) / (max - min)) * (H - TOP - BOTTOM)).toFloat()
    val extremes = day.ext.filter { it.t >= day.from && it.t < day.to }
    val at = Surf.tideAt(pts, current)

    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Readout(day, tz, current, now)
        Canvas(
            Modifier.fillMaxWidth().aspectRatio(W / H)
                .pointerInput(day) {
                    detectTapGestures { o -> move(day.from + o.x / size.width * (day.to - day.from)) }
                }
                .pointerInput(day) {
                    // Solo arrastre horizontal: el desplazamiento vertical sigue moviendo la pantalla.
                    detectHorizontalDragGestures { change, _ ->
                        change.consume()
                        move(day.from + change.position.x / size.width * (day.to - day.from))
                    }
                }
                .semantics {
                    contentDescription = tr(R.string.chart_ariaShort)
                    stateDescription = at?.let { tr(R.string.chart_value, Surf.hhmm(current, tz), Surf.fmt(it.h), tr(if (it.rising) R.string.chart_rising else R.string.chart_falling)) } ?: Surf.hhmm(current, tz)
                    progressBarRangeInfo = ProgressBarRangeInfo(((current - day.from) / (day.to - day.from)).toFloat(), 0f..1f, steps = 95)
                    setProgress { v -> move(day.from + v * (day.to - day.from)); true }
                },
        ) {
            scale(size.width / W, size.width / W, pivot = Offset.Zero) {
                clipRect(0f, 0f, W, H) {
                    // Noche
                    if (sun != null) {
                        val h = H - TOP - BOTTOM + 10
                        drawRect(c.surface2, Offset(0f, TOP - 10), Size(maxOf(0f, x(sun.rise)), h))
                        drawRect(c.surface2, Offset(x(sun.set), TOP - 10), Size(maxOf(0f, W - x(sun.set)), h))
                    }
                    // Predicción
                    val line = path(pts, ::x, ::y)
                    val area = path(pts, ::x, ::y).apply {
                        lineTo(x(pts.last().t), H - BOTTOM); lineTo(x(pts.first().t), H - BOTTOM); close()
                    }
                    drawPath(area, c.sea.copy(alpha = 0.22f))
                    drawPath(line, c.sea, style = Stroke(2.4f))
                    // Medido
                    if (obs.isNotEmpty()) {
                        drawPath(path(obs, ::x, ::y), c.accent, style = Stroke(1.6f, cap = StrokeCap.Round, pathEffect = PathEffect.dashPathEffect(floatArrayOf(1f, 3f))))
                    }
                }
                // Pleamares y bajamares
                for (e in extremes) {
                    val p = Offset(x(e.t), y(e.h))
                    drawCircle(c.surface, 3.5f, p)
                    drawCircle(c.sea, 3.5f, p, style = Stroke(2f))
                    label(measurer, "${Surf.hhmm(e.t, tz)} · ${Surf.fmt(e.h)}", TextStyle(fontFamily = Fonts.mono, fontSize = 10.sp, color = c.ink), p.x, if (e.type == "high") p.y - 13 else p.y + 13, center = true)
                }
                obs.firstOrNull { it.t >= day.from + 20 * 60_000 }?.let {
                    label(measurer, tr(R.string.chart_measuredLabel), TextStyle(fontFamily = Fonts.mono, fontSize = 9.sp, color = c.accentText), x(it.t) + 4, maxOf(12f, y(it.v) - 8) - 6, center = false)
                }
                // Ahora
                if (inDay) drawLine(c.accent, Offset(x(now), TOP - 10), Offset(x(now), H - BOTTOM), 1.5f, pathEffect = PathEffect.dashPathEffect(floatArrayOf(3f, 3f)))
                // Cursor
                if (at != null) {
                    val cx = x(current)
                    drawLine(c.ink, Offset(cx, TOP - 10), Offset(cx, H - BOTTOM), 1.2f)
                    drawCircle(c.sea, 6f, Offset(cx, y(at.h)))
                    drawCircle(c.surface, 6f, Offset(cx, y(at.h)), style = Stroke(2.5f))
                    Surf.valueAt(day.observed?.series, current, 20 * 60_000.0)?.let { m ->
                        drawCircle(c.accent, 4f, Offset(cx, y(m)))
                        drawCircle(c.surface, 4f, Offset(cx, y(m)), style = Stroke(2f))
                    }
                }
                // Eje
                for (hh in listOf(0, 6, 12, 18)) {
                    label(measurer, "%02dh".format(hh), TextStyle(fontFamily = Fonts.mono, fontSize = 9.sp, color = c.muted), hh / 24f * W + 2, H - 14, center = false)
                }
            }
        }
        Legend(day, extremes.filter { it.coef != null }.map { "${it.coef} (${Surf.hhmm(it.t, tz)})" })
    }
}

private fun path(pts: List<SeriesPoint>, x: (Double) -> Float, y: (Double) -> Float) = Path().apply {
    pts.forEachIndexed { i, p -> if (i == 0) moveTo(x(p.t), y(p.v)) else lineTo(x(p.t), y(p.v)) }
}

// El texto se mide en sp del dispositivo; se compensa la escala del lienzo para que mida lo mismo que en la web.
private fun DrawScope.label(measurer: TextMeasurer, text: String, style: TextStyle, x: Float, y: Float, center: Boolean) {
    val k = W / (size.width)
    val layout = measurer.measure(text, style)
    val w = layout.size.width * k; val h = layout.size.height * k
    val left = if (center) (x - w / 2).coerceIn(0f, W - w) else x
    scale(k, k, pivot = Offset(left, y - h / 2)) {
        drawText(layout, topLeft = Offset(left, y - h / 2))
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Readout(day: TideDay, tz: String, current: Double, now: Double) {
    val c = LocalColors.current
    val at = Surf.tideAt(day.series, current)
    val measured = Surf.valueAt(day.observed?.series, current, 20 * 60_000.0)
    val coef = Surf.coefficientAt(day.ext, current)
    val next = day.ext.firstOrNull { it.t > current }
    val residual = Surf.valueAt(day.surge?.series, current)
    val isNow = abs(current - now) < 8 * 60_000
    Column(
        Modifier.fillMaxWidth().heightIn(min = 58.dp).clip(RoundedCornerShape(12.dp)).background(c.bg).padding(horizontal = 12.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            Text(
                buildAnnotatedString {
                    withStyle(SpanStyle(fontFamily = Fonts.monoBold, fontSize = 20.sp)) { append(Surf.hhmm(current, tz)) }
                    if (isNow) withStyle(SpanStyle(fontFamily = Fonts.mono, fontSize = 10.sp, color = c.accentText, letterSpacing = 0.8.sp)) { append(" " + tr(R.string.chart_now)) }
                },
                color = c.ink,
            )
            if (at != null) Text(
                buildAnnotatedString {
                    withStyle(SpanStyle(fontFamily = Fonts.monoBold, fontSize = 17.sp)) { append(Surf.fmt(at.h, 2)) }
                    append(" m ${if (at.rising) "↗" else "↘"} ${tr(if (at.rising) R.string.chart_rising else R.string.chart_falling)}")
                },
                style = Type.body(15.sp), color = c.ink, modifier = Modifier.padding(top = 3.dp),
            )
            if (coef != null) Text(
                buildAnnotatedString {
                    append(tr(R.string.chart_coef) + " ")
                    withStyle(SpanStyle(fontFamily = Fonts.monoBold, fontSize = 17.sp)) { append("$coef") }
                    withStyle(SpanStyle(color = c.muted)) { append(" ${Surf.coefLabel(coef)}") }
                },
                style = Type.body(15.sp), color = c.ink, modifier = Modifier.padding(top = 3.dp),
            )
        }
        // Una línea por dato, y siempre las mismas para el día: así el recuadro no cambia de alto al deslizar.
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            val sub = Type.body(13.sp)
            next?.let { Text(tr(R.string.chart_next, it.word, Surf.duration(it.t - current), Surf.hhmm(it.t, tz), Surf.fmt(it.h)), style = sub, color = c.muted) }
            if (day.surge != null) Text(Surf.surgeText(residual), style = sub, color = c.muted)
            if (day.observed?.series?.isNotEmpty() == true) Text(measured?.let { tr(R.string.chart_measured, Surf.fmt(it, 2)) } ?: tr(R.string.chart_measuredNone), style = sub, color = c.muted)
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Legend(day: TideDay, coefs: List<String>) {
    val c = LocalColors.current
    FlowRow(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Swatch(c.sea, null, 2.4f, tr(R.string.legend_prediction))
        day.observed?.takeIf { it.series.isNotEmpty() }?.let { o ->
            Swatch(c.accent, floatArrayOf(1f, 3f), 2f, tr(R.string.legend_measuredAt, o.gauge) + (if (o.samePort == false) tr(R.string.legend_away, (o.distKm ?: 0.0).toInt()) else ""))
        }
        Swatch(c.accent, floatArrayOf(3f, 3f), 1.5f, tr(R.string.legend_now))
        if (coefs.isNotEmpty()) Text(tr(R.string.legend_coefs, coefs.joinToString(" · ")), style = Type.body(13.sp), color = c.muted)
    }
}

@Composable
private fun Swatch(color: Color, dash: FloatArray?, width: Float, label: String) {
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
        Canvas(Modifier.size(16.dp, 3.dp)) {
            val d = density
            drawLine(color, Offset(0f, size.height / 2), Offset(size.width, size.height / 2), width * d,
                cap = if (dash?.first() == 1f) StrokeCap.Round else StrokeCap.Butt,
                pathEffect = dash?.let { PathEffect.dashPathEffect(it.map { v -> v * d }.toFloatArray()) })
        }
        Text(label, style = Type.body(13.sp), color = LocalColors.current.muted)
    }
}
