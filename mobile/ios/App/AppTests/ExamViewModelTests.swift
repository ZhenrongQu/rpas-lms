import XCTest
@testable import App

final class ExamViewModelTests: XCTestCase {
    func testStartExamLoadsQuestionsAndEntersAnswering() async {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [ExamStubURLProtocol.self]
        ExamStubURLProtocol.handler = { request in
            let path = request.url?.path ?? ""
            if path == "/api/mobile/exam" {
                XCTAssertEqual(request.httpMethod, "POST")
                XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer token")
                let response = HTTPURLResponse(
                    url: request.url!,
                    statusCode: 201,
                    httpVersion: nil,
                    headerFields: ["Content-Type": "application/json"]
                )!
                return (response, Data(#"{"sessionId":"exam_1","expiresAt":1782267453000,"total":1}"#.utf8))
            }

            XCTAssertEqual(path, "/api/mobile/exam/exam_1/questions")
            let response = HTTPURLResponse(
                url: request.url!,
                statusCode: 200,
                httpVersion: nil,
                headerFields: ["Content-Type": "application/json"]
            )!
            let questions = #"[{"id":"q1","type":"SINGLE","selectCount":1,"stem":"Q?","options":[{"id":"a","label":"A"},{"id":"b","label":"B"}]}]"#
            return (response, Data(questions.utf8))
        }

        let api = APIClient(
            baseURL: URL(string: "https://example.com")!,
            session: URLSession(configuration: configuration)
        )
        let viewModel = await ExamViewModel(api: api)

        await viewModel.start(certLevel: "BASIC", token: "token")

        let phase = await viewModel.phase
        let questionCount = await viewModel.questions.count
        XCTAssertEqual(phase, .answering)
        XCTAssertEqual(questionCount, 1)
    }
}

final class ExamStubURLProtocol: URLProtocol {
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
