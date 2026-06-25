import SwiftUI

struct HomeView: View {
    @EnvironmentObject var auth: AuthViewModel
    @EnvironmentObject var router: TabRouter
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
                            NavigationLink {
                                LessonContainerView(lessonId: resume.lessonId, title: resume.title)
                            } label: {
                                ContinueCard(resume: resume)
                            }
                            .buttonStyle(.plain)
                        }
                        if let basic = dashboard.progress.basic {
                            Button { router.selection = .learn } label: {
                                CourseProgressCard(title: "Basic", progress: basic)
                            }
                            .buttonStyle(.plain)
                        }
                        if let advanced = dashboard.progress.advanced {
                            Button { router.selection = .learn } label: {
                                CourseProgressCard(title: "Advanced", progress: advanced)
                            }
                            .buttonStyle(.plain)
                        }
                        Button { router.selection = .exam } label: {
                            MockExamCard(summary: dashboard.mockExam)
                        }
                        .buttonStyle(.plain)
                        if let flightReview = dashboard.flightReview {
                            Link(destination: URL(string: "https://pacificdrone.ca/en/flight-review")!) {
                                FlightReviewCard(status: flightReview)
                            }
                            .buttonStyle(.plain)
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
        HStack {
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
            Spacer()
            Image(systemName: "chevron.right")
                .font(.subheadline.bold())
                .foregroundColor(AppTheme.accent)
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
                Image(systemName: "chevron.right")
                    .font(.caption.bold())
                    .foregroundColor(AppTheme.border)
            }
            ProgressView(value: Double(progress.pct), total: 100)
                .accentColor(AppTheme.accent)
        }
        .cardStyle()
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
            Image(systemName: "chevron.right")
                .font(.caption.bold())
                .foregroundColor(AppTheme.border)
        }
        .cardStyle()
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
        HStack {
            VStack(alignment: .leading, spacing: 6) {
                Text("Flight Review")
                    .font(.headline)
                    .foregroundColor(AppTheme.ink)
                Text(statusText)
                    .font(.subheadline)
                    .foregroundColor(AppTheme.secondaryInk)
            }
            Spacer()
            Image(systemName: "arrow.up.right")
                .font(.caption.bold())
                .foregroundColor(AppTheme.border)
        }
        .cardStyle()
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
