import SwiftUI

struct HomeView: View {
    @EnvironmentObject var auth: AuthViewModel
    @StateObject private var viewModel = DashboardViewModel(
        api: APIClient(baseURL: URL(string: "https://pacificdrone.ca")!)
    )

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    switch viewModel.state {
                    case .idle, .loading:
                        ProgressView()
                            .frame(maxWidth: .infinity)
                    case .failed(let message):
                        Text(message)
                            .foregroundColor(.red)
                    case .loaded(let dashboard):
                        Text("Welcome back")
                            .font(.title2.bold())
                            .foregroundColor(AppTheme.ink)
                        if let resume = dashboard.resume {
                            VStack(alignment: .leading, spacing: 8) {
                                Text("Continue Learning")
                                    .font(.caption.bold())
                                    .foregroundColor(AppTheme.accent)
                                Text(resume.title)
                                    .font(.headline)
                                    .foregroundColor(AppTheme.ink)
                                Text("\(resume.courseTitle) - \(resume.pct)% complete")
                                    .foregroundColor(AppTheme.secondaryInk)
                            }
                            .padding()
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(AppTheme.accentSoft)
                            .cornerRadius(14)
                        }
                        Text("Overall progress: \(dashboard.progress.overallPct)%")
                            .foregroundColor(AppTheme.secondaryInk)
                    }
                }
                .padding()
            }
            .background(AppTheme.paper.edgesIgnoringSafeArea(.all))
            .navigationTitle("Home")
            .onAppear {
                if let token = auth.token {
                    Task { await viewModel.load(token: token) }
                }
            }
        }
    }
}
