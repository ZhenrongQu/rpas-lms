import { z } from "zod";
import { getCurrentAdmin, requireAdminApi } from "../../../../src/lib/auth/adminGuard";
import {
  beginMfaEnrollment,
  confirmMfaEnrollment,
  disableMfa,
  getMfaStatus,
} from "../../../../src/lib/auth/adminMfa";
import {
  clearRateLimit,
  clientIp,
  hitRateLimit,
  isLocked,
  tooManyRequests,
} from "../../../../src/lib/security/rateLimit";

// SEC-16: admin MFA management. All actions are admin-only and act on the
// signed-in admin's own account (id from the session, never the body).

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("begin") }),
  z.object({ action: z.literal("confirm"), password: z.string().min(1), token: z.string().min(6).max(10) }),
  z.object({ action: z.literal("disable"), password: z.string().min(1), token: z.string().min(6).max(10) }),
]);

// P2: the confirm/disable step-up checks a password + TOTP. Without throttling,
// a stolen admin session could brute-force those here (the login lockout doesn't
// cover this endpoint). Lock per-admin after a few failures, with a looser IP cap.
const MFA_MAX_FAILURES = 5;
const MFA_WINDOW_SEC = 15 * 60;
const MFA_BLOCK_SEC = 30 * 60;

const acctKey = (adminId: string) => `mfa:acct:${adminId}`;
const ipKey = (req: Request) => `mfa:ip:${clientIp(req)}`;

/** 429 if the admin or IP is currently locked out, else null to proceed. */
async function stepUpLockout(adminId: string, req: Request): Promise<Response | null> {
  for (const lock of [await isLocked(acctKey(adminId)), await isLocked(ipKey(req))]) {
    if (!lock.allowed) return tooManyRequests(lock.retryAfterSec);
  }
  return null;
}

async function recordStepUpFailure(adminId: string, req: Request): Promise<void> {
  await hitRateLimit({ key: acctKey(adminId), limit: MFA_MAX_FAILURES, windowSec: MFA_WINDOW_SEC, blockSec: MFA_BLOCK_SEC });
  await hitRateLimit({ key: ipKey(req), limit: MFA_MAX_FAILURES * 4, windowSec: MFA_WINDOW_SEC, blockSec: MFA_BLOCK_SEC });
}

async function clearStepUp(adminId: string, req: Request): Promise<void> {
  await clearRateLimit(acctKey(adminId));
  await clearRateLimit(ipKey(req));
}

export async function GET(): Promise<Response> {
  const deny = await requireAdminApi();
  if (deny) return deny;
  const admin = await getCurrentAdmin();
  return Response.json(await getMfaStatus(admin!.id));
}

export async function POST(req: Request): Promise<Response> {
  const deny = await requireAdminApi();
  if (deny) return deny;
  const admin = await getCurrentAdmin();

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });

  if (parsed.data.action === "begin") {
    const result = await beginMfaEnrollment(admin!.id);
    if (!result) return Response.json({ error: "already_enabled" }, { status: 409 });
    return Response.json(result);
  }

  // confirm / disable both verify a password + TOTP → throttle their failures.
  const locked = await stepUpLockout(admin!.id, req);
  if (locked) return locked;

  const ok =
    parsed.data.action === "confirm"
      ? await confirmMfaEnrollment(admin!.id, parsed.data.password, parsed.data.token)
      : await disableMfa(admin!.id, parsed.data.password, parsed.data.token);

  if (!ok) {
    await recordStepUpFailure(admin!.id, req);
    return Response.json({ error: "invalid_credentials" }, { status: 422 });
  }
  await clearStepUp(admin!.id, req);
  return Response.json({ ok: true });
}
