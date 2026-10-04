package es.marea.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import es.marea.app.AppState
import es.marea.app.R
import es.marea.app.data.Cached
import es.marea.app.data.Overview
import es.marea.app.data.Rating
import es.marea.app.data.Surf
import es.marea.app.data.tr
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.geometry.LatLngBounds
import org.maplibre.android.maps.Style
import org.maplibre.android.style.expressions.Expression
import org.maplibre.android.style.layers.CircleLayer
import org.maplibre.android.style.layers.PropertyFactory
import org.maplibre.android.style.sources.GeoJsonSource
import org.maplibre.geojson.Feature
import org.maplibre.geojson.FeatureCollection
import org.maplibre.geojson.Point

// Mapa de todos los spots, coloreados según la valoración de ahora (renderMap en public/js/app.js).
// Al tocar un spot se muestra su resumen y desde ahí se abre la previsión.
@Composable
fun MapScreen(app: AppState, openSpot: (String) -> Unit, onBack: () -> Unit) {
    val c = LocalColors.current
    var result by remember { mutableStateOf<Cached<Overview>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var selected by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) {
        try { result = app.api.overview(false) } catch (e: Exception) { error = e.message ?: tr(R.string.error_connect) }
    }
    val spots = result?.data?.spots.orEmpty()
    val density = androidx.compose.ui.platform.LocalDensity.current.density

    Column(Modifier.fillMaxSize().background(c.bg)) {
        Row(Modifier.statusBarsPadding().padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            IconCircleButton(Icons.back, tr(R.string.back), onClick = onBack)
            Column(Modifier.weight(1f).semantics(mergeDescendants = true) { heading() }) {
                Text(tr(R.string.map_title), style = Type.heading(21.sp), color = c.ink)
                Text(tr(R.string.map_hint), style = Type.body(13.sp), color = c.muted, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
        }
        Box(Modifier.weight(1f).fillMaxWidth()) {
            if (spots.isNotEmpty()) {
                val mapView = rememberMapView()
                val colors = Rating.entries.associate { it.name to c.q(it).toArgb() }
                AndroidView(
                    factory = {
                        mapView.apply {
                            getMapAsync { map ->
                                // Se abre sobre la Península y Baleares; Canarias queda a un desplazamiento.
                                val main = spots.filter { it.lat > 34 }.ifEmpty { spots }
                                val bounds = LatLngBounds.Builder().includes(main.map { LatLng(it.lat, it.lon) }).build()
                                map.moveCamera(CameraUpdateFactory.newLatLngBounds(bounds, (24 * density).toInt()))
                                // Los mejores, encima.
                                val features = spots.sortedBy { it.score }.map { s ->
                                    Feature.fromGeometry(Point.fromLngLat(s.lon, s.lat)).apply {
                                        addStringProperty("id", s.id)
                                        addStringProperty("q", Rating.of(s.score).name)
                                    }
                                }
                                map.setStyle(Style.Builder().fromUri(MAP_STYLE)) { style ->
                                    style.addSource(GeoJsonSource("spots", FeatureCollection.fromFeatures(features)))
                                    val stops = colors.flatMap { (k, v) -> listOf(Expression.literal(k), Expression.color(v)) }.toTypedArray()
                                    style.addLayer(
                                        CircleLayer("spots", "spots").withProperties(
                                            PropertyFactory.circleRadius(8f),
                                            PropertyFactory.circleStrokeWidth(2f),
                                            PropertyFactory.circleStrokeColor(android.graphics.Color.WHITE),
                                            // match(entrada, etiqueta1, color1, …, color por defecto)
                                            PropertyFactory.circleColor(Expression.match(Expression.get("q"), *stops, Expression.color(android.graphics.Color.GRAY))),
                                        ),
                                    )
                                }
                                map.addOnMapClickListener { point ->
                                    val hit = map.queryRenderedFeatures(map.projection.toScreenLocation(point), "spots").firstOrNull()
                                    selected = hit?.getStringProperty("id")
                                    hit != null
                                }
                            }
                        }
                    },
                    modifier = Modifier.fillMaxSize(),
                )
            } else if (error != null) {
                Box(Modifier.padding(16.dp)) { ErrorBox(error!!) }
            }
            Column(Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                spots.firstOrNull { it.id == selected }?.let { s ->
                    Row(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(c.surface).clickable(onClickLabel = tr(R.string.card_open, s.name)) { openSpot(s.id) }.padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text(s.name, style = Type.heading(19.sp), color = c.ink)
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                RatingChip(Rating.of(s.score))
                                Text("${Surf.fmt(s.now.h)} m · ${Surf.fmt(s.now.period, 0)} s", style = Type.mono(14.sp), color = c.ink)
                            }
                        }
                        Icon(Icons.back, contentDescription = null, tint = c.muted, modifier = Modifier.size(18.dp).rotate(180f))
                    }
                }
                Row(
                    Modifier.fillMaxWidth().clip(CircleShape).background(c.surface.copy(alpha = 0.92f)).padding(horizontal = 12.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically,
                ) {
                    Rating.entries.forEach { r ->
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                            Box(Modifier.size(10.dp).clip(CircleShape).background(c.q(r)))
                            Text(r.label, style = Type.body(12.sp), color = c.ink, maxLines = 1, softWrap = false)
                        }
                    }
                }
                Spacer(Modifier.size(0.dp))
            }
        }
    }
}
