"use client";

/**
 * Remembers the anonymous taster the visitor just started, so registering can
 * carry it into their new account (PRD U6). Browser-local and best effort:
 * private-mode and storage-blocked browsers must not break the exam flow, and
 * the server re-checks the claim regardless of what is stored here.
 */
const KEY = "rpas.guestExamSessionId";

export function rememberGuestExamSession(sessionId: string): void {
  try {
    window.localStorage.setItem(KEY, sessionId);
  } catch {
    /* storage unavailable — the taster still works, it just won't follow them */
  }
}

export function takeGuestExamSession(): string | undefined {
  try {
    return window.localStorage.getItem(KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function forgetGuestExamSession(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* nothing to clean up if storage is unavailable */
  }
}
