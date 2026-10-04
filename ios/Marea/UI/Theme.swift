import SafariServices
import SwiftUI
import UIKit

// Colores y tipografías de public/css/app.css, en claro y oscuro.
enum Theme {
    private static func dyn(_ light: UInt32, _ dark: UInt32) -> Color {
        Color(uiColor: UIColor { $0.userInterfaceStyle == .dark ? UIColor(hex: dark) : UIColor(hex: light) })
    }

    static let bg = dyn(0xE9EFF0, 0x071A20)
    static let surface = dyn(0xF7FAFA, 0x0D252D)
    static let surface2 = dyn(0xDFE8EA, 0x133039)
    static let ink = dyn(0x0D2A33, 0xDCE9EB)
    static let muted = dyn(0x557079, 0x8FA9AF)
    static let line = dyn(0xC6D4D7, 0x1D3A43)
    static let accent = dyn(0xD9502A, 0xFF7A4D)
    static let sea = dyn(0x1F6F80, 0x5BB6C6)
    static let green = dyn(0x2C8A5A, 0x5CC48C)
    static let red = dyn(0xC62828, 0xFF6B6B)

    static func q(_ r: Rating) -> Color {
        switch r {
        case .flat: dyn(0xB9C7CA, 0x2A464F)
        case .poor: dyn(0x6F9AA5, 0x4F7F8A)
        case .fair: dyn(0xD1A22A, 0xE2B046)
        case .good: dyn(0x7C9A26, 0xA6C64C)
        case .epic: dyn(0x2C8A5A, 0x5CC48C)
        }
    }

    // Texto pequeño sobre fondos claros: versiones más oscuras para llegar al contraste mínimo de
    // accesibilidad (4,5:1). En oscuro el color normal ya lo cumple.
    static let accentText = dyn(0xAA472C, 0xFF7A4D)
    static let greenText = dyn(0x257351, 0x5CC48C)

    /// Texto de la etiqueta de valoración (chip) con contraste suficiente sobre su fondo tintado.
    static func qText(_ r: Rating) -> Color {
        switch r {
        case .flat: dyn(0x596F75, 0x7E9398)
        case .poor: dyn(0x486D77, 0x799FA7)
        case .fair: dyn(0x73682E, 0xE2B046)
        case .good: dyn(0x526F2B, 0xA6C64C)
        case .epic: dyn(0x247150, 0x5CC48C)
        }
    }

    /// Valoración grande del recuadro superior: en oscuro el recuadro es claro y el color se oscurece más.
    /// Color de la tendencia de la boya: verde si sube, acento si baja.
    static func trend(_ key: String) -> Color { key == "up" ? greenText : key == "down" ? accentText : ink }

    static func heroLabel(_ r: Rating) -> Color {
        let q = UIColor(Theme.q(r)), bg = UIColor(Theme.bg)
        return Color(uiColor: UIColor { traits in
            UIColor(mix(Color(q.resolvedColor(with: traits)), traits.userInterfaceStyle == .dark ? 0.6 : 0.72, Color(bg.resolvedColor(with: traits))))
                .resolvedColor(with: traits)
        })
    }

    /// Equivalente a color-mix(in srgb, a p%, b).
    static func mix(_ a: Color, _ p: Double, _ b: Color) -> Color {
        Color(uiColor: UIColor { traits in
            let ua = UIColor(a).resolvedColor(with: traits), ub = UIColor(b).resolvedColor(with: traits)
            var (r1, g1, b1, a1, r2, g2, b2, a2) = (CGFloat(0), CGFloat(0), CGFloat(0), CGFloat(0), CGFloat(0), CGFloat(0), CGFloat(0), CGFloat(0))
            ua.getRed(&r1, green: &g1, blue: &b1, alpha: &a1)
            ub.getRed(&r2, green: &g2, blue: &b2, alpha: &a2)
            let t = CGFloat(p)
            return UIColor(red: r1 * t + r2 * (1 - t), green: g1 * t + g2 * (1 - t), blue: b1 * t + b2 * (1 - t), alpha: a1 * t + a2 * (1 - t))
        })
    }

    // Tipografías con Dynamic Type.
    static func display(_ size: CGFloat, relativeTo style: Font.TextStyle = .largeTitle) -> Font {
        .custom("ArchivoExpanded-ExtraBold", size: size, relativeTo: style)
    }
    static func heading(_ size: CGFloat, relativeTo style: Font.TextStyle = .title3) -> Font {
        .custom("Archivo-Bold", size: size, relativeTo: style)
    }
    static func body(_ size: CGFloat = 16, relativeTo style: Font.TextStyle = .body) -> Font {
        .custom("Figtree-Regular", size: size, relativeTo: style)
    }
    static func bodySemibold(_ size: CGFloat = 16, relativeTo style: Font.TextStyle = .body) -> Font {
        .custom("Figtree-SemiBold", size: size, relativeTo: style)
    }
    static func mono(_ size: CGFloat, relativeTo style: Font.TextStyle = .body) -> Font {
        .custom("JetBrainsMono-SemiBold", size: size, relativeTo: style)
    }
    static func monoBold(_ size: CGFloat, relativeTo style: Font.TextStyle = .body) -> Font {
        .custom("JetBrainsMono-Bold", size: size, relativeTo: style)
    }
}

extension UIColor {
    convenience init(hex: UInt32) {
        self.init(red: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255, blue: CGFloat(hex & 0xFF) / 255, alpha: 1)
    }
}

// ---------- Piezas de interfaz ----------

/// Etiqueta en mayúsculas y monoespaciada (.eyebrow / dt).
struct Eyebrow: View {
    let text: String
    var color: Color = Theme.muted
    var body: some View {
        Text(text.uppercased()).font(Theme.mono(10.5, relativeTo: .caption2)).tracking(1.1).foregroundStyle(color)
    }
}

/// Flecha que indica hacia dónde va el oleaje o el viento (dirección de origen + 180°).
struct DirArrow: View {
    let deg: Double?
    var size: CGFloat = 15
    var color: Color = Theme.sea
    var body: some View {
        if let deg {
            ArrowShape().fill(color).frame(width: size, height: size).rotationEffect(.degrees(deg + 180))
                .accessibilityHidden(true)
        }
    }
}

struct ArrowShape: Shape {
    func path(in r: CGRect) -> Path {
        let s = r.width / 24
        var p = Path()
        p.move(to: CGPoint(x: 12 * s, y: 3 * s))
        p.addLine(to: CGPoint(x: 18 * s, y: 12 * s))
        p.addLine(to: CGPoint(x: 14 * s, y: 12 * s))
        p.addLine(to: CGPoint(x: 14 * s, y: 21 * s))
        p.addLine(to: CGPoint(x: 10 * s, y: 21 * s))
        p.addLine(to: CGPoint(x: 10 * s, y: 12 * s))
        p.addLine(to: CGPoint(x: 6 * s, y: 12 * s))
        p.closeSubpath()
        return p
    }
}

/// Cinco barras rellenas según la valoración.
struct ScoreBar: View {
    let score: Double
    var track: Color = Theme.line
    var body: some View {
        let q = Theme.q(Rating(score: score))
        HStack(spacing: 3) {
            ForEach(0..<5, id: \.self) { i in
                let f = max(0, min(1, score - Double(i)))
                GeometryReader { g in
                    ZStack(alignment: .leading) {
                        track
                        q.frame(width: g.size.width * f)
                    }
                }
                .frame(width: 18, height: 6).clipShape(Capsule())
            }
        }
        .accessibilityElement().accessibilityLabel("\(Surf.fmt(score)) de 5")
    }
}

struct RatingChip: View {
    let rating: Rating
    var body: some View {
        let q = Theme.q(rating)
        Text(rating.label.uppercased()).font(Theme.monoBold(11, relativeTo: .caption)).tracking(0.7)
            .foregroundStyle(Theme.qText(rating)).padding(.horizontal, 9).padding(.vertical, 6)
            .background(q.opacity(0.16), in: Capsule())
    }
}

struct QualityCell: View {
    let score: Double
    var body: some View { RoundedRectangle(cornerRadius: 3).fill(Theme.q(Rating(score: score))) }
}

struct Banner: View {
    let text: String
    var body: some View {
        Text(text).font(Theme.body(14, relativeTo: .subheadline)).foregroundStyle(Theme.ink)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 12).padding(.vertical, 10)
            .background(Theme.mix(Theme.q(.fair), 0.18, Theme.surface), in: RoundedRectangle(cornerRadius: 10))
    }
}

struct LiveDot: View {
    var off = false
    @State private var pulse = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var body: some View {
        Circle().fill(off ? Theme.red : Theme.green).frame(width: 7, height: 7)
            .overlay {
                if !off {
                    Circle().stroke(Theme.green.opacity(pulse ? 0 : 0.6), lineWidth: pulse ? 6 : 0).scaleEffect(pulse ? 2 : 1)
                }
            }
            .onAppear { if !off && !reduceMotion { withAnimation(.easeOut(duration: 2).repeatForever(autoreverses: false)) { pulse = true } } }
            .accessibilityHidden(true)
    }
}

struct Panel<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        VStack(alignment: .leading, spacing: 10) { content }
            .padding(16).frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.surface, in: RoundedRectangle(cornerRadius: 18))
    }
}

struct PanelTitle: View {
    let text: String
    var body: some View { Text(text).font(Theme.heading(17)).foregroundStyle(Theme.ink) }
}

struct ToastView: View {
    let message: String?
    var body: some View {
        Group {
            if let message {
                Text(message).font(Theme.body(15)).foregroundStyle(Theme.bg)
                    .padding(.horizontal, 16).padding(.vertical, 12)
                    .background(Theme.ink, in: RoundedRectangle(cornerRadius: 12))
                    .shadow(color: .black.opacity(0.25), radius: 12, y: 8)
                    .padding(.horizontal, 16).padding(.bottom, 20)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .accessibilityAddTraits(.updatesFrequently)
            }
        }
        .animation(.easeOut(duration: 0.3), value: message)
    }
}

struct SkeletonCard: View {
    var height: CGFloat = 168
    @State private var phase = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var body: some View {
        RoundedRectangle(cornerRadius: 18).fill(phase ? Theme.surface2 : Theme.surface)
            .frame(height: height)
            .onAppear { if !reduceMotion { withAnimation(.easeInOut(duration: 0.65).repeatForever()) { phase = true } } }
            .accessibilityHidden(true)
    }
}

struct ErrorBox: View {
    let message: String
    var body: some View {
        VStack(spacing: 6) {
            Text(L("error.title")).font(Theme.body())
            Text(L("error.hint", message))
                .font(Theme.body(13)).foregroundStyle(Theme.muted)
        }
        .multilineTextAlignment(.center).padding(.vertical, 48).padding(.horizontal, 16).frame(maxWidth: .infinity)
    }
}

/// Avisos sobre el estado de los datos: guardados y fuente de respaldo.
struct DataBanners: View {
    let ts: Double
    let stale: Bool
    let offline: Bool
    let forecastSource: String?
    var body: some View {
        if stale {
            Banner(text: L(offline ? "banner.offline" : "banner.stale", Surf.ago(ts)))
        }
        if forecastSource == "portus" {
            Banner(text: L("banner.portus"))
        }
    }
}

struct Footer: View {
    @State private var legal: URL?
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(L("footer.sources"))
            HStack(spacing: 16) {
                link(L("footer.dataSources"), "/legal/fuentes.html")
                link(L("footer.privacy"), "/legal/privacidad.html")
                link(L("footer.legal"), "/legal/aviso-legal.html")
            }
        }
        .font(Theme.body(12, relativeTo: .caption)).foregroundStyle(Theme.muted)
        .frame(maxWidth: .infinity, alignment: .leading).padding(.top, 20)
        .sheet(item: $legal) { SafariView(url: $0).ignoresSafeArea() }
    }

    private func link(_ label: String, _ path: String) -> some View {
        // Zona táctil de 44 pt aunque el texto sea pequeño.
        Button { legal = APIClient.baseURL.appending(path: path) } label: {
            Text(label).underline().frame(minHeight: 44).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

extension URL: @retroactive Identifiable { public var id: String { absoluteString } }

struct SafariView: UIViewControllerRepresentable {
    let url: URL
    func makeUIViewController(context: Context) -> SFSafariViewController { SFSafariViewController(url: url) }
    func updateUIViewController(_ vc: SFSafariViewController, context: Context) {}
}

struct IconCircleButton: View {
    let systemName: String
    var on = false
    let label: String
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Image(systemName: systemName).font(.system(size: 17, weight: .semibold))
                .foregroundStyle(on ? Theme.accent : Theme.ink)
                .frame(width: 40, height: 40).background(Theme.surface, in: Circle())
                .frame(width: 44, height: 44).contentShape(Rectangle())
        }
        .buttonStyle(.plain).accessibilityLabel(label)
    }
}

struct FavButton: View {
    let on: Bool
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Image(systemName: on ? "star.fill" : "star").font(.system(size: 20, weight: .medium))
                .foregroundStyle(on ? Theme.accent : Theme.muted).frame(width: 44, height: 44).contentShape(Rectangle())
        }
        .buttonStyle(.plain).accessibilityLabel(L("favorite")).accessibilityAddTraits(on ? .isSelected : [])
        .sensoryFeedback(.selection, trigger: on)
    }
}

/// Logo: círculo con una ola.
struct Logo: View {
    var body: some View {
        Canvas { ctx, size in
            let s = size.width / 32
            ctx.fill(Path(ellipseIn: CGRect(x: s, y: s, width: 30 * s, height: 30 * s)), with: .color(Theme.ink))
            var p = Path()
            p.move(to: CGPoint(x: 4 * s, y: 19 * s))
            p.addCurve(to: CGPoint(x: 12 * s, y: 19 * s), control1: CGPoint(x: 7 * s, y: 15 * s), control2: CGPoint(x: 10 * s, y: 15 * s))
            p.addCurve(to: CGPoint(x: 20 * s, y: 19 * s), control1: CGPoint(x: 14 * s, y: 23 * s), control2: CGPoint(x: 17 * s, y: 23 * s))
            p.addCurve(to: CGPoint(x: 28 * s, y: 19 * s), control1: CGPoint(x: 23 * s, y: 15 * s), control2: CGPoint(x: 26 * s, y: 15 * s))
            ctx.stroke(p, with: .color(Theme.accent), style: StrokeStyle(lineWidth: 2.6 * s, lineCap: .round))
        }
        .frame(width: 28, height: 28).accessibilityHidden(true)
    }
}
