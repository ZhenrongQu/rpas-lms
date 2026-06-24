import Foundation

struct CreateExamRequest: Encodable {
    let certLevel: String
    let locale: String
}

struct CreatedExam: Codable, Equatable {
    let sessionId: String
    let expiresAt: Int
    let total: Int
}

struct PublicQuestion: Codable, Identifiable, Equatable {
    let id: String
    let stem: String
    let options: [PublicOption]
}

struct PublicOption: Codable, Identifiable, Equatable {
    let id: String
    let label: String
}
