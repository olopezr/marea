import SwiftUI
import UIKit

// Tarjeta de condiciones para compartir (equivale a public/js/sharecard.js): imagen de 1080 x 1350 px.

/// Textos y datos de la tarjeta, sin dibujar nada: así se pueden probar sin pantalla.
struct ShareCardModel: Equatable {
    struct Stat: Equatable { var label: String; var value: String }

    var title: String
    var subtitle: String
    var rating: Rating
    var score: Double
    var height: String
    var line: String
    var stats: [Stat]
    var stamp: String
    var host: String

    static func make(_ s: SpotDetail, meta: Spot, now: Date = Date()) -> ShareCardModel {
        let n = s.now, t = s.tide
        var stats = [Stat(label: L("card.wind"), value: Surf.windPhrase(n.windType, n.wind))]
        if let h = t.h {
            stats.append(Stat(label: L("card.tide"), value: "\(Surf.fmt(h)) m \(t.rising == true ? "↗" : "↘")"))
        }
        if let w = s.buoy?.water ?? n.water {
            stats.append(Stat(label: L("card.water"), value: "\(Surf.fmt(w, 0)) °C"))
        }
        let f = DateFormatter()
        f.locale = Locale(identifier: L10n.lang == "en" ? "en_GB" : "es_ES")
        f.timeZone = TimeZone(identifier: meta.tz) ?? .current
        f.dateFormat = "EEE HH:mm"
        return ShareCardModel(
            title: meta.name,
            subtitle: meta.region,
            rating: Rating(score: s.score),
            score: s.score,
            height: Surf.fmt(n.h),
            line: "\(Surf.fmt(n.T, 0)) s · \(Surf.cardinal(n.dir))",
            stats: stats,
            stamp: f.string(from: now),
            host: APIClient.baseURL.host ?? "marea"
        )
    }
}

/// La tarjeta siempre es oscura, con los colores del modo oscuro de la app.
private enum CardColor {
    static let top = Color(red: 0x0F / 255, green: 0x3A / 255, blue: 0x47 / 255)
    static let bottom = Color(red: 0x06 / 255, green: 0x16 / 255, blue: 0x1B / 255)
    static func quality(_ r: Rating) -> Color {
        switch r {
        case .flat: Color(red: 0x2A / 255, green: 0x46 / 255, blue: 0x4F / 255)
        case .poor: Color(red: 0x4F / 255, green: 0x7F / 255, blue: 0x8A / 255)
        case .fair: Color(red: 0xE2 / 255, green: 0xB0 / 255, blue: 0x46 / 255)
        case .good: Color(red: 0xA6 / 255, green: 0xC6 / 255, blue: 0x4C / 255)
        case .epic: Color(red: 0x5C / 255, green: 0xC4 / 255, blue: 0x8C / 255)
        }
    }
}

struct ShareCardView: View {
    static let size = CGSize(width: 1080, height: 1350)
    let model: ShareCardModel

    var body: some View {
        let color = CardColor.quality(model.rating)
        ZStack(alignment: .topLeading) {
            LinearGradient(colors: [CardColor.top, CardColor.bottom], startPoint: .top, endPoint: .bottom)
            waves
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Text("MAREA").font(Theme.display(36)).foregroundStyle(.white)
                    Spacer()
                    Text(model.stamp).font(Theme.body(30)).foregroundStyle(.white.opacity(0.6))
                }
                Text(model.title)
                    .font(Theme.display(112)).foregroundStyle(.white)
                    .lineLimit(1).minimumScaleFactor(0.45)
                    .padding(.top, 40)
                Text(model.subtitle).font(Theme.body(40)).foregroundStyle(.white.opacity(0.65)).padding(.top, 6)

                HStack(spacing: 36) {
                    Text(model.rating.label.uppercased())
                        .font(Theme.display(40)).foregroundStyle(CardColor.bottom)
                        .padding(.horizontal, 32).frame(height: 76)
                        .background(color, in: Capsule())
                    HStack(spacing: 12) {
                        ForEach(0..<5, id: \.self) { i in
                            let f = max(0, min(1, model.score - Double(i)))
                            ZStack(alignment: .leading) {
                                Capsule().fill(.white.opacity(0.15))
                                Capsule().fill(color).frame(width: 52 * f)
                            }
                            .frame(width: 52, height: 24).clipShape(Capsule())
                        }
                    }
                }
                .padding(.top, 40)

                HStack(alignment: .lastTextBaseline, spacing: 24) {
                    Text(model.height).font(Theme.display(290)).foregroundStyle(.white)
                    Text("m").font(Theme.display(110)).foregroundStyle(.white.opacity(0.7))
                }
                .lineLimit(1).padding(.top, 24)
                Text(model.line).font(Theme.monoBold(64)).foregroundStyle(.white).padding(.top, 4)

                VStack(alignment: .leading, spacing: 22) {
                    ForEach(model.stats, id: \.label) { st in
                        VStack(alignment: .leading, spacing: 6) {
                            Text(st.label.uppercased()).font(Theme.bodySemibold(24)).foregroundStyle(.white.opacity(0.55))
                            Text(st.value).font(Theme.bodySemibold(46)).foregroundStyle(.white)
                                .lineLimit(1).minimumScaleFactor(0.55)
                        }
                    }
                }
                .padding(.top, 36)
                Spacer(minLength: 0)
                Text(model.host).font(Theme.body(30)).foregroundStyle(.white.opacity(0.55))
            }
            .padding(.horizontal, 72).padding(.top, 50).padding(.bottom, 40)
        }
        .frame(width: Self.size.width, height: Self.size.height)
        .environment(\.colorScheme, .dark)
        .environment(\.dynamicTypeSize, .large)
    }

    // Olas de adorno al pie.
    private var waves: some View {
        Canvas { ctx, size in
            for k in 0..<4 {
                var path = Path()
                var x: CGFloat = 0
                while x <= size.width {
                    let y = size.height - 90 + CGFloat(k) * 26 + sin(x / size.width * .pi * 4 + CGFloat(k)) * 14
                    x == 0 ? path.move(to: CGPoint(x: x, y: y)) : path.addLine(to: CGPoint(x: x, y: y))
                    x += 8
                }
                ctx.stroke(path, with: .color(.white.opacity(0.07)), lineWidth: 6)
            }
        }
    }
}

@MainActor
enum ShareCard {
    /// La tarjeta como imagen de 1080 x 1350 px.
    static func image(_ model: ShareCardModel) -> UIImage? {
        let renderer = ImageRenderer(content: ShareCardView(model: model))
        renderer.scale = 1
        renderer.isOpaque = true
        return renderer.uiImage
    }
}
