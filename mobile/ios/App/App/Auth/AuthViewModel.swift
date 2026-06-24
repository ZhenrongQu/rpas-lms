import Foundation

@MainActor
final class AuthViewModel: ObservableObject {
    enum State: Equatable {
        case checking
        case signedOut
        case signedIn(MobileUser)
    }

    @Published private(set) var state: State = .checking
    @Published var errorMessage: String?

    private let api: APIClient
    private let sessionStore: SessionStoring

    var token: String? { sessionStore.token }

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

    func signIn(email: String, password: String) async {
        errorMessage = nil
        do {
            let response: LoginResponse = try await api.send(
                path: "/api/mobile/auth/login",
                method: "POST",
                body: LoginRequest(email: email, password: password)
            )
            sessionStore.save(token: response.token)
            state = .signedIn(response.user)
        } catch {
            errorMessage = "Sign in failed"
            state = .signedOut
        }
    }

    func signOut() async {
        if let token = sessionStore.token {
            struct Empty: Encodable {}
            let _: EmptyResponse? = try? await api.send(
                path: "/api/mobile/auth/logout",
                method: "POST",
                token: token,
                body: Empty()
            )
        }
        sessionStore.clear()
        state = .signedOut
    }
}

struct EmptyResponse: Codable, Equatable {}
