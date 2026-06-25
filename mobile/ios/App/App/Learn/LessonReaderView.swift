import SwiftUI

/// Fetches one lesson document and renders it, with a sticky "Mark Complete" action.
struct LessonContainerView: View {
    let lessonId: String
    let title: String

    @EnvironmentObject var auth: AuthViewModel
    @State private var state: LoadState = .loading
    @State private var completed = false
    @State private var completing = false
    @State private var didLoad = false

    private let api = APIClient(baseURL: URL(string: "https://pacificdrone.ca")!)

    enum LoadState: Equatable {
        case loading
        case loaded(MobileLessonResponse)
        case failed(String)
    }

    var body: some View {
        Group {
            switch state {
            case .loading:
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(AppTheme.paper.edgesIgnoringSafeArea(.all))
            case .failed(let message):
                VStack(spacing: 12) {
                    Text(message).foregroundColor(.red)
                    Button("Retry") { Task { await load() } }
                        .foregroundColor(AppTheme.accent)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(AppTheme.paper.edgesIgnoringSafeArea(.all))
            case .loaded(let lesson):
                VStack(spacing: 0) {
                    LessonReaderView(lesson: lesson)
                    completeBar
                }
            }
        }
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            if !didLoad {
                didLoad = true
                Task { await load() }
            }
        }
    }

    private var completeBar: some View {
        VStack(spacing: 0) {
            Divider()
            Button {
                Task { await complete() }
            } label: {
                Text(completed ? "Completed" : "Mark Complete")
                    .font(.headline)
                    .frame(maxWidth: .infinity, minHeight: AppTheme.controlHeight)
            }
            .foregroundColor(.white)
            .background(completed ? AppTheme.green : AppTheme.accent)
            .cornerRadius(AppTheme.cornerSmall)
            .disabled(completed || completing)
            .padding()
        }
        .background(AppTheme.surface)
    }

    private func load() async {
        guard let token = auth.token else { return }
        state = .loading
        do {
            let lesson: MobileLessonResponse = try await api.get(
                path: "/api/mobile/lessons/\(lessonId)?locale=en",
                token: token
            )
            completed = lesson.completed
            state = .loaded(lesson)
        } catch {
            state = .failed("Unable to load lesson")
        }
    }

    private func complete() async {
        guard let token = auth.token, !completed else { return }
        completing = true
        defer { completing = false }
        do {
            let _: OKResponse = try await api.send(
                path: "/api/mobile/progress/lesson",
                method: "POST",
                token: token,
                body: CompleteLessonRequest(lessonId: lessonId)
            )
            completed = true
        } catch {
            // Leave the button enabled so the learner can retry.
        }
    }
}

struct LessonReaderView: View {
    let lesson: MobileLessonResponse

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text(lesson.meta.title)
                    .font(.title.bold())
                    .foregroundColor(AppTheme.ink)
                ForEach(lesson.blocks) { block in
                    switch block {
                    case .heading(let level, let text):
                        Text(text)
                            .font(level == 1 ? .title2.bold() : .headline)
                            .foregroundColor(AppTheme.ink)
                    case .paragraph(let text):
                        Text(text)
                            .foregroundColor(AppTheme.secondaryInk)
                    case .list(_, let items):
                        VStack(alignment: .leading, spacing: 6) {
                            ForEach(items, id: \.self) { item in
                                Text("- \(item)")
                                    .foregroundColor(AppTheme.ink)
                            }
                        }
                    case .callout(_, let text):
                        Text(text)
                            .foregroundColor(AppTheme.ink)
                            .padding()
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(AppTheme.accentSoft)
                            .cornerRadius(12)
                    }
                }
            }
            .padding()
        }
        .background(AppTheme.paper.edgesIgnoringSafeArea(.all))
    }
}
