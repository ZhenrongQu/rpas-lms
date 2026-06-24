import XCTest
@testable import App

final class APIClientTests: XCTestCase {
    func testBuildsAuthorizedRequest() throws {
        let client = APIClient(baseURL: URL(string: "https://pacificdrone.ca")!)
        let request = try client.request(path: "/api/mobile/me", method: "GET", token: "abc")

        XCTAssertEqual(request.url?.absoluteString, "https://pacificdrone.ca/api/mobile/me")
        XCTAssertEqual(request.httpMethod, "GET")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer abc")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Accept"), "application/json")
    }
}
