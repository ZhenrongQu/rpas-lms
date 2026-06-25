import SwiftUI

/// Lets any tab jump to another tab (Home cards → Learn/Exam, etc.).
final class TabRouter: ObservableObject {
    @Published var selection: Tab = .home

    enum Tab: Int {
        case home, learn, exam, account
    }
}

struct MainTabView: View {
    @StateObject private var router = TabRouter()

    var body: some View {
        TabView(selection: $router.selection) {
            HomeView()
                .tabItem { Label("Home", systemImage: "house") }
                .tag(TabRouter.Tab.home)
            LearnView()
                .tabItem { Label("Learn", systemImage: "book") }
                .tag(TabRouter.Tab.learn)
            ExamView()
                .tabItem { Label("Exam", systemImage: "checkmark.circle") }
                .tag(TabRouter.Tab.exam)
            AccountView()
                .tabItem { Label("Account", systemImage: "person.crop.circle") }
                .tag(TabRouter.Tab.account)
        }
        .accentColor(AppTheme.accent)
        .environmentObject(router)
    }
}
