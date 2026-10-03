package es.marea.app

import es.marea.app.data.Overview
import es.marea.app.data.Rating
import es.marea.app.data.SeriesPoint
import es.marea.app.data.SpotDetail
import es.marea.app.data.Surf
import es.marea.app.data.json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SurfTest {
    @Test fun fmtUsaComaYRedondeaComoJavaScript() {
        assertEquals("1,3", Surf.fmt(1.25))
        assertEquals("1,1", Surf.fmt(1.15))
        assertEquals("13", Surf.fmt(13.0, 0))
        assertEquals("–", Surf.fmt(null))
        assertEquals("–", Surf.fmt(Double.NaN))
    }

    @Test fun cardinal() {
        assertEquals("N", Surf.cardinal(0.0))
        assertEquals("NO", Surf.cardinal(315.0))
        assertEquals("NO", Surf.cardinal(-45.0))
        assertEquals("SSO", Surf.cardinal(200.0))
        assertEquals("–", Surf.cardinal(null))
    }

    @Test fun rating() {
        assertEquals(Rating.Flat, Rating.of(0.4))
        assertEquals(Rating.Fair, Rating.of(2.0))
        assertEquals(Rating.Good, Rating.of(3.9))
        assertEquals(Rating.Epic, Rating.of(5.0))
    }

    @Test fun horaEnLaZonaDelSpot() {
        val ms = 1_791_015_600_000.0 // 2026-10-03 08:20 UTC
        assertEquals("10:20", Surf.hhmm(ms, "Europe/Madrid"))
        assertEquals("09:20", Surf.hhmm(ms, "Atlantic/Canary"))
    }

    @Test fun busquedaSinTildes() {
        assertTrue(Surf.matches("La Cícer", "Gran Canaria", "cicer"))
        assertTrue(Surf.matches("Somo", "Cantabria", "cant somo"))
        assertFalse(Surf.matches("Somo", "Cantabria", "lanzarote"))
    }

    @Test fun interpolacionDeMarea() {
        val pts = listOf(SeriesPoint(0.0, 1.0), SeriesPoint(100.0, 3.0), SeriesPoint(200.0, 2.0))
        val at = Surf.tideAt(pts, 50.0)!!
        assertEquals(2.0, at.h, 1e-9)
        assertTrue(at.rising)
        assertFalse(Surf.tideAt(pts, 150.0)!!.rising)
        assertNull(Surf.valueAt(pts, 50.0, maxGap = 10.0))
        assertNull(Surf.tideAt(pts, 300.0))
    }

    @Test fun duracionYCentimetros() {
        assertEquals("1 h 35 min", Surf.duration(95 * 60_000.0))
        assertEquals("20 min", Surf.duration(20 * 60_000.0))
        assertEquals("Viento y presión: bajan el mar 12 cm", Surf.surgeText(-0.124))
        assertEquals("Viento y presión: suben el mar 5 cm", Surf.surgeText(0.05))
        assertEquals("Viento y presión: sin efecto apreciable", Surf.surgeText(0.02))
        assertEquals("Viento y presión: sin dato a esta hora", Surf.surgeText(null))
    }

    @Test fun indiceUV() {
        assertEquals("Bajo", Surf.uvLabel(2.4))
        assertEquals("Moderado", Surf.uvLabel(2.6))
        assertEquals("Alto", Surf.uvLabel(7.0))
        assertEquals("Muy alto", Surf.uvLabel(9.0))
        assertEquals("Extremo", Surf.uvLabel(11.2))
        assertEquals("crema solar y gorra", Surf.uvAdvice(6.0))
    }

    @Test fun proximaMareaIdeal() {
        val tz = "Europe/Madrid"; val h = 3_600_000.0; val day = 1_790_978_400_000.0 // 3/10/2026 00:00 en Madrid
        val ext = listOf(
            es.marea.app.data.TideExtreme(day + 3 * h, 1.4, "low"), es.marea.app.data.TideExtreme(day + 9 * h, 3.6, "high", 55),
            es.marea.app.data.TideExtreme(day + 15 * h, 1.5, "low"), es.marea.app.data.TideExtreme(day + 21 * h, 3.3, "high", 45),
            es.marea.app.data.TideExtreme(day + 27 * h, 1.4, "low"),
        )
        val now = day + 16 * h; val end = day + 24 * h
        assertEquals("Próxima pleamar a las 21:00", Surf.idealTideText("high", ext, now, end, tz))
        assertEquals("Próxima bajamar mañana a las 03:00", Surf.idealTideText("low", ext, now, end, tz))
        assertEquals("Próxima media marea hacia las 18:00", Surf.idealTideText("mid", ext, now, end, tz))
        assertEquals("Funciona con cualquier marea", Surf.idealTideText("all", ext, now, end, tz))
    }

    private fun fixture(name: String) = javaClass.classLoader!!.getResource("$name.json")!!.readText()

    @Test fun decodificaLaLista() {
        val o = json.decodeFromString(Overview.serializer(), fixture("overview"))
        assertEquals(27, o.spots.size)
        assertTrue(o.spots[0].now.windType.label.isNotEmpty())
    }

    @Test fun decodificaElDetalle() {
        val s = json.decodeFromString(SpotDetail.serializer(), fixture("somo"))
        assertEquals("somo", s.id)
        assertTrue(s.tideDay.series.size > 4)
        assertTrue(s.hours.isNotEmpty())
        assertNotNull(s.buoy)
    }
}
