package es.marea.app

import es.marea.app.data.AlertPref
import es.marea.app.data.AlertRule
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
        assertNull(st.prefs) // con un servidor antiguo no se ofrecen los ajustes por spot
    }

    @Test fun `decodifica los ajustes de cada spot`() {
        val st = decode("""{"subscribed":true,"spots":["somo"],"minScore":3,"prefs":{"somo":{"min":4,"offshore":true,"from":9,"to":20}}}""")
        assertEquals(AlertPref(min = 4, offshore = true, from = 9, to = 20), st.prefs?.get("somo"))
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

    private fun enc(m: Map<String, AlertPref>) = json.encodeToString(kotlinx.serialization.builtins.MapSerializer(kotlinx.serialization.serializer<String>(), AlertPref.serializer()), m)

    @Test fun `la regla se ordena, redondea y acota`() {
        val r = AlertRule(hMin = 2.04, hMax = 1.2, windMax = 99, wind = "off", tide = "mid", ahead = 100).normalized
        assertEquals(AlertRule(hMin = 1.2, hMax = 2.0, windMax = null, wind = "off", tide = "mid", ahead = 48), r)
    }

    @Test fun `la regla descarta los valores por defecto`() {
        assertNull(AlertRule(hMin = 0.0, hMax = 10.0, windMax = 60, wind = "any", tide = "any", ahead = 24).normalized)
        assertEquals(AlertRule(hMin = 1.5), AlertRule(hMin = 1.5, ahead = 24).normalized)
    }

    @Test fun `la antelacion sola no es una regla`() {
        assertNull(AlertRule(ahead = 12).normalized)
        assertNull(AlertRule(ahead = 48).normalized)
    }

    @Test fun `la regla ignora valores no validos`() {
        assertNull(AlertRule(hMin = Double.NaN, wind = "x", tide = "huge").normalized)
        assertEquals(AlertRule(windMax = 0), AlertRule(windMax = -4).normalized)
    }

    @Test fun `la regla se envia sin las claves vacias`() {
        assertEquals("""{"hMin":1.5,"tide":"low"}""", json.encodeToString(AlertRule.serializer(), AlertRule(hMin = 1.5, tide = "low")))
        assertEquals("""{"somo":{"min":4,"rule":{"windMax":12}}}""", enc(mapOf("somo" to AlertPref(min = 4, rule = AlertRule(windMax = 12)).normalized)))
    }

    @Test fun `un spot con regla no es por defecto y la regla se normaliza`() {
        assertFalse(AlertPref(rule = AlertRule(hMin = 1.0)).isDefault)
        assertTrue(AlertPref(rule = AlertRule(ahead = 12)).isDefault)
        assertNull(AlertPref(rule = AlertRule(ahead = 12)).normalized.rule)
        assertEquals(AlertRule(hMin = 1.0, hMax = 3.0), AlertPref(rule = AlertRule(hMin = 3.0, hMax = 1.0)).normalized.rule)
    }

    @Test fun `decodifica la regla del servidor`() {
        val st = decode("""{"subscribed":true,"spots":["somo"],"minScore":3,"prefs":{"somo":{"rule":{"hMin":1.2,"windMax":15,"wind":"off","tide":"high","ahead":36}}}}""")
        assertEquals(AlertRule(hMin = 1.2, windMax = 15, wind = "off", tide = "high", ahead = 36), st.prefs?.get("somo")?.rule)
    }
}
