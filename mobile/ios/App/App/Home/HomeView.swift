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
                            NavigationLink {
                                FlightReviewView()
                            } label: {
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
            Image(systemName: "chevron.right")
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

/// Native Flight Review booking: list open slots, book/reschedule, or cancel.
struct FlightReviewView: View {
    @EnvironmentObject var auth: AuthViewModel
    @State private var load: Load = .loading
    @State private var working = false
    @State private var actionError: String?
    @State private var didLoad = false

    private let api = APIClient(baseURL: URL(string: "https://pacificdrone.ca")!)

    enum Load: Equatable {
        case loading
        case loaded(FlightReviewData)
        case failed(String)
    }

    var body: some View {
        Group {
            switch load {
            case .loading:
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            case .failed(let message):
                VStack(spacing: 12) {
                    Text(message).foregroundColor(.red)
                    Button("Retry") { Task { await reload() } }
                        .foregroundColor(AppTheme.accent)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            case .loaded(let data):
                content(data)
            }
        }
        .background(AppTheme.paper.edgesIgnoringSafeArea(.all))
        .navigationTitle("Flight Review")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            if !didLoad { didLoad = true; Task { await reload() } }
        }
    }

    @ViewBuilder
    private func content(_ data: FlightReviewData) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: AppTheme.gap) {
                if let actionError = actionError {
                    Text(actionError).font(.footnote).foregroundColor(.red)
                }
                if let booking = data.booking {
                    bookingCard(booking)
                    Text("Reschedule")
                        .font(.headline).foregroundColor(AppTheme.ink)
                    slotList(data.slots, currentSlotId: booking.slot.id, emptyText: "No other open slots.")
                } else if data.eligible {
                    Text("Pick a slot")
                        .font(.title3.bold()).foregroundColor(AppTheme.ink)
                    slotList(data.slots, currentSlotId: nil, emptyText: "No open slots right now — check back soon.")
                } else {
                    notEligible
                }
            }
            .padding()
        }
    }

    private func bookingCard(_ booking: FRBooking) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Your booking", systemImage: "checkmark.seal.fill")
                .font(.caption.bold()).foregroundColor(AppTheme.green)
            Text(slotTitle(booking.slot))
                .font(.headline).foregroundColor(AppTheme.ink)
            Text("\(booking.slot.location) · \(booking.slot.examinerName) · \(booking.slot.durationMin) min")
                .font(.subheadline).foregroundColor(AppTheme.secondaryInk)
            Button {
                Task { await cancel() }
            } label: {
                Text(working ? "Working…" : "Cancel booking")
                    .font(.subheadline.bold()).foregroundColor(.red)
                    .frame(maxWidth: .infinity, minHeight: 44)
            }
            .disabled(working)
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.accentSoft)
        .cornerRadius(AppTheme.corner)
    }

    @ViewBuilder
    private func slotList(_ slots: [FRSlot], currentSlotId: String?, emptyText: String) -> some View {
        if slots.filter({ $0.id != currentSlotId }).isEmpty {
            Text(emptyText).foregroundColor(AppTheme.secondaryInk)
        } else {
            ForEach(slots) { slot in
                slotRow(slot, isCurrent: slot.id == currentSlotId)
            }
        }
    }

    private func slotRow(_ slot: FRSlot, isCurrent: Bool) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(slotTitle(slot)).foregroundColor(AppTheme.ink)
                Text("\(slot.location) · \(slot.examinerName)")
                    .font(.caption).foregroundColor(AppTheme.secondaryInk)
            }
            Spacer()
            if isCurrent {
                Text("Current").font(.caption.bold()).foregroundColor(AppTheme.green)
            } else {
                Button {
                    Task { await book(slot.id) }
                } label: {
                    Text("Book")
                        .font(.subheadline.bold()).foregroundColor(.white)
                        .padding(.horizontal, 18).frame(minHeight: 40)
                        .background(AppTheme.accent).cornerRadius(AppTheme.cornerSmall)
                }
                .disabled(working)
            }
        }
        .cardStyle()
    }

    private var notEligible: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Flight Review locked")
                .font(.title3.bold()).foregroundColor(AppTheme.ink)
            Text("The in-person flight review is a paid add-on. Purchase it to unlock booking.")
                .font(.subheadline).foregroundColor(AppTheme.secondaryInk)
            Link(destination: URL(string: "https://pacificdrone.ca/en/billing")!) {
                Text("View options")
                    .font(.subheadline.bold()).foregroundColor(AppTheme.accent)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .background(AppTheme.accentSoft).cornerRadius(AppTheme.cornerSmall)
            }
        }
    }

    private func slotTitle(_ slot: FRSlot) -> String {
        guard let date = Self.iso.date(from: slot.startsAt) else { return slot.startsAt }
        return Self.display.string(from: date)
    }

    private static let iso: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private static let display: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "EEE, MMM d · h:mm a"
        return f
    }()

    private func reload() async {
        guard let token = auth.token else { return }
        actionError = nil
        do {
            let data: FlightReviewData = try await api.get(
                path: "/api/mobile/flight-review?locale=en",
                token: token
            )
            load = .loaded(data)
        } catch {
            load = .failed("Unable to load flight review")
        }
    }

    private func book(_ slotId: String) async {
        guard let token = auth.token, !working else { return }
        working = true
        actionError = nil
        defer { working = false }
        do {
            let _: OKResponse = try await api.send(
                path: "/api/mobile/flight-review",
                method: "POST",
                token: token,
                body: BookSlotRequest(slotId: slotId)
            )
            await reload()
        } catch APIError.badStatus(409) {
            actionError = "That slot was just taken. Pick another."
            await reload()
        } catch {
            actionError = "Couldn't book that slot. Please try again."
        }
    }

    private func cancel() async {
        guard let token = auth.token, !working else { return }
        working = true
        actionError = nil
        defer { working = false }
        do {
            let _: OKResponse = try await api.send(
                path: "/api/mobile/flight-review",
                method: "DELETE",
                token: token
            )
            await reload()
        } catch {
            actionError = "Couldn't cancel. Please try again."
        }
    }
}
