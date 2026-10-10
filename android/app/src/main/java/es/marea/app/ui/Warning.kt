package es.marea.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import es.marea.app.R
import es.marea.app.data.L10n
import es.marea.app.data.SpotWarning
import es.marea.app.data.tr
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.roundToLong

/** Textos de los avisos de la AEMET sin depender de Compose (mismas reglas que warningBanner en public/js/app.js). */
object WarningText {
    /** Nivel Meteoalerta; cualquier valor desconocido o ausente cuenta como amarillo. */
    fun level(raw: String?): String = when (raw?.lowercase()) {
        "rojo" -> "rojo"
        "naranja" -> "naranja"
        else -> "amarillo"
    }

    /** Descripción oficial en el idioma de la app, con respaldo al español y al texto corto. */
    fun description(w: SpotWarning, english: Boolean): String =
        (if (english) w.details?.en?.description else null).orEmpty().ifEmpty { w.details?.es?.description.orEmpty() }.ifEmpty { w.desc.orEmpty() }

    /** Recomendación oficial en el idioma de la app, con respaldo al español. */
    fun instruction(w: SpotWarning, english: Boolean): String =
        (if (english) w.details?.en?.instruction else null).orEmpty().ifEmpty { w.details?.es?.instruction.orEmpty() }

    fun levelLabel(level: String): String = tr(
        when (level) { "rojo" -> R.string.warning_level_rojo; "naranja" -> R.string.warning_level_naranja; else -> R.string.warning_level_amarillo },
    )

    fun risk(level: String): String = tr(
        when (level) { "rojo" -> R.string.warning_risk_rojo; "naranja" -> R.string.warning_risk_naranja; else -> R.string.warning_risk_amarillo },
    )

    /** Fenómeno traducido; si el servidor manda uno nuevo se muestra tal cual. */
    fun phenomenon(raw: String?): String = when (raw) {
        "Costeros" -> tr(R.string.warning_phenomenon_Costeros)
        "Vientos" -> tr(R.string.warning_phenomenon_Vientos)
        "Tormentas" -> tr(R.string.warning_phenomenon_Tormentas)
        "Galerna" -> tr(R.string.warning_phenomenon_Galerna)
        "Rissaga" -> tr(R.string.warning_phenomenon_Rissaga)
        "Lluvias" -> tr(R.string.warning_phenomenon_Lluvias)
        else -> raw.orEmpty()
    }

    /** "mié, 8 oct, 14:00" en la zona del spot. */
    fun date(ms: Double, tz: String): String {
        val locale = if (L10n.english) Locale.UK else Locale.forLanguageTag("es-ES")
        return DateTimeFormatter.ofPattern("EEE, d MMM, HH:mm", locale).withZone(ZoneId.of(tz)).format(Instant.ofEpochMilli(ms.roundToLong()))
    }
}

/** Mismos colores que Theme.warningColor y warningText de iOS: relleno y texto sobre el relleno. */
@Composable
private fun warningColor(level: String): Color = when (level) {
    "rojo" -> if (isSystemInDarkTheme()) Color(0xFFFF4D4D) else Color(0xFFDC2626)
    "naranja" -> if (isSystemInDarkTheme()) Color(0xFFFF7A33) else Color(0xFFEA580C)
    else -> if (isSystemInDarkTheme()) Color(0xFFFBBF24) else Color(0xFFF59E0B)
}

@Composable
private fun warningTextColor(level: String): Color = when (level) {
    "rojo" -> if (isSystemInDarkTheme()) Color(0xFFFF8080) else Color(0xFFB91C1C)
    "naranja" -> if (isSystemInDarkTheme()) Color(0xFFFFA066) else Color(0xFFC2410C)
    else -> if (isSystemInDarkTheme()) Color(0xFFFCD34D) else Color(0xFFB45309)
}

/** Insignia del aviso en la tarjeta del listado. Es informativa: la tarjeta entera abre el spot. */
@Composable
fun WarningBadge(w: SpotWarning) {
    val lvl = WarningText.level(w.level)
    val color = warningColor(lvl)
    val label = "${tr(R.string.warning_badge, WarningText.levelLabel(lvl))}: ${WarningText.phenomenon(w.phenomenon)}"
    Row(
        Modifier.clip(CircleShape).background(color.copy(alpha = 0.15f)).border(1.dp, color.copy(alpha = 0.4f), CircleShape)
            .padding(horizontal = 10.dp, vertical = 4.dp).semantics { contentDescription = label },
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Box(Modifier.size(6.dp).clip(CircleShape).background(color))
        Text(label, style = Type.bodySemibold(12.sp), color = warningTextColor(lvl), maxLines = 2, overflow = TextOverflow.Ellipsis)
    }
}

/** Aviso oficial de la AEMET al principio del detalle (hasta 3 avisos). Es estático, como en la web y en iOS. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun WarningBanner(warnings: List<SpotWarning>, tz: String) {
    val list = warnings.take(3)
    val top = list.firstOrNull() ?: return
    val c = LocalColors.current
    val multiple = list.size > 1
    val topLvl = WarningText.level(top.level)
    val base = warningColor(topLvl)
    val activeCount = list.count { it.active == true }
    val state = when {
        multiple && activeCount > 0 -> tr(R.string.warning_activeCount, activeCount)
        multiple -> tr(R.string.warning_totalCount, list.size)
        top.active == true -> tr(R.string.warning_activeNow)
        else -> tr(R.string.warning_upcoming)
    }
    val headline = if (multiple) tr(R.string.warning_aemetPlural)
    else "${tr(R.string.warning_aemet)}: ${WarningText.phenomenon(top.phenomenon)} (${WarningText.levelLabel(topLvl).uppercase()})"
    val instruction = WarningText.instruction(top, L10n.english)
    val shape = RoundedCornerShape(16.dp)
    val summary = "$headline. $state. ${top.zone.orEmpty()}"

    Column(
        Modifier.fillMaxWidth().clip(shape).background(base.copy(alpha = 0.12f)).border(1.5.dp, base.copy(alpha = 0.35f), shape).padding(14.dp)
            .semantics(mergeDescendants = true) { contentDescription = summary },
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("⚠️", fontSize = 22.sp, modifier = Modifier.clearAndSetSemantics { })
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp), itemVerticalAlignment = Alignment.CenterVertically) {
                    Text(
                        "${WarningText.levelLabel(topLvl).uppercase()} · ${WarningText.risk(topLvl)}", style = Type.monoBold(10.5.sp), color = warningTextColor(topLvl),
                        modifier = Modifier.clip(RoundedCornerShape(6.dp)).background(base.copy(alpha = 0.22f)).padding(horizontal = 7.dp, vertical = 2.dp),
                    )
                    Text(state, style = Type.body(12.sp), color = c.ink)
                    top.zone?.takeIf { it.isNotEmpty() }?.let { Text(it, style = Type.body(12.sp), color = c.muted, maxLines = 1, overflow = TextOverflow.Ellipsis) }
                }
                Text(headline, style = Type.heading(16.sp), color = c.ink)
            }
        }
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            list.forEach { w ->
                val lvl = WarningText.level(w.level)
                val desc = WarningText.description(w, L10n.english)
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp), itemVerticalAlignment = Alignment.CenterVertically) {
                        Row(
                            Modifier.clip(CircleShape).background(warningColor(lvl).copy(alpha = 0.16f)).padding(horizontal = 8.dp, vertical = 3.dp),
                            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp),
                        ) {
                            Box(Modifier.size(6.dp).clip(CircleShape).background(warningColor(lvl)))
                            Text(
                                "${WarningText.phenomenon(w.phenomenon)} (${WarningText.levelLabel(lvl).replaceFirstChar { it.uppercase() }})",
                                style = Type.bodySemibold(12.sp), color = warningTextColor(lvl),
                            )
                        }
                        val start = w.start; val end = w.end
                        if (start != null && end != null) {
                            Text("🕒 ${tr(R.string.warning_window, WarningText.date(start, tz), WarningText.date(end, tz))}", style = Type.body(11.5.sp), color = c.muted)
                        }
                    }
                    if (desc.isNotEmpty()) Text(desc, style = Type.body(13.sp), color = c.ink)
                }
            }
        }
        Text(tr(R.string.warning_unfavorable), style = Type.body(12.5.sp), color = c.muted)
        if (instruction.isNotEmpty()) {
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Eyebrow(tr(R.string.warning_instruction))
                Text(instruction, style = Type.body(12.5.sp), color = c.ink)
            }
        }
    }
}
