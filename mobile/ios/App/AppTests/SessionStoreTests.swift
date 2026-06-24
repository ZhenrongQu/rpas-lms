import XCTest
@testable import App

final class SessionStoreTests: XCTestCase {
    func testInMemoryStoreSavesAndClearsToken() throws {
        let store = InMemorySessionStore()
        XCTAssertNil(store.token)

        store.save(token: "abc")
        XCTAssertEqual(store.token, "abc")

        store.clear()
        XCTAssertNil(store.token)
    }
}
