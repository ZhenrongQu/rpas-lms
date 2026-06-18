import { z } from "zod";
import { resetLocalPassword } from "../../../../../src/lib/auth/localAccount";

const Body = z.object({
  email: z.string().email(),
  token: z.string().min(1),
  newPassword: z.string().min(8).max(72),
}).strict();

export async function POST(req: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const result = await resetLocalPassword(parsed.data);
  if (!result.ok) {
    return Response.json({ error: result.reason }, { status: 400 });
  }

  return Response.json({ ok: true });
}
