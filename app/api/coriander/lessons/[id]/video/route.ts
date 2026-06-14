import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdminApi } from "@/lib/auth/adminGuard";
import { findLessonById } from "@/lib/admin/lessons";
import { streamConfig, fetchVideoStatus } from "@/lib/video/cloudflareStream";

type Ctx = { params: Promise<{ id: string }> };

const putSchema = z.object({ videoUid: z.string().min(1) });

function revalidateLesson(course: string, moduleId: string, slug: string) {
  revalidatePath(`/en/learn/${course}/${moduleId}/${slug}`);
  revalidatePath(`/zh/learn/${course}/${moduleId}/${slug}`);
}

/** GET — re-poll Cloudflare for transcode status and persist it (fallback when the webhook is missed). */
export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  const deny = await requireAdminApi();
  if (deny) return deny;
  const { id } = await ctx.params;
  const found = await findLessonById(id);
  if (!found) return Response.json({ error: "not found" }, { status: 404 });
  if (!found.row.videoUid) return Response.json({ error: "no video" }, { status: 400 });

  const cfg = streamConfig();
  const status = await fetchVideoStatus({ accountId: cfg.accountId, apiToken: cfg.apiToken, uid: found.row.videoUid });
  const videoStatus = status.state === "ready" ? "READY" : status.state === "error" ? "ERROR" : "PROCESSING";
  const data = { videoStatus, videoDurationSec: status.durationSec, videoThumbnailUrl: status.thumbnail };
  const row =
    found.course === "basic"
      ? await prisma.basicLesson.update({ where: { id }, data })
      : await prisma.advancedLesson.update({ where: { id }, data });
  revalidateLesson(found.row.course, found.row.moduleId, found.row.slug);
  return Response.json(row, { status: 200 });
}

/** PUT — attach a freshly uploaded video uid (status starts at PROCESSING). */
export async function PUT(req: Request, ctx: Ctx): Promise<Response> {
  const deny = await requireAdminApi();
  if (deny) return deny;
  const { id } = await ctx.params;
  const found = await findLessonById(id);
  if (!found) return Response.json({ error: "not found" }, { status: 404 });

  const parsed = putSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });

  const data = { videoUid: parsed.data.videoUid, videoStatus: "PROCESSING", videoDurationSec: null, videoThumbnailUrl: null };
  const row =
    found.course === "basic"
      ? await prisma.basicLesson.update({ where: { id }, data })
      : await prisma.advancedLesson.update({ where: { id }, data });
  revalidateLesson(found.row.course, found.row.moduleId, found.row.slug);
  return Response.json(row, { status: 200 });
}

/** DELETE — clear the video from a lesson. */
export async function DELETE(_req: Request, ctx: Ctx): Promise<Response> {
  const deny = await requireAdminApi();
  if (deny) return deny;
  const { id } = await ctx.params;
  const found = await findLessonById(id);
  if (!found) return Response.json({ error: "not found" }, { status: 404 });

  const data = { videoUid: null, videoStatus: null, videoDurationSec: null, videoThumbnailUrl: null };
  const row =
    found.course === "basic"
      ? await prisma.basicLesson.update({ where: { id }, data })
      : await prisma.advancedLesson.update({ where: { id }, data });
  revalidateLesson(found.row.course, found.row.moduleId, found.row.slug);
  return Response.json(row, { status: 200 });
}
