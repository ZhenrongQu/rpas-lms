import { z } from "zod";
import { assignUsernameToUser, createUsernameUser } from "../../../../../src/lib/auth/account";
import { verifyCode } from "../../../../../src/lib/auth/verificationCode";

const UsernameWithCodeBody = z.object({
  username: z.string().min(3).max(24),
  channel: z.enum(["email", "sms"]),
  target: z.string().min(3),
  code: z.string().regex(/^\d{6}$/),
}).strict();

const UsernameSessionBody = z.object({
  username: z.string().min(3).max(24),
}).strict();

const UsernameBody = z.union([UsernameWithCodeBody, UsernameSessionBody]);

export async function POST(req: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  const parsed = UsernameBody.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  try {
    if (!("code" in parsed.data)) {
      const { auth } = await import("../../../../../auth");
      const session = await auth();
      if (!session?.user?.id) {
        return Response.json({ error: "unauthorized" }, { status: 401 });
      }

      const user = await assignUsernameToUser({
        userId: session.user.id,
        username: parsed.data.username,
      });

      return Response.json(
        {
          ok: true,
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            phone: user.phone,
            accessTier: user.accessTier,
          },
        },
        { status: 201 },
      );
    }

    const verified = await verifyCode(parsed.data);
    if (!verified.ok) {
      return Response.json({ error: verified.reason }, { status: 400 });
    }

    const user = await createUsernameUser({
      username: parsed.data.username,
      channel: parsed.data.channel,
      target: verified.target,
    });

    return Response.json(
      {
        ok: true,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          phone: user.phone,
          accessTier: user.accessTier,
        },
      },
      { status: 201 },
    );
  } catch {
    return Response.json({ error: "username unavailable" }, { status: 409 });
  }
}
