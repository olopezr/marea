import SwiftUI

// "Medido en el mar": boya y estación meteorológica de Puertos del Estado (buoyPanel en public/js/app.js).
struct BuoyPanel: View {
    let spot: SpotDetail

    var body: some View {
        let b = spot.buoy, m = spot.meteo
        Panel {
            if b == nil && m == nil {
                PanelTitle(text: "Medido en el mar")
                Text("No hay boyas ni estaciones de Puertos del Estado operativas cerca de este spot. Se muestra solo la previsión.")
                    .font(Theme.body(13)).foregroundStyle(Theme.muted)
            } else {
                content(b, m)
            }
        }
    }

    @ViewBuilder
    private func content(_ b: BuoyReading?, _ m: Meteo?) -> some View {
        let latest = [b?.t, m?.wind?.t, m?.air?.t, m?.pressure?.t].compactMap { $0 }.max() ?? 0
        HStack {
            PanelTitle(text: "Medido en el mar")
            Spacer()
            HStack(spacing: 6) {
                LiveDot(off: b?.buoy.fallback == true)
                Text(Surf.hhmm(latest, spot.tz)).font(Theme.mono(12)).foregroundStyle(Theme.muted)
            }
        }
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 100), spacing: 10, alignment: .topLeading)], alignment: .leading, spacing: 10) {
            if let b {
                cell("Ola") { Text("\(Surf.fmt(b.h)) m") }
                cell("Periodo pico") { Text("\(Surf.fmt(b.Tp, 0)) s") }
                cell("Dirección") {
                    if let d = b.dir { DirArrow(deg: d); Text(Surf.cardinal(d)) }
                    else { Text("-").accessibilityLabel("Esta boya no mide dirección") }
                }
                if let w = b.water { cell("Agua") { Text("\(Surf.fmt(w)) °C") } }
            }
            if let w = m?.wind {
                cell("Viento", sub: w.gust.map { "Rachas \(Surf.fmt($0, 0)) kn" }) {
                    Text("\(Surf.fmt(w.wind, 0)) kn"); DirArrow(deg: w.windDir)
                }
            }
            if let a = m?.air { cell("Aire") { Text("\(Surf.fmt(a.air)) °C") } }
            if let p = m?.pressure { cell("Presión") { Text("\(Surf.fmt(p.pressure, 0)) hPa") } }
        }
        if let b, b.buoy.far == true {
            note("No hay ninguna boya a menos de 100 km. Esta es la de aguas profundas más cercana, a \(Int(b.buoy.distKm)) km: indica el mar de fondo que llega a la zona, no el oleaje en la playa.")
        } else if let b, b.buoy.fallback == true {
            let closest = b.buoy.closest.map { "La boya más cercana a esta playa, \($0.name) (a \(Int($0.distKm)) km), no envía datos ahora." }
                ?? "La boya más cercana a esta playa no envía datos ahora."
            note("\(closest) Se muestra la siguiente, \(b.buoy.name) (a \(Int(b.buoy.distKm)) km): puede no reflejar bien las condiciones de esta playa.")
        }
        Text(sources(b, m)).font(Theme.body(13)).foregroundStyle(Theme.muted)
        if let b {
            Divider().overlay(Theme.line)
            if let p = b.predicted {
                let diff = b.h - p.h
                Text(abs(diff) < 0.2
                     ? "La boya mide lo mismo que preveía el modelo (\(Surf.fmt(p.h)) m)."
                     : "La boya mide \(Surf.fmt(abs(diff))) m \(diff > 0 ? "más" : "menos") de lo que preveía el modelo (\(Surf.fmt(p.h)) m).")
                    .font(Theme.bodySemibold(13)).foregroundStyle(Theme.ink)
            } else {
                Text("Puertos del Estado no publica predicción para esta boya.").font(Theme.body(13)).foregroundStyle(Theme.muted)
            }
        }
    }

    private func sources(_ b: BuoyReading?, _ m: Meteo?) -> String {
        var parts: [String] = []
        if let b { parts.append("boya \(b.buoy.name) (\(Int(b.buoy.distKm)) km)") }
        if let w = m?.wind { parts.append("viento en \(w.station.name) (\(Int(w.station.distKm)) km)") }
        else if let st = m?.air?.station ?? m?.pressure?.station { parts.append("estación \(st.name) (\(Int(st.distKm)) km)") }
        var out = "Datos de Puertos del Estado: \(parts.joined(separator: ", "))."
        if let b, b.buoy.deep == true, b.buoy.far != true { out += " La boya está en aguas profundas: en la orilla las olas suelen llegar más pequeñas." }
        return out
    }

    private func cell<V: View>(_ label: String, sub: String? = nil, @ViewBuilder _ value: () -> V) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Eyebrow(text: label)
            HStack(spacing: 4) { value() }.font(Theme.mono(17.5)).foregroundStyle(Theme.ink)
            if let sub { Text(sub).font(Theme.body(13)).foregroundStyle(Theme.muted) }
        }
        .accessibilityElement(children: .combine)
    }

    private func note(_ text: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            LiveDot(off: true)
            Text(text)
        }
        .font(Theme.body(13)).foregroundStyle(Theme.ink)
        .padding(.horizontal, 10).padding(.vertical, 8).frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.mix(Theme.q(.fair), 0.16, Theme.surface), in: RoundedRectangle(cornerRadius: 10))
    }
}
