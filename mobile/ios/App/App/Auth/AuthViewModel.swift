import Foundation

@MainActor
final class AuthViewModel: ObservableObject {
    enum State: Equatable {
        case checking
        case signedOut
        case signedIn(MobileUser)
    }

    @Published private(set) var state: State = .checking

    private let api: APIClient
    private let sessionStore: SessionStoring

    init(api: APIClient, sessionStore: SessionStoring) {
        self.api = api
        self.sessionStore = sessionStore
    }

    func restore() async {
        guard let token = sessionStore.token else {
            state = .signedOut
            return
        }

        do {
            let response: MeResponse = try await api.get(path: "/api/mobile/me", token: token)
            state = .signedIn(response.user)
        } catch {
            sessionStore.clear()
            state = .signedOut
        }
    }
}
