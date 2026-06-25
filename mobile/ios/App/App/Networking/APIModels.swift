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
    let flightReview: FlightReviewStatus?
}

struct ProgressSummary: Codable, Equatable {
    let overallPct: Int
    let totalDone: Int
    let totalLessons: Int
    let basic: CourseProgress?
    let advanced: CourseProgress?
}

struct CourseProgress: Codable, Equatable {
    let done: Int
    let total: Int
    let pct: Int
    let locked: Bool? // present on advanced only
}

struct FlightReviewStatus: Codable, Equatable {
    let status: String // "booked" | "eligible" | "locked"
    let booking: FlightReviewBooking?
}

struct FlightReviewBooking: Codable, Equatable {
    let id: String
    let startsAt: String
    let durationMin: Int
    let location: String
    let examinerName: String
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
