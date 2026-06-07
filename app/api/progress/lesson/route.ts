import { z } from "zod";
import { currentAccount } from "../../exam/sessionAuth";
import { markLessonComplete } from "../../../../src/lib/lessons/progress";

const Body = z.object({ lessonId: z.string().min(1) });

export async function POST(req: Request): Promise<Response> {
  const { userId } = await currentAccount(req);
  if (!userId) return Response.json({ error: "auth required" }, { status: 401 });
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) return Response.json({ error: "invalid body" }, { status: 400 });
  await markLessonComplete(userId, parsed.data.lessonId);
  return Response.json({ ok: true }, { status: 200 });
}
