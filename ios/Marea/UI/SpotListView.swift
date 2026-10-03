import SwiftUI

// Lista de spots: filtro, búsqueda, frase destacada y tarjetas (renderHome en public/js/app.js).
struct SpotListView: View {
    @Environment(AppState.self) private var app
    @Environment(\.scenePhase) private var scenePhase
    @State private var result: Cached<Overview>?
    @State private var error: String?
    @State private var loading = false
    @FocusState private var searchFocused: Bool

    private struct Row: Identifiable { let s: SpotSummary; let dist: Double?; var id: String { s.id } }

    private var rows: [Row] {
        let pos = app.location.position
        return (result?.data.spots ?? []).map { s in
            Row(s: s, dist: pos.map { Surf.km($0.latitude, $0.longitude, s.lat, s.lon) })
        }
    }

    private var shown: [Row] {
        let q = app.query.trimmingCharacters(in: .whitespaces)
        var list = app.filter == .fav ? rows.filter { app.favs.contains($0.s.id) } : rows
        if !q.isEmpty { list = list.filter { Surf.matches(name: $0.s.name, region: $0.s.region, query: q) } }
        if app.filter == .near, app.location.position != nil { return list.sorted { ($0.dist ?? 0) < ($1.dist ?? 0) } }
        return list.sorted { $0.s.score > $1.s.score }
    }

    var body: some View {
        @Bindable var app = app
        ScrollView {
            LazyVStack(spacing: 12) {
                if let result {
                    DataBanners(ts: result.ts, stale: result.stale, offline: result.offline, forecastSource: result.data.forecastSource)
                    content(result)
                } else if let error {
                    ErrorBox(message: error)
                } else {
                    ForEach(0..<4, id: \.self) { _ in SkeletonCard() }
                }
                Footer()
            }
            .padding(.horizontal, 16).padding(.top, 12).padding(.bottom, 24)
        }
        .scrollDismissesKeyboard(.immediately)
        .background(Theme.bg.ignoresSafeArea())
        .safeAreaInset(edge: .top, spacing: 0) { header }
        .toolbar(.hidden, for: .navigationBar)
        .refreshable { await load(force: true) }
        .task { await load(force: false) }
        .task {
            // Refresco automático cada 10 minutos mientras la pantalla está visible.
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(600))
                if scenePhase == .active { await load(force: true) }
            }
        }
        .onChange(of: scenePhase) { _, phase in if phase == .active { Task { await load(force: false) } } }
    }

    // ---------- Cabecera ----------

    private var header: some View {
        @Bindable var app = app
        return VStack(spacing: 12) {
            HStack(spacing: 8) {
                HStack(spacing: 8) {
                    Logo()
                    Text("Marea").font(Theme.display(21)).foregroundStyle(Theme.ink)
                }
                Spacer()
                if let result {
                    Text(Surf.ago(result.data.updatedAt).capitalizedFirst).font(Theme.body(12.5)).foregroundStyle(Theme.muted)
                } else {
                    Text("Cargando…").font(Theme.body(12.5)).foregroundStyle(Theme.muted)
                }
                IconCircleButton(systemName: app.alerts.state.spots.isEmpty ? "bell" : "bell.fill",
                                 on: !app.alerts.state.spots.isEmpty, label: "Avisos") { app.path.append(.alerts) }
                IconCircleButton(systemName: "arrow.clockwise", label: "Actualizar datos") { Task { await load(force: true) } }
                    .rotationEffect(.degrees(loading ? 360 : 0))
                    .animation(loading ? .linear(duration: 0.8).repeatForever(autoreverses: false) : .default, value: loading)
            }
            Picker("Filtrar spots", selection: $app.filter) {
                ForEach(ListFilter.allCases, id: \.self) { Text($0.label).tag($0) }
            }
            .pickerStyle(.segmented)
            .onChange(of: app.filter) { _, f in if f == .near { Task { await app.location.locate() } } }

            HStack(spacing: 4) {
                Image(systemName: "magnifyingglass").foregroundStyle(Theme.muted).padding(.leading, 12)
                TextField("Buscar playa o zona", text: $app.query)
                    .font(Theme.body(16)).foregroundStyle(Theme.ink)
                    .textInputAutocapitalization(.never).autocorrectionDisabled().submitLabel(.search)
                    .focused($searchFocused).padding(.vertical, 12)
                if !app.query.isEmpty {
                    Button { app.query = "" } label: {
                        Image(systemName: "xmark.circle.fill").foregroundStyle(Theme.muted).frame(width: 44, height: 44)
                    }
                    .accessibilityLabel("Borrar la búsqueda")
                }
            }
            .background(Theme.surface, in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(searchFocused ? Theme.ink : Theme.line, lineWidth: 1.5))
            // Toda la caja activa el buscador, no solo la línea de texto.
            .contentShape(RoundedRectangle(cornerRadius: 12))
            .onTapGesture { searchFocused = true }
        }
        .padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 12)
        .background(.bar)
    }

    // ---------- Contenido ----------

    @ViewBuilder
    private func content(_ result: Cached<Overview>) -> some View {
        let q = app.query.trimmingCharacters(in: .whitespaces)
        let list = shown
        if app.filter == .all, q.isEmpty, let best = rows.max(by: { $0.s.score < $1.s.score })?.s {
            Button { app.path.append(.spot(best.id)) } label: {
                (Text("Ahora mismo lo mejor está en ") + Text(best.name).foregroundColor(Theme.ink).bold().underline()
                 + Text(": \(Surf.fmt(best.now.h)) m a \(Surf.fmt(best.now.T, 0)) s, \(Surf.windPhrase(best.now.windType, best.now.wind))."))
                    .font(Theme.body(15)).foregroundStyle(Theme.muted).multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 2)
            }
            .buttonStyle(.plain)
        }
        if !q.isEmpty, !list.isEmpty {
            Text("\(list.count) \(list.count == 1 ? "spot" : "spots") para «\(q)»").font(Theme.body(15)).foregroundStyle(Theme.muted)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        if app.filter == .near, app.location.position == nil {
            Banner(text: "Permite el acceso a tu ubicación para ordenar los spots por cercanía.")
        }
        if list.isEmpty {
            emptyState(q)
        } else {
            ForEach(list) { row in
                SpotCard(spot: row.s, dist: row.dist)
            }
        }
    }

    @ViewBuilder
    private func emptyState(_ q: String) -> some View {
        VStack(spacing: 8) {
            if q.isEmpty {
                Text("Aún no tienes favoritos.").font(Theme.body())
                Text("Toca la estrella de un spot para tenerlo aquí.").font(Theme.body(13)).foregroundStyle(Theme.muted)
            } else {
                Text("Ningún spot coincide con «\(q)».").font(Theme.body())
                let elsewhere = app.filter == .fav ? rows.filter { Surf.matches(name: $0.s.name, region: $0.s.region, query: q) }.count : 0
                if elsewhere > 0 {
                    Button("Ver \(elsewhere) \(elsewhere == 1 ? "resultado" : "resultados") en Todos") { app.filter = .all }
                        .buttonStyle(GhostButtonStyle())
                } else {
                    Text("Prueba con el nombre de la playa o la zona, por ejemplo «Cantabria» o «Lanzarote».")
                        .font(Theme.body(13)).foregroundStyle(Theme.muted)
                }
            }
        }
        .multilineTextAlignment(.center).padding(.vertical, 48).frame(maxWidth: .infinity)
    }

    private func load(force: Bool) async {
        if app.filter == .near { await app.location.locate() }
        loading = true
        defer { loading = false }
        do {
            result = try await APIClient.shared.overview(force: force)
            error = nil
        } catch {
            if result == nil { self.error = error.localizedDescription }
        }
    }
}

// ---------- Tarjeta ----------

struct SpotCard: View {
    @Environment(AppState.self) private var app
    let spot: SpotSummary
    let dist: Double?

    var body: some View {
        let s = spot, n = s.now, t = s.tide, r = Rating(score: s.score)
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(s.name).font(Theme.heading(22, relativeTo: .title2)).foregroundStyle(Theme.ink)
                    Text(s.region + (dist.map { " · \(Int($0.rounded())) km" } ?? "")).font(Theme.body(13)).foregroundStyle(Theme.muted)
                }
                Spacer()
                FavButton(on: app.favs.contains(s.id)) { app.toggleFav(s.id) }.padding(.top, -10).padding(.trailing, -10)
            }
            HStack(spacing: 10) { RatingChip(rating: r); ScoreBar(score: s.score) }
            Grid(alignment: .leading, horizontalSpacing: 14, verticalSpacing: 10) {
                GridRow {
                    metric("Ola") { num(n.h); unit("m") }
                    metric("Periodo") { num(n.T, 0); unit("s"); DirArrow(deg: n.dir) }
                }
                GridRow {
                    metric("Viento") { num(n.wind, 0); unit("kn"); WindTypePill(type: n.windType) }
                    VStack(alignment: .leading, spacing: 4) {
                        Eyebrow(text: "Marea")
                        Text(t.rising == nil ? "–" : t.rising! ? "↗ Sube" : "↘ Baja").font(Theme.body(15)).foregroundStyle(Theme.ink)
                        if let next = t.next {
                            Text("\(next.word) \(Surf.hhmm(next.t, s.tz))").font(Theme.body(13)).foregroundStyle(Theme.muted)
                        }
                    }
                }
            }
            Divider().overlay(Theme.line)
            BuoyLine(spotId: s.id, tz: s.tz)
        }
        .padding(16)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 18))
        .contentShape(RoundedRectangle(cornerRadius: 18))
        .onTapGesture { app.path.append(.spot(s.id)) }
        .accessibilityElement(children: .contain)
        .accessibilityAction(named: "Ver \(s.name)") { app.path.append(.spot(s.id)) }
    }

    private func metric<V: View>(_ label: String, @ViewBuilder _ value: () -> V) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Eyebrow(text: label)
            HStack(spacing: 4) { value() }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func num(_ v: Double?, _ d: Int = 1) -> some View {
        Text(Surf.fmt(v, d)).font(Theme.mono(18.5)).foregroundStyle(Theme.ink).monospacedDigit()
    }
    private func unit(_ u: String) -> some View { Text(u).font(Theme.body(15)).foregroundStyle(Theme.ink) }
}

struct WindTypePill: View {
    let type: WindType
    var body: some View {
        let color = ["off": Theme.greenText, "calm": Theme.greenText, "on": Theme.accentText][type.key] ?? Theme.ink
        Text(type.label).font(Theme.bodySemibold(12, relativeTo: .caption)).foregroundStyle(color)
            .padding(.horizontal, 7).padding(.vertical, 2).background(Theme.surface2, in: Capsule())
    }
}

// Línea de la boya en cada tarjeta. Se pide cuando la tarjeta aparece y como mucho 3 a la vez.
actor BuoyLimiter {
    static let shared = BuoyLimiter()
    private var active = 0
    private var queue: [CheckedContinuation<Void, Never>] = []

    func run<T: Sendable>(_ work: @Sendable () async throws -> T) async rethrows -> T {
        if active >= 3 { await withCheckedContinuation { queue.append($0) } }
        active += 1
        defer {
            active -= 1
            if !queue.isEmpty { queue.removeFirst().resume() }
        }
        return try await work()
    }
}

struct BuoyLine: View {
    let spotId: String
    let tz: String
    @State private var state: LoadState = .loading

    enum LoadState { case loading, none, failed, loaded(BuoyReading) }

    var body: some View {
        Group {
            switch state {
            case .loading: Text("Boya: cargando…").foregroundStyle(Theme.muted)
            case .none: Text("Sin boya operativa cerca").foregroundStyle(Theme.muted)
            case .failed: Text("Boya no disponible ahora").foregroundStyle(Theme.muted)
            case .loaded(let b): line(b)
            }
        }
        .font(Theme.body(13)).frame(maxWidth: .infinity, alignment: .leading)
        .task(id: spotId) {
            do {
                let res = try await BuoyLimiter.shared.run { try await APIClient.shared.buoy(spotId) }
                state = res.data.buoy.map { .loaded($0) } ?? .none
            } catch {
                state = .failed
            }
        }
    }

    private func line(_ b: BuoyReading) -> some View {
        let off = b.buoy.fallback == true
        var text = Text("Boya \(b.buoy.name)\(off ? " (a \(Int(b.buoy.distKm)) km)" : ""): ").foregroundColor(Theme.ink)
            + Text("\(Surf.fmt(b.h)) m").font(Theme.monoBold(13)).foregroundColor(Theme.ink)
        if let tp = b.Tp { text = text + Text(" · \(Surf.fmt(tp, 0)) s").foregroundColor(Theme.ink) }
        if let d = b.dir { text = text + Text(" \(Surf.cardinal(d))").foregroundColor(Theme.ink) }
        if let p = b.predicted { text = text + Text(" · prev. \(Surf.fmt(p.h)) m").foregroundColor(Theme.muted) }
        text = text + Text(" · \(Surf.hhmm(b.t, tz))").foregroundColor(Theme.muted)
        return HStack(alignment: .firstTextBaseline, spacing: 6) {
            LiveDot(off: off)
            text
        }
        .accessibilityElement(children: .combine)
        .accessibilityHint(off ? "Aviso: no es la boya más cercana." : "")
    }
}

struct GhostButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.font(Theme.bodySemibold()).foregroundStyle(Theme.ink)
            .padding(.vertical, 14).padding(.horizontal, 16).frame(maxWidth: .infinity)
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(Theme.line, lineWidth: 1.5))
            .opacity(configuration.isPressed ? 0.6 : 1)
    }
}

struct PrimaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var enabled
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.font(Theme.bodySemibold()).foregroundStyle(Theme.bg)
            .padding(.vertical, 14).padding(.horizontal, 16).frame(maxWidth: .infinity)
            .background(Theme.ink, in: RoundedRectangle(cornerRadius: 14))
            .opacity(!enabled ? 0.45 : configuration.isPressed ? 0.8 : 1)
    }
}

extension String {
    var capitalizedFirst: String { prefix(1).uppercased() + dropFirst() }
}
