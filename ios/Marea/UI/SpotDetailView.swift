import SwiftUI

// Detalle de un spot (renderSpot en public/js/app.js).
struct SpotDetailView: View {
    @Environment(AppState.self) private var app
    @Environment(\.scenePhase) private var scenePhase
    let id: String
    @State private var result: Cached<SpotDetail>?
    @State private var error: String?
    @State private var alertBusy = false

    private var meta: Spot? { Spot.byId[id] }

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                if let result {
                    detail(result)
                } else if let error {
                    ErrorBox(message: error)
                } else {
                    SkeletonCard(); SkeletonCard()
                }
            }
            .padding(.horizontal, 16).padding(.top, 12).padding(.bottom, 24)
        }
        .background(Theme.bg.ignoresSafeArea())
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) { header }
            ToolbarItem(placement: .topBarTrailing) { FavButton(on: app.favs.contains(id)) { app.toggleFav(id) } }
        }
        .toolbarBackground(Theme.bg, for: .navigationBar)
        .refreshable { await load(force: true) }
        .task { await load(force: false) }
        .task {
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(600))
                if scenePhase == .active { await load(force: true) }
            }
        }
    }

    private var header: some View {
        VStack(spacing: 1) {
            Text(meta?.name ?? "").font(Theme.heading(18, relativeTo: .headline)).foregroundStyle(Theme.ink).lineLimit(1)
            Text(L("detail.facing", meta?.region ?? "", Surf.cardinal(meta?.facing))).font(Theme.body(12, relativeTo: .caption)).foregroundStyle(Theme.muted).lineLimit(1)
        }
        .accessibilityElement(children: .combine).accessibilityAddTraits(.isHeader)
    }

    private func load(force: Bool) async {
        do {
            result = try await APIClient.shared.spot(id, force: force)
            error = nil
        } catch {
            if result == nil { self.error = error.localizedDescription }
        }
    }

    // ---------- Contenido ----------

    @ViewBuilder
    private func detail(_ res: Cached<SpotDetail>) -> some View {
        let s = res.data, tz = s.tz, n = s.now, t = s.tide
        let water = s.buoy?.water ?? n.water
        DataBanners(ts: res.ts, stale: res.stale, offline: res.offline, forecastSource: s.forecastSource)
        Hero(spot: s)
        alertButton
        BuoyPanel(spot: s)
        if let b = s.buoy, (b.history?.count ?? 0) >= 6 || !(b.model ?? []).isEmpty { HistoryPanel(buoy: b) }

        // Grid (no perezoso) para que las dos fichas de cada fila tengan la misma altura.
        Grid(horizontalSpacing: 10, verticalSpacing: 10) {
            GridRow {
                Tile(label: L("tile.swell"), value: Text("\(Surf.fmt(n.sh)) m · \(Surf.fmt(n.sT, 0)) s"), help: "swell") {
                    DirArrow(deg: n.sDir, size: 13); Text(Surf.cardinal(n.sDir))
                }
                Tile(label: L("tile.wind"), value: Text("\(Surf.fmt(n.wind, 0)) kn"), arrow: n.windDir, help: "wind") {
                    Text("\(n.gust.map { L("gusts", Surf.fmt($0, 0)) + " · " } ?? "")\(Surf.cardinal(n.windDir))")
                }
            }
            GridRow {
                Tile(label: L("tile.tide"), value: Text(t.h.map { "\(Surf.fmt($0)) m \(t.rising == true ? "↗" : "↘")" } ?? "–"), help: "tide") {
                    Text("\(t.next.map { "\($0.word) \(Surf.hhmm($0.t, tz))" } ?? "")\(t.coef.map { " · " + L("coef", "\($0)") } ?? "")")
                }
                Tile(label: L("tile.idealTide"), value: Text(Surf.tidePrefLabel(s.tidePref))) {
                    Text(Surf.idealTideText(s.tidePref, ext: s.tideDay.ext, now: Date.now.ms, dayEnd: s.tideDay.to, tz: tz))
                }
            }
            GridRow {
                let p = Surf.power(n.h, n.T)
                Tile(label: L("tile.energy"), value: Text(p.map { "\(Surf.fmt($0, $0 < 10 ? 1 : 0)) kW/m" } ?? "–"), help: "energy") {
                    Text(p.map(Surf.powerLabel) ?? "")
                }
                Tile(label: L("tile.water"), value: Text("\(Surf.fmt(water)) °C")) { Text(Surf.wetsuit(water)) }
            }
            GridRow {
                Tile(label: L("tile.air"), value: Text("\(Surf.fmt(s.meteo?.air?.air ?? n.air, 0)) °C")) {
                    Text(L(s.meteo?.air != nil ? "air.measured" : "air.forecast"))
                }
                Tile(label: L("tile.uv"), value: Text(s.uv?.now.map { "\(Int($0.rounded())) · \(Surf.uvLabel($0))" } ?? "–")) {
                    Text(s.uv.map { L("uv.max", "\(Int($0.max.rounded()))", Surf.hour($0.maxT, tz), Surf.uvAdvice($0.max)) } ?? L("uv.none"))
                }
            }
            GridRow {
                DaylightTile(sun: s.sun, from: s.tideDay.from, to: s.tideDay.to, tz: tz)
                    .gridCellColumns(2)
            }
        }

        Panel {
            HStack {
                PanelTitle(text: L("tide.today"))
                Spacer()
                Text(L("tide.slide")).font(Theme.body(12)).foregroundStyle(Theme.muted)
            }
            if s.tideDay.points.count >= 4 {
                TideChartView(day: s.tideDay, sun: s.sun, tz: tz)
            } else {
                Text(L("tide.none")).foregroundStyle(Theme.muted)
            }
            Text(tideNote(s)).font(Theme.body(13)).foregroundStyle(Theme.muted)
        }

        Panel {
            PanelTitle(text: L("hours.title"))
            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(spacing: 6) { ForEach(s.hours, id: \.t) { HourCell(hour: $0, tz: tz) } }
                    .scrollTargetLayout()
            }
            .scrollTargetBehavior(.viewAligned)
            .accessibilityLabel(L("hours.aria"))
        }

        Panel {
            PanelTitle(text: L("week.title", "\(s.days.count)"))
            Text(L("week.help"))
                .font(Theme.body(13)).foregroundStyle(Theme.muted)
            WeekChart(days: s.days, tz: tz, todayFrom: s.tideDay.from)
            Legend()
        }

        Glossary()
        LocationPanel(name: s.name, lat: s.lat, lon: s.lon)

        Text(L("updated", Surf.ago(s.updatedAt))).font(Theme.body(13)).foregroundStyle(Theme.muted)
        Footer()
    }

    private func tideNote(_ s: SpotDetail) -> String {
        if s.tide.reason == "no-port" { return L("tide.note.noPort") }
        guard s.tide.source == "ihm", let port = s.tide.port else { return L("tide.note.down") }
        var out = L("tide.note.ihm", port.name, "\(Int(port.distKm))")
        if let surge = s.tideDay.surge { out += L("tide.note.surge", surge.beach) }
        if let o = s.tideDay.observed {
            out += L("tide.note.gauge", o.gauge)
            if o.samePort != true { out += L("tide.note.neighbour", "\(Int(o.distKm ?? 0))") }
            out += "."
        }
        return out + L("tide.note.coef")
    }

    // ---------- Botón de avisos ----------

    private var alertButton: some View {
        let on = app.alerts.state.spots.contains(id)
        return Button {
            alertBusy = true
            Task {
                do {
                    try await app.alerts.toggle(id)
                    app.show(L(app.alerts.state.spots.contains(id) ? "toast.alertOn" : "toast.alertOffSpot"))
                } catch {
                    app.show(error.localizedDescription)
                }
                alertBusy = false
            }
        } label: {
            HStack(spacing: 8) {
                Image(systemName: on ? "bell.fill" : "bell")
                Text(L(on ? "alert.on" : "alert.off"))
            }
            .font(Theme.bodySemibold()).foregroundStyle(on ? Theme.accentText : Theme.ink)
            .frame(maxWidth: .infinity).padding(.vertical, 13).padding(.horizontal, 16)
            .background(Theme.surface, in: RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(on ? Theme.accent : Theme.line, lineWidth: 1.5))
        }
        .buttonStyle(.plain).disabled(alertBusy).opacity(alertBusy ? 0.6 : 1)
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

// ---------- Piezas del detalle ----------

struct Hero: View {
    let spot: SpotDetail
    var body: some View {
        let s = spot, n = s.now, r = Rating(score: s.score)
        VStack(alignment: .leading, spacing: 10) {
            Eyebrow(text: L("hero.now", Surf.hhmm(Date.now.ms, s.tz)), color: Theme.mix(Theme.bg, 0.65, Theme.ink))
            HStack(alignment: .bottom) {
                VStack(alignment: .leading, spacing: 8) {
                    // Mismo tamaño para todas las valoraciones: 26 pt es lo que cabe con "Muy bueno", la más larga,
                    // en un iPhone de 375 pt. Solo si aun así no cabe (olas de dos cifras) se reduce.
                    HStack(spacing: 4) {
                        Text(r.label).font(Theme.display(26)).foregroundStyle(Theme.heroLabel(r))
                            .lineLimit(1).minimumScaleFactor(0.8)
                        HelpButton(topic: "rating", color: Theme.bg)
                    }
                    ScoreBar(score: s.score, track: Theme.mix(Theme.bg, 0.22, Theme.ink))
                }
                Spacer()
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    Text(Surf.fmt(n.h)).font(Theme.display(58)).tracking(-2)
                    Text("m").font(Theme.body(16)).opacity(0.7)
                }
                .foregroundStyle(Theme.bg)
            }
            Text(L("hero.line", Surf.fmt(n.T, 0), Surf.cardinal(n.dir), Surf.windPhrase(n.windType, n.wind)))
                .font(Theme.body(15)).foregroundStyle(Theme.mix(Theme.bg, 0.8, Theme.ink))
        }
        .padding(18).frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.ink, in: RoundedRectangle(cornerRadius: 22))
        .accessibilityElement(children: .contain)
    }
}

struct Tile<Sub: View>: View {
    let label: String
    let value: Text
    var arrow: Double? = nil
    var help: String? = nil
    @ViewBuilder var sub: Sub
    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 0) {
                Eyebrow(text: label)
                Spacer(minLength: 4)
                if let help { HelpButton(topic: help).padding(.vertical, -14).padding(.trailing, -10) }
            }
            .frame(height: 16) // misma altura con o sin botón de ayuda
            HStack(spacing: 4) {
                value.font(Theme.mono(17.5)).foregroundStyle(Theme.ink).lineLimit(1).minimumScaleFactor(0.7)
                DirArrow(deg: arrow)
            }
            HStack(spacing: 4) { sub }.font(Theme.body(13)).foregroundStyle(Theme.muted)
        }
        .padding(.horizontal, 14).padding(.vertical, 12).frame(maxWidth: .infinity, minHeight: 86, maxHeight: .infinity, alignment: .topLeading)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 16))
        .accessibilityElement(children: help == nil ? .combine : .contain)
    }
}

struct HourCell: View {
    let hour: Hour
    let tz: String
    var body: some View {
        let r = Rating(score: hour.score)
        VStack(spacing: 5) {
            Text("\(Surf.hour(hour.t, tz))h").font(Theme.body(12.5)).foregroundStyle(Theme.muted)
            QualityCell(score: hour.score).frame(height: 6)
            Text(Surf.fmt(hour.h)).font(Theme.mono(15)).foregroundStyle(Theme.ink)
            Text("\(Surf.fmt(hour.T, 0)) s").font(Theme.body(12.5)).foregroundStyle(Theme.ink)
            HStack(spacing: 2) {
                DirArrow(deg: hour.windDir, size: 12)
                Text(Surf.fmt(hour.wind, 0)).font(Theme.body(12.5)).foregroundStyle(Theme.ink)
            }
        }
        .padding(.vertical, 8).padding(.horizontal, 4).frame(width: 52)
        .background(Theme.bg, in: RoundedRectangle(cornerRadius: 12))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(L("hour.a11y", Surf.hhmm(hour.t, tz), r.label, Surf.fmt(hour.h), Surf.fmt(hour.T, 0), Surf.fmt(hour.wind, 0)))
    }
}

/// Tabla de días: todas las filas comparten las mismas columnas horarias (la misma hora queda en la
/// misma columna cada día), con las horas encima y cabeceras para la ola máxima y la mejor hora.
struct WeekChart: View {
    let days: [Day]
    let tz: String
    let todayFrom: Double
    var now = Date.now.ms

    private func hourOf(_ t: Double) -> Int { Int(Surf.hour(t, tz)) ?? 0 }

    private var columns: [Int] {
        let hours = days.flatMap { $0.cells.map { hourOf($0.t) } }
        guard let lo = hours.min(), let hi = hours.max() else { return [] }
        return Array(lo...hi)
    }

    var body: some View {
        let cols = columns
        VStack(spacing: 8) {
            // Cabecera: una hora sí y otra no, centrada sobre su columna.
            HStack(spacing: 10) {
                Color.clear.frame(width: 52, height: 1)
                HStack(spacing: 2) {
                    ForEach(cols, id: \.self) { h in
                        Text((h - (cols.first ?? 0)) % 2 == 0 ? String(format: "%02dh", h) : "").font(Theme.mono(10)).foregroundStyle(Theme.muted)
                            .fixedSize().frame(maxWidth: .infinity)
                    }
                }
                Text(L("week.max")).frame(width: 52, alignment: .leading).lineLimit(1).minimumScaleFactor(0.8)
                Text(L("week.best")).frame(width: 30, alignment: .trailing).lineLimit(1).minimumScaleFactor(0.8)
            }
            .font(Theme.body(11)).foregroundStyle(Theme.muted)
            .accessibilityHidden(true)
            ForEach(Array(days.enumerated()), id: \.element.key) { i, d in
                WeekRow(day: d, isToday: i == 0 && d.rise < todayFrom + 86_400_000, tz: tz, columns: cols, now: now)
            }
        }
    }
}

struct WeekRow: View {
    let day: Day
    let isToday: Bool
    let tz: String
    let columns: [Int]
    let now: Double
    var body: some View {
        HStack(spacing: 10) {
            Text(isToday ? L("today") : Surf.dayLabel(day.rise, tz)).font(Theme.bodySemibold(14)).foregroundStyle(Theme.ink).frame(width: 52, alignment: .leading)
            HStack(spacing: 2) {
                ForEach(columns, id: \.self) { h in
                    if let c = day.cells.first(where: { Int(Surf.hour($0.t, tz)) == h }) {
                        QualityCell(score: c.score).opacity(isToday && c.t + 3_600_000 <= now ? 0.35 : 1)
                    } else {
                        Color.clear
                    }
                }
            }
            .frame(height: 20)
            Text("\(Surf.fmt(day.maxH)) m").font(Theme.monoBold(13)).foregroundStyle(Theme.ink).frame(width: 52, alignment: .leading)
            Text(day.best.score >= 1 ? "\(Surf.hour(day.best.t, tz))h" : "–").font(Theme.body(13)).foregroundStyle(Theme.muted)
                .frame(width: 30, alignment: .trailing)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(L("week.a11y", isToday ? L("today") : Surf.dayLabel(day.rise, tz), Surf.fmt(day.maxH)) + (day.best.score >= 1 ? L("week.a11yBest", Surf.hhmm(day.best.t, tz)) : ""))
    }
}

struct Legend: View {
    var body: some View {
        // En una sola línea repartida a lo ancho: a 12 pt cabe incluso en un iPhone de 375 pt.
        HStack(spacing: 0) {
            ForEach(Array(Rating.allCases.enumerated()), id: \.element) { i, r in
                if i > 0 { Spacer(minLength: 6) }
                HStack(spacing: 5) { QualityCell(score: r.min).frame(width: 10, height: 10); Text(r.label) }
            }
        }
        .font(Theme.body(12, relativeTo: .caption)).foregroundStyle(Theme.muted)
        .lineLimit(1).minimumScaleFactor(0.8)
    }
}

/// Disposición en líneas que salta cuando no cabe (flex-wrap).
struct FlowLayout: Layout {
    var spacing: CGFloat = 8
    var lineSpacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let rows = arrange(proposal.width ?? .infinity, subviews)
        return CGSize(width: proposal.width ?? rows.map(\.width).max() ?? 0,
                      height: rows.map(\.height).reduce(0, +) + lineSpacing * CGFloat(max(0, rows.count - 1)))
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var y = bounds.minY
        for row in arrange(bounds.width, subviews) {
            var x = bounds.minX
            for i in row.items {
                let size = subviews[i].sizeThatFits(.unspecified)
                subviews[i].place(at: CGPoint(x: x, y: y + (row.height - size.height) / 2), proposal: .unspecified)
                x += size.width + spacing
            }
            y += row.height + lineSpacing
        }
    }

    private struct Row { var items: [Int] = []; var width: CGFloat = 0; var height: CGFloat = 0 }

    private func arrange(_ maxWidth: CGFloat, _ subviews: Subviews) -> [Row] {
        var rows = [Row()]
        for (i, v) in subviews.enumerated() {
            let size = v.sizeThatFits(.unspecified)
            if !rows[rows.count - 1].items.isEmpty, rows[rows.count - 1].width + spacing + size.width > maxWidth { rows.append(Row()) }
            var r = rows[rows.count - 1]
            r.width += (r.items.isEmpty ? 0 : spacing) + size.width
            r.height = max(r.height, size.height)
            r.items.append(i)
            rows[rows.count - 1] = r
        }
        return rows
    }
}

/// Ficha "Primera luz": barra de 0 a 24 h con la noche, el día entre el amanecer y el atardecer y la hora actual.
struct DaylightTile: View {
    let sun: Sun?
    let from: Double
    let to: Double
    let tz: String
    var now = Date.now.ms

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Eyebrow(text: L("tile.firstLight"))
            if let sun {
                let len = Surf.daylight(sun.set - sun.rise)
                VStack(spacing: 4) {
                    GeometryReader { geo in
                        let w = geo.size.width
                        let x = { (t: Double) in CGFloat(min(1, max(0, (t - from) / (to - from)))) * w }
                        ZStack(alignment: .leading) {
                            Capsule().fill(Theme.surface2)
                            Rectangle().fill(Theme.q(.fair).opacity(0.8))
                                .frame(width: max(0, x(sun.set) - x(sun.rise))).offset(x: x(sun.rise))
                            ForEach([sun.rise, sun.set], id: \.self) { t in
                                Rectangle().fill(Theme.q(.fair)).frame(width: 2, height: 16).offset(x: x(t) - 1)
                            }
                            if now >= from && now < to {
                                Circle().fill(Theme.accent).overlay(Circle().stroke(Theme.surface, lineWidth: 2))
                                    .frame(width: 10, height: 10).offset(x: x(now) - 5)
                            }
                        }
                        .frame(height: 12).frame(maxHeight: .infinity)
                    }
                    .frame(height: 16)
                    HStack {
                        ForEach([0, 6, 12, 18, 24], id: \.self) { h in
                            Text(String(format: "%02dh", h)).font(.custom("JetBrainsMono-SemiBold", fixedSize: 10)).foregroundStyle(Theme.muted)
                            if h < 24 { Spacer(minLength: 0) }
                        }
                    }
                }
                HStack(alignment: .firstTextBaseline) {
                    (Text(L("sun.rise") + " ").foregroundColor(Theme.muted) + Text(Surf.hhmm(sun.rise, tz)).font(Theme.monoBold(15)).foregroundColor(Theme.ink))
                    Spacer(minLength: 6)
                    Text(L("sun.daylight", len)).foregroundStyle(Theme.muted).multilineTextAlignment(.center).lineLimit(2)
                    Spacer(minLength: 6)
                    (Text(L("sun.set") + " ").foregroundColor(Theme.muted) + Text(Surf.hhmm(sun.set, tz)).font(Theme.monoBold(15)).foregroundColor(Theme.ink))
                }
                .font(Theme.body(13))
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(L("sun.aria", Surf.hhmm(sun.rise, tz), Surf.hhmm(sun.set, tz), len))
            } else {
                Text("–").font(Theme.mono(17.5)).foregroundStyle(Theme.ink)
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 12).frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 16))
    }
}
