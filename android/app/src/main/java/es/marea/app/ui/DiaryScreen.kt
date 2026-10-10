package es.marea.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.windowInsetsBottomHeight
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.SelectableDates
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import es.marea.app.AppState
import es.marea.app.R
import es.marea.app.data.DiaryEntry
import es.marea.app.data.DiaryInsights
import es.marea.app.data.DiarySnap
import es.marea.app.data.DiaryStat
import es.marea.app.data.DiaryStore
import es.marea.app.data.L10n
import es.marea.app.data.SpotDetail
import es.marea.app.data.Surf
import es.marea.app.data.tr
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale

// Diario de sesiones (renderDiary y diaryPanel en public/js/app.js). Los datos viven solo en el dispositivo.

/** "2026-10-10" como fecha local, escrita en el idioma de la app. */
private fun dayLabel(iso: String, long: Boolean = false): String {
    val date = runCatching { LocalDate.parse(iso) }.getOrNull() ?: return iso
    val f = DateTimeFormatter.ofPattern(if (long) "d MMMM yyyy" else "EEEE d MMMM", Locale.forLanguageTag(L10n.lang))
    return f.format(date).replaceFirstChar { it.uppercase() }
}

private fun ratingText(n: Int) = tr(R.string.diary_ratingN, n)

private fun snapLine(s: DiarySnap?): String {
    if (s == null) return tr(R.string.diary_noSnap)
    val line = tr(R.string.diary_snap, Surf.fmt(s.h), Surf.fmt(s.tp, 0), Surf.fmt(s.wind, 0), Surf.cardinal(s.windDir), Surf.fmt(s.water))
    val t = s.tide ?: return line
    return "$line · ${tr(R.string.diary_snapTide, Surf.fmt(t.h), if (t.rising) "↗" else "↘")}"
}

@Composable
fun DiaryScreen(app: AppState, openSpot: (String) -> Unit, onBack: () -> Unit) {
    val c = LocalColors.current
    // Leer el estado de Compose hace que la lista se recomponga al borrar.
    val list = app.diaryEntries.let { app.diary.newestFirst }
    val days = list.map { it.date }.distinct()

    Column(Modifier.fillMaxSize().background(c.bg)) {
        Row(Modifier.statusBarsPadding().padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            IconCircleButton(Icons.back, tr(R.string.back), onClick = onBack)
            Column(Modifier.semantics(mergeDescendants = true) { heading() }) {
                Text(tr(R.string.diary_title), style = Type.heading(21.sp), color = c.ink)
                Text(tr(R.string.diary_subtitle), style = Type.body(13.sp), color = c.muted)
            }
        }
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (list.isEmpty()) item {
                Panel { Text(tr(R.string.diary_empty), style = Type.body(), color = c.ink) }
            } else items(days, key = { it }) { d ->
                Panel {
                    Column(Modifier.semantics { heading() }) { PanelTitle(dayLabel(d)) }
                    val items = list.filter { it.date == d }
                    items.forEachIndexed { i, e ->
                        if (i > 0) HorizontalDivider(color = c.line)
                        EntryRow(app, e, openSpot)
                    }
                }
            }
            item { Footer(app.api::legalUrl, showDiary = false) }
            item { Spacer(Modifier.windowInsetsBottomHeight(WindowInsets.navigationBars)) }
        }
    }
}

@Composable
private fun EntryRow(app: AppState, e: DiaryEntry, openSpot: (String) -> Unit) {
    val c = LocalColors.current
    val name = app.api.spotById[e.spotId]?.name ?: e.spotId
    Column(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
            Text(
                name, style = Type.bodySemibold().copy(textDecoration = TextDecoration.Underline), color = c.ink,
                modifier = Modifier.weight(1f).heightIn(min = 48.dp).clickable(role = Role.Button) { openSpot(e.spotId) }.padding(vertical = 12.dp),
            )
            val desc = "${tr(R.string.diary_rating)}: ${ratingText(e.rating)}"
            Text("★".repeat(e.rating) + "☆".repeat(5 - e.rating), style = Type.body(15.sp), color = c.accentText, modifier = Modifier.semantics { contentDescription = desc })
        }
        if (e.notes.isNotEmpty()) Text(e.notes, style = Type.body(15.sp), color = c.ink)
        Text(snapLine(e.snap), style = Type.body(13.sp), color = c.muted)
        val del = tr(R.string.diary_delete, "$name, ${dayLabel(e.date, long = true)}")
        Text(
            tr(R.string.delete), style = Type.bodySemibold(14.sp), color = c.red,
            modifier = Modifier.heightIn(min = 48.dp).clickable(onClickLabel = del, role = Role.Button) {
                app.removeDiary(e.id)
                app.show(tr(R.string.diary_deleted))
            }.semantics { contentDescription = del }.padding(vertical = 14.dp),
        )
    }
}

// Panel del detalle de un spot: lo que te funciona aquí y el formulario para registrar una sesión.
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DiaryPanel(app: AppState, spotId: String, detail: SpotDetail) {
    val c = LocalColors.current
    val open = LocalOpenDiary.current
    var formOpen by remember { mutableStateOf(false) }
    var date by remember { mutableStateOf(LocalDate.now()) }
    var rating by remember { mutableStateOf(3) }
    var notes by remember { mutableStateOf("") }
    var picking by remember { mutableStateOf(false) }
    val iso = date.toString()
    val isToday = iso == DiaryStore.todayISO()
    val insights = app.diaryEntries.let { app.diary.insights(spotId) }

    Panel {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.semantics { heading() }) { PanelTitle(tr(R.string.diary_title)) }
            if (open != null) Text(
                tr(R.string.diary_link), style = Type.body(13.sp).copy(textDecoration = TextDecoration.Underline), color = c.muted,
                modifier = Modifier.heightIn(min = 48.dp).clickable(role = Role.Button, onClick = open).padding(horizontal = 4.dp, vertical = 14.dp),
            )
        }
        if (insights != null) Insights(insights)
        GhostButton(tr(R.string.diary_log)) { formOpen = !formOpen }
        if (formOpen) {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Eyebrow(tr(R.string.diary_date))
                    Text(
                        dayLabel(iso, long = true), style = Type.bodySemibold(), color = c.ink,
                        modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).clip(RoundedCornerShape(10.dp)).background(c.surface2)
                            .clickable(onClickLabel = tr(R.string.diary_date), role = Role.Button) { picking = true }.padding(horizontal = 12.dp, vertical = 13.dp),
                    )
                }
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Eyebrow(tr(R.string.diary_rating))
                    Row(Modifier.fillMaxWidth().semantics { contentDescription = tr(R.string.diary_rating) }, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        (1..5).forEach { n ->
                            Text(
                                "$n", style = Type.bodySemibold(), color = if (rating == n) c.bg else c.ink, textAlign = TextAlign.Center,
                                modifier = Modifier.weight(1f).heightIn(min = 48.dp).clip(RoundedCornerShape(10.dp)).background(if (rating == n) c.ink else c.surface2)
                                    .clickable(role = Role.RadioButton) { rating = n }.semantics { contentDescription = ratingText(n); selected = rating == n }
                                    .padding(vertical = 13.dp),
                            )
                        }
                    }
                }
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Eyebrow(tr(R.string.diary_notes))
                    OutlinedTextField(
                        notes, { notes = it.take(DiaryStore.MAX_NOTES) }, Modifier.fillMaxWidth().semantics { contentDescription = tr(R.string.diary_notes) },
                        textStyle = Type.body(15.sp).copy(color = c.ink), minLines = 3, maxLines = 6,
                        shape = RoundedCornerShape(10.dp),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = c.accent, unfocusedBorderColor = c.line, focusedContainerColor = c.surface2, unfocusedContainerColor = c.surface2, cursorColor = c.accent,
                        ),
                    )
                }
                Text(tr(if (isToday) R.string.diary_snapNote else R.string.diary_noSnapNote), style = Type.body(13.sp), color = c.muted)
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Column(Modifier.weight(1f)) {
                        PrimaryButton(tr(R.string.diary_save)) {
                            if (iso > DiaryStore.todayISO()) return@PrimaryButton app.show(tr(R.string.diary_futureDate))
                            app.addDiary(spotId, iso, rating, notes, DiaryStore.snapshot(detail, iso))
                            app.show(tr(R.string.diary_saved))
                            notes = ""; rating = 3; date = LocalDate.now(); formOpen = false
                        }
                    }
                    Column(Modifier.weight(1f)) { GhostButton(tr(R.string.diary_cancel)) { formOpen = false } }
                }
            }
        }
    }

    if (picking) {
        val todayUtc = LocalDate.now().atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
        val state = rememberDatePickerState(
            initialSelectedDateMillis = date.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli(),
            selectableDates = object : SelectableDates {
                override fun isSelectableDate(utcTimeMillis: Long) = utcTimeMillis <= todayUtc
            },
        )
        DatePickerDialog(
            onDismissRequest = { picking = false },
            confirmButton = {
                TextButton({
                    state.selectedDateMillis?.let { date = Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate() }
                    picking = false
                }) { Text(tr(R.string.diary_save)) }
            },
            dismissButton = { TextButton({ picking = false }) { Text(tr(R.string.diary_cancel)) } },
        ) { DatePicker(state) }
    }
}

@Composable
private fun Insights(ins: DiaryInsights) {
    val c = LocalColors.current
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(tr(R.string.diary_insights_title), style = Type.heading(15.sp), color = c.ink)
        Text(tr(R.string.diary_insights_sub, ins.count), style = Type.body(13.sp), color = c.muted)
        StatRow(tr(R.string.diary_insights_h), ins.h, "m", 1)
        StatRow(tr(R.string.diary_insights_Tp), ins.tp, "s", 0)
        StatRow(tr(R.string.diary_insights_wind), ins.wind, "kn", 0)
        ins.windDir?.let { d ->
            Row(horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.CenterVertically) {
                Eyebrow(tr(R.string.diary_insights_windDir)); Text(d, style = Type.bodySemibold(), color = c.ink)
            }
        }
    }
}

@Composable
private fun StatRow(label: String, st: DiaryStat?, unit: String, digits: Int) {
    if (st == null) return
    val c = LocalColors.current
    Row(horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.CenterVertically) {
        Eyebrow(label)
        Text("${Surf.fmt(st.avg, digits)} $unit", style = Type.bodySemibold(), color = c.ink)
        Text("${Surf.fmt(st.min, digits)}–${Surf.fmt(st.max, digits)} $unit", style = Type.body(13.sp), color = c.muted)
    }
}
