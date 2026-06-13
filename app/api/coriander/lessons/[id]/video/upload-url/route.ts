import { requireAdminApi } from "@/lib/auth/adminGuard";
import { findLessonById } from "@/lib/admin/lessons";
import { streamConfig, createDirectUpload } from "@/lib/video/cloudflareStream";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/coriander/lessons/[id]/video/upload-url — one-time CF direct upload URL (admin). */
export async function POST(_req: Request, ctx: Ctx): Promise<Response> {
  const deny = await requireAdminApi();
  if (deny) return deny;

  const { id } = await ctx.params;
  const found = await findLessonById(id);
  if (!found) return Response.json({ error: "not found" }, { status: 404 });

  const cfg = streamConfig();
  const { uploadURL, uid } = await createDirectUpload({
    accountId: cfg.accountId,
    apiToken: cfg.apiToken,
    maxDurationSeconds: 7200,
  });
  return Response.json({ uploadURL, uid }, { status: 200 });
}
