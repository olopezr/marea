import XCTest
@testable import Marea

// Tarjeta de condiciones para compartir.
@MainActor
final class ShareCardTests: XCTestCase {
    override func setUp() { L10n.lang = "es" }
    override func tearDown() { L10n.lang = "es" }

    private func somo() throws -> (SpotDetail, Spot) {
        let url = try XCTUnwrap(Bundle(for: Self.self).url(forResource: "somo", withExtension: "json"))
        let detail = try JSONDecoder().decode(SpotDetail.self, from: Data(contentsOf: url))
        return (detail, try XCTUnwrap(Spot.byId["somo"]))
    }

    func testModelReunesTheCardTexts() throws {
        let (detail, meta) = try somo()
        let m = ShareCardModel.make(detail, meta: meta, now: Date(timeIntervalSince1970: 1_790_000_000))
        XCTAssertEqual(m.title, "Somo")
        XCTAssertEqual(m.subtitle, "Cantabria")
        XCTAssertFalse(m.height.isEmpty)
        XCTAssertTrue(m.line.contains(" s · "))
        XCTAssertEqual(m.stats.first?.label, "Viento")
        XCTAssertFalse(m.stamp.isEmpty)
        XCTAssertFalse(m.host.isEmpty)
    }

    func testImageHasTheCardSize() throws {
        let (detail, meta) = try somo()
        let image = try XCTUnwrap(ShareCard.image(.make(detail, meta: meta)))
        XCTAssertEqual(image.size.width * image.scale, 1080, accuracy: 1)
        XCTAssertEqual(image.size.height * image.scale, 1350, accuracy: 1)
        // Para revisarla a ojo: TEST_RUNNER_MAREA_CARD_PNG=/ruta/tarjeta.png xcodebuild test …
        if let path = ProcessInfo.processInfo.environment["MAREA_CARD_PNG"], let png = image.pngData() {
            try png.write(to: URL(fileURLWithPath: path))
        }
    }
}
