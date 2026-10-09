import XCTest
@testable import Marea

// Ajustes de avisos por spot: lo que la app recibe del servidor y lo que le envía.
final class AlertsTests: XCTestCase {
    private func decode(_ json: String) throws -> AlertState {
        try JSONDecoder().decode(AlertState.self, from: Data(json.utf8))
    }

    func testStatusWithoutPrefsStillDecodes() throws {
        // Un servidor anterior a los ajustes por spot no envía `prefs`.
        let st = try decode(#"{"subscribed":true,"spots":["somo"],"minScore":3}"#)
        XCTAssertEqual(st.spots, ["somo"])
        XCTAssertEqual(st.prefs, [:])
    }

    func testStatusWithPrefsDecodes() throws {
        let st = try decode(#"{"subscribed":true,"spots":["somo"],"minScore":3,"prefs":{"somo":{"min":4,"offshore":true,"from":9,"to":20}}}"#)
        XCTAssertEqual(st.prefs["somo"], AlertPref(min: 4, offshore: true, from: 9, to: 20))
    }

    func testNormalizedDropsDefaultsAndInvalidValues() {
        XCTAssertTrue(AlertPref(min: 9, offshore: false, from: 7, to: 22).normalized.isDefault)
        XCTAssertNil(AlertPref(from: 9, to: 8).normalized.from, "una franja al revés se descarta")
        XCTAssertNil(AlertPref(from: 5, to: 20).normalized.from, "fuera del horario de avisos")
        let ok = AlertPref(min: 3, offshore: true, from: 9, to: 20).normalized
        XCTAssertEqual(ok, AlertPref(min: 3, offshore: true, from: 9, to: 20))
    }

    func testEncodingOmitsUnsetKeys() throws {
        let data = try JSONEncoder().encode(["somo": AlertPref(min: 4)])
        let json = try XCTUnwrap(String(data: data, encoding: .utf8))
        XCTAssertEqual(json, #"{"somo":{"min":4}}"#)
    }
}
