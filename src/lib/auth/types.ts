export type VerificationChannel = "email" | "sms";
export type AccessTier = "FREE" | "PAID";
export type AuthProvider = "google" | "apple" | "email" | "phone" | "username";

export type VerificationFailureReason = "invalid_or_expired" | "too_many_attempts";
