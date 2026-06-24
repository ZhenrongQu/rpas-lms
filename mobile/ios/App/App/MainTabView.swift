import SwiftUI

struct MainTabView: View {
    var body: some View {
        TabView {
            HomeView()
                .tabItem { Label("Home", systemImage: "house") }
            LearnView()
                .tabItem { Label("Learn", systemImage: "book") }
            ExamView()
                .tabItem { Label("Exam", systemImage: "checkmark.circle") }
            AccountView()
                .tabItem { Label("Account", systemImage: "person.crop.circle") }
        }
        .accentColor(AppTheme.accent)
    }
}
