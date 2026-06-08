export async function POST(): Promise<Response> {
  return Response.json({ error: "username registration disabled" }, { status: 410 });
}
