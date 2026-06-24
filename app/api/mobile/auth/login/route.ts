import { z } from "zod";
import { authorizeLocalPasswordLogin } from "../../../../../src/lib/auth/localAccount";
import { createMobileSession } from "../../../../../src/lib/mobile/session";
import { clientIp, enforceRateLimit } from "../../../../../src/lib/security/rateLimit";

const Body = z
  .object({
    email: z.string().email(),
    password: z.string().min(1),
  })
  .strict();

export async function POST(req: Request): Promise<Response> {
  const limited = await enforceRateLimit(`mobile-login:ip:${clientIp(req)}`, {
    limit: 30,
    windowSec: 15 * 60,
    blockSec: 15 * 60,
  });
  if (limited) return limited;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  const parsed = Body.safeParse(raw);
  if (!parsed.success) return Response.json({ error: "invalid body" }, { status: 400 });

  const user = await authorizeLocalPasswordLogin({
    email: parsed.data.email,
    password: parsed.data.password,
    ip: clientIp(req),
  });
  if (!user) return Response.json({ error: "invalid credentials" }, { status: 401 });

  const session = await createMobileSession({ userId: user.id });

  return Response.json({
    token: session.token,
    expiresAt: session.expiresAt.toISOString(),
    user: {
      id: user.id,
      email: user.email,
      name: user.displayName,
      accessTier: user.accessTier === "PAID" ? "PAID" : "FREE",
    },
  });
}
