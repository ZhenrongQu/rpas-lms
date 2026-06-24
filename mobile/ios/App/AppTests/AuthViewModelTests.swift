import XCTest
@testable import App

final class AuthViewModelTests: XCTestCase {
    func testLogoutClearsSession() async {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubURLProtocol.self]
        StubURLProtocol.handler = { request in
            XCTAssertEqual(request.url?.path, "/api/mobile/auth/logout")
            let response = HTTPURLResponse(
                url: request.url!,
                statusCode: 200,
                httpVersion: nil,
                headerFields: ["Content-Type": "application/json"]
            )!
            return (response, Data("{}".utf8))
        }

        let store = InMemorySessionStore()
        store.save(token: "abc")
        let viewModel = await AuthViewModel(
            api: APIClient(baseURL: URL(string: "https://example.com")!, session: URLSession(configuration: configuration)),
            sessionStore: store
        )

        await viewModel.signOut()

        XCTAssertNil(store.token)
        let state = await viewModel.state
        XCTAssertEqual(state, .signedOut)
    }
}

final class StubURLProtocol: URLProtocol {
    static var handler: ((URLRequest) throws -> (HTTPURLResponse, Data))?

    override class func canInit(with request: URLRequest) -> Bool {
        true
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        request
    }

    override func startLoading() {
        do {
            guard let handler = Self.handler else { throw APIError.badStatus(500) }
            let (response, data) = try handler(request)
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}
}
