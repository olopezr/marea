import SwiftUI
import UIKit
import UserNotifications

@main
struct MareaApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var delegate

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(delegate.state)
        }
    }
}

final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    @MainActor lazy var state = AppState()

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        MainActor.assumeIsolated { state.alerts.didRegister(token: token) }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        MainActor.assumeIsolated { state.alerts.didFailToRegister(error) }
    }

    // Con la app abierta, el aviso se muestra igualmente.
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .sound, .list]
    }

    // Al tocar un aviso se abre el spot.
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        let url = response.notification.request.content.userInfo["url"] as? String ?? "/"
        await MainActor.run { state.open(url: url) }
    }
}

struct RootView: View {
    @Environment(AppState.self) private var app

    var body: some View {
        @Bindable var app = app
        NavigationStack(path: $app.path) {
            SpotListView()
                .navigationDestination(for: Route.self) { route in
                    switch route {
                    case .spot(let id): SpotDetailView(id: id)
                    case .alerts: AlertsView()
                    case .diary: DiaryView()
                    case .map: SpotsMapView()
                    }
                }
        }
        .tint(Theme.accent)
        // Enlace del widget: marea://spot/<id>
        .onOpenURL { url in
            if url.scheme == "marea", url.host == "spot" { app.open(url: "/#/spot/\(url.lastPathComponent)") }
        }
        .overlay(alignment: .bottom) { ToastView(message: app.toast) }
        .task { await app.alerts.load() }
    }
}
