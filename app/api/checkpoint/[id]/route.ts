import { findActiveCheckpoint } from "../../../../src/lib/content/loadBank";
import { toPublicQuestion } from "../../../../src/lib/exam/serialize";
import { clientIp, enforceRateLimit } from "../../../../src/lib/security/rateLimit";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  // SEC-04: public endpoint with predictable ids — cap per IP against enumeration.
  const limited = await enforceRateLimit(`checkpoint:ip:${clientIp(req)}`, {
    limit: 120,
    windowSec: 60,
    blockSec: 60,
  });
  if (limited) return limited;

  const { id } = await ctx.params;
  const locale = new URL(req.url).searchParams.get("locale") === "zh" ? "ZH" : "EN";
  const question = await findActiveCheckpoint(id);
  if (!question) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(toPublicQuestion(question, locale), { status: 200 });
}
