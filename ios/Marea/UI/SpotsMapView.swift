import MapKit
import SwiftUI

// Mapa de todos los spots, coloreados según la valoración de ahora (renderMap en public/js/app.js).
// Al tocar un spot se muestra su resumen y desde ahí se abre la previsión.
struct SpotsMapView: View {
    @Environment(AppState.self) private var app
    @State private var result: Cached<Overview>?
    @State private var error: String?
    @State private var selected: String?

    // La Península y Baleares; Canarias queda a un desplazamiento.
    private static let start = MapCameraPosition.region(MKCoordinateRegion(
        center: CLLocationCoordinate2D(latitude: 39.8, longitude: -3.0), span: MKCoordinateSpan(latitudeDelta: 9, longitudeDelta: 14)))

    var body: some View {
        let spots = result?.data.spots ?? []
        ZStack(alignment: .bottom) {
            Map(initialPosition: Self.start) {
                ForEach(spots.sorted { $0.score < $1.score }) { s in
                    Annotation(s.name, coordinate: CLLocationCoordinate2D(latitude: s.lat, longitude: s.lon), anchor: .center) {
                        Button { selected = s.id } label: {
                            Circle().fill(Theme.q(Rating(score: s.score)))
                                .frame(width: selected == s.id ? 22 : 16, height: selected == s.id ? 22 : 16)
                                .overlay(Circle().stroke(.white, lineWidth: 2))
                                .shadow(color: .black.opacity(0.25), radius: 2)
                                .frame(width: 30, height: 30).contentShape(Circle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(L("map.marker", s.name, Rating(score: s.score).label, Surf.fmt(s.now.h)))
                    }
                    .annotationTitles(.hidden)
                }
            }
            .mapStyle(.standard(pointsOfInterest: .excludingAll))
            .ignoresSafeArea(edges: .bottom)

            VStack(spacing: 10) {
                if let id = selected, let s = spots.first(where: { $0.id == id }) {
                    selectedCard(s)
                } else if let error {
                    Banner(text: error)
                }
                legend
            }
            .padding(.horizontal, 16).padding(.bottom, 12)
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                VStack(spacing: 1) {
                    Text(L("map.title")).font(Theme.heading(18, relativeTo: .headline)).foregroundStyle(Theme.ink)
                    Text(L("map.hint")).font(Theme.body(12, relativeTo: .caption)).foregroundStyle(Theme.muted).lineLimit(1).minimumScaleFactor(0.8)
                }
                .accessibilityElement(children: .combine).accessibilityAddTraits(.isHeader)
            }
        }
        .toolbarBackground(Theme.bg, for: .navigationBar)
        .toolbarBackground(.visible, for: .navigationBar)
        .task {
            do { result = try await APIClient.shared.overview(force: false) }
            catch { self.error = error.localizedDescription }
        }
    }

    private func selectedCard(_ s: SpotSummary) -> some View {
        let r = Rating(score: s.score)
        return Button { app.path.append(.spot(s.id)) } label: {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(s.name).font(Theme.heading(19)).foregroundStyle(Theme.ink)
                    HStack(spacing: 10) {
                        RatingChip(rating: r)
                        Text("\(Surf.fmt(s.now.h)) m · \(Surf.fmt(s.now.T, 0)) s").font(Theme.mono(14)).foregroundStyle(Theme.ink)
                    }
                }
                Spacer()
                Image(systemName: "chevron.right").foregroundStyle(Theme.muted)
            }
            .padding(14).background(Theme.surface, in: RoundedRectangle(cornerRadius: 16))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(L("card.open", s.name))
    }

    private var legend: some View {
        HStack(spacing: 0) {
            ForEach(Array(Rating.allCases.enumerated()), id: \.element) { i, r in
                if i > 0 { Spacer(minLength: 6) }
                HStack(spacing: 5) { Circle().fill(Theme.q(r)).frame(width: 10, height: 10); Text(r.label) }
            }
        }
        .font(Theme.body(12, relativeTo: .caption)).foregroundStyle(Theme.ink)
        .lineLimit(1).minimumScaleFactor(0.8)
        .padding(.horizontal, 12).padding(.vertical, 8)
        .background(.regularMaterial, in: Capsule())
    }
}
