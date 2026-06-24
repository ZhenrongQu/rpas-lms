import { z } from "zod";
import { requireMobileAccount } from "../../../../../src/lib/mobile/account";
import { completeMobileLesson, parseMobileLessonId } from "../../../../../src/lib/mobile/lessons";

const Body = z.object({ lessonId: z.string().min(1) }).strict();

export async function POST(req: Request): Promise<Response> {
  const auth = await requireMobileAccount(req);
  if (!auth.ok) return auth.response;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  const parsed = Body.safeParse(raw);
  if (!parsed.success) return Response.json({ error: "invalid body" }, { status: 400 });
  if (!parseMobileLessonId(parsed.data.lessonId)) {
    return Response.json({ error: "invalid lesson id" }, { status: 400 });
  }

  const result = await completeMobileLesson(
    auth.account.userId,
    parsed.data.lessonId,
    auth.account.accessTier,
  );
  if (result === "invalid_lesson_id") {
    return Response.json({ error: "invalid lesson id" }, { status: 400 });
  }
  if (result === "forbidden") return Response.json({ error: "upgrade required" }, { status: 403 });
  if (result === "not_found") return Response.json({ error: "lesson not found" }, { status: 404 });

  return Response.json({ ok: true }, { status: 200 });
}
