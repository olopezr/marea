package es.marea.app.ui

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import android.net.Uri
import androidx.core.content.FileProvider
import androidx.core.content.res.ResourcesCompat
import es.marea.app.R
import es.marea.app.data.Rating
import es.marea.app.data.Spot
import es.marea.app.data.SpotDetail
import es.marea.app.data.Surf
import es.marea.app.data.tr
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

/** Textos y datos de la tarjeta, sin dibujar nada: así se pueden probar sin pantalla. */
data class ShareCardModel(
    val title: String,
    val subtitle: String,
    val rating: Rating,
    val score: Double,
    val height: String,
    val line: String,
    val stats: List<Pair<String, String>>,
    val stamp: String,
    val host: String,
)

/** Tarjeta de condiciones para compartir (equivale a public/js/sharecard.js): imagen de 1080 x 1350 px. */
object ShareCard {
    const val W = 1080
    const val H = 1350
    private const val M = 72f

    fun model(s: SpotDetail, meta: Spot, now: Long = System.currentTimeMillis(), host: String = "marea.onrender.com"): ShareCardModel {
        val n = s.now
        val stats = buildList {
            add(tr(R.string.card_wind) to Surf.windPhrase(n.windType, n.wind))
            s.tide.h?.let { add(tr(R.string.card_tide) to "${Surf.fmt(it)} m ${if (s.tide.rising == true) "↗" else "↘"}") }
            (s.buoy?.water ?: n.water)?.let { add(tr(R.string.card_water) to "${Surf.fmt(it, 0)} °C") }
        }
        val stamp = SimpleDateFormat("EEE HH:mm", if (es.marea.app.data.L10n.lang == "en") Locale.UK else Locale.forLanguageTag("es-ES"))
            .apply { timeZone = TimeZone.getTimeZone(meta.tz) }.format(Date(now))
        return ShareCardModel(
            title = meta.name,
            subtitle = meta.region,
            rating = Rating.of(s.score),
            score = s.score,
            height = Surf.fmt(n.h),
            line = "${Surf.fmt(n.period, 0)} s · ${Surf.cardinal(n.dir)}",
            stats = stats,
            stamp = stamp,
            host = host,
        )
    }

    /** La tarjeta siempre es oscura, con los colores del modo oscuro de la app. */
    private fun quality(r: Rating) = when (r) {
        Rating.Flat -> 0xFF2A464F
        Rating.Poor -> 0xFF4F7F8A
        Rating.Fair -> 0xFFE2B046
        Rating.Good -> 0xFFA6C64C
        Rating.Epic -> 0xFF5CC48C
    }.toInt()

    /** Mayor tamaño de letra, entre `minPx` y `startPx`, con el que `text` cabe en `maxWidth`. */
    internal fun fitSize(measure: (Float) -> Float, startPx: Float, minPx: Float, maxWidth: Float): Float {
        var size = startPx
        while (size > minPx) {
            if (measure(size) <= maxWidth) return size
            size -= 4f
        }
        return minPx
    }

    fun render(context: Context, m: ShareCardModel): Bitmap {
        fun font(res: Int) = ResourcesCompat.getFont(context, res) ?: Typeface.DEFAULT
        val display = font(R.font.archivo_expanded_extrabold)
        val body = font(R.font.figtree_regular)
        val semibold = font(R.font.figtree_semibold)
        val mono = font(R.font.jetbrainsmono_bold)

        val bmp = Bitmap.createBitmap(W, H, Bitmap.Config.ARGB_8888)
        val cv = Canvas(bmp)
        val p = Paint(Paint.ANTI_ALIAS_FLAG)
        val white = 0xFFFFFFFF.toInt()
        fun alpha(a: Float) = ((a * 255).toInt() shl 24) or 0xFFFFFF

        p.shader = LinearGradient(0f, 0f, 0f, H.toFloat(), 0xFF0F3A47.toInt(), 0xFF06161B.toInt(), Shader.TileMode.CLAMP)
        cv.drawRect(0f, 0f, W.toFloat(), H.toFloat(), p)
        p.shader = null

        // Olas de adorno al pie.
        p.style = Paint.Style.STROKE
        p.strokeWidth = 6f
        p.color = alpha(0.07f)
        for (k in 0 until 4) {
            val path = Path()
            var x = 0f
            while (x <= W) {
                val y = H - 90f + k * 26f + sin(x / W * Math.PI * 4 + k).toFloat() * 14f
                if (x == 0f) path.moveTo(x, y) else path.lineTo(x, y)
                x += 8f
            }
            cv.drawPath(path, p)
        }
        p.style = Paint.Style.FILL

        fun text(s: String, x: Float, y: Float, size: Float, tf: Typeface, color: Int, right: Boolean = false) {
            p.typeface = tf
            p.textSize = size
            p.color = color
            p.textAlign = if (right) Paint.Align.RIGHT else Paint.Align.LEFT
            cv.drawText(s, x, y, p)
        }
        fun fit(s: String, tf: Typeface, start: Float, minPx: Float, maxW: Float): Float {
            p.typeface = tf
            return fitSize({ px -> p.textSize = px; p.measureText(s) }, start, minPx, maxW)
        }

        text("MAREA", M, 110f, 36f, display, white)
        text(m.stamp, W - M, 110f, 30f, body, alpha(0.6f), right = true)
        text(m.title, M, 250f, fit(m.title, display, 112f, 52f, W - 2 * M), display, white)
        text(m.subtitle, M, 312f, 40f, body, alpha(0.65f))

        // Calidad: etiqueta de color y cinco barras con la puntuación.
        val color = quality(m.rating)
        val label = m.rating.label.uppercase()
        p.typeface = display
        p.textSize = 40f
        val lw = p.measureText(label) + 64f
        p.color = color
        cv.drawRoundRect(RectF(M, 370f, M + lw, 446f), 38f, 38f, p)
        text(label, M + 32f, 424f, 40f, display, 0xFF06161B.toInt())
        for (i in 0 until 5) {
            val x = M + lw + 36f + i * 64f
            val bar = RectF(x, 396f, x + 52f, 420f)
            p.color = alpha(0.15f)
            cv.drawRoundRect(bar, 12f, 12f, p)
            val f = max(0.0, min(1.0, m.score - i)).toFloat()
            if (f > 0f) {
                cv.save()
                cv.clipRect(x, 396f, x + 52f * f, 420f)
                p.color = color
                cv.drawRoundRect(bar, 12f, 12f, p)
                cv.restore()
            }
        }

        // Altura de ola, grande.
        text(m.height, M, 790f, 330f, display, white)
        p.typeface = display
        p.textSize = 330f
        val hw = p.measureText(m.height)
        text("m", M + hw + 24f, 790f, 110f, display, alpha(0.7f))
        text(m.line, M, 880f, 64f, mono, white)

        // Resto de datos.
        var y = 930f
        for ((k, v) in m.stats) {
            text(k.uppercase(), M, y, 28f, semibold, alpha(0.55f))
            text(v, M, y + 58f, fit(v, semibold, 54f, 30f, W - 2 * M), semibold, white)
            y += 116f
        }
        text(m.host, M, H - 50f, 30f, body, alpha(0.55f))
        return bmp
    }

    /** Guarda la tarjeta en la caché y devuelve su URI para compartirla (FileProvider). */
    fun save(context: Context, bitmap: Bitmap, id: String): Uri {
        val dir = File(context.cacheDir, "share").apply { mkdirs() }
        val file = File(dir, "marea-$id.png")
        file.outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        return FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
    }
}
