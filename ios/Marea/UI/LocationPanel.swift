import MapKit
import SwiftUI

// Dónde está la playa: mapa (satélite con nombres) y coordenadas. Al tocar se abre Mapas con la ruta
// hasta la playa: se busca su punto de interés en Apple Maps (la playa ya creada en el mapa) y, si no
// aparece cerca, se usa la coordenada del spot.
struct LocationPanel: View {
    let name: String
    let lat: Double
    let lon: Double

    private var coordinate: CLLocationCoordinate2D { CLLocationCoordinate2D(latitude: lat, longitude: lon) }

    var body: some View {
        Panel {
            PanelTitle(text: L("loc.title"))
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
            .accessibilityLabel(L("loc.map", name))
            .accessibilityHint(L("loc.hint"))
            .accessibilityAddTraits(.isButton)
            HStack(alignment: .firstTextBaseline) {
                Text(Surf.coords(lat, lon)).font(Theme.mono(13)).foregroundStyle(Theme.ink).textSelection(.enabled)
                    .accessibilityLabel(L("loc.coords", Surf.coords(lat, lon)))
                Spacer()
                Button(L("loc.directions"), action: openInMaps).font(Theme.bodySemibold(14)).foregroundStyle(Theme.accentText)
                    .frame(minHeight: 44)
            }
        }
    }

    private func openInMaps() {
        Task { @MainActor in
            let item = await beachPointOfInterest() ?? coordinateItem()
            item.openInMaps(launchOptions: [MKLaunchOptionsDirectionsModeKey: MKLaunchOptionsDirectionsModeDefault])
        }
    }

    /// La playa como punto de interés de Apple Maps, si hay una con ese nombre a menos de 1,5 km.
    private func beachPointOfInterest() async -> MKMapItem? {
        let request = MKLocalSearch.Request()
        let base = name.replacingOccurrences(of: #"\s*\(.*\)"#, with: "", options: .regularExpression)
        request.naturalLanguageQuery = base.lowercased().hasPrefix("playa") ? base : "Playa \(base)"
        request.region = MKCoordinateRegion(center: coordinate, latitudinalMeters: 4000, longitudinalMeters: 4000)
        request.resultTypes = .pointOfInterest
        request.pointOfInterestFilter = MKPointOfInterestFilter(including: [.beach])
        guard let items = try? await MKLocalSearch(request: request).start().mapItems else { return nil }
        let here = CLLocation(latitude: lat, longitude: lon)
        return items
            .map { item -> (MKMapItem, CLLocationDistance) in
                let c = item.placemark.coordinate
                return (item, CLLocation(latitude: c.latitude, longitude: c.longitude).distance(from: here))
            }
            .filter { $0.1 < 1500 }
            .min { $0.1 < $1.1 }?.0
    }

    private func coordinateItem() -> MKMapItem {
        let item: MKMapItem
        if #available(iOS 26, *) {
            item = MKMapItem(location: CLLocation(latitude: lat, longitude: lon), address: nil)
        } else {
            item = MKMapItem(placemark: MKPlacemark(coordinate: coordinate))
        }
        item.name = name
        return item
    }
}
