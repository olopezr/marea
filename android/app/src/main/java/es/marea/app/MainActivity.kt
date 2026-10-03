package es.marea.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import es.marea.app.ui.MareaRoot

class MainActivity : ComponentActivity() {
    private val state get() = (application as MareaApp).state

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        handle(intent)
        setContent { MareaRoot(state) }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handle(intent)
    }

    // Aviso tocado (extra "url" = "/#/spot/<id>") o enlace marea://spot/<id>.
    private fun handle(intent: Intent?) {
        intent ?: return
        intent.getStringExtra("url")?.let { state.open(it) }
        intent.data?.takeIf { it.scheme == "marea" && it.host == "spot" }?.lastPathSegment?.let { state.open("/#/spot/$it") }
    }
}
