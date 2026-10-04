import Foundation

// Respuestas de la API de Marea (server/conditions.js). Los números que pueden faltar son opcionales,
// igual que en el cliente web, que los muestra como "–".
// Todas las horas son milisegundos desde epoch.

struct Spot: Codable, Sendable, Identifiable, Hashable {
    let id: String
    let name: String
    let region: String
    let lat: Double
    let lon: Double
    let facing: Double
    let tide: String
    let tz: String

    static let all: [Spot] = {
        guard let url = Bundle.main.url(forResource: "spots", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let spots = try? JSONDecoder().decode([Spot].self, from: data) else { return [] }
        return spots
    }()
    static let byId = Dictionary(uniqueKeysWithValues: all.map { ($0.id, $0) })
}

struct WindType: Codable, Sendable, Hashable {
    let key: String
    let label: String
}

struct Now: Codable, Sendable, Hashable {
    let h: Double?
    let T: Double?
    let dir: Double?
    let sh: Double?
    let sT: Double?
    let sDir: Double?
    let wind: Double?
    let windDir: Double?
    let gust: Double?
    let windType: WindType
    let air: Double?
    let water: Double?
}

struct Port: Codable, Sendable, Hashable {
    let name: String
    let distKm: Double
}

struct TideExtreme: Codable, Sendable, Hashable {
    let t: Double
    let h: Double
    let type: String
    let coef: Int?

    var word: String { L(type == "high" ? "tide.high" : "tide.low") }
}

struct TideNow: Codable, Sendable, Hashable {
    let source: String?
    /// Con marea del modelo: "no-port" (el IHM no cubre la zona) o "down" (el IHM no responde).
    let reason: String?
    let port: Port?
    let h: Double?
    let rising: Bool?
    let next: TideExtreme?
    let coef: Int?
}

struct SpotSummary: Codable, Sendable, Identifiable, Hashable {
    let id: String
    let name: String
    let region: String
    let tz: String
    let lat: Double
    let lon: Double
    let score: Double
    let now: Now
    let tide: TideNow
}

struct Overview: Codable, Sendable {
    let updatedAt: Double
    let forecastSource: String?
    let spots: [SpotSummary]
}

// Punto de una serie [t, valor]. Los valores nulos se descartan al decodificar.
struct SeriesPoint: Codable, Sendable, Hashable {
    let t: Double
    let v: Double

    init(t: Double, v: Double) { self.t = t; self.v = v }

    init(from decoder: Decoder) throws {
        var c = try decoder.unkeyedContainer()
        t = try c.decode(Double.self)
        v = try c.decodeNil() ? .nan : try c.decode(Double.self)
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.unkeyedContainer()
        try c.encode(t)
        if v.isNaN { try c.encodeNil() } else { try c.encode(v) }
    }
}

private extension KeyedDecodingContainer {
    func series(_ key: Key) throws -> [SeriesPoint] {
        (try decodeIfPresent([SeriesPoint].self, forKey: key) ?? []).filter { !$0.v.isNaN }
    }
}

struct Surge: Codable, Sendable, Hashable {
    let beach: String
    let points: [SeriesPoint]

    enum CodingKeys: String, CodingKey { case beach, points }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        beach = try c.decodeIfPresent(String.self, forKey: .beach) ?? ""
        points = try c.series(.points)
    }
}

struct Observed: Codable, Sendable, Hashable {
    let gauge: String
    let distKm: Double?
    let samePort: Bool?
    let points: [SeriesPoint]

    enum CodingKeys: String, CodingKey { case gauge, distKm, samePort, points }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        gauge = try c.decode(String.self, forKey: .gauge)
        distKm = try c.decodeIfPresent(Double.self, forKey: .distKm)
        samePort = try c.decodeIfPresent(Bool.self, forKey: .samePort)
        points = try c.series(.points)
    }
}

struct TideDay: Codable, Sendable, Hashable {
    let from: Double
    let to: Double
    let ext: [TideExtreme]
    let points: [SeriesPoint]
    let surge: Surge?
    let observed: Observed?

    enum CodingKeys: String, CodingKey { case from, to, ext, points, surge, observed }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        from = try c.decode(Double.self, forKey: .from)
        to = try c.decode(Double.self, forKey: .to)
        ext = try c.decodeIfPresent([TideExtreme].self, forKey: .ext) ?? []
        points = try c.series(.points)
        surge = try c.decodeIfPresent(Surge.self, forKey: .surge)
        observed = try c.decodeIfPresent(Observed.self, forKey: .observed)
    }
}

/// Índice UV de hoy: el de la hora en curso y el máximo del día con su hora.
struct UVToday: Codable, Sendable, Hashable {
    let now: Double?
    let max: Double
    let maxT: Double
}

struct Sun: Codable, Sendable, Hashable {
    let rise: Double
    let set: Double
}

struct ClosestBuoy: Codable, Sendable, Hashable {
    let name: String
    let distKm: Double
}

struct BuoyMeta: Codable, Sendable, Hashable {
    let name: String
    let lat: Double?
    let lon: Double?
    let distKm: Double
    let deep: Bool?
    let far: Bool?
    let fallback: Bool?
    let closest: ClosestBuoy?
}

struct BuoyPrediction: Codable, Sendable, Hashable {
    let h: Double
    let Tp: Double?
    let dir: Double?
}

/// Tendencia del oleaje medido: "up", "down" o "steady", con el cambio en metros en `hours` horas.
struct BuoyTrend: Codable, Sendable, Hashable {
    let key: String
    let delta: Double
    let hours: Double
}

/// Desviación de la previsión frente a la boya en las últimas 24 h (`bias` > 0: la boya mide más).
struct ForecastFit: Codable, Sendable, Hashable {
    let bias: Double
    let mae: Double
    let n: Int
}

struct BuoyReading: Codable, Sendable, Hashable {
    let buoy: BuoyMeta
    let t: Double
    let h: Double
    let Tp: Double?
    let dir: Double?
    let water: Double?
    let predicted: BuoyPrediction?
    let trend: BuoyTrend?
    /// Últimas 48 h medidas y previsión en la posición de la boya (de −48 h a +24 h). Solo en el detalle.
    let history: [SeriesPoint]?
    let model: [SeriesPoint]?
    let fit: ForecastFit?

    enum CodingKeys: String, CodingKey { case buoy, t, h, Tp, dir, water, predicted, trend, history, model, fit }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        buoy = try c.decode(BuoyMeta.self, forKey: .buoy)
        t = try c.decode(Double.self, forKey: .t)
        h = try c.decode(Double.self, forKey: .h)
        Tp = try c.decodeIfPresent(Double.self, forKey: .Tp)
        dir = try c.decodeIfPresent(Double.self, forKey: .dir)
        water = try c.decodeIfPresent(Double.self, forKey: .water)
        predicted = try c.decodeIfPresent(BuoyPrediction.self, forKey: .predicted)
        trend = try c.decodeIfPresent(BuoyTrend.self, forKey: .trend)
        history = try c.decodeIfPresent([SeriesPoint].self, forKey: .history)?.filter { !$0.v.isNaN }
        model = try c.decodeIfPresent([SeriesPoint].self, forKey: .model)?.filter { !$0.v.isNaN }
        fit = try c.decodeIfPresent(ForecastFit.self, forKey: .fit)
    }
}

struct BuoyResponse: Codable, Sendable {
    let buoy: BuoyReading?
}

struct Station: Codable, Sendable, Hashable {
    let name: String
    let distKm: Double
}

struct MeteoWind: Codable, Sendable, Hashable {
    let wind: Double?
    let windDir: Double?
    let gust: Double?
    let t: Double
    let station: Station
}

struct MeteoAir: Codable, Sendable, Hashable {
    let air: Double?
    let t: Double
    let station: Station
}

struct MeteoPressure: Codable, Sendable, Hashable {
    let pressure: Double?
    let t: Double
    let station: Station
}

struct Meteo: Codable, Sendable, Hashable {
    let wind: MeteoWind?
    let air: MeteoAir?
    let pressure: MeteoPressure?
}

struct Hour: Codable, Sendable, Hashable {
    let t: Double
    let h: Double?
    let T: Double?
    let dir: Double?
    let wind: Double?
    let windDir: Double?
    let score: Double
}

struct DayCell: Codable, Sendable, Hashable {
    let t: Double
    let score: Double
}

struct BestHour: Codable, Sendable, Hashable {
    let t: Double
    let score: Double
}

struct Day: Codable, Sendable, Hashable {
    let key: String
    let label: String
    let rise: Double
    let set: Double
    let cells: [DayCell]
    let maxH: Double?
    let best: BestHour
}

struct SpotDetail: Codable, Sendable {
    let id: String
    let name: String
    let region: String
    let tz: String
    let lat: Double
    let lon: Double
    let score: Double
    let now: Now
    let tide: TideNow
    let facing: Double
    let tidePref: String
    let updatedAt: Double
    let forecastSource: String?
    let sun: Sun?
    let uv: UVToday?
    let buoy: BuoyReading?
    let meteo: Meteo?
    let tideDay: TideDay
    let hours: [Hour]
    let days: [Day]
}

struct AlertState: Codable, Sendable, Equatable {
    var subscribed: Bool
    var spots: [String]
    var minScore: Double

    static let empty = AlertState(subscribed: false, spots: [], minScore: 3)
}
