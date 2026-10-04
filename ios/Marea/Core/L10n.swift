import Foundation

// Idioma de la app: el que iOS elige entre los disponibles (español e inglés) según las preferencias
// del usuario, con el español por defecto. Los textos salen de Resources/{es,en}.lproj/Localizable.strings,
// generados por scripts/i18n.mjs a partir de i18n/strings.json (los mismos que usan la web y Android).
enum L10n {
    nonisolated(unsafe) static var lang: String = Bundle.main.preferredLocalizations.first == "en" ? "en" : "es" {
        didSet { bundle = Self.bundle(for: lang) }
    }
    nonisolated(unsafe) private(set) static var bundle: Bundle = bundle(for: lang)

    private static func bundle(for lang: String) -> Bundle {
        Bundle.main.path(forResource: lang, ofType: "lproj").flatMap(Bundle.init(path:)) ?? .main
    }

    static var isEnglish: Bool { lang == "en" }
}

/// Texto traducido. Los valores se insertan en orden (%1$@, %2$@…).
func L(_ key: String, _ args: String...) -> String {
    let s = L10n.bundle.localizedString(forKey: key, value: nil, table: nil)
    return args.isEmpty ? s : String(format: s, arguments: args)
}
