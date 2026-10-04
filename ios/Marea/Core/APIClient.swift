import Foundation

// Cliente de la API de Marea (equivale a public/js/api.js). Guarda la última respuesta
// en disco para poder abrir sin conexión.

struct Cached<T: Sendable>: Sendable {
    let ts: Double
    let data: T
    var stale = false
    var offline = false
}

struct APIError: LocalizedError, Sendable {
    let message: String
    var errorDescription: String? { message }
}

actor APIClient {
    static let shared = APIClient()

    static let baseURL: URL = {
        let raw = Bundle.main.object(forInfoDictionaryKey: "MareaAPIBase") as? String ?? ""
        return URL(string: raw.isEmpty ? "https://marea.onrender.com" : raw)!
    }()

    private static let cacheVersion = "api-v4"
    private let freshMs: Double = 5 * 60_000
    private let session: URLSession
    private let cacheDir: URL

    init() {
        let cfg = URLSessionConfiguration.default
        // 60 s: margen para que el servidor de Render despierte si estaba dormido.
        cfg.timeoutIntervalForRequest = 60
        cfg.requestCachePolicy = .reloadIgnoringLocalCacheData
        session = URLSession(configuration: cfg)
        // Sube la versión cuando cambien las respuestas de la API (v4: índice UV) para no mostrar
        // datos guardados que no traen los campos nuevos. Las cachés anteriores se borran.
        let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        cacheDir = caches.appendingPathComponent(Self.cacheVersion, isDirectory: true)
        for old in (try? FileManager.default.contentsOfDirectory(atPath: caches.path)) ?? [] where old.hasPrefix("api-v") && old != Self.cacheVersion {
            try? FileManager.default.removeItem(at: caches.appendingPathComponent(old))
        }
        try? FileManager.default.createDirectory(at: cacheDir, withIntermediateDirectories: true)
    }

    // ---------- Lectura con caché ----------

    func overview(force: Bool = false) async throws -> Cached<Overview> { try await cachedGet("/api/spots", force: force) }
    func spot(_ id: String, force: Bool = false) async throws -> Cached<SpotDetail> { try await cachedGet("/api/spots/\(id)", force: force) }
    func buoy(_ id: String) async throws -> Cached<BuoyResponse> { try await cachedGet("/api/spots/\(id)/boya", force: false) }

    private struct Entry<T: Codable>: Codable { let ts: Double; let data: T }

    private func cacheFile(_ path: String) -> URL {
        cacheDir.appendingPathComponent(path.replacingOccurrences(of: "/", with: "_") + ".json")
    }

    private func cachedGet<T: Codable & Sendable>(_ path: String, force: Bool) async throws -> Cached<T> {
        let file = cacheFile(path)
        let hit = (try? Data(contentsOf: file)).flatMap { try? JSONDecoder().decode(Entry<T>.self, from: $0) }
        if !force, let hit, Date.now.ms - hit.ts < freshMs { return Cached(ts: hit.ts, data: hit.data) }
        do {
            let data: T = try await request(path)
            let entry = Entry(ts: Date.now.ms, data: data)
            if let encoded = try? JSONEncoder().encode(entry) { try? encoded.write(to: file, options: .atomic) }
            return Cached(ts: entry.ts, data: data)
        } catch {
            if let hit { return Cached(ts: hit.ts, data: hit.data, stale: true, offline: Self.isOffline(error)) }
            throw error
        }
    }

    static func isOffline(_ error: Error) -> Bool {
        guard let e = error as? URLError else { return false }
        return [.notConnectedToInternet, .networkConnectionLost, .dataNotAllowed, .internationalRoamingOff].contains(e.code)
    }

    // ---------- Peticiones ----------

    private func request<T: Decodable>(_ path: String, method: String = "GET", body: (any Encodable)? = nil) async throws -> T {
        var req = URLRequest(url: Self.baseURL.appending(path: path))
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONEncoder().encode(body)
        }
        let data: Data, res: URLResponse
        do { (data, res) = try await session.data(for: req) }
        catch let e as URLError where Self.isOffline(e) { throw e }
        catch { throw APIError(message: "No se pudo conectar con el servidor") }
        let status = (res as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let msg = (try? JSONDecoder().decode([String: String].self, from: data))?["error"]
            throw APIError(message: msg ?? "Error \(status)")
        }
        return try JSONDecoder().decode(T.self, from: data)
    }

    // ---------- Avisos ----------

    private struct Device: Encodable { let platform = "ios"; let token: String }
    private struct Subscribe: Encodable { let device: Device; let spots: [String]; let minScore: Double }
    private struct Endpoint: Encodable { let endpoint: String }
    struct OK: Decodable { let ok: Bool? }

    static func endpoint(for token: String) -> String { "apns:\(token)" }

    func subscribe(token: String, spots: [String], minScore: Double) async throws -> AlertState {
        try await request("/api/push/subscribe", method: "POST", body: Subscribe(device: Device(token: token), spots: spots, minScore: minScore))
    }

    func status(token: String) async throws -> AlertState {
        try await request("/api/push/status", method: "POST", body: Endpoint(endpoint: Self.endpoint(for: token)))
    }

    func unsubscribe(token: String) async throws {
        let _: AlertStateLoose = try await request("/api/push/unsubscribe", method: "POST", body: Endpoint(endpoint: Self.endpoint(for: token)))
    }

    func sendTest(token: String) async throws {
        let _: OK = try await request("/api/push/test", method: "POST", body: Endpoint(endpoint: Self.endpoint(for: token)))
    }

    private struct AlertStateLoose: Decodable {}
}
