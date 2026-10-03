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
            Text("\(meta?.region ?? "") · playa orientada al \(Surf.cardinal(meta?.facing))").font(Theme.body(12, relativeTo: .caption)).foregroundStyle(Theme.muted).lineLimit(1)
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

        // Grid (no perezoso) para que las dos fichas de cada fila tengan la misma altura.
        Grid(horizontalSpacing: 10, verticalSpacing: 10) {
            GridRow {
                Tile(label: "Mar de fondo", value: Text("\(Surf.fmt(n.sh)) m · \(Surf.fmt(n.sT, 0)) s")) {
                    DirArrow(deg: n.sDir, size: 13); Text(Surf.cardinal(n.sDir))
                }
                Tile(label: "Viento", value: Text("\(Surf.fmt(n.wind, 0)) kn"), arrow: n.windDir) {
                    Text("\(n.gust.map { "Rachas \(Surf.fmt($0, 0)) kn · " } ?? "")\(Surf.cardinal(n.windDir))")
                }
            }
            GridRow {
                Tile(label: "Marea", value: Text(t.h.map { "\(Surf.fmt($0)) m \(t.rising == true ? "↗" : "↘")" } ?? "–")) {
                    Text("\(t.next.map { "\($0.word) \(Surf.hhmm($0.t, tz))" } ?? "")\(t.coef.map { " · Coef. \($0)" } ?? "")")
                }
                Tile(label: "Marea ideal", value: Text(Surf.tidePrefLabel(s.tidePref).capitalizedFirst)) {
                    Text(Surf.idealTideText(s.tidePref, ext: s.tideDay.ext, now: Date.now.ms, dayEnd: s.tideDay.to, tz: tz))
                }
            }
            GridRow {
                Tile(label: "Agua", value: Text("\(Surf.fmt(water)) °C")) { Text(Surf.wetsuit(water)) }
                Tile(label: "Aire", value: Text("\(Surf.fmt(s.meteo?.air?.air ?? n.air, 0)) °C")) {
                    Text(s.meteo?.air != nil ? "Medida en una estación cercana" : "Previsión")
                }
            }
            GridRow {
                Tile(label: "Índice UV", value: Text(s.uv?.now.map { "\(Int($0.rounded())) · \(Surf.uvLabel($0))" } ?? "–")) {
                    Text(s.uv.map { "Máx. \(Int($0.max.rounded())) a las \(Surf.hour($0.maxT, tz))h · \(Surf.uvAdvice($0.max))" } ?? "Sin previsión ahora mismo")
                }
                Tile(label: "Primera luz", value: Text(s.sun.map { Surf.hhmm($0.rise, tz) } ?? "–")) {
                    Text(s.sun.map { "Puesta \(Surf.hhmm($0.set, tz))" } ?? "")
                }
            }
        }

        Panel {
            HStack {
                PanelTitle(text: "Marea de hoy")
                Spacer()
                Text("Desliza sobre la curva").font(Theme.body(12)).foregroundStyle(Theme.muted)
            }
            if s.tideDay.points.count >= 4 {
                TideChartView(day: s.tideDay, sun: s.sun, tz: tz)
            } else {
                Text("Sin datos de marea para hoy.").foregroundStyle(Theme.muted)
            }
            Text(tideNote(s)).font(Theme.body(13)).foregroundStyle(Theme.muted)
        }

        Panel {
            PanelTitle(text: "Próximas 24 horas")
            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(spacing: 6) { ForEach(s.hours, id: \.t) { HourCell(hour: $0, tz: tz) } }
                    .scrollTargetLayout()
            }
            .scrollTargetBehavior(.viewAligned)
            .accessibilityLabel("Previsión por horas")
        }

        Panel {
            PanelTitle(text: "\(s.days.count) días")
            Text("Cada bloque es una hora de luz, coloreado según la calidad. Las horas que ya han pasado hoy aparecen atenuadas. A la derecha, la ola máxima del día y su mejor hora.")
                .font(Theme.body(13)).foregroundStyle(Theme.muted)
            WeekChart(days: s.days, tz: tz, todayFrom: s.tideDay.from)
            Legend()
        }

        LocationPanel(name: s.name, lat: s.lat, lon: s.lon)

        Text("Actualizado \(Surf.ago(s.updatedAt)).").font(Theme.body(13)).foregroundStyle(Theme.muted)
        Footer()
    }

    private func tideNote(_ s: SpotDetail) -> String {
        if s.tide.reason == "no-port" {
            return "El Instituto Hidrográfico de la Marina no publica mareas de esta zona (en el Mediterráneo la marea es de pocos centímetros). Es una estimación del modelo de Open-Meteo."
        }
        guard s.tide.source == "ihm", let port = s.tide.port else {
            return "Estimación del modelo de Open-Meteo: el servicio oficial de mareas no responde ahora mismo y puede desviarse."
        }
        var out = "Predicción oficial del Instituto Hidrográfico de la Marina para \(port.name) (a \(Int(port.distKm)) km), alturas sobre el cero hidrográfico del puerto."
        if let surge = s.tideDay.surge { out += " Efecto del viento y la presión en el nivel del mar: previsión de Puertos del Estado para \(surge.beach)." }
        if let o = s.tideDay.observed {
            out += " Nivel medido por el mareógrafo de \(o.gauge)"
            if o.samePort != true { out += ", en un puerto vecino a \(Int(o.distKm ?? 0)) km (la marea es prácticamente la misma)" }
            out += "."
        }
        return out + " El coeficiente es una estimación a partir de la carrera de cada marea."
    }

    // ---------- Botón de avisos ----------

    private var alertButton: some View {
        let on = app.alerts.state.spots.contains(id)
        return Button {
            alertBusy = true
            Task {
                do {
                    try await app.alerts.toggle(id)
                    app.show(app.alerts.state.spots.contains(id) ? "Te avisaremos cuando tus spots estén en buenas condiciones" : "Avisos desactivados para este spot")
                } catch {
                    app.show(error.localizedDescription)
                }
                alertBusy = false
            }
        } label: {
            HStack(spacing: 8) {
                Image(systemName: on ? "bell.fill" : "bell")
                Text(on ? "Avisos activados" : "Activar avisos")
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
            Eyebrow(text: "Previsión ahora · \(Surf.hhmm(Date.now.ms, s.tz))", color: Theme.mix(Theme.bg, 0.65, Theme.ink))
            HStack(alignment: .bottom) {
                VStack(alignment: .leading, spacing: 8) {
                    // Mismo tamaño para todas las valoraciones: 26 pt es lo que cabe con "Muy bueno", la más larga,
                    // en un iPhone de 375 pt. Solo si aun así no cabe (olas de dos cifras) se reduce.
                    Text(r.label).font(Theme.display(26)).foregroundStyle(Theme.heroLabel(r))
                        .lineLimit(1).minimumScaleFactor(0.8)
                    ScoreBar(score: s.score, track: Theme.mix(Theme.bg, 0.22, Theme.ink))
                }
                Spacer()
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    Text(Surf.fmt(n.h)).font(Theme.display(58)).tracking(-2)
                    Text("m").font(Theme.body(16)).opacity(0.7)
                }
                .foregroundStyle(Theme.bg)
            }
            Text("\(Surf.fmt(n.T, 0)) s del \(Surf.cardinal(n.dir)) · \(Surf.windPhrase(n.windType, n.wind))")
                .font(Theme.body(15)).foregroundStyle(Theme.mix(Theme.bg, 0.8, Theme.ink))
        }
        .padding(18).frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.ink, in: RoundedRectangle(cornerRadius: 22))
        .accessibilityElement(children: .combine)
    }
}

struct Tile<Sub: View>: View {
    let label: String
    let value: Text
    var arrow: Double? = nil
    @ViewBuilder var sub: Sub
    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Eyebrow(text: label)
            HStack(spacing: 4) {
                value.font(Theme.mono(17.5)).foregroundStyle(Theme.ink).lineLimit(1).minimumScaleFactor(0.7)
                DirArrow(deg: arrow)
            }
            HStack(spacing: 4) { sub }.font(Theme.body(13)).foregroundStyle(Theme.muted)
        }
        .padding(.horizontal, 14).padding(.vertical, 12).frame(maxWidth: .infinity, minHeight: 86, maxHeight: .infinity, alignment: .topLeading)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 16))
        .accessibilityElement(children: .combine)
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
        .accessibilityLabel("\(Surf.hhmm(hour.t, tz)): \(r.label), \(Surf.fmt(hour.h)) metros, \(Surf.fmt(hour.T, 0)) segundos, viento \(Surf.fmt(hour.wind, 0)) nudos")
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
                Text("Ola máx.").frame(width: 52, alignment: .leading)
                Text("Mejor").frame(width: 30, alignment: .trailing)
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
            Text(isToday ? "Hoy" : day.label).font(Theme.bodySemibold(14)).foregroundStyle(Theme.ink).frame(width: 52, alignment: .leading)
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
        .accessibilityLabel("\(isToday ? "Hoy" : day.label): ola máxima \(Surf.fmt(day.maxH)) metros\(day.best.score >= 1 ? ", mejor hora \(Surf.hhmm(day.best.t, tz))" : "")")
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
