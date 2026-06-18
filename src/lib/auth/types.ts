// "email_reset" carries password-reset link tokens. It is a distinct channel so
// reset tokens never collide with registration "email" verification codes.
export type VerificationChannel = "email" | "sms" | "email_reset";
export type AccessTier = "FREE" | "PAID";
export type AuthProvider = "google" | "apple" | "email" | "phone" | "username";

export type VerificationFailureReason = "invalid_or_expired" | "too_many_attempts";
