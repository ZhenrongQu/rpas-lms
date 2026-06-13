import { prisma } from "@/lib/db";
import { streamConfig, verifyWebhookSignature } from "@/lib/video/cloudflareStream";

/** POST /api/coriander/video/webhook — CF transcode notifications (signature-gated, no admin). */
export async function POST(req: Request): Promise<Response> {
  const raw = await req.text();
  const header = req.headers.get("webhook-signature") ?? "";
  const cfg = streamConfig();
  if (!verifyWebhookSignature({ body: raw, signatureHeader: header, secret: cfg.webhookSecret })) {
    return Response.json({ error: "bad signature" }, { status: 401 });
  }

  let payload: { uid?: string; status?: { state?: string }; duration?: number; thumbnail?: string };
  try {
    payload = JSON.parse(raw);
  } catch {
    // Signed but unparseable body — ack so CF doesn't retry forever.
    return Response.json({ ok: true }, { status: 200 });
  }
  if (!payload.uid) return Response.json({ ok: true }, { status: 200 });

  const state = payload.status?.state;
  const videoStatus = state === "ready" ? "READY" : state === "error" ? "ERROR" : "PROCESSING";
  const data = {
    videoStatus,
    videoDurationSec: typeof payload.duration === "number" && payload.duration > 0 ? Math.round(payload.duration) : null,
    videoThumbnailUrl: payload.thumbnail ?? null,
  };

  await Promise.all([
    prisma.basicLesson.updateMany({ where: { videoUid: payload.uid }, data }),
    prisma.advancedLesson.updateMany({ where: { videoUid: payload.uid }, data }),
  ]);
  return Response.json({ ok: true }, { status: 200 });
}
