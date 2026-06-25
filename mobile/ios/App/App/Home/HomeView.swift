import SwiftUI

struct HomeView: View {
    @EnvironmentObject var auth: AuthViewModel
    @StateObject private var viewModel = DashboardViewModel(
        api: APIClient(baseURL: URL(string: "https://pacificdrone.ca")!)
    )

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    switch viewModel.state {
                    case .idle, .loading:
                        ProgressView()
                            .frame(maxWidth: .infinity)
                    case .failed(let message):
                        Text(message)
                            .foregroundColor(.red)
                    case .loaded(let dashboard):
                        greeting(for: dashboard)
                        if let resume = dashboard.resume {
                            ContinueCard(resume: resume)
                        }
                        if let basic = dashboard.progress.basic {
                            CourseProgressCard(title: "Basic", progress: basic)
                        }
                        if let advanced = dashboard.progress.advanced {
                            CourseProgressCard(title: "Advanced", progress: advanced)
                        }
                        MockExamCard(summary: dashboard.mockExam)
                        if let flightReview = dashboard.flightReview {
                            FlightReviewCard(status: flightReview)
                        }
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

    private func greeting(for dashboard: DashboardResponse) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(dashboard.user.name.map { "Welcome back, \($0)" } ?? "Welcome back")
                .font(.title2.bold())
                .foregroundColor(AppTheme.ink)
            Text("\(tierLabel(dashboard.user.accessTier)) · \(dashboard.progress.overallPct)% overall")
                .font(.subheadline)
                .foregroundColor(AppTheme.accent)
        }
    }

    private func tierLabel(_ tier: String) -> String {
        tier == "PAID" ? "Full access" : "Free plan"
    }
}

private struct ContinueCard: View {
    let resume: ResumeLesson

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Continue Learning")
                .font(.caption.bold())
                .foregroundColor(AppTheme.accent)
            Text(resume.title)
                .font(.headline)
                .foregroundColor(AppTheme.ink)
            Text("\(resume.courseTitle) · \(resume.pct)% complete")
                .font(.subheadline)
                .foregroundColor(AppTheme.secondaryInk)
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.accentSoft)
        .cornerRadius(14)
    }
}

private struct CourseProgressCard: View {
    let title: String
    let progress: CourseProgress

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(title)
                    .font(.headline)
                    .foregroundColor(AppTheme.ink)
                Spacer()
                if progress.locked == true {
                    Label("Locked", systemImage: "lock.fill")
                        .font(.caption)
                        .foregroundColor(AppTheme.secondaryInk)
                } else {
                    Text("\(progress.done)/\(progress.total)")
                        .font(.caption)
                        .foregroundColor(AppTheme.secondaryInk)
                }
            }
            ProgressView(value: Double(progress.pct), total: 100)
                .accentColor(AppTheme.accent)
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.surface)
        .cornerRadius(14)
        .overlay(
            RoundedRectangle(cornerRadius: 14).stroke(AppTheme.border, lineWidth: 1)
        )
    }
}

private struct MockExamCard: View {
    let summary: MockExamSummary

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text("Mock Exams")
                    .font(.headline)
                    .foregroundColor(AppTheme.ink)
                Text(subtitle)
                    .font(.subheadline)
                    .foregroundColor(AppTheme.secondaryInk)
            }
            Spacer()
            Image(systemName: "checkmark.circle")
                .foregroundColor(AppTheme.accent)
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.surface)
        .cornerRadius(14)
        .overlay(
            RoundedRectangle(cornerRadius: 14).stroke(AppTheme.border, lineWidth: 1)
        )
    }

    private var subtitle: String {
        if let best = summary.bestPct {
            return "Best score \(best)% · \(summary.recentCount) recent"
        }
        return "No attempts yet — try one from the Exam tab"
    }
}

private struct FlightReviewCard: View {
    let status: FlightReviewStatus

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Flight Review")
                .font(.headline)
                .foregroundColor(AppTheme.ink)
            Text(statusText)
                .font(.subheadline)
                .foregroundColor(AppTheme.secondaryInk)
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.surface)
        .cornerRadius(14)
        .overlay(
            RoundedRectangle(cornerRadius: 14).stroke(AppTheme.border, lineWidth: 1)
        )
    }

    private var statusText: String {
        switch status.status {
        case "booked":
            if let booking = status.booking {
                return "Booked with \(booking.examinerName)"
            }
            return "Booked"
        case "eligible":
            return "Eligible to book"
        default:
            return "Available after you finish the course"
        }
    }
}
