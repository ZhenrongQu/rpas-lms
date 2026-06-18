import { z } from "zod";
import { auth } from "../../../../auth";
import { changeLocalPassword } from "../../../../src/lib/auth/localAccount";

const Body = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string().min(8).max(72),
}).strict();

// Change password for the signed-in customer (dashboard → Account security).
export async function PUT(req: Request): Promise<Response> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

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

  const result = await changeLocalPassword({ userId, ...parsed.data });
  if (!result.ok) {
    const status = result.reason === "wrong_password" ? 403 : 400;
    return Response.json({ error: result.reason }, { status });
  }

  return Response.json({ ok: true });
}
