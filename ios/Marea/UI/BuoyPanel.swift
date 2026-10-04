import SwiftUI

// "Medido en el mar": boya y estación meteorológica de Puertos del Estado (buoyPanel en public/js/app.js).
struct BuoyPanel: View {
    let spot: SpotDetail

    var body: some View {
        let b = spot.buoy, m = spot.meteo
        Panel {
            if b == nil && m == nil {
                PanelTitle(text: L("buoy.title"))
                Text(L("buoy.none"))
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
            PanelTitle(text: L("buoy.title"))
            HelpButton(topic: "buoy").padding(.vertical, -12)
            Spacer()
            HStack(spacing: 6) {
                LiveDot(off: b?.buoy.fallback == true)
                Text(Surf.hhmm(latest, spot.tz)).font(Theme.mono(12)).foregroundStyle(Theme.muted)
            }
        }
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 100), spacing: 10, alignment: .topLeading)], alignment: .leading, spacing: 10) {
            if let b {
                cell(L("buoy.wave")) { Text("\(Surf.fmt(b.h)) m") }
                cell(L("buoy.peak")) { Text("\(Surf.fmt(b.Tp, 0)) s") }
                cell(L("buoy.dir")) {
                    if let d = b.dir { DirArrow(deg: d); Text(Surf.cardinal(d)) }
                    else { Text("-").accessibilityLabel(L("buoy.noDir")) }
                }
                if let tr = b.trend {
                    cell(L("buoy.trend"), sub: L("trend.detail", Surf.signed(tr.delta), "\(Int(tr.hours))")) {
                        Text("\(Surf.trendArrow(tr.key)) \(L("trend.\(tr.key)"))").foregroundStyle(Theme.trend(tr.key))
                            .lineLimit(1).minimumScaleFactor(0.8)
                    }
                }
                if let w = b.water { cell(L("buoy.water")) { Text("\(Surf.fmt(w)) °C") } }
            }
            if let w = m?.wind {
                cell(L("buoy.wind"), sub: w.gust.map { L("gusts", Surf.fmt($0, 0)) }) {
                    Text("\(Surf.fmt(w.wind, 0)) kn"); DirArrow(deg: w.windDir)
                }
            }
            if let a = m?.air { cell(L("buoy.air")) { Text("\(Surf.fmt(a.air)) °C") } }
            if let p = m?.pressure { cell(L("buoy.pressure")) { Text("\(Surf.fmt(p.pressure, 0)) hPa") } }
        }
        if let b, b.buoy.far == true {
            note(L("buoy.far", "\(Int(b.buoy.distKm))"))
        } else if let b, b.buoy.fallback == true {
            let closest = b.buoy.closest.map { L("buoy.closestDown", $0.name, "\(Int($0.distKm))") } ?? L("buoy.closestDownAnon")
            note(closest + L("buoy.next", b.buoy.name, "\(Int(b.buoy.distKm))"))
        }
        Text(sources(b, m)).font(Theme.body(13)).foregroundStyle(Theme.muted)
        if let b {
            Divider().overlay(Theme.line)
            if let p = b.predicted {
                let diff = b.h - p.h
                Text(abs(diff) < 0.2
                     ? L("buoy.same", Surf.fmt(p.h))
                     : L(diff > 0 ? "buoy.more" : "buoy.less", Surf.fmt(abs(diff)), Surf.fmt(p.h)))
                    .font(Theme.bodySemibold(13)).foregroundStyle(Theme.ink)
            } else {
                Text(L("buoy.noPred")).font(Theme.body(13)).foregroundStyle(Theme.muted)
            }
        }
    }

    private func sources(_ b: BuoyReading?, _ m: Meteo?) -> String {
        var parts: [String] = []
        if let b { parts.append(L("buoy.src.buoy", b.buoy.name, "\(Int(b.buoy.distKm))")) }
        if let w = m?.wind { parts.append(L("buoy.src.wind", w.station.name, "\(Int(w.station.distKm))")) }
        else if let st = m?.air?.station ?? m?.pressure?.station { parts.append(L("buoy.src.station", st.name, "\(Int(st.distKm))")) }
        var out = L("buoy.sources", parts.joined(separator: ", "))
        if let b, b.buoy.deep == true, b.buoy.far != true { out += L("buoy.deep") }
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
