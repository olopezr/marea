package es.marea.app.ui

import android.Manifest
import android.content.Intent
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.windowInsetsBottomHeight
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import es.marea.app.AppState
import kotlinx.coroutines.launch

/** Pide el permiso de notificaciones (Android 13+) y después ejecuta la acción, se conceda o no. */
@Composable
fun rememberNotificationPermission(): (() -> Unit) -> Unit {
    var pending by remember { mutableStateOf<(() -> Unit)?>(null) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { pending?.invoke(); pending = null }
    return { action ->
        if (Build.VERSION.SDK_INT >= 33) { pending = action; launcher.launch(Manifest.permission.POST_NOTIFICATIONS) } else action()
    }
}

// Pantalla de avisos (renderAlerts en public/js/app.js).
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AlertsScreen(app: AppState, onBack: () -> Unit) {
    val c = LocalColors.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val st = app.alerts.state
    var busy by remember { mutableStateOf(false) }
    var allowed by remember { mutableStateOf(app.alerts.notificationsAllowed()) }
    val permission = rememberNotificationPermission()

    LaunchedEffect(Unit) { app.alerts.load() }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { allowed = app.alerts.notificationsAllowed() }

    fun run(ok: String?, needsPermission: Boolean = false, work: suspend () -> Unit) {
        busy = true
        val go = {
            scope.launch {
                try { work(); ok?.let(app::show) } catch (e: Exception) { app.show(e.message ?: "Error") }
                allowed = app.alerts.notificationsAllowed()
                busy = false
            }
            Unit
        }
        if (needsPermission && !allowed) permission(go) else go()
    }

    Column(Modifier.fillMaxSize().background(c.bg)) {
        Row(Modifier.statusBarsPadding().padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            IconCircleButton(Icons.back, "Volver a la lista", onClick = onBack)
            Column(Modifier.semantics(mergeDescendants = true) { heading() }) {
                Text("Avisos", style = Type.heading(21.sp), color = c.ink)
                Text("Te avisamos cuando tus spots se ponen buenos", style = Type.body(13.sp), color = c.muted)
            }
        }
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (!app.alerts.available) item {
                Banner("Los avisos no están disponibles en esta versión de la app.")
            }
            if (!allowed && st.spots.isNotEmpty()) item {
                Banner("Las notificaciones están bloqueadas para Marea. Toca aquí para activarlas en los ajustes del móvil.") {
                    context.startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName))
                }
            }
            item {
                Panel {
                    PanelTitle("Avisar a partir de")
                    val options = listOf(2.0 to "Aceptable", 3.0 to "Bueno", 4.0 to "Muy bueno")
                    SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                        options.forEachIndexed { i, (v, label) ->
                            SegmentedButton(
                                selected = st.minScore == v,
                                onClick = { run(if (st.spots.isEmpty()) null else "Umbral guardado") { app.alerts.setMinScore(v) } },
                                shape = SegmentedButtonDefaults.itemShape(i, options.size), icon = {}, enabled = !busy,
                                colors = SegmentedButtonDefaults.colors(
                                    activeContainerColor = c.surface, activeContentColor = c.ink, inactiveContainerColor = c.surface2,
                                    inactiveContentColor = c.muted, activeBorderColor = c.line, inactiveBorderColor = c.line,
                                ),
                            ) { Text(label, style = Type.bodySemibold(13.5.sp)) }
                        }
                    }
                    Text(
                        "Revisamos la previsión cada hora entre las 7:00 y las 22:00 y te mandamos como mucho un aviso por spot y día, con la mejor hora de hoy o de mañana.",
                        style = Type.body(13.sp), color = c.muted,
                    )
                }
            }
            item {
                Panel {
                    PanelTitle("Spots")
                    Column {
                        // Agrupados por zona, con un título al empezar cada una.
                        val spots = app.api.spots
                        spots.forEachIndexed { i, sp ->
                            if (i == 0 || spots[i - 1].region != sp.region) {
                                Box(Modifier.padding(top = if (i == 0) 4.dp else 18.dp, bottom = 2.dp).semantics { heading() }) { Eyebrow(sp.region) }
                            } else {
                                HorizontalDivider(color = c.line)
                            }
                            val on = sp.id in st.spots
                            Row(
                                Modifier.fillMaxWidth().toggleable(on, enabled = !busy, role = Role.Switch) { now ->
                                    run(if (now) "Avisos activados para ${sp.name}" else "Avisos desactivados para ese spot", needsPermission = now) { app.alerts.toggle(sp.id) }
                                }.padding(vertical = 8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(sp.name, style = Type.body(), color = c.ink, modifier = Modifier.weight(1f))
                                Switch(
                                    checked = on, onCheckedChange = null, enabled = !busy,
                                    colors = SwitchDefaults.colors(checkedTrackColor = c.green, checkedThumbColor = c.surface, uncheckedTrackColor = c.line, uncheckedThumbColor = c.surface, uncheckedBorderColor = c.line),
                                )
                            }
                        }
                    }
                }
            }
            item {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    PrimaryButton("Enviar un aviso de prueba", enabled = st.spots.isNotEmpty() && !busy) { run("Aviso de prueba enviado") { app.alerts.sendTest() } }
                    GhostButton("Desactivar todos los avisos", enabled = st.spots.isNotEmpty() && !busy) { run("Avisos desactivados") { app.alerts.disableAll() } }
                }
            }
            item { Footer(app.api::legalUrl) }
            item { Spacer(Modifier.windowInsetsBottomHeight(WindowInsets.navigationBars)) }
        }
    }
}
