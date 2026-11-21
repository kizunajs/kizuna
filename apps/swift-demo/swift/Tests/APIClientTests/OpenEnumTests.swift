import XCTest
@testable import OpenEnumAPIClient

final class OpenEnumTests: XCTestCase {
    func testDecodesKnownValue() throws {
        let decoded = try JSONDecoder().decode(OpenEnumAPI.EventKind.self, from: Data("\"login\"".utf8))
        XCTAssertEqual(decoded, .login)
    }

    func testFallsBackToUnknownInsteadOfThrowing() throws {
        let decoded = try JSONDecoder().decode(OpenEnumAPI.EventKind.self, from: Data("\"teleport\"".utf8))
        XCTAssertEqual(decoded, .unknown("teleport"))
    }

    func testUnknownRawValueRoundTrips() throws {
        let encoded = try JSONEncoder().encode(OpenEnumAPI.EventKind.unknown("teleport"))
        XCTAssertEqual(String(decoding: encoded, as: UTF8.self), "\"teleport\"")
    }

    func testUnknownValueDegradesOneFieldNotTheWholeObject() throws {
        let json = """
        {"id":"evt_1","kind":"teleport","occurredAt":"2026-01-01T00:00:00Z","userId":"user_1"}
        """
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let record = try decoder.decode(OpenEnumAPI.EventRecord.self, from: Data(json.utf8))
        XCTAssertEqual(record.kind, .unknown("teleport"))
        XCTAssertEqual(record.id, "evt_1")
        XCTAssertEqual(record.userId, "user_1")
    }

    func testDecodesAUnionMemberItDoesNotKnow() throws {
        let json = """
        {"kind":"passkey_added","at":"2026-01-01T00:00:00Z"}
        """
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let event = try decoder.decode(OpenEnumAPI.UserSessionEvent.self, from: Data(json.utf8))
        XCTAssertEqual(event, .unknown("passkey_added"))
        XCTAssertNil(event.at)
    }

    func testRefusesToSendAUnionMemberItDoesNotKnow() {
        XCTAssertThrowsError(try JSONEncoder().encode(OpenEnumAPI.UserSessionEvent.unknown("passkey_added")))
    }

    func testSkipsAToolCallFromAToolItDoesNotKnow() {
        let records = OpenEnumAPIClient.AssistantChat.readToolCalls([.tool_call(.unknown("calendar_add"))])
        XCTAssertEqual(records, [])
    }
}
