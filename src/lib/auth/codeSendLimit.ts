import { enforceRateLimit } from "../security/rateLimit";

/**
 * How often one email address may trigger a verification email (PRD U8).
 *
 * Two rules, because they stop different things: the burst rule stops someone
 * hammering "resend" (or scripting it) to flood an inbox, and the daily cap
 * stops a slow drip that would evade a per-minute window entirely.
 */
export const CODE_SEND_BURST = { limit: 1, windowSec: 60, blockSec: 60 } as const;
export const CODE_SEND_DAILY = { limit: 10, windowSec: 24 * 60 * 60, blockSec: 24 * 60 * 60 } as const;

/**
 * Applies both address-scoped limits, returning a 429 or null to proceed.
 *
 * Counted for every well-formed address, whether or not an account exists: a
 * limit that only applied to real accounts would answer "is this email
 * registered?" through its own timing, which is exactly what the uniform
 * responses on these endpoints exist to prevent.
 *
 * `scope` keeps registration and password-reset budgets separate so exhausting
 * one cannot lock a legitimate user out of the other.
 */
export async function enforceCodeSendLimit(
  scope: "register" | "forgot",
  target: string,
): Promise<Response | null> {
  const address = target.trim().toLowerCase();
  return (
    (await enforceRateLimit(`${scope}:burst:${address}`, CODE_SEND_BURST)) ??
    (await enforceRateLimit(`${scope}:email:${address}`, CODE_SEND_DAILY))
  );
}
