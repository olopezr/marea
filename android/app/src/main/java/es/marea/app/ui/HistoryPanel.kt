package es.marea.app.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import es.marea.app.R
import es.marea.app.data.BuoyReading
import es.marea.app.data.SeriesPoint
import es.marea.app.data.Surf
import es.marea.app.data.tr
import kotlin.math.ceil

// "Boya frente a previsión": últimas 48 h medidas por la boya y la previsión en su posición,
// de −48 h a +24 h (historyPanel en public/js/app.js).
@Composable
fun HistoryPanel(b: BuoyReading) {
    val c = LocalColors.current
    val measurer = rememberTextMeasurer()
    val hist = b.historySeries; val model = b.modelSeries
    val now = System.currentTimeMillis().toDouble()
    val from = now - 48 * 3_600_000; val to = now + 24 * 3_600_000
    val maxV = maxOf(1.0, ceil(((hist + model).maxOfOrNull { it.v } ?: 1.0) * 1.15 * 2) / 2)
    val labelStyle = TextStyle(fontFamily = Fonts.mono, fontSize = 9.sp, color = c.muted)
    val nowLabel = tr(R.string.hist_now)
    val fit = b.fit?.let(Surf::fitText)
    val aria = tr(R.string.hist_aria) + (fit?.let { ". $it" } ?: "")

    Panel {
        PanelTitle(tr(R.string.hist_title))
        Canvas(Modifier.fillMaxWidth().aspectRatio(340f / 150f).semantics { contentDescription = aria }) {
            val s = size.width / 340f
            val left = 30 * s; val right = 6 * s; val top = 10 * s; val bottom = 24 * s
            fun x(t: Double) = left + ((t - from) / (to - from)).toFloat() * (size.width - left - right)
            fun y(v: Double) = top + (1 - v / maxV).toFloat() * (size.height - top - bottom)
            fun path(pts: List<SeriesPoint>) = Path().apply {
                pts.filter { it.t in from..to }.forEachIndexed { i, p -> if (i == 0) moveTo(x(p.t), y(p.v)) else lineTo(x(p.t), y(p.v)) }
            }
            fun label(text: String, px: Float, py: Float, align: Float) {
                val m = measurer.measure(text, labelStyle)
                drawText(m, topLeft = Offset(px - m.size.width * align, py - m.size.height / 2f))
            }
            // Rejilla y eje de alturas
            val step = if (maxV > 4) 2.0 else if (maxV > 2) 1.0 else 0.5
            var v = 0.0
            while (v <= maxV + 0.001) {
                drawLine(c.line, Offset(left, y(v)), Offset(size.width - right, y(v)), strokeWidth = 1 * s)
                label(Surf.fmt(v, if (step < 1) 1 else 0), left - 4 * s, y(v), 1f)
                v += step
            }
            // Ahora
            drawLine(c.accent, Offset(x(now), top), Offset(x(now), size.height - bottom), strokeWidth = 1.5f * s,
                pathEffect = PathEffect.dashPathEffect(floatArrayOf(3 * s, 3 * s)))
            // Previsión y medido
            if (model.isNotEmpty()) drawPath(path(model), c.sea, style = Stroke(width = 2.2f * s, join = StrokeJoin.Round))
            if (hist.isNotEmpty()) {
                drawPath(path(hist), c.accent, style = Stroke(width = 1.6f * s, join = StrokeJoin.Round))
                hist.filter { it.t >= from }.forEach { drawCircle(c.accent, 1.8f * s, Offset(x(it.t), y(it.v))) }
            }
            // Eje de tiempo
            val ty = size.height - 8 * s
            label("−48 h", x(from), ty, 0f)
            label("−24 h", x(now - 24 * 3_600_000), ty, 0.5f)
            label(nowLabel, x(now), ty, 0.5f)
            label("+24 h", x(to), ty, 1f)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Swatch(c.accent, tr(R.string.hist_measured))
            Swatch(c.sea, tr(R.string.hist_forecast))
        }
        fit?.let { Text(it, style = Type.bodySemibold(13.sp), color = c.ink) }
        Text(tr(R.string.hist_place, b.buoy.name), style = Type.body(13.sp), color = c.muted)
    }
}

@Composable
private fun Swatch(color: Color, text: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Box(Modifier.size(16.dp, 2.4.dp).clip(RoundedCornerShape(2.dp)).background(color))
        Text(text, style = Type.body(13.sp), color = LocalColors.current.muted)
    }
}
