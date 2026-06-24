import SwiftUI

@main
struct PacificDroneApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    @StateObject private var auth = AuthViewModel(
        api: APIClient(baseURL: URL(string: "https://pacificdrone.ca")!),
        sessionStore: KeychainSessionStore()
    )

    var body: some Scene {
        WindowGroup {
            AppRootView()
                .environmentObject(auth)
                .onAppear {
                    Task {
                        await auth.restore()
                    }
                }
        }
    }
}
