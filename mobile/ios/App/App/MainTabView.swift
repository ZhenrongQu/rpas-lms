import SwiftUI

struct MainTabView: View {
    var body: some View {
        TabView {
            Text("Home")
                .tabItem { Label("Home", systemImage: "house") }
            Text("Learn")
                .tabItem { Label("Learn", systemImage: "book") }
            Text("Exam")
                .tabItem { Label("Exam", systemImage: "checkmark.circle") }
            Text("Account")
                .tabItem { Label("Account", systemImage: "person.crop.circle") }
        }
        .accentColor(AppTheme.accent)
    }
}
