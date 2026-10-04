import AppIntents
import SwiftUI
import WidgetKit

// Widget de Marea: las condiciones de ahora en el spot que el usuario elige al editar el widget.
// Los datos salen de la misma API que la app (/api/spots/<id>). Si no llegan, se muestra "–" y
// "Sin datos ahora": nunca valores de ejemplo, porque un surfero los tomaría por reales.

private func tr(_ key: String, _ args: String...) -> String {
    let s = NSLocalizedString(key, comment: "")
    return args.isEmpty ? s : String(format: s, arguments: args)
}

private let english = Bundle.main.preferredLocalizations.first == "en"

/// Número con coma decimal (punto en inglés); "–" si falta.
private func fmt(_ n: Double?, _ digits: Int = 1) -> String {
    guard let n else { return "–" }
    let s = String(format: "%.\(digits)f", n)
    return english ? s : s.replacingOccurrences(of: ".", with: ",")
}

// ---------- Spots que se pueden elegir (la misma lista que la app) ----------

struct SpotEntity: AppEntity {
    let id: String
    let name: String
    let region: String

    static let typeDisplayRepresentation: TypeDisplayRepresentation = "Spot"
    static let defaultQuery = SpotQuery()
    var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(name)", subtitle: "\(region)") }

    static let all: [SpotEntity] = {
        struct Raw: Decodable { let id: String; let name: String; let region: String }
        guard let url = Bundle.main.url(forResource: "spots", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let raw = try? JSONDecoder().decode([Raw].self, from: data) else { return [] }
        return raw.map { SpotEntity(id: $0.id, name: $0.name, region: $0.region) }
    }()
    static let fallback = all.first { $0.id == "somo" } ?? all.first ?? SpotEntity(id: "somo", name: "Somo", region: "Cantabria")
}

struct SpotQuery: EntityStringQuery {
    func entities(for identifiers: [String]) async throws -> [SpotEntity] { SpotEntity.all.filter { identifiers.contains($0.id) } }
    func entities(matching string: String) async throws -> [SpotEntity] {
        let fold = { (s: String) in s.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: nil) }
        return SpotEntity.all.filter { fold("\($0.name) \($0.region)").contains(fold(string)) }
    }
    func suggestedEntities() async throws -> [SpotEntity] { SpotEntity.all }
    func defaultResult() async -> SpotEntity? { SpotEntity.fallback }
}

struct SelectSpotIntent: WidgetConfigurationIntent {
    static let title: LocalizedStringResource = "widget.chooseSpot"
    @Parameter(title: "widget.spot") var spot: SpotEntity?
}

// ---------- Datos ----------

struct SpotEntry: TimelineEntry {
    let date: Date
    let spot: SpotEntity
    var waveH: Double?
    var waveT: Double?
    var wind: Double?
    var rating: String?
    var tideH: Double?
    var tideRising: Bool?
    var loaded: Bool { waveH != nil }
}

/// Lo que el widget necesita de la respuesta de /api/spots/<id>.
private struct SpotResponse: Decodable {
    struct Now: Decodable { let h: Double?; let T: Double?; let wind: Double? }
    struct Tide: Decodable { let h: Double?; let rising: Bool? }
    let now: Now
    let rating: String
    let tide: Tide
}

struct Provider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> SpotEntry { SpotEntry(date: .now, spot: .fallback) }

    func snapshot(for configuration: SelectSpotIntent, in context: Context) async -> SpotEntry {
        context.isPreview ? placeholder(in: context) : await entry(for: configuration.spot ?? .fallback)
    }

    func timeline(for configuration: SelectSpotIntent, in context: Context) async -> Timeline<SpotEntry> {
        let e = await entry(for: configuration.spot ?? .fallback)
        // Cada 30 min con datos; si fallaron, se reintenta antes.
        return Timeline(entries: [e], policy: .after(Date.now.addingTimeInterval(e.loaded ? 1800 : 600)))
    }

    private func entry(for spot: SpotEntity) async -> SpotEntry {
        var e = SpotEntry(date: .now, spot: spot)
        let base = (Bundle.main.object(forInfoDictionaryKey: "MareaAPIBase") as? String).flatMap { $0.isEmpty ? nil : $0 } ?? "https://marea.onrender.com"
        guard let url = URL(string: "\(base)/api/spots/\(spot.id)") else { return e }
        var req = URLRequest(url: url, timeoutInterval: 25)
        req.setValue(english ? "en" : "es", forHTTPHeaderField: "Accept-Language")
        guard let (data, res) = try? await URLSession.shared.data(for: req),
              (res as? HTTPURLResponse)?.statusCode == 200,
              let s = try? JSONDecoder().decode(SpotResponse.self, from: data) else { return e }
        e.waveH = s.now.h; e.waveT = s.now.T; e.wind = s.now.wind
        e.rating = s.rating; e.tideH = s.tide.h; e.tideRising = s.tide.rising
        return e
    }
}

// ---------- Vista ----------

struct MareaWidgetEntryView: View {
    @Environment(\.widgetFamily) var family
    var entry: SpotEntry

    private var ratingColor: Color {
        switch entry.rating {
        case "epic": Color(red: 0.17, green: 0.54, blue: 0.35)
        case "good": Color(red: 0.49, green: 0.60, blue: 0.15)
        case "fair": Color(red: 0.82, green: 0.64, blue: 0.16)
        case "poor": Color(red: 0.44, green: 0.60, blue: 0.65)
        default: Color.gray
        }
    }

    private var tideText: String {
        guard let h = entry.tideH else { return "–" }
        return "\(fmt(h)) m \(entry.tideRising == true ? "↗" : "↘")"
    }

    var body: some View {
        Group {
            if family == .systemSmall { small } else { medium }
        }
        .widgetURL(URL(string: "marea://spot/\(entry.spot.id)"))
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 6) {
                Text(entry.spot.name).font(.system(size: 16, weight: .bold)).lineLimit(1)
                if entry.rating != nil { Circle().fill(ratingColor).frame(width: 8, height: 8) }
            }
            Text(entry.spot.region).font(.system(size: 11)).foregroundStyle(.secondary).lineLimit(1)
        }
    }

    private var wave: some View {
        HStack(alignment: .firstTextBaseline, spacing: 3) {
            Text(fmt(entry.waveH)).font(.system(size: 30, weight: .bold, design: .rounded))
            Text("m").font(.system(size: 14, weight: .semibold)).foregroundStyle(.secondary)
            if entry.loaded { Text("· \(fmt(entry.waveT, 0)) s").font(.system(size: 13, weight: .medium)).foregroundStyle(.secondary) }
        }
    }

    private var small: some View {
        VStack(alignment: .leading, spacing: 4) {
            header
            Spacer(minLength: 0)
            wave
            Text(entry.loaded ? tr("widget.wind", fmt(entry.wind, 0)) : tr("widget.noData"))
                .font(.system(size: 11, weight: .medium)).foregroundStyle(.secondary).lineLimit(1)
        }
    }

    private var medium: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                header
                if let r = entry.rating {
                    Text(tr("rating.\(r)")).font(.system(size: 12, weight: .semibold)).foregroundStyle(ratingColor)
                }
                Spacer(minLength: 0)
                wave
            }
            Spacer(minLength: 0)
            VStack(alignment: .trailing, spacing: 10) {
                if entry.loaded {
                    Text(tr("widget.wind", fmt(entry.wind, 0)))
                    Text(tr("widget.tide", tideText))
                } else {
                    Text(tr("widget.noData"))
                }
            }
            .font(.system(size: 13, weight: .medium)).foregroundStyle(.secondary)
        }
    }
}

@main
struct MareaWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: "MareaWidget", intent: SelectSpotIntent.self, provider: Provider()) { entry in
            MareaWidgetEntryView(entry: entry)
                .containerBackground(for: .widget) { Color(UIColor.systemBackground) }
        }
        .configurationDisplayName(tr("widget.name"))
        .description(tr("widget.desc"))
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
