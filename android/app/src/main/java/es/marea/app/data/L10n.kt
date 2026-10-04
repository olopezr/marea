package es.marea.app.data

import android.content.res.Resources
import androidx.annotation.StringRes
import es.marea.app.R

// Idioma de la app: Android elige entre values (español, por defecto) y values-en según el idioma del
// móvil. Los textos se generan con scripts/i18n.mjs a partir de i18n/strings.json (los mismos que usan
// la web y la app de iOS). `english` también decide la coma o el punto decimal y Oeste (O) o West (W).
object L10n {
    private var res: Resources? = null
    var english = false
        private set

    fun init(resources: Resources) {
        res = resources
        english = resources.getString(R.string.lang) == "en"
    }

    /** Solo para los tests sin Android: idioma y textos (los tests leen res/values/strings.xml). */
    fun setEnglishForTests(on: Boolean) { english = on }
    var testLookup: ((Int, Array<out Any>) -> String)? = null

    val lang get() = if (english) "en" else "es"

    fun t(@StringRes id: Int, vararg args: Any): String = res?.getString(id, *args) ?: testLookup!!(id, args)
}

/** Texto traducido fuera de Compose. */
fun tr(@StringRes id: Int, vararg args: Any): String = L10n.t(id, *args)
