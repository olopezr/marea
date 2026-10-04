import Foundation

// Utilidades de presentación portadas de public/js/surf.js y tidechart.js.
// La valoración la calcula el servidor; aquí solo se formatea.

enum Rating: String, CaseIterable, Sendable {
    case flat, poor, fair, good, epic

    var label: String { L("rating.\(rawValue)") }

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
        let c = cardinals[Int((norm / 22.5).rounded(.toNearestOrAwayFromZero)) % 16]
        return L10n.isEnglish ? c.replacingOccurrences(of: "O", with: "W") : c
    }

    /// Número con coma decimal (punto en inglés); "–" si falta.
    static func fmt(_ n: Double?, _ digits: Int = 1) -> String {
        guard let n, !n.isNaN else { return "–" }
        // Redondeo como toFixed de JavaScript: sobre el valor decimal exacto del double y con la mitad
        // hacia arriba (printf redondea al par: 1,25 → "1,2" en vez de "1,3").
        var exact = Decimal(string: String(format: "%.25f", n), locale: Locale(identifier: "en_US_POSIX")) ?? Decimal(n)
        var rounded = Decimal()
        NSDecimalRound(&rounded, &exact, digits, .plain)
        let out = String(format: "%.\(digits)f", NSDecimalNumber(decimal: rounded).doubleValue)
        return L10n.isEnglish ? out : out.replacingOccurrences(of: ".", with: ",")
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
        if m < 1 { return L("ago.now") }
        if m < 60 { return L("ago.min", "\(m)") }
        return L("ago.h", "\(Int((Double(m) / 60).rounded()))")
    }

    static func windPhrase(_ wt: WindType, _ kn: Double?) -> String {
        wt.key == "calm" ? L("windPhrase.calm") : L("windPhrase", windLabel(wt).lowercased(), fmt(kn, 0))
    }

    static func angDiff(_ a: Double, _ b: Double) -> Double {
        let d = abs((((a - b).truncatingRemainder(dividingBy: 360)) + 360).truncatingRemainder(dividingBy: 360))
        return d > 180 ? 360 - d : d
    }

    static func windType(speed: Double?, dir: Double?, facing: Double) -> WindType {
        guard let speed, let dir else { return WindType(key: "na", label: "–") }
        if speed < 5 { return WindType(key: "calm", label: windLabel(WindType(key: "calm", label: ""))) }
        let d = angDiff(dir, facing)
        let key = d >= 135 ? "off" : d >= 60 ? "cross" : "on"
        return WindType(key: key, label: windLabel(WindType(key: key, label: "")))
    }

    struct BestSessionInfo: Sendable {
        let t: Double
        let score: Double
        let h: Double?
        let T: Double?
        let wind: Double?
        let windType: String?
        let isTomorrow: Bool
    }

    static func bestSession(_ s: SpotDetail, now: Double = Date.now.ms, facing: Double = 0) -> BestSessionInfo? {
        guard !s.days.isEmpty else { return nil }
        if let set = s.sun?.set, now > set, s.days.count > 1 {
            let b = s.days[1].best
            return BestSessionInfo(t: b.t, score: b.score, h: b.h, T: b.T, wind: b.wind, windType: b.windType, isTomorrow: true)
        }
        let todayBest = s.days[0].best
        if todayBest.t >= now - 45 * 60_000 {
            return BestSessionInfo(t: todayBest.t, score: todayBest.score, h: todayBest.h, T: todayBest.T, wind: todayBest.wind, windType: todayBest.windType, isTomorrow: false)
        }
        let remaining = s.hours.filter { $0.t >= now - 30 * 60_000 && (s.sun?.set == nil || $0.t <= (s.sun?.set ?? 0)) }
        if let bestRem = remaining.max(by: { $0.score < $1.score }) {
            let wt = windType(speed: bestRem.wind, dir: bestRem.windDir, facing: facing).key
            return BestSessionInfo(t: bestRem.t, score: bestRem.score, h: bestRem.h, T: bestRem.T, wind: bestRem.wind, windType: wt, isTomorrow: false)
        }
        if s.days.count > 1 {
            let b = s.days[1].best
            return BestSessionInfo(t: b.t, score: b.score, h: b.h, T: b.T, wind: b.wind, windType: b.windType, isTomorrow: true)
        }
        return BestSessionInfo(t: todayBest.t, score: todayBest.score, h: todayBest.h, T: todayBest.T, wind: todayBest.wind, windType: todayBest.windType, isTomorrow: false)
    }

    static func wetsuit(_ c: Double?) -> String {
        guard let c else { return "" }
        return L(c < 15 ? "wetsuit.54" : c < 17 ? "wetsuit.43" : c < 20 ? "wetsuit.32" : "wetsuit.short")
    }

    // ---------- Índice UV (escala de la OMS) ----------

    static func uvLabel(_ uv: Double) -> String {
        switch Int(uv.rounded()) {
        case ..<3: L("uv.low")
        case 3...5: L("uv.moderate")
        case 6...7: L("uv.high")
        case 8...10: L("uv.veryHigh")
        default: L("uv.extreme")
        }
    }

    static func uvAdvice(_ uv: Double) -> String {
        let i = Int(uv.rounded())
        return L(i < 3 ? "uv.adviceLow" : i < 8 ? "uv.adviceMid" : "uv.adviceHigh")
    }

    /// Cuándo llega la próxima marea favorable para el spot: "Próxima bajamar a las 03:28".
    /// `dayEnd` es el final del día local: lo que cae después se indica como "mañana".
    static func idealTideText(_ pref: String, ext: [TideExtreme], now: Double, dayEnd: Double, tz: String) -> String {
        if pref == "all" { return L("ideal.all") }
        let tomorrow = { (t: Double) in t >= dayEnd ? L("ideal.tomorrow") : "" }
        if pref == "mid" {
            let mids = zip(ext, ext.dropFirst()).map { ($0.t + $1.t) / 2 }
            guard let t = mids.first(where: { $0 > now }) else { return L("ideal.noData") }
            return L("ideal.mid", tomorrow(t), hhmm(t, tz))
        }
        let type = pref == "low" ? "low" : "high"
        guard let e = ext.first(where: { $0.type == type && $0.t > now }) else { return L("ideal.noData") }
        return L(type == "low" ? "ideal.low" : "ideal.high", tomorrow(e.t), hhmm(e.t, tz))
    }

    /// Coordenadas legibles: "43,4590° N · 3,7350° O".
    static func coords(_ lat: Double, _ lon: Double) -> String {
        "\(fmt(abs(lat), 4))° \(lat >= 0 ? "N" : "S") · \(fmt(abs(lon), 4))° \(lon >= 0 ? "E" : L10n.isEnglish ? "W" : "O")"
    }

    static func tidePrefLabel(_ p: String) -> String {
        L("tidePref.\(["low", "mid", "high"].contains(p) ? p : "all")")
    }

    static func coefLabel(_ c: Int?) -> String {
        guard let c else { return "" }
        return L(c >= 95 ? "coef.springStrong" : c >= 70 ? "coef.spring" : c >= 45 ? "coef.mean" : "coef.neap")
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
        return h > 0 ? L("duration.hm", "\(h)", String(format: "%02d", m % 60)) : L("duration.m", "\(m)")
    }

    /// Cuánto suben o bajan el mar el viento y la presión (residuo meteorológico de Puertos del Estado).
    static func surgeText(_ m: Double?) -> String {
        guard let m else { return L("surge.none") }
        let cm = abs(Int((m * 100).rounded()))
        if cm < 3 { return L("surge.flat") }
        return L(m > 0 ? "surge.up" : "surge.down", "\(cm)")
    }
}

extension Surf {
    static func windLabel(_ wt: WindType) -> String { L("wind.\(["off", "cross", "on"].contains(wt.key) ? wt.key : "calm")") }

    /// Día abreviado en el idioma de la app: "Lun 5" / "Mon 5".
    static func dayLabel(_ ms: Double, _ tz: String) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: L10n.isEnglish ? "en_GB" : "es_ES")
        f.timeZone = TimeZone(identifier: tz)
        f.setLocalizedDateFormatFromTemplate("EEE d")
        let s = f.string(from: Date(ms: ms)).replacingOccurrences(of: ".", with: "").replacingOccurrences(of: ",", with: "")
        return s.prefix(1).uppercased() + s.dropFirst()
    }

    /// Duración de las horas de luz: "11 h 35 min".
    static func daylight(_ ms: Double) -> String {
        let m = Int((ms / 60_000).rounded())
        return L("duration.hm", "\(m / 60)", String(format: "%02d", m % 60))
    }

    /// Potencia del oleaje en aguas profundas (kW por metro de frente de ola): 0,49 · H² · T.
    static func power(_ h: Double?, _ T: Double?) -> Double? {
        guard let h, let T else { return nil }
        return 0.49 * h * h * T
    }

    static func powerLabel(_ p: Double) -> String {
        L(p < 5 ? "energy.low" : p < 15 ? "energy.moderate" : p < 40 ? "energy.strong" : "energy.veryStrong")
    }

    static func trendArrow(_ key: String) -> String { ["up": "↗", "down": "↘", "steady": "→"][key] ?? "" }

    /// Cambio con signo: "+0,4", "−0,2", "0,0".
    static func signed(_ x: Double) -> String {
        let r = (x * 10).rounded() / 10
        return "\(r > 0 ? "+" : r < 0 ? "−" : "")\(fmt(abs(r)))"
    }

    /// Cuánto se ha desviado la previsión de lo medido por la boya en las últimas 24 h.
    static func fitText(_ f: ForecastFit) -> String {
        if f.bias >= 0.15 { return L("hist.fitLow", fmt(f.bias)) }
        if f.bias <= -0.15 { return L("hist.fitHigh", fmt(-f.bias)) }
        return L(f.mae < 0.25 ? "hist.fitGood" : "hist.fitMixed", fmt(f.mae))
    }

    struct Moon {
        let key: String
        let emoji: String
        let illumination: Int
        let isSpringTide: Bool
        let isNeapTide: Bool
        let tideType: String
        var name: String { L("moon.\(key)") }
        var tideTypeName: String { L("moon.\(tideType)") }
    }

    static func moonPhase(_ ms: Double) -> Moon {
        let lunarMonth = 29.53058770576
        let newMoonRef = 947182440000.0 // 2000-01-06 18:14 UTC
        let daysSince = (ms - newMoonRef) / 86400e3
        var cycle = daysSince.truncatingRemainder(dividingBy: lunarMonth) / lunarMonth
        if cycle < 0 { cycle += 1 }
        let illumination = Int(((1 - cos(cycle * 2 * .pi)) / 2 * 100).rounded())

        let key: String
        let emoji: String
        if cycle < 0.03 || cycle >= 0.97 {
            key = "new"; emoji = "🌑"
        } else if cycle < 0.22 {
            key = "waxingCrescent"; emoji = "🌒"
        } else if cycle < 0.28 {
            key = "firstQuarter"; emoji = "🌓"
        } else if cycle < 0.47 {
            key = "waxingGibbous"; emoji = "🌔"
        } else if cycle < 0.53 {
            key = "full"; emoji = "🌕"
        } else if cycle < 0.72 {
            key = "waningGibbous"; emoji = "🌖"
        } else if cycle < 0.78 {
            key = "lastQuarter"; emoji = "🌗"
        } else {
            key = "waningCrescent"; emoji = "🌘"
        }

        let distFromNewOrFull = min(cycle, min(abs(cycle - 0.5), 1 - cycle))
        let isSpringTide = distFromNewOrFull <= 0.08
        let distFromQuarter = min(abs(cycle - 0.25), abs(cycle - 0.75))
        let isNeapTide = distFromQuarter <= 0.08
        let tideType = isSpringTide ? "springTide" : isNeapTide ? "neapTide" : "normalTide"

        return Moon(key: key, emoji: emoji, illumination: illumination, isSpringTide: isSpringTide, isNeapTide: isNeapTide, tideType: tideType)
    }
}

extension Date {
    init(ms: Double) { self.init(timeIntervalSince1970: ms / 1000) }
    var ms: Double { timeIntervalSince1970 * 1000 }
}
