package es.marea.app.ui

import es.marea.app.R

import es.marea.app.data.tr

import android.content.Intent
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import android.net.Uri
import androidx.core.net.toUri
import es.marea.app.data.Surf
import androidx.compose.ui.graphics.toArgb
import org.maplibre.android.camera.CameraPosition
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.maps.Style
import org.maplibre.android.style.layers.CircleLayer
import org.maplibre.android.style.layers.PropertyFactory
import org.maplibre.android.style.sources.GeoJsonSource
import org.maplibre.geojson.Point

// Dónde está la playa: mapa (OpenFreeMap) y coordenadas. Al tocar se abre la ruta hasta la playa
// (Google Maps, o la app de mapas que haya si no está instalado).
@Composable
fun LocationPanel(name: String, lat: Double, lon: Double) {
    val c = LocalColors.current
    val context = LocalContext.current
    val open = {
        val route = "https://www.google.com/maps/dir/?api=1&destination=$lat,$lon".toUri()
        runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, route)) }
            .onFailure { context.startActivity(Intent(Intent.ACTION_VIEW, "geo:$lat,$lon?q=$lat,$lon(${Uri.encode(name)})".toUri())) }
        Unit
    }
    Panel {
        PanelTitle(tr(R.string.loc_title))
        Box(Modifier.fillMaxWidth().height(200.dp).clip(RoundedCornerShape(12.dp))) {
            val mapView = rememberMapView()
            val pin = c.accent.toArgb()
            AndroidView(
                factory = {
                    mapView.apply {
                        getMapAsync { map ->
                            map.uiSettings.setAllGesturesEnabled(false)
                            map.cameraPosition = CameraPosition.Builder().target(LatLng(lat, lon)).zoom(13.5).build()
                            map.setStyle(Style.Builder().fromUri(MAP_STYLE)) { style ->
                                style.addSource(GeoJsonSource("spot", Point.fromLngLat(lon, lat)))
                                style.addLayer(
                                    CircleLayer("spot", "spot").withProperties(
                                        PropertyFactory.circleRadius(8f),
                                        PropertyFactory.circleColor(pin),
                                        PropertyFactory.circleStrokeWidth(2.5f),
                                        PropertyFactory.circleStrokeColor(android.graphics.Color.WHITE),
                                    ),
                                )
                            }
                        }
                    }
                },
                modifier = Modifier.matchParentSize(),
            )
            // Capa encima del mapa: el mapa no roba el desplazamiento de la pantalla y un toque lo abre.
            Box(
                Modifier.matchParentSize().clickable(role = Role.Button, onClickLabel = tr(R.string.loc_directions), onClick = open)
                    .semantics { contentDescription = tr(R.string.loc_map, name) },
            )
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            SelectionContainer { Text(Surf.coords(lat, lon), style = Type.mono(13.sp), color = c.ink) }
            Spacer(Modifier.weight(1f))
            Box(Modifier.heightIn(min = 48.dp).clickable(role = Role.Button, onClick = open), contentAlignment = Alignment.Center) {
                Text(tr(R.string.loc_directions), style = Type.bodySemibold(14.sp), color = c.accentText)
            }
        }
    }
}
