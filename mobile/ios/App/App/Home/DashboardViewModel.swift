import Foundation

@MainActor
final class DashboardViewModel: ObservableObject {
    enum State: Equatable {
        case idle
        case loading
        case loaded(DashboardResponse)
        case failed(String)
    }

    @Published private(set) var state: State = .idle
    private let api: APIClient

    init(api: APIClient) {
        self.api = api
    }

    func load(token: String) async {
        state = .loading
        do {
            let dashboard: DashboardResponse = try await api.get(path: "/api/mobile/dashboard?locale=en", token: token)
            state = .loaded(dashboard)
        } catch {
            state = .failed("Unable to load dashboard")
        }
    }
}
