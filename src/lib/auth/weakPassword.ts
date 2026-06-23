// SEC-13: server-side weak-password screen for registration. The complexity
// rules (upper/lower/digit/special) live in passwordPolicy.ts as a CLIENT UX
// gate, which a direct API call bypasses. This blocklist is enforced on the
// server so the passwords an online attacker tries first are rejected even
// then. Dependency-free; swap for zxcvbn / HIBP range queries later if needed.

const COMMON_PASSWORDS = new Set([
  "password", "password1", "password12", "password123", "passw0rd", "p@ssword",
  "p@ssw0rd", "12345678", "123456789", "1234567890", "qwertyui", "qwerty123",
  "qwertyuiop", "11111111", "1q2w3e4r", "1qaz2wsx", "zaq12wsx", "asdfghjk",
  "asdfghjkl", "qazwsxedc", "87654321", "abc12345", "iloveyou", "letmein123",
  "admin123", "welcome1", "welcome123", "monkey123", "dragon123", "sunshine1",
  "princess1", "football1", "baseball1", "trustno1", "superman1", "changeme1",
  "whatever1", "starwars1", "computer1", "michelle1", "test1234", "pilot123",
  "drone123", "aviation1",
]);

export type PasswordWeakReason = "too_common" | "contains_identifier" | "low_variety";

/**
 * Returns the reason a password is too weak, or null if it passes. Assumes the
 * length floor (SEC-08) was already enforced; this runs in addition.
 */
export function weakPasswordReason(
  password: string,
  identifiers: { email?: string; username?: string } = {},
): PasswordWeakReason | null {
  const lower = password.toLowerCase();

  if (COMMON_PASSWORDS.has(lower)) return "too_common";

  // A single character repeated ("aaaaaaaa").
  if (/^(.)\1+$/.test(password)) return "low_variety";

  // A pure ascending or descending run ("12345678", "abcdefgh").
  if (isSequentialRun(lower)) return "low_variety";

  // Embeds the email local-part or username verbatim (≥4 chars).
  const local = identifiers.email?.split("@")[0]?.toLowerCase();
  if (local && local.length >= 4 && lower.includes(local)) return "contains_identifier";
  const username = identifiers.username?.toLowerCase();
  if (username && username.length >= 4 && lower.includes(username)) return "contains_identifier";

  return null;
}

function isSequentialRun(s: string): boolean {
  if (s.length < 6) return false;
  let ascending = true;
  let descending = true;
  for (let i = 1; i < s.length; i++) {
    const delta = s.charCodeAt(i) - s.charCodeAt(i - 1);
    if (delta !== 1) ascending = false;
    if (delta !== -1) descending = false;
  }
  return ascending || descending;
}
