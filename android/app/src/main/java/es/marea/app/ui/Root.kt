package es.marea.app.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import es.marea.app.AppState

@Composable
fun MareaRoot(app: AppState) {
    MareaTheme {
        val nav = rememberNavController()
        LaunchedEffect(Unit) { app.alerts.load() }
        // Aviso tocado: abre el spot encima de la lista.
        LaunchedEffect(app.pendingSpot) {
            val id = app.pendingSpot ?: return@LaunchedEffect
            app.pendingSpot = null
            nav.navigate("spot/$id") { popUpTo("list") }
        }
        CompositionLocalProvider(LocalOpenDiary provides { nav.navigate("diary") }) { Box(Modifier.fillMaxSize()) {
            NavHost(nav, startDestination = "list") {
                composable("list") {
                    ListScreen(app, openSpot = { nav.navigate("spot/$it") }, openAlerts = { nav.navigate("alerts") }, openMap = { nav.navigate("map") })
                }
                composable("spot/{id}") { entry ->
                    SpotScreen(app, entry.arguments?.getString("id").orEmpty(), onBack = { nav.popBackStack() })
                }
                composable("alerts") { AlertsScreen(app, onBack = { nav.popBackStack() }) }
                composable("diary") { DiaryScreen(app, openSpot = { nav.navigate("spot/$it") }, onBack = { nav.popBackStack() }) }
                composable("map") { MapScreen(app, openSpot = { nav.navigate("spot/$it") }, onBack = { nav.popBackStack() }) }
            }
            Toast(app.toast, Modifier.align(Alignment.BottomCenter).navigationBarsPadding())
        } }
    }
}
