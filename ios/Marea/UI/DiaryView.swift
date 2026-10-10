import SwiftUI

// Diario de sesiones (renderDiary y diaryPanel en public/js/app.js). Los datos viven solo en el dispositivo.

/// Textos del diario compartidos por la lista y el panel del spot.
enum DiaryText {
    /// "2026-10-10" como fecha local, escrita en el idioma de la app.
    static func day(_ iso: String, long: Bool = false) -> String {
        let p = iso.split(separator: "-").compactMap { Int($0) }
        guard p.count == 3, let date = Calendar.current.date(from: DateComponents(year: p[0], month: p[1], day: p[2])) else { return iso }
        let f = DateFormatter()
        f.locale = Locale(identifier: L10n.lang)
        f.setLocalizedDateFormatFromTemplate(long ? "d MMMM yyyy" : "EEEE d MMMM")
        return f.string(from: date).capitalizedFirst
    }

    static func rating(_ n: Int) -> String { L("diary.ratingN", "\(n)") }

    static func snap(_ s: DiarySnap?) -> String {
        guard let s else { return L("diary.noSnap") }
        let line = L("diary.snap", Surf.fmt(s.h), Surf.fmt(s.Tp, 0), Surf.fmt(s.wind, 0), Surf.cardinal(s.windDir), Surf.fmt(s.water))
        guard let t = s.tide else { return line }
        return "\(line) · \(L("diary.snapTide", Surf.fmt(t.h), t.rising ? "↗" : "↘"))"
    }
}

struct DiaryView: View {
    @Environment(AppState.self) private var app

    var body: some View {
        let list = app.diary.newestFirst
        let days = list.reduce(into: [String]()) { if !$0.contains($1.date) { $0.append($1.date) } }
        ScrollView {
            VStack(spacing: 12) {
                if list.isEmpty {
                    Panel { Text(L("diary.empty")).font(Theme.body()).foregroundStyle(Theme.ink) }
                } else {
                    ForEach(days, id: \.self) { d in
                        Panel {
                            PanelTitle(text: DiaryText.day(d))
                                .accessibilityAddTraits(.isHeader)
                            VStack(spacing: 0) {
                                let items = list.filter { $0.date == d }
                                ForEach(Array(items.enumerated()), id: \.element.id) { i, e in
                                    if i > 0 { Divider().overlay(Theme.line) }
                                    row(e).padding(.vertical, 10)
                                }
                            }
                        }
                    }
                }
                Footer(showsDiary: false)
            }
            .padding(.horizontal, 16).padding(.top, 12).padding(.bottom, 24)
        }
        .background(Theme.bg.ignoresSafeArea())
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                VStack(spacing: 1) {
                    Text(L("diary.title")).font(Theme.heading(18, relativeTo: .headline)).foregroundStyle(Theme.ink)
                    Text(L("diary.subtitle")).font(Theme.body(12, relativeTo: .caption)).foregroundStyle(Theme.muted)
                }
                .accessibilityElement(children: .combine).accessibilityAddTraits(.isHeader)
            }
        }
        .toolbarBackground(Theme.bg, for: .navigationBar)
    }

    private func row(_ e: DiaryEntry) -> some View {
        let name = Spot.byId[e.spotId]?.name ?? e.spotId
        return VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Button { app.path.append(.spot(e.spotId)) } label: {
                    Text(name).font(Theme.bodySemibold()).foregroundStyle(Theme.ink).underline()
                        .frame(minHeight: 44, alignment: .leading).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                Spacer(minLength: 8)
                Stars(rating: e.rating)
            }
            if !e.notes.isEmpty {
                Text(e.notes).font(Theme.body(15)).foregroundStyle(Theme.ink)
            }
            Text(DiaryText.snap(e.snap)).font(Theme.body(13, relativeTo: .footnote)).foregroundStyle(Theme.muted)
            Button(L("delete"), role: .destructive) {
                app.diary.remove(e.id)
                app.show(L("diary.deleted"))
            }
            .font(Theme.bodySemibold(14, relativeTo: .subheadline)).foregroundStyle(Theme.red)
            .frame(minHeight: 44, alignment: .leading)
            .accessibilityLabel(L("diary.delete", "\(name), \(DiaryText.day(e.date, long: true))"))
        }
    }
}

/// Valoración de 1 a 5 como estrellas, leída como "4 de 5".
private struct Stars: View {
    let rating: Int
    var body: some View {
        HStack(spacing: 2) {
            ForEach(1...5, id: \.self) { n in
                Image(systemName: n <= rating ? "star.fill" : "star").font(.system(size: 13))
                    .foregroundStyle(n <= rating ? Theme.accentText : Theme.muted)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(L("diary.rating")): \(DiaryText.rating(rating))")
    }
}

// Panel del detalle de un spot: lo que te funciona aquí y el formulario para registrar una sesión.
struct DiaryPanel: View {
    @Environment(AppState.self) private var app
    let spotId: String
    let detail: SpotDetail

    @State private var open = false
    @State private var date = Date.now
    @State private var rating = 3
    @State private var notes = ""

    private var isToday: Bool { DiaryStore.todayISO(now: date) == DiaryStore.todayISO() }

    var body: some View {
        Panel {
            HStack(alignment: .firstTextBaseline) {
                PanelTitle(text: L("diary.title"))
                Spacer()
                Button { app.path.append(.diary) } label: {
                    Text(L("diary.link")).font(Theme.body(13, relativeTo: .footnote)).underline()
                        .foregroundStyle(Theme.muted).frame(minHeight: 44).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            if let ins = app.diary.insights(spotId: spotId) { insights(ins) }
            Button(L("diary.log")) { withAnimation { open.toggle() } }
                .buttonStyle(GhostButtonStyle())
                .accessibilityAddTraits(open ? .isSelected : [])
            if open { form }
        }
    }

    private func insights(_ ins: DiaryInsights) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(L("diary.insights.title")).font(Theme.heading(15, relativeTo: .headline)).foregroundStyle(Theme.ink)
            Text(L("diary.insights.sub", "\(ins.count)")).font(Theme.body(13, relativeTo: .footnote)).foregroundStyle(Theme.muted)
            Grid(alignment: .leading, horizontalSpacing: 16, verticalSpacing: 6) {
                stat(L("diary.insights.h"), ins.h, "m", 1)
                stat(L("diary.insights.Tp"), ins.Tp, "s", 0)
                stat(L("diary.insights.wind"), ins.wind, "kn", 0)
                if let d = ins.windDir {
                    GridRow {
                        Eyebrow(text: L("diary.insights.windDir"))
                        Text(d).font(Theme.bodySemibold()).foregroundStyle(Theme.ink)
                        Color.clear.frame(width: 0, height: 0)
                    }
                }
            }
        }
        .accessibilityElement(children: .contain)
    }

    @ViewBuilder
    private func stat(_ label: String, _ st: DiaryStat?, _ unit: String, _ digits: Int) -> some View {
        if let st {
            GridRow {
                Eyebrow(text: label)
                Text("\(Surf.fmt(st.avg, digits)) \(unit)").font(Theme.bodySemibold()).foregroundStyle(Theme.ink)
                Text("\(Surf.fmt(st.min, digits))–\(Surf.fmt(st.max, digits)) \(unit)")
                    .font(Theme.body(13, relativeTo: .footnote)).foregroundStyle(Theme.muted)
            }
        }
    }

    private var form: some View {
        VStack(alignment: .leading, spacing: 12) {
            DatePicker(L("diary.date"), selection: $date, in: ...Date.now, displayedComponents: .date)
                .font(Theme.body(15)).tint(Theme.accent)
            VStack(alignment: .leading, spacing: 6) {
                Eyebrow(text: L("diary.rating")).accessibilityHidden(true)
                HStack(spacing: 8) {
                    ForEach(1...5, id: \.self) { n in
                        Button { rating = n } label: {
                            Text("\(n)").font(Theme.bodySemibold())
                                .foregroundStyle(rating == n ? Theme.bg : Theme.ink)
                                .frame(maxWidth: .infinity, minHeight: 44)
                                .background(rating == n ? Theme.ink : Theme.surface2, in: RoundedRectangle(cornerRadius: 10))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(DiaryText.rating(n))
                        .accessibilityAddTraits(rating == n ? .isSelected : [])
                    }
                }
                .accessibilityElement(children: .contain)
                .accessibilityLabel(L("diary.rating"))
            }
            VStack(alignment: .leading, spacing: 6) {
                Eyebrow(text: L("diary.notes"))
                TextField(L("diary.notes"), text: $notes, axis: .vertical)
                    .lineLimit(3...6).font(Theme.body(15)).foregroundStyle(Theme.ink)
                    .padding(10).background(Theme.surface2, in: RoundedRectangle(cornerRadius: 10))
                    .onChange(of: notes) { _, v in if v.count > DiaryStore.maxNotes { notes = String(v.prefix(DiaryStore.maxNotes)) } }
            }
            Text(L(isToday ? "diary.snapNote" : "diary.noSnapNote"))
                .font(Theme.body(13, relativeTo: .footnote)).foregroundStyle(Theme.muted)
                .accessibilityAddTraits(.updatesFrequently)
            HStack(spacing: 10) {
                Button(L("diary.save"), action: save).buttonStyle(PrimaryButtonStyle())
                Button(L("diary.cancel")) { withAnimation { open = false } }.buttonStyle(GhostButtonStyle())
            }
        }
    }

    private func save() {
        let iso = DiaryStore.todayISO(now: date)
        guard iso <= DiaryStore.todayISO() else { return app.show(L("diary.futureDate")) }
        app.diary.add(spotId: spotId, date: iso, rating: rating, notes: notes, snap: DiaryStore.snapshot(detail, date: iso))
        app.show(L("diary.saved"))
        notes = ""
        rating = 3
        date = .now
        withAnimation { open = false }
    }
}
