import XCTest
@testable import FractionalKey

/// Checks the emitted `FractionalKey` against the vectors the TypeScript keys
/// and the Kotlin client check too, so all three make the same keys.
final class FractionalKeyTests: XCTestCase {
    private struct Vectors: Decodable {
        struct Between: Decodable {
            let before: String?
            let after: String?
            let key: String
        }

        struct Several: Decodable {
            let before: String?
            let after: String?
            let count: Int
            let keys: [String]
        }

        struct Run: Decodable {
            let count: Int
            let last: String
            let longest: Int
        }

        struct Gap: Decodable {
            let before: String
            let after: String
            let count: Int
            let last: String
            let longest: Int
        }

        struct Runs: Decodable {
            let append: Run
            let prepend: Run
            let gap: Gap
        }

        let between: [Between]
        let several: [Several]
        let runs: Runs
    }

    private func vectors() throws -> Vectors {
        let file = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .appendingPathComponent("../../../../../packages/cms/src/keys.vectors.json")
            .standardizedFileURL
        return try JSONDecoder().decode(Vectors.self, from: Data(contentsOf: file))
    }

    func testMakesEveryKeyTheVectorsGive() throws {
        let vectors = try vectors()
        for vector in vectors.between {
            XCTAssertEqual(try FractionalKey.between(vector.before, vector.after), vector.key)
        }
        for vector in vectors.several {
            XCTAssertEqual(try FractionalKey.keys(between: vector.before, and: vector.after, count: vector.count), vector.keys)
        }
    }

    func testKeepsKeysShortThroughLongRuns() throws {
        let runs = try vectors().runs
        var key: String? = nil
        var longest = 0
        for _ in 0..<runs.append.count {
            key = try FractionalKey.between(key, nil)
            longest = max(longest, key!.count)
        }
        XCTAssertEqual(key, runs.append.last)
        XCTAssertEqual(longest, runs.append.longest)

        key = nil
        for _ in 0..<runs.prepend.count {
            key = try FractionalKey.between(nil, key)
        }
        XCTAssertEqual(key, runs.prepend.last)

        var low = runs.gap.before
        longest = 0
        for _ in 0..<runs.gap.count {
            low = try FractionalKey.between(low, runs.gap.after)
            longest = max(longest, low.count)
        }
        XCTAssertEqual(low, runs.gap.last)
        XCTAssertEqual(longest, runs.gap.longest)
    }

    func testRefusesWhatIsNotAKey() {
        XCTAssertTrue(FractionalKey.isKey("a0"))
        XCTAssertFalse(FractionalKey.isKey("a0i0"))
        XCTAssertFalse(FractionalKey.isKey("b0"))
        XCTAssertThrowsError(try FractionalKey.between("a1", "a0"))
    }
}
