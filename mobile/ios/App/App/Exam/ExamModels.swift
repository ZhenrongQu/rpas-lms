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
    let type: String // "SINGLE" | "MULTI"
    let selectCount: Int
    let stem: String
    let options: [PublicOption]

    var isMulti: Bool { type == "MULTI" || selectCount > 1 }
}

struct PublicOption: Codable, Identifiable, Equatable {
    let id: String
    let label: String
}

struct AnswerRequest: Encodable {
    let questionId: String
    let selectedOptionIds: [String]
}

struct ExamResult: Codable, Equatable {
    let total: Int
    let correct: Int
    let scorePct: Double // 0..1
    let passed: Bool

    var percent: Int { Int((scorePct * 100).rounded()) }
}

struct SubmitResponse: Codable, Equatable {
    let result: ExamResult
    let incorrectReview: [ReviewItem]
}

struct ReviewItem: Codable, Identifiable, Equatable {
    let id: String
    let stem: String
    let options: [ReviewOption]
    let selectedOptionIds: [String]
    let correctOptionIds: [String]
    let isCorrect: Bool
    let explanation: String
    let reference: String
}

struct ReviewOption: Codable, Identifiable, Equatable {
    let id: String
    let label: String
    let isCorrect: Bool
}
