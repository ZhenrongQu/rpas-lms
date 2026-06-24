import SwiftUI

struct AppRootView: View {
    @EnvironmentObject var auth: AuthViewModel

    var body: some View {
        Group {
            switch auth.state {
            case .checking:
                ProgressView()
            case .signedOut:
                LoginView()
            case .signedIn:
                MainTabView()
            }
        }
    }
}
