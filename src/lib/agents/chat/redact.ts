/**
 * A minimum floor on what a turn log is allowed to contain.
 *
 * Storing the question and the answer is the whole point — you cannot build an
 * eval set out of token counts. But a student typing into a chat box will
 * occasionally paste a contact detail, and once it is in the log it is in every
 * backup and every export.
 *
 * Two rules only, both chosen because they almost never fire on real RPAS study
 * questions and are unambiguous when they do:
 *
 *  - Email addresses.
 *  - Runs of 10+ digits (allowing the separators people type phone numbers with).
 *
 * The digit threshold is deliberately high. This domain is full of short numbers
 * that carry meaning — CAR 901.11, 400 feet AGL, squawk 1200, 121.5 MHz — and
 * redacting those would corrupt exactly the answers we most need to grade.
 *
 * This is NOT anonymisation and does not pretend to be: `userId` is on the row by
 * design (per-user failure analysis is the point), free text can carry identity in
 * ways no regex sees, and retention is a policy decision, not a code one. It is a
 * cheap floor that removes the two things most likely to end up in a log by
 * accident.
 */
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
// 10+ digits, optionally broken up by spaces, dots, dashes, parens or a leading +.
const LONG_DIGIT_RUN = /\+?[\d][\d\s().-]{8,}\d/g;

export function redact(text: string): string {
  return text
    .replace(EMAIL, "[email]")
    .replace(LONG_DIGIT_RUN, (m) => ((m.match(/\d/g) ?? []).length >= 10 ? "[number]" : m));
}
