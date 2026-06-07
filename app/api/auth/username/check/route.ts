import { isUsernameAvailable } from "../../../../../src/lib/auth/account";

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const username = url.searchParams.get("username") ?? "";

  try {
    const available = await isUsernameAvailable(username);
    return Response.json({ available });
  } catch {
    return Response.json({ available: false }, { status: 400 });
  }
}
