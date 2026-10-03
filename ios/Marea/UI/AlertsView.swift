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
                        Banner(text: "Las notificaciones están bloqueadas para Marea. Actívalas en Ajustes para recibir avisos.")
                    }
                    .buttonStyle(.plain)
                }
                Panel {
                    PanelTitle(text: "Avisar a partir de")
                    Picker("Calidad mínima", selection: Binding(get: { st.minScore }, set: { v in
                        run(st.spots.isEmpty ? nil : "Umbral guardado") { try await app.alerts.setMinScore(v) }
                    })) {
                        Text("Aceptable").tag(2.0)
                        Text("Bueno").tag(3.0)
                        Text("Muy bueno").tag(4.0)
                    }
                    .pickerStyle(.segmented)
                    Text("Revisamos la previsión cada hora entre las 7:00 y las 22:00 y te mandamos como mucho un aviso por spot y día, con la mejor hora de hoy o de mañana.")
                        .font(Theme.body(13)).foregroundStyle(Theme.muted)
                }
                Panel {
                    PanelTitle(text: "Spots")
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
                                run(on ? "Avisos activados para \(sp.name)" : "Avisos desactivados para ese spot") { try await app.alerts.toggle(sp.id) }
                            })) {
                                Text(sp.name).font(Theme.body()).foregroundStyle(Theme.ink)
                            }
                            .tint(Theme.green).padding(.vertical, 8)
                        }
                    }
                }
                .disabled(busy)
                VStack(spacing: 10) {
                    Button("Enviar un aviso de prueba") { run("Aviso de prueba enviado") { try await app.alerts.sendTest() } }
                        .buttonStyle(PrimaryButtonStyle())
                    Button("Desactivar todos los avisos") { run("Avisos desactivados") { try await app.alerts.disableAll() } }
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
                    Text("Avisos").font(Theme.heading(18, relativeTo: .headline)).foregroundStyle(Theme.ink)
                    Text("Te avisamos cuando tus spots se ponen buenos").font(Theme.body(12, relativeTo: .caption)).foregroundStyle(Theme.muted)
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
