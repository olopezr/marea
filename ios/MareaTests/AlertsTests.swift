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
        XCTAssertFalse(st.prefsSupported, "con un servidor antiguo no se ofrecen los ajustes por spot")
    }

    func testStatusWithPrefsDecodes() throws {
        let st = try decode(#"{"subscribed":true,"spots":["somo"],"minScore":3,"prefs":{"somo":{"min":4,"offshore":true,"from":9,"to":20}}}"#)
        XCTAssertEqual(st.prefs["somo"], AlertPref(min: 4, offshore: true, from: 9, to: 20))
        XCTAssertTrue(st.prefsSupported)
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

    // ---------- Regla personalizada ----------

    private func json<T: Encodable>(_ v: T) throws -> String {
        let enc = JSONEncoder()
        enc.outputFormatting = [.sortedKeys]
        return try XCTUnwrap(String(data: enc.encode(v), encoding: .utf8))
    }

    func testRuleNormalizationClampsRoundsAndSwaps() {
        let r = AlertRule(hMin: 2.04, hMax: 1.2, windMax: 99, wind: "off", tide: "mid", ahead: 100).normalized
        XCTAssertEqual(r, AlertRule(hMin: 1.2, hMax: 2.0, windMax: nil, wind: "off", tide: "mid", ahead: 48), "se ordena, redondea a 0,1 y acota")
    }

    func testRuleNormalizationDropsDefaults() {
        let r = AlertRule(hMin: 0, hMax: 10, windMax: 60, wind: "any", tide: "any", ahead: 24)
        XCTAssertNil(r.normalized, "una regla con todo por defecto no existe")
        XCTAssertEqual(AlertRule(hMin: 1.5, ahead: 24).normalized, AlertRule(hMin: 1.5))
    }

    func testAheadAloneIsNotARule() {
        XCTAssertNil(AlertRule(ahead: 12).normalized, "la antelación sola no es una condición")
        XCTAssertNil(AlertRule(ahead: 48).normalized)
    }

    func testRuleIgnoresInvalidValues() {
        XCTAssertNil(AlertRule(hMin: .nan, wind: "x", tide: "huge").normalized)
        XCTAssertEqual(AlertRule(windMax: -4).normalized, AlertRule(windMax: 0))
    }

    func testRuleEncodingOmitsUnsetKeys() throws {
        XCTAssertEqual(try json(AlertRule(hMin: 1.5, tide: "low")), #"{"hMin":1.5,"tide":"low"}"#)
        let pref = AlertPref(min: 4, rule: AlertRule(windMax: 12))
        XCTAssertEqual(try json(["somo": pref.normalized]), #"{"somo":{"min":4,"rule":{"windMax":12}}}"#)
        XCTAssertEqual(try json(AlertPref(min: 4)), #"{"min":4}"#, "sin regla no se envía la clave")
    }

    func testPrefWithRuleIsNotDefaultAndKeepsRuleNormalized() {
        XCTAssertFalse(AlertPref(rule: AlertRule(hMin: 1)).isDefault)
        XCTAssertTrue(AlertPref(rule: AlertRule(ahead: 12)).isDefault)
        XCTAssertNil(AlertPref(rule: AlertRule(ahead: 12)).normalized.rule)
        XCTAssertEqual(AlertPref(rule: AlertRule(hMin: 3, hMax: 1)).normalized.rule, AlertRule(hMin: 1, hMax: 3))
    }

    func testStatusDecodesRuleFromServer() throws {
        let st = try decode(#"{"subscribed":true,"spots":["somo"],"minScore":3,"prefs":{"somo":{"rule":{"hMin":1.2,"windMax":15,"wind":"off","tide":"high","ahead":36}}}}"#)
        XCTAssertEqual(st.prefs["somo"]?.rule, AlertRule(hMin: 1.2, windMax: 15, wind: "off", tide: "high", ahead: 36))
    }
}
