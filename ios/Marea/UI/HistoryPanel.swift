import SwiftUI

// "Boya frente a previsión": últimas 48 h medidas por la boya y la previsión en su posición,
// de −48 h a +24 h (historyPanel en public/js/app.js).
struct HistoryPanel: View {
    let buoy: BuoyReading
    var now = Date.now.ms
    @State private var isExpanded = false

    private static let W: CGFloat = 340, H: CGFloat = 150, LEFT: CGFloat = 30, RIGHT: CGFloat = 6, TOP: CGFloat = 10, BOTTOM: CGFloat = 24
    private var from: Double { now - 48 * 3_600_000 }
    private var to: Double { now + 24 * 3_600_000 }
    private var hist: [SeriesPoint] { buoy.history ?? [] }
    private var model: [SeriesPoint] { buoy.model ?? [] }
    private var maxV: Double {
        let m = (hist + model).map(\.v).max() ?? 1
        return max(1, (m * 1.15 * 2).rounded(.up) / 2)
    }

    var body: some View {
        Panel {
            Button {
                withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                    isExpanded.toggle()
                }
            } label: {
                HStack {
                    PanelTitle(text: L("hist.title"))
                    Spacer()
                    Image(systemName: "chevron.down")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Theme.muted)
                        .rotationEffect(.degrees(isExpanded ? 180 : 0))
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if isExpanded {
                Canvas { ctx, size in
                    let scale = size.width / Self.W
                    ctx.scaleBy(x: scale, y: scale)
                    draw(&ctx)
                }
                .aspectRatio(Self.W / Self.H, contentMode: .fit)
                .accessibilityElement()
                .accessibilityLabel(L("hist.aria"))
                .accessibilityValue(buoy.fit.map(Surf.fitText) ?? "")
                HStack(spacing: 14) {
                    swatch(Theme.accent, L("hist.measured"))
                    swatch(Theme.sea, L("hist.forecast"))
                }
                .font(Theme.body(13)).foregroundStyle(Theme.muted)
                if let fit = buoy.fit {
                    Text(Surf.fitText(fit)).font(Theme.bodySemibold(13)).foregroundStyle(Theme.ink)
                }
                Text(L("hist.place", buoy.buoy.name)).font(Theme.body(13)).foregroundStyle(Theme.muted)
            }
        }
    }

    private func x(_ t: Double) -> CGFloat { Self.LEFT + CGFloat((t - from) / (to - from)) * (Self.W - Self.LEFT - Self.RIGHT) }
    private func y(_ v: Double) -> CGFloat { Self.TOP + CGFloat(1 - v / maxV) * (Self.H - Self.TOP - Self.BOTTOM) }

    private func path(_ pts: [SeriesPoint]) -> Path {
        var p = Path()
        for (i, pt) in pts.filter({ $0.t >= from && $0.t <= to }).enumerated() {
            let c = CGPoint(x: x(pt.t), y: y(pt.v))
            if i == 0 { p.move(to: c) } else { p.addLine(to: c) }
        }
        return p
    }

    private func label(_ s: String) -> Text {
        Text(s).font(.custom("JetBrainsMono-SemiBold", fixedSize: 9)).foregroundColor(Theme.muted)
    }

    private func draw(_ ctx: inout GraphicsContext) {
        let W = Self.W, H = Self.H
        // Rejilla y eje de alturas
        let step = maxV > 4 ? 2.0 : maxV > 2 ? 1.0 : 0.5
        var v = 0.0
        while v <= maxV + 0.001 {
            var g = Path()
            g.move(to: CGPoint(x: Self.LEFT, y: y(v))); g.addLine(to: CGPoint(x: W - Self.RIGHT, y: y(v)))
            ctx.stroke(g, with: .color(Theme.line), lineWidth: 1)
            ctx.draw(label(Surf.fmt(v, step < 1 ? 1 : 0)), at: CGPoint(x: Self.LEFT - 4, y: y(v)), anchor: .trailing)
            v += step
        }
        // Ahora
        var nowLine = Path()
        nowLine.move(to: CGPoint(x: x(now), y: Self.TOP)); nowLine.addLine(to: CGPoint(x: x(now), y: H - Self.BOTTOM))
        ctx.stroke(nowLine, with: .color(Theme.accent), style: StrokeStyle(lineWidth: 1.5, dash: [3, 3]))
        // Previsión y medido
        if !model.isEmpty { ctx.stroke(path(model), with: .color(Theme.sea), style: StrokeStyle(lineWidth: 2.2, lineJoin: .round)) }
        if !hist.isEmpty {
            ctx.stroke(path(hist), with: .color(Theme.accent), style: StrokeStyle(lineWidth: 1.6, lineJoin: .round))
            for p in hist where p.t >= from {
                ctx.fill(Path(ellipseIn: CGRect(x: x(p.t) - 1.8, y: y(p.v) - 1.8, width: 3.6, height: 3.6)), with: .color(Theme.accent))
            }
        }
        // Eje de tiempo
        let ticks: [(Double, String, UnitPoint)] = [
            (from, "−48 h", .bottomLeading), (now - 24 * 3_600_000, "−24 h", .bottom), (now, L("hist.now"), .bottom), (to, "+24 h", .bottomTrailing),
        ]
        for (t, s, anchor) in ticks { ctx.draw(label(s), at: CGPoint(x: x(t), y: H - 2), anchor: anchor) }
    }

    private func swatch(_ color: Color, _ text: String) -> some View {
        HStack(spacing: 6) {
            Capsule().fill(color).frame(width: 16, height: 2.4)
            Text(text)
        }
    }
}
