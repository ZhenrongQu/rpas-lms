import SwiftUI

struct LoginView: View {
    var body: some View {
        VStack(spacing: 12) {
            Text("Pacific Drone")
                .font(.largeTitle.bold())
                .foregroundColor(AppTheme.ink)
            Text("Sign in will be connected in the next step.")
                .foregroundColor(AppTheme.secondaryInk)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(24)
        .background(AppTheme.paper)
    }
}
