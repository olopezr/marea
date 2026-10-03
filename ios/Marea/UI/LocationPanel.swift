import MapKit
import SwiftUI

// Dónde está la playa: mapa (satélite con nombres) y coordenadas. Al tocar se abre en Mapas.
struct LocationPanel: View {
    let name: String
    let lat: Double
    let lon: Double

    private var coordinate: CLLocationCoordinate2D { CLLocationCoordinate2D(latitude: lat, longitude: lon) }

    var body: some View {
        Panel {
            PanelTitle(text: "Ubicación")
            Map(initialPosition: .region(MKCoordinateRegion(center: coordinate, latitudinalMeters: 5000, longitudinalMeters: 5000)),
                interactionModes: []) {
                Marker(name, coordinate: coordinate).tint(Theme.accent)
            }
            .mapStyle(.hybrid(elevation: .flat))
            .frame(height: 200)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .contentShape(Rectangle())
            .onTapGesture(perform: openInMaps)
            .accessibilityElement()
            .accessibilityLabel("Mapa de \(name)")
            .accessibilityHint("Abre la ubicación en Mapas")
            .accessibilityAddTraits(.isButton)
            HStack(alignment: .firstTextBaseline) {
                Text(Surf.coords(lat, lon)).font(Theme.mono(13)).foregroundStyle(Theme.ink).textSelection(.enabled)
                    .accessibilityLabel("Coordenadas \(Surf.coords(lat, lon))")
                Spacer()
                Button("Abrir en Mapas", action: openInMaps).font(Theme.bodySemibold(14)).foregroundStyle(Theme.accentText)
                    .frame(minHeight: 44)
            }
        }
    }

    private func openInMaps() {
        let item: MKMapItem
        if #available(iOS 26, *) {
            item = MKMapItem(location: CLLocation(latitude: lat, longitude: lon), address: nil)
        } else {
            item = MKMapItem(placemark: MKPlacemark(coordinate: coordinate))
        }
        item.name = name
        item.openInMaps(launchOptions: [MKLaunchOptionsMapTypeKey: MKMapType.hybrid.rawValue])
    }
}
