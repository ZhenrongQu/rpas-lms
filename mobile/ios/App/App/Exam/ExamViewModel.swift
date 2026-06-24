import Foundation

@MainActor
final class ExamViewModel: ObservableObject {
    @Published private(set) var status = "Choose a mock exam"

    private let api: APIClient

    init(api: APIClient) {
        self.api = api
    }

    func start(certLevel: String, token: String) async {
        do {
            let created: CreatedExam = try await api.send(
                path: "/api/mobile/exam",
                method: "POST",
                token: token,
                body: CreateExamRequest(certLevel: certLevel, locale: "EN")
            )
            status = "Created exam with \(created.total) questions"
        } catch {
            status = "Unable to start exam"
        }
    }
}
