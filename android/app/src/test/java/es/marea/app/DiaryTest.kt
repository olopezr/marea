package es.marea.app

import es.marea.app.data.DiaryEntry
import es.marea.app.data.DiarySnap
import es.marea.app.data.DiaryStat
import es.marea.app.data.DiaryStorage
import es.marea.app.data.DiaryStore
import es.marea.app.data.L10n
import es.marea.app.data.SpotDetail
import es.marea.app.data.json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import java.time.LocalDate
import java.time.ZoneId

// Diario de sesiones: almacén local, instantánea de condiciones y resumen por spot.
class DiaryTest {
    private class Mem(var text: String? = null) : DiaryStorage {
        override fun read() = text
        override fun write(text: String) { this.text = text }
    }

    private val mem = Mem()
    private fun store() = DiaryStore(mem)

    @Before fun lang() = L10n.setEnglishForTests(false)

    private fun snap(h: Double? = 1.5, tp: Double? = 10.0, wind: Double? = 8.0, windDir: Double? = 180.0) =
        DiarySnap(h = h, tp = tp, dir = 300.0, water = 15.0, wind = wind, windDir = windDir, gust = 12.0, tide = null, score = 3.0)

    @Test fun `guarda, recarga y recorta las notas`() {
        val s = store()
        val e = s.add("somo", "2026-10-01", 4, "  buena  ", snap())!!
        assertEquals("buena", e.notes)
        assertEquals(listOf(e), store().entries)
        assertNotNull(mem.text)
    }

    @Test fun `rechaza lo no valido y acota los valores`() {
        val s = store()
        assertNull(s.add("", "2026-10-01", 3, ""))
        assertNull(s.add("somo", "01/10/2026", 3, ""))
        assertEquals(5, s.add("somo", "2026-10-01", 9, "")!!.rating)
        assertEquals(1, s.add("somo", "2026-10-01", 0, "")!!.rating)
        assertEquals(500, s.add("somo", "2026-10-01", 3, "x".repeat(900))!!.notes.length)
    }

    @Test fun `borra una entrada`() {
        val s = store()
        val a = s.add("somo", "2026-10-01", 3, "")!!
        val b = s.add("somo", "2026-10-02", 3, "")!!
        s.remove(a.id)
        assertEquals(listOf(b), s.entries)
        assertEquals(listOf(b), store().entries)
    }

    @Test fun `con mas de 500 se descartan las mas antiguas`() {
        val s = store()
        repeat(DiaryStore.MAX_ENTRIES + 3) { s.add("somo", "2026-10-01", 3, "n$it") }
        assertEquals(DiaryStore.MAX_ENTRIES, s.entries.size)
        assertEquals("n3", s.entries.first().notes)
    }

    @Test fun `datos corruptos se toleran y se conservan las entradas buenas`() {
        mem.text = "no es json"
        assertEquals(emptyList<DiaryEntry>(), store().entries)
        mem.text = """[{"id":"a","spotId":"somo","date":"2026-10-01","rating":4,"notes":""},{"id":5},{"id":"b","spotId":"","date":"2026-10-01","rating":4,"notes":""},7]"""
        assertEquals(listOf("a"), store().entries.map { it.id })
    }

    @Test fun `ordena por fecha y a igual fecha la ultima anadida primero`() {
        val s = store()
        val a = s.add("somo", "2026-10-02", 3, "")!!
        val b = s.add("somo", "2026-10-05", 3, "")!!
        val c = s.add("somo", "2026-10-02", 3, "")!!
        assertEquals(listOf(b.id, c.id, a.id), s.newestFirst.map { it.id })
    }

    @Test fun `el resumen pide dos sesiones de 4-5 con instantanea`() {
        val s = store()
        s.add("somo", "2026-10-01", 5, "", snap())
        assertNull(s.insights("somo"))
        s.add("somo", "2026-10-02", 5, "", null)
        assertNull(s.insights("somo")) // sin instantanea no cuenta
        s.add("somo", "2026-10-03", 3, "", snap())
        assertNull(s.insights("somo")) // un 3 no cuenta
        s.add("otro", "2026-10-03", 5, "", snap())
        assertNull(s.insights("somo")) // otro spot no cuenta
        s.add("somo", "2026-10-04", 4, "", snap(h = 2.5, tp = 12.0, wind = 4.0))
        val ins = s.insights("somo")!!
        assertEquals(2, ins.count)
        assertEquals(DiaryStat(2.0, 1.5, 2.5), ins.h)
        assertEquals(DiaryStat(11.0, 10.0, 12.0), ins.tp)
        assertEquals(DiaryStat(6.0, 4.0, 8.0), ins.wind)
        assertEquals(es.marea.app.data.Surf.cardinal(180.0), ins.windDir)
    }

    @Test fun `el resumen elige la direccion de viento mas frecuente`() {
        val s = store()
        for (d in listOf(0.0, 180.0, 180.0)) s.add("somo", "2026-10-01", 5, "", snap(windDir = d))
        assertEquals(es.marea.app.data.Surf.cardinal(180.0), s.insights("somo")!!.windDir)
    }

    private fun somo() = json.decodeFromString(SpotDetail.serializer(), javaClass.classLoader!!.getResource("somo.json")!!.readText())

    @Test fun `la instantanea usa la boya y si no la prevision`() {
        val d = somo()
        val sn = DiaryStore.snapshot(d)
        assertEquals(d.buoy?.h ?: d.now.h, sn.h)
        assertEquals(d.buoy?.tp ?: d.now.period, sn.tp)
        assertEquals(d.meteo?.wind?.wind ?: d.now.wind, sn.wind)
        assertEquals(d.score, sn.score)
        assertEquals(d.tide.h, sn.tide?.h)
    }

    @Test fun `la instantanea solo se toma si la fecha es hoy`() {
        val d = somo()
        val zone = ZoneId.systemDefault()
        val now = LocalDate.of(2026, 10, 10).atTime(12, 0).atZone(zone).toInstant().toEpochMilli()
        assertEquals("2026-10-10", DiaryStore.todayISO(now))
        assertNotNull(DiaryStore.snapshot(d, "2026-10-10", now))
        assertNull(DiaryStore.snapshot(d, "2020-01-01", now))
    }
}
