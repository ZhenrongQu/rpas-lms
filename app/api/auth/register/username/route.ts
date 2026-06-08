export async function POST(_req: Request): Promise<Response> {
  return Response.json({ error: "username registration disabled" }, { status: 410 });
}
