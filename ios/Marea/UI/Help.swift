import SwiftUI

// Qué significa cada dato: botón "?" junto al dato y glosario al final del detalle (como en la web).
enum HelpTopic {
    static let all = ["rating", "height", "period", "swell", "wind", "tide", "energy", "buoy"]
    static func title(_ t: String) -> String { L("help.\(t).title") }
    static func text(_ t: String) -> String { L("help.\(t).text") }
}

struct HelpButton: View {
    let topic: String
    var color: Color = Theme.muted
    @State private var shown = false
    var body: some View {
        Button { shown = true } label: {
            Image(systemName: "questionmark.circle").font(.system(size: 14, weight: .medium)).foregroundStyle(color.opacity(0.8))
                .frame(width: 44, height: 44).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(L("help.button", HelpTopic.title(topic)))
        .alert(HelpTopic.title(topic), isPresented: $shown) {
            Button(L("close"), role: .cancel) {}
        } message: {
            Text(HelpTopic.text(topic))
        }
    }
}

struct Glossary: View {
    var body: some View {
        Panel {
            PanelTitle(text: L("help.glossary"))
            VStack(spacing: 0) {
                ForEach(HelpTopic.all, id: \.self) { t in
                    Divider().overlay(Theme.line)
                    DisclosureGroup {
                        Text(HelpTopic.text(t)).font(Theme.body(14)).foregroundStyle(Theme.ink)
                            .frame(maxWidth: .infinity, alignment: .leading).padding(.bottom, 8)
                    } label: {
                        Text(HelpTopic.title(t)).font(Theme.bodySemibold(15)).foregroundStyle(Theme.ink)
                            .frame(minHeight: 44, alignment: .leading)
                    }
                    .tint(Theme.muted)
                }
            }
        }
    }
}
