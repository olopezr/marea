package es.marea.app.ui

import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import es.marea.app.R
import es.marea.app.data.tr

// Qué significa cada dato: botón "?" junto al dato y glosario al final del detalle (como en la web).
object HelpTopics {
    val all = listOf("rating", "height", "period", "swell", "wind", "tide", "energy", "buoy")
    fun title(t: String) = tr(when (t) {
        "rating" -> R.string.help_rating_title; "height" -> R.string.help_height_title; "period" -> R.string.help_period_title
        "swell" -> R.string.help_swell_title; "wind" -> R.string.help_wind_title; "tide" -> R.string.help_tide_title
        "energy" -> R.string.help_energy_title; else -> R.string.help_buoy_title
    })
    fun text(t: String) = tr(when (t) {
        "rating" -> R.string.help_rating_text; "height" -> R.string.help_height_text; "period" -> R.string.help_period_text
        "swell" -> R.string.help_swell_text; "wind" -> R.string.help_wind_text; "tide" -> R.string.help_tide_text
        "energy" -> R.string.help_energy_text; else -> R.string.help_buoy_text
    })
}

@Composable
fun HelpButton(topic: String, color: Color = LocalColors.current.muted) {
    var shown by remember { mutableStateOf(false) }
    val label = tr(R.string.help_button, HelpTopics.title(topic))
    Box(
        Modifier.size(48.dp).clip(CircleShape).clickable(role = Role.Button, onClickLabel = label) { shown = true }.semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Icon(Icons.help, contentDescription = null, tint = color.copy(alpha = 0.8f), modifier = Modifier.size(16.dp))
    }
    if (shown) {
        val c = LocalColors.current
        AlertDialog(
            onDismissRequest = { shown = false },
            confirmButton = { TextButton(onClick = { shown = false }) { Text(tr(R.string.close), color = c.accentText) } },
            title = { Text(HelpTopics.title(topic), style = Type.heading(19.sp), color = c.ink) },
            text = { Text(HelpTopics.text(topic), style = Type.body(15.sp), color = c.ink) },
            containerColor = c.surface,
        )
    }
}

@Composable
fun Glossary() {
    val c = LocalColors.current
    Panel {
        PanelTitle(tr(R.string.help_glossary))
        Column {
            HelpTopics.all.forEach { topic ->
                var open by rememberSaveable(topic) { mutableStateOf(false) }
                HorizontalDivider(color = c.line)
                Column(Modifier.fillMaxWidth().animateContentSize()) {
                    Row(
                        Modifier.fillMaxWidth().heightIn(min = 48.dp).clickable(role = Role.Button) { open = !open },
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(HelpTopics.title(topic), style = Type.bodySemibold(15.sp), color = c.ink, modifier = Modifier.weight(1f))
                        Icon(Icons.back, contentDescription = null, tint = c.muted, modifier = Modifier.size(16.dp).rotate(if (open) 90f else -90f))
                    }
                    if (open) Text(HelpTopics.text(topic), style = Type.body(14.sp), color = c.ink, modifier = Modifier.padding(bottom = 10.dp))
                }
            }
        }
    }
}
