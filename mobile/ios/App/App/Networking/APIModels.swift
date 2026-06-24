import Foundation

struct MobileUser: Codable, Equatable {
    let id: String
    let email: String?
    let name: String?
    let accessTier: String
}

struct LoginRequest: Encodable {
    let email: String
    let password: String
}

struct LoginResponse: Codable, Equatable {
    let token: String
    let expiresAt: Date
    let user: MobileUser
}

struct MeResponse: Codable, Equatable {
    let user: MobileUser
}

struct DashboardResponse: Codable, Equatable {
    let user: MobileUser
    let progress: ProgressSummary
    let resume: ResumeLesson?
    let mockExam: MockExamSummary
}

struct ProgressSummary: Codable, Equatable {
    let overallPct: Int
    let totalDone: Int
    let totalLessons: Int
}

struct ResumeLesson: Codable, Equatable {
    let course: String
    let lessonId: String
    let title: String
    let courseTitle: String
    let pct: Int
}

struct MockExamSummary: Codable, Equatable {
    let bestPct: Int?
    let recentCount: Int
}
