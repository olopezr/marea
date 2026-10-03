package es.marea.app.ui

import androidx.browser.customtabs.CustomTabsIntent
import androidx.core.net.toUri
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import android.provider.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.remember
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import es.marea.app.data.Rating
import es.marea.app.data.Surf

// ---------- Iconos (mismos trazados que public/js/app.js) ----------

private fun svgIcon(name: String, d: String, filled: Boolean, strokeWidth: Float) =
    ImageVector.Builder(name, 24.dp, 24.dp, 24f, 24f).addPath(
        pathData = PathParser().parsePathString(d).toNodes(),
        fill = if (filled) SolidColor(Color.Black) else null,
        stroke = SolidColor(Color.Black),
        strokeLineWidth = strokeWidth,
        strokeLineCap = StrokeCap.Round,
        strokeLineJoin = StrokeJoin.Round,
    ).build()

object Icons {
    private const val STAR = "M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.8z"
    private const val BELL = "M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0"
    val star = svgIcon("star", STAR, false, 1.7f)
    val starOn = svgIcon("starOn", STAR, true, 1.7f)
    val bell = svgIcon("bell", BELL, false, 1.8f)
    val bellOn = svgIcon("bellOn", BELL, true, 1.8f)
    val search = svgIcon("search", "M17.5 11a6.5 6.5 0 1 1-13 0a6.5 6.5 0 1 1 13 0zM16 16l4.5 4.5", false, 2f)
    val refresh = svgIcon("refresh", "M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5", false, 2f)
    val back = svgIcon("back", "M15 5l-7 7 7 7", false, 2.2f)
    val clear = svgIcon("clear", "M7 7l10 10M17 7L7 17", false, 2f)
}

// ---------- Piezas de interfaz ----------

@Composable
fun Eyebrow(text: String, color: Color = LocalColors.current.muted) {
    Text(text.uppercase(), style = Type.eyebrow, color = color)
}

/** Flecha hacia donde va el oleaje o el viento (dirección de origen + 180°). */
@Composable
fun DirArrow(deg: Double?, size: Dp = 15.dp, color: Color = LocalColors.current.sea) {
    if (deg == null) return
    Canvas(Modifier.size(size).rotate((deg + 180).toFloat())) {
        val s = this.size.width / 24
        val p = Path().apply {
            moveTo(12 * s, 3 * s); lineTo(18 * s, 12 * s); lineTo(14 * s, 12 * s); lineTo(14 * s, 21 * s)
            lineTo(10 * s, 21 * s); lineTo(10 * s, 12 * s); lineTo(6 * s, 12 * s); close()
        }
        drawPath(p, color)
    }
}

/** Cinco barras rellenas según la valoración. */
@Composable
fun ScoreBar(score: Double, track: Color = LocalColors.current.line) {
    val q = LocalColors.current.q(Rating.of(score))
    Row(Modifier.semantics { contentDescription = "${Surf.fmt(score)} de 5" }, horizontalArrangement = Arrangement.spacedBy(3.dp)) {
        repeat(5) { i ->
            val f = (score - i).coerceIn(0.0, 1.0).toFloat()
            Box(Modifier.width(18.dp).height(6.dp).clip(RoundedCornerShape(3.dp)).background(track)) {
                Box(Modifier.width(18.dp * f).height(6.dp).background(q))
            }
        }
    }
}

@Composable
fun RatingChip(rating: Rating) {
    val q = LocalColors.current.q(rating)
    Text(
        rating.label.uppercase(), style = Type.monoBold(11.sp).copy(letterSpacing = 0.06.sp * 11), color = LocalColors.current.qText(rating),
        modifier = Modifier.clip(CircleShape).background(q.copy(alpha = 0.16f)).padding(horizontal = 9.dp, vertical = 6.dp),
    )
}

@Composable
fun QualityCell(score: Double, modifier: Modifier = Modifier) {
    Box(modifier.clip(RoundedCornerShape(3.dp)).background(LocalColors.current.q(Rating.of(score))))
}

@Composable
fun Banner(text: String, onClick: (() -> Unit)? = null) {
    val c = LocalColors.current
    Text(
        text, style = Type.body(14.sp), color = c.ink,
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(mix(c.qFair, 0.18f, c.surface))
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            .padding(horizontal = 12.dp, vertical = 10.dp),
    )
}

/** Animaciones desactivadas en Ajustes > Accesibilidad (o escala de animación 0). */
@Composable
fun reduceMotion(): Boolean {
    val context = LocalContext.current
    return remember { Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f }
}

@Composable
fun LiveDot(off: Boolean = false) {
    val c = LocalColors.current
    val still = reduceMotion()
    val color = if (off) c.red else c.green
    val t = rememberInfiniteTransition(label = "pulse")
    val p by t.animateFloat(0f, 1f, infiniteRepeatable(tween(2000, easing = LinearEasing), RepeatMode.Restart), label = "p")
    Canvas(Modifier.size(7.dp)) {
        if (!off && !still && p < 0.7f) drawCircle(color.copy(alpha = 0.6f * (1 - p / 0.7f)), radius = size.minDimension / 2 + 6.dp.toPx() * (p / 0.7f))
        drawCircle(color)
    }
}

@Composable
fun Panel(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(LocalColors.current.surface).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp), content = content,
    )
}

@Composable
fun PanelTitle(text: String) = Text(text, style = Type.heading(17.sp), color = LocalColors.current.ink)

@Composable
fun Toast(message: String?, modifier: Modifier = Modifier) {
    val c = LocalColors.current
    AnimatedVisibility(message != null, modifier, enter = slideInVertically { it } + fadeIn(), exit = slideOutVertically { it } + fadeOut()) {
        Text(
            message ?: "", style = Type.body(15.sp), color = c.bg,
            modifier = Modifier.padding(16.dp).clip(RoundedCornerShape(12.dp)).background(c.ink).padding(horizontal = 16.dp, vertical = 12.dp),
        )
    }
}

@Composable
fun SkeletonCard(height: Dp = 168.dp) {
    val c = LocalColors.current
    val t = rememberInfiniteTransition(label = "shimmer")
    val p by t.animateFloat(0f, 1f, infiniteRepeatable(tween(650), RepeatMode.Reverse), label = "s")
    Box(Modifier.fillMaxWidth().height(height).clip(RoundedCornerShape(18.dp)).background(mix(c.surface2, if (reduceMotion()) 0.5f else p, c.surface)))
}

@Composable
fun ErrorBox(message: String) {
    val c = LocalColors.current
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 48.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text("No se pudieron cargar los datos.", style = Type.body(), color = c.ink)
        Text("$message. Comprueba la conexión y desliza hacia abajo para actualizar.", style = Type.body(13.sp), color = c.muted, textAlign = TextAlign.Center)
    }
}

/** Avisos sobre el estado de los datos: guardados y fuente de respaldo. */
@Composable
fun DataBanners(ts: Double, stale: Boolean, offline: Boolean, forecastSource: String?) {
    if (stale) {
        Banner(
            if (offline) "Sin conexión. Mostrando los datos guardados ${Surf.ago(ts)}."
            else "No se han podido actualizar los datos ahora mismo. Mostrando los guardados ${Surf.ago(ts)}.",
        )
    }
    if (forecastSource == "portus") {
        Banner("Open-Meteo no responde ahora mismo: la previsión es la del modelo de Puertos del Estado, que llega a 3 días.")
    }
}

@Composable
fun Footer(legalUrl: (String) -> String) {
    val c = LocalColors.current
    val context = LocalContext.current
    val open = { path: String -> CustomTabsIntent.Builder().build().launchUrl(context, legalUrl(path).toUri()) }
    Column(Modifier.fillMaxWidth().padding(top = 20.dp)) {
        Text(
            "Previsión: Open-Meteo, Puertos del Estado y MET Norway. Mareas: Instituto Hidrográfico de la Marina. Boyas y mareógrafos: Puertos del Estado. No usar para navegación.",
            style = Type.body(12.sp), color = c.muted,
        )
        FlowRow(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            listOf("Fuentes de datos" to "/legal/fuentes.html", "Privacidad" to "/legal/privacidad.html", "Aviso legal" to "/legal/aviso-legal.html").forEach { (label, path) ->
                // Zona táctil de 48 dp aunque el texto sea pequeño.
                Box(Modifier.heightIn(min = 48.dp).clickable { open(path) }, contentAlignment = Alignment.CenterStart) {
                    Text(label, style = Type.body(12.sp).copy(textDecoration = TextDecoration.Underline), color = c.muted)
                }
            }
        }
    }
}

@Composable
fun IconCircleButton(icon: ImageVector, label: String, on: Boolean = false, onClick: () -> Unit) {
    val c = LocalColors.current
    Box(
        Modifier.minimumInteractiveComponentSize().size(40.dp).clip(CircleShape).background(c.surface).clickable(onClickLabel = label, onClick = onClick)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = null, tint = if (on) c.accent else c.ink, modifier = Modifier.size(20.dp))
    }
}

@Composable
fun FavButton(on: Boolean, onClick: () -> Unit) {
    val c = LocalColors.current
    Box(
        Modifier.size(48.dp).clip(CircleShape).clickable(onClick = onClick).semantics { contentDescription = if (on) "Favorito, activado" else "Favorito" },
        contentAlignment = Alignment.Center,
    ) {
        Icon(if (on) Icons.starOn else Icons.star, contentDescription = null, tint = if (on) c.accent else c.muted, modifier = Modifier.size(22.dp))
    }
}

/** Logo: círculo con una ola. */
@Composable
fun Logo() {
    val c = LocalColors.current
    Canvas(Modifier.size(28.dp)) {
        val s = size.width / 32
        drawCircle(c.ink, radius = 15 * s, center = Offset(16 * s, 16 * s))
        val p = Path().apply {
            moveTo(4 * s, 19 * s)
            cubicTo(7 * s, 15 * s, 10 * s, 15 * s, 12 * s, 19 * s)
            cubicTo(14 * s, 23 * s, 17 * s, 23 * s, 20 * s, 19 * s)
            cubicTo(23 * s, 15 * s, 26 * s, 15 * s, 28 * s, 19 * s)
        }
        drawPath(p, c.accent, style = Stroke(width = 2.6f * s, cap = StrokeCap.Round))
    }
}

@Composable
fun WindTypePill(key: String, label: String) {
    val c = LocalColors.current
    val color = when (key) { "off", "calm" -> c.greenText; "on" -> c.accentText; else -> c.ink }
    Text(label, style = Type.bodySemibold(12.sp), color = color, modifier = Modifier.clip(CircleShape).background(c.surface2).padding(horizontal = 7.dp, vertical = 2.dp))
}

@Composable
fun PrimaryButton(text: String, enabled: Boolean = true, onClick: () -> Unit) {
    val c = LocalColors.current
    Text(
        text, style = Type.bodySemibold(), color = c.bg, textAlign = TextAlign.Center,
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(c.ink.copy(alpha = if (enabled) 1f else 0.45f))
            .clickable(enabled = enabled, onClick = onClick).padding(vertical = 14.dp, horizontal = 16.dp),
    )
}

@Composable
fun GhostButton(text: String, enabled: Boolean = true, onClick: () -> Unit) {
    val c = LocalColors.current
    Text(
        text, style = Type.bodySemibold(), color = c.ink.copy(alpha = if (enabled) 1f else 0.45f), textAlign = TextAlign.Center,
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).border(BorderStroke(1.5.dp, c.line), RoundedCornerShape(14.dp))
            .clickable(enabled = enabled, onClick = onClick).padding(vertical = 14.dp, horizontal = 16.dp),
    )
}
