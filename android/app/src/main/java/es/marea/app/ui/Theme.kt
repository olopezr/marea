package es.marea.app.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import es.marea.app.R
import es.marea.app.data.Rating

// Colores y tipografías de public/css/app.css, en claro y oscuro.
@Immutable
data class MareaColors(
    val bg: Color, val surface: Color, val surface2: Color, val ink: Color, val muted: Color, val line: Color,
    val accent: Color, val sea: Color, val green: Color, val red: Color,
    val qFlat: Color, val qPoor: Color, val qFair: Color, val qGood: Color, val qEpic: Color,
    // Texto pequeño con el contraste mínimo de accesibilidad (4,5:1) sobre fondos claros o tintados.
    val accentText: Color, val greenText: Color, val qText: List<Color>,
    /** Proporción del color de la valoración en el recuadro superior (en oscuro el recuadro es claro). */
    val heroMix: Float,
) {
    fun qText(r: Rating) = qText[r.ordinal]

    fun q(r: Rating) = when (r) {
        Rating.Flat -> qFlat
        Rating.Poor -> qPoor
        Rating.Fair -> qFair
        Rating.Good -> qGood
        Rating.Epic -> qEpic
    }
}

val LightColors = MareaColors(
    bg = Color(0xFFE9EFF0), surface = Color(0xFFF7FAFA), surface2 = Color(0xFFDFE8EA), ink = Color(0xFF0D2A33),
    muted = Color(0xFF557079), line = Color(0xFFC6D4D7), accent = Color(0xFFD9502A), sea = Color(0xFF1F6F80),
    green = Color(0xFF2C8A5A), red = Color(0xFFC62828),
    qFlat = Color(0xFFB9C7CA), qPoor = Color(0xFF6F9AA5), qFair = Color(0xFFD1A22A), qGood = Color(0xFF7C9A26), qEpic = Color(0xFF2C8A5A),
    accentText = Color(0xFFAA472C), greenText = Color(0xFF257351),
    qText = listOf(Color(0xFF596F75), Color(0xFF486D77), Color(0xFF73682E), Color(0xFF526F2B), Color(0xFF247150)),
    heroMix = 0.72f,
)

val DarkColors = MareaColors(
    bg = Color(0xFF071A20), surface = Color(0xFF0D252D), surface2 = Color(0xFF133039), ink = Color(0xFFDCE9EB),
    muted = Color(0xFF8FA9AF), line = Color(0xFF1D3A43), accent = Color(0xFFFF7A4D), sea = Color(0xFF5BB6C6),
    green = Color(0xFF5CC48C), red = Color(0xFFFF6B6B),
    qFlat = Color(0xFF2A464F), qPoor = Color(0xFF4F7F8A), qFair = Color(0xFFE2B046), qGood = Color(0xFFA6C64C), qEpic = Color(0xFF5CC48C),
    accentText = Color(0xFFFF7A4D), greenText = Color(0xFF5CC48C),
    qText = listOf(Color(0xFF7E9398), Color(0xFF799FA7), Color(0xFFE2B046), Color(0xFFA6C64C), Color(0xFF5CC48C)),
    heroMix = 0.6f,
)

val LocalColors = staticCompositionLocalOf { LightColors }

/** Equivalente a color-mix(in srgb, a p%, b). */
fun mix(a: Color, p: Float, b: Color) = lerp(b, a, p)

object Fonts {
    val display = FontFamily(Font(R.font.archivo_expanded_extrabold))
    val heading = FontFamily(Font(R.font.archivo_bold))
    val body = FontFamily(Font(R.font.figtree_regular))
    val bodySemibold = FontFamily(Font(R.font.figtree_semibold))
    val mono = FontFamily(Font(R.font.jetbrainsmono_semibold))
    val monoBold = FontFamily(Font(R.font.jetbrainsmono_bold))
}

object Type {
    fun display(size: TextUnit) = TextStyle(fontFamily = Fonts.display, fontSize = size, lineHeight = size * 1.0)
    fun heading(size: TextUnit) = TextStyle(fontFamily = Fonts.heading, fontSize = size, lineHeight = size * 1.1)
    fun body(size: TextUnit = 16.sp) = TextStyle(fontFamily = Fonts.body, fontSize = size, lineHeight = size * 1.4)
    fun bodySemibold(size: TextUnit = 16.sp) = TextStyle(fontFamily = Fonts.bodySemibold, fontSize = size, lineHeight = size * 1.4)
    fun mono(size: TextUnit) = TextStyle(fontFamily = Fonts.mono, fontSize = size, lineHeight = size * 1.3)
    fun monoBold(size: TextUnit) = TextStyle(fontFamily = Fonts.monoBold, fontSize = size, lineHeight = size * 1.3)
    val eyebrow = TextStyle(fontFamily = Fonts.mono, fontSize = 10.5.sp, letterSpacing = 0.1.em)
}

@Composable
fun MareaTheme(content: @Composable () -> Unit) {
    val dark = isSystemInDarkTheme()
    val c = if (dark) DarkColors else LightColors
    val scheme = (if (dark) darkColorScheme() else lightColorScheme()).copy(
        primary = c.accent, background = c.bg, surface = c.surface, onSurface = c.ink, onBackground = c.ink,
        surfaceVariant = c.surface2, outline = c.line,
    )
    CompositionLocalProvider(LocalColors provides c) {
        MaterialTheme(colorScheme = scheme, content = content)
    }
}
