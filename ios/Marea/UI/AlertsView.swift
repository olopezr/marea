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
