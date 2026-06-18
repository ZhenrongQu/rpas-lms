// Single source of truth for the client-side password strength policy, shared by
// the register, reset-password, and change-password forms. `key` is the i18n key
// each form translates into a human label. The server enforces only length
// bounds (8..72 bytes); strength is a client-side UX gate (see SEC over-defense
// review — no redundant server regex).
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
