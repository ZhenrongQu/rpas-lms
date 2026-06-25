import SwiftUI

struct ExamView: View {
    @EnvironmentObject var auth: AuthViewModel
    @StateObject private var viewModel = ExamViewModel(
        api: APIClient(baseURL: URL(string: "https://pacificdrone.ca")!)
    )

    var body: some View {
        NavigationView {
            content
                .background(AppTheme.paper.edgesIgnoringSafeArea(.all))
                .navigationTitle("Exam")
        }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel.phase {
        case .chooser, .failed:
            ExamChooserView(message: failureMessage) { level in
                guard let token = auth.token else { return }
                Task { await viewModel.start(certLevel: level, token: token) }
            }
        case .loading:
            ProgressView("Preparing…")
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        case .submitting:
            ProgressView("Grading…")
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        case .answering:
            ExamAnsweringView(viewModel: viewModel)
        case .result:
            ExamResultView(viewModel: viewModel)
        }
    }

    private var failureMessage: String? {
        if case .failed(let message) = viewModel.phase { return message }
        return nil
    }
}

private struct ExamChooserView: View {
    let message: String?
    let onStart: (String) -> Void

    var body: some View {
        VStack(spacing: 16) {
            Spacer()
            Text("Mock Exam")
                .font(.title.bold())
                .foregroundColor(AppTheme.ink)
            Text("Timed practice graded on the server, just like the real test.")
                .font(.subheadline)
                .foregroundColor(AppTheme.secondaryInk)
                .multilineTextAlignment(.center)

            if let message = message {
                Text(message)
                    .font(.footnote)
                    .foregroundColor(.red)
                    .multilineTextAlignment(.center)
            }

            Button {
                onStart("BASIC")
            } label: {
                Text("Start Basic Mock Exam")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
            }
            .foregroundColor(.white)
            .background(AppTheme.accent)
            .cornerRadius(10)

            Button {
                onStart("ADVANCED")
            } label: {
                Text("Start Advanced Mock Exam")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
            }
            .foregroundColor(AppTheme.accent)
            .overlay(
                RoundedRectangle(cornerRadius: 10).stroke(AppTheme.accent, lineWidth: 1)
            )
            Spacer()
        }
        .padding(24)
    }
}

private struct ExamAnsweringView: View {
    @ObservedObject var viewModel: ExamViewModel

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider()
            if let question = viewModel.currentQuestion {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        Text("Question \(viewModel.currentIndex + 1) of \(viewModel.questions.count)")
                            .font(.caption.bold())
                            .foregroundColor(AppTheme.accent)
                        Text(question.stem)
                            .font(.headline)
                            .foregroundColor(AppTheme.ink)
                        Text(question.isMulti ? "Select all that apply" : "Select one")
                            .font(.caption)
                            .foregroundColor(AppTheme.secondaryInk)
                        ForEach(question.options) { option in
                            ExamOptionRow(
                                option: option,
                                selected: viewModel.selectedOptions(for: question.id).contains(option.id),
                                multi: question.isMulti
                            ) {
                                viewModel.toggle(option.id, for: question)
                            }
                        }
                    }
                    .padding()
                }
            }
            Divider()
            footer
        }
    }

    private var header: some View {
        HStack {
            Text("Answered \(viewModel.answeredCount)/\(viewModel.questions.count)")
                .font(.caption)
                .foregroundColor(AppTheme.secondaryInk)
            Spacer()
            Label(timeString, systemImage: "clock")
                .font(.caption.monospacedDigit())
                .foregroundColor(viewModel.remainingSeconds <= 60 ? .red : AppTheme.secondaryInk)
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
    }

    private var footer: some View {
        HStack(spacing: 12) {
            Button("Previous") { viewModel.previous() }
                .foregroundColor(viewModel.currentIndex == 0 ? AppTheme.border : AppTheme.accent)
                .disabled(viewModel.currentIndex == 0)
            Spacer()
            if viewModel.isLastQuestion {
                Button {
                    Task { await viewModel.submit() }
                } label: {
                    Text("Submit").bold().foregroundColor(AppTheme.green)
                }
            } else {
                Button("Next") { viewModel.next() }
                    .foregroundColor(AppTheme.accent)
            }
        }
        .padding()
    }

    private var timeString: String {
        let seconds = viewModel.remainingSeconds
        return String(format: "%d:%02d", seconds / 60, seconds % 60)
    }
}

private struct ExamOptionRow: View {
    let option: PublicOption
    let selected: Bool
    let multi: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: symbol)
                    .foregroundColor(selected ? AppTheme.accent : AppTheme.border)
                Text(option.label)
                    .foregroundColor(AppTheme.ink)
                    .multilineTextAlignment(.leading)
                Spacer()
            }
            .padding()
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(selected ? AppTheme.accentSoft : AppTheme.surface)
            .cornerRadius(12)
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(selected ? AppTheme.accent : AppTheme.border, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }

    private var symbol: String {
        if multi {
            return selected ? "checkmark.square.fill" : "square"
        }
        return selected ? "largecircle.fill.circle" : "circle"
    }
}

private struct ExamResultView: View {
    @ObservedObject var viewModel: ExamViewModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                if let result = viewModel.result {
                    VStack(spacing: 8) {
                        Text("\(result.percent)%")
                            .font(.system(size: 56, weight: .bold))
                            .foregroundColor(result.passed ? AppTheme.green : AppTheme.accent)
                        Text(result.passed ? "Passed" : "Keep practicing")
                            .font(.headline)
                            .foregroundColor(AppTheme.ink)
                        Text("\(result.correct) of \(result.total) correct")
                            .font(.subheadline)
                            .foregroundColor(AppTheme.secondaryInk)
                    }
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(AppTheme.surface)
                    .cornerRadius(16)
                }

                if !viewModel.incorrectReview.isEmpty {
                    Text("Review \(viewModel.incorrectReview.count) to revisit")
                        .font(.title3.bold())
                        .foregroundColor(AppTheme.ink)
                    ForEach(viewModel.incorrectReview) { item in
                        ExamReviewCard(item: item)
                    }
                } else if viewModel.result != nil {
                    Text("Perfect score — nothing to review.")
                        .foregroundColor(AppTheme.secondaryInk)
                }

                Button {
                    viewModel.reset()
                } label: {
                    Text("Back to Mock Exams")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                }
                .foregroundColor(.white)
                .background(AppTheme.accent)
                .cornerRadius(10)
            }
            .padding()
        }
    }
}

private struct ExamReviewCard: View {
    let item: ReviewItem

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(item.stem)
                .font(.subheadline.bold())
                .foregroundColor(AppTheme.ink)
            ForEach(item.options) { option in
                HStack(spacing: 8) {
                    Image(systemName: icon(for: option))
                        .foregroundColor(color(for: option))
                    Text(option.label)
                        .font(.footnote)
                        .foregroundColor(AppTheme.ink)
                    Spacer()
                }
            }
            if !item.explanation.isEmpty {
                Text(item.explanation)
                    .font(.footnote)
                    .foregroundColor(AppTheme.secondaryInk)
                    .padding(.top, 4)
            }
            if !item.reference.isEmpty {
                Text(item.reference)
                    .font(.caption)
                    .foregroundColor(AppTheme.secondaryInk)
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

    private func icon(for option: ReviewOption) -> String {
        if option.isCorrect { return "checkmark.circle.fill" }
        if item.selectedOptionIds.contains(option.id) { return "xmark.circle.fill" }
        return "circle"
    }

    private func color(for option: ReviewOption) -> Color {
        if option.isCorrect { return AppTheme.green }
        if item.selectedOptionIds.contains(option.id) { return .red }
        return AppTheme.border
    }
}
