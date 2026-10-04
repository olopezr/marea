import SwiftUI

// Curva "Marea de hoy" con cursor deslizable (public/js/tidechart.js): al arrastrar muestra la hora,
// la altura, si sube o baja, el coeficiente, el efecto del viento y la presión y el nivel medido.
struct TideChartView: View {
    let day: TideDay
    let sun: Sun?
    let tz: String
    @State private var current: Double
    private let now: Double

    // Mismo sistema de coordenadas que el SVG de la web (340 × 176), escalado al ancho disponible.
    private static let W: CGFloat = 340, H: CGFloat = 176, TOP: CGFloat = 26, BOTTOM: CGFloat = 40
    private static let step: Double = 15 * 60_000

    init(day: TideDay, sun: Sun?, tz: String, now: Double = Date.now.ms) {
        self.day = day
        self.sun = sun
        self.tz = tz
        self.now = now
        let inDay = now >= day.from && now < day.to
        _current = State(initialValue: min(day.to - 60_000, max(day.from, inDay ? now : day.from + 12 * 3_600_000)))
    }

    private var extremes: [TideExtreme] { day.ext.filter { $0.t >= day.from && $0.t < day.to } }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            readout
            GeometryReader { geo in
                let scale = geo.size.width / Self.W
                Canvas { ctx, _ in
                    ctx.scaleBy(x: scale, y: scale)
                    draw(&ctx)
                }
                .contentShape(Rectangle())
                .gesture(DragGesture(minimumDistance: 0).onChanged { v in
                    current = clamp(day.from + Double(v.location.x / geo.size.width) * (day.to - day.from))
                })
            }
            .aspectRatio(Self.W / Self.H, contentMode: .fit)
            .sensoryFeedback(.selection, trigger: Int(current / Self.step))
            .accessibilityElement()
            .accessibilityLabel(L("chart.ariaShort"))
            .accessibilityValue(accessibilityValue)
            .accessibilityAdjustableAction { dir in
                switch dir {
                case .increment: current = clamp(current + Self.step)
                case .decrement: current = clamp(current - Self.step)
                @unknown default: break
                }
            }
            legend
        }
    }

    private func clamp(_ t: Double) -> Double { min(day.to - 60_000, max(day.from, t)) }

    // ---------- Geometría ----------

    private var range: (min: Double, max: Double) {
        let vals = day.points.map(\.v) + (day.observed?.points.map(\.v) ?? [])
        return ((vals.min() ?? 0) - 0.2, (vals.max() ?? 1) + 0.2)
    }
    private func x(_ t: Double) -> CGFloat { CGFloat((t - day.from) / (day.to - day.from)) * Self.W }
    private func y(_ v: Double) -> CGFloat {
        let r = range
        return Self.TOP + CGFloat(1 - (v - r.min) / (r.max - r.min)) * (Self.H - Self.TOP - Self.BOTTOM)
    }
    private func path(_ pts: [SeriesPoint]) -> Path {
        var p = Path()
        for (i, pt) in pts.enumerated() {
            let c = CGPoint(x: x(pt.t), y: y(pt.v))
            if i == 0 { p.move(to: c) } else { p.addLine(to: c) }
        }
        return p
    }

    private func draw(_ ctx: inout GraphicsContext) {
        let W = Self.W, H = Self.H, TOP = Self.TOP, BOTTOM = Self.BOTTOM
        var clipped = ctx
        clipped.clip(to: Path(CGRect(x: 0, y: 0, width: W, height: H)))
        // Noche
        if let sun {
            let h = H - TOP - BOTTOM + 10
            clipped.fill(Path(CGRect(x: 0, y: TOP - 10, width: max(0, x(sun.rise)), height: h)), with: .color(Theme.surface2))
            clipped.fill(Path(CGRect(x: x(sun.set), y: TOP - 10, width: max(0, W - x(sun.set)), height: h)), with: .color(Theme.surface2))
        }
        // Predicción
        let line = path(day.points)
        var area = line
        if let last = day.points.last, let first = day.points.first {
            area.addLine(to: CGPoint(x: x(last.t), y: H - BOTTOM))
            area.addLine(to: CGPoint(x: x(first.t), y: H - BOTTOM))
            area.closeSubpath()
        }
        clipped.fill(area, with: .color(Theme.sea.opacity(0.22)))
        clipped.stroke(line, with: .color(Theme.sea), lineWidth: 2.4)
        // Medido
        let obs = day.observed?.points ?? []
        if !obs.isEmpty {
            clipped.stroke(path(obs), with: .color(Theme.accent), style: StrokeStyle(lineWidth: 1.6, lineCap: .round, dash: [1, 3]))
        }
        // Pleamares y bajamares
        for e in extremes {
            let c = CGPoint(x: x(e.t), y: y(e.h))
            let dot = Path(ellipseIn: CGRect(x: c.x - 3.5, y: c.y - 3.5, width: 7, height: 7))
            ctx.fill(dot, with: .color(Theme.surface))
            ctx.stroke(dot, with: .color(Theme.sea), lineWidth: 2)
            let label = ctx.resolve(Text("\(Surf.hhmm(e.t, tz)) · \(Surf.fmt(e.h))").font(.custom("JetBrainsMono-SemiBold", fixedSize: 10)).foregroundColor(Theme.ink))
            // Centrada sobre el punto, sin salirse por los bordes.
            let half = label.measure(in: CGSize(width: W, height: H)).width / 2
            let lx = min(W - half, max(half, c.x))
            ctx.draw(label, at: CGPoint(x: lx, y: e.type == "high" ? c.y - 13 : c.y + 13), anchor: .center)
        }
        if let first = obs.first(where: { $0.t >= day.from + 20 * 60_000 }) {
            let label = Text(L("chart.measuredLabel")).font(.custom("JetBrainsMono-SemiBold", fixedSize: 9)).foregroundColor(Theme.accentText)
            ctx.draw(label, at: CGPoint(x: x(first.t) + 4, y: max(12, y(first.v) - 8)), anchor: .bottomLeading)
        }
        // Ahora
        if now >= day.from && now < day.to {
            var p = Path()
            p.move(to: CGPoint(x: x(now), y: TOP - 10)); p.addLine(to: CGPoint(x: x(now), y: H - BOTTOM))
            ctx.stroke(p, with: .color(Theme.accent), style: StrokeStyle(lineWidth: 1.5, dash: [3, 3]))
        }
        // Cursor
        if let at = Surf.tideAt(day.points, current) {
            let cx = x(current)
            var p = Path()
            p.move(to: CGPoint(x: cx, y: TOP - 10)); p.addLine(to: CGPoint(x: cx, y: H - BOTTOM))
            ctx.stroke(p, with: .color(Theme.ink), lineWidth: 1.2)
            let dot = Path(ellipseIn: CGRect(x: cx - 6, y: y(at.h) - 6, width: 12, height: 12))
            ctx.fill(dot, with: .color(Theme.sea))
            ctx.stroke(dot, with: .color(Theme.surface), lineWidth: 2.5)
            if let measured = Surf.valueAt(day.observed?.points, current, maxGap: 20 * 60_000) {
                let o = Path(ellipseIn: CGRect(x: cx - 4, y: y(measured) - 4, width: 8, height: 8))
                ctx.fill(o, with: .color(Theme.accent))
                ctx.stroke(o, with: .color(Theme.surface), lineWidth: 2)
            }
        }
        // Eje
        for hh in [0, 6, 12, 18] {
            let t = Text(String(format: "%02dh", hh)).font(.custom("JetBrainsMono-SemiBold", fixedSize: 9)).foregroundColor(Theme.muted)
            ctx.draw(t, at: CGPoint(x: CGFloat(hh) / 24 * W + 2, y: H - 4), anchor: .bottomLeading)
        }
    }

    // ---------- Lectura ----------

    private var readout: some View {
        let at = Surf.tideAt(day.points, current)
        let measured = Surf.valueAt(day.observed?.points, current, maxGap: 20 * 60_000)
        let coef = Surf.coefficientAt(day.ext, current)
        let next = day.ext.first { $0.t > current }
        let residual = Surf.valueAt(day.surge?.points, current)
        let isNow = abs(current - now) < 8 * 60_000
        return VStack(alignment: .leading, spacing: 4) {
            FlowLayout(spacing: 14, lineSpacing: 4) {
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    Text(Surf.hhmm(current, tz)).font(Theme.monoBold(20))
                    if isNow { Text(L("chart.now")).font(Theme.mono(10)).tracking(0.8).foregroundStyle(Theme.accentText) }
                }
                if let at {
                    (Text(Surf.fmt(at.h, 2)).font(Theme.monoBold(17)) + Text(" m \(at.rising ? "↗" : "↘") \(L(at.rising ? "chart.rising" : "chart.falling"))").font(Theme.body(15)))
                }
                if let coef {
                    (Text(L("chart.coef") + " ").font(Theme.body(15)) + Text("\(coef)").font(Theme.monoBold(17)) + Text(" \(Surf.coefLabel(coef))").font(Theme.body(15)).foregroundColor(Theme.muted))
                }
            }
            .foregroundStyle(Theme.ink)
            // Una línea por dato, y siempre las mismas para el día: así el recuadro no cambia de alto al deslizar.
            VStack(alignment: .leading, spacing: 2) {
                if let next { Text(L("chart.next", next.word, Surf.duration(next.t - current), Surf.hhmm(next.t, tz), Surf.fmt(next.h))) }
                if day.surge != nil { Text(Surf.surgeText(residual)) }
                if day.observed?.points.isEmpty == false { Text(measured.map { L("chart.measured", Surf.fmt($0, 2)) } ?? L("chart.measuredNone")) }
            }
            .font(Theme.body(13)).foregroundStyle(Theme.muted)
        }
        .padding(.horizontal, 12).padding(.vertical, 10).frame(maxWidth: .infinity, minHeight: 58, alignment: .leading)
        .background(Theme.bg, in: RoundedRectangle(cornerRadius: 12))
        .accessibilityElement(children: .combine)
    }

    private var accessibilityValue: String {
        guard let at = Surf.tideAt(day.points, current) else { return Surf.hhmm(current, tz) }
        return L("chart.value", Surf.hhmm(current, tz), Surf.fmt(at.h), L(at.rising ? "chart.rising" : "chart.falling"))
    }

    private var legend: some View {
        let coefs = extremes.filter { $0.coef != nil }
        return FlowLayout(spacing: 14, lineSpacing: 4) {
            swatch(Theme.sea, dash: nil, width: 2.4, label: L("legend.prediction"))
            if let o = day.observed, !o.points.isEmpty {
                swatch(Theme.accent, dash: [1, 3], width: 2, label: L("legend.measuredAt", o.gauge) + (o.samePort == false ? L("legend.away", "\(Int(o.distKm ?? 0))") : ""))
            }
            swatch(Theme.accent, dash: [3, 3], width: 1.5, label: L("legend.now"))
            if !coefs.isEmpty {
                Text(L("legend.coefs", coefs.map { "\($0.coef!) (\(Surf.hhmm($0.t, tz)))" }.joined(separator: " · ")))
            }
        }
        .font(Theme.body(13)).foregroundStyle(Theme.muted)
    }

    private func swatch(_ color: Color, dash: [CGFloat]?, width: CGFloat, label: String) -> some View {
        HStack(spacing: 6) {
            Path { p in p.move(to: CGPoint(x: 0, y: 1.5)); p.addLine(to: CGPoint(x: 16, y: 1.5)) }
                .stroke(color, style: StrokeStyle(lineWidth: width, lineCap: dash == [1, 3] ? .round : .butt, dash: dash ?? []))
                .frame(width: 16, height: 3)
            Text(label)
        }
    }
}
