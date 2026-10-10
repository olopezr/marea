package es.marea.app

import es.marea.app.data.Overview
import es.marea.app.data.SpotDetail
import es.marea.app.data.SpotWarning
import es.marea.app.data.json
import es.marea.app.ui.WarningText
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

// Avisos oficiales de la AEMET: forma que envía el servidor (server/sources/aemet.js) y textos derivados.
class WarningTest {
    private fun fixture(name: String) = javaClass.classLoader!!.getResource("$name.json")!!.readText()

    private val warningJson = """{"id":"w1","level":"naranja","phenomenon":"Costeros","zone":"Litoral cántabro",
        "active":true,"start":1700000000000,"end":1700086400000,"desc":"Fenómenos costeros"}"""

    @Test fun `decodifica el aviso de un spot`() {
        val w = json.decodeFromString(SpotWarning.serializer(), warningJson)
        assertEquals("naranja", w.level)
        assertEquals("Costeros", w.phenomenon)
        assertEquals(true, w.active)
        assertEquals(1700000000000.0, w.start!!, 0.0)
        assertNull(w.details) // el listado no trae el texto oficial
    }

    @Test fun `decodifica el texto oficial del detalle`() {
        val w = json.decodeFromString(
            SpotWarning.serializer(),
            """{"level":"rojo","details":{"es":{"description":"Mar gruesa","instruction":"No salga"},"en":{"description":"Rough sea"}}}""",
        )
        assertEquals("Mar gruesa", w.details?.es?.description)
        assertEquals("Rough sea", w.details?.en?.description)
        assertNull(w.details?.en?.instruction)
    }

    @Test fun `un resumen con aviso nulo o sin aviso decodifica`() {
        val absent = json.decodeFromString(Overview.serializer(), fixture("overview"))
        assertNull(absent.spots.first().warning)
        assertNull(json.decodeFromString(SpotDetail.serializer(), fixture("somo")).warning)
    }

    @Test fun `el nivel desconocido o ausente cuenta como amarillo`() {
        assertEquals("amarillo", WarningText.level(null))
        assertEquals("amarillo", WarningText.level("morado"))
        assertEquals("rojo", WarningText.level("Rojo"))
        assertEquals("naranja", WarningText.level("naranja"))
    }

    @Test fun `la descripcion prefiere el idioma y cae al espanol y al texto corto`() {
        val en = json.decodeFromString(SpotWarning.serializer(), """{"desc":"corto","details":{"es":{"description":"largo es"},"en":{"description":"long en"}}}""")
        assertEquals("long en", WarningText.description(en, english = true))
        assertEquals("largo es", WarningText.description(en, english = false))
        val short = json.decodeFromString(SpotWarning.serializer(), """{"desc":"corto"}""")
        assertEquals("corto", WarningText.description(short, english = true))
        assertEquals("", WarningText.description(SpotWarning(), english = false))
    }

    @Test fun `la recomendacion oficial sigue el mismo orden`() {
        val w = json.decodeFromString(SpotWarning.serializer(), """{"details":{"es":{"instruction":"Precaución"}}}""")
        assertEquals("Precaución", WarningText.instruction(w, english = true))
        assertEquals("", WarningText.instruction(SpotWarning(), english = false))
    }
}
