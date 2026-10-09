package es.marea.app.ui

import es.marea.app.data.AlertPref
import es.marea.app.data.Rating

import es.marea.app.R

import es.marea.app.data.tr

import android.Manifest
import android.content.Intent
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.shape.CircleShape
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.windowInsetsBottomHeight
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
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
import androidx.compose.ui.semantics.contentDescription
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
    // Spots con los ajustes desplegados: se recuerdan porque el estado se recompone al guardar.
    var openPrefs by remember { mutableStateOf(setOf<String>()) }
    val permission = rememberNotificationPermission()

    LaunchedEffect(Unit) { app.alerts.load() }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { allowed = app.alerts.notificationsAllowed() }

    fun run(ok: String?, needsPermission: Boolean = false, work: suspend () -> Unit) {
        busy = true
        val go = {
            scope.launch {
                try { work(); ok?.let(app::show) } catch (e: Exception) { app.show(e.message ?: tr(R.string.error_connect)) }
                allowed = app.alerts.notificationsAllowed()
                busy = false
            }
            Unit
        }
        if (needsPermission && !allowed) permission(go) else go()
    }

    Column(Modifier.fillMaxSize().background(c.bg)) {
        Row(Modifier.statusBarsPadding().padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            IconCircleButton(Icons.back, tr(R.string.back), onClick = onBack)
            Column(Modifier.semantics(mergeDescendants = true) { heading() }) {
                Text(tr(R.string.alerts), style = Type.heading(21.sp), color = c.ink)
                Text(tr(R.string.alerts_subtitle), style = Type.body(13.sp), color = c.muted)
            }
        }
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (!app.alerts.available) item {
                Banner(tr(R.string.err_alertsUnavailable))
            }
            if (!allowed && st.spots.isNotEmpty()) item {
                Banner(tr(R.string.alerts_blockedAndroid)) {
                    context.startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName))
                }
            }
            item {
                Panel {
                    PanelTitle(tr(R.string.alerts_from))
                    val options = listOf(2.0 to Rating.Fair.label, 3.0 to Rating.Good.label, 4.0 to Rating.Epic.label)
                    SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                        options.forEachIndexed { i, (v, label) ->
                            SegmentedButton(
                                selected = st.minScore == v,
                                onClick = { run(if (st.spots.isEmpty()) null else tr(R.string.toast_threshold)) { app.alerts.setMinScore(v) } },
                                shape = SegmentedButtonDefaults.itemShape(i, options.size), icon = {}, enabled = !busy,
                                colors = SegmentedButtonDefaults.colors(
                                    activeContainerColor = c.surface, activeContentColor = c.ink, inactiveContainerColor = c.surface2,
                                    inactiveContentColor = c.muted, activeBorderColor = c.line, inactiveBorderColor = c.line,
                                ),
                            ) { Text(label, style = Type.bodySemibold(13.5.sp)) }
                        }
                    }
                    Text(
                        tr(R.string.alerts_help),
                        style = Type.body(13.sp), color = c.muted,
                    )
                }
            }
            item {
                Panel {
                    PanelTitle(tr(R.string.alerts_spots))
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
                                    run(if (now) tr(R.string.toast_spotOn, sp.name) else tr(R.string.toast_spotOff), needsPermission = now) { app.alerts.toggle(sp.id) }
                                }.padding(vertical = 8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(sp.name, style = Type.body(), color = c.ink, modifier = Modifier.weight(1f))
                                Switch(
                                    checked = on, onCheckedChange = null, enabled = !busy,
                                    colors = SwitchDefaults.colors(checkedTrackColor = c.green, checkedThumbColor = c.surface, uncheckedTrackColor = c.line, uncheckedThumbColor = c.surface, uncheckedBorderColor = c.line),
                                )
                            }
                            if (on && st.prefs != null) {
                                val pref = st.prefs[sp.id] ?: AlertPref()
                                SpotPrefs(
                                    pref = pref, open = sp.id in openPrefs, enabled = !busy,
                                    onToggle = { openPrefs = if (sp.id in openPrefs) openPrefs - sp.id else openPrefs + sp.id },
                                    onChange = { new ->
                                        if (new.from != null && new.to != null && new.from >= new.to) app.show(tr(R.string.alerts_hoursOrder))
                                        else run(tr(R.string.toast_prefSaved)) { app.alerts.setPref(sp.id, new) }
                                    },
                                )
                            }
                        }
                    }
                }
            }
            item {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    PrimaryButton(tr(R.string.alerts_test), enabled = st.spots.isNotEmpty() && !busy) { run(tr(R.string.toast_testSent)) { app.alerts.sendTest() } }
                    GhostButton(tr(R.string.alerts_off), enabled = st.spots.isNotEmpty() && !busy) { run(tr(R.string.toast_allOff)) { app.alerts.disableAll() } }
                }
            }
            item { Footer(app.api::legalUrl) }
            item { Spacer(Modifier.windowInsetsBottomHeight(WindowInsets.navigationBars)) }
        }
    }
}

// Ajustes de un spot con avisos activados (el bloque `prefsBlock` de la web): calidad mínima propia,
// solo con terral y franja horaria.
@Composable
private fun SpotPrefs(pref: AlertPref, open: Boolean, enabled: Boolean, onToggle: () -> Unit, onChange: (AlertPref) -> Unit) {
    val c = LocalColors.current
    Column(Modifier.fillMaxWidth().padding(bottom = 8.dp)) {
        Row(Modifier.clickable(onClick = onToggle).padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Text((if (open) "▾ " else "▸ ") + tr(R.string.alerts_spotSettings), style = Type.body(14.sp), color = c.muted)
            if (!pref.isDefault) Box(Modifier.size(8.dp).background(c.accent, CircleShape).semantics { contentDescription = tr(R.string.alerts_spotCustom) })
        }
        if (open) {
            Column(Modifier.padding(start = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                val qualities = listOf(null to tr(R.string.alerts_useDefault), 2 to Rating.Fair.label, 3 to Rating.Good.label, 4 to Rating.Epic.label)
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                    Text(tr(R.string.alerts_minQuality), style = Type.body(14.sp), color = c.ink)
                    Menu(qualities.first { it.first == pref.min }.second, qualities.map { it.second }, enabled) { i -> onChange(pref.copy(min = qualities[i].first)) }
                }
                Row(
                    Modifier.fillMaxWidth().toggleable(pref.offshore == true, enabled = enabled, role = Role.Switch) { on -> onChange(pref.copy(offshore = if (on) true else null)) },
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(tr(R.string.alerts_spotOffshore), style = Type.body(14.sp), color = c.ink, modifier = Modifier.weight(1f))
                    Switch(
                        checked = pref.offshore == true, onCheckedChange = null, enabled = enabled,
                        colors = SwitchDefaults.colors(checkedTrackColor = c.green, checkedThumbColor = c.surface, uncheckedTrackColor = c.line, uncheckedThumbColor = c.surface, uncheckedBorderColor = c.line),
                    )
                }
                val from = pref.from ?: AlertPref.DEFAULT_FROM
                val to = pref.to ?: AlertPref.DEFAULT_TO
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(tr(R.string.alerts_spotFrom), style = Type.body(14.sp), color = c.ink)
                    val fromHours = (AlertPref.DEFAULT_FROM..21).toList()
                    Menu("%02d:00".format(from), fromHours.map { "%02d:00".format(it) }, enabled) { i -> onChange(pref.copy(from = fromHours[i], to = to)) }
                    Text(tr(R.string.alerts_spotTo), style = Type.body(14.sp), color = c.ink)
                    val toHours = (AlertPref.DEFAULT_FROM + 1..AlertPref.DEFAULT_TO).toList()
                    Menu("%02d:00".format(to), toHours.map { "%02d:00".format(it) }, enabled) { i -> onChange(pref.copy(from = from, to = toHours[i])) }
                }
            }
        }
    }
}

/** Botón de texto que despliega una lista de opciones; devuelve la posición elegida. */
@Composable
private fun Menu(selected: String, options: List<String>, enabled: Boolean, onSelect: (Int) -> Unit) {
    val c = LocalColors.current
    var expanded by remember { mutableStateOf(false) }
    Box {
        Text(
            "$selected ▾", style = Type.bodySemibold(14.sp), color = if (enabled) c.accent else c.muted,
            modifier = Modifier.clickable(enabled = enabled) { expanded = true }.padding(horizontal = 8.dp, vertical = 6.dp),
        )
        DropdownMenu(expanded, onDismissRequest = { expanded = false }) {
            options.forEachIndexed { i, label ->
                DropdownMenuItem(text = { Text(label, style = Type.body(14.sp), color = c.ink) }, onClick = { expanded = false; onSelect(i) })
            }
        }
    }
}
