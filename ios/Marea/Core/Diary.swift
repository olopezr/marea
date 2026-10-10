import Foundation
import Observation

// Diario de sesiones (equivale a public/js/diary.js): solo en este dispositivo, en UserDefaults.

struct DiaryTide: Codable, Sendable, Equatable {
    var h: Double
    var rising: Bool
    var coef: Int?
}

/// Condiciones del momento de guardar la sesión: PORTUS solo conserva 48 h de histórico.
struct DiarySnap: Codable, Sendable, Equatable {
    var h: Double?
    var Tp: Double?
    var dir: Double?
    var water: Double?
    var wind: Double?
    var windDir: Double?
    var gust: Double?
    var tide: DiaryTide?
    var score: Double?
}

struct DiaryEntry: Codable, Sendable, Equatable, Identifiable {
    let id: String
    let spotId: String
    /// Fecha local del dispositivo, yyyy-mm-dd.
    let date: String
    let rating: Int
    let notes: String
    let snap: DiarySnap?
}

struct DiaryStat: Sendable, Equatable {
    let avg: Double
    let min: Double
    let max: Double
}

/// Lo que te funciona en un spot: media y rango de las sesiones puntuadas con 4-5.
struct DiaryInsights: Sendable, Equatable {
    let count: Int
    let h: DiaryStat?
    let Tp: DiaryStat?
    let wind: DiaryStat?
    let windDir: String?
}

@MainActor @Observable
final class DiaryStore {
    static let key = "marea:diary"
    static let maxEntries = 500
    static let maxNotes = 500
    static let minInsightSessions = 2

    private(set) var entries: [DiaryEntry]
    @ObservationIgnored private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        entries = Self.load(defaults)
    }

    // Una entrada rota se descarta sin perder las demás; datos ilegibles equivalen a un diario vacío.
    private static func load(_ defaults: UserDefaults) -> [DiaryEntry] {
        struct Lossy: Decodable {
            let entry: DiaryEntry?
            init(from decoder: Decoder) throws { entry = try? DiaryEntry(from: decoder) }
        }
        guard let data = defaults.data(forKey: key),
              let list = try? JSONDecoder().decode([Lossy].self, from: data) else { return [] }
        return list.compactMap(\.entry).filter { !$0.spotId.isEmpty && isoDate($0.date) }
    }

    private func save() {
        if let data = try? JSONEncoder().encode(entries) { defaults.set(data, forKey: Self.key) }
    }

    nonisolated static func isoDate(_ s: String) -> Bool {
        s.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil
    }

    /// Fecha local del dispositivo (yyyy-mm-dd).
    nonisolated static func todayISO(now: Date = .now, calendar: Calendar = .current) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: now)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    @discardableResult
    func add(spotId: String, date: String, rating: Int, notes: String, snap: DiarySnap? = nil) -> DiaryEntry? {
        guard !spotId.isEmpty, Self.isoDate(date) else { return nil }
        let entry = DiaryEntry(
            id: UUID().uuidString,
            spotId: spotId,
            date: date,
            rating: min(5, max(1, rating)),
            notes: String(notes.trimmingCharacters(in: .whitespacesAndNewlines).prefix(Self.maxNotes)),
            snap: snap
        )
        entries = Array((entries + [entry]).suffix(Self.maxEntries))
        save()
        return entry
    }

    func remove(_ id: String) {
        entries.removeAll { $0.id == id }
        save()
    }

    /// Más reciente primero: por fecha y, a igual fecha, la última añadida.
    var newestFirst: [DiaryEntry] {
        entries.enumerated()
            .sorted { $0.element.date == $1.element.date ? $0.offset > $1.offset : $0.element.date > $1.element.date }
            .map(\.element)
    }

    // MARK: Instantánea

    /// Condiciones del detalle: la boya si hay lectura y, si no, la previsión; el viento medido si hay estación.
    nonisolated static func snapshot(_ s: SpotDetail) -> DiarySnap {
        let n = s.now, b = s.buoy, w = s.meteo?.wind
        let tide = s.tide.h.map { DiaryTide(h: $0, rising: s.tide.rising == true, coef: s.tide.coef) }
        return DiarySnap(
            h: b?.h ?? n.h,
            Tp: b?.Tp ?? n.T,
            dir: b?.dir ?? n.dir,
            water: b?.water ?? n.water,
            wind: w?.wind ?? n.wind,
            windDir: w?.windDir ?? n.windDir,
            gust: w?.gust ?? n.gust,
            tide: tide,
            score: s.score
        )
    }

    /// Solo se toma la instantánea si la sesión es de hoy: no hay datos medidos de días anteriores.
    nonisolated static func snapshot(_ s: SpotDetail, date: String, now: Date = .now) -> DiarySnap? {
        date == todayISO(now: now) ? snapshot(s) : nil
    }

    // MARK: Resumen

    func insights(spotId: String) -> DiaryInsights? {
        let good = entries.filter { $0.spotId == spotId && $0.rating >= 4 && $0.snap != nil }
        guard good.count >= Self.minInsightSessions else { return nil }
        func stat(_ vals: [Double]) -> DiaryStat? {
            let v = vals.filter(\.isFinite)
            guard !v.isEmpty else { return nil }
            let r = { (x: Double) in (x * 10).rounded() / 10 }
            return DiaryStat(avg: r(v.reduce(0, +) / Double(v.count)), min: r(v.min()!), max: r(v.max()!))
        }
        let snaps = good.compactMap(\.snap)
        // La dirección más frecuente; a igual número gana la que apareció antes.
        var order: [String] = [], counts: [String: Int] = [:]
        for d in snaps.compactMap(\.windDir) {
            let c = Surf.cardinal(d)
            if counts[c] == nil { order.append(c) }
            counts[c, default: 0] += 1
        }
        let top = order.reduce(nil as String?) { best, c in best.map { counts[c]! > counts[$0]! ? c : $0 } ?? c }
        return DiaryInsights(
            count: good.count,
            h: stat(snaps.compactMap(\.h)),
            Tp: stat(snaps.compactMap(\.Tp)),
            wind: stat(snaps.compactMap(\.wind)),
            windDir: top
        )
    }
}
