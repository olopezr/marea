import XCTest
@testable import Marea

final class SurfTests: XCTestCase {
    func testFmtUsaComaYGuion() {
        XCTAssertEqual(Surf.fmt(1.25, 1), "1,3")
        XCTAssertEqual(Surf.fmt(13.0, 0), "13")
        XCTAssertEqual(Surf.fmt(1.15, 1), "1,1")
        XCTAssertEqual(Surf.fmt(nil), "–")
        XCTAssertEqual(Surf.fmt(.nan), "–")
    }

    func testCardinal() {
        XCTAssertEqual(Surf.cardinal(0), "N")
        XCTAssertEqual(Surf.cardinal(315), "NO")
        XCTAssertEqual(Surf.cardinal(-45), "NO")
        XCTAssertEqual(Surf.cardinal(200), "SSO")
        XCTAssertEqual(Surf.cardinal(nil), "–")
    }

    func testRating() {
        XCTAssertEqual(Rating(score: 0.4), .flat)
        XCTAssertEqual(Rating(score: 2), .fair)
        XCTAssertEqual(Rating(score: 3.9), .good)
        XCTAssertEqual(Rating(score: 5), .epic)
    }

    func testHoraEnLaZonaDelSpot() {
        let ms = 1_791_015_600_000.0 // 2026-10-03 08:20 UTC
        XCTAssertEqual(Surf.hhmm(ms, "Europe/Madrid"), "10:20")
        XCTAssertEqual(Surf.hhmm(ms, "Atlantic/Canary"), "09:20")
    }

    func testBusquedaSinTildes() {
        XCTAssertTrue(Surf.matches(name: "La Cícer", region: "Gran Canaria", query: "cicer"))
        XCTAssertTrue(Surf.matches(name: "Somo", region: "Cantabria", query: "cant somo"))
        XCTAssertFalse(Surf.matches(name: "Somo", region: "Cantabria", query: "lanzarote"))
    }

    func testInterpolacionDeMarea() {
        let pts = [SeriesPoint(t: 0, v: 1), SeriesPoint(t: 100, v: 3), SeriesPoint(t: 200, v: 2)]
        let at = Surf.tideAt(pts, 50)!
        XCTAssertEqual(at.h, 2, accuracy: 1e-9)
        XCTAssertTrue(at.rising)
        XCTAssertFalse(Surf.tideAt(pts, 150)!.rising)
        XCTAssertNil(Surf.valueAt(pts, 50, maxGap: 10), "hueco mayor que maxGap")
        XCTAssertNil(Surf.tideAt(pts, 300))
    }

    func testDuracionYCentimetros() {
        XCTAssertEqual(Surf.duration(95 * 60_000), "1 h 35 min")
        XCTAssertEqual(Surf.duration(20 * 60_000), "20 min")
        XCTAssertEqual(Surf.surgeText(-0.124), "Viento y presión: bajan el mar 12 cm")
        XCTAssertEqual(Surf.surgeText(0.05), "Viento y presión: suben el mar 5 cm")
        XCTAssertEqual(Surf.surgeText(0.02), "Viento y presión: sin efecto apreciable")
        XCTAssertEqual(Surf.surgeText(nil), "Viento y presión: sin dato a esta hora")
    }

    func testIndiceUV() {
        XCTAssertEqual(Surf.uvLabel(2.4), "Bajo")
        XCTAssertEqual(Surf.uvLabel(2.6), "Moderado")
        XCTAssertEqual(Surf.uvLabel(7), "Alto")
        XCTAssertEqual(Surf.uvLabel(9), "Muy alto")
        XCTAssertEqual(Surf.uvLabel(11.2), "Extremo")
        XCTAssertEqual(Surf.uvAdvice(6), "crema solar y gorra")
    }

    func testProximaMareaIdeal() {
        let tz = "Europe/Madrid", h = 3_600_000.0, day = 1_790_978_400_000.0 // 3/10/2026 00:00 en Madrid
        let ext = [TideExtreme(t: day + 3 * h, h: 1.4, type: "low", coef: nil), TideExtreme(t: day + 9 * h, h: 3.6, type: "high", coef: 55),
                   TideExtreme(t: day + 15 * h, h: 1.5, type: "low", coef: nil), TideExtreme(t: day + 21 * h, h: 3.3, type: "high", coef: 45),
                   TideExtreme(t: day + 27 * h, h: 1.4, type: "low", coef: nil)]
        let now = day + 16 * h, end = day + 24 * h
        XCTAssertEqual(Surf.idealTideText("high", ext: ext, now: now, dayEnd: end, tz: tz), "Próxima pleamar a las 21:00")
        XCTAssertEqual(Surf.idealTideText("low", ext: ext, now: now, dayEnd: end, tz: tz), "Próxima bajamar mañana a las 03:00")
        XCTAssertEqual(Surf.idealTideText("mid", ext: ext, now: now, dayEnd: end, tz: tz), "Próxima media marea hacia las 18:00")
        XCTAssertEqual(Surf.idealTideText("all", ext: ext, now: now, dayEnd: end, tz: tz), "Funciona con cualquier marea")
    }

    func testListaDeSpotsIncluida() {
        XCTAssertEqual(Spot.all.count, 83)
        XCTAssertEqual(Spot.byId["somo"]?.region, "Cantabria")
    }
}

final class DecodingTests: XCTestCase {
    private func fixture(_ name: String) throws -> Data {
        let url = try XCTUnwrap(Bundle(for: Self.self).url(forResource: name, withExtension: "json"))
        return try Data(contentsOf: url)
    }

    func testDecodificaLaLista() throws {
        let o = try JSONDecoder().decode(Overview.self, from: fixture("overview"))
        XCTAssertEqual(o.spots.count, 27)
        XCTAssertFalse(o.spots[0].now.windType.label.isEmpty)
    }

    func testDecodificaElDetalle() throws {
        let s = try JSONDecoder().decode(SpotDetail.self, from: fixture("somo"))
        XCTAssertEqual(s.id, "somo")
        XCTAssertGreaterThan(s.tideDay.points.count, 4)
        XCTAssertFalse(s.hours.isEmpty)
        XCTAssertFalse(s.days.isEmpty)
        XCTAssertNotNil(s.buoy)
    }

    func testRutaDeUnAviso() async {
        await MainActor.run {
            let app = AppState()
            app.open(url: "/#/spot/somo")
            XCTAssertEqual(app.path, [.spot("somo")])
            app.open(url: "/#/spot/no-existe")
            XCTAssertEqual(app.path, [.spot("somo")])
        }
    }
}
