import XCTest
@testable import Marea

// Diario de sesiones: almacén local, instantánea de condiciones y resumen por spot.
@MainActor
final class DiaryTests: XCTestCase {
    private var defaults: UserDefaults!

    override func setUp() {
        L10n.lang = "es"
        defaults = UserDefaults(suiteName: "marea.tests.diary")!
        defaults.removePersistentDomain(forName: "marea.tests.diary")
    }

    override func tearDown() { defaults.removePersistentDomain(forName: "marea.tests.diary") }

    private func store() -> DiaryStore { DiaryStore(defaults: defaults) }

    private func snap(h: Double? = 1.5, Tp: Double? = 10, wind: Double? = 8, windDir: Double? = 180) -> DiarySnap {
        DiarySnap(h: h, Tp: Tp, dir: 300, water: 15, wind: wind, windDir: windDir, gust: 12, tide: nil, score: 3)
    }

    func testAddPersistsAndReloads() throws {
        let s = store()
        let e = try XCTUnwrap(s.add(spotId: "somo", date: "2026-10-01", rating: 4, notes: "  buena  ", snap: snap()))
        XCTAssertEqual(e.notes, "buena")
        XCTAssertEqual(store().entries, [e], "se guarda en UserDefaults con la clave marea:diary")
        XCTAssertNotNil(defaults.data(forKey: "marea:diary"))
    }

    func testAddRejectsInvalidAndClampsValues() throws {
        let s = store()
        XCTAssertNil(s.add(spotId: "", date: "2026-10-01", rating: 3, notes: ""))
        XCTAssertNil(s.add(spotId: "somo", date: "01/10/2026", rating: 3, notes: ""))
        XCTAssertEqual(try XCTUnwrap(s.add(spotId: "somo", date: "2026-10-01", rating: 9, notes: "")).rating, 5)
        XCTAssertEqual(try XCTUnwrap(s.add(spotId: "somo", date: "2026-10-01", rating: 0, notes: "")).rating, 1)
        let long = try XCTUnwrap(s.add(spotId: "somo", date: "2026-10-01", rating: 3, notes: String(repeating: "x", count: 900)))
        XCTAssertEqual(long.notes.count, 500)
    }

    func testRemove() throws {
        let s = store()
        let a = try XCTUnwrap(s.add(spotId: "somo", date: "2026-10-01", rating: 3, notes: ""))
        let b = try XCTUnwrap(s.add(spotId: "somo", date: "2026-10-02", rating: 3, notes: ""))
        s.remove(a.id)
        XCTAssertEqual(s.entries, [b])
        XCTAssertEqual(store().entries, [b])
    }

    func testCapDropsOldest() throws {
        let s = store()
        for i in 0..<(DiaryStore.maxEntries + 3) { _ = s.add(spotId: "somo", date: "2026-10-01", rating: 3, notes: "n\(i)") }
        XCTAssertEqual(s.entries.count, DiaryStore.maxEntries)
        XCTAssertEqual(s.entries.first?.notes, "n3", "se descartan las más antiguas")
    }

    func testCorruptDataIsTolerated() throws {
        defaults.set(Data("no es json".utf8), forKey: "marea:diary")
        XCTAssertEqual(store().entries, [])
        defaults.set(Data(#"[{"id":"a","spotId":"somo","date":"2026-10-01","rating":4,"notes":""},{"id":5},{"id":"b","spotId":"","date":"2026-10-01","rating":4,"notes":""}]"#.utf8), forKey: "marea:diary")
        XCTAssertEqual(store().entries.map(\.id), ["a"], "las entradas rotas se descartan y las buenas se conservan")
    }

    func testNewestFirstOrdersByDateThenLastAdded() throws {
        let s = store()
        let a = try XCTUnwrap(s.add(spotId: "somo", date: "2026-10-02", rating: 3, notes: ""))
        let b = try XCTUnwrap(s.add(spotId: "somo", date: "2026-10-05", rating: 3, notes: ""))
        let c = try XCTUnwrap(s.add(spotId: "somo", date: "2026-10-02", rating: 3, notes: ""))
        XCTAssertEqual(s.newestFirst.map(\.id), [b.id, c.id, a.id])
    }

    func testInsightsNeedTwoGoodSessionsWithSnapshot() throws {
        let s = store()
        _ = s.add(spotId: "somo", date: "2026-10-01", rating: 5, notes: "", snap: snap())
        XCTAssertNil(s.insights(spotId: "somo"), "con una sola no hay resumen")
        _ = s.add(spotId: "somo", date: "2026-10-02", rating: 5, notes: "", snap: nil)
        XCTAssertNil(s.insights(spotId: "somo"), "sin instantánea no cuenta")
        _ = s.add(spotId: "somo", date: "2026-10-03", rating: 3, notes: "", snap: snap())
        XCTAssertNil(s.insights(spotId: "somo"), "una valoración de 3 no cuenta")
        _ = s.add(spotId: "otro", date: "2026-10-03", rating: 5, notes: "", snap: snap())
        XCTAssertNil(s.insights(spotId: "somo"), "otro spot no cuenta")
        _ = s.add(spotId: "somo", date: "2026-10-04", rating: 4, notes: "", snap: snap(h: 2.5, Tp: 12, wind: 4, windDir: 180))
        let ins = try XCTUnwrap(s.insights(spotId: "somo"))
        XCTAssertEqual(ins.count, 2)
        XCTAssertEqual(ins.h, DiaryStat(avg: 2.0, min: 1.5, max: 2.5))
        XCTAssertEqual(ins.Tp, DiaryStat(avg: 11, min: 10, max: 12))
        XCTAssertEqual(ins.wind, DiaryStat(avg: 6, min: 4, max: 8))
        XCTAssertEqual(ins.windDir, Surf.cardinal(180))
    }

    func testInsightsPicksMostFrequentWindDirection() throws {
        let s = store()
        for d in [0.0, 180, 180] { _ = s.add(spotId: "somo", date: "2026-10-01", rating: 5, notes: "", snap: snap(windDir: d)) }
        XCTAssertEqual(try XCTUnwrap(s.insights(spotId: "somo")).windDir, Surf.cardinal(180))
    }

    // ---------- Instantánea ----------

    private func somo() throws -> SpotDetail {
        let url = try XCTUnwrap(Bundle(for: Self.self).url(forResource: "somo", withExtension: "json"))
        return try JSONDecoder().decode(SpotDetail.self, from: Data(contentsOf: url))
    }

    func testSnapshotUsesBuoyThenForecast() throws {
        let d = try somo()
        let sn = DiaryStore.snapshot(d)
        XCTAssertEqual(sn.h, d.buoy?.h ?? d.now.h)
        XCTAssertEqual(sn.Tp, d.buoy?.Tp ?? d.now.T)
        XCTAssertEqual(sn.wind, d.meteo?.wind?.wind ?? d.now.wind)
        XCTAssertEqual(sn.score, d.score)
        XCTAssertEqual(sn.tide?.h, d.tide.h)
    }

    func testSnapshotOnlyWhenTheDateIsToday() throws {
        let d = try somo()
        let now = Date(timeIntervalSince1970: 1_791_000_000)
        let today = DiaryStore.todayISO(now: now)
        XCTAssertNotNil(DiaryStore.snapshot(d, date: today, now: now))
        XCTAssertNil(DiaryStore.snapshot(d, date: "2020-01-01", now: now))
    }

    func testTodayISOUsesDeviceLocalDate() {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "Pacific/Auckland")!
        // 2026-10-10 23:30 UTC ya es 11 de octubre en Nueva Zelanda.
        let now = Date(timeIntervalSince1970: 1_791_675_000)
        XCTAssertEqual(DiaryStore.todayISO(now: now, calendar: cal), "2026-10-11")
    }
}
