import XCTest
@testable import App

final class DashboardViewModelTests: XCTestCase {
    func testLoadDashboardUsesBearerToken() async {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [DashboardStubURLProtocol.self]
        DashboardStubURLProtocol.handler = { request in
            XCTAssertEqual(request.url?.path, "/api/mobile/dashboard")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer token")
            let response = HTTPURLResponse(
                url: request.url!,
                statusCode: 200,
                httpVersion: nil,
                headerFields: ["Content-Type": "application/json"]
            )!
            let json = """
            {
              "user": { "id": "u1", "email": "pilot@example.com", "name": "Pilot", "accessTier": "FREE" },
              "progress": { "overallPct": 42, "totalDone": 4, "totalLessons": 10 },
              "resume": {
                "course": "basic",
                "lessonId": "basic/air-law/intro",
                "title": "Air Law",
                "courseTitle": "Basic",
                "pct": 40
              },
              "mockExam": { "bestPct": 88, "recentCount": 2 }
            }
            """
            return (response, Data(json.utf8))
        }

        let api = APIClient(
            baseURL: URL(string: "https://example.com")!,
            session: URLSession(configuration: configuration)
        )
        let viewModel = await DashboardViewModel(api: api)

        await viewModel.load(token: "token")

        let state = await viewModel.state
        guard case .loaded(let dashboard) = state else {
            return XCTFail("Expected loaded dashboard")
        }
        XCTAssertEqual(dashboard.progress.overallPct, 42)
        XCTAssertEqual(dashboard.resume?.title, "Air Law")
    }
}

final class DashboardStubURLProtocol: URLProtocol {
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
