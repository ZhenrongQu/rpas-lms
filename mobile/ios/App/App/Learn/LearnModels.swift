import Foundation

struct CoursesResponse: Codable, Equatable {
    let courses: [MobileCourse]
}

struct MobileCourse: Codable, Identifiable, Equatable {
    var id: String { course }
    let course: String
    let title: String
    let locked: Bool
    let done: Int
    let total: Int
    let modules: [MobileModule]
}

struct MobileModule: Codable, Identifiable, Equatable {
    var id: String { moduleId }
    let moduleId: String
    let lessons: [MobileLessonMeta]
}

struct MobileLessonMeta: Codable, Identifiable, Equatable {
    var id: String { lessonId }
    let lessonId: String
    let title: String
    let estMinutes: Int
    let completed: Bool
}

struct MobileLessonResponse: Codable, Equatable {
    let meta: MobileLessonMeta
    let completed: Bool
    let blocks: [MobileLessonBlock]
}

enum MobileLessonBlock: Codable, Equatable, Identifiable {
    var id: String { String(describing: self) }

    case heading(level: Int, text: String)
    case paragraph(text: String)
    case list(ordered: Bool, items: [String])
    case callout(tone: String, text: String)

    private enum CodingKeys: String, CodingKey {
        case type
        case level
        case text
        case ordered
        case items
        case tone
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let type = try container.decode(String.self, forKey: .type)
        switch type {
        case "heading":
            self = .heading(
                level: try container.decode(Int.self, forKey: .level),
                text: try container.decode(String.self, forKey: .text)
            )
        case "paragraph":
            self = .paragraph(text: try container.decode(String.self, forKey: .text))
        case "list":
            self = .list(
                ordered: try container.decode(Bool.self, forKey: .ordered),
                items: try container.decode([String].self, forKey: .items)
            )
        case "callout":
            self = .callout(
                tone: try container.decode(String.self, forKey: .tone),
                text: try container.decode(String.self, forKey: .text)
            )
        default:
            throw DecodingError.dataCorruptedError(
                forKey: .type,
                in: container,
                debugDescription: "Unsupported lesson block type"
            )
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .heading(let level, let text):
            try container.encode("heading", forKey: .type)
            try container.encode(level, forKey: .level)
            try container.encode(text, forKey: .text)
        case .paragraph(let text):
            try container.encode("paragraph", forKey: .type)
            try container.encode(text, forKey: .text)
        case .list(let ordered, let items):
            try container.encode("list", forKey: .type)
            try container.encode(ordered, forKey: .ordered)
            try container.encode(items, forKey: .items)
        case .callout(let tone, let text):
            try container.encode("callout", forKey: .type)
            try container.encode(tone, forKey: .tone)
            try container.encode(text, forKey: .text)
        }
    }
}
