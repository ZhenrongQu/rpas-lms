import SwiftUI

@MainActor
final class LearnViewModel: ObservableObject {
    @Published private(set) var courses: [MobileCourse] = []
    @Published private(set) var errorMessage: String?
    @Published private(set) var hasLoaded = false

    private let api: APIClient

    init(api: APIClient) {
        self.api = api
    }

    func load(token: String) async {
        do {
            let response: CoursesResponse = try await api.get(
                path: "/api/mobile/courses?locale=en",
                token: token
            )
            courses = response.courses
            errorMessage = nil
            hasLoaded = true
        } catch {
            // On a refresh failure keep the previously loaded list visible.
            if !hasLoaded { errorMessage = "Unable to load courses" }
        }
    }
}

struct LearnView: View {
    @EnvironmentObject var auth: AuthViewModel
    @StateObject private var viewModel = LearnViewModel(
        api: APIClient(baseURL: URL(string: "https://pacificdrone.ca")!)
    )

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    if viewModel.hasLoaded {
                        ForEach(viewModel.courses) { course in
                            CourseCard(course: course)
                        }
                    } else if let message = viewModel.errorMessage {
                        Text(message).foregroundColor(.red)
                    } else {
                        ProgressView().frame(maxWidth: .infinity)
                    }
                }
                .padding()
            }
            .background(AppTheme.paper.edgesIgnoringSafeArea(.all))
            .navigationTitle("Learn")
            .onAppear {
                if let token = auth.token {
                    Task { await viewModel.load(token: token) }
                }
            }
        }
    }
}

private struct CourseCard: View {
    let course: MobileCourse

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(course.title)
                    .font(.title3.bold())
                    .foregroundColor(AppTheme.ink)
                Spacer()
                if course.locked {
                    Label("Locked", systemImage: "lock.fill")
                        .font(.caption)
                        .foregroundColor(AppTheme.secondaryInk)
                } else {
                    Text("\(course.done)/\(course.total)")
                        .font(.caption.monospacedDigit())
                        .foregroundColor(AppTheme.secondaryInk)
                }
            }

            if course.locked {
                Link(destination: URL(string: "https://pacificdrone.ca/en/billing")!) {
                    Text("Upgrade to unlock the Advanced course")
                        .font(.subheadline)
                        .foregroundColor(AppTheme.accent)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding()
                        .background(AppTheme.accentSoft)
                        .cornerRadius(12)
                }
            } else {
                ForEach(course.modules) { module in
                    ForEach(module.lessons) { lesson in
                        NavigationLink {
                            LessonContainerView(lessonId: lesson.lessonId, title: lesson.title)
                        } label: {
                            LessonRowView(lesson: lesson)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
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

private struct LessonRowView: View {
    let lesson: MobileLessonMeta

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: (lesson.completed ?? false) ? "checkmark.circle.fill" : "circle")
                .foregroundColor((lesson.completed ?? false) ? AppTheme.green : AppTheme.border)
            VStack(alignment: .leading, spacing: 2) {
                Text(lesson.title)
                    .foregroundColor(AppTheme.ink)
                Text("\(lesson.estMinutes) min")
                    .font(.caption)
                    .foregroundColor(AppTheme.secondaryInk)
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.caption.bold())
                .foregroundColor(AppTheme.border)
        }
        .padding(.vertical, 8)
        .contentShape(Rectangle())
    }
}
