import { z } from "zod";
import { currentAccount } from "../../exam/sessionAuth";
import { lessonExists, markLessonComplete } from "../../../../src/lib/lessons/progress";

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
  const { lessonId } = parsed.data;
  // SEC-03: reject unknown lessonIds with a clean 404 instead of letting the
  // progress→lesson foreign key throw an unhandled 500.
  if (!(await lessonExists(lessonId))) {
    return Response.json({ error: "lesson not found" }, { status: 404 });
  }
  await markLessonComplete(userId, lessonId);
  return Response.json({ ok: true }, { status: 200 });
}
