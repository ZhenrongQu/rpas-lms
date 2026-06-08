export async function POST(): Promise<Response> {
  return Response.json({ error: "code login disabled" }, { status: 410 });
}
