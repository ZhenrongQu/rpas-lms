export async function POST(_req?: Request): Promise<Response> {
  return Response.json({ error: "code login disabled" }, { status: 410 });
}
