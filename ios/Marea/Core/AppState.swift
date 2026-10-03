import CoreLocation
import Observation
import SwiftUI
import UIKit
import UserNotifications

enum Route: Hashable {
    case spot(String)
    case alerts
}

enum ListFilter: String, CaseIterable {
    case all, fav, near
    var label: String { ["all": "Todos", "fav": "Favoritos", "near": "Cerca de mí"][rawValue]! }
}

// Preferencias y estado compartido de la app (equivale al estado global de public/js/app.js).
@MainActor @Observable
final class AppState {
    var path: [Route] = []
    var favs: Set<String> { didSet { UserDefaults.standard.set(Array(favs), forKey: "marea:favs") } }
    var filter: ListFilter { didSet { UserDefaults.standard.set(filter.rawValue, forKey: "marea:filter") } }
    var query = ""
    var toast: String?
    private var toastTask: Task<Void, Never>?

    let location = LocationProvider()
    let alerts = AlertsModel()

    init() {
        favs = Set(UserDefaults.standard.stringArray(forKey: "marea:favs") ?? [])
        filter = ListFilter(rawValue: UserDefaults.standard.string(forKey: "marea:filter") ?? "") ?? .all
    }

    func toggleFav(_ id: String) {
        if favs.contains(id) { favs.remove(id) } else { favs.insert(id) }
    }

    func show(_ message: String) {
        toast = message
        toastTask?.cancel()
        toastTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(3.5))
            if !Task.isCancelled { self?.toast = nil }
        }
    }

    /// Abre la ruta de un aviso ("/#/spot/<id>").
    func open(url: String) {
        if let r = url.range(of: "#/spot/") {
            let id = String(url[r.upperBound...])
            if Spot.byId[id] != nil { path = [.spot(id)] }
        }
    }
}

// ---------- Ubicación ----------

@MainActor @Observable
final class LocationProvider: NSObject, CLLocationManagerDelegate {
    var position: CLLocationCoordinate2D?
    private let manager = CLLocationManager()
    private var waiters: [CheckedContinuation<Void, Never>] = []

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyKilometer
    }

    /// Pide la ubicación una vez; vuelve sin ella si se deniega o tarda.
    func locate() async {
        if position != nil { return }
        await withCheckedContinuation { c in
            waiters.append(c)
            switch manager.authorizationStatus {
            case .notDetermined: manager.requestWhenInUseAuthorization()
            case .denied, .restricted: finish()
            default: manager.requestLocation()
            }
            Task { [weak self] in
                try? await Task.sleep(for: .seconds(8))
                self?.finish()
            }
        }
    }

    private func finish() {
        let w = waiters
        waiters = []
        w.forEach { $0.resume() }
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        Task { @MainActor in
            switch status {
            case .authorizedWhenInUse, .authorizedAlways: if !self.waiters.isEmpty { self.manager.requestLocation() }
            case .denied, .restricted: self.finish()
            default: break
            }
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        let c = locations.last?.coordinate
        Task { @MainActor in
            self.position = c
            self.finish()
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor in self.finish() }
    }
}

// ---------- Avisos push (equivale a public/js/alerts.js) ----------

@MainActor @Observable
final class AlertsModel {
    private(set) var state = AlertState.empty
    private(set) var permissionDenied = false
    private var token: String? = UserDefaults.standard.string(forKey: "marea:apnsToken")
    private var tokenWaiters: [CheckedContinuation<String, Error>] = []

    func load() async {
        permissionDenied = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus == .denied
        guard let token else { state = AlertState(subscribed: false, spots: [], minScore: state.minScore); return }
        if let st = try? await APIClient.shared.status(token: token) { state = st }
    }

    // Llamado desde AppDelegate.
    func didRegister(token newToken: String) {
        let changed = token != nil && token != newToken
        token = newToken
        UserDefaults.standard.set(newToken, forKey: "marea:apnsToken")
        tokenWaiters.forEach { $0.resume(returning: newToken) }
        tokenWaiters = []
        // Si Apple renueva el token, se vuelve a suscribir con los mismos spots.
        if changed, !state.spots.isEmpty {
            let (spots, min) = (state.spots, state.minScore)
            Task { try? await self.save(spots, minScore: min) }
        }
    }

    func didFailToRegister(_ error: Error) {
        #if targetEnvironment(simulator)
        // El simulador sin equipo de desarrollo no obtiene token de APNs: se usa uno de prueba
        // para poder probar la pantalla de avisos contra un servidor local.
        didRegister(token: token ?? (0..<32).map { _ in String(format: "%02x", UInt8.random(in: 0...255)) }.joined())
        #else
        // Firmada sin la capacidad de avisos push (p. ej. con un equipo de desarrollo gratuito).
        let message = (error as NSError).localizedDescription.contains("aps-environment")
            ? "Esta instalación de Marea no admite avisos: se firmó sin la capacidad de notificaciones push."
            : "No se pudieron activar las notificaciones en este iPhone. Inténtalo de nuevo más tarde."
        tokenWaiters.forEach { $0.resume(throwing: APIError(message: message)) }
        tokenWaiters = []
        #endif
    }

    private func ensureToken() async throws -> String {
        let center = UNUserNotificationCenter.current()
        let granted = (try? await center.requestAuthorization(options: [.alert, .sound, .badge])) ?? false
        guard granted else {
            permissionDenied = true
            throw APIError(message: "Para recibir avisos, permite las notificaciones de Marea en Ajustes.")
        }
        permissionDenied = false
        let current = try await withCheckedThrowingContinuation { c in
            tokenWaiters.append(c)
            UIApplication.shared.registerForRemoteNotifications()
        }
        return current
    }

    func save(_ spots: [String], minScore: Double? = nil) async throws {
        if spots.isEmpty { return try await disableAll() }
        let t = try await ensureToken()
        state = try await APIClient.shared.subscribe(token: t, spots: spots, minScore: minScore ?? state.minScore)
    }

    // Sin spots activos el umbral se guarda en memoria y se envía con la primera suscripción.
    func setMinScore(_ v: Double) async throws {
        if state.spots.isEmpty { state.minScore = v } else { try await save(state.spots, minScore: v) }
    }

    func toggle(_ id: String) async throws {
        var set = state.spots
        if let i = set.firstIndex(of: id) { set.remove(at: i) } else { set.append(id) }
        try await save(set)
    }

    func disableAll() async throws {
        if let token { try? await APIClient.shared.unsubscribe(token: token) }
        state = .empty
    }

    func sendTest() async throws {
        guard let token, !state.spots.isEmpty else { throw APIError(message: "Activa antes los avisos de algún spot.") }
        try await APIClient.shared.sendTest(token: token)
    }
}
