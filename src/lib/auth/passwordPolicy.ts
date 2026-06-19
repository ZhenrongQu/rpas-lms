// Single source of truth for the client-side password strength policy, shared by
// the register, reset-password, and change-password forms. `key` is the i18n key
// each form translates into a human label. This complexity ladder is a
// client-side UX gate (no redundant server regex — see SEC over-defense review).
// The server enforces length bounds (8..72 bytes) everywhere, and additionally
// screens registration against a common/guessable blocklist (SEC-13,
// `weakPassword.ts`). Reset/change-password do not yet run that blocklist — a
// product decision (see CODE_REVIEW_REPORT P3-2) if it should be extended there.
export const PASSWORD_RULES: { key: string; test: (pw: string) => boolean }[] = [
  { key: "pwLength", test: (pw) => pw.length >= 8 && pw.length <= 20 },
  { key: "pwUpper", test: (pw) => /[A-Z]/.test(pw) },
  { key: "pwLower", test: (pw) => /[a-z]/.test(pw) },
  { key: "pwDigit", test: (pw) => /[0-9]/.test(pw) },
  { key: "pwSpecial", test: (pw) => /[!@#$%^&*()\-_=+[\]{};':",.<>/?\\|`~]/.test(pw) },
];

export function isPasswordValid(pw: string): boolean {
  return PASSWORD_RULES.every((rule) => rule.test(pw));
}
