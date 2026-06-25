import SwiftUI

struct AppRootView: View {
    @EnvironmentObject var auth: AuthViewModel
    @State private var showSplash = true
    @State private var logoOpacity = 0.0
    @State private var logoScale: CGFloat = 0.90

    var body: some View {
        ZStack {
            content
            if showSplash {
                LaunchSplash(opacity: logoOpacity, scale: logoScale)
                    .transition(.opacity)
            }
        }
        .preferredColorScheme(.light)
        .onAppear(perform: runSplash)
    }

    @ViewBuilder
    private var content: some View {
        switch auth.state {
        case .checking:
            ZStack {
                AppTheme.paper.edgesIgnoringSafeArea(.all)
                ProgressView()
            }
        case .signedOut:
            LoginView()
        case .signedIn:
            MainTabView()
        }
    }

    private func runSplash() {
        // Logo emerges (fade + settle), holds, then fades out before the app shows.
        withAnimation(.easeOut(duration: 0.55)) {
            logoOpacity = 1
            logoScale = 1
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            withAnimation(.easeIn(duration: 0.45)) { logoOpacity = 0 }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
            withAnimation(.easeInOut(duration: 0.35)) { showSplash = false }
        }
    }
}

private struct LaunchSplash: View {
    let opacity: Double
    let scale: CGFloat

    var body: some View {
        ZStack {
            AppTheme.paper.edgesIgnoringSafeArea(.all)
            VStack(spacing: 14) {
                Image(systemName: "paperplane.fill")
                    .font(.system(size: 52))
                    .foregroundColor(AppTheme.accent)
                Text("Pacific Drone")
                    .font(.title.bold())
                    .foregroundColor(AppTheme.ink)
            }
            .opacity(opacity)
            .scaleEffect(scale)
        }
    }
}
