import { z } from "zod";
import { getCurrentAdmin, requireAdminApi } from "../../../../src/lib/auth/adminGuard";
import {
  beginMfaEnrollment,
  confirmMfaEnrollment,
  disableMfa,
  getMfaStatus,
} from "../../../../src/lib/auth/adminMfa";

// SEC-16: admin MFA management. All actions are admin-only and act on the
// signed-in admin's own account (id from the session, never the body).

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("begin") }),
  z.object({ action: z.literal("confirm"), password: z.string().min(1), token: z.string().min(6).max(10) }),
  z.object({ action: z.literal("disable"), password: z.string().min(1), token: z.string().min(6).max(10) }),
]);

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

  if (parsed.data.action === "confirm") {
    const ok = await confirmMfaEnrollment(admin!.id, parsed.data.password, parsed.data.token);
    return ok ? Response.json({ ok: true }) : Response.json({ error: "invalid_credentials" }, { status: 422 });
  }

  // disable
  const ok = await disableMfa(admin!.id, parsed.data.password, parsed.data.token);
  return ok ? Response.json({ ok: true }) : Response.json({ error: "invalid_credentials" }, { status: 422 });
}
