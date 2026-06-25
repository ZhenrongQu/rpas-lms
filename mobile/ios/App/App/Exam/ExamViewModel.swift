import Foundation

@MainActor
final class ExamViewModel: ObservableObject {
    enum Phase: Equatable {
        case chooser
        case loading
        case answering
        case submitting
        case result
        case failed(String)
    }

    @Published private(set) var phase: Phase = .chooser
    @Published private(set) var questions: [PublicQuestion] = []
    @Published private(set) var selections: [String: Set<String>] = [:]
    @Published private(set) var currentIndex = 0
    @Published private(set) var result: ExamResult?
    @Published private(set) var incorrectReview: [ReviewItem] = []
    @Published private(set) var remainingSeconds = 0

    private let api: APIClient
    private var token = ""
    private var sessionId: String?
    private var expiresAtMs = 0
    private var timer: Timer?

    init(api: APIClient) {
        self.api = api
    }

    var currentQuestion: PublicQuestion? {
        questions.indices.contains(currentIndex) ? questions[currentIndex] : nil
    }

    var answeredCount: Int {
        selections.values.filter { !$0.isEmpty }.count
    }

    var isLastQuestion: Bool {
        currentIndex >= questions.count - 1
    }

    func selectedOptions(for questionId: String) -> Set<String> {
        selections[questionId] ?? []
    }

    func start(certLevel: String, token: String) async {
        self.token = token
        phase = .loading
        do {
            let created: CreatedExam = try await api.send(
                path: "/api/mobile/exam",
                method: "POST",
                token: token,
                body: CreateExamRequest(certLevel: certLevel, locale: "EN")
            )
            let loaded: [PublicQuestion] = try await api.get(
                path: "/api/mobile/exam/\(created.sessionId)/questions",
                token: token
            )
            sessionId = created.sessionId
            expiresAtMs = created.expiresAt
            questions = loaded
            selections = [:]
            currentIndex = 0
            phase = .answering
            startTimer()
        } catch {
            phase = .failed("Unable to start exam. Advanced exams require paid access.")
        }
    }

    func toggle(_ optionId: String, for question: PublicQuestion) {
        var selected = selections[question.id] ?? []
        if question.isMulti {
            if selected.contains(optionId) {
                selected.remove(optionId)
            } else {
                selected.insert(optionId)
            }
        } else {
            selected = [optionId]
        }
        selections[question.id] = selected
        Task { await persist(questionId: question.id, selected: Array(selected)) }
    }

    func next() {
        if currentIndex < questions.count - 1 { currentIndex += 1 }
    }

    func previous() {
        if currentIndex > 0 { currentIndex -= 1 }
    }

    func submit() async {
        guard let sessionId else { return }
        stopTimer()
        phase = .submitting
        do {
            struct Empty: Encodable {}
            let response: SubmitResponse = try await api.send(
                path: "/api/mobile/exam/\(sessionId)/submit",
                method: "POST",
                token: token,
                body: Empty()
            )
            result = response.result
            incorrectReview = response.incorrectReview
            phase = .result
        } catch {
            // Keep answers so the learner can retry submitting.
            phase = .answering
        }
    }

    func reset() {
        stopTimer()
        questions = []
        selections = [:]
        currentIndex = 0
        result = nil
        incorrectReview = []
        sessionId = nil
        phase = .chooser
    }

    private func persist(questionId: String, selected: [String]) async {
        guard let sessionId else { return }
        let _: OKResponse? = try? await api.send(
            path: "/api/mobile/exam/\(sessionId)/answer",
            method: "POST",
            token: token,
            body: AnswerRequest(questionId: questionId, selectedOptionIds: selected)
        )
    }

    private func startTimer() {
        updateRemaining()
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            Task { @MainActor in
                guard let self else { return }
                self.updateRemaining()
                if self.remainingSeconds <= 0 {
                    await self.submit()
                }
            }
        }
    }

    private func updateRemaining() {
        let nowMs = Int(Date().timeIntervalSince1970 * 1000)
        remainingSeconds = max(0, (expiresAtMs - nowMs) / 1000)
    }

    private func stopTimer() {
        timer?.invalidate()
        timer = nil
    }
}
