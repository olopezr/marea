import SwiftUI
import UIKit

// Pantalla de avisos (renderAlerts en public/js/app.js).
struct AlertsView: View {
    @Environment(AppState.self) private var app
    @State private var busy = false

    var body: some View {
        let st = app.alerts.state
        ScrollView {
            VStack(spacing: 12) {
                if app.alerts.permissionDenied {
                    Button { UIApplication.shared.open(URL(string: UIApplication.openSettingsURLString)!) } label: {
                        Banner(text: L("alerts.blockedApp"))
                    }
                    .buttonStyle(.plain)
                }
                Panel {
                    PanelTitle(text: L("alerts.from"))
                    Picker(L("alerts.minQuality"), selection: Binding(get: { st.minScore }, set: { v in
                        run(st.spots.isEmpty ? nil : L("toast.threshold")) { try await app.alerts.setMinScore(v) }
                    })) {
                        Text(Rating.fair.label).tag(2.0)
                        Text(Rating.good.label).tag(3.0)
                        Text(Rating.epic.label).tag(4.0)
                    }
                    .pickerStyle(.segmented)
                    Text(L("alerts.help"))
                        .font(Theme.body(13)).foregroundStyle(Theme.muted)
                }
                Panel {
                    PanelTitle(text: L("alerts.spots"))
                    VStack(spacing: 0) {
                        // Agrupados por zona, con un título al empezar cada una.
                        ForEach(Array(Spot.all.enumerated()), id: \.element.id) { i, sp in
                            if i == 0 || Spot.all[i - 1].region != sp.region {
                                Eyebrow(text: sp.region).frame(maxWidth: .infinity, alignment: .leading)
                                    .padding(.top, i == 0 ? 4 : 18).padding(.bottom, 2).accessibilityAddTraits(.isHeader)
                            } else {
                                Divider().overlay(Theme.line)
                            }
                            Toggle(isOn: Binding(get: { st.spots.contains(sp.id) }, set: { on in
                                run(on ? L("toast.spotOn", sp.name) : L("toast.spotOff")) { try await app.alerts.toggle(sp.id) }
                            })) {
                                Text(sp.name).font(Theme.body()).foregroundStyle(Theme.ink)
                            }
                            .tint(Theme.green).padding(.vertical, 8)
                            if st.spots.contains(sp.id) {
                                SpotPrefs(pref: st.prefs[sp.id] ?? AlertPref()) { new in
                                    if let f = new.from, let t = new.to, f >= t {
                                        app.show(L("alerts.hoursOrder"))
                                        return
                                    }
                                    run(L("toast.prefSaved")) { try await app.alerts.setPref(sp.id, new) }
                                }
                            }
                        }
                    }
                }
                .disabled(busy)
                VStack(spacing: 10) {
                    Button(L("alerts.test")) { run(L("toast.testSent")) { try await app.alerts.sendTest() } }
                        .buttonStyle(PrimaryButtonStyle())
                    Button(L("alerts.off")) { run(L("toast.allOff")) { try await app.alerts.disableAll() } }
                        .buttonStyle(GhostButtonStyle()).opacity(st.spots.isEmpty ? 0.45 : 1)
                }
                .disabled(st.spots.isEmpty || busy)
                Footer()
            }
            .padding(.horizontal, 16).padding(.top, 12).padding(.bottom, 24)
        }
        .background(Theme.bg.ignoresSafeArea())
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                VStack(spacing: 1) {
                    Text(L("alerts")).font(Theme.heading(18, relativeTo: .headline)).foregroundStyle(Theme.ink)
                    Text(L("alerts.subtitle")).font(Theme.body(12, relativeTo: .caption)).foregroundStyle(Theme.muted)
                }
                .accessibilityElement(children: .combine).accessibilityAddTraits(.isHeader)
            }
        }
        .toolbarBackground(Theme.bg, for: .navigationBar)
        .task { await app.alerts.load() }
    }

    private func run(_ ok: String?, _ work: @escaping @MainActor () async throws -> Void) {
        busy = true
        Task {
            do {
                try await work()
                if let ok { app.show(ok) }
            } catch {
                app.show(error.localizedDescription)
            }
            busy = false
        }
    }
}

// Ajustes de un spot con avisos activados (el bloque `prefsBlock` de la web): calidad mínima propia,
// solo con terral y franja horaria.
private struct SpotPrefs: View {
    let pref: AlertPref
    let onChange: (AlertPref) -> Void
    @State private var open = false

    var body: some View {
        DisclosureGroup(isExpanded: $open) {
            VStack(alignment: .leading, spacing: 10) {
                Picker(L("alerts.minQuality"), selection: Binding(get: { pref.min ?? 0 }, set: { v in
                    var p = pref
                    p.min = v == 0 ? nil : v
                    onChange(p)
                })) {
                    Text(L("alerts.useDefault")).tag(0)
                    Text(Rating.fair.label).tag(2)
                    Text(Rating.good.label).tag(3)
                    Text(Rating.epic.label).tag(4)
                }
                .pickerStyle(.menu).tint(Theme.accent)
                Toggle(L("alerts.spotOffshore"), isOn: Binding(get: { pref.offshore == true }, set: { on in
                    var p = pref
                    p.offshore = on ? true : nil
                    onChange(p)
                }))
                .tint(Theme.green)
                HStack {
                    Text(L("alerts.spotFrom"))
                    hours(selection: pref.from ?? AlertPref.defaultFrom, range: 7...21) { h in
                        var p = pref
                        p.from = h
                        p.to = pref.to ?? AlertPref.defaultTo
                        onChange(p)
                    }
                    Text(L("alerts.spotTo"))
                    hours(selection: pref.to ?? AlertPref.defaultTo, range: 8...22) { h in
                        var p = pref
                        p.from = pref.from ?? AlertPref.defaultFrom
                        p.to = h
                        onChange(p)
                    }
                }
            }
            .font(Theme.body(14)).foregroundStyle(Theme.ink)
            .padding(.top, 6)
        } label: {
            HStack(spacing: 6) {
                Text(L("alerts.spotSettings"))
                if !pref.isDefault {
                    Circle().fill(Theme.accent).frame(width: 8, height: 8)
                        .accessibilityLabel(L("alerts.spotCustom"))
                }
            }
            .font(Theme.body(14)).foregroundStyle(Theme.muted)
        }
        .tint(Theme.muted).padding(.bottom, 8)
    }

    private func hours(selection: Int, range: ClosedRange<Int>, set: @escaping (Int) -> Void) -> some View {
        Picker("", selection: Binding(get: { selection }, set: set)) {
            ForEach(Array(range), id: \.self) { Text(String(format: "%02d:00", $0)).tag($0) }
        }
        .pickerStyle(.menu).tint(Theme.accent).labelsHidden()
    }
}
