package es.marea.app

import es.marea.app.data.Rating
import es.marea.app.data.Spot
import es.marea.app.data.SpotDetail
import es.marea.app.data.json
import es.marea.app.ui.ShareCard
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

// Tarjeta de condiciones para compartir: los textos (el dibujo se comprueba en el emulador).
class ShareCardTest {
    @org.junit.Before fun espanol() {
        es.marea.app.data.L10n.setEnglishForTests(false)
        val xml = java.io.File("src/main/res/values/strings.xml").readText()
        val byName = Regex("""<string name="(\w+)"[^>]*>(.*?)</string>""").findAll(xml)
            .associate { it.groupValues[1] to it.groupValues[2].removeSurrounding("\"").replace("\\'", "'").replace("&amp;", "&") }
        val byId = es.marea.app.R.string::class.java.fields.associate { it.getInt(null) to byName[it.name] }
        es.marea.app.data.L10n.testLookup = { id, args -> String.format(java.util.Locale.ROOT, byId[id]!!, *args) }
    }

    private val somo = Spot("somo", "Somo", "Cantabria", 43.459, -3.736, 345.0, "low", "Europe/Madrid")
    private fun detail() = json.decodeFromString(SpotDetail.serializer(), javaClass.classLoader!!.getResource("somo.json")!!.readText())

    @Test fun `reune los textos de la tarjeta`() {
        val m = ShareCard.model(detail(), somo, now = 1_790_000_000_000L, host = "marea.test")
        assertEquals("Somo", m.title)
        assertEquals("Cantabria", m.subtitle)
        assertTrue(m.height.isNotEmpty())
        assertTrue(m.line.contains(" s · "))
        assertEquals("Viento", m.stats.first().first)
        assertEquals("marea.test", m.host)
        assertTrue(m.stamp.isNotEmpty())
        assertEquals(Rating.of(detail().score), m.rating)
    }

    @Test fun `fitSize reduce la letra hasta que el texto cabe y respeta el minimo`() {
        val perChar = { px: Float -> 0.5f * px * 23 } // 23 caracteres a media anchura
        val size = ShareCard.fitSize(perChar, 112f, 52f, 880f)
        assertTrue(size < 112f && size >= 52f)
        assertTrue(perChar(size) <= 880f)
        assertEquals(112f, ShareCard.fitSize({ px -> px * 3 }, 112f, 52f, 880f), 0f) // cabe a tamaño completo
        assertEquals(52f, ShareCard.fitSize({ px -> px * 400 }, 112f, 52f, 880f), 0f) // no baja del mínimo
    }
}
