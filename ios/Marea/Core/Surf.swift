import Foundation

// Utilidades de presentación portadas de public/js/surf.js y tidechart.js.
// La valoración la calcula el servidor; aquí solo se formatea.

enum Rating: String, CaseIterable, Sendable {
    case flat, poor, fair, good, epic

    var label: String {
        switch self {
        case .flat: "Plato"
        case .poor: "Pobre"
        case .fair: "Aceptable"
        case .good: "Bueno"
        case .epic: "Muy bueno"
        }
    }

    var min: Double {
        switch self {
        case .flat: 0
        case .poor: 1
        case .fair: 2
        case .good: 3
        case .epic: 4
        }
    }

    init(score: Double) {
        self = Rating.allCases.reversed().first { score >= $0.min } ?? .flat
    }
}

enum Surf {
    static let cardinals = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO"]

    static func cardinal(_ deg: Double?) -> String {
        guard let deg else { return "–" }
        let norm = (deg.truncatingRemainder(dividingBy: 360) + 360).truncatingRemainder(dividingBy: 360)
        return cardinals[Int((norm / 22.5).rounded(.toNearestOrAwayFromZero)) % 16]
    }

    /// Número con coma decimal; "–" si falta.
    static func fmt(_ n: Double?, _ digits: Int = 1) -> String {
        guard let n, !n.isNaN else { return "–" }
        // Redondeo como toFixed de JavaScript: sobre el valor decimal exacto del double y con la mitad
        // hacia arriba (printf redondea al par: 1,25 → "1,2" en vez de "1,3").
        var exact = Decimal(string: String(format: "%.25f", n), locale: Locale(identifier: "en_US_POSIX")) ?? Decimal(n)
        var rounded = Decimal()
        NSDecimalRound(&rounded, &exact, digits, .plain)
        return String(format: "%.\(digits)f", NSDecimalNumber(decimal: rounded).doubleValue).replacingOccurrences(of: ".", with: ",")
    }

    static func km(_ aLat: Double, _ aLon: Double, _ bLat: Double, _ bLon: Double) -> Double {
        let r = 6371.0, rad = { (x: Double) in x * .pi / 180 }
        let dLat = rad(bLat - aLat), dLon = rad(bLon - aLon)
        let h = pow(sin(dLat / 2), 2) + cos(rad(aLat)) * cos(rad(bLat)) * pow(sin(dLon / 2), 2)
        return 2 * r * asin(sqrt(h))
    }

    nonisolated(unsafe) private static var formatters: [String: DateFormatter] = [:]
    private static let lock = NSLock()

    /// Hora "HH:mm" en la zona horaria del spot.
    static func hhmm(_ ms: Double, _ tz: String) -> String {
        lock.lock(); defer { lock.unlock() }
        let f = formatters[tz] ?? {
            let f = DateFormatter()
            f.locale = Locale(identifier: "es_ES")
            f.timeZone = TimeZone(identifier: tz)
            f.dateFormat = "HH:mm"
            formatters[tz] = f
            return f
        }()
        return f.string(from: Date(ms: ms))
    }

    static func hour(_ ms: Double, _ tz: String) -> String { String(hhmm(ms, tz).prefix(2)) }

    static func ago(_ ms: Double, now: Date = .now) -> String {
        let m = Int(((now.ms - ms) / 60_000).rounded())
        if m < 1 { return "ahora mismo" }
        if m < 60 { return "hace \(m) min" }
        return "hace \(Int((Double(m) / 60).rounded())) h"
    }

    static func windPhrase(_ wt: WindType, _ kn: Double?) -> String {
        wt.key == "calm" ? "sin apenas viento" : "viento \(wt.label.lowercased()) de \(fmt(kn, 0)) kn"
    }

    static func wetsuit(_ c: Double?) -> String {
        guard let c else { return "" }
        return c < 15 ? "Neopreno 5/4 y escarpines" : c < 17 ? "Neopreno 4/3" : c < 20 ? "Neopreno 3/2" : "Neopreno corto"
    }

    // ---------- Índice UV (escala de la OMS) ----------

    static func uvLabel(_ uv: Double) -> String {
        switch Int(uv.rounded()) {
        case ..<3: "Bajo"
        case 3...5: "Moderado"
        case 6...7: "Alto"
        case 8...10: "Muy alto"
        default: "Extremo"
        }
    }

    static func uvAdvice(_ uv: Double) -> String {
        let i = Int(uv.rounded())
        return i < 3 ? "sin protección especial" : i < 8 ? "crema solar y gorra" : "evita el sol de mediodía"
    }

    /// Cuándo llega la próxima marea favorable para el spot: "Próxima bajamar a las 03:28".
    /// `dayEnd` es el final del día local: lo que cae después se indica como "mañana".
    static func idealTideText(_ pref: String, ext: [TideExtreme], now: Double, dayEnd: Double, tz: String) -> String {
        if pref == "all" { return "Funciona con cualquier marea" }
        let tomorrow = { (t: Double) in t >= dayEnd ? "mañana " : "" }
        if pref == "mid" {
            let mids = zip(ext, ext.dropFirst()).map { ($0.t + $1.t) / 2 }
            guard let t = mids.first(where: { $0 > now }) else { return "Sin datos de marea suficientes" }
            return "Próxima media marea \(tomorrow(t))hacia las \(hhmm(t, tz))"
        }
        let type = pref == "low" ? "low" : "high"
        guard let e = ext.first(where: { $0.type == type && $0.t > now }) else { return "Sin datos de marea suficientes" }
        return "Próxima \(type == "low" ? "bajamar" : "pleamar") \(tomorrow(e.t))a las \(hhmm(e.t, tz))"
    }

    /// Coordenadas legibles: "43,4590° N · 3,7350° O".
    static func coords(_ lat: Double, _ lon: Double) -> String {
        "\(fmt(abs(lat), 4))° \(lat >= 0 ? "N" : "S") · \(fmt(abs(lon), 4))° \(lon >= 0 ? "E" : "O")"
    }

    static func tidePrefLabel(_ p: String) -> String {
        ["low": "baja", "mid": "media", "high": "alta", "all": "cualquiera"][p] ?? "cualquiera"
    }

    static func coefLabel(_ c: Int?) -> String {
        guard let c else { return "" }
        return c >= 95 ? "vivas fuertes" : c >= 70 ? "mareas vivas" : c >= 45 ? "marea media" : "mareas muertas"
    }

    /// Búsqueda sin mayúsculas ni tildes; cada palabra debe aparecer.
    static func normalize(_ s: String) -> String {
        s.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "es_ES"))
    }

    static func matches(name: String, region: String, query: String) -> Bool {
        let hay = normalize("\(name) \(region)")
        return normalize(query).split(whereSeparator: \.isWhitespace).allSatisfy { hay.contains($0) }
    }

    // ---------- Marea ----------

    /// Nivel interpolado y si sube o baja.
    static func tideAt(_ points: [SeriesPoint], _ t: Double) -> (h: Double, rising: Bool)? {
        guard points.count > 1 else { return nil }
        for i in 0..<(points.count - 1) where t >= points[i].t && t <= points[i + 1].t {
            let f = (t - points[i].t) / (points[i + 1].t - points[i].t)
            return (points[i].v + (points[i + 1].v - points[i].v) * f, points[i + 1].v > points[i].v)
        }
        return nil
    }

    /// Valor interpolado de una serie; nil si cae en un hueco mayor que maxGap.
    static func valueAt(_ points: [SeriesPoint]?, _ t: Double, maxGap: Double = 2 * 3_600_000) -> Double? {
        guard let points, points.count > 1 else { return nil }
        for i in 0..<(points.count - 1) where t >= points[i].t && t <= points[i + 1].t {
            let (a, b) = (points[i], points[i + 1])
            return b.t - a.t > maxGap ? nil : a.v + (b.v - a.v) * (t - a.t) / (b.t - a.t)
        }
        return nil
    }

    /// Coeficiente de la marea en curso: el de la pleamar más cercana.
    static func coefficientAt(_ ext: [TideExtreme], _ t: Double) -> Int? {
        ext.filter { $0.coef != nil }.min { abs($0.t - t) < abs($1.t - t) }?.coef
    }

    static func duration(_ ms: Double) -> String {
        let m = Int((ms / 60_000).rounded()), h = m / 60
        return h > 0 ? "\(h) h \(String(format: "%02d", m % 60)) min" : "\(m) min"
    }

    /// Cuánto suben o bajan el mar el viento y la presión (residuo meteorológico de Puertos del Estado).
    static func surgeText(_ m: Double?) -> String {
        guard let m else { return "Viento y presión: sin dato a esta hora" }
        let cm = abs(Int((m * 100).rounded()))
        if cm < 3 { return "Viento y presión: sin efecto apreciable" }
        return "Viento y presión: \(m > 0 ? "suben" : "bajan") el mar \(cm) cm"
    }
}

extension Date {
    init(ms: Double) { self.init(timeIntervalSince1970: ms / 1000) }
    var ms: Double { timeIntervalSince1970 * 1000 }
}
