import { z } from "zod";
import { prisma } from "../../../../src/lib/db";
import { hashPassword } from "../../../../src/lib/auth/password";

const RegisterBody = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).optional(),
});

export async function POST(req: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  const parsed = RegisterBody.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const { email, password, name } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return Response.json({ error: "email already registered" }, { status: 409 });
  }

  const hashedPassword = await hashPassword(password);
  await prisma.user.create({ data: { email, displayName: name, hashedPassword } });
  return Response.json({ ok: true }, { status: 201 });
}
