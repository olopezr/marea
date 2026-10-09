package es.marea.app

import es.marea.app.data.AlertPref
import es.marea.app.data.AlertState
import es.marea.app.data.json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// Ajustes de avisos por spot: lo que la app recibe del servidor y lo que le envía.
class AlertsTest {
    private fun decode(text: String) = json.decodeFromString(AlertState.serializer(), text)

    @Test fun `un servidor sin ajustes por spot sigue decodificando`() {
        val st = decode("""{"subscribed":true,"spots":["somo"],"minScore":3}""")
        assertEquals(listOf("somo"), st.spots)
        assertTrue(st.prefs.isEmpty())
    }

    @Test fun `decodifica los ajustes de cada spot`() {
        val st = decode("""{"subscribed":true,"spots":["somo"],"minScore":3,"prefs":{"somo":{"min":4,"offshore":true,"from":9,"to":20}}}""")
        assertEquals(AlertPref(min = 4, offshore = true, from = 9, to = 20), st.prefs["somo"])
    }

    @Test fun `normalized descarta los valores por defecto y los no validos`() {
        assertTrue(AlertPref(min = 9, offshore = false, from = 7, to = 22).normalized.isDefault)
        assertNull(AlertPref(from = 9, to = 8).normalized.from) // franja al revés
        assertNull(AlertPref(from = 5, to = 20).normalized.from) // fuera del horario de avisos
        val ok = AlertPref(min = 3, offshore = true, from = 9, to = 20)
        assertEquals(ok, ok.normalized)
        assertFalse(ok.isDefault)
    }

    @Test fun `solo se envian los ajustes que se han tocado`() {
        val text = json.encodeToString(kotlinx.serialization.builtins.MapSerializer(kotlinx.serialization.serializer<String>(), AlertPref.serializer()), mapOf("somo" to AlertPref(min = 4)))
        assertEquals("""{"somo":{"min":4}}""", text)
    }
}
